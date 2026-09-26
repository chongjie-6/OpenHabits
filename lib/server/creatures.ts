import "server-only";

/**
 * Creature progression, server side (§13.18). The only writer of `creatures`
 * and `creature_days`: a client asks to claim a day, choose a starter or seat a
 * party, and never sends an amount, a level or a find. The day it claims is read
 * from the server's own copy of the synced habits, not from anything it says.
 */

import { and, desc, eq, isNotNull, sql } from "drizzle-orm";
import {
  DISCOVERY_DAYS,
  isGoodDay,
  type ClaimResult,
  type CreatureState,
  LINES,
  PARTY_SIZE,
  payout,
  STARTERS,
} from "../creatures";
import { civilInZone } from "../dates";
import { isDayKey } from "../sync/validate";
import { DEFAULT_SETTINGS, type DayKey } from "../types";
import type { SyncUser } from "./auth-types";
import type { Db } from "./db";
import { creatureDays, creatures, settings } from "./schema";
import { asUser, type Tx } from "./scope";
import { dayStates, ensureUser, lockUser } from "./sync-store";

/** A request the rules refuse. The route answers 400 with its message. */
export class CreatureRefusal extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CreatureRefusal";
  }
}

export type CreatureCommand =
  | { action: "claim"; day: DayKey }
  | { action: "choose"; line: string }
  | { action: "party"; lines: string[] };

/** Shape only: whether a line is owned, or a starter, is the rules' to say. */
export function parseCommand(body: unknown): CreatureCommand | null {
  if (typeof body !== "object" || body === null || Array.isArray(body))
    return null;
  const command = body as Record<string, unknown>;

  switch (command.action) {
    case "claim":
      return isDayKey(command.day)
        ? { action: "claim", day: command.day }
        : null;
    case "choose":
      return isLineId(command.line)
        ? { action: "choose", line: command.line }
        : null;
    case "party":
      return Array.isArray(command.lines) &&
        command.lines.length <= LINES.length &&
        command.lines.every(isLineId)
        ? { action: "party", lines: command.lines }
        : null;
    default:
      return null;
  }
}

function isLineId(value: unknown): value is string {
  return typeof value === "string" && value.length > 0 && value.length <= 64;
}

/**
 * UTC−12 (POSIX signs run backwards) is the last place a day ends, held back
 * further by the latest `dayStartHour` allowed; UTC+14 is the first to begin.
 */
const LAST_ON_EARTH = "Etc/GMT+12";
const FIRST_ON_EARTH = "Pacific/Kiritimati";
const LATEST_DAY_START = 6;

/**
 * Is `day` today somewhere on Earth? Checked without the client's timezone,
 * which it could choose: at most two days pass, so a missed week cannot be
 * backfilled, and a day can be claimed about a day late at most.
 */
export function claimable(day: DayKey, now: number): boolean {
  const at = new Date(now);
  return (
    civilInZone(LAST_ON_EARTH, at, LATEST_DAY_START).day <= day &&
    day <= civilInZone(FIRST_ON_EARTH, at).day
  );
}

export function readCreatures(db: Db, userId: string): Promise<CreatureState> {
  return asUser(db, userId, (tx) => stateOf(tx, userId));
}

/**
 * Pays the party the difference between what the day now earns and what it has
 * already paid, and never takes any back. Then finds whatever good days are due.
 */
export async function claimDay(
  db: Db,
  user: SyncUser,
  day: DayKey,
  now = Date.now(),
): Promise<ClaimResult> {
  if (!claimable(day, now)) {
    throw new CreatureRefusal("That day is over everywhere, or not yet begun.");
  }

  return write(db, user, async (tx) => {
    const [config] = await tx
      .select({ value: settings.value })
      .from(settings)
      .where(eq(settings.userId, user.id))
      .limit(1);
    const weekStartsOn =
      config?.value.weekStartsOn ?? DEFAULT_SETTINGS.weekStartsOn;
    const states = await dayStates(tx, user.id, day, weekStartsOn);
    const scheduled = states.filter((state) => state.scheduled).length;
    const completed = states.filter(
      (state) => state.scheduled && state.done,
    ).length;

    const [previous] = await tx
      .select()
      .from(creatureDays)
      .where(and(eq(creatureDays.userId, user.id), eq(creatureDays.day, day)))
      .limit(1);

    let gained = 0;
    if (
      !previous ||
      rate(completed, scheduled) > rate(previous.completed, previous.scheduled)
    ) {
      const paid = previous?.expPaid ?? 0;
      const earned = Math.max(paid, payout(completed, scheduled));
      gained = earned - paid;

      await tx
        .insert(creatureDays)
        .values({ userId: user.id, day, completed, scheduled, expPaid: earned })
        .onConflictDoUpdate({
          target: [creatureDays.userId, creatureDays.day],
          set: { completed, scheduled, expPaid: earned },
        });

      if (gained > 0) {
        await tx
          .update(creatures)
          .set({ exp: sql`${creatures.exp} + ${gained}` })
          .where(and(eq(creatures.userId, user.id), isNotNull(creatures.slot)));
      }
    }

    const found = await discover(tx, user.id);
    return { ...(await stateOf(tx, user.id)), gained, found };
  });
}

/** Only while nothing is owned, and only a starter, who becomes the buddy. */
export async function chooseStarter(
  db: Db,
  user: SyncUser,
  line: string,
): Promise<CreatureState> {
  if (!STARTERS.includes(line)) {
    throw new CreatureRefusal("That creature is not a starter.");
  }

  return write(db, user, async (tx) => {
    const owned = await tx
      .select({ line: creatures.line })
      .from(creatures)
      .where(eq(creatures.userId, user.id))
      .limit(1);
    if (owned.length > 0) {
      throw new CreatureRefusal("A starter has already been chosen.");
    }

    await tx.insert(creatures).values({ userId: user.id, line, slot: 0 });
    return stateOf(tx, user.id);
  });
}

/** Replaces the whole party: the first is the buddy, and everyone else is boxed. */
export async function setParty(
  db: Db,
  user: SyncUser,
  lines: string[],
): Promise<CreatureState> {
  if (
    lines.length === 0 ||
    lines.length > PARTY_SIZE ||
    new Set(lines).size !== lines.length
  ) {
    throw new CreatureRefusal(
      `A party is one to ${PARTY_SIZE} different creatures.`,
    );
  }

  return write(db, user, async (tx) => {
    const owned = new Set(
      (
        await tx
          .select({ line: creatures.line })
          .from(creatures)
          .where(eq(creatures.userId, user.id))
      ).map((row) => row.line),
    );
    if (lines.some((line) => !owned.has(line))) {
      throw new CreatureRefusal("That creature is not yours.");
    }

    // Emptied first: each seat is unique, so moving one creature into another's
    // seat would collide mid-shuffle.
    await tx
      .update(creatures)
      .set({ slot: null })
      .where(eq(creatures.userId, user.id));
    for (const [slot, line] of lines.entries()) {
      await tx
        .update(creatures)
        .set({ slot })
        .where(and(eq(creatures.userId, user.id), eq(creatures.line, line)));
    }
    return stateOf(tx, user.id);
  });
}

/** Under sync's lock, so a claim reads a whole sync and two claims cannot both pay. */
function write<T>(
  db: Db,
  user: SyncUser,
  work: (tx: Tx) => Promise<T>,
): Promise<T> {
  return asUser(db, user.id, async (tx) => {
    await lockUser(tx, user.id);
    await ensureUser(tx, user);
    return work(tx);
  });
}

function rate(completed: number, scheduled: number): number {
  return scheduled === 0 ? 0 : completed / scheduled;
}

/**
 * Grants every find the good days have earned: one line per `DISCOVERY_DAYS`,
 * next in `LINES` order, and none until a starter is owned. A find takes the
 * first free seat, or the box.
 */
async function discover(tx: Tx, userId: string): Promise<string[]> {
  const { creatures: owned, goodDays } = await stateOf(tx, userId);
  if (owned.length === 0) return [];

  const due = 1 + Math.floor(goodDays / DISCOVERY_DAYS) - owned.length;
  const ownedLines = new Set(owned.map((c) => c.line));
  const next = LINES.filter((line) => !ownedLines.has(line.id)).slice(
    0,
    Math.max(0, due),
  );

  const seated = new Set(owned.map((c) => c.slot));
  for (const line of next) {
    const slot =
      Array.from({ length: PARTY_SIZE }, (_, i) => i).find(
        (i) => !seated.has(i),
      ) ?? null;
    seated.add(slot);
    await tx.insert(creatures).values({ userId, line: line.id, slot });
  }
  return next.map((line) => line.id);
}

async function stateOf(tx: Tx, userId: string): Promise<CreatureState> {
  const [rows, days] = await Promise.all([
    tx.select().from(creatures).where(eq(creatures.userId, userId)),
    tx
      .select()
      .from(creatureDays)
      .where(eq(creatureDays.userId, userId))
      .orderBy(desc(creatureDays.day)),
  ]);

  const order = (line: string) => LINES.findIndex((l) => l.id === line);
  const latest = days[0];

  return {
    creatures: rows
      .map(({ line, exp, slot }) => ({ line, exp, slot }))
      .sort((a, b) => order(a.line) - order(b.line)),
    goodDays: days.filter((d) => isGoodDay(d.completed, d.scheduled)).length,
    lastDay: latest
      ? {
          day: latest.day,
          completed: latest.completed,
          scheduled: latest.scheduled,
          expPaid: latest.expPaid,
        }
      : null,
  };
}
