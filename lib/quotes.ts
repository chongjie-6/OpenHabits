/**
 * Deterministic daily quote selection. See DESIGN.md §5.1.
 *
 * The requirement is "feels chosen": no repeat until the corpus is exhausted,
 * identical output on every device, no server call. `hash(date) % N` fails the
 * first — the birthday problem puts a duplicate within a few weeks — so the
 * corpus is a deck reshuffled once per full pass.
 *
 * The sequence is a pure function of the date, so nothing is persisted,
 * reinstalling does not disturb it, and the archive view is free.
 */

import { QUOTES } from "@/data/quotes";
import { addDays, daysBetween } from "./dates";
import type { DayKey, Quote, QuoteTag } from "./types";

/** Day zero for the deck sequence. Changing this reshuffles everyone's stream. */
const EPOCH: DayKey = "2026-01-01";

/** Small, fast, deterministic 32-bit PRNG. Identical across JS engines. */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return function next() {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Fisher–Yates, driven by the supplied PRNG. Does not mutate the input. */
function shuffle<T>(items: readonly T[], rand: () => number): T[] {
  const out = items.slice();
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/** Spread consecutive cycle numbers across the seed space. */
function seedForCycle(cycle: number): number {
  let h = 0x811c9dc5 ^ cycle;
  h = Math.imul(h ^ (h >>> 16), 0x45d9f3b);
  h = Math.imul(h ^ (h >>> 16), 0x45d9f3b);
  return (h ^ (h >>> 16)) >>> 0;
}

/** How many days at each end of a cycle are protected from repeating. */
const seamWindow = (size: number) => Math.max(1, Math.floor(size / 8));

/**
 * The shuffled deck for one cycle, with the seam repaired.
 *
 * A per-cycle shuffle says nothing about the *join* between passes: a quote near
 * the end of one cycle can land near the start of the next. So anything shown in
 * the closing `k` days of the previous cycle is pushed out of the opening `k`
 * positions of this one.
 *
 * Swap targets come from `[k, size - k)` and never touch the final `k` slots,
 * which is what lets the previous cycle's tail be read off its raw shuffle
 * instead of recursing back through every cycle that ever was.
 */
function deckForCycle(deck: Quote[], cycle: number): Quote[] {
  const shuffled = shuffle(deck, mulberry32(seedForCycle(cycle)));
  const size = shuffled.length;
  const k = seamWindow(size);

  // Too small to protect a seam without the windows overlapping.
  if (size <= 3 * k) return shuffled;

  const previous = shuffle(deck, mulberry32(seedForCycle(cycle - 1)));
  const recent = new Set(previous.slice(size - k).map((quote) => quote.id));

  for (let i = 0; i < k; i++) {
    if (!recent.has(shuffled[i].id)) continue;
    for (let j = k; j < size - k; j++) {
      if (recent.has(shuffled[j].id)) continue;
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
      break;
    }
  }

  return shuffled;
}

/** Filter the corpus by tag. An empty selection means "everything". */
export function deckFor(tags: QuoteTag[] = []): Quote[] {
  if (tags.length === 0) return QUOTES;
  const wanted = new Set(tags);
  const filtered = QUOTES.filter((q) => q.tags.some((t) => wanted.has(t)));
  return filtered.length > 0 ? filtered : QUOTES;
}

/**
 * The quote for a given day. Every quote appears exactly once per pass, and none
 * twice inside any window of `seamWindow(size)` days.
 */
export function quoteForDay(day: DayKey, deck: Quote[] = QUOTES): Quote {
  const size = deck.length;
  if (size === 0) throw new Error("quote deck is empty");

  const index = daysBetween(EPOCH, day);
  // Floor division and a non-negative modulo, so days before EPOCH work too.
  const cycle = Math.floor(index / size);
  const position = ((index % size) + size) % size;

  return deckForCycle(deck, cycle)[position];
}

/**
 * When each quote next comes up, as `quoteId → DayKey` of its first appearance.
 *
 * Scans **two** cycles. `from` is almost always mid-cycle, so a single-cycle
 * window is the tail of one shuffle plus the head of the next — two orderings
 * that overlap arbitrarily, leaving some quotes unreached. Two cycles must
 * contain one whole aligned cycle, and therefore every quote.
 */
export function upcomingSchedule(
  from: DayKey,
  deck: Quote[] = QUOTES,
): Map<string, DayKey> {
  const out = new Map<string, DayKey>();
  for (let i = 0; i < deck.length * 2; i++) {
    const day = addDays(from, i);
    const quote = quoteForDay(day, deck);
    if (!out.has(quote.id)) out.set(quote.id, day);
  }
  return out;
}

export const ALL_TAGS: QuoteTag[] = [
  "discipline",
  "resilience",
  "craft",
  "time",
  "beginning",
  "doubt",
  "simplicity",
  "courage",
  "growth",
];

export const QUOTE_COUNT = QUOTES.length;

/** The guaranteed minimum number of days between two showings of a quote. */
export const MIN_REPEAT_GAP = seamWindow(QUOTES.length);
