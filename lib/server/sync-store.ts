import "server-only";

/**
 * The server half of sync. See DESIGN.md §13.
 *
 * ## Why the merge rule is not written in SQL
 *
 * The obvious implementation puts last-write-wins in the upsert:
 * `ON CONFLICT … DO UPDATE … WHERE excluded.updated_at > habits.updated_at`.
 * That works right up to the tiebreaker, which compares record content
 * (`lib/sync/protocol.ts`) — and reproducing that comparison in SQL means the
 * rule exists twice, in two languages, and convergence depends on the two
 * agreeing *exactly*. They would drift, and the symptom would be two devices
 * disagreeing about one habit forever.
 *
 * So the decision is made in TypeScript, by the same `wins()` the client uses and
 * the same one the tests cover. Read-modify-write is safe here because of the
 * lock below, and the rows read are bounded by the size of the push.
 */

import { and, eq, gt, inArray, sql } from "drizzle-orm";
import {
  fingerprintEntry,
  fingerprintHabit,
  fingerprintSettings,
  MAX_ROWS_PER_REQUEST,
  wins,
  type SyncPull,
  type SyncPush,
} from "../sync/protocol";
import type { Entry, Habit, HabitColorKey } from "../types";
import type { SyncUser } from "./auth";
import type { Db } from "./db";
import { entries, habits, settings, users } from "./schema";

/** A fresh cursor value. See `syncSeq` in `schema.ts`. */
const NEXT_SEQ = sql`nextval('hapi_sync_seq')`;

type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];

/**
 * Raised when the client's stated account is not the authenticated one.
 *
 * A distinct type so the route can answer 409 rather than 500: this is not a
 * failure, it is the client needing to be told its local data belongs to someone
 * else. Thrown before any write, and inside the transaction, so a mismatched
 * request cannot leave a trace of one account's data in another's.
 */
export class AccountMismatchError extends Error {
  constructor(readonly actual: string) {
    super("Local data belongs to a different account.");
    this.name = "AccountMismatchError";
  }
}

export async function runSync(db: Db, user: SyncUser, push: SyncPush): Promise<SyncPull> {
  // Checked before the transaction opens — there is nothing to roll back, and no
  // reason to take a lock for a request that cannot proceed.
  if (push.accountId !== null && push.accountId !== user.id) {
    throw new AccountMismatchError(user.id);
  }

  return db.transaction(async (tx) => {
    await lockUser(tx, user.id);
    await ensureUser(tx, user);

    await applyPush(tx, user.id, push);
    return pull(tx, user.id, push.since);
  });
}

/**
 * Serialise one account's sync transactions against each other.
 *
 * This exists to make `seq` a *usable* cursor, which it is not by default.
 * Sequence values are handed out when a statement runs, but rows become visible
 * when their transaction commits — so two concurrent syncs can commit in the
 * opposite order to their seq assignment. A client that pulls in the gap sees the
 * higher seq, saves it as its cursor, and steps permanently over the lower one:
 * a tick that is on the server, absent from the device, and never coming back.
 *
 * An advisory lock keyed on the account closes the window by making commit order
 * match assignment order. It costs nothing in practice — the contention is one
 * person's two or three devices, syncing every few minutes — and it is held only
 * for the transaction, released on commit or rollback without a cleanup path.
 *
 * `hashtext` is used rather than the id itself because the lock key must be a
 * bigint. Collisions between accounts are possible and harmless: two unrelated
 * users would briefly serialise, which is invisible at this scale.
 */
async function lockUser(tx: Tx, userId: string): Promise<void> {
  await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${userId}))`);
}

/**
 * `settings` and `habits` both reference `users`, so the row has to exist before
 * a first sync can write anything. `DO NOTHING` rather than an email update:
 * every sync would otherwise perform a pointless write, and sync does not read
 * the email for anything.
 */
async function ensureUser(tx: Tx, user: SyncUser): Promise<void> {
  await tx
    .insert(users)
    .values({ id: user.id, email: user.email })
    .onConflictDoNothing({ target: users.id });
}

// ---------------------------------------------------------------------------
// Push
// ---------------------------------------------------------------------------

async function applyPush(tx: Tx, userId: string, push: SyncPush): Promise<void> {
  const tombstoned = await pushHabits(tx, userId, push.habits);
  await pushEntries(tx, userId, push.entries, tombstoned.live);

  // After the entries in this push have been considered, drop the history of any
  // habit whose tombstone landed just now. Doing it in this order means a peer
  // that is still pushing a deleted habit's entries cannot reinstate them.
  if (tombstoned.newlyDeleted.length > 0) {
    await tx
      .delete(entries)
      .where(and(eq(entries.userId, userId), inArray(entries.habitId, tombstoned.newlyDeleted)));
  }

  await pushSettings(tx, userId, push.settings);
}

type HabitState = {
  /** Ids that exist and are not tombstoned — the only ones entries may attach to. */
  live: Set<string>;
  /** Ids whose tombstone was written by this request. */
  newlyDeleted: string[];
};

async function pushHabits(tx: Tx, userId: string, incoming: Habit[]): Promise<HabitState> {
  // Every habit on the account, not just the pushed ones: `pushEntries` needs to
  // know about habits this device has never sent. Habit counts are small by
  // nature — this is a handful of rows, not a scan of history.
  const current = await tx
    .select()
    .from(habits)
    .where(eq(habits.userId, userId));

  const byId = new Map(current.map((row) => [row.id, toHabit(row)]));
  const winners: Habit[] = [];
  const newlyDeleted: string[] = [];

  for (const habit of incoming) {
    const existing = byId.get(habit.id);
    if (!wins(habit, existing, fingerprintHabit)) continue;

    winners.push(habit);
    byId.set(habit.id, habit);
    if (habit.deletedAt !== null && existing?.deletedAt == null) newlyDeleted.push(habit.id);
  }

  if (winners.length > 0) {
    await tx
      .insert(habits)
      .values(
        winners.map((h) => ({
          userId,
          id: h.id,
          name: h.name,
          emoji: h.emoji,
          color: h.color,
          cadence: h.cadence,
          target: h.target,
          order: h.order,
          createdAt: h.createdAt,
          archivedAt: h.archivedAt,
          updatedAt: h.updatedAt,
          deletedAt: h.deletedAt,
          seq: NEXT_SEQ as unknown as number,
        })),
      )
      .onConflictDoUpdate({
        target: [habits.userId, habits.id],
        set: {
          name: sql`excluded.name`,
          emoji: sql`excluded.emoji`,
          color: sql`excluded.color`,
          cadence: sql`excluded.cadence`,
          target: sql`excluded.target`,
          // Quoted: `order` is a reserved word.
          order: sql`excluded."order"`,
          archivedAt: sql`excluded.archived_at`,
          updatedAt: sql`excluded.updated_at`,
          deletedAt: sql`excluded.deleted_at`,
          // A stored row gets a new cursor position every time it changes; that
          // is what makes other devices notice it.
          seq: NEXT_SEQ,
        },
      });
  }

  const live = new Set<string>();
  for (const [id, habit] of byId) if (habit.deletedAt === null) live.add(id);

  return { live, newlyDeleted };
}

async function pushEntries(
  tx: Tx,
  userId: string,
  incoming: Entry[],
  live: Set<string>,
): Promise<void> {
  // Orphans and entries for deleted habits are dropped rather than stored. The
  // foreign key in `schema.ts` would reject the orphans anyway, but as an error
  // that fails the whole request — and one stale row from one device must not be
  // able to wedge that device's sync permanently.
  const candidates = incoming.filter((e) => live.has(e.habitId));
  if (candidates.length === 0) return;

  const keys = sql.join(
    candidates.map((e) => sql`(${e.habitId}, ${e.date})`),
    sql`, `,
  );

  const current = await tx
    .select()
    .from(entries)
    .where(
      and(
        eq(entries.userId, userId),
        // Row-value IN, so exactly the pushed keys are read — an `IN` on habit
        // ids crossed with an `IN` on dates would read the rectangle between
        // them, which on a long history is most of the table.
        sql`(${entries.habitId}, ${entries.date}) in (${keys})`,
      ),
    );

  const byKey = new Map(current.map((row) => [`${row.habitId}:${row.date}`, toEntry(row)]));

  const winners = candidates.filter((entry) =>
    wins(entry, byKey.get(`${entry.habitId}:${entry.date}`), fingerprintEntry),
  );
  if (winners.length === 0) return;

  await tx
    .insert(entries)
    .values(
      winners.map((e) => ({
        userId,
        habitId: e.habitId,
        date: e.date,
        count: e.count,
        updatedAt: e.updatedAt,
        seq: NEXT_SEQ as unknown as number,
      })),
    )
    .onConflictDoUpdate({
      target: [entries.userId, entries.habitId, entries.date],
      set: {
        count: sql`excluded.count`,
        updatedAt: sql`excluded.updated_at`,
        seq: NEXT_SEQ,
      },
    });
}

async function pushSettings(
  tx: Tx,
  userId: string,
  incoming: SyncPush["settings"],
): Promise<void> {
  if (!incoming) return;

  const [current] = await tx.select().from(settings).where(eq(settings.userId, userId)).limit(1);
  const existing = current ? { value: current.value, updatedAt: current.updatedAt } : undefined;
  if (!wins(incoming, existing, fingerprintSettings)) return;

  await tx
    .insert(settings)
    .values({
      userId,
      value: incoming.value,
      updatedAt: incoming.updatedAt,
      seq: NEXT_SEQ as unknown as number,
    })
    .onConflictDoUpdate({
      target: settings.userId,
      set: {
        value: sql`excluded.value`,
        updatedAt: sql`excluded.updated_at`,
        seq: NEXT_SEQ,
      },
    });
}

// ---------------------------------------------------------------------------
// Pull
// ---------------------------------------------------------------------------

async function pull(tx: Tx, userId: string, since: number): Promise<SyncPull> {
  const [habitRows, entryRows, settingsRows] = await Promise.all([
    tx
      .select()
      .from(habits)
      .where(and(eq(habits.userId, userId), gt(habits.seq, since)))
      .orderBy(habits.seq)
      .limit(MAX_ROWS_PER_REQUEST),
    tx
      .select()
      .from(entries)
      .where(and(eq(entries.userId, userId), gt(entries.seq, since)))
      .orderBy(entries.seq)
      .limit(MAX_ROWS_PER_REQUEST),
    tx
      .select()
      .from(settings)
      .where(and(eq(settings.userId, userId), gt(settings.seq, since)))
      .limit(1),
  ]);

  const truncated =
    habitRows.length === MAX_ROWS_PER_REQUEST || entryRows.length === MAX_ROWS_PER_REQUEST;
  const cursor = resumePoint(since, [habitRows, entryRows], [settingsRows]);

  return {
    seq: cursor,
    accountId: userId,
    // Rows past the cursor are withheld, not dropped: the client's next request
    // starts at `cursor` and receives them then. Handing over a row while
    // reporting a cursor below it would be a lie the client cannot detect.
    habits: habitRows.filter((r) => r.seq <= cursor).map(toHabit),
    entries: entryRows.filter((r) => r.seq <= cursor).map(toEntry),
    settings:
      settingsRows.length > 0 && settingsRows[0].seq <= cursor
        ? { value: settingsRows[0].value, updatedAt: settingsRows[0].updatedAt }
        : null,
    more: truncated,
    serverNow: Date.now(),
  };
}

/**
 * The cursor to report, given that any collection may have been truncated.
 *
 * A first sync on a long history does not fit in one response, so each
 * collection is capped. The cursor then cannot simply be the highest seq seen:
 * if habits were cut short at seq 900 while entries ran on to 4000, reporting
 * 4000 would step over every habit between them. The safe answer is the lowest
 * point up to which *every* collection is complete.
 *
 * When nothing was truncated, that point is the highest seq observed, and the
 * client is fully caught up in one round trip.
 */
function resumePoint(
  since: number,
  capped: { seq: number }[][],
  uncapped: { seq: number }[][],
): number {
  let complete = Infinity;
  let highest = since;

  for (const rows of capped) {
    for (const row of rows) highest = Math.max(highest, row.seq);
    if (rows.length === MAX_ROWS_PER_REQUEST) {
      complete = Math.min(complete, rows[rows.length - 1].seq);
    }
  }
  for (const rows of uncapped) {
    for (const row of rows) highest = Math.max(highest, row.seq);
  }

  return complete === Infinity ? highest : Math.min(complete, highest);
}

// ---------------------------------------------------------------------------
// Row ↔ domain
// ---------------------------------------------------------------------------

function toHabit(row: typeof habits.$inferSelect): Habit {
  return {
    id: row.id,
    name: row.name,
    emoji: row.emoji,
    // Validated on the way in by `parseSyncPush`; the column is text because a
    // new palette entry should not need a migration to land.
    color: row.color as HabitColorKey,
    cadence: row.cadence,
    target: row.target,
    order: row.order,
    createdAt: row.createdAt,
    archivedAt: row.archivedAt,
    updatedAt: row.updatedAt,
    deletedAt: row.deletedAt,
  };
}

function toEntry(row: typeof entries.$inferSelect): Entry {
  return {
    habitId: row.habitId,
    date: row.date,
    count: row.count,
    updatedAt: row.updatedAt,
  };
}
