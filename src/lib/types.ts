/**
 * The shared vocabulary of OpenHabits.
 *
 * Two invariants hold across every mutable record and matter more than they look:
 *
 *   1. `updatedAt` + `deletedAt` on everything. Records are never hard-removed;
 *      a delete writes a tombstone. This is what lets last-write-wins sync be
 *      dropped in later without a migration, and what makes a backup merge
 *      idempotent today.
 *   2. Natural keys. An entry is keyed `${habitId}:${date}`, so writing the same
 *      day twice — from the UI, an import, or a future pull — converges instead
 *      of duplicating.
 */

/** A local calendar day, 'YYYY-MM-DD'. Never a timestamp, never UTC-shifted. */
export type ISODate = string

/** Day of week, 0 = Sunday … 6 = Saturday (matches `Date.prototype.getDay`). */
export type Weekday = 0 | 1 | 2 | 3 | 4 | 5 | 6

export type HabitColor = 'rose' | 'amber' | 'emerald' | 'sky' | 'violet' | 'slate'

export const HABIT_COLORS: readonly HabitColor[] = [
  'rose',
  'amber',
  'emerald',
  'sky',
  'violet',
  'slate',
]

export type Cadence =
  /** Every day. */
  | { kind: 'daily' }
  /** Only on the listed weekdays; the others are rest days. */
  | { kind: 'weekdays'; days: Weekday[] }
  /** Any n days within a week — which days is up to you. */
  | { kind: 'timesPerWeek'; times: number }

export interface Habit {
  id: string
  name: string
  emoji: string
  color: HabitColor
  cadence: Cadence
  /** 1 = a plain tick row. >1 = a counter row, e.g. "Water × 8". */
  target: number
  /** Optional counter unit, e.g. "glasses". Only meaningful when target > 1. */
  unit?: string
  /** Manual ordering. Sparse (1000, 2000, …) so a reorder is one write. */
  order: number
  archivedAt: number | null
  createdAt: number
  updatedAt: number
  deletedAt: number | null
}

/** One habit on one day. */
export interface Entry {
  /** `${habitId}:${date}` — the natural key. */
  id: string
  habitId: string
  date: ISODate
  /** Times done that day. Compared against the habit's target. */
  count: number
  updatedAt: number
  deletedAt: number | null
}

export interface SavedQuote {
  /** The quote's id in the corpus. */
  id: number
  savedAt: number
  updatedAt: number
  deletedAt: number | null
}

export interface ReminderSettings {
  enabled: boolean
  /** 'HH:MM', local time. */
  morning: string
  /** 'HH:MM', local time. */
  evening: string
}

export interface Settings {
  theme: 'system' | 'light' | 'dark'
  /** 0 = weeks start Sunday, 1 = Monday. */
  weekStart: 0 | 1
  /** 0–23. "Today" doesn't roll over until this hour — for night owls. */
  rolloverHour: number
  /** Stored now; acted on when push reminders land. */
  reminders: ReminderSettings
  /** Whether /stats shows the full 53-week year or the compact 20 weeks. */
  expandedHeatmap: boolean
  updatedAt: number
}

/** Device-local bookkeeping. Never merged, never exported. */
export interface Meta {
  deviceId: string
  schemaVersion: number
  /** Sync cursor. Unused until a server exists; reserved so it can't be forgotten. */
  lastPulledSeq: number
  accountId: string | null
}

export interface Quote {
  id: number
  text: string
  author: string
  source?: string
  tags: string[]
}

/** What a habit did on a given day, once its cadence is taken into account. */
export type DayStatus = 'done' | 'partial' | 'missed' | 'rest' | 'future'

export const DEFAULT_SETTINGS: Omit<Settings, 'updatedAt'> = {
  theme: 'system',
  weekStart: 1,
  rolloverHour: 0,
  reminders: { enabled: false, morning: '08:00', evening: '20:00' },
  expandedHeatmap: false,
}
