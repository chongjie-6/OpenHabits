/**
 * The fact corpus, bound to the deck. See DESIGN.md §5.3.
 *
 * Shaped exactly like `lib/quotes.ts`: the selection lives in `lib/deck.ts` and
 * the two corpora differ only in their contents and their tag union.
 */

import { FACTS } from "@/data/facts";
import { itemForDay, seamWindow } from "./deck";
import type { DayKey, Fact, FactTag } from "./types";

/**
 * Filter the corpus by tag. An empty selection means "everything", and so does
 * a selection this corpus has none of — see `Settings.dailyTags`, which holds
 * one flat list for both corpora.
 *
 * `readonly string[]` rather than the tag union: the caller is the synced
 * settings blob, whose contents a device on an older build cannot be trusted to
 * have narrowed. Membership is decided here, by intersection.
 */
export function deckFor(tags: readonly string[] = []): Fact[] {
  if (tags.length === 0) return FACTS;
  const wanted = new Set<string>(tags);
  const filtered = FACTS.filter((f) => f.tags.some((t) => wanted.has(t)));
  return filtered.length > 0 ? filtered : FACTS;
}

/** The fact for a given day. */
export function factForDay(day: DayKey, deck: Fact[] = FACTS): Fact {
  return itemForDay(day, deck);
}

export const FACT_TAGS: FactTag[] = [
  "space",
  "earth",
  "ocean",
  "animals",
  "body",
  "language",
  "history",
  "numbers",
  "technology",
  "food",
];

export const FACT_COUNT = FACTS.length;

/** The guaranteed minimum number of days between two showings of a fact. */
export const MIN_REPEAT_GAP = seamWindow(FACTS.length);
