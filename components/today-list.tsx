"use client";

import { useMemo } from "react";
import Link from "next/link";
import { AddHabit } from "@/components/add-habit";
import { HabitRow } from "@/components/habit-row";
import { levelColor } from "@/lib/colors";
import { addDays, formatDayLong } from "@/lib/dates";
import { buildHistory, habitsForDay } from "@/lib/history";
import { useHapi } from "@/lib/store";
import { computeStreaks } from "@/lib/streaks";
import { useToday } from "@/lib/use-today";

/** How far back to scan for streaks. Beyond this, a streak is its own reward. */
const STREAK_WINDOW = 365;

export function TodayList() {
  const { hydrated, habits, entries, settings } = useHapi();
  const day = useToday(settings.dayStartHour);

  const view = useMemo(() => {
    if (!hydrated || !day) return null;

    const states = habitsForDay(habits, entries, day, settings.weekStartsOn);
    const history = buildHistory(
      habits,
      entries,
      addDays(day, -(STREAK_WINDOW - 1)),
      day,
      settings.weekStartsOn,
    );

    return {
      scheduled: states.filter((s) => s.scheduled),
      unscheduled: states.filter((s) => !s.scheduled),
      streaks: computeStreaks(history),
      recent: history.slice(-7),
    };
  }, [hydrated, day, habits, entries, settings]);

  // Gate every data-dependent subtree on hydration: a checked box that renders
  // unchecked for 200ms reads as data loss. See DESIGN.md §7.1.
  if (!view || !day) return <Skeleton />;

  const { scheduled, unscheduled, streaks, recent } = view;
  const done = scheduled.filter((s) => s.done).length;

  return (
    <section className="mt-6">
      <header className="flex items-baseline justify-between gap-3">
        <h1 className="text-[15px] font-semibold tracking-tight">
          {formatDayLong(day)}
        </h1>
        {scheduled.length > 0 && (
          <p className="shrink-0 font-mono text-[12px] tabular-nums text-muted">
            {done} of {scheduled.length} done
          </p>
        )}
      </header>

      {habits.length === 0 ? (
        <EmptyState />
      ) : (
        <>
          <ul className="mt-2 -mx-3">
            {scheduled.map((state) => (
              <li key={state.habit.id}>
                <HabitRow state={state} day={day} />
              </li>
            ))}
          </ul>

          {unscheduled.length > 0 && (
            <details className="mt-4 -mx-3">
              <summary className="cursor-pointer px-3 text-[11px] font-semibold uppercase tracking-[0.08em] text-muted">
                Not scheduled today ({unscheduled.length})
              </summary>
              <ul className="mt-1">
                {unscheduled.map((state) => (
                  <li key={state.habit.id}>
                    <HabitRow state={state} day={day} dimmed />
                  </li>
                ))}
              </ul>
            </details>
          )}
        </>
      )}

      <AddHabit />

      {habits.length > 0 && (
        <Link
          href="/stats"
          className="mt-6 flex items-center justify-between rounded-card border border-border bg-surface px-4 py-3 transition-colors hover:bg-surface-2"
        >
          <span className="flex items-center gap-1" aria-hidden="true">
            {recent.map((stat) => (
              <span
                key={stat.date}
                className="h-4 w-4 rounded-[3px] border"
                style={{
                  background: levelColor(stat.level),
                  borderColor: stat.level === "rest" ? "var(--border)" : "transparent",
                }}
              />
            ))}
          </span>
          <span className="text-[13px] text-muted">
            {streaks.current > 0 ? (
              <>
                <strong className="font-mono tabular-nums text-foreground">
                  {streaks.current}
                </strong>{" "}
                day streak 🔥
              </>
            ) : (
              "Start a streak today"
            )}
          </span>
        </Link>
      )}
    </section>
  );
}

function EmptyState() {
  return (
    <div className="mt-3 rounded-card border border-dashed border-border px-4 py-8 text-center">
      <p className="text-[15px] font-medium">Nothing to track yet</p>
      <p className="mx-auto mt-1 max-w-xs text-[13px] leading-relaxed text-muted">
        Add one habit you could do today. One is enough to start a grid.
      </p>
    </div>
  );
}

function Skeleton() {
  return (
    <section className="mt-6" aria-hidden="true">
      <div className="h-4 w-40 rounded bg-surface-2" />
      <div className="mt-4 space-y-2">
        {[0, 1, 2].map((i) => (
          <div key={i} className="h-14 rounded-control bg-surface-2" />
        ))}
      </div>
    </section>
  );
}
