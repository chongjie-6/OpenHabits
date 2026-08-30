/**
 * Local-calendar date maths.
 *
 * Every date in OpenHabits is a 'YYYY-MM-DD' string in the *device's* local
 * calendar — never a UTC instant. Ticking a habit at 11pm should land on the day
 * you think it is, in whatever timezone you happen to be in.
 *
 * All parsing anchors to **noon** local time. A DST shift moves the clock by an
 * hour; anchoring at midnight would let that hour push a date into the previous
 * or next day, and anchoring at noon leaves 11 hours of slack on either side.
 */

import type { ISODate, Weekday } from './types'

const MS_PER_DAY = 86_400_000

const pad = (n: number) => String(n).padStart(2, '0')

/** Format a `Date` as a local-calendar ISO date. */
export function formatISO(d: Date): ISODate {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

/** Parse an ISO date to a local `Date` anchored at noon. */
export function parseISO(iso: ISODate): Date {
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(y, m - 1, d, 12, 0, 0, 0)
}

export function isValidISO(value: unknown): value is ISODate {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
  return formatISO(parseISO(value)) === value
}

/**
 * The current day, honouring the rollover hour.
 *
 * With `rolloverHour = 3`, 1am Tuesday still counts as Monday — the day flips at
 * 3am, not at midnight.
 */
export function todayISO(rolloverHour = 0, now: Date = new Date()): ISODate {
  const shifted = new Date(now.getTime() - rolloverHour * 3600_000)
  return formatISO(shifted)
}

export function addDays(iso: ISODate, n: number): ISODate {
  const d = parseISO(iso)
  d.setDate(d.getDate() + n)
  return formatISO(d)
}

/** Whole days from `a` to `b`. Negative when `b` is earlier. */
export function diffDays(a: ISODate, b: ISODate): number {
  return Math.round((parseISO(b).getTime() - parseISO(a).getTime()) / MS_PER_DAY)
}

export function dayOfWeek(iso: ISODate): Weekday {
  return parseISO(iso).getDay() as Weekday
}

/** The first day of the week containing `iso`, per the user's week-start setting. */
export function startOfWeek(iso: ISODate, weekStart: 0 | 1): ISODate {
  const back = (dayOfWeek(iso) - weekStart + 7) % 7
  return addDays(iso, -back)
}

/** The seven days of the week containing `iso`, in display order. */
export function weekDates(iso: ISODate, weekStart: 0 | 1): ISODate[] {
  const start = startOfWeek(iso, weekStart)
  return Array.from({ length: 7 }, (_, i) => addDays(start, i))
}

/** `count` consecutive days ending at `end` (inclusive), oldest first. */
export function daysEndingAt(end: ISODate, count: number): ISODate[] {
  return Array.from({ length: count }, (_, i) => addDays(end, i - count + 1))
}

export const isBefore = (a: ISODate, b: ISODate) => a < b
export const isAfter = (a: ISODate, b: ISODate) => a > b

export const WEEKDAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const
export const WEEKDAY_INITIALS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'] as const
export const MONTH_NAMES = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
] as const

/** Weekday headers in the user's week order, e.g. ['M','T','W','T','F','S','S']. */
export function weekdayHeaders(weekStart: 0 | 1): { key: number; label: string }[] {
  return Array.from({ length: 7 }, (_, i) => {
    const day = (i + weekStart) % 7
    return { key: day, label: WEEKDAY_INITIALS[day] }
  })
}

export function monthLabel(iso: ISODate): string {
  return MONTH_NAMES[parseISO(iso).getMonth()]
}

/** e.g. "Mon 30 Aug". */
export function formatShort(iso: ISODate): string {
  const d = parseISO(iso)
  return `${WEEKDAY_NAMES[d.getDay()]} ${d.getDate()} ${MONTH_NAMES[d.getMonth()]}`
}

/** e.g. "Monday, 30 August 2026". */
export function formatLong(iso: ISODate): string {
  return parseISO(iso).toLocaleDateString(undefined, {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  })
}

/** "Today" / "Yesterday" / "Tomorrow", else a short date. */
export function relativeDayLabel(iso: ISODate, today: ISODate): string {
  const delta = diffDays(today, iso)
  if (delta === 0) return 'Today'
  if (delta === -1) return 'Yesterday'
  if (delta === 1) return 'Tomorrow'
  return formatShort(iso)
}

/** e.g. "1 – 7 Sep" or "28 Aug – 3 Sep". */
export function formatWeekRange(days: ISODate[]): string {
  const first = parseISO(days[0])
  const last = parseISO(days[days.length - 1])
  const sameMonth = first.getMonth() === last.getMonth()
  const left = sameMonth
    ? `${first.getDate()}`
    : `${first.getDate()} ${MONTH_NAMES[first.getMonth()]}`
  return `${left} – ${last.getDate()} ${MONTH_NAMES[last.getMonth()]}`
}

/** Number of days in the year containing `iso` (365 or 366). */
export function daysInYear(iso: ISODate): number {
  const y = parseISO(iso).getFullYear()
  return (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0 ? 366 : 365
}
