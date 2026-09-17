"use client";

import { useState } from "react";
import { useBrowseDay } from "@/components/BrowseDay";
import {
  addDays,
  daysBetween,
  formatDayLong,
  formatWeekRange,
  parseDayKey,
  startOfWeek,
  weekdayInitials,
} from "@/lib/dates";
import { useOpenHabits } from "@/lib/store";
import { useSwipe } from "@/lib/use-swipe";
import { useToday } from "@/lib/use-today";

/**
 * The browsed day's week, one circle per day; pressing one browses to it.
 *
 * It follows the browsed day rather than today, so stepping past Sunday with the
 * arrows or a swipe turns the strip over to the next week with it.
 *
 * Its own arrows and swipe move a whole week, where the list's move a day. The
 * two never compete for a gesture: the strip sits in a different slot from the
 * list, so a swipe lands on one or the other. Moving by seven keeps the weekday.
 *
 * The range above the circles is there because a swipe can change the week
 * without the user meaning to look. "This week" goes to today rather than to
 * the same weekday, matching the list's "Today"; the row is always rendered so
 * the button appearing does not move the page.
 *
 * It is the one element that claims a touch axis. Nothing inside it scrolls
 * sideways, so the objection in DESIGN.md §6.8 does not reach it, and without
 * the claim a thumb drifting downwards turns the touch into a page scroll,
 * which cancels the pointer and loses the swipe before it can be read. The
 * price is that the strip cannot be dragged to scroll the page.
 *
 * A week that turns over slides in from the direction of travel. That direction
 * comes from comparing the weeks rather than from the swipe handler, because
 * the list below turns the strip over too, whenever its own swipe crosses a
 * week boundary.
 */
export function WeekStrip() {
  const { hydrated, settings } = useOpenHabits();
  const today = useToday(settings.dayStartHour);
  const { offset, setOffset } = useBrowseDay();
  const swipe = useSwipe((direction) =>
    setOffset((o) => o + (direction === "left" ? 7 : -7)),
  );

  const start =
    hydrated && today
      ? startOfWeek(addDays(today, offset), settings.weekStartsOn)
      : null;

  // Adjusted during render rather than from an effect, so the arriving week is
  // never painted once in its resting place before it slides. A `DayKey` sorts
  // as a date, which is what decides the direction.
  const [shown, setShown] = useState(start);
  const [turn, setTurn] = useState<"next" | "prev" | null>(null);
  if (shown !== start) {
    setTurn(!shown || !start ? null : start > shown ? "next" : "prev");
    setShown(start);
  }

  // Same height as the real strip, so hydration does not push the page down.
  if (!hydrated || !today || !start) {
    return <div aria-hidden="true" className="h-22" />;
  }

  const day = addDays(today, offset);
  const turning =
    turn === "next"
      ? "animate-week-next"
      : turn === "prev"
        ? "animate-week-prev"
        : "";
  const initials = weekdayInitials(settings.weekStartsOn);
  const thisWeek = start === startOfWeek(today, settings.weekStartsOn);

  return (
    <nav aria-label="Week" className="touch-pan-x touch-pinch-zoom" {...swipe}>
      <div className="flex h-6 items-center justify-between gap-3">
        <p
          aria-live="polite"
          className="font-mono text-[12px] tabular-nums text-muted"
        >
          {formatWeekRange(start)}
        </p>
        {!thisWeek && (
          <button
            type="button"
            onClick={() => setOffset(0)}
            className="h-6 rounded-control px-2 text-[12px] text-muted transition-colors hover:text-foreground"
          >
            This week
          </button>
        )}
      </div>
      <div className="mt-2 flex items-end gap-1">
        <WeekButton label="Previous week" onClick={() => setOffset(offset - 7)}>
          ‹
        </WeekButton>
        {/* Keyed on the week so the slide restarts; the circles inside are
          keyed by day and remount with it either way. */}
        <ol
          key={start}
          className={`${turning} grid min-w-0 flex-1 grid-cols-7 gap-1`}
        >
          {initials.map((initial, i) => {
            const key = addDays(start, i);
            const selected = key === day;
            const isToday = key === today;
            return (
              <li key={key}>
                <button
                  type="button"
                  onClick={() => setOffset(daysBetween(today, key))}
                  aria-label={formatDayLong(key)}
                  aria-pressed={selected}
                  aria-current={isToday ? "date" : undefined}
                  className="group flex w-full flex-col items-center gap-1"
                >
                  <span
                    aria-hidden="true"
                    className={`text-[11px] leading-4 font-semibold ${
                      selected || isToday ? "text-foreground" : "text-muted"
                    }`}
                  >
                    {initial}
                  </span>
                  <span
                    aria-hidden="true"
                    className={`flex aspect-square w-full max-w-9 items-center justify-center rounded-full border font-mono text-[13px] tabular-nums transition-colors ${
                      selected
                        ? "border-accent bg-accent text-accent-fg"
                        : isToday
                          ? "border-accent text-foreground group-hover:bg-surface-2"
                          : "border-border text-foreground group-hover:bg-surface-2"
                    }`}
                  >
                    {parseDayKey(key).d}
                  </span>
                </button>
              </li>
            );
          })}
        </ol>
        <WeekButton label="Next week" onClick={() => setOffset(offset + 7)}>
          ›
        </WeekButton>
      </div>
    </nav>
  );
}

function WeekButton({
  label,
  onClick,
  children,
}: {
  label: string;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      className="flex h-9 w-7 shrink-0 items-center justify-center rounded-control text-muted transition-colors hover:text-foreground"
    >
      {children}
    </button>
  );
}
