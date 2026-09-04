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

/** A user-picked colour, lowercase `#rrggbb`. */
export type HexColor = `#${string}`;

/**
 * A palette key or any colour the user picked. Keys stay keys rather than being
 * flattened to hex on save: each one resolves to a different value per theme
 * (see `app/globals.css`), and a stored hex can only ever be one of the two.
 */
export type HabitColor = HabitColorKey | HexColor;

export function isHexColor(value: unknown): value is HexColor {
  return typeof value === "string" && /^#[0-9a-f]{6}$/i.test(value);
}

/** Palette keys pass through; a hex is lowercased so the sync fingerprint is stable. */
export function normaliseHabitColor(value: string): HabitColor | null {
  if (HABIT_COLORS.includes(value as HabitColorKey)) return value as HabitColorKey;
  return isHexColor(value) ? (value.toLowerCase() as HexColor) : null;
}

export type Cadence =
  /** Every day. */
  | { kind: "daily" }
  /** Specific weekdays. 0 = Sunday … 6 = Saturday. */
  | { kind: "weekdays"; days: number[] }
  /** n times per week, on any days the user likes. */
  | { kind: "weekly"; times: number };

/**
 * Sync metadata carried by every record that syncs. See DESIGN.md §13.
 *
 * The unit split is deliberate: `createdAt`/`archivedAt` are civil dates because
 * they answer domain questions and must not shift under a timezone.
 * `updatedAt`/`deletedAt` are epoch ms because a day's resolution would make
 * every same-day edit a tie.
 */
export type Synced = {
  /** Epoch ms of the last local edit. Last-write-wins merge key. */
  updatedAt: number;
  /**
   * Epoch ms of deletion, or null if live. Kept as a tombstone rather than
   * removed: on a replicated store a missing row is indistinguishable from one
   * the peer has not seen yet.
   */
  deletedAt: number | null;
};

export type Habit = Synced & {
  id: string;
  name: string;
  emoji: string;
  color: HabitColor;
  cadence: Cadence;
  /** 1 for a simple tick; >1 for counted habits ("Water × 8"). */
  target: number;
  /** Manual sort position, ascending. */
  order: number;
  createdAt: DayKey;
  archivedAt: DayKey | null;
};

/**
 * A habit's state on one day.
 *
 * Entries carry no tombstone by decision, not omission. "Not done" is `count: 0`,
 * a value LWW merges like any other, and the only bulk removal is a habit
 * deletion whose own tombstone already tells peers to drop the entries. A second
 * tombstone per entry would add no information and multiply the synced rows by
 * the length of the user's history.
 */
export type Entry = {
  habitId: string;
  date: DayKey;
  /** 0 … target, and beyond — overachieving is allowed. */
  count: number;
  /** Epoch ms. Last-write-wins merge key, used by import and by sync. */
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

/**
 * The synced half of a user's preferences. Appearance is **not** in here —
 * `theme`, `skin` and `palette` are all device-local (`lib/theme.ts`,
 * `lib/skin.ts`), because a look chosen on a phone has no business repainting a
 * laptop. See DESIGN.md §13.8 #1.
 */
export type Settings = {
  /** 0 = Sunday, 1 = Monday. */
  weekStartsOn: 0 | 1;
  /** 0–6. `4` means "the day rolls over at 4am" for night owls. */
  dayStartHour: number;
  /**
   * Wall-clock hour, 0–23, at which the daily reminder is sent. A preference
   * rather than a switch: whether a reminder arrives at all is whether *this
   * device* holds a push subscription, which is per device and lives on the
   * server (see DESIGN.md §8.5). The hour rides in the synced blob so a phone
   * and a laptop cannot disagree about when morning is.
   */
  reminderHour: number;
  /**
   * Buzz on a tick, where the device has a motor. Inert rather than hidden on
   * hardware that cannot vibrate: the toggle would otherwise vanish from the
   * one screen — a desktop — where a user is most likely to be configuring the
   * phone they carry.
   */
  haptics: boolean;
  /** Saved quote ids. */
  favourites: string[];
};

export const DEFAULT_SETTINGS: Settings = {
  weekStartsOn: 1,
  dayStartHour: 0,
  reminderHour: 9,
  haptics: true,
  favourites: [],
};

/**
 * Settings sync as a single last-write-wins blob rather than per field. A
 * conflict means one person edited two devices between syncs, and the losing
 * edit is a toggle they can flip back — every field left in here is a decision
 * about *behaviour*, which should be the same everywhere the account is signed
 * in. Appearance was the exception that made the blob wrong, and it left.
 */
export type SyncedSettings = {
  value: Settings;
  /** Epoch ms of the last settings change. */
  updatedAt: number;
};

/** Compound primary key for an entry. */
export function entryKey(habitId: string, date: DayKey): string {
  return `${habitId}:${date}`;
}

/**
 * Backup file format. v1 predates sync and its metadata; `normaliseHabit` fills
 * that in. Bumping the version rather than silently widening v1 keeps a v2 file
 * out of an old build that would drop the new fields on the next write.
 */
export type ExportBundle = {
  version: 2;
  exportedAt: string;
  habits: Habit[];
  entries: Entry[];
  settings: Settings;
};

/** A v1 habit: everything except the sync metadata. */
type LegacyHabit = Omit<Habit, keyof Synced> & Partial<Synced>;

export type AnyExportBundle =
  | ExportBundle
  | {
      version: 1;
      exportedAt: string;
      habits: LegacyHabit[];
      entries: Entry[];
      settings: Settings;
    };

/**
 * Fill in sync metadata a v1 backup could not have carried. `updatedAt` falls
 * back to the creation day rather than "now", so an old backup's stale habits
 * cannot outrank edits already on the server.
 */
export function normaliseHabit(habit: LegacyHabit): Habit {
  if (habit.updatedAt !== undefined) {
    return { ...habit, updatedAt: habit.updatedAt, deletedAt: habit.deletedAt ?? null };
  }

  // An unparseable createdAt falls back to 0, the stamp that loses every merge.
  const created = Date.parse(`${habit.createdAt}T00:00:00Z`);
  return {
    ...habit,
    updatedAt: Number.isNaN(created) ? 0 : created,
    deletedAt: habit.deletedAt ?? null,
  };
}
