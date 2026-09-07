"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { AddHabit } from "@/components/AddHabit";
import { HabitRow, HabitRowDense, HabitTile } from "@/components/HabitRow";
import { levelColor } from "@/lib/colors";
import {
  addDays,
  formatDayLong,
  formatDayFull,
  formatWeekdayLong,
  relativeDayLabel,
} from "@/lib/dates";
import {
  buildHabitHistory,
  buildHistory,
  habitsForDay,
  type DayStat,
  type HabitDayState,
} from "@/lib/history";
import { useSkin, type Skin } from "@/lib/skin";
import { useOpenHabits } from "@/lib/store";
import { computeStreaks } from "@/lib/streaks";
import { useSwipe } from "@/lib/use-swipe";
import { useToday } from "@/lib/use-today";
import type { DayKey } from "@/lib/types";

/** How far back to scan for streaks. Beyond this, a streak is its own reward. */
const STREAK_WINDOW = 365;

/**
 * Per-habit streaks are scanned over a much shorter window than the aggregate.
 *
 * The aggregate history is one pass over 365 days; per-habit it would be one
 * pass per habit, so the same window would multiply the Today render by the
 * number of habits. 90 days is far more than the badge beside a row can show
 * and keeps the work bounded — a longer per-habit streak still reads correctly
 * on the habit's own screen, which is where the year lives.
 */
const HABIT_STREAK_WINDOW = 90;

/** Days in the strip under a dense row. */
const TRAIL_DAYS = 14;

/** Weeks in the Today heat strip. A full year does not fit a phone unrotated. */
const STRIP_WEEKS = 26;

type PerHabit = { trail: DayStat[]; streak: number };

export function TodayList() {
  const { hydrated, habits, entries, settings } = useOpenHabits();
  const today = useToday(settings.dayStartHour);
  const skin = useSkin();
  const [offset, setOffset] = useState(0);
  const swipe = useSwipe((direction) =>
    setOffset((o) => o + (direction === "left" ? 1 : -1)),
  );

  const day = today === null ? null : addDays(today, offset);

  /**
   * Anchored on `today`, never on the day being browsed. The streak, the heat
   * strip and the per-habit trails are claims about the present: recomputing
   * them as the user swipes would show a streak that was never true, and a day
   * in the future would score every day between here and there as missed.
   *
   * Keeping them in their own memo is also what makes a swipe cheap — the day's
   * states are one pass, where this is a year of them.
   */
  const summary = useMemo(() => {
    if (!hydrated || !today) return null;

    const history = buildHistory(
      habits,
      entries,
      addDays(today, -(STREAK_WINDOW - 1)),
      today,
      settings.weekStartsOn,
    );

    // Only the two skins that show per-habit history pay for computing it.
    const perHabit = new Map<string, PerHabit>();
    if (skin !== "classic") {
      for (const habit of habits) {
        const own = buildHabitHistory(
          habit,
          entries,
          addDays(today, -(HABIT_STREAK_WINDOW - 1)),
          today,
          settings.weekStartsOn,
        );
        perHabit.set(habit.id, {
          trail: own.slice(-TRAIL_DAYS),
          streak: computeStreaks(own).current,
        });
      }
    }

    return {
      streaks: computeStreaks(history),
      recent: history.slice(-7),
      strip: history.slice(-(STRIP_WEEKS * 7)),
      perHabit,
    };
  }, [hydrated, today, habits, entries, settings, skin]);

  const states = useMemo(() => {
    if (!hydrated || !day) return null;
    return habitsForDay(habits, entries, day, settings.weekStartsOn);
  }, [hydrated, day, habits, entries, settings.weekStartsOn]);

  // Gate every data-dependent subtree on hydration: a checked box that renders
  // unchecked for 200ms reads as data loss. See DESIGN.md §7.1. It is also what
  // makes `useSkin` safe here — it reports `classic` until mount, and nothing it
  // decides is rendered before that.
  if (!summary || !states || !day || !today) return <Skeleton />;

  const { streaks, recent, strip, perHabit } = summary;
  const scheduled = states.filter((s) => s.scheduled);
  const unscheduled = states.filter((s) => !s.scheduled);
  const done = scheduled.filter((s) => s.done).length;
  const future = day > today;

  return (
    <section className="mt-6" {...swipe}>
      <Header
        skin={skin}
        day={day}
        today={today}
        done={done}
        total={scheduled.length}
        nav={<DayNav offset={offset} onOffset={setOffset} />}
      />

      {future && (
        <p className="mt-2 text-[12px] text-muted">
          Nothing to tick yet — this day hasn&rsquo;t happened.
        </p>
      )}

      {skin === "grid" && habits.length > 0 && (
        <HeatStrip stats={strip} rate={streaks.completionRate} />
      )}

      {habits.length === 0 ? (
        <EmptyState />
      ) : skin === "blocks" ? (
        <Tiles
          scheduled={scheduled}
          unscheduled={unscheduled}
          day={day}
          readOnly={future}
          perHabit={perHabit}
        />
      ) : (
        <Rows
          skin={skin}
          scheduled={scheduled}
          unscheduled={unscheduled}
          day={day}
          readOnly={future}
          perHabit={perHabit}
        />
      )}

      {/* A habit created today is not active on the day being browsed, so it
          would be added into an empty screen. The button comes back with the
          day it belongs to. */}
      {offset === 0 && <AddHabit />}

      {habits.length > 0 && skin !== "grid" && (
        <StreakLink skin={skin} recent={recent} streak={streaks.current} />
      )}
    </section>
  );
}

/**
 * The keyboard and screen-reader half of the swipe (§6.8). A gesture announces
 * itself to neither, so the arrows are not a fallback — they are the control,
 * and the swipe is the shortcut.
 */
function DayNav({
  offset,
  onOffset,
}: {
  offset: number;
  onOffset: (next: number) => void;
}) {
  return (
    <div className="flex shrink-0 items-center gap-0.5">
      <NavButton label="Previous day" onClick={() => onOffset(offset - 1)}>
        ‹
      </NavButton>
      {offset !== 0 && (
        <button
          type="button"
          onClick={() => onOffset(0)}
          className="h-9 rounded-control px-2 text-[12px] text-muted transition-colors hover:text-foreground"
        >
          Today
        </button>
      )}
      <NavButton label="Next day" onClick={() => onOffset(offset + 1)}>
        ›
      </NavButton>
    </div>
  );
}

function NavButton({
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
      className="flex h-9 w-9 items-center justify-center rounded-control border border-border text-muted transition-colors hover:text-foreground"
    >
      {children}
    </button>
  );
}

function Header({
  skin,
  day,
  today,
  done,
  total,
  nav,
}: {
  skin: Skin;
  day: DayKey;
  today: DayKey;
  done: number;
  total: number;
  nav: React.ReactNode;
}) {
  const relative = relativeDayLabel(day, today);

  if (skin === "blocks") {
    return (
      <header className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <h1 className="display-type truncate text-[32px] leading-[0.92]">
            {relative ?? formatWeekdayLong(day)}
          </h1>
          <p className="mt-1 text-[12px] font-medium tracking-[0.12em] uppercase">
            {formatDayFull(day)}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {total > 0 && (
            <p className="display-type bg-accent px-3 py-2 text-[17px] tabular-nums text-accent-fg">
              {done} / {total}
            </p>
          )}
          {nav}
        </div>
      </header>
    );
  }

  if (skin === "grid") {
    return (
      <header className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-mono text-[10px] font-medium tracking-[0.1em] uppercase text-muted">
            {formatDayFull(day)}
          </p>
          <h1 className="display-type mt-0.5 truncate text-[20px]">
            {relative ?? formatWeekdayLong(day)}
          </h1>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {total > 0 && (
            <p className="flex items-baseline gap-0.5">
              <span className="font-mono text-[28px] font-semibold leading-none tabular-nums">
                {done}
              </span>
              <span className="font-mono text-[15px] text-muted">/{total}</span>
            </p>
          )}
          {nav}
        </div>
      </header>
    );
  }

  return (
    <header className="flex items-center justify-between gap-3">
      {/* Today keeps its date rather than saying so twice: the reset button in
          the nav is already the thing that names the offset. */}
      <h1 className="display-type min-w-0 truncate text-[15px]">
        {day === today ? formatDayLong(day) : (relative ?? formatDayLong(day))}
      </h1>
      <div className="flex shrink-0 items-center gap-2">
        {total > 0 && (
          <p className="font-mono text-[12px] tabular-nums text-muted">
            {done} of {total} done
          </p>
        )}
        {nav}
      </div>
    </header>
  );
}

/**
 * `grid` promotes the contribution grid onto Today. Deliberately not the
 * `Heatmap` component: this one is a read-only summary that has to stay short,
 * where that one is the interactive year and transposes to a tall column on a
 * phone. Tapping it goes to the screen that does the real thing.
 */
function HeatStrip({ stats, rate }: { stats: DayStat[]; rate: number }) {
  const scored = stats.filter((s) => s.level !== "rest").length;

  return (
    <Link
      href="/stats"
      className="surface-card mt-4 block bg-surface p-3 transition-colors hover:bg-surface-2"
    >
      <span
        aria-hidden="true"
        className="grid grid-flow-col grid-rows-7 justify-start gap-[2px]"
      >
        {stats.map((stat) => (
          <span
            key={stat.date}
            className="h-[9px] w-[9px] rounded-cell"
            style={{
              background:
                stat.level === "rest" ? "var(--surface-2)" : levelColor(stat.level),
            }}
          />
        ))}
      </span>

      <span className="mt-2.5 flex items-center justify-between gap-3">
        <span className="font-mono text-[11px] tabular-nums text-muted">
          {scored} days ·{" "}
          <span className="font-semibold text-foreground">
            {Math.round(rate * 100)}%
          </span>
        </span>
        <span aria-hidden="true" className="flex items-center gap-[3px]">
          <span className="mr-1 font-mono text-[10px] tracking-[0.1em] uppercase text-muted">
            Less
          </span>
          {([0, 1, 2, 3, 4] as const).map((level) => (
            <span
              key={level}
              className="h-[9px] w-[9px] rounded-cell"
              style={{ background: levelColor(level) }}
            />
          ))}
          <span className="ml-1 font-mono text-[10px] tracking-[0.1em] uppercase text-muted">
            More
          </span>
        </span>
      </span>
    </Link>
  );
}

function Rows({
  skin,
  scheduled,
  unscheduled,
  day,
  readOnly,
  perHabit,
}: {
  skin: Skin;
  scheduled: HabitDayState[];
  unscheduled: HabitDayState[];
  day: DayKey;
  readOnly: boolean;
  perHabit: Map<string, PerHabit>;
}) {
  const render = (state: HabitDayState, dimmed?: boolean) => {
    if (skin === "grid") {
      const own = perHabit.get(state.habit.id);
      return (
        <HabitRowDense
          state={state}
          day={day}
          trail={own?.trail}
          streak={own?.streak}
          readOnly={readOnly}
          dimmed={dimmed}
        />
      );
    }
    return <HabitRow state={state} day={day} readOnly={readOnly} dimmed={dimmed} />;
  };

  return (
    <>
      <ul className="-mx-3 mt-2">
        {scheduled.map((state) => (
          <li key={state.habit.id}>{render(state)}</li>
        ))}
      </ul>

      {unscheduled.length > 0 && (
        <details className="-mx-3 mt-4">
          <summary className="cursor-pointer px-3 text-[11px] font-semibold uppercase tracking-[0.08em] text-muted">
            Not scheduled ({unscheduled.length})
          </summary>
          <ul className="mt-1">
            {unscheduled.map((state) => (
              <li key={state.habit.id}>{render(state, true)}</li>
            ))}
          </ul>
        </details>
      )}
    </>
  );
}

function Tiles({
  scheduled,
  unscheduled,
  day,
  readOnly,
  perHabit,
}: {
  scheduled: HabitDayState[];
  unscheduled: HabitDayState[];
  day: DayKey;
  readOnly: boolean;
  perHabit: Map<string, PerHabit>;
}) {
  return (
    <>
      <ul className="mt-4 grid grid-cols-2 gap-3">
        {scheduled.map((state) => (
          <li key={state.habit.id} className="flex">
            <HabitTile
              state={state}
              day={day}
              streak={perHabit.get(state.habit.id)?.streak}
              readOnly={readOnly}
            />
          </li>
        ))}
      </ul>

      {unscheduled.length > 0 && (
        <details className="mt-4">
          <summary className="cursor-pointer text-[11px] font-bold uppercase tracking-[0.1em] text-muted">
            Not scheduled ({unscheduled.length})
          </summary>
          <ul className="mt-3 grid grid-cols-2 gap-3">
            {unscheduled.map((state) => (
              <li key={state.habit.id} className="flex">
                <HabitTile
                  state={state}
                  day={day}
                  streak={perHabit.get(state.habit.id)?.streak}
                  readOnly={readOnly}
                  dimmed
                />
              </li>
            ))}
          </ul>
        </details>
      )}
    </>
  );
}

function StreakLink({
  skin,
  recent,
  streak,
}: {
  skin: Skin;
  recent: DayStat[];
  streak: number;
}) {
  if (skin === "blocks") {
    return (
      <Link
        href="/stats"
        className="surface-card mt-5 flex items-center justify-between gap-3 bg-accent px-4 py-3 text-accent-fg"
      >
        <span>
          <span className="display-type block text-[28px] leading-none">
            {streak > 0 ? streak : "—"}
          </span>
          <span className="mt-1 block text-[11px] font-bold tracking-[0.12em] uppercase">
            {streak > 0 ? "Day streak" : "Start today"}
          </span>
        </span>
        <span aria-hidden="true" className="flex gap-1">
          {recent.map((stat) => (
            <span
              key={stat.date}
              className="h-[15px] w-[15px]"
              style={{
                background:
                  stat.level === "rest" ? "transparent" : levelColor(stat.level),
                boxShadow: stat.level === "rest" ? "inset 0 0 0 2px currentColor" : "none",
              }}
            />
          ))}
        </span>
      </Link>
    );
  }

  return (
    <Link
      href="/stats"
      className="surface-card mt-6 flex items-center justify-between bg-surface px-4 py-3 transition-colors hover:bg-surface-2"
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
        {streak > 0 ? (
          <>
            <strong className="font-mono tabular-nums text-foreground">{streak}</strong>{" "}
            day streak 🔥
          </>
        ) : (
          "Start a streak today"
        )}
      </span>
    </Link>
  );
}

function EmptyState() {
  return (
    <div className="mt-3 surface-dashed px-4 py-8 text-center">
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
