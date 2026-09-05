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
import { FACT_TAGS } from "./facts";
import { QUOTE_TAGS } from "./quotes";
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

export function dailyForDay(day: DayKey, mode: DailyMode): DailyItem {
  return mode === "facts"
    ? fromFact(itemForDay(day, FACTS))
    : fromQuote(itemForDay(day, QUOTES));
}

/** When each item in the mode's corpus next comes up. */
export function scheduleFor(from: DayKey, mode: DailyMode): Map<string, DayKey> {
  return mode === "facts"
    ? upcomingSchedule(from, FACTS)
    : upcomingSchedule(from, QUOTES);
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

export const countFor = (mode: DailyMode): number =>
  mode === "facts" ? FACTS.length : QUOTES.length;

/** The guaranteed minimum number of days between two showings, for this mode. */
export const repeatGapFor = (mode: DailyMode): number => seamWindow(countFor(mode));
