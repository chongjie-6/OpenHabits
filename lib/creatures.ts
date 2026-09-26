/**
 * The rules creatures grow by (§5.5), shared by the client and the server so each
 * number is stated once. Only exp is stored; level, form and moves derive from it.
 */

import { COGLINGS, CREATURES, LINES, STARTERS } from "@/data/creatures";
import type { Skin } from "./skin";
import type { Creature, DayKey, Line, Move } from "./types";

/** A day at this rate or better is a good day, and good days find creatures. */
export const QUALIFYING_RATE = 0.8;

export function isGoodDay(completed: number, scheduled: number): boolean {
  return scheduled > 0 && completed / scheduled >= QUALIFYING_RATE;
}

/** Every this many good days finds the next line. */
export const DISCOVERY_DAYS = 7;

/** Slot 0 is the buddy. Only the party earns. */
export const PARTY_SIZE = 5;

export const MAX_LEVEL = 50;

/** Highest first; a day pays the first tier its rate reaches. */
const TIERS: [rate: number, exp: number][] = [
  [1, 50],
  [QUALIFYING_RATE, 35],
  [0.6, 20],
];

export function payout(completed: number, scheduled: number): number {
  if (scheduled === 0) return 0;
  const rate = completed / scheduled;
  return TIERS.find(([floor]) => rate >= floor)?.[1] ?? 0;
}

/** Total exp at which `level` is reached. */
export function expForLevel(level: number): number {
  return 6 * (level - 1) ** 2;
}

export function creatureLevel(exp: number): number {
  return Math.min(MAX_LEVEL, Math.floor(Math.sqrt(exp / 6)) + 1);
}

/** Index into `line.forms`. */
export function stageAt(line: Line, level: number): number {
  return line.evolvesAt.filter((at) => level >= at).length;
}

export function movesAt(line: Line, level: number): Move[] {
  return line.moves.filter((move) => level >= move.level);
}

export function lineOf(id: string): Line | undefined {
  return LINES.find((line) => line.id === id);
}

export function formFor(line: Line, exp: number): Creature {
  return line.forms[stageAt(line, creatureLevel(exp))];
}

export { COGLINGS, CREATURES, LINES, STARTERS };

/** What `/api/creatures` answers with. Written only by the server (§13.18). */
export type OwnedCreature = { line: string; exp: number; slot: number | null };

export type CreatureState = {
  /** In dex order. */
  creatures: OwnedCreature[];
  goodDays: number;
  /** The latest claimed day, for "today so far". */
  lastDay: {
    day: DayKey;
    completed: number;
    scheduled: number;
    expPaid: number;
  } | null;
};

export type ClaimResult = CreatureState & {
  /** Paid to each member of the party by this claim. */
  gained: number;
  found: string[];
};

export type Evolution = { line: string; from: number; to: number };

/**
 * Compares each creature's stage with the one this device last showed, so an
 * evolution plays once per device wherever it happened. A creature never seen
 * here is recorded as it is: arriving evolved is not evolving.
 */
export function noticeEvolutions(
  seen: Record<string, number>,
  creatures: OwnedCreature[],
): { seen: Record<string, number>; evolutions: Evolution[] } {
  const next = { ...seen };
  const evolutions: Evolution[] = [];
  for (const { line: id, exp } of creatures) {
    const line = lineOf(id);
    if (!line) continue;
    const stage = stageAt(line, creatureLevel(exp));
    const before = seen[id];
    if (before !== undefined && stage > before)
      evolutions.push({ line: id, from: before, to: stage });
    next[id] = Math.max(stage, before ?? 0);
  }
  return { seen: next, evolutions };
}

/** One line per thing worth saying about a claim, in the order it happened. */
export function claimNews(
  before: CreatureState | null,
  after: ClaimResult,
): string[] {
  if (after.gained === 0 && after.found.length === 0) return [];
  const news = after.gained > 0 ? [`+${after.gained} exp`] : [];

  for (const was of before?.creatures ?? []) {
    const now = after.creatures.find((c) => c.line === was.line);
    const line = lineOf(was.line);
    if (!now || !line) continue;
    // By the form it is now, which an evolution has just shown by name.
    const name = formFor(line, now.exp).name;
    const [from, to] = [creatureLevel(was.exp), creatureLevel(now.exp)];
    if (to > from) news.push(`${name} reached Lv ${to}`);
    for (const move of movesAt(line, to).slice(movesAt(line, from).length))
      news.push(`${name} learned ${move.name}`);
  }

  for (const id of after.found) {
    const line = lineOf(id);
    if (line) news.push(`You found ${line.forms[0].name}!`);
  }
  return news;
}

const FORM_FOR_SKIN: Partial<Record<Skin, string>> = {
  blocks: "blockog",
  grid: "latticog",
};

const foundKey = (id: string) => `openhabits:found:${id}`;

/**
 * Cogling's line is found by acts, not a history, so it is stored, on this device
 * only: settings open at all finds Cogling, and open in a skin finds that form.
 */
export function findCogling(skin: Skin): void {
  for (const id of ["cogling", FORM_FOR_SKIN[skin]]) {
    try {
      if (id) localStorage.setItem(foundKey(id), "1");
    } catch {
      // Storage disabled: found again on the next visit.
    }
  }
}

export function isFound(id: string): boolean {
  try {
    return localStorage.getItem(foundKey(id)) === "1";
  } catch {
    return false;
  }
}
