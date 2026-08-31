import 'fake-indexeddb/auto'
import { deleteDB, openDB } from 'idb'
import { afterEach, describe, expect, it } from 'vitest'
import { DB_VERSION, upgradeSchema } from './db'
import type { OpenHabitsDB } from './db'
import type { Entry, Habit } from './types'

/**
 * The upgrade path, tested before anyone's data has to walk it.
 *
 * This is the one part of the storage layer that cannot be fixed after the fact:
 * a bad `upgrade` runs once, on a device you do not have, against the only copy
 * of someone's year. So the ladder is exercised here at a version the app has
 * not shipped yet — proving that a database written by today's release survives
 * being opened by tomorrow's, and that a device installing fresh after the bump
 * still gets every store.
 *
 * When DB_VERSION goes up, these tests keep working and start covering the new
 * rung for free.
 */

const NEXT_VERSION = DB_VERSION + 1

let dbName = ''

function name(): string {
  dbName = `openhabits-test-${Date.now()}-${Math.random().toString(36).slice(2)}`
  return dbName
}

afterEach(async () => {
  if (dbName) await deleteDB(dbName)
  dbName = ''
})

const habit: Habit = {
  id: 'h1',
  name: 'Water',
  emoji: '💧',
  color: 'sky',
  cadence: { kind: 'daily' },
  target: 8,
  unit: 'glasses',
  order: 1000,
  archivedAt: null,
  createdAt: 1,
  updatedAt: 1,
  deletedAt: null,
}

const entry: Entry = {
  id: 'h1:2026-08-30',
  habitId: 'h1',
  date: '2026-08-30',
  count: 8,
  updatedAt: 1,
  deletedAt: null,
}

describe('the schema ladder', () => {
  it('carries a version-1 database forward without losing anything', async () => {
    const db = name()

    const v1 = await openDB<OpenHabitsDB>(db, 1, { upgrade: upgradeSchema })
    await v1.put('habits', habit)
    await v1.put('entries', entry)
    await v1.put('savedQuotes', { id: 12, savedAt: 1, updatedAt: 1, deletedAt: null })
    await v1.put('kv', { deviceId: 'device-1' }, 'meta')
    v1.close()

    const next = await openDB<OpenHabitsDB>(db, NEXT_VERSION, { upgrade: upgradeSchema })

    expect(await next.getAll('habits')).toEqual([habit])
    expect(await next.getAll('entries')).toEqual([entry])
    expect(await next.getAll('savedQuotes')).toHaveLength(1)
    expect(await next.get('kv', 'meta')).toEqual({ deviceId: 'device-1' })

    // Indexes are part of the schema too, and are the easy thing to drop.
    expect(await next.getAllFromIndex('entries', 'habitId', 'h1')).toEqual([entry])
    expect(await next.getAllFromIndex('entries', 'date', '2026-08-30')).toEqual([entry])

    next.close()
  })

  it('builds the whole schema for a device installing after the bump', async () => {
    const fresh = await openDB<OpenHabitsDB>(name(), NEXT_VERSION, { upgrade: upgradeSchema })

    // A ladder written with `else if` — or with `oldVersion === 1` — would leave
    // a new install missing the stores it never "upgraded" into.
    expect([...fresh.objectStoreNames].sort()).toEqual(['entries', 'habits', 'kv', 'savedQuotes'])

    const indexes = [...fresh.transaction('entries').store.indexNames].sort()
    expect(indexes).toEqual(['date', 'habitId'])

    fresh.close()
  })
})
