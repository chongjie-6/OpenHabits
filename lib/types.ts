/**
 * Core domain types. See DESIGN.md §3.
 *
 * All dates are local civil dates serialised as `YYYY-MM-DD`. Never store a UTC
 * timestamp for day membership — a 23:00 tick in UTC+11 must land on the day the
 * user actually experienced.
 */

/** 'YYYY-MM-DD' in the user's local timezone. */
export type DayKey = string;

export type HabitColorKey =
  | "green"
  | "blue"
  | "violet"
  | "amber"
  | "rose"
  | "teal";

export const HABIT_COLORS: HabitColorKey[] = [
  "green",
  "blue",
  "violet",
  "amber",
  "rose",
  "teal",
];

export type Cadence =
  /** Every day. */
  | { kind: "daily" }
  /** Specific weekdays. 0 = Sunday … 6 = Saturday. */
  | { kind: "weekdays"; days: number[] }
  /** n times per week, on any days the user likes. */
  | { kind: "weekly"; times: number };

export type Habit = {
  id: string;
  name: string;
  emoji: string;
  color: HabitColorKey;
  cadence: Cadence;
  /** 1 for a simple tick; >1 for counted habits ("Water × 8"). */
  target: number;
  /** Manual sort position, ascending. */
  order: number;
  createdAt: DayKey;
  archivedAt: DayKey | null;
};

export type Entry = {
  habitId: string;
  date: DayKey;
  /** 0 … target, and beyond — overachieving is allowed. */
  count: number;
  /** Epoch ms. Last-write-wins merge key, used by import and by future sync. */
  updatedAt: number;
};

export type QuoteTag =
  | "discipline"
  | "resilience"
  | "craft"
  | "time"
  | "beginning"
  | "doubt"
  | "simplicity"
  | "courage"
  | "growth";

export type Quote = {
  id: string;
  text: string;
  author: string;
  /** Where it actually comes from. Required for anything we can trace. */
  source?: string;
  /** Set when the popular attribution is wrong and we are correcting it. */
  note?: string;
  tags: QuoteTag[];
};

export type Settings = {
  theme: "system" | "light" | "dark";
  /** 0 = Sunday, 1 = Monday. */
  weekStartsOn: 0 | 1;
  /** 0–6. `4` means "the day rolls over at 4am" for night owls. */
  dayStartHour: number;
  /** Saved quote ids. */
  favourites: string[];
};

export const DEFAULT_SETTINGS: Settings = {
  theme: "system",
  weekStartsOn: 1,
  dayStartHour: 0,
  favourites: [],
};

/** Compound primary key for an entry. */
export function entryKey(habitId: string, date: DayKey): string {
  return `${habitId}:${date}`;
}

export type ExportBundle = {
  version: 1;
  exportedAt: string;
  habits: Habit[];
  entries: Entry[];
  settings: Settings;
};
