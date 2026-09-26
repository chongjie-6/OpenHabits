/**
 * Creature progression against real Postgres (§13.18). Everything that makes it
 * "validated" happens here: the claim window, the server's own reading of the
 * synced day, pay-the-difference, and ownership checks on every party change.
 */

import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { beforeEach, describe, expect, it } from "vitest";
import { DISCOVERY_DAYS, LINES } from "@/lib/creatures";
import { addDays } from "@/lib/dates";
import type { SyncUser } from "@/lib/server/auth-types";
import {
  chooseStarter,
  claimable,
  claimDay,
  CreatureRefusal,
  parseCommand,
  readCreatures,
  setParty,
} from "@/lib/server/creatures";
import type { Db } from "@/lib/server/db";
import * as schema from "@/lib/server/schema";
import { runSync } from "@/lib/server/sync-store";
import type { Entry, Habit } from "@/lib/types";

const MIGRATIONS_DIR = fileURLToPath(new URL("../../drizzle", import.meta.url));

let db: Db;

beforeEach(async () => {
  const pglite = new PGlite();
  const files = readdirSync(MIGRATIONS_DIR)
    .filter((name) => name.endsWith(".sql"))
    .sort();
  for (const name of files) {
    const text = readFileSync(join(MIGRATIONS_DIR, name), "utf8");
    for (const statement of text.split("--> statement-breakpoint")) {
      if (statement.trim()) await pglite.exec(statement);
    }
  }
  db = drizzle(pglite, { schema }) as unknown as Db;
});

const ALICE: SyncUser = { id: "alice", email: "alice@example.com" };
const BOB: SyncUser = { id: "bob", email: "bob@example.com" };

/** Noon UTC, so "today somewhere" is this day and its neighbours only. */
const DAY = "2026-09-10";
const NOON = Date.parse(`${DAY}T12:00:00Z`);
const at = (day: string) => Date.parse(`${day}T12:00:00Z`);

function habit(id: string): Habit {
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
    updatedAt: 1,
    deletedAt: null,
  };
}

const TEN = Array.from({ length: 10 }, (_, i) => habit(`h${i}`));

/** Strictly rising, so an un-tick never ties with the tick it replaces. */
let clock = Date.now();

/** Syncs ten daily habits, `done` of them ticked on `day` and the rest not. */
async function tick(user: SyncUser, day: string, done: number): Promise<void> {
  const entries: Entry[] = TEN.map((h, i) => ({
    habitId: h.id,
    date: day,
    count: i < done ? 1 : 0,
    updatedAt: ++clock,
  }));
  await runSync(db, user, {
    since: 0,
    accountId: null,
    habits: TEN,
    entries,
    settings: null,
  });
}

async function claim(user: SyncUser, day: string, done: number) {
  await tick(user, day, done);
  return claimDay(db, user, day, at(day));
}

const expOf = async (user: SyncUser) =>
  Object.fromEntries(
    (await readCreatures(db, user.id)).creatures.map((c) => [c.line, c.exp]),
  );

describe("claimable", () => {
  it("accepts any day that is today somewhere on Earth", () => {
    expect(claimable(DAY, NOON)).toBe(true);
    expect(claimable(addDays(DAY, -1), NOON)).toBe(true);
    expect(claimable(addDays(DAY, 1), NOON)).toBe(true);
  });

  it("refuses the day before yesterday and the day after tomorrow", () => {
    expect(claimable(addDays(DAY, -2), NOON)).toBe(false);
    expect(claimable(addDays(DAY, 2), NOON)).toBe(false);
  });

  // UTC−12 with the day starting at 6am is still on yesterday until 18:00Z.
  it("keeps yesterday open until the last place on Earth has left it", () => {
    const yesterday = addDays(DAY, -1);
    expect(claimable(yesterday, Date.parse(`${DAY}T17:59:00Z`))).toBe(true);
    expect(claimable(yesterday, Date.parse(`${DAY}T18:00:00Z`))).toBe(false);
  });
});

describe("chooseStarter", () => {
  it("makes a starter the buddy", async () => {
    const state = await chooseStarter(db, ALICE, "emberpup");
    expect(state.creatures).toEqual([{ line: "emberpup", exp: 0, slot: 0 }]);
  });

  it("refuses a line that is not a starter", async () => {
    await expect(chooseStarter(db, ALICE, "mossback")).rejects.toThrow(
      CreatureRefusal,
    );
  });

  it("refuses a second starter", async () => {
    await chooseStarter(db, ALICE, "sproutle");
    await expect(chooseStarter(db, ALICE, "drizzlet")).rejects.toThrow(
      CreatureRefusal,
    );
  });
});

describe("claimDay", () => {
  it("refuses a day outside the window", async () => {
    await tick(ALICE, DAY, 10);
    await expect(claimDay(db, ALICE, DAY, at(addDays(DAY, 3)))).rejects.toThrow(
      CreatureRefusal,
    );
  });

  it("pays the party from the server's own copy of the day", async () => {
    await chooseStarter(db, ALICE, "sproutle");
    const result = await claim(ALICE, DAY, 8);
    expect(result.gained).toBe(35);
    expect(await expOf(ALICE)).toEqual({ sproutle: 35 });
  });

  it("pays only the difference when the day improves, and nothing again", async () => {
    await chooseStarter(db, ALICE, "sproutle");
    await claim(ALICE, DAY, 6);
    expect((await claim(ALICE, DAY, 10)).gained).toBe(30);
    expect((await claim(ALICE, DAY, 10)).gained).toBe(0);
    expect(await expOf(ALICE)).toEqual({ sproutle: 50 });
  });

  it("takes nothing back when the day gets worse", async () => {
    await chooseStarter(db, ALICE, "sproutle");
    await claim(ALICE, DAY, 10);
    expect((await claim(ALICE, DAY, 0)).gained).toBe(0);
    expect(await expOf(ALICE)).toEqual({ sproutle: 50 });
  });

  it("pays the party and not the box", async () => {
    await chooseStarter(db, ALICE, "sproutle");
    let day = DAY;
    for (let i = 0; i < DISCOVERY_DAYS; i++) {
      await claim(ALICE, day, 10);
      day = addDays(day, 1);
    }
    await setParty(db, ALICE, ["emberpup"]);
    const before = await expOf(ALICE);
    await claim(ALICE, day, 10);
    const after = await expOf(ALICE);
    expect(after.emberpup - before.emberpup).toBe(50);
    expect(after.sproutle).toBe(before.sproutle);
  });

  it("finds the next unowned line on every seventh good day", async () => {
    await chooseStarter(db, ALICE, "emberpup");
    let day = DAY;
    for (let i = 0; i < DISCOVERY_DAYS - 1; i++) {
      expect((await claim(ALICE, day, 8)).found).toEqual([]);
      day = addDays(day, 1);
    }
    const result = await claim(ALICE, day, 8);
    expect(result.found).toEqual(["sproutle"]);
    expect(result.creatures.find((c) => c.line === "sproutle")?.slot).toBe(1);
    expect(result.goodDays).toBe(DISCOVERY_DAYS);
  });

  it("does not count a day under the qualifying rate as good", async () => {
    await chooseStarter(db, ALICE, "emberpup");
    const result = await claim(ALICE, DAY, 7);
    expect(result.goodDays).toBe(0);
  });

  it("finds nothing before a starter, and catches up once there is one", async () => {
    let day = DAY;
    for (let i = 0; i < DISCOVERY_DAYS; i++) {
      expect((await claim(ALICE, day, 10)).found).toEqual([]);
      day = addDays(day, 1);
    }
    await chooseStarter(db, ALICE, "sproutle");
    expect((await claim(ALICE, day, 10)).found).toEqual(["emberpup"]);
  });

  it("puts a find in the box once the party is full", async () => {
    await chooseStarter(db, ALICE, "sproutle");
    let day = DAY;
    for (let i = 0; i < DISCOVERY_DAYS * 5; i++) {
      await claim(ALICE, day, 10);
      day = addDays(day, 1);
    }
    const { creatures } = await readCreatures(db, ALICE.id);
    expect(creatures.map((c) => c.line)).toEqual(
      LINES.slice(0, 6).map((l) => l.id),
    );
    expect(creatures.map((c) => c.slot)).toEqual([0, 1, 2, 3, 4, null]);
  });

  it("reads only the claiming account's habits", async () => {
    await chooseStarter(db, ALICE, "sproutle");
    await tick(BOB, DAY, 10);
    await tick(ALICE, DAY, 0);
    expect((await claimDay(db, ALICE, DAY, NOON)).gained).toBe(0);
  });
});

describe("setParty", () => {
  async function twoOwned() {
    await chooseStarter(db, ALICE, "sproutle");
    let day = DAY;
    for (let i = 0; i < DISCOVERY_DAYS; i++) {
      await claim(ALICE, day, 10);
      day = addDays(day, 1);
    }
  }

  it("seats the first as buddy and boxes the rest", async () => {
    await twoOwned();
    const state = await setParty(db, ALICE, ["emberpup"]);
    expect(state.creatures.map((c) => [c.line, c.slot])).toEqual([
      ["sproutle", null],
      ["emberpup", 0],
    ]);
  });

  it("refuses a creature it does not own", async () => {
    await twoOwned();
    await expect(setParty(db, ALICE, ["mossback"])).rejects.toThrow(
      CreatureRefusal,
    );
  });

  it("refuses an empty, duplicated or oversized party", async () => {
    await twoOwned();
    for (const lines of [
      [],
      ["sproutle", "sproutle"],
      ["sproutle", "emberpup", "a", "b", "c", "d"],
    ]) {
      await expect(setParty(db, ALICE, lines)).rejects.toThrow(CreatureRefusal);
    }
  });
});

describe("parseCommand", () => {
  it("accepts each action in its shape", () => {
    expect(parseCommand({ action: "claim", day: DAY })).toEqual({
      action: "claim",
      day: DAY,
    });
    expect(parseCommand({ action: "choose", line: "sproutle" })).toEqual({
      action: "choose",
      line: "sproutle",
    });
    expect(parseCommand({ action: "party", lines: ["a", "b"] })).toEqual({
      action: "party",
      lines: ["a", "b"],
    });
  });

  it("refuses a day that does not exist", () => {
    expect(parseCommand({ action: "claim", day: "2026-02-30" })).toBeNull();
    expect(parseCommand({ action: "claim", day: 20260910 })).toBeNull();
  });

  it("refuses anything else", () => {
    for (const body of [
      null,
      [],
      { action: "grant", line: "sproutle" },
      { action: "choose", line: 7 },
      { action: "choose", line: "x".repeat(65) },
      { action: "party", lines: "sproutle" },
      { action: "party", lines: [1] },
      { action: "party", lines: Array.from({ length: 50 }, () => "a") },
    ]) {
      expect(parseCommand(body), JSON.stringify(body)).toBeNull();
    }
  });
});
