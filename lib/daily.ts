/**
 * The daily card's corpus, whichever one is selected. See DESIGN.md §5.3.
 *
 * Quotes and facts are separate corpora with separate tag unions, and this is
 * the one module that knows both. Everything downstream — the card, the
 * collection, the settings footer — reads a `DailyItem` and never learns which
 * corpus produced it, which is what keeps the two skins' markup from growing a
 * second variant apiece.
 *
 * The two decks run independently (`lib/deck.ts`), so switching modes lands you
 * mid-sequence in the other rather than restarting it: the sequence is a pure
 * function of the date, and the date does not care what you were reading
 * yesterday.
 */

import { FACTS } from "@/data/facts";
import { QUOTES } from "@/data/quotes";
import { itemForDay, seamWindow, upcomingSchedule } from "./deck";
import { deckFor as factDeckFor, FACT_TAGS } from "./facts";
import { deckFor as quoteDeckFor, QUOTE_TAGS } from "./quotes";
import type { DailyMode, DayKey, Fact, Quote } from "./types";

/**
 * A quote or a fact, flattened for display.
 *
 * `byline` is the line under the text and is always present — an author for a
 * quote, the source for a fact, which is the only attribution a fact has.
 * `detail` is the second line, which only a quote with a source has.
 */
export type DailyItem = {
  id: string;
  text: string;
  byline: string;
  detail?: string;
  note?: string;
  tags: string[];
};

function fromQuote(quote: Quote): DailyItem {
  return {
    id: quote.id,
    text: quote.text,
    byline: quote.author,
    detail: quote.source,
    note: quote.note,
    tags: quote.tags,
  };
}

function fromFact(fact: Fact): DailyItem {
  return {
    id: fact.id,
    text: fact.text,
    byline: fact.source,
    note: fact.note,
    tags: fact.tags,
  };
}

/** The whole corpus for a mode, in corpus order rather than deck order. */
export function corpusFor(mode: DailyMode): DailyItem[] {
  return mode === "facts" ? FACTS.map(fromFact) : QUOTES.map(fromQuote);
}

/**
 * The deck a mode actually draws from, once `Settings.dailyTags` has been
 * applied. A separate idea from `corpusFor`, which is everything there is to
 * browse: the collection still shows the whole shelf while the card reads from
 * the narrowed pile.
 *
 * Every function that answers a question *about the sequence* — what shows
 * today, when a given item comes round, how long the gap is — has to be given
 * the same tags, or the collection's schedule column starts describing a deck
 * the card is not using.
 */
function deckFor(mode: DailyMode, tags: readonly string[] = []): Quote[] | Fact[] {
  return mode === "facts" ? factDeckFor(tags) : quoteDeckFor(tags);
}

export function dailyForDay(
  day: DayKey,
  mode: DailyMode,
  tags: readonly string[] = [],
): DailyItem {
  return mode === "facts"
    ? fromFact(itemForDay(day, factDeckFor(tags)))
    : fromQuote(itemForDay(day, quoteDeckFor(tags)));
}

/**
 * When each item in the mode's deck next comes up.
 *
 * Items filtered out have no next appearance and are simply absent from the
 * map — which is what lets the collection sort them to the end and say nothing
 * about a day they will never land on.
 */
export function scheduleFor(
  from: DayKey,
  mode: DailyMode,
  tags: readonly string[] = [],
): Map<string, DayKey> {
  return mode === "facts"
    ? upcomingSchedule(from, factDeckFor(tags))
    : upcomingSchedule(from, quoteDeckFor(tags));
}

/**
 * What to call one of these on screen, in the four grammatical shapes the UI
 * actually needs. Collected here so a new mode cannot be added without someone
 * having to write its nouns down.
 */
export const MODE_COPY: Record<
  DailyMode,
  { one: string; many: string; label: string; hint: string }
> = {
  quotes: {
    one: "quote",
    many: "quotes",
    label: "Quotes",
    hint: "A line from someone worth quoting, every day.",
  },
  facts: {
    one: "fact",
    many: "facts",
    label: "Fun facts",
    hint: "Something true and unlikely, every day.",
  },
};

/** The mode's tag union, as the filter row needs it: strings, in a fixed order. */
export const tagsFor = (mode: DailyMode): string[] =>
  mode === "facts" ? FACT_TAGS : QUOTE_TAGS;

/** Everything in the corpus, filter or no filter — what there is to browse. */
export const countFor = (mode: DailyMode): number =>
  mode === "facts" ? FACTS.length : QUOTES.length;

/** How many of those the card can currently land on. */
export const deckCountFor = (mode: DailyMode, tags: readonly string[] = []): number =>
  deckFor(mode, tags).length;

/**
 * The guaranteed minimum number of days between two showings.
 *
 * Reads the *filtered* deck, because that is the promise the user is actually
 * being made: narrow the tags far enough and the gap shrinks with them, and the
 * settings screen says so rather than repeating a number from the full corpus.
 */
export const repeatGapFor = (mode: DailyMode, tags: readonly string[] = []): number =>
  seamWindow(deckCountFor(mode, tags));

/** Which of a mode's own tags a flat cross-corpus selection actually names. */
export const activeTagsFor = (mode: DailyMode, tags: readonly string[]): string[] => {
  const wanted = new Set<string>(tags);
  return tagsFor(mode).filter((tag) => wanted.has(tag));
};
