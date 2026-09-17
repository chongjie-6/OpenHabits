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
import type { DayKey } from "@/lib/types";
import { useHorizontalDrag } from "@/lib/use-drag";
import { useToday } from "@/lib/use-today";

/**
 * The browsed day's week, one circle per day; pressing one browses to it.
 *
 * It follows the browsed day rather than today, so stepping past Sunday with the
 * arrows or a swipe turns the strip over to the next week with it.
 *
 * Its own arrows and drag move a whole week, where the list's swipe moves a day.
 * The two never compete for a gesture: the strip sits in a different slot from
 * the list, so a gesture lands on one or the other. Moving by seven keeps the
 * weekday.
 *
 * The range above the circles is there because a gesture can change the week
 * without the user meaning to look. "This week" goes to today rather than to
 * the same weekday, matching the list's "Today"; the row is always rendered so
 * the button appearing does not move the page.
 *
 * It is the one element that takes the touch axes away from the browser.
 * Nothing inside it scrolls sideways, so the objection in DESIGN.md §6.8 does
 * not reach it, and without the claim a thumb drifting downwards turns the
 * touch into a page scroll, which cancels the pointer and loses the gesture
 * before it can be read. The price is that the strip cannot be dragged to
 * scroll the page.
 *
 * `pinch-zoom` and not `pan-x pinch-zoom`: `pan-x` says the browser may pan
 * horizontally here, and it takes that permission as soon as the gesture is
 * plainly horizontal — cancelling the pointer mid-drag even with nothing to
 * pan, which is every drag this row exists for. Zoom is left alone because it
 * is nobody's navigation gesture.
 *
 * It is also the one surface that follows the finger (`lib/use-drag.ts`), and
 * the one that accepts a mouse drag, for the reasons stated there. A drag
 * carries the weeks on either side in with it: they are mounted only while one
 * is in progress, sit outside the clip where nothing can reach them, and are
 * what the row is dragged *towards* — an abandoned drag springs back, a
 * committed one slides the neighbour into place and only then changes the day.
 *
 * A week that turns over any other way — the arrows, a circle, the list's own
 * swipe crossing a boundary — still arrives with the fade-and-slide, and its
 * direction comes from comparing the weeks rather than from any handler.
 */
export function WeekStrip() {
  const { hydrated, settings } = useOpenHabits();
  const today = useToday(settings.dayStartHour);
  const { offset, setOffset } = useBrowseDay();

  // A committed drag animates the neighbour into place first and moves the day
  // when that finishes, so the week never changes under a row still in motion.
  const [settling, setSettling] = useState<"next" | "prev" | null>(null);
  const drag = useHorizontalDrag((direction) =>
    setSettling(direction === "left" ? "next" : "prev"),
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
    // A settled drag has already shown the week arriving; playing the slide on
    // top of it would move the same row twice. Anything else — an arrow, a
    // circle, the list crossing a boundary — still gets it.
    setTurn(
      settling || !shown || !start ? null : start > shown ? "next" : "prev",
    );
    setShown(start);
    // Whatever changed the week ended the settle, including a press on a circle
    // landing mid-slide: the row is remounted at rest and the transition that
    // would have finished it never fires.
    setSettling(null);
  }

  // A drag takes the animation class off the row to move it by hand, and
  // putting a class back restarts its animation — so a week turned over by the
  // list, then dragged and let go of, would replay a slide it already played.
  // Spending the turn when the drag claims the row is what stops that.
  if (drag.dragging && turn !== null) setTurn(null);

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

  const moving = drag.dragging || settling !== null;
  // A week away is one row width plus the gutter, which is the `pr-2`/`pl-2`
  // holding the neighbours off the row on screen. The two are the same 0.5rem.
  const transform = drag.dragging
    ? `translateX(${drag.dx}px)`
    : settling === "next"
      ? "translateX(calc(-100% - 0.5rem))"
      : settling === "prev"
        ? "translateX(calc(100% + 0.5rem))"
        : undefined;

  return (
    <nav
      aria-label="Week"
      className="touch-pinch-zoom select-none"
      // A new gesture during the settle would replace the transform the
      // transition is running, and the week would never change hands.
      {...(settling ? {} : drag.handlers)}
    >
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
        {/* `clip` rather than `hidden`: a dragged row must not reach past the
          arrows, and `hidden` would make this a scroll container — which the
          drag hook reads as a surface that scrolls sideways on its own. The
          padding, pulled back by an equal negative margin, is what keeps a
          circle's focus ring out of the clip at either end — `clip` on one
          axis makes the browser ignore `overflow-clip-margin`. */}
        <div className="-mx-1 min-w-0 flex-1 overflow-x-clip px-1">
          {/* Keyed on the week so the arriving row mounts at rest: without that
            the settle's transform would transition back to nothing on the
            handover, and the week would slide in and then straight back out. */}
          <div
            key={start}
            style={{ transform }}
            onTransitionEnd={(event) => {
              if (event.target !== event.currentTarget) return;
              if (event.propertyName !== "transform" || !settling) return;
              setOffset((o) => o + (settling === "next" ? 7 : -7));
            }}
            className={`relative ${drag.dragging ? "" : "transition-week"}`}
          >
            {/* Mounted only for the length of a gesture, and outside the clip:
              hidden from the accessibility tree and inert, because a drag is
              not how a screen reader or a keyboard reaches another week. */}
            {moving && (
              <>
                <div
                  aria-hidden="true"
                  inert
                  className="absolute inset-y-0 right-full w-full pr-2"
                >
                  <WeekRow
                    start={addDays(start, -7)}
                    today={today}
                    day={day}
                    initials={initials}
                    onSelect={setOffset}
                  />
                </div>
                <div
                  aria-hidden="true"
                  inert
                  className="absolute inset-y-0 left-full w-full pl-2"
                >
                  <WeekRow
                    start={addDays(start, 7)}
                    today={today}
                    day={day}
                    initials={initials}
                    onSelect={setOffset}
                  />
                </div>
              </>
            )}
            <WeekRow
              className={drag.dragging ? "" : turning}
              start={start}
              today={today}
              day={day}
              initials={initials}
              onSelect={setOffset}
            />
          </div>
        </div>
        <WeekButton label="Next week" onClick={() => setOffset(offset + 7)}>
          ›
        </WeekButton>
      </div>
    </nav>
  );
}

function WeekRow({
  start,
  today,
  day,
  initials,
  onSelect,
  className = "",
}: {
  start: DayKey;
  today: DayKey;
  day: DayKey;
  initials: string[];
  onSelect: (offset: number) => void;
  className?: string;
}) {
  return (
    <ol className={`grid grid-cols-7 gap-1 ${className}`}>
      {initials.map((initial, i) => {
        const key = addDays(start, i);
        const selected = key === day;
        const isToday = key === today;
        return (
          <li key={key}>
            <button
              type="button"
              onClick={() => onSelect(daysBetween(today, key))}
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
