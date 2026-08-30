/**
 * Streaks, derived on the fly and never persisted.
 *
 * Two rules shape everything here, and both exist to stop the app punishing you
 * for things you did nothing wrong on:
 *
 *   1. **Rest days step over a streak rather than breaking it.** A Mon/Wed/Fri
 *      habit is not "missed" on a Tuesday; the walk skips Tuesday and carries
 *      the count forward.
 *   2. **Today is forgiven while it is still in progress.** At 9am you have not
 *      failed to run yet. If today is scheduled and not yet complete, the walk
 *      starts at yesterday, so an untouched morning never shows a broken streak.
 *
 * The n-times-per-week cadence is the one place the rules leave genuine room, so
 * it is settled explicitly: **it is measured in weeks, not days.** Which days you
 * pick is yours to choose, so a day can never be a miss — only a week can. A week
 * counts when its completed days reach the target, the streak is the run of
 * consecutive satisfied weeks, and the current week is forgiven while in progress
 * exactly as today is. The unit of the streak is the week, so "3" means three
 * weeks, and `streakUnit` says so in the UI rather than leaving you to guess.
 */

import { addDays, dayOfWeek, startOfWeek, weekDates } from './date'
import { countFor } from './store'
import type { AppState } from './store'
import type { DayStatus, Habit, ISODate } from './types'

/** Is this habit expected on this day at all? */
export function isScheduled(habit: Habit, date: ISODate): boolean {
  switch (habit.cadence.kind) {
    case 'daily':
      return true
    case 'weekdays':
      return habit.cadence.days.includes(dayOfWeek(date))
    case 'timesPerWeek':
      // Any day is a legitimate day to do it; no single day is required.
      return true
  }
}

/**
 * Whether a scheduled day is one the streak can break on.
 *
 * For n-times-per-week this is false: the week is the unit of judgement, so no
 * individual day is ever a miss.
 */
export function isRequired(habit: Habit, date: ISODate): boolean {
  return habit.cadence.kind !== 'timesPerWeek' && isScheduled(habit, date)
}

export function isComplete(state: AppState, habit: Habit, date: ISODate): boolean {
  return countFor(state, habit.id, date) >= habit.target
}

export function dayStatus(
  state: AppState,
  habit: Habit,
  date: ISODate,
  today: ISODate,
): DayStatus {
  if (date > today) return 'future'
  const count = countFor(state, habit.id, date)
  if (count >= habit.target) return 'done'
  if (count > 0) return 'partial'
  if (!isRequired(habit, date)) return 'rest'
  return 'missed'
}

/** Completed days within the week containing `date`. */
export function weekCompletions(
  state: AppState,
  habit: Habit,
  date: ISODate,
  weekStart: 0 | 1,
): number {
  return weekDates(date, weekStart).filter((d) => isComplete(state, habit, d)).length
}

function weekSatisfied(
  state: AppState,
  habit: Habit,
  weekStartDate: ISODate,
  weekStart: 0 | 1,
  times: number,
): boolean {
  return weekCompletions(state, habit, weekStartDate, weekStart) >= times
}

/** 'days' for daily and weekday habits, 'weeks' for n-times-per-week. */
export type StreakUnit = 'days' | 'weeks'

export function streakUnit(habit: Habit): StreakUnit {
  return habit.cadence.kind === 'timesPerWeek' ? 'weeks' : 'days'
}

/** How far back history could possibly go for this habit. */
function earliestDate(state: AppState, habit: Habit): ISODate {
  let earliest: ISODate | null = null
  for (const entry of state.entries) {
    if (entry.habitId !== habit.id || entry.deletedAt) continue
    if (!earliest || entry.date < earliest) earliest = entry.date
  }
  const created = new Date(habit.createdAt)
  const createdISO = `${created.getFullYear()}-${String(created.getMonth() + 1).padStart(2, '0')}-${String(created.getDate()).padStart(2, '0')}`
  if (!earliest) return createdISO
  return earliest < createdISO ? earliest : createdISO
}

export function currentStreak(
  state: AppState,
  habit: Habit,
  today: ISODate,
  weekStart: 0 | 1,
): number {
  if (habit.cadence.kind === 'timesPerWeek') {
    const times = habit.cadence.times
    let cursor = startOfWeek(today, weekStart)
    let streak = 0
    // The week in progress counts if it is already satisfied, and is forgiven
    // (skipped, not counted) if it is not — the same courtesy today gets.
    if (weekSatisfied(state, habit, cursor, weekStart, times)) streak++
    cursor = addDays(cursor, -7)
    const floor = earliestDate(state, habit)
    while (cursor >= startOfWeek(floor, weekStart)) {
      if (!weekSatisfied(state, habit, cursor, weekStart, times)) break
      streak++
      cursor = addDays(cursor, -7)
    }
    return streak
  }

  let cursor = today
  // Today in progress: not a miss, just not counted yet.
  if (isRequired(habit, today) && !isComplete(state, habit, today)) {
    cursor = addDays(today, -1)
  }

  const floor = earliestDate(state, habit)
  let streak = 0
  while (cursor >= floor) {
    if (isRequired(habit, cursor)) {
      if (!isComplete(state, habit, cursor)) break
      streak++
    }
    // A rest day falls through: neither counted nor breaking.
    cursor = addDays(cursor, -1)
  }
  return streak
}

export function longestStreak(
  state: AppState,
  habit: Habit,
  today: ISODate,
  weekStart: 0 | 1,
): number {
  const floor = earliestDate(state, habit)

  if (habit.cadence.kind === 'timesPerWeek') {
    const times = habit.cadence.times
    let cursor = startOfWeek(floor, weekStart)
    const lastWeek = startOfWeek(today, weekStart)
    let best = 0
    let run = 0
    while (cursor <= lastWeek) {
      // The in-progress week can extend the best run but never end it.
      if (weekSatisfied(state, habit, cursor, weekStart, times)) {
        run++
        best = Math.max(best, run)
      } else if (cursor < lastWeek) {
        run = 0
      }
      cursor = addDays(cursor, 7)
    }
    return best
  }

  let cursor = floor
  let best = 0
  let run = 0
  while (cursor <= today) {
    if (isRequired(habit, cursor)) {
      if (isComplete(state, habit, cursor)) {
        run++
        best = Math.max(best, run)
      } else if (cursor < today) {
        run = 0 // today in progress cannot end the best run
      }
    }
    cursor = addDays(cursor, 1)
  }
  return best
}

export interface HabitStreak {
  current: number
  longest: number
  unit: StreakUnit
}

export function habitStreak(
  state: AppState,
  habit: Habit,
  today: ISODate,
  weekStart: 0 | 1,
): HabitStreak {
  return {
    current: currentStreak(state, habit, today, weekStart),
    longest: longestStreak(state, habit, today, weekStart),
    unit: streakUnit(habit),
  }
}

/** Plain English, for the habit detail screen. */
export function describeCadence(habit: Habit): string {
  const per = habit.target > 1 ? ` · ${habit.target}${habit.unit ? ` ${habit.unit}` : '×'} a day` : ''
  switch (habit.cadence.kind) {
    case 'daily':
      return `Every day${per}`
    case 'weekdays': {
      const names = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
      const days = [...habit.cadence.days].sort((a, b) => a - b)
      if (days.length === 0) return `No days chosen${per}`
      if (days.length === 7) return `Every day${per}`
      if (days.length === 5 && days.every((d) => d >= 1 && d <= 5)) return `Weekdays${per}`
      if (days.length === 2 && days.includes(0) && days.includes(6)) return `Weekends${per}`
      return `${days.map((d) => names[d]).join(', ')}${per}`
    }
    case 'timesPerWeek':
      return `${habit.cadence.times}× a week${per}`
  }
}
