"use client";

/**
 * Today's list, split into To do above Done. See DESIGN.md §6.9.
 *
 * The split itself is one filter. What needs a module is the delay: a row that
 * left for the Done section the instant it was ticked would move out from under
 * the thumb, taking the checkbox pop with it, and the next row would slide into
 * the place the thumb is about to press again. So a change holds every row where
 * it is on screen, and the hold is released only once ticking has paused for
 * `SETTLE_MS`. The state machine is pure so that can be tested without a DOM.
 */

import { useEffect, useState } from "react";
import type { HabitDayState } from "@/lib/history";
import type { DayKey } from "@/lib/types";

export const SETTLE_MS = 700;

/** Habit id → whether its row sits under Done. */
type Placement = ReadonlyMap<string, boolean>;

export type SplitState = {
  day: DayKey | null;
  /** Changes whenever any count on the day does. */
  key: string;
  /** Where each row belongs right now. */
  actual: Placement;
  /** Where each row is being kept until the hold is released, if it is. */
  held: Placement | null;
};

function placementOf(states: readonly HabitDayState[]): Placement {
  return new Map(states.map((s) => [s.habit.id, s.done]));
}

function keyOf(states: readonly HabitDayState[]): string {
  return states.map((s) => `${s.habit.id}:${s.count}:${s.done ? 1 : 0}`).join("|");
}

export function initialSplit(day: DayKey | null, states: readonly HabitDayState[]): SplitState {
  return { day, key: keyOf(states), actual: placementOf(states), held: null };
}

/**
 * Returns `prev` itself when nothing changed — the hook calls this during
 * render and sets state only on a new object, so identity is what stops a loop.
 *
 * Another day, or the store finishing its load, is not a tick: nothing on
 * screen is under the thumb, so rows go straight to their sections. Any other
 * change renews the hold, including a counted habit stepping from 5 to 6 —
 * that press is still someone mid-way down the list.
 */
export function nextSplit(
  prev: SplitState,
  day: DayKey | null,
  states: readonly HabitDayState[],
): SplitState {
  if (prev.day !== day) return initialSplit(day, states);

  const key = keyOf(states);
  if (key === prev.key) return prev;

  const shown = prev.held ?? prev.actual;
  return {
    day,
    key,
    actual: placementOf(states),
    held: new Map(states.map((s) => [s.habit.id, shown.get(s.habit.id) ?? s.done])),
  };
}

export function release(split: SplitState): SplitState {
  return split.held ? { ...split, held: null } : split;
}

export function sections(split: SplitState, states: readonly HabitDayState[]) {
  const placement = split.held ?? split.actual;
  const todo: HabitDayState[] = [];
  const done: HabitDayState[] = [];
  for (const s of states) {
    ((placement.get(s.habit.id) ?? s.done) ? done : todo).push(s);
  }
  return { todo, done };
}

const LOADING: readonly HabitDayState[] = [];

/** `scheduled` is null until the store has hydrated. */
export function useTodaySplit(day: DayKey | null, scheduled: readonly HabitDayState[] | null) {
  const states = scheduled ?? LOADING;
  const effectiveDay = scheduled ? day : null;

  const [split, setSplit] = useState(() => initialSplit(effectiveDay, states));
  const next = nextSplit(split, effectiveDay, states);
  if (next !== split) setSplit(next);

  useEffect(() => {
    if (!split.held) return;
    const timer = setTimeout(() => setSplit(release), SETTLE_MS);
    return () => clearTimeout(timer);
  }, [split.held]);

  return sections(next, states);
}
