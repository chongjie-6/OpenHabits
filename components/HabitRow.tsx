"use client";

import { habitColor, levelColor } from "@/lib/colors";
import type { DayStat, HabitDayState } from "@/lib/history";
import { toggleEntry } from "@/lib/store";
import type { DayKey } from "@/lib/types";

/**
 * The tick target — the single most-used control in the app. See DESIGN.md
 * §6.5 for why there are three of them.
 *
 * One shape per skin: a row (`classic`), a denser row carrying its own recent
 * history (`grid`), and a tile (`blocks`). They live in one file on purpose.
 * What must never differ between them is the mutation, and the way to keep that
 * true is for all three to go through the same `TickTarget`: the whole control
 * is the button, it is at least 44px on its shortest side, and the write is
 * synchronous — no await, no spinner, no disabled state.
 */

function TickTarget({
  state,
  day,
  className,
  children,
}: {
  state: HabitDayState;
  day: DayKey;
  className: string;
  children: React.ReactNode;
}) {
  const { habit, count, done } = state;
  const counted = habit.target > 1;

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
      className={className}
    >
      {children}
    </button>
  );
}

/** Remounting on count change replays the pop — DESIGN.md §6.3. */
function Checkbox({
  count,
  done,
  accent,
  size = 28,
}: {
  count: number;
  done: boolean;
  accent: string;
  size?: number;
}) {
  return (
    <span
      key={count}
      aria-hidden="true"
      className="animate-pop flex shrink-0 items-center justify-center rounded-md border-2 transition-colors"
      style={{
        width: size,
        height: size,
        borderColor: done ? accent : "var(--border)",
        background: done ? accent : "transparent",
      }}
    >
      {done && (
        <svg
          width={size * 0.54}
          height={size * 0.54}
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
  );
}

/** `classic` — emoji, name, checkbox, and a progress hairline when counted. */
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
    <TickTarget
      state={state}
      day={day}
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

      <Checkbox count={count} done={done} accent={accent} />
    </TickTarget>
  );
}

/**
 * `grid` — the same row with its own last-14-days strip and streak.
 *
 * `trail` and `streak` are optional so the row still renders if a caller has
 * not computed them; the emoji goes, because in a dense column the habit's
 * colour bar identifies it faster than a glyph does.
 */
export function HabitRowDense({
  state,
  day,
  trail,
  streak,
  dimmed = false,
}: {
  state: HabitDayState;
  day: DayKey;
  trail?: DayStat[];
  streak?: number;
  dimmed?: boolean;
}) {
  const { habit, count, done } = state;
  const counted = habit.target > 1;
  const accent = habitColor(habit.color);

  return (
    <TickTarget
      state={state}
      day={day}
      className={`flex min-h-[52px] w-full items-center gap-2.5 rounded-control px-3 text-left transition-colors hover:bg-surface-2 ${
        dimmed ? "opacity-55" : ""
      }`}
    >
      <span
        aria-hidden="true"
        className="h-6 w-[3px] shrink-0 rounded-full"
        style={{ background: accent }}
      />

      <span className="min-w-0 flex-1">
        <span
          className={`block truncate text-[14px] ${
            done ? "text-muted line-through decoration-1" : "text-foreground"
          }`}
        >
          {habit.name}
        </span>
        {trail && trail.length > 0 && (
          <span aria-hidden="true" className="mt-1.5 flex gap-[2px]">
            {trail.map((stat) => (
              <span
                key={stat.date}
                className="h-2 w-2 rounded-cell"
                style={{
                  background:
                    stat.level === "rest"
                      ? "var(--surface-2)"
                      : levelColor(stat.level, habit.color),
                }}
              />
            ))}
          </span>
        )}
      </span>

      {streak !== undefined && streak > 0 && (
        <span className="shrink-0 font-mono text-[12px] tabular-nums text-muted">
          {streak}d
        </span>
      )}

      {counted && (
        <span className="w-10 shrink-0 text-right font-mono text-[12px] tabular-nums text-foreground">
          {count}/{habit.target}
        </span>
      )}

      <Checkbox count={count} done={done} accent={accent} />
    </TickTarget>
  );
}

/** Segments a counted habit into `target` marks, up to where they stay hittable. */
const MAX_SEGMENTS = 8;

/**
 * `blocks` — a tile you hit rather than a line you tick.
 *
 * A done tile flips to `--accent-2` wholesale, which is what makes the grid
 * readable at arm's length. The habit's own colour rides a bar across the top
 * of every tile, done or not, so identity survives the flip: filling the tile
 * with an arbitrary habit colour instead would put text on a colour nobody
 * validated it against.
 */
export function HabitTile({
  state,
  day,
  streak,
  dimmed = false,
}: {
  state: HabitDayState;
  day: DayKey;
  streak?: number;
  dimmed?: boolean;
}) {
  const { habit, count, done } = state;
  const counted = habit.target > 1;
  const accent = habitColor(habit.color);

  return (
    <TickTarget
      state={state}
      day={day}
      className={`surface-card flex h-full min-h-[128px] w-full flex-col justify-between gap-2 p-3 text-left transition-colors ${
        done ? "bg-accent-2 text-accent-2-fg" : "bg-surface text-foreground"
      } ${dimmed ? "opacity-55" : ""}`}
    >
      <span className="flex items-start justify-between gap-2">
        <span aria-hidden="true" className="text-[26px] leading-none">
          {habit.emoji}
        </span>
        {counted && (
          <span className="display-type shrink-0 text-[15px] tabular-nums">
            {count}/{habit.target}
          </span>
        )}
      </span>

      <span
        aria-hidden="true"
        className="block h-[3px] w-full shrink-0"
        style={{ background: accent }}
      />

      <span className="block">
        <span className="display-type block text-[14px] leading-[1.1] text-balance">
          {habit.name}
        </span>

        <span className="mt-2 flex items-center justify-between gap-2">
          {counted ? (
            <Segments count={count} target={habit.target} accent={accent} />
          ) : (
            <span className="text-[11px] font-bold tracking-[0.06em] uppercase">
              {streak !== undefined && streak > 0 ? `${streak} days` : "Not yet"}
            </span>
          )}
          {!counted && (
            <Checkbox count={count} done={done} accent={accent} size={28} />
          )}
        </span>
      </span>
    </TickTarget>
  );
}

function Segments({
  count,
  target,
  accent,
}: {
  count: number;
  target: number;
  accent: string;
}) {
  if (target > MAX_SEGMENTS) {
    return (
      <span className="block h-2.5 w-full border-2 border-border">
        <span
          className="block h-full"
          style={{
            width: `${Math.min(100, (count / target) * 100)}%`,
            background: accent,
          }}
        />
      </span>
    );
  }

  return (
    <span aria-hidden="true" className="flex w-full gap-1">
      {Array.from({ length: target }, (_, i) => (
        <span
          key={i}
          className="h-2.5 flex-1 border-2 border-border"
          style={{ background: i < count ? accent : "transparent" }}
        />
      ))}
    </span>
  );
}
