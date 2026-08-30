/**
 * Every mutation in the app. Each one updates memory, then persists.
 *
 * Two rules hold everywhere in this file:
 *   - stamp `updatedAt` on every write, so last-write-wins has something to
 *     compare and a backup merge can tell which copy is newer;
 *   - delete by tombstone, never by removal, so a delete survives a merge
 *     instead of being undone by the other side's stale copy.
 */

import * as db from './db'
import { entryKey, getState, setState } from './store'
import type { AppState } from './store'
import type { Cadence, Entry, Habit, HabitColor, ISODate, Settings } from './types'

const newId = () =>
  globalThis.crypto?.randomUUID?.() ?? `id-${Date.now()}-${Math.random().toString(36).slice(2)}`

/** Sparse ordering: appending is one write, and a reorder has room to insert. */
const ORDER_STEP = 1000

function nextOrder(s: AppState): number {
  const live = s.habits.filter((h) => !h.deletedAt)
  return live.length ? Math.max(...live.map((h) => h.order)) + ORDER_STEP : ORDER_STEP
}

export interface HabitDraft {
  name: string
  emoji: string
  color: HabitColor
  cadence: Cadence
  target: number
  unit?: string
}

export function addHabit(draft: HabitDraft): Habit {
  const now = Date.now()
  const state = getState()
  const habit: Habit = {
    id: newId(),
    name: draft.name.trim(),
    emoji: draft.emoji,
    color: draft.color,
    cadence: draft.cadence,
    target: Math.max(1, Math.round(draft.target)),
    unit: draft.unit?.trim() || undefined,
    order: nextOrder(state),
    archivedAt: null,
    createdAt: now,
    updatedAt: now,
    deletedAt: null,
  }
  setState({ habits: [...state.habits, habit] })
  void db.putHabit(habit)
  return habit
}

function writeHabit(habit: Habit): void {
  setState({ habits: getState().habits.map((h) => (h.id === habit.id ? habit : h)) })
  void db.putHabit(habit)
}

export function updateHabit(id: string, patch: Partial<HabitDraft>): void {
  const existing = getState().habits.find((h) => h.id === id)
  if (!existing) return
  writeHabit({
    ...existing,
    ...patch,
    name: patch.name !== undefined ? patch.name.trim() : existing.name,
    target: patch.target !== undefined ? Math.max(1, Math.round(patch.target)) : existing.target,
    unit: patch.unit !== undefined ? patch.unit.trim() || undefined : existing.unit,
    updatedAt: Date.now(),
  })
}

export function archiveHabit(id: string, archived: boolean): void {
  const existing = getState().habits.find((h) => h.id === id)
  if (!existing) return
  writeHabit({ ...existing, archivedAt: archived ? Date.now() : null, updatedAt: Date.now() })
}

/** Soft delete. The row stays as a tombstone; its entries go with it. */
export function deleteHabit(id: string): void {
  const now = Date.now()
  const state = getState()
  const habits = state.habits.map((h) =>
    h.id === id ? { ...h, deletedAt: now, updatedAt: now } : h,
  )
  const touched: Entry[] = []
  const entries = state.entries.map((e) => {
    if (e.habitId !== id || e.deletedAt) return e
    const next = { ...e, deletedAt: now, updatedAt: now }
    touched.push(next)
    return next
  })
  setState({ habits, entries })
  void db.putHabits(habits.filter((h) => h.id === id))
  if (touched.length) void db.putEntries(touched)
}

/**
 * Move a habit up or down one place among the active habits.
 *
 * Rewrites the whole active list to evenly spaced orders. With a handful of
 * habits that is cheaper and far less error-prone than juggling gaps.
 */
export function moveHabit(id: string, direction: -1 | 1): void {
  const state = getState()
  const ordered = state.habits
    .filter((h) => !h.deletedAt && !h.archivedAt)
    .sort((a, b) => a.order - b.order || a.createdAt - b.createdAt)
  const from = ordered.findIndex((h) => h.id === id)
  const to = from + direction
  if (from < 0 || to < 0 || to >= ordered.length) return
  ;[ordered[from], ordered[to]] = [ordered[to], ordered[from]]
  reorderHabits(ordered.map((h) => h.id))
}

/** Set the explicit order of the given habit ids, first to last. */
export function reorderHabits(idsInOrder: string[]): void {
  const now = Date.now()
  const rank = new Map(idsInOrder.map((id, i) => [id, (i + 1) * ORDER_STEP]))
  const changed: Habit[] = []
  const habits = getState().habits.map((h) => {
    const order = rank.get(h.id)
    if (order === undefined || order === h.order) return h
    const next = { ...h, order, updatedAt: now }
    changed.push(next)
    return next
  })
  if (!changed.length) return
  setState({ habits })
  void db.putHabits(changed)
}

// ---------------------------------------------------------------------------
// Entries
// ---------------------------------------------------------------------------

/**
 * Set a habit's count for a day. The one write path for ticking, untick,
 * incrementing, and backfilling a past day from the week grid.
 *
 * A count of zero is stored as a tombstone rather than a zero row: "I did not do
 * this" and "I never recorded this" should not be two different states that a
 * merge has to arbitrate between.
 */
export function setCount(habitId: string, date: ISODate, count: number): void {
  const now = Date.now()
  const state = getState()
  const id = entryKey(habitId, date)
  const clamped = Math.max(0, Math.round(count))
  const existing = state.entryIndex.get(id)

  if (!existing && clamped === 0) return

  const next: Entry = {
    id,
    habitId,
    date,
    count: clamped,
    updatedAt: now,
    deletedAt: clamped === 0 ? now : null,
  }
  const entries = existing
    ? state.entries.map((e) => (e.id === id ? next : e))
    : [...state.entries, next]
  setState({ entries })
  void db.putEntry(next)
}

/**
 * Advance a habit one step for a day, wrapping back to zero when complete.
 *
 * A simple habit toggles done/not-done. A counted habit steps 0 → 1 → … → target
 * → 0, so the same tap both records progress and lets you undo an overshoot
 * without a separate control.
 */
export function cycleCount(habit: Habit, date: ISODate, current: number): void {
  const next = current >= habit.target ? 0 : current + 1
  setCount(habit.id, date, next)
}

export function incrementCount(habit: Habit, date: ISODate, current: number, by: number): void {
  setCount(habit.id, date, Math.min(habit.target, Math.max(0, current + by)))
}

// ---------------------------------------------------------------------------
// Quotes, settings, reset
// ---------------------------------------------------------------------------

export function setQuoteSaved(quoteId: number, saved: boolean): void {
  const now = Date.now()
  const state = getState()
  const existing = state.savedQuotes.find((q) => q.id === quoteId)
  const next = {
    id: quoteId,
    savedAt: existing?.savedAt ?? now,
    updatedAt: now,
    deletedAt: saved ? null : now,
  }
  const savedQuotes = existing
    ? state.savedQuotes.map((q) => (q.id === quoteId ? next : q))
    : [...state.savedQuotes, next]
  setState({ savedQuotes })
  void db.putSavedQuote(next)
}

export function updateSettings(patch: Partial<Omit<Settings, 'updatedAt'>>): void {
  const next: Settings = { ...getState().settings, ...patch, updatedAt: Date.now() }
  setState({ settings: next })
  void db.putSettings(next)
}

/** Delete everything, for real — this is the one place rows are not tombstoned. */
export async function resetEverything(): Promise<void> {
  await db.clearAll()
  const meta = { ...getState().meta }
  const settings = db.defaultSettings()
  setState({ habits: [], entries: [], savedQuotes: [], settings, meta })
  await db.putMeta(meta)
  await db.putSettings(settings)
}
