import { describe, expect, it } from 'vitest'
import {
  addDays,
  daysEndingAt,
  diffDays,
  formatISO,
  formatWeekRange,
  isValidISO,
  parseISO,
  startOfWeek,
  todayISO,
  weekDates,
  weekdayHeaders,
} from './date'

describe('parsing and formatting', () => {
  it('round-trips an ISO date', () => {
    expect(formatISO(parseISO('2026-08-30'))).toBe('2026-08-30')
  })

  it('anchors at noon so a DST shift cannot move the day', () => {
    expect(parseISO('2026-08-30').getHours()).toBe(12)
  })

  it('validates shape and real calendar dates', () => {
    expect(isValidISO('2026-08-30')).toBe(true)
    expect(isValidISO('2026-2-3')).toBe(false)
    expect(isValidISO('2026-02-30')).toBe(false) // rolls to March, so not a real day
    expect(isValidISO('')).toBe(false)
    expect(isValidISO(42)).toBe(false)
  })
})

describe('day arithmetic', () => {
  it('adds and subtracts across month and year boundaries', () => {
    expect(addDays('2026-08-31', 1)).toBe('2026-09-01')
    expect(addDays('2026-01-01', -1)).toBe('2025-12-31')
    expect(addDays('2024-02-28', 1)).toBe('2024-02-29') // leap year
  })

  it('measures whole days in both directions', () => {
    expect(diffDays('2026-08-30', '2026-09-02')).toBe(3)
    expect(diffDays('2026-09-02', '2026-08-30')).toBe(-3)
    expect(diffDays('2026-08-30', '2026-08-30')).toBe(0)
  })

  it('survives a spring-forward boundary', () => {
    // US DST begins 8 March 2026; the noon anchor keeps every day 1 apart.
    for (let i = 0; i < 5; i++) {
      const from = addDays('2026-03-06', i)
      expect(diffDays(from, addDays(from, 1))).toBe(1)
    }
  })

  it('builds a strip of consecutive days ending at the given day', () => {
    const days = daysEndingAt('2026-08-30', 7)
    expect(days).toHaveLength(7)
    expect(days[6]).toBe('2026-08-30')
    expect(days[0]).toBe('2026-08-24')
  })
})

describe('weeks', () => {
  it('starts the week on Monday or Sunday as configured', () => {
    // 2026-08-30 is a Sunday.
    expect(startOfWeek('2026-08-30', 1)).toBe('2026-08-24') // Monday before
    expect(startOfWeek('2026-08-30', 0)).toBe('2026-08-30') // Sunday itself
  })

  it('returns seven days in display order', () => {
    const days = weekDates('2026-08-30', 1)
    expect(days).toEqual([
      '2026-08-24', '2026-08-25', '2026-08-26', '2026-08-27',
      '2026-08-28', '2026-08-29', '2026-08-30',
    ])
  })

  it('orders the weekday headers to match', () => {
    expect(weekdayHeaders(1).map((h) => h.key)).toEqual([1, 2, 3, 4, 5, 6, 0])
    expect(weekdayHeaders(0).map((h) => h.key)).toEqual([0, 1, 2, 3, 4, 5, 6])
  })

  it('formats a week range, collapsing a shared month', () => {
    expect(formatWeekRange(weekDates('2026-09-03', 1))).toBe('31 Aug – 6 Sep')
    expect(formatWeekRange(weekDates('2026-09-10', 1))).toBe('7 – 13 Sep')
  })
})

describe('rollover hour', () => {
  it('flips at midnight by default', () => {
    expect(todayISO(0, new Date(2026, 7, 30, 0, 30))).toBe('2026-08-30')
  })

  it('keeps the small hours on the previous day when set', () => {
    // 1am with a 3am rollover is still "yesterday" — the night owl case.
    expect(todayISO(3, new Date(2026, 7, 30, 1, 0))).toBe('2026-08-29')
    expect(todayISO(3, new Date(2026, 7, 30, 3, 0))).toBe('2026-08-30')
    expect(todayISO(3, new Date(2026, 7, 30, 23, 0))).toBe('2026-08-30')
  })
})
