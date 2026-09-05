"use client";

import { dailyForDay, type DailyItem } from "@/lib/daily";
import { useSkin } from "@/lib/skin";
import { toggleFavourite, useOpenHabits } from "@/lib/store";
import { useToday } from "@/lib/use-today";

/**
 * The hero. See DESIGN.md §5.1, §5.3, §6.5.
 *
 * The day is resolved on the client. This page prerenders to static HTML, so a
 * server-computed date would pin every visitor to the *build* day's quote — and
 * even request-time rendering is stale once the service worker serves from cache.
 * Showing the wrong quote and correcting it is worse than showing none for a
 * beat, hence the fixed-height placeholder until mount. The selection itself is
 * pure and synchronous, so it lands on the first client render.
 *
 * That placeholder is also what makes `useSkin` safe here: it reports `classic`
 * until mount, and nothing it decides is rendered until `day` is non-null, by
 * which point it has the real answer. Where the card sits on the page is a
 * separate question, settled in CSS (`app/page.tsx`).
 *
 * Which corpus it draws from is `settings.dailyMode`, and the three skins below
 * never learn the answer — `lib/daily.ts` hands them a flattened item either
 * way. A quote's byline is its author with the source beneath; a fact's byline
 * *is* its source, because that is the only attribution a fact has.
 */
export function DailyCard() {
  const { settings } = useOpenHabits();
  const day = useToday(settings.dayStartHour);
  const skin = useSkin();

  if (!day) return <DailyCardPlaceholder />;

  const item = dailyForDay(day, settings.dailyMode);
  const saved = settings.favourites.includes(item.id);
  const props = { item, saved };

  if (skin === "grid") return <DailyRule {...props} />;
  if (skin === "blocks") return <DailyBlock {...props} />;
  return <DailyCardClassic {...props} />;
}

type Props = { item: DailyItem; saved: boolean };

/** A card, a serif, and room to breathe. */
function DailyCardClassic({ item, saved }: Props) {
  return (
    <figure className="surface-card bg-surface p-5">
      <blockquote className="font-serif text-[19px] leading-[1.55] text-foreground">
        {item.text}
      </blockquote>

      <figcaption className="mt-4 flex items-end justify-between gap-3">
        <div className="min-w-0">
          <cite className="block text-[11px] font-semibold not-italic uppercase tracking-[0.08em] text-muted">
            {item.byline}
          </cite>
          {item.detail && (
            <p className="mt-0.5 truncate text-[11px] text-muted">{item.detail}</p>
          )}
        </div>
        <SaveButton saved={saved} itemId={item.id} />
      </figcaption>

      {item.note && (
        <p className="mt-3 border-t border-border pt-3 text-[11px] leading-relaxed text-muted">
          {item.note}
        </p>
      )}
    </figure>
  );
}

/**
 * `grid` demotes the card to a footnote under the data — no card, no serif,
 * one rule down the left. It sits at the foot of the page, so it has to read as
 * an endnote rather than a second hero.
 */
function DailyRule({ item, saved }: Props) {
  return (
    <figure className="border-l-2 border-border pl-3">
      <blockquote className="text-[13px] leading-[1.5] text-foreground">
        {item.text}
      </blockquote>

      <figcaption className="mt-2 flex items-end justify-between gap-3">
        <div className="min-w-0">
          <cite className="block font-mono text-[10px] font-medium not-italic uppercase tracking-[0.1em] text-muted">
            {item.byline}
            {item.detail && ` · ${item.detail}`}
          </cite>
        </div>
        <SaveButton saved={saved} itemId={item.id} />
      </figcaption>

      {item.note && (
        <p className="mt-2 text-[11px] leading-relaxed text-muted">{item.note}</p>
      )}
    </figure>
  );
}

/**
 * `blocks` inverts it: the one solid mass on a page of outlines. The trio of
 * `--quote-*` tokens exists for this — in the dark theme the page is already
 * near-black, so the block flips to the acid accent instead and the meta line
 * goes dark on it.
 */
function DailyBlock({ item, saved }: Props) {
  return (
    <figure className="bg-quote-bg p-4 text-quote-fg">
      <blockquote className="text-[17px] font-medium leading-[1.34] text-balance">
        {item.text}
      </blockquote>

      <figcaption className="mt-3 flex items-end justify-between gap-3">
        <div className="min-w-0">
          <cite className="display-type block text-[11px] not-italic tracking-[0.08em] text-quote-meta">
            {item.byline}
            {item.detail && ` — ${item.detail}`}
          </cite>
        </div>
        <SaveButton saved={saved} itemId={item.id} tone="quote" />
      </figcaption>

      {item.note && (
        <p className="mt-3 border-t border-quote-meta pt-3 text-[11px] leading-relaxed text-quote-meta">
          {item.note}
        </p>
      )}
    </figure>
  );
}

/**
 * `tone="quote"` is for a skin that paints the card in its own colours: the
 * button has to take its ink from the block it sits on, not from the page.
 */
function SaveButton({
  itemId,
  saved,
  tone = "page",
}: {
  itemId: string;
  saved: boolean;
  tone?: "page" | "quote";
}) {
  const idle = tone === "quote" ? "text-quote-meta" : "text-muted";
  const active = tone === "quote" ? "text-quote-meta" : "text-accent";

  return (
    <button
      type="button"
      onClick={() => toggleFavourite(itemId)}
      aria-pressed={saved}
      aria-label={saved ? "Remove from collection" : "Save to collection"}
      className={`-m-2 flex h-11 w-11 shrink-0 items-center justify-center rounded-full transition-colors hover:text-accent ${
        saved ? active : idle
      }`}
    >
      <svg
        width="20"
        height="20"
        viewBox="0 0 24 24"
        fill={saved ? "currentColor" : "none"}
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1-1.1a5.5 5.5 0 0 0-7.8 7.8l1.1 1L12 21l7.7-7.6 1.1-1a5.5 5.5 0 0 0 0-7.8Z" />
      </svg>
    </button>
  );
}

/**
 * Holds the card's footprint so the page does not shift when the card lands.
 * Sized for the classic card; the other two skins are shorter, so they settle
 * upward rather than pushing the habit list down.
 */
function DailyCardPlaceholder() {
  return (
    <div aria-hidden="true" className="min-h-41 surface-card bg-surface p-5">
      <div className="space-y-2.5">
        <div className="h-4 w-full rounded bg-surface-2" />
        <div className="h-4 w-11/12 rounded bg-surface-2" />
        <div className="h-4 w-2/3 rounded bg-surface-2" />
      </div>
      <div className="mt-6 h-3 w-24 rounded bg-surface-2" />
    </div>
  );
}
