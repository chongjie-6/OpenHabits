import "server-only";

/**
 * The server half of sync. See DESIGN.md §13.
 *
 * The merge rule is deliberately not written in SQL. `ON CONFLICT … WHERE
 * excluded.updated_at > habits.updated_at` works right up to the tiebreaker,
 * which compares record content — reproducing that in SQL means the rule exists
 * twice, in two languages, and convergence depends on them agreeing exactly.
 * They would drift, and the symptom is two devices disagreeing forever.
 *
 * So the decision is made by the same `wins()` the client uses.
 * Read-modify-write is safe here because of `lockUser`, and the rows read are
 * bounded by the size of the push.
 */

import { and, eq, gt, inArray, isNotNull, lt, sql } from "drizzle-orm";
import {
  fingerprintEntry,
  fingerprintHabit,
  fingerprintSettings,
  MAX_ROWS_PER_REQUEST,
  TOMBSTONE_TTL_MS,
  wins,
  type SyncPull,
  type SyncPush,
} from "../sync/protocol";
import type { Entry, Habit, HabitColor } from "../types";
import type { SyncUser } from "./auth-types";
import type { Db } from "./db";
import { entries, habits, settings, users } from "./schema";
import { asUser, type Tx } from "./scope";

/** A fresh cursor value. See `syncSeq` in `schema.ts`. */
const NEXT_SEQ = sql`nextval('hapi_sync_seq')`;

/**
 * Raised when the client's stated account is not the authenticated one. A
 * distinct type so the route can answer 409 rather than 500 — the client needs
 * telling that its local data belongs to someone else.
 */
export class AccountMismatchError extends Error {
  constructor(readonly actual: string) {
    super("Local data belongs to a different account.");
    this.name = "AccountMismatchError";
  }
}

export async function runSync(db: Db, user: SyncUser, push: SyncPush): Promise<SyncPull> {
  // Before the transaction opens: nothing to roll back, and no reason to take a
  // lock for a request that cannot proceed.
  if (push.accountId !== null && push.accountId !== user.id) {
    throw new AccountMismatchError(user.id);
  }

  // `asUser` rather than `db.transaction`: every statement below is under the
  // row-level security policies in `schema.ts`, and outside a scope they match
  // nothing. See DESIGN.md §13.15.
  return asUser(db, user.id, async (tx) => {
    await lockUser(tx, user.id);
    await ensureUser(tx, user);

    await applyPush(tx, user.id, push);
    await collectTombstones(tx, user.id);
    return pull(tx, user.id, push.since);
  });
}

/**
 * Serialise one account's sync transactions, which is what makes `seq` a usable
 * cursor. Sequence values are handed out when a statement runs, but rows become
 * visible when their transaction commits — so two concurrent syncs can commit in
 * the opposite order to their assignment, and a client pulling in the gap saves
 * the higher seq and steps permanently over the lower one.
 *
 * Held only for the transaction, released on commit or rollback. `hashtext`
 * because the lock key must be a bigint; a collision between two accounts costs
 * a brief serialisation and nothing else.
 */
async function lockUser(tx: Tx, userId: string): Promise<void> {
  await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${userId}))`);
}

/**
 * `settings` and `habits` both reference `users`, so the row has to exist before
 * a first sync can write anything. `DO NOTHING` rather than an email update,
 * which would make every sync a write for a column sync never reads.
 */
async function ensureUser(tx: Tx, user: SyncUser): Promise<void> {
  await tx
    .insert(users)
    .values({ id: user.id, email: user.email })
    .onConflictDoNothing({ target: users.id });
}

/**
 * Drop tombstones old enough that no device could still need telling. See
 * `TOMBSTONE_TTL_MS`, which is also what the client collects against.
 *
 * Inside the sync transaction rather than on a cron: the work is bounded by one
 * account's habit count — tens of rows — the advisory lock is already held, and
 * an account nobody syncs is an account whose tombstones cost nothing. It buys
 * no new failure mode either, because a delete here is invisible to `pull`:
 * every device whose cursor predates the tombstone has already been told, and a
 * device starting from zero has no copy to contradict.
 *
 * Ordered after `applyPush` deliberately. A push carrying a very old tombstone
 * writes it and this immediately collects it, which is correct — the sender is
 * the only device that still had it.
 */
async function collectTombstones(tx: Tx, userId: string): Promise<void> {
  await tx
    .delete(habits)
    .where(
      and(
        eq(habits.userId, userId),
        isNotNull(habits.deletedAt),
        lt(habits.deletedAt, Date.now() - TOMBSTONE_TTL_MS),
      ),
    );
}

async function applyPush(tx: Tx, userId: string, push: SyncPush): Promise<void> {
  const tombstoned = await pushHabits(tx, userId, push.habits);
  await pushEntries(tx, userId, push.entries, tombstoned.live);

  // After the pushed entries have been considered, so a peer still pushing a
  // deleted habit's entries cannot reinstate them.
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
  // know about habits this device has never sent. A handful of rows either way.
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
          // A new cursor position on every change is what makes other devices
          // notice the row.
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
  // Dropped rather than stored. The foreign key in `schema.ts` would reject the
  // orphans anyway, but as an error that fails the whole request — and one stale
  // row must not wedge a device's sync permanently.
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
        // Row-value IN, so exactly the pushed keys are read. An `IN` on ids
        // crossed with an `IN` on dates reads the rectangle between them, which
        // on a long history is most of the table.
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
    // Withheld, not dropped — the next request starts at `cursor` and receives
    // them. Handing over a row under a cursor below it is a lie the client
    // cannot detect.
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
 * The cursor to report, given that any collection may have been truncated. It
 * cannot simply be the highest seq seen: habits cut short at 900 while entries
 * ran on to 4000 would report 4000 and step over every habit between them. The
 * safe answer is the lowest point up to which *every* collection is complete —
 * which, with nothing truncated, is the highest seq observed.
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

/** Row → domain habit. Exported for `reminders.ts`, which reads the same rows. */
export function toHabit(row: typeof habits.$inferSelect): Habit {
  return {
    id: row.id,
    name: row.name,
    emoji: row.emoji,
    // Validated on the way in by `parseSyncPush`. The column is text so a new
    // palette entry does not need a migration to land.
    color: row.color as HabitColor,
    cadence: row.cadence,
    target: row.target,
    order: row.order,
    createdAt: row.createdAt,
    archivedAt: row.archivedAt,
    updatedAt: row.updatedAt,
    deletedAt: row.deletedAt,
  };
}

export function toEntry(row: typeof entries.$inferSelect): Entry {
  return {
    habitId: row.habitId,
    date: row.date,
    count: row.count,
    updatedAt: row.updatedAt,
  };
}
