import { describe, expect, it } from 'vitest'
import { entryKey } from './store'
import type { AppState } from './store'
import { currentStreak, dayStatus, describeCadence, longestStreak } from './streaks'
import type { Cadence, Entry, Habit, ISODate, Settings } from './types'
import { DEFAULT_SETTINGS } from './types'

const CREATED = new Date(2026, 0, 1).getTime()

function habit(cadence: Cadence, target = 1): Habit {
  return {
    id: 'h1',
    name: 'Test',
    emoji: '✅',
    color: 'sky',
    cadence,
    target,
    order: 1000,
    archivedAt: null,
    createdAt: CREATED,
    updatedAt: CREATED,
    deletedAt: null,
  }
}

/** Build a state where the habit was done on exactly `dates` (count = target). */
function stateWith(h: Habit, dates: ISODate[], counts?: Record<ISODate, number>): AppState {
  const entries: Entry[] = dates.map((date) => ({
    id: entryKey(h.id, date),
    habitId: h.id,
    date,
    count: counts?.[date] ?? h.target,
    updatedAt: Date.now(),
    deletedAt: null,
  }))
  const settings: Settings = { ...DEFAULT_SETTINGS, updatedAt: 0 }
  return {
    ready: true,
    habits: [h],
    entries,
    savedQuotes: [],
    settings,
    meta: { deviceId: 'd', schemaVersion: 1, lastPulledSeq: 0, accountId: null },
    entryIndex: new Map(entries.map((e) => [e.id, e])),
  }
}

describe('daily cadence', () => {
  const h = habit({ kind: 'daily' })

  it('counts consecutive days', () => {
    const s = stateWith(h, ['2026-03-08', '2026-03-09', '2026-03-10'])
    expect(currentStreak(s, h, '2026-03-10', 1)).toBe(3)
  })

  it('forgives today while it is still in progress', () => {
    // Yesterday and the day before are done; today is untouched.
    const s = stateWith(h, ['2026-03-08', '2026-03-09'])
    expect(currentStreak(s, h, '2026-03-10', 1)).toBe(2)
  })

  it('counts today once it is done', () => {
    const s = stateWith(h, ['2026-03-08', '2026-03-09', '2026-03-10'])
    expect(currentStreak(s, h, '2026-03-10', 1)).toBe(3)
  })

  it('breaks on a missed day that is not today', () => {
    // 03-09 missed, so only 03-10 counts.
    const s = stateWith(h, ['2026-03-08', '2026-03-10'])
    expect(currentStreak(s, h, '2026-03-10', 1)).toBe(1)
  })

  it('reports the longest run, not the current one', () => {
    const s = stateWith(h, [
      '2026-02-01', '2026-02-02', '2026-02-03', '2026-02-04',
      '2026-03-09', '2026-03-10',
    ])
    expect(longestStreak(s, h, '2026-03-10', 1)).toBe(4)
    expect(currentStreak(s, h, '2026-03-10', 1)).toBe(2)
  })
})

describe('weekday cadence', () => {
  // Mon / Wed / Fri.
  const h = habit({ kind: 'weekdays', days: [1, 3, 5] })

  it('steps over rest days instead of breaking on them', () => {
    // Mon 9th, Wed 11th, Fri 13th March 2026 — the weekend and Tue/Thu are rest.
    const s = stateWith(h, ['2026-03-09', '2026-03-11', '2026-03-13'])
    expect(currentStreak(s, h, '2026-03-13', 1)).toBe(3)
    // Still 3 on the following Sunday: rest days do not extend it either.
    expect(currentStreak(s, h, '2026-03-15', 1)).toBe(3)
  })

  it('breaks when a scheduled day is missed', () => {
    // Wed 11th skipped.
    const s = stateWith(h, ['2026-03-09', '2026-03-13'])
    expect(currentStreak(s, h, '2026-03-13', 1)).toBe(1)
  })

  it('marks unscheduled days as rest, not missed', () => {
    const s = stateWith(h, [])
    expect(dayStatus(s, h, '2026-03-10', '2026-03-13')).toBe('rest') // Tuesday
    expect(dayStatus(s, h, '2026-03-11', '2026-03-13')).toBe('missed') // Wednesday
  })
})

describe('n-times-per-week cadence', () => {
  // 3× a week, weeks starting Monday.
  const h = habit({ kind: 'timesPerWeek', times: 3 })

  it('counts satisfied weeks, whichever days they fall on', () => {
    const s = stateWith(h, [
      // w/c Mon 2 Mar
      '2026-03-02', '2026-03-05', '2026-03-07',
      // w/c Mon 9 Mar — different days, still three
      '2026-03-10', '2026-03-11', '2026-03-15',
    ])
    expect(currentStreak(s, h, '2026-03-15', 1)).toBe(2)
  })

  it('never treats a single day as a miss', () => {
    const s = stateWith(h, [])
    expect(dayStatus(s, h, '2026-03-10', '2026-03-13')).toBe('rest')
  })

  it('forgives the week in progress', () => {
    const s = stateWith(h, [
      '2026-03-02', '2026-03-05', '2026-03-07', // last week: satisfied
      '2026-03-09', // this week: only one so far
    ])
    // The unfinished week is skipped, not counted as a break.
    expect(currentStreak(s, h, '2026-03-10', 1)).toBe(1)
  })

  it('breaks on a completed week that fell short', () => {
    const s = stateWith(h, [
      '2026-02-23', '2026-02-24', '2026-02-25', // satisfied
      '2026-03-02', '2026-03-03', // short week, and it is over
      '2026-03-09', '2026-03-10', '2026-03-11', // satisfied
    ])
    expect(currentStreak(s, h, '2026-03-15', 1)).toBe(1)
    expect(longestStreak(s, h, '2026-03-15', 1)).toBe(1)
  })
})

describe('counted targets', () => {
  const h = habit({ kind: 'daily' }, 8) // Water × 8

  it('needs the full target to count as done', () => {
    const s = stateWith(h, ['2026-03-09', '2026-03-10'], {
      '2026-03-09': 8,
      '2026-03-10': 5,
    })
    expect(dayStatus(s, h, '2026-03-09', '2026-03-10')).toBe('done')
    expect(dayStatus(s, h, '2026-03-10', '2026-03-10')).toBe('partial')
    // Today is partial, so it is forgiven rather than counted or broken.
    expect(currentStreak(s, h, '2026-03-10', 1)).toBe(1)
  })
})

describe('invariants', () => {
  it('never reports a current streak longer than the longest', () => {
    const h = habit({ kind: 'daily' })
    const s = stateWith(h, ['2026-03-08', '2026-03-09', '2026-03-10'])
    const current = currentStreak(s, h, '2026-03-10', 1)
    expect(longestStreak(s, h, '2026-03-10', 1)).toBeGreaterThanOrEqual(current)
  })

  it('describes cadences in plain English', () => {
    expect(describeCadence(habit({ kind: 'daily' }))).toBe('Every day')
    expect(describeCadence(habit({ kind: 'weekdays', days: [1, 2, 3, 4, 5] }))).toBe('Weekdays')
    expect(describeCadence(habit({ kind: 'weekdays', days: [0, 6] }))).toBe('Weekends')
    expect(describeCadence(habit({ kind: 'weekdays', days: [1, 3, 5] }))).toBe('Mon, Wed, Fri')
    expect(describeCadence(habit({ kind: 'timesPerWeek', times: 3 }))).toBe('3× a week')
  })
})
