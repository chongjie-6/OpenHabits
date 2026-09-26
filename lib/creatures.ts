/**
 * The rules creatures grow by (§5.5), shared by the client and the server so each
 * number is stated once. Only exp is stored; level, form and moves derive from it.
 */

import { COGLINGS, CREATURES, LINES, STARTERS } from "@/data/creatures";
import type { Skin } from "./skin";
import type { Ability, Creature, DayKey, Line, Move, Skill } from "./types";

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

/** Below this rate a day pays nothing. */
export const LOWEST_PAYING_RATE = TIERS[TIERS.length - 1][0];

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

/** Exp still to earn before the next change of form; null once there is none. */
export function expToEvolve(line: Line, exp: number): number | null {
  const next = line.evolvesAt.find((at) => at > creatureLevel(exp));
  return next === undefined ? null : expForLevel(next) - exp;
}

/**
 * The party after `incoming` takes `outgoing`'s seat. From the box, `outgoing`
 * goes to the box; from elsewhere in the party, the two trade seats.
 */
export function swapSeats(
  party: string[],
  incoming: string,
  outgoing: string,
): string[] {
  return party.map((line) =>
    line === outgoing ? incoming : line === incoming ? outgoing : line,
  );
}

export const ABILITIES: Ability[] = ["str", "dex", "con", "int", "wis", "cha"];

export const SKILLS: Record<Skill, Ability> = {
  Acrobatics: "dex",
  "Animal Handling": "wis",
  Arcana: "int",
  Athletics: "str",
  Deception: "cha",
  History: "int",
  Insight: "wis",
  Intimidation: "cha",
  Investigation: "int",
  Medicine: "wis",
  Nature: "int",
  Perception: "wis",
  Performance: "cha",
  Persuasion: "cha",
  Religion: "int",
  "Sleight of Hand": "dex",
  Stealth: "dex",
  Survival: "wis",
};

export function modifier(score: number): number {
  return Math.floor((score - 10) / 2);
}

/** D&D's +2 to +6, stretched from twenty levels over fifty. */
export function proficiency(level: number): number {
  return 2 + Math.floor((level - 1) / 10);
}

/** D&D improves scores every four levels of twenty; this is every eight of fifty. */
const IMPROVEMENT_EVERY = 8;

/**
 * Each improvement adds 1 to the line's two best scores, to D&D's cap of 20 —
 * which the standard array's 15 and 14 reach at the top level.
 */
export function abilityScores(
  line: Line,
  level: number,
): Record<Ability, number> {
  const best = [...ABILITIES]
    .sort((a, b) => line.abilities[b] - line.abilities[a])
    .slice(0, 2);
  const gain = Math.floor(level / IMPROVEMENT_EVERY);
  return Object.fromEntries(
    ABILITIES.map((a) => [
      a,
      Math.min(20, line.abilities[a] + (best.includes(a) ? gain : 0)),
    ]),
  ) as Record<Ability, number>;
}

/** By sprite size: each form's grid is 12, 16 or 20 pixels. */
function sizeOf(form: Creature): { size: string; hitDie: number } {
  const rows = form.sprite.length;
  if (rows <= 12) return { size: "Small", hitDie: 6 };
  if (rows <= 16) return { size: "Medium", hitDie: 8 };
  return { size: "Large", hitDie: 10 };
}

export type StatBlock = {
  size: string;
  level: number;
  proficiency: number;
  scores: Record<Ability, number>;
  armorClass: number;
  hitPoints: number;
  skills: { skill: Skill; bonus: number }[];
};

/**
 * A D&D stat block for a creature at `exp`, derived like everything else about
 * it. Hit points take the hit die's average every level, as D&D's fixed option.
 */
export function statBlock(line: Line, exp: number): StatBlock {
  const level = creatureLevel(exp);
  const scores = abilityScores(line, level);
  const bonus = proficiency(level);
  const { size, hitDie } = sizeOf(formFor(line, exp));
  return {
    size,
    level,
    proficiency: bonus,
    scores,
    armorClass: 10 + modifier(scores.dex),
    hitPoints: Math.max(level, level * (hitDie / 2 + 1 + modifier(scores.con))),
    skills: line.skills.map((skill) => ({
      skill,
      bonus: modifier(scores[SKILLS[skill]]) + bonus,
    })),
  };
}

/** A move's roll at a stat block, e.g. `"+5 to hit · 1d10 + 3 fire"`. Empty for a pure utility. */
export function moveRoll(move: Move, block: StatBlock): string {
  const mod = modifier(block.scores[move.ability]);
  const parts: string[] = [];
  if (move.against === "ac")
    parts.push(`${signed(block.proficiency + mod)} to hit`);
  else if (move.against)
    parts.push(
      `DC ${8 + block.proficiency + mod} ${ABILITY_NAMES[move.against]} save`,
    );
  if (move.dice) {
    const [count, ...kind] = move.dice.split(" ");
    parts.push(
      [
        count,
        mod === 0 ? "" : `${mod > 0 ? "+" : "−"} ${Math.abs(mod)}`,
        ...kind,
      ]
        .filter(Boolean)
        .join(" "),
    );
  }
  return parts.join(" · ");
}

export const ABILITY_NAMES: Record<Ability, string> = {
  str: "Str",
  dex: "Dex",
  con: "Con",
  int: "Int",
  wis: "Wis",
  cha: "Cha",
};

/** With a true minus sign, as D&D prints one. */
export function signed(n: number): string {
  return n < 0 ? `−${-n}` : `+${n}`;
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
