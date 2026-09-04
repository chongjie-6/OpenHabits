/**
 * Server schema. See DESIGN.md §13. It follows `lib/types.ts` with three
 * deliberate differences.
 *
 * 1. `userId` is part of the primary key rather than a column beside it.
 *    Colliding client-generated UUIDs are vanishingly unlikely, but "unlikely"
 *    is the wrong standard for a key that decides whose data you read.
 *
 * 2. Civil dates stay `text`. A Postgres `date` column would invite exactly the
 *    timezone conversion §3 spends its length avoiding, and text sorts correctly
 *    in this format anyway.
 *
 * 3. Each row carries `seq` alongside `updatedAt` — the server cursor next to
 *    the client merge stamp. See `lib/sync/protocol.ts` for why both exist.
 *
 * Every table here is under row-level security, described below and opened by
 * `lib/server/scope.ts`. See DESIGN.md §13.15.
 */

import { sql } from "drizzle-orm";
import {
  bigint,
  foreignKey,
  index,
  integer,
  jsonb,
  pgPolicy,
  pgSequence,
  pgTable,
  primaryKey,
  text,
  timestamp,
} from "drizzle-orm/pg-core";
import type { Cadence, Settings } from "../types";

/**
 * The account this transaction is allowed to touch, or NULL when nobody opened a
 * scope. `user_id = NULL` is NULL, and a policy that is not *true* denies the
 * row — so a statement that forgets to say who it is for reads nothing rather
 * than everything. That is the whole reason the check is written this way round
 * instead of as `coalesce(…)` against a sentinel.
 *
 * The setting is written per transaction by `lib/server/scope.ts:asUser`; the
 * missing-ok second argument to `current_setting` is what makes an unset one
 * NULL instead of an error.
 */
const owner = () => sql`user_id = current_setting('openhabits.user_id', true)`;

/**
 * The escape hatch for the two operations that genuinely are not on behalf of
 * one account: the hourly reminder sweep, which must look at every device, and
 * the subscribe upsert, which takes an endpoint over from whichever account
 * held it last (see `pushSubscriptions` below).
 *
 * **It is deliberately not granted on `habits`, `entries` or `users`.** Habit
 * content has no bypass anywhere in this codebase — the only way to read a
 * habit is to name the account it belongs to. What this opens is one blob of
 * preferences and a table of device handles, and `scope.ts:asServer` is the
 * only thing that opens it.
 */
const server = () => sql`current_setting('openhabits.scope', true) = 'server'`;

/**
 * The single source of `seq` for every row of every account. One global sequence
 * rather than one per user, which would mean a table of counters plus a
 * read-modify-write on every sync: cursors only need to be monotonic *within* an
 * account, and a subsequence of a monotonic series is monotonic. The numbers gap
 * between users; nothing reads them as a count.
 *
 * It keeps its pre-rebrand name: renaming it is a migration against a live
 * counter every row's `seq` was drawn from, for no behavioural gain.
 */
export const syncSeq = pgSequence("hapi_sync_seq");

export const users = pgTable(
  "users",
  {
    /** Opaque id from whatever identity provider is wired up. See `lib/server/auth.ts`. */
    id: text("id").primaryKey(),
    email: text("email").notNull().unique(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  () => [
    // The only table whose owning column is `id` rather than `user_id`.
    pgPolicy("users_owner", {
      for: "all",
      using: sql`id = current_setting('openhabits.user_id', true)`,
      withCheck: sql`id = current_setting('openhabits.user_id', true)`,
    }),
  ],
).enableRLS();

export const habits = pgTable(
  "habits",
  {
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    id: text("id").notNull(),
    name: text("name").notNull(),
    emoji: text("emoji").notNull(),
    color: text("color").notNull(),
    cadence: jsonb("cadence").$type<Cadence>().notNull(),
    target: integer("target").notNull(),
    order: integer("order").notNull(),
    createdAt: text("created_at").notNull(),
    archivedAt: text("archived_at"),
    /** Client epoch ms. Decides merges. */
    updatedAt: bigint("updated_at", { mode: "number" }).notNull(),
    /** Client epoch ms, or null when live. A tombstone, never a removed row. */
    deletedAt: bigint("deleted_at", { mode: "number" }),
    /** Server sequence. Drives the pull cursor. */
    seq: bigint("seq", { mode: "number" }).notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.userId, t.id] }),
    // The one index the pull query needs: every read is
    // "this user's rows past this cursor, in cursor order".
    index("habits_user_seq_idx").on(t.userId, t.seq),
    pgPolicy("habits_owner", { for: "all", using: owner(), withCheck: owner() }),
  ],
).enableRLS();

export const entries = pgTable(
  "entries",
  {
    userId: text("user_id").notNull(),
    habitId: text("habit_id").notNull(),
    date: text("date").notNull(),
    count: integer("count").notNull(),
    updatedAt: bigint("updated_at", { mode: "number" }).notNull(),
    seq: bigint("seq", { mode: "number" }).notNull(),
  },
  (t) => [
    // The compound key from §3, scoped to the account. Its uniqueness is what
    // makes a replayed push harmless: the same tick can only ever be one row.
    primaryKey({ columns: [t.userId, t.habitId, t.date] }),
    index("entries_user_seq_idx").on(t.userId, t.seq),
    // An entry without its habit is unreadable — nothing knows its target or
    // cadence. Habits are upserted first in the same transaction and `applyPush`
    // drops orphans, so this is a backstop rather than a path relied on.
    foreignKey({
      columns: [t.userId, t.habitId],
      foreignColumns: [habits.userId, habits.id],
      name: "entries_habit_fk",
    }).onDelete("cascade"),
    pgPolicy("entries_owner", { for: "all", using: owner(), withCheck: owner() }),
  ],
).enableRLS();

export const settings = pgTable(
  "settings",
  {
    userId: text("user_id")
      .primaryKey()
      .references(() => users.id, { onDelete: "cascade" }),
    value: jsonb("value").$type<Settings>().notNull(),
    updatedAt: bigint("updated_at", { mode: "number" }).notNull(),
    seq: bigint("seq", { mode: "number" }).notNull(),
  },
  () => [
    pgPolicy("settings_owner", { for: "all", using: owner(), withCheck: owner() }),
    // Read-only, and the sweep is the only reader: it needs `reminderHour`,
    // `dayStartHour` and `weekStartsOn` for every device it is considering, in
    // the one pass that decides which of them are due. Nothing under this scope
    // may write a preference, and the habits the reminder counts are still read
    // under the account's own scope.
    pgPolicy("settings_server", { for: "select", using: server() }),
  ],
).enableRLS();

/**
 * Web Push subscriptions — one row per browser that asked for reminders. See
 * DESIGN.md §8.5.
 *
 * Three deliberate differences from every other table here.
 *
 * 1. **The key is the endpoint alone**, not `(userId, …)`. An endpoint is the
 *    push service's globally unique handle for one browser, and keying it per
 *    user would let two accounts on the same device each hold a live row —
 *    signing out and back in as somebody else would then deliver that person's
 *    habits to the previous owner's notification tray. Overwriting on endpoint
 *    is what makes handing a device over safe.
 *
 * 2. **No `seq`, and no tombstone.** These rows are not replicated: they are
 *    device facts the client can rebuild from `PushManager` at any time, so an
 *    unsubscribe is a delete. Nothing pulls them.
 *
 * 3. `timeZone` is stored rather than derived. The reminder is due at nine in
 *    the morning *where the browser is*, and the server's clock is UTC; the
 *    zone is a property of the device, not of the account, so it cannot live in
 *    the synced settings blob beside `reminderHour`.
 */
export const pushSubscriptions = pgTable(
  "push_subscriptions",
  {
    endpoint: text("endpoint").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    /** The two keys from `PushSubscription.toJSON().keys`, base64url. */
    p256dh: text("p256dh").notNull(),
    auth: text("auth").notNull(),
    /** IANA zone name, validated against ICU before it is stored. */
    timeZone: text("time_zone").notNull(),
    /**
     * The last civil day a reminder went to this device, or null for never.
     * The cron runs hourly and this is what keeps it from sending twice — a
     * user who changes `reminderHour` from 9 to 10 at 09:30 gets one reminder
     * that day, not two.
     */
    lastSentDay: text("last_sent_day"),
    /**
     * The last time this browser opened the app and said it still wanted
     * reminders. See `SUBSCRIPTION_TTL_MS` — the sweep drops a row that has gone
     * quiet for longer than that.
     *
     * Refreshed by the subscribe upsert, which the client re-sends on app start
     * and on every visit to the settings card. Not `createdAt`: a device that
     * has been getting reminders happily for a year has an old `createdAt` and
     * is exactly the row that must not be collected.
     */
    lastSeenAt: timestamp("last_seen_at", { withTimezone: true }).notNull().defaultNow(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    // Every read is "this account's devices", either to send to them or to
    // clear them out.
    index("push_subscriptions_user_idx").on(t.userId),
    pgPolicy("push_subscriptions_owner", { for: "all", using: owner(), withCheck: owner() }),
    // Two callers, both in `asServer` and both unavoidable. The sweep scans
    // every account's devices by definition. And the subscribe upsert conflicts
    // on the endpoint alone — point 1 above — which means writing over a row
    // belonging to the account that held the device before. RLS cannot express
    // "you may take over a row you are not allowed to see", so that write says
    // out loud that it is not acting for one account.
    pgPolicy("push_subscriptions_server", { for: "all", using: server(), withCheck: server() }),
  ],
).enableRLS();
