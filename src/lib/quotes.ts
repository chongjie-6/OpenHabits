/**
 * The daily quote: a deterministic deck shuffle keyed off the calendar date.
 *
 * The corpus is a deck of cards. Day 0 turns over the top card, day 1 the next,
 * and after 168 days the deck is exhausted, reshuffled with a new seed, and dealt
 * again. That gives three properties for free:
 *
 *   - **No repeats until the corpus is exhausted** — a deck is a permutation.
 *   - **Identical on every device** — the shuffle is seeded by the cycle number,
 *     not by a clock, a random source, or anything device-local.
 *   - **Zero network** — it is arithmetic, computed the same offline as online.
 *
 * The flaw a naive deck-per-cycle has is the **seam**. Two consecutive decks are
 * shuffled independently, so a quote can sit at the end of one and the start of
 * the next — the same line two mornings running. Less obviously, the whole tail
 * of one deck overlaps the whole head of the next, so *any* window that straddles
 * a seam can repeat, not just the boundary itself. `repairSeam` widens the fix
 * from "not twice in a row" to "never twice inside `MIN_GAP` days".
 *
 * Note what cannot be promised: a strict "no repeat within 168 days" for every
 * rolling window would force every cycle to deal the identical order (positions
 * would have to be non-decreasing across cycles, forever), which is a fixed loop,
 * not a shuffle. A per-cycle permutation plus a hard minimum gap is the useful
 * trade.
 */

import { addDays, diffDays } from './date'
import { QUOTES } from './quotes-data'
import type { ISODate, Quote } from './types'

export { QUOTES, QUOTE_TAGS } from './quotes-data'

/** Day 0 of the very first deck. Fixed forever: moving it reshuffles history. */
export const QUOTE_EPOCH: ISODate = '2024-01-01'

const N = QUOTES.length

const QUOTE_BY_ID = new Map<number, Quote>(QUOTES.map((q) => [q.id, q]))

/** mulberry32 — small, fast, and well-distributed enough to shuffle a deck. */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** Spread consecutive cycle numbers into unrelated seeds. */
function seedForCycle(cycle: number): number {
  let h = (cycle ^ 0x9e3779b9) >>> 0
  h = Math.imul(h ^ (h >>> 16), 0x85ebca6b)
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35)
  return (h ^ (h >>> 16)) >>> 0
}

/** The unrepaired shuffle for a cycle. Pure function of the cycle number. */
function rawDeck(cycle: number): number[] {
  const rand = mulberry32(seedForCycle(cycle))
  const deck = QUOTES.map((q) => q.id)
  for (let i = deck.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1))
    ;[deck[i], deck[j]] = [deck[j], deck[i]]
  }
  return deck
}

/**
 * The guaranteed minimum number of days between two appearances of one quote.
 * Scaled down for tiny corpora so the repair always has somewhere to swap to.
 */
export const MIN_GAP = Math.min(30, Math.floor(N / 3))

/**
 * Push any quote that the previous cycle dealt recently out of this cycle's
 * opening stretch, so no quote reappears within `MIN_GAP` days.
 *
 * Both ends of every swap stay inside `[0, N - MIN_GAP)`, which is what keeps
 * this non-recursive: a repaired deck's last `MIN_GAP` cards are always its raw
 * deck's last `MIN_GAP` cards, so cycle c only needs `rawDeck(c - 1)` and never
 * the *repaired* deck before it. Drop that rule and every deck would depend on
 * every deck before it, all the way back to the epoch.
 */
function repairSeam(deck: number[], previous: number[]): number[] {
  if (MIN_GAP < 1) return deck

  // How many days before this deck's first card each recent quote was dealt.
  // 1 = yesterday (the previous deck's last card).
  const daysAgo = new Map<number, number>()
  for (let i = 0; i < MIN_GAP; i++) daysAgo.set(previous[N - 1 - i], i + 1)

  const tooSoon = (id: number, pos: number) => {
    const ago = daysAgo.get(id)
    return ago !== undefined && ago + pos < MIN_GAP
  }

  const out = deck.slice()
  for (let p = 0; p < MIN_GAP; p++) {
    if (!tooSoon(out[p], p)) continue
    // Any slot at or past MIN_GAP is far enough away to receive the displaced
    // card; scan for the first one whose own card is safe to bring forward.
    for (let s = MIN_GAP; s < N - MIN_GAP; s++) {
      if (tooSoon(out[s], p)) continue
      ;[out[p], out[s]] = [out[s], out[p]]
      break
    }
  }
  return out
}

const deckCache = new Map<number, number[]>()

/** The dealt order for a cycle, seam-repaired against the cycle before it. */
export function deckFor(cycle: number): number[] {
  const cached = deckCache.get(cycle)
  if (cached) return cached
  const deck = repairSeam(rawDeck(cycle), rawDeck(cycle - 1))
  // A handful of cycles is all any screen ever touches; keep the cache honest.
  if (deckCache.size > 8) deckCache.clear()
  deckCache.set(cycle, deck)
  return deck
}

/** Which cycle a date falls in, and how far into that cycle's deck it is. */
function positionOf(date: ISODate): { cycle: number; pos: number } {
  const dayIndex = diffDays(QUOTE_EPOCH, date)
  const cycle = Math.floor(dayIndex / N)
  return { cycle, pos: dayIndex - cycle * N }
}

/** The quote for a given day. Same answer on every device, forever. */
export function quoteForDate(date: ISODate): Quote {
  const { cycle, pos } = positionOf(date)
  return QUOTE_BY_ID.get(deckFor(cycle)[pos])!
}

/**
 * The next day this quote comes up, at or after `from`.
 *
 * Costs at most two deck builds: it is either still ahead in the current deck,
 * or it is somewhere in the next one.
 */
export function nextAppearance(quoteId: number, from: ISODate): ISODate {
  const { cycle, pos } = positionOf(from)
  const idx = deckFor(cycle).indexOf(quoteId)
  if (idx >= pos) return addDays(from, idx - pos)
  const nextIdx = deckFor(cycle + 1).indexOf(quoteId)
  return addDays(from, N - pos + nextIdx)
}
