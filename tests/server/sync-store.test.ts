/**
 * Integration tests for the server half of sync, against real Postgres.
 *
 * PGlite is Postgres compiled to WebAssembly, so this exercises the actual
 * planner, the actual constraints and the actual `nextval` — not a mock. That
 * matters here more than in most places: the delicate parts of `sync-store.ts`
 * are all SQL-level (a sequence assigned inside `ON CONFLICT DO UPDATE`, a
 * row-value `IN`, a composite foreign key, an advisory lock), and none of them
 * would be checked by a test double.
 *
 * Each test gets its own database, created in memory and thrown away after.
 */

import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { beforeEach, describe, expect, it } from "vitest";
import type { SyncPull, SyncPush } from "@/lib/sync/protocol";
import { DEFAULT_SETTINGS, type Entry, type Habit } from "@/lib/types";
import type { SyncUser } from "@/lib/server/auth-types";
import type { Db } from "@/lib/server/db";
import * as schema from "@/lib/server/schema";
import { AccountMismatchError, runSync } from "@/lib/server/sync-store";

const MIGRATIONS_DIR = fileURLToPath(new URL("../../drizzle", import.meta.url));

/**
 * Every committed migration in order — not a pinned filename.
 *
 * A test that named one file would keep passing against the original schema after
 * the next migration landed, which is precisely when it needs to fail.
 */
function migrations(): string[] {
  return readdirSync(MIGRATIONS_DIR)
    .filter((name) => name.endsWith(".sql"))
    .sort()
    .map((name) => readFileSync(join(MIGRATIONS_DIR, name), "utf8"));
}

let db: Db;

beforeEach(async () => {
  const pglite = new PGlite();

  // Applied verbatim. If drizzle-kit generates SQL this schema cannot actually
  // run, that is a failure worth catching here rather than against a production
  // database.
  for (const sql of migrations()) {
    for (const statement of sql.split("--> statement-breakpoint")) {
      if (statement.trim()) await pglite.exec(statement);
    }
  }

  // The two drivers are structurally identical for everything used here; the cast
  // keeps `runSync` typed against the driver it ships with in production.
  db = drizzle(pglite, { schema }) as unknown as Db;
});

const ALICE: SyncUser = { id: "alice", email: "alice@example.com" };
const BOB: SyncUser = { id: "bob", email: "bob@example.com" };

function habit(id: string, updatedAt: number, over: Partial<Habit> = {}): Habit {
  return {
    id,
    name: id,
    emoji: "✅",
    color: "green",
    cadence: { kind: "daily" },
    target: 1,
    order: 0,
    createdAt: "2026-08-01",
    archivedAt: null,
    updatedAt,
    deletedAt: null,
    ...over,
  };
}

function entry(habitId: string, date: string, count: number, updatedAt: number): Entry {
  return { habitId, date, count, updatedAt };
}

/** A push with the boilerplate filled in. `since`/`accountId` default to a first sync. */
function push(over: Partial<SyncPush> = {}): SyncPush {
  return { since: 0, accountId: null, habits: [], entries: [], settings: null, ...over };
}

function sync(user: SyncUser, over: Partial<SyncPush> = {}): Promise<SyncPull> {
  return runSync(db, user, push(over));
}

describe("runSync", () => {
  it("creates the account on a first sync and stores what was pushed", async () => {
    const result = await sync(ALICE, {
      habits: [habit("h1", 100)],
      entries: [entry("h1", "2026-08-01", 1, 100)],
      settings: { value: DEFAULT_SETTINGS, updatedAt: 100 },
    });

    expect(result.accountId).toBe("alice");
    expect(result.seq).toBeGreaterThan(0);
    expect(result.more).toBe(false);
    // The push comes back in the same response, because storing it moved it past
    // the cursor the request arrived with.
    expect(result.habits).toHaveLength(1);
    expect(result.entries).toHaveLength(1);
    expect(result.settings?.updatedAt).toBe(100);
  });

  it("round-trips a habit without mangling its fields", async () => {
    const original = habit("h1", 100, {
      name: "Water",
      emoji: "💧",
      color: "blue",
      cadence: { kind: "weekdays", days: [1, 3, 5] },
      target: 8,
      order: 3,
      archivedAt: "2026-08-15",
    });

    const result = await sync(ALICE, { habits: [original] });

    expect(result.habits[0]).toEqual(original);
  });

  it("gives a second device everything the first one pushed", async () => {
    await sync(ALICE, {
      habits: [habit("h1", 100)],
      entries: [entry("h1", "2026-08-01", 1, 100)],
    });

    const second = await sync(ALICE);

    expect(second.habits).toHaveLength(1);
    expect(second.entries).toHaveLength(1);
  });

  it("returns nothing when the client is already at the cursor", async () => {
    const first = await sync(ALICE, { habits: [habit("h1", 100)] });
    const again = await sync(ALICE, { since: first.seq, accountId: "alice" });

    expect(again.habits).toEqual([]);
    expect(again.entries).toEqual([]);
    expect(again.seq).toBe(first.seq);
  });

  it("keeps the newer write when two devices edit the same habit", async () => {
    await sync(ALICE, { habits: [habit("h1", 100, { name: "old" })] });
    const result = await sync(ALICE, {
      accountId: "alice",
      habits: [habit("h1", 200, { name: "new" })],
    });

    expect(result.habits[0].name).toBe("new");
  });

  it("rejects a stale write and hands back the version that won", async () => {
    await sync(ALICE, { habits: [habit("h1", 500, { name: "current" })] });

    const result = await sync(ALICE, {
      accountId: "alice",
      habits: [habit("h1", 200, { name: "stale" })],
    });

    // The loser has to be told, or the two would stay disagreed.
    expect(result.habits[0].name).toBe("current");
  });

  it("advances the cursor when a row changes, so other devices notice", async () => {
    const first = await sync(ALICE, { habits: [habit("h1", 100)] });

    await sync(ALICE, { accountId: "alice", habits: [habit("h1", 200, { name: "renamed" })] });

    // This is the `nextval` inside ON CONFLICT DO UPDATE doing its job: without it
    // the row keeps its original seq and no peer past that point ever sees the edit.
    const catchUp = await sync(ALICE, { since: first.seq, accountId: "alice" });
    expect(catchUp.habits.map((h) => h.name)).toEqual(["renamed"]);
  });

  it("propagates a deletion as a tombstone and clears the habit's history", async () => {
    const first = await sync(ALICE, {
      habits: [habit("h1", 100), habit("h2", 100)],
      entries: [entry("h1", "2026-08-01", 1, 100), entry("h2", "2026-08-01", 1, 100)],
    });

    await sync(ALICE, {
      accountId: "alice",
      since: first.seq,
      habits: [habit("h1", 300, { deletedAt: 300 })],
    });

    const other = await sync(ALICE);
    expect(other.habits.find((h) => h.id === "h1")?.deletedAt).toBe(300);
    // h1's entries are gone; h2's are untouched.
    expect(other.entries.map((e) => e.habitId)).toEqual(["h2"]);
  });

  it("does not let a lagging device resurrect a deleted habit's entries", async () => {
    await sync(ALICE, { habits: [habit("h1", 100)] });
    await sync(ALICE, { accountId: "alice", habits: [habit("h1", 300, { deletedAt: 300 })] });

    // This device has not applied the tombstone and is still pushing history.
    const result = await sync(ALICE, {
      accountId: "alice",
      entries: [entry("h1", "2026-08-02", 5, 400)],
    });

    expect(result.entries).toEqual([]);
  });

  it("drops an entry whose habit it has never heard of, rather than failing the request", async () => {
    // The foreign key would reject this as an error; one stale row must not be
    // able to wedge a device's sync permanently.
    const result = await sync(ALICE, { entries: [entry("ghost", "2026-08-01", 1, 100)] });

    expect(result.entries).toEqual([]);
    expect(result.accountId).toBe("alice");
  });

  it("keeps two accounts entirely separate", async () => {
    await sync(ALICE, { habits: [habit("h1", 100, { name: "alice habit" })] });
    await sync(BOB, { habits: [habit("h1", 100, { name: "bob habit" })] });

    // Same client-generated id in both accounts: the composite primary key is
    // what stops one from overwriting or leaking into the other.
    const alice = await sync(ALICE);
    const bob = await sync(BOB);

    expect(alice.habits.map((h) => h.name)).toEqual(["alice habit"]);
    expect(bob.habits.map((h) => h.name)).toEqual(["bob habit"]);
  });

  it("refuses a push whose stated account is not the authenticated one", async () => {
    await sync(ALICE, { habits: [habit("h1", 100)] });

    await expect(
      runSync(db, BOB, push({ accountId: "alice", habits: [habit("h9", 100)] })),
    ).rejects.toThrow(AccountMismatchError);

    // Nothing was written under Bob's identity.
    const bob = await sync(BOB);
    expect(bob.habits).toEqual([]);
  });

  it("merges settings as a blob under last-write-wins", async () => {
    await sync(ALICE, {
      settings: { value: { ...DEFAULT_SETTINGS, favourites: ["q1"] }, updatedAt: 200 },
    });

    const stale = await sync(ALICE, {
      accountId: "alice",
      settings: { value: { ...DEFAULT_SETTINGS, favourites: ["q2"] }, updatedAt: 100 },
    });
    expect(stale.settings?.value.favourites).toEqual(["q1"]);

    const fresh = await sync(ALICE, {
      accountId: "alice",
      settings: { value: { ...DEFAULT_SETTINGS, favourites: ["q3"] }, updatedAt: 300 },
    });
    expect(fresh.settings?.value.favourites).toEqual(["q3"]);
  });

  it("is idempotent — a replayed push changes nothing", async () => {
    const body = {
      habits: [habit("h1", 100)],
      entries: [entry("h1", "2026-08-01", 3, 100)],
    };

    const first = await sync(ALICE, body);
    const replay = await sync(ALICE, { ...body, accountId: "alice", since: first.seq });

    // Identical content at an identical stamp loses the tiebreaker, so no row is
    // rewritten and the cursor stays where it was.
    expect(replay.seq).toBe(first.seq);
    expect(replay.habits).toEqual([]);
    expect(replay.entries).toEqual([]);
  });

  it("resumes a history too large for one response", async () => {
    // 600 entries against a 500-row cap: two round trips, no gaps, no repeats.
    const habits = [habit("h1", 1)];
    for (let batch = 0; batch < 2; batch++) {
      const entries = Array.from({ length: 300 }, (_, i) => {
        const day = batch * 300 + i;
        return entry("h1", dayKey(day), 1, 1000 + day);
      });
      await sync(ALICE, { accountId: batch === 0 ? null : "alice", habits, entries });
    }

    const seen = new Set<string>();
    let cursor = 0;
    let trips = 0;

    for (;;) {
      const page: SyncPull = await sync(ALICE, { since: cursor, accountId: "alice" });
      for (const e of page.entries) {
        expect(seen.has(e.date)).toBe(false);
        seen.add(e.date);
      }
      cursor = page.seq;
      trips++;
      if (!page.more) break;
      expect(trips).toBeLessThan(10);
    }

    expect(seen.size).toBe(600);
    expect(trips).toBeGreaterThan(1);
  });

  it("does not report a cursor past rows it withheld", async () => {
    // Habits and entries are capped separately. If the cursor ran ahead of the
    // shorter collection, the rows in between would never be delivered.
    const entries = Array.from({ length: 500 }, (_, i) => entry("h1", dayKey(i), 1, 1000 + i));
    await sync(ALICE, { habits: [habit("h1", 1)], entries });

    // A habit edited last, so its seq sits above every entry's.
    await sync(ALICE, { accountId: "alice", habits: [habit("h1", 9000, { name: "last" })] });

    let cursor = 0;
    let sawHabit = false;
    for (let trip = 0; trip < 10; trip++) {
      const page = await sync(ALICE, { since: cursor, accountId: "alice" });
      if (page.habits.some((h) => h.name === "last")) sawHabit = true;
      cursor = page.seq;
      if (!page.more) break;
    }

    expect(sawHabit).toBe(true);
  });
});

/** Distinct civil dates from an offset, for bulk fixtures. */
function dayKey(offset: number): string {
  const date = new Date(Date.UTC(2024, 0, 1 + offset));
  return date.toISOString().slice(0, 10);
}
