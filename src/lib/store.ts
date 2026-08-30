/**
 * The in-memory mirror of the database, and the only thing React subscribes to.
 *
 * The whole dataset is small — a year of ten habits is a few thousand rows — so
 * it is loaded once at boot and kept in memory. That single decision is what
 * lets streaks, heatmaps and completion rates be *derived synchronously* during
 * render instead of cached in the database. Nothing that can be computed is ever
 * stored, so nothing can go stale or disagree with itself.
 *
 * Mutations update memory first and persist behind the UI (see `db.enqueue`), so
 * a tick paints on the next frame rather than after a round trip to IndexedDB.
 */

import { useSyncExternalStore } from 'react'
import { defaultMeta, defaultSettings, loadAll } from './db'
import type { Entry, Habit, Meta, SavedQuote, Settings } from './types'

export interface AppState {
  /** False until the first read from IndexedDB completes. */
  ready: boolean
  /** Everything, including archived habits and tombstones. Use the selectors. */
  habits: Habit[]
  entries: Entry[]
  savedQuotes: SavedQuote[]
  settings: Settings
  meta: Meta
  /** Fast lookup, keyed exactly like `Entry.id`. */
  entryIndex: Map<string, Entry>
}

export const entryKey = (habitId: string, date: string) => `${habitId}:${date}`

function index(entries: Entry[]): Map<string, Entry> {
  const map = new Map<string, Entry>()
  for (const e of entries) map.set(e.id, e)
  return map
}

const EMPTY: AppState = {
  ready: false,
  habits: [],
  entries: [],
  savedQuotes: [],
  settings: defaultSettings(),
  meta: defaultMeta(),
  entryIndex: new Map(),
}

let state: AppState = EMPTY
const listeners = new Set<() => void>()

function emit() {
  for (const listener of listeners) listener()
}

function subscribe(listener: () => void) {
  listeners.add(listener)
  return () => void listeners.delete(listener)
}

const getSnapshot = () => state

/**
 * During a server render the state cannot change, so the current value is a
 * valid server snapshot. At prerender time that value *is* `EMPTY` — there is no
 * IndexedDB to hydrate from — which is what makes the built HTML the app's
 * skeleton. Returning live state rather than a hardcoded `EMPTY` also lets tests
 * render a seeded app to a string without needing a DOM.
 */
const getServerSnapshot = () => state

export function getState(): AppState {
  return state
}

/** Replace state and notify. Every mutation funnels through here. */
export function setState(patch: Partial<AppState>): void {
  state = { ...state, ...patch }
  if (patch.entries) state.entryIndex = index(patch.entries)
  emit()
}

/** Read the database into memory. Safe to call more than once. */
export async function hydrate(): Promise<void> {
  const data = await loadAll()
  state = {
    ready: true,
    habits: data.habits,
    entries: data.entries,
    savedQuotes: data.savedQuotes,
    settings: data.settings,
    meta: data.meta,
    entryIndex: index(data.entries),
  }
  emit()
}

/** Reset the mirror without touching the database. Used by tests and by import. */
export function resetState(next?: Partial<AppState>): void {
  state = { ...EMPTY, ready: true, settings: defaultSettings(), meta: state.meta, ...next }
  state.entryIndex = index(state.entries)
  emit()
}

export function useAppState(): AppState {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot)
}

// ---------------------------------------------------------------------------
// Selectors — plain functions over state, so they work in tests and in render.
// ---------------------------------------------------------------------------

const byOrder = (a: Habit, b: Habit) => a.order - b.order || a.createdAt - b.createdAt

/** Habits you actually track: not deleted, not archived, in your chosen order. */
export function activeHabits(s: AppState): Habit[] {
  return s.habits.filter((h) => !h.deletedAt && !h.archivedAt).sort(byOrder)
}

/** Archived but not deleted — shown only in Settings. */
export function archivedHabits(s: AppState): Habit[] {
  return s.habits.filter((h) => !h.deletedAt && h.archivedAt).sort(byOrder)
}

/** Everything a live habit could be, archived included. History needs these. */
export function visibleHabits(s: AppState): Habit[] {
  return s.habits.filter((h) => !h.deletedAt).sort(byOrder)
}

export function findHabit(s: AppState, id: string | null): Habit | undefined {
  if (!id) return undefined
  return s.habits.find((h) => h.id === id && !h.deletedAt)
}

/** How many times a habit was done on a day. Tombstones read as zero. */
export function countFor(s: AppState, habitId: string, date: string): number {
  const entry = s.entryIndex.get(entryKey(habitId, date))
  return entry && !entry.deletedAt ? entry.count : 0
}

export function isQuoteSaved(s: AppState, quoteId: number): boolean {
  return s.savedQuotes.some((q) => q.id === quoteId && !q.deletedAt)
}

export function savedQuoteIds(s: AppState): number[] {
  return s.savedQuotes.filter((q) => !q.deletedAt).map((q) => q.id)
}
