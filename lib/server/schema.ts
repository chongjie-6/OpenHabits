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
    // cadence. Habits are upserted first in the same transaction and `applyPush`
    // drops orphans, so this is a backstop rather than a path relied on.
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
