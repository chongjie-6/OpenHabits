"use client";

import { useMemo, useState } from "react";
import { habitColor } from "@/lib/colors";
import {
  addDays,
  formatDayFull,
  parseDayKey,
  startOfWeek,
  weekdayInitials,
} from "@/lib/dates";
import { habitsForDay, type HabitDayState } from "@/lib/history";
import { toggleEntry, useHapi } from "@/lib/store";
import { useToday } from "@/lib/use-today";
import type { DayKey } from "@/lib/types";

export default function WeekPage() {
  const { hydrated, habits, entries, settings } = useHapi();
  const today = useToday(settings.dayStartHour);
  const [offset, setOffset] = useState(0);

  const view = useMemo(() => {
    if (!hydrated || !today) return null;

    const day = today;
    const weekStart = addDays(startOfWeek(day, settings.weekStartsOn), offset * 7);
    const days = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));

    // One pass per day; each row then reads its own habit out of the result.
    const byDay = new Map<DayKey, Map<string, HabitDayState>>();
    for (const d of days) {
      const states = habitsForDay(habits, entries, d, settings.weekStartsOn);
      byDay.set(d, new Map(states.map((s) => [s.habit.id, s])));
    }

    const totals = days.map((d) => {
      const states = [...(byDay.get(d)?.values() ?? [])].filter((s) => s.scheduled);
      const done = states.filter((s) => s.done).length;
      return states.length === 0 ? null : done / states.length;
    });

    return { day, weekStart, days, byDay, totals };
  }, [hydrated, today, habits, entries, settings, offset]);

  if (!view) return <Skeleton />;

  const { day, weekStart, days, byDay, totals } = view;
  const initials = weekdayInitials(settings.weekStartsOn);

  return (
    <section className="space-y-4">
      <header className="flex items-center justify-between gap-2">
        <h1 className="text-[15px] font-semibold tracking-tight">
          {offset === 0 ? "This week" : rangeLabel(weekStart)}
        </h1>
        <div className="flex items-center gap-1">
          <NavButton label="Previous week" onClick={() => setOffset((o) => o - 1)}>
            ‹
          </NavButton>
          {offset !== 0 && (
            <button
              type="button"
              onClick={() => setOffset(0)}
              className="h-9 rounded-control px-2 text-[12px] text-muted hover:text-foreground"
            >
              Today
            </button>
          )}
          <NavButton
            label="Next week"
            disabled={offset >= 0}
            onClick={() => setOffset((o) => Math.min(0, o + 1))}
          >
            ›
          </NavButton>
        </div>
      </header>

      {habits.length === 0 ? (
        <p className="rounded-card border border-dashed border-border px-4 py-8 text-center text-[13px] text-muted">
          Add a habit on the Today tab to start filling this in.
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full border-separate border-spacing-0">
            <thead>
              <tr>
                <th className="w-full px-1 pb-2 text-left text-[11px] font-semibold uppercase tracking-[0.08em] text-muted">
                  Habit
                </th>
                {days.map((d, i) => (
                  <th key={d} className="w-10 pb-2 text-center">
                    <span
                      className={`block text-[10px] font-medium uppercase ${
                        d === day ? "text-accent" : "text-muted"
                      }`}
                    >
                      {initials[i]}
                    </span>
                    <span
                      className={`block font-mono text-[11px] tabular-nums ${
                        d === day ? "font-semibold text-accent" : "text-muted"
                      }`}
                    >
                      {parseDayKey(d).d}
                    </span>
                  </th>
                ))}
              </tr>
            </thead>

            <tbody>
              {habits.map((habit) => (
                <tr key={habit.id}>
                  <td className="max-w-0 py-1 pr-2">
                    <span className="flex items-center gap-2">
                      <span aria-hidden="true">{habit.emoji}</span>
                      <span className="truncate text-[13px]">{habit.name}</span>
                    </span>
                  </td>
                  {days.map((d) => {
                    const state = byDay.get(d)?.get(habit.id);
                    return (
                      <td key={d} className="py-1 text-center">
                        <Cell state={state} day={d} today={day} habit={habit.color} />
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>

            <tfoot>
              <tr>
                <td className="pt-2 text-[11px] font-semibold uppercase tracking-[0.08em] text-muted">
                  Day
                </td>
                {totals.map((total, i) => (
                  <td
                    key={days[i]}
                    className="pt-2 text-center font-mono text-[10px] tabular-nums text-muted"
                  >
                    {days[i] > day || total === null ? "–" : `${Math.round(total * 100)}%`}
                  </td>
                ))}
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </section>
  );
}

function Cell({
  state,
  day,
  today,
  habit,
}: {
  state: HabitDayState | undefined;
  day: DayKey;
  today: DayKey;
  habit: Parameters<typeof habitColor>[0];
}) {
  const future = day > today;

  // The habit did not exist on this day. Nothing to show and nothing to fix.
  if (!state) {
    return <span className="inline-block h-9 w-9" aria-hidden="true" />;
  }

  const accent = habitColor(habit);
  const label = `${state.habit.name}, ${formatDayFull(day)}${
    state.done ? ", done" : state.scheduled ? ", not done" : ", not scheduled"
  }`;

  return (
    <button
      type="button"
      disabled={future}
      onClick={() => toggleEntry(state.habit.id, day)}
      aria-label={label}
      aria-pressed={state.done}
      className="inline-flex h-9 w-9 items-center justify-center rounded-control disabled:cursor-default"
    >
      <span
        key={state.count}
        className={`${state.done ? "animate-pop" : ""} flex h-6 w-6 items-center justify-center rounded-md border-2 text-[10px] font-mono tabular-nums`}
        style={{
          borderColor: state.done
            ? accent
            : state.scheduled
              ? "var(--border)"
              : "transparent",
          background: state.done ? accent : "transparent",
          color: state.done ? "var(--surface)" : "var(--muted)",
          opacity: future ? 0.35 : state.scheduled ? 1 : 0.5,
        }}
      >
        {state.done ? (
          state.habit.target > 1 ? (
            state.count
          ) : (
            <svg
              width="13"
              height="13"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="3.5"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <path d="M20 6 9 17l-5-5" />
            </svg>
          )
        ) : state.scheduled ? (
          state.count > 0 ? (
            state.count
          ) : null
        ) : (
          <span className="h-1 w-1 rounded-full bg-current" aria-hidden="true" />
        )}
      </span>
    </button>
  );
}

function NavButton({
  label,
  onClick,
  disabled,
  children,
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      className="flex h-9 w-9 items-center justify-center rounded-control border border-border text-muted disabled:opacity-30"
    >
      {children}
    </button>
  );
}

function rangeLabel(weekStart: DayKey): string {
  const end = addDays(weekStart, 6);
  return `${formatDayFull(weekStart).replace(/,? \d{4}$/, "")} – ${formatDayFull(end)}`;
}

function Skeleton() {
  return (
    <div className="space-y-3" aria-hidden="true">
      <div className="h-4 w-28 rounded bg-surface-2" />
      <div className="h-56 rounded-card bg-surface-2" />
    </div>
  );
}
