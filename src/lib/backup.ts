/**
 * JSON export and import.
 *
 * Import is the same merge a sync would do, run by hand: last-write-wins on
 * `updatedAt`, tombstones respected, entries keyed by `habitId:date`. That makes
 * re-importing the same file a no-op, which is the property that matters — the
 * common mistake is to import twice and end up with everything duplicated.
 *
 * Two formats are accepted. **v2** is what this app writes. **v1** is the older,
 * flatter shape without `updatedAt`/`deletedAt`; `migrateV1` fills in what it
 * lacks rather than rejecting the file.
 */

import * as db from './db'
import { entryKey, getState, setState } from './store'
import type { Entry, Habit, HabitColor, SavedQuote, Settings } from './types'
import { DEFAULT_SETTINGS, HABIT_COLORS } from './types'
import { isValidISO } from './date'

export const BACKUP_VERSION = 2

export interface BackupV2 {
  version: 2
  exportedAt: number
  habits: Habit[]
  entries: Entry[]
  savedQuotes: SavedQuote[]
  settings: Settings
}

export type ImportMode = 'merge' | 'replace'

export interface ImportReport {
  mode: ImportMode
  sourceVersion: number
  habits: number
  entries: number
  savedQuotes: number
  /** Records skipped because the copy already here was newer. */
  skipped: number
}

export function exportData(): BackupV2 {
  const s = getState()
  return {
    version: BACKUP_VERSION,
    exportedAt: Date.now(),
    habits: s.habits,
    entries: s.entries,
    savedQuotes: s.savedQuotes,
    settings: s.settings,
  }
}

export function exportFilename(now = new Date()): string {
  const iso = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
  return `openhabits-${iso}.json`
}

// ---------------------------------------------------------------------------
// Parsing — a backup file is untrusted input; treat it like one.
// ---------------------------------------------------------------------------

const isObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v)

const asArray = (v: unknown): unknown[] => (Array.isArray(v) ? v : [])

const num = (v: unknown, fallback: number): number =>
  typeof v === 'number' && Number.isFinite(v) ? v : fallback

const str = (v: unknown, fallback: string): string => (typeof v === 'string' ? v : fallback)

const nullableNum = (v: unknown): number | null =>
  typeof v === 'number' && Number.isFinite(v) ? v : null

function parseColor(v: unknown): HabitColor {
  return HABIT_COLORS.includes(v as HabitColor) ? (v as HabitColor) : 'sky'
}

function parseCadence(v: unknown, legacyDays: unknown): Habit['cadence'] {
  if (isObject(v)) {
    if (v.kind === 'daily') return { kind: 'daily' }
    if (v.kind === 'weekdays') {
      const days = asArray(v.days)
        .filter((d): d is number => typeof d === 'number' && d >= 0 && d <= 6)
        .map((d) => Math.round(d) as 0 | 1 | 2 | 3 | 4 | 5 | 6)
      return { kind: 'weekdays', days: [...new Set(days)] }
    }
    if (v.kind === 'timesPerWeek') {
      return { kind: 'timesPerWeek', times: Math.max(1, Math.min(7, Math.round(num(v.times, 3)))) }
    }
  }
  // v1 stored a bare weekday array, or nothing at all for a daily habit.
  const days = asArray(legacyDays).filter(
    (d): d is 0 | 1 | 2 | 3 | 4 | 5 | 6 => typeof d === 'number' && d >= 0 && d <= 6,
  )
  if (days.length && days.length < 7) return { kind: 'weekdays', days }
  return { kind: 'daily' }
}

function parseHabit(raw: unknown, fallbackOrder: number, now: number): Habit | null {
  if (!isObject(raw)) return null
  const id = str(raw.id, '')
  if (!id) return null
  const createdAt = num(raw.createdAt, now)
  return {
    id,
    name: str(raw.name, 'Untitled'),
    emoji: str(raw.emoji, '✅'),
    color: parseColor(raw.color),
    cadence: parseCadence(raw.cadence, raw.days),
    target: Math.max(1, Math.round(num(raw.target, 1))),
    unit: typeof raw.unit === 'string' && raw.unit ? raw.unit : undefined,
    order: num(raw.order, fallbackOrder),
    archivedAt: nullableNum(raw.archivedAt) ?? (raw.archived === true ? createdAt : null),
    createdAt,
    // v1 has no updatedAt. Falling back to createdAt keeps merges deterministic,
    // and means an imported v1 record loses to anything edited since.
    updatedAt: num(raw.updatedAt, createdAt),
    deletedAt: nullableNum(raw.deletedAt),
  }
}

function parseEntry(raw: unknown, now: number): Entry | null {
  if (!isObject(raw)) return null
  const habitId = str(raw.habitId, '')
  const date = str(raw.date, '')
  if (!habitId || !isValidISO(date)) return null
  const count = Math.max(0, Math.round(num(raw.count, raw.done === true ? 1 : 0)))
  const deletedAt = nullableNum(raw.deletedAt) ?? (count === 0 ? now : null)
  return {
    // Always recompute the key: a v1 file may have used a different id scheme,
    // and two rows for one habit-day must collapse into one.
    id: entryKey(habitId, date),
    habitId,
    date,
    count,
    updatedAt: num(raw.updatedAt, now),
    deletedAt,
  }
}

function parseSavedQuote(raw: unknown, now: number): SavedQuote | null {
  // v1 saved favourites as a bare array of ids.
  if (typeof raw === 'number') {
    return { id: raw, savedAt: now, updatedAt: now, deletedAt: null }
  }
  if (!isObject(raw) || typeof raw.id !== 'number') return null
  const savedAt = num(raw.savedAt, now)
  return {
    id: raw.id,
    savedAt,
    updatedAt: num(raw.updatedAt, savedAt),
    deletedAt: nullableNum(raw.deletedAt),
  }
}

function parseSettings(raw: unknown): Settings {
  const base: Settings = { ...DEFAULT_SETTINGS, updatedAt: 0 }
  if (!isObject(raw)) return base
  const theme = raw.theme
  const reminders = isObject(raw.reminders) ? raw.reminders : {}
  return {
    theme: theme === 'light' || theme === 'dark' || theme === 'system' ? theme : base.theme,
    weekStart: raw.weekStart === 0 || raw.weekStart === 1 ? raw.weekStart : base.weekStart,
    rolloverHour: Math.max(0, Math.min(23, Math.round(num(raw.rolloverHour, base.rolloverHour)))),
    reminders: {
      enabled: reminders.enabled === true,
      morning: str(reminders.morning, base.reminders.morning),
      evening: str(reminders.evening, base.reminders.evening),
    },
    expandedHeatmap: raw.expandedHeatmap === true,
    updatedAt: num(raw.updatedAt, 0),
  }
}

export interface ParsedBackup {
  version: number
  habits: Habit[]
  entries: Entry[]
  savedQuotes: SavedQuote[]
  settings: Settings
}

/** Normalise any accepted backup shape into the current one. Throws on garbage. */
export function parseBackup(input: unknown, now = Date.now()): ParsedBackup {
  if (!isObject(input)) throw new Error('That file is not an OpenHabits backup.')
  const version = num(input.version, 1)
  if (version > BACKUP_VERSION) {
    throw new Error(
      `This backup was written by a newer version of OpenHabits (format ${version}). Update the app first.`,
    )
  }

  const habits = asArray(input.habits)
    .map((h, i) => parseHabit(h, (i + 1) * 1000, now))
    .filter((h): h is Habit => h !== null)

  const entries = asArray(input.entries)
    .map((e) => parseEntry(e, now))
    .filter((e): e is Entry => e !== null)

  const savedQuotes = asArray(input.savedQuotes ?? input.saved)
    .map((q) => parseSavedQuote(q, now))
    .filter((q): q is SavedQuote => q !== null)

  if (!habits.length && !entries.length && !savedQuotes.length) {
    throw new Error('That file has no habits, entries or saved quotes in it.')
  }

  return { version, habits, entries, savedQuotes, settings: parseSettings(input.settings) }
}

// ---------------------------------------------------------------------------
// Merge
// ---------------------------------------------------------------------------

/**
 * Last-write-wins by `updatedAt`, with the incoming copy losing ties.
 *
 * Losing ties matters: importing the same file twice must change nothing the
 * second time, and equal timestamps mean equal records.
 */
function mergeById<T extends { id: string | number; updatedAt: number }>(
  mine: T[],
  theirs: T[],
): { merged: T[]; applied: number; skipped: number } {
  const byId = new Map<string | number, T>(mine.map((r) => [r.id, r]))
  let applied = 0
  let skipped = 0
  for (const incoming of theirs) {
    const existing = byId.get(incoming.id)
    if (existing && existing.updatedAt >= incoming.updatedAt) {
      skipped++
      continue
    }
    byId.set(incoming.id, incoming)
    applied++
  }
  return { merged: [...byId.values()], applied, skipped }
}

export async function importBackup(
  input: unknown,
  mode: ImportMode,
  now = Date.now(),
): Promise<ImportReport> {
  const parsed = parseBackup(input, now)

  if (mode === 'replace') {
    await db.clearAll()
    const meta = getState().meta
    setState({
      habits: parsed.habits,
      entries: parsed.entries,
      savedQuotes: parsed.savedQuotes,
      settings: { ...parsed.settings, updatedAt: now },
      meta,
    })
    await Promise.all([
      db.putHabits(parsed.habits),
      db.putEntries(parsed.entries),
      db.putSavedQuotes(parsed.savedQuotes),
      db.putSettings(getState().settings),
      db.putMeta(meta),
    ])
    return {
      mode,
      sourceVersion: parsed.version,
      habits: parsed.habits.length,
      entries: parsed.entries.length,
      savedQuotes: parsed.savedQuotes.length,
      skipped: 0,
    }
  }

  const state = getState()
  const habits = mergeById(state.habits, parsed.habits)
  const entries = mergeById(state.entries, parsed.entries)
  const savedQuotes = mergeById(state.savedQuotes, parsed.savedQuotes)
  // Settings are one record, so they follow the same last-write-wins rule.
  const settings =
    parsed.settings.updatedAt > state.settings.updatedAt ? parsed.settings : state.settings

  setState({
    habits: habits.merged,
    entries: entries.merged,
    savedQuotes: savedQuotes.merged,
    settings,
  })

  await Promise.all([
    db.putHabits(habits.merged),
    db.putEntries(entries.merged),
    db.putSavedQuotes(savedQuotes.merged),
    db.putSettings(settings),
  ])

  return {
    mode,
    sourceVersion: parsed.version,
    habits: habits.applied,
    entries: entries.applied,
    savedQuotes: savedQuotes.applied,
    skipped: habits.skipped + entries.skipped + savedQuotes.skipped,
  }
}

/** Trigger a download of the current data. Browser-only. */
export function downloadBackup(): void {
  const blob = new Blob([JSON.stringify(exportData(), null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = exportFilename()
  document.body.append(link)
  link.click()
  link.remove()
  // Revoke on the next tick; revoking synchronously can cancel the download.
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
