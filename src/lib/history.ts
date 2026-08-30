/**
 * Aggregates over history: day totals, perfect days, completion rate, and the
 * heatmap grids. Like `streaks.ts`, everything here is derived at render time.
 *
 * "Scheduled" always means *required* — a rest day is not counted as an
 * opportunity, so skipping Tuesday on a Mon/Wed/Fri habit can never drag your
 * completion rate down. n-times-per-week habits have no required days at all, so
 * they contribute to per-habit totals but not to the daily ratio.
 */

import { addDays, daysEndingAt, diffDays, startOfWeek, weekDates } from './date'
import { countFor, visibleHabits } from './store'
import type { AppState } from './store'
import { isComplete, isRequired } from './streaks'
import type { DayStatus, Habit, ISODate } from './types'

export interface DayCompletion {
  date: ISODate
  /** Required habits completed that day. */
  done: number
  /** Required habits that day. */
  scheduled: number
  /** 0–1, or null when nothing was scheduled. */
  ratio: number | null
}

export function dayCompletion(state: AppState, date: ISODate, habits?: Habit[]): DayCompletion {
  const list = habits ?? visibleHabits(state)
  let done = 0
  let scheduled = 0
  for (const habit of list) {
    if (!isRequired(habit, date)) continue
    scheduled++
    if (isComplete(state, habit, date)) done++
  }
  return { date, done, scheduled, ratio: scheduled ? done / scheduled : null }
}

/** Every habit tracked on the Today screen for a given day, plus its progress. */
export function scheduledFor(date: ISODate, habits: Habit[]): Habit[] {
  return habits.filter((h) => {
    if (h.cadence.kind === 'timesPerWeek') return true
    return isRequired(h, date)
  })
}

/** A day where every required habit was completed, and at least one was due. */
export function isPerfectDay(state: AppState, date: ISODate, habits?: Habit[]): boolean {
  const { done, scheduled } = dayCompletion(state, date, habits)
  return scheduled > 0 && done === scheduled
}

export interface RangeStats {
  perfectDays: number
  /** 0–1 across every required habit-day in the range. */
  completionRate: number
  totalCompletions: number
  daysTracked: number
}

export function rangeStats(state: AppState, from: ISODate, to: ISODate): RangeStats {
  const habits = visibleHabits(state)
  let perfect = 0
  let done = 0
  let scheduled = 0
  let completions = 0

  for (let date = from; date <= to; date = addDays(date, 1)) {
    const day = dayCompletion(state, date, habits)
    done += day.done
    scheduled += day.scheduled
    if (day.scheduled > 0 && day.done === day.scheduled) perfect++
    for (const habit of habits) {
      if (isComplete(state, habit, date)) completions++
    }
  }

  return {
    perfectDays: perfect,
    completionRate: scheduled ? done / scheduled : 0,
    totalCompletions: completions,
    daysTracked: diffDays(from, to) + 1,
  }
}

export interface HabitTotals {
  habit: Habit
  /** Days completed, ever. */
  completions: number
  /** Required days, ever (0 for n-times-per-week habits). */
  scheduled: number
  rate: number | null
}

export function perHabitTotals(state: AppState, from: ISODate, to: ISODate): HabitTotals[] {
  return visibleHabits(state).map((habit) => {
    let completions = 0
    let scheduled = 0
    for (let date = from; date <= to; date = addDays(date, 1)) {
      if (isComplete(state, habit, date)) completions++
      if (isRequired(habit, date)) scheduled++
    }
    return { habit, completions, scheduled, rate: scheduled ? completions / scheduled : null }
  })
}

// ---------------------------------------------------------------------------
// Heatmap
// ---------------------------------------------------------------------------

export interface HeatCell {
  date: ISODate
  /** 0–4. 0 is "nothing done", 4 is "everything done". */
  level: 0 | 1 | 2 | 3 | 4
  done: number
  scheduled: number
  /** Days beyond today are rendered as empty placeholders. */
  future: boolean
}

export interface HeatWeek {
  /** Sunday-or-Monday start date of the column. */
  start: ISODate
  cells: HeatCell[]
  /** Month label, set only on the first column of each month. */
  label: string | null
}

function levelFrom(done: number, scheduled: number): 0 | 1 | 2 | 3 | 4 {
  if (scheduled === 0 || done === 0) return 0
  const ratio = done / scheduled
  if (ratio >= 1) return 4
  if (ratio >= 0.66) return 3
  if (ratio >= 0.33) return 2
  return 1
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

/**
 * `weeks` columns of seven days ending in the week containing `endDate`.
 *
 * Pass a habit to get that one habit's grid (the detail screen); omit it for the
 * all-habits grid on /stats.
 */
export function heatmapWeeks(
  state: AppState,
  endDate: ISODate,
  weeks: number,
  weekStart: 0 | 1,
  habit?: Habit,
): HeatWeek[] {
  const habits = habit ? [habit] : visibleHabits(state)
  const lastWeekStart = startOfWeek(endDate, weekStart)
  const firstWeekStart = addDays(lastWeekStart, -7 * (weeks - 1))

  const out: HeatWeek[] = []
  let previousMonth = -1

  for (let w = 0; w < weeks; w++) {
    const start = addDays(firstWeekStart, 7 * w)
    const cells: HeatCell[] = weekDates(start, weekStart).map((date) => {
      if (date > endDate) {
        return { date, level: 0, done: 0, scheduled: 0, future: true }
      }
      const { done, scheduled } = dayCompletion(state, date, habits)
      return { date, level: levelFrom(done, scheduled), done, scheduled, future: false }
    })

    // Label a column with its month only when the month changes, so the axis
    // reads "Jan  Feb  Mar" rather than repeating.
    const month = Number(start.slice(5, 7)) - 1
    const label = month !== previousMonth ? MONTHS[month] : null
    previousMonth = month

    out.push({ start, cells, label })
  }
  return out
}

/** The seven-day strip on Today: oldest first, ending today. */
export interface StripDay {
  date: ISODate
  done: number
  scheduled: number
  complete: boolean
  isToday: boolean
}

export function last7Days(state: AppState, today: ISODate): StripDay[] {
  const habits = visibleHabits(state)
  return daysEndingAt(today, 7).map((date) => {
    const { done, scheduled } = dayCompletion(state, date, habits)
    return {
      date,
      done,
      scheduled,
      complete: scheduled > 0 && done === scheduled,
      isToday: date === today,
    }
  })
}

/** One habit's status for a day, for the day-detail popover on /stats. */
export interface DayDetailRow {
  habit: Habit
  count: number
  status: DayStatus
}

export function dayDetail(
  state: AppState,
  date: ISODate,
  today: ISODate,
  statusOf: (habit: Habit, date: ISODate, today: ISODate) => DayStatus,
): DayDetailRow[] {
  return visibleHabits(state).map((habit) => ({
    habit,
    count: countFor(state, habit.id, date),
    status: statusOf(habit, date, today),
  }))
}

/** The earliest date worth showing on a year view. */
export function yearStart(endDate: ISODate, weeks: number, weekStart: 0 | 1): ISODate {
  return addDays(startOfWeek(endDate, weekStart), -7 * (weeks - 1))
}
