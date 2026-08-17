"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { QUOTES } from "@/data/quotes";
import { daysBetween } from "@/lib/dates";
import { ALL_TAGS, MIN_REPEAT_GAP, QUOTE_COUNT, upcomingSchedule } from "@/lib/quotes";
import { toggleFavourite, useHapi } from "@/lib/store";
import { useToday } from "@/lib/use-today";
import type { DayKey, Quote, QuoteTag } from "@/lib/types";

type Tab = "saved" | "all";

export default function QuotesPage() {
  const { hydrated, settings } = useHapi();
  const today = useToday(settings.dayStartHour);

  const [tab, setTab] = useState<Tab>("saved");
  const [query, setQuery] = useState("");
  const [tag, setTag] = useState<QuoteTag | null>(null);

  // Every quote's next appearance, in one pass over a full deck cycle.
  const schedule = useMemo(
    () => (today ? upcomingSchedule(today) : new Map<string, DayKey>()),
    [today],
  );

  const favourites = settings.favourites;
  const saved = useMemo(() => new Set(favourites), [favourites]);

  const results = useMemo(() => {
    const needle = query.trim().toLowerCase();

    return QUOTES.filter((quote) => {
      if (tab === "saved" && !saved.has(quote.id)) return false;
      if (tag && !quote.tags.includes(tag)) return false;
      if (!needle) return true;
      return (
        quote.text.toLowerCase().includes(needle) ||
        quote.author.toLowerCase().includes(needle) ||
        (quote.source?.toLowerCase().includes(needle) ?? false)
      );
    }).sort((a, b) => {
      // Soonest first, so the list reads as "what's coming".
      const dayA = schedule.get(a.id) ?? "9999";
      const dayB = schedule.get(b.id) ?? "9999";
      return dayA < dayB ? -1 : dayA > dayB ? 1 : 0;
    });
  }, [tab, query, tag, schedule, saved]);

  if (!hydrated || !today) return <Skeleton />;

  return (
    <section className="space-y-4">
      <header className="flex items-baseline justify-between gap-3">
        <h1 className="text-[15px] font-semibold tracking-tight">Collection</h1>
        <Link href="/" className="shrink-0 text-[12px] text-muted hover:text-foreground">
          Today&rsquo;s quote →
        </Link>
      </header>

      <div className="flex gap-2">
        <Segment active={tab === "saved"} onClick={() => setTab("saved")}>
          Saved · {settings.favourites.length}
        </Segment>
        <Segment active={tab === "all"} onClick={() => setTab("all")}>
          All · {QUOTE_COUNT}
        </Segment>
      </div>

      <input
        type="search"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Search text, author or source"
        aria-label="Search quotes"
        className="h-11 w-full rounded-control border border-border bg-surface px-3 text-[14px] placeholder:text-muted"
      />

      <div className="flex flex-wrap gap-1.5">
        {ALL_TAGS.map((option) => (
          <button
            key={option}
            type="button"
            aria-pressed={tag === option}
            onClick={() => setTag((current) => (current === option ? null : option))}
            className={`h-8 rounded-full border px-3 text-[12px] capitalize transition-colors ${
              tag === option
                ? "border-accent bg-accent text-accent-fg"
                : "border-border text-muted hover:text-foreground"
            }`}
          >
            {option}
          </button>
        ))}
      </div>

      {results.length === 0 ? (
        <p className="rounded-card border border-dashed border-border px-4 py-8 text-center text-[13px] leading-relaxed text-muted">
          {tab === "saved" && !query && !tag ? (
            <>
              Nothing saved yet. Tap the heart on a quote to keep it.
              <br />
              <button
                type="button"
                onClick={() => setTab("all")}
                className="mt-2 text-accent"
              >
                Browse all {QUOTE_COUNT} instead
              </button>
            </>
          ) : (
            "No quotes match that."
          )}
        </p>
      ) : (
        <ul className="space-y-2">
          {results.map((quote) => (
            <li key={quote.id}>
              <QuoteRow
                quote={quote}
                saved={saved.has(quote.id)}
                showing={schedule.get(quote.id)}
                today={today}
              />
            </li>
          ))}
        </ul>
      )}

      <p className="pb-2 text-[11px] leading-relaxed text-muted">
        Every quote is shown once before any of them comes round again, and none
        can repeat within {MIN_REPEAT_GAP} days. Which quote lands on which day
        is a pure function of the date — identical on every device you own, with
        or without a connection.
      </p>
    </section>
  );
}

function QuoteRow({
  quote,
  saved,
  showing,
  today,
}: {
  quote: Quote;
  saved: boolean;
  showing: DayKey | undefined;
  today: DayKey;
}) {
  return (
    <article className="rounded-card border border-border bg-surface p-4">
      <div className="flex items-start gap-3">
        <blockquote className="min-w-0 flex-1 font-serif text-[15px] leading-normal">
          {quote.text}
        </blockquote>
        <button
          type="button"
          onClick={() => toggleFavourite(quote.id)}
          aria-pressed={saved}
          aria-label={saved ? `Remove ${quote.author} quote` : `Save ${quote.author} quote`}
          className={`-m-1 flex h-10 w-10 shrink-0 items-center justify-center rounded-full transition-colors ${
            saved ? "text-accent" : "text-muted hover:text-accent"
          }`}
        >
          <svg
            width="18"
            height="18"
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
      </div>

      <div className="mt-3 flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <p className="min-w-0">
          <cite className="text-[11px] font-semibold not-italic uppercase tracking-[0.08em] text-muted">
            {quote.author}
          </cite>
          {quote.source && (
            <span className="block text-[11px] text-muted">{quote.source}</span>
          )}
        </p>
        {showing && (
          <span className="shrink-0 font-mono text-[10px] tabular-nums text-muted">
            {relativeDay(today, showing)}
          </span>
        )}
      </div>

      {quote.note && (
        <p className="mt-3 border-t border-border pt-3 text-[11px] leading-relaxed text-muted">
          {quote.note}
        </p>
      )}
    </article>
  );
}

function relativeDay(today: DayKey, day: DayKey): string {
  const delta = daysBetween(today, day);
  if (delta === 0) return "today";
  if (delta === 1) return "tomorrow";
  if (delta < 7) return `in ${delta} days`;
  if (delta < 14) return "next week";
  return `in ${Math.round(delta / 7)} weeks`;
}

function Segment({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`h-10 flex-1 rounded-control border text-[13px] font-medium transition-colors ${
        active ? "border-accent bg-accent text-accent-fg" : "border-border text-muted"
      }`}
    >
      {children}
    </button>
  );
}

function Skeleton() {
  return (
    <div className="space-y-3" aria-hidden="true">
      <div className="h-4 w-28 rounded bg-surface-2" />
      <div className="h-10 rounded-control bg-surface-2" />
      {[0, 1, 2].map((i) => (
        <div key={i} className="h-28 rounded-card bg-surface-2" />
      ))}
    </div>
  );
}
