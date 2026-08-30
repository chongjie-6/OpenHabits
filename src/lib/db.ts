/**
 * IndexedDB access. This is the source of truth — not the server, not memory.
 *
 * Nothing above this file awaits a write to show a result: `store.ts` keeps the
 * whole dataset in memory and treats IndexedDB as durable write-behind. So the
 * job here is narrow — open the database, read it all once, and persist changes
 * in order.
 */

import { openDB, type DBSchema, type IDBPDatabase } from 'idb'
import { DEFAULT_SETTINGS } from './types'
import type { Entry, Habit, Meta, SavedQuote, Settings } from './types'

const DB_NAME = 'openhabits'
const DB_VERSION = 1

export const SCHEMA_VERSION = 1

interface OpenHabitsDB extends DBSchema {
  habits: { key: string; value: Habit }
  entries: {
    key: string
    value: Entry
    indexes: { habitId: string; date: string }
  }
  savedQuotes: { key: number; value: SavedQuote }
  /** Singletons: 'settings' and 'meta'. */
  kv: { key: string; value: unknown }
}

let dbPromise: Promise<IDBPDatabase<OpenHabitsDB>> | null = null

export function getDB(): Promise<IDBPDatabase<OpenHabitsDB>> {
  dbPromise ??= openDB<OpenHabitsDB>(DB_NAME, DB_VERSION, {
    // Written as a fall-through ladder so a future version 2 is an added case,
    // not a rewrite of what version 1 users already have on disk.
    upgrade(db, oldVersion) {
      if (oldVersion < 1) {
        db.createObjectStore('habits', { keyPath: 'id' })
        const entries = db.createObjectStore('entries', { keyPath: 'id' })
        entries.createIndex('habitId', 'habitId')
        entries.createIndex('date', 'date')
        db.createObjectStore('savedQuotes', { keyPath: 'id' })
        db.createObjectStore('kv')
      }
    },
  })
  return dbPromise
}

export interface Dataset {
  habits: Habit[]
  entries: Entry[]
  savedQuotes: SavedQuote[]
  settings: Settings
  meta: Meta
}

function newDeviceId(): string {
  return globalThis.crypto?.randomUUID?.() ?? `dev-${Date.now()}-${Math.random().toString(36).slice(2)}`
}

export function defaultMeta(): Meta {
  return { deviceId: newDeviceId(), schemaVersion: SCHEMA_VERSION, lastPulledSeq: 0, accountId: null }
}

export function defaultSettings(): Settings {
  return { ...DEFAULT_SETTINGS, updatedAt: Date.now() }
}

/** Read everything. Called once at boot; the dataset is small by design. */
export async function loadAll(): Promise<Dataset> {
  const db = await getDB()
  const [habits, entries, savedQuotes, settings, meta] = await Promise.all([
    db.getAll('habits'),
    db.getAll('entries'),
    db.getAll('savedQuotes'),
    db.get('kv', 'settings') as Promise<Settings | undefined>,
    db.get('kv', 'meta') as Promise<Meta | undefined>,
  ])

  const resolvedMeta = meta ?? defaultMeta()
  if (!meta) await db.put('kv', resolvedMeta, 'meta')

  return {
    habits,
    entries,
    savedQuotes,
    // Merge rather than replace: a settings object written by an older version
    // is missing any key added since, and a missing key must not read undefined.
    settings: settings ? { ...defaultSettings(), ...settings } : defaultSettings(),
    meta: { ...defaultMeta(), ...resolvedMeta },
  }
}

/**
 * Writes are queued so they land in the order the user made them. Two taps on
 * the same habit a frame apart must not race into the wrong final count.
 */
let queue: Promise<unknown> = Promise.resolve()

export function enqueue<T>(work: () => Promise<T>): Promise<T> {
  const next = queue.then(work, work)
  queue = next.catch(() => {})
  return next
}

export const putHabit = (habit: Habit) =>
  enqueue(async () => (await getDB()).put('habits', habit))

export const putHabits = (habits: Habit[]) =>
  enqueue(async () => {
    const tx = (await getDB()).transaction('habits', 'readwrite')
    await Promise.all([...habits.map((h) => tx.store.put(h)), tx.done])
  })

export const putEntry = (entry: Entry) =>
  enqueue(async () => (await getDB()).put('entries', entry))

export const putEntries = (entries: Entry[]) =>
  enqueue(async () => {
    const tx = (await getDB()).transaction('entries', 'readwrite')
    await Promise.all([...entries.map((e) => tx.store.put(e)), tx.done])
  })

export const putSavedQuote = (quote: SavedQuote) =>
  enqueue(async () => (await getDB()).put('savedQuotes', quote))

export const putSavedQuotes = (quotes: SavedQuote[]) =>
  enqueue(async () => {
    const tx = (await getDB()).transaction('savedQuotes', 'readwrite')
    await Promise.all([...quotes.map((q) => tx.store.put(q)), tx.done])
  })

export const putSettings = (settings: Settings) =>
  enqueue(async () => (await getDB()).put('kv', settings, 'settings'))

export const putMeta = (meta: Meta) =>
  enqueue(async () => (await getDB()).put('kv', meta, 'meta'))

/** Wipe every store. Used by "reset everything" and by a replace-mode import. */
export const clearAll = () =>
  enqueue(async () => {
    const db = await getDB()
    const tx = db.transaction(['habits', 'entries', 'savedQuotes', 'kv'], 'readwrite')
    await Promise.all([
      tx.objectStore('habits').clear(),
      tx.objectStore('entries').clear(),
      tx.objectStore('savedQuotes').clear(),
      tx.objectStore('kv').clear(),
      tx.done,
    ])
  })

/** Wait for every queued write to land. Tests and export use this. */
export const flush = () => enqueue(async () => undefined)
