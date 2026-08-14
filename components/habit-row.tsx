"use client";

import { habitColor } from "@/lib/colors";
import type { HabitDayState } from "@/lib/history";
import { toggleEntry } from "@/lib/store";
import type { DayKey } from "@/lib/types";

/**
 * The tick target — the single most-used control in the app.
 *
 * The whole row is the button (56px tall, comfortably past the 44px minimum),
 * and the mutation is synchronous: no await, no spinner, no disabled state.
 */
export function HabitRow({
  state,
  day,
  dimmed = false,
}: {
  state: HabitDayState;
  day: DayKey;
  dimmed?: boolean;
}) {
  const { habit, count, done } = state;
  const counted = habit.target > 1;
  const accent = habitColor(habit.color);

  return (
    <button
      type="button"
      onClick={() => toggleEntry(habit.id, day)}
      aria-pressed={done}
      aria-label={
        counted
          ? `${habit.name}: ${count} of ${habit.target} done`
          : `${habit.name}${done ? ", done" : ", not done"}`
      }
      className={`flex min-h-[56px] w-full items-center gap-3 rounded-control px-3 text-left transition-colors hover:bg-surface-2 ${
        dimmed ? "opacity-55" : ""
      }`}
    >
      <span aria-hidden="true" className="w-6 shrink-0 text-center text-lg">
        {habit.emoji}
      </span>

      <span className="min-w-0 flex-1">
        <span
          className={`block truncate text-[15px] ${
            done ? "text-muted line-through decoration-1" : "text-foreground"
          }`}
        >
          {habit.name}
        </span>
        {counted && (
          <span className="mt-1 block h-1 w-full max-w-[140px] overflow-hidden rounded-full bg-surface-2">
            <span
              className="block h-full rounded-full transition-[width] duration-200"
              style={{
                width: `${Math.min(100, (count / habit.target) * 100)}%`,
                background: accent,
              }}
            />
          </span>
        )}
      </span>

      {counted && (
        <span className="shrink-0 font-mono text-[13px] tabular-nums text-muted">
          {count}/{habit.target}
        </span>
      )}

      {/* Remounting on count change replays the pop — DESIGN.md §6.3. */}
      <span
        key={count}
        aria-hidden="true"
        className="animate-pop flex h-7 w-7 shrink-0 items-center justify-center rounded-md border-2 transition-colors"
        style={{
          borderColor: done ? accent : "var(--border)",
          background: done ? accent : "transparent",
        }}
      >
        {done && (
          <svg
            width="15"
            height="15"
            viewBox="0 0 24 24"
            fill="none"
            stroke="var(--surface)"
            strokeWidth="3.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M20 6 9 17l-5-5" />
          </svg>
        )}
      </span>
    </button>
  );
}
