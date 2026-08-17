/**
 * Server schema. See DESIGN.md §13.
 *
 * The shape follows `lib/types.ts` closely, with three deliberate differences.
 *
 * 1. Every row is scoped by `userId`, and it is part of the primary key rather
 *    than a column beside it. Habit ids are client-generated UUIDs, so two
 *    accounts colliding is vanishingly unlikely — but "unlikely" is the wrong
 *    standard for a key that decides whose data you read.
 *
 * 2. Civil dates stay `text`. `createdAt`, `archivedAt` and `entries.date` are
 *    'YYYY-MM-DD' in the *user's* timezone, and a Postgres `date` column would
 *    invite exactly the conversion this app spends §3 avoiding. Text sorts
 *    correctly in this format anyway, which is all the ordering we need.
 *
 * 3. Each row carries `seq` alongside `updatedAt` — the server cursor next to
 *    the client merge stamp. See `lib/sync/protocol.ts` for why both exist.
 */

import {
  bigint,
  foreignKey,
  index,
  integer,
  jsonb,
  pgSequence,
  pgTable,
  primaryKey,
  text,
  timestamp,
} from "drizzle-orm/pg-core";
import type { Cadence, Settings } from "../types";

/**
 * The single source of `seq` for every row of every account.
 *
 * One global sequence rather than one per user: a sequence is a counter, and
 * per-user counters would mean a table of them plus a read-modify-write on every
 * sync. Cursors only ever need to be monotonic *within* an account, and a global
 * sequence restricted to one user's rows is exactly that — a subsequence of a
 * monotonic series is monotonic. The numbers have gaps between users; nothing
 * reads them as a count.
 */
export const syncSeq = pgSequence("hapi_sync_seq");

export const users = pgTable("users", {
  /** Opaque id from whatever identity provider is wired up. See `lib/server/auth.ts`. */
  id: text("id").primaryKey(),
  email: text("email").notNull().unique(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

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
  ],
);

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
    // cadence — so the database refuses to hold one. Habits are upserted first in
    // the same transaction, and `applyPush` drops orphans before they get here, so
    // this constraint is a backstop rather than a code path we rely on.
    foreignKey({
      columns: [t.userId, t.habitId],
      foreignColumns: [habits.userId, habits.id],
      name: "entries_habit_fk",
    }).onDelete("cascade"),
  ],
);

export const settings = pgTable("settings", {
  userId: text("user_id")
    .primaryKey()
    .references(() => users.id, { onDelete: "cascade" }),
  value: jsonb("value").$type<Settings>().notNull(),
  updatedAt: bigint("updated_at", { mode: "number" }).notNull(),
  seq: bigint("seq", { mode: "number" }).notNull(),
});
