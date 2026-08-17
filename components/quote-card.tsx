"use client";

import { quoteForDay } from "@/lib/quotes";
import { toggleFavourite, useHapi } from "@/lib/store";
import { useToday } from "@/lib/use-today";

/**
 * The hero. See DESIGN.md §5.1.
 *
 * The day is resolved on the client, not the server. This page prerenders to
 * static HTML, so a server-computed date would pin every visitor to the *build*
 * day's quote and then visibly swap it at hydration — and even request-time
 * rendering would be stale the moment the service worker served the page from
 * cache. Showing the wrong quote and correcting it is worse than showing none
 * for a beat, so the card renders a fixed-height placeholder until mount. The
 * selection itself is pure and synchronous, so it lands on the first client
 * render rather than waiting on IndexedDB.
 */
export function QuoteCard() {
  const { settings } = useHapi();
  const day = useToday(settings.dayStartHour);

  if (!day) return <QuoteCardPlaceholder />;

  const quote = quoteForDay(day);
  const saved = settings.favourites.includes(quote.id);

  return (
    <figure className="rounded-card border border-border bg-surface p-5 shadow-sm">
      <blockquote className="font-serif text-[19px] leading-[1.55] text-foreground">
        {quote.text}
      </blockquote>

      <figcaption className="mt-4 flex items-end justify-between gap-3">
        <div className="min-w-0">
          <cite className="block text-[11px] font-semibold not-italic uppercase tracking-[0.08em] text-muted">
            {quote.author}
          </cite>
          {quote.source && (
            <p className="mt-0.5 truncate text-[11px] text-muted">{quote.source}</p>
          )}
        </div>

        <button
          type="button"
          onClick={() => toggleFavourite(quote.id)}
          aria-pressed={saved}
          aria-label={saved ? "Remove from collection" : "Save to collection"}
          className="-m-2 flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-muted transition-colors hover:text-accent"
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
            className={saved ? "text-accent" : undefined}
          >
            <path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1-1.1a5.5 5.5 0 0 0-7.8 7.8l1.1 1L12 21l7.7-7.6 1.1-1a5.5 5.5 0 0 0 0-7.8Z" />
          </svg>
        </button>
      </figcaption>

      {quote.note && (
        <p className="mt-3 border-t border-border pt-3 text-[11px] leading-relaxed text-muted">
          {quote.note}
        </p>
      )}
    </figure>
  );
}

/** Holds the card's footprint so the page does not shift when the quote lands. */
function QuoteCardPlaceholder() {
  return (
    <div
      aria-hidden="true"
      className="min-h-[164px] rounded-card border border-border bg-surface p-5"
    >
      <div className="space-y-2.5">
        <div className="h-4 w-full rounded bg-surface-2" />
        <div className="h-4 w-11/12 rounded bg-surface-2" />
        <div className="h-4 w-2/3 rounded bg-surface-2" />
      </div>
      <div className="mt-6 h-3 w-24 rounded bg-surface-2" />
    </div>
  );
}
