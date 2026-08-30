import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it } from 'vitest'
import { exportData, importBackup, parseBackup } from './backup'
import { flush } from './db'
import { addHabit, setCount, setQuoteSaved } from './repo'
import { countFor, getState, resetState } from './store'

beforeEach(() => {
  resetState()
})

function seed() {
  const habit = addHabit({
    name: 'Water',
    emoji: '💧',
    color: 'sky',
    cadence: { kind: 'daily' },
    target: 8,
    unit: 'glasses',
  })
  setCount(habit.id, '2026-08-29', 8)
  setCount(habit.id, '2026-08-30', 3)
  setQuoteSaved(12, true)
  return habit
}

describe('export', () => {
  it('captures habits, entries, saved quotes and settings', () => {
    seed()
    const backup = exportData()
    expect(backup.version).toBe(2)
    expect(backup.habits).toHaveLength(1)
    expect(backup.entries).toHaveLength(2)
    expect(backup.savedQuotes).toHaveLength(1)
    expect(backup.settings.weekStart).toBe(1)
  })
})

describe('parse', () => {
  it('rejects a file that is not a backup', () => {
    expect(() => parseBackup('nope')).toThrow()
    expect(() => parseBackup({ version: 2, habits: [], entries: [] })).toThrow(/no habits/)
  })

  it('refuses a format from the future rather than mangling it', () => {
    expect(() => parseBackup({ version: 99, habits: [{ id: 'a' }] })).toThrow(/newer version/)
  })

  it('drops rows it cannot make sense of instead of failing the whole import', () => {
    const parsed = parseBackup({
      version: 2,
      habits: [{ id: 'ok', name: 'Fine' }, { name: 'no id' }, 'garbage'],
      entries: [
        { habitId: 'ok', date: '2026-08-30', count: 1 },
        { habitId: 'ok', date: 'not-a-date', count: 1 },
      ],
    })
    expect(parsed.habits).toHaveLength(1)
    expect(parsed.entries).toHaveLength(1)
  })
})

describe('v1 import', () => {
  const v1 = {
    version: 1,
    habits: [
      { id: 'h-old', name: 'Run', emoji: '🏃', color: 'emerald', days: [1, 3, 5], createdAt: 1000 },
      { id: 'h-arch', name: 'Old thing', archived: true, createdAt: 2000 },
    ],
    entries: [
      { habitId: 'h-old', date: '2026-08-28', done: true },
      { habitId: 'h-old', date: '2026-08-29', done: false },
    ],
    saved: [4, 9],
  }

  it('normalises the old shape into the current one', () => {
    const parsed = parseBackup(v1, 5000)
    const run = parsed.habits.find((h) => h.id === 'h-old')!
    expect(run.cadence).toEqual({ kind: 'weekdays', days: [1, 3, 5] })
    expect(run.target).toBe(1)
    expect(run.updatedAt).toBe(run.createdAt) // no updatedAt in v1
    expect(run.deletedAt).toBeNull()

    const archived = parsed.habits.find((h) => h.id === 'h-arch')!
    expect(archived.archivedAt).not.toBeNull()

    // done:true becomes a count of 1; done:false becomes a tombstone, not a row
    // claiming the habit was done zero times.
    const done = parsed.entries.find((e) => e.date === '2026-08-28')!
    const notDone = parsed.entries.find((e) => e.date === '2026-08-29')!
    expect(done.count).toBe(1)
    expect(done.deletedAt).toBeNull()
    expect(notDone.deletedAt).not.toBeNull()

    expect(parsed.savedQuotes.map((q) => q.id)).toEqual([4, 9])
  })

  it('merges into an empty device', async () => {
    const report = await importBackup(v1, 'merge')
    await flush()
    expect(report.sourceVersion).toBe(1)
    expect(getState().habits).toHaveLength(2)
    expect(countFor(getState(), 'h-old', '2026-08-28')).toBe(1)
    expect(countFor(getState(), 'h-old', '2026-08-29')).toBe(0)
  })
})

describe('merge', () => {
  it('is idempotent — importing the same file twice changes nothing', async () => {
    seed()
    const backup = exportData()
    const first = await importBackup(backup, 'merge')
    const second = await importBackup(backup, 'merge')
    await flush()

    // Everything in the file is already here and no newer, so nothing applies.
    expect(first.habits + first.entries + first.savedQuotes).toBe(0)
    expect(second.skipped).toBe(first.skipped)
    expect(getState().habits).toHaveLength(1)
    expect(getState().entries).toHaveLength(2)
  })

  it('keeps the newer copy of a record on each side', async () => {
    const habit = seed()
    const backup = exportData()

    // The file carries a newer name; the device carries a newer count.
    backup.habits[0] = { ...backup.habits[0], name: 'Hydrate', updatedAt: Date.now() + 10_000 }
    setCount(habit.id, '2026-08-30', 7)

    await importBackup(backup, 'merge')
    await flush()

    const state = getState()
    expect(state.habits[0].name).toBe('Hydrate')
    expect(countFor(state, habit.id, '2026-08-30')).toBe(7)
  })

  it('carries a tombstone across rather than resurrecting the record', async () => {
    const habit = seed()
    const backup = exportData()
    backup.entries = backup.entries.map((e) =>
      e.date === '2026-08-29'
        ? { ...e, count: 0, deletedAt: Date.now() + 10_000, updatedAt: Date.now() + 10_000 }
        : e,
    )

    await importBackup(backup, 'merge')
    await flush()
    expect(countFor(getState(), habit.id, '2026-08-29')).toBe(0)
  })

  it('does not duplicate an entry that was keyed differently in the file', async () => {
    const habit = seed()
    const backup = exportData()
    backup.entries = backup.entries.map((e) => ({ ...e, id: `legacy-${e.date}` }))

    await importBackup(backup, 'merge')
    await flush()
    // Keys are recomputed from habitId:date, so these collapse onto the existing rows.
    expect(getState().entries.filter((e) => e.habitId === habit.id)).toHaveLength(2)
  })
})

describe('replace', () => {
  it('drops what was here and installs the file', async () => {
    seed()
    const foreign = {
      version: 2,
      exportedAt: Date.now(),
      habits: [{ id: 'only', name: 'Read', emoji: '📖', cadence: { kind: 'daily' }, createdAt: 1 }],
      entries: [{ habitId: 'only', date: '2026-08-30', count: 1 }],
      savedQuotes: [],
      settings: {},
    }

    const report = await importBackup(foreign, 'replace')
    await flush()

    expect(report.mode).toBe('replace')
    const state = getState()
    expect(state.habits).toHaveLength(1)
    expect(state.habits[0].name).toBe('Read')
    expect(state.entries).toHaveLength(1)
    expect(state.savedQuotes).toHaveLength(0)
  })
})

describe('round trip', () => {
  it('restores the same data after a reset', async () => {
    const habit = seed()
    const backup = JSON.parse(JSON.stringify(exportData()))

    resetState() // stand in for "reset everything"
    expect(getState().habits).toHaveLength(0)

    await importBackup(backup, 'merge')
    await flush()

    const state = getState()
    expect(state.habits).toHaveLength(1)
    expect(state.habits[0].id).toBe(habit.id)
    expect(state.habits[0].unit).toBe('glasses')
    expect(countFor(state, habit.id, '2026-08-29')).toBe(8)
    expect(countFor(state, habit.id, '2026-08-30')).toBe(3)
    expect(state.savedQuotes.map((q) => q.id)).toEqual([12])
  })
})
