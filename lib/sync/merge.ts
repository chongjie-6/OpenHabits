/**
 * Merging a pulled payload into local state, and choosing what to push.
 *
 * Pure and free of both IndexedDB and Postgres, so the rules can be tested
 * directly. The store and driver layers do the writing.
 */

import { entryKey, type Entry, type Habit, type Settings } from "../types";
import {
  fingerprintEntry,
  fingerprintHabit,
  fingerprintSettings,
  MAX_ROWS_PER_REQUEST,
  wins,
} from "./protocol";

export type LocalSnapshot = {
  /** Includes tombstones. Filtering them out is the store's job, not the merge's. */
  habits: Habit[];
  entries: Map<string, Entry>;
  settings: { value: Settings; updatedAt: number };
};

export type Incoming = {
  habits: Habit[];
  entries: Entry[];
  settings: { value: Settings; updatedAt: number } | null;
};

export type MergeResult = {
  snapshot: LocalSnapshot;
  /**
   * The subset of the merge that has to reach IndexedDB. Writing only changed
   * rows keeps a routine sync from rewriting the user's whole history, which on
   * a large account is the difference between a frame and a stall.
   */
  changedHabits: Habit[];
  changedEntries: Entry[];
  settingsChanged: boolean;
  /** Habits newly known to be deleted, whose local entries were dropped. */
  purgedHabitIds: string[];
};

/**
 * Apply a pulled payload under last-write-wins. Habits merge before entries, so a
 * tombstone arriving alongside its habit's entries is already known when those
 * entries are considered — otherwise the history is reinstated and pushed back
 * up, resurrecting the habit.
 */
export function mergeIncoming(local: LocalSnapshot, incoming: Incoming): MergeResult {
  const habits = new Map(local.habits.map((h) => [h.id, h]));
  const changedHabits: Habit[] = [];
  const purgedHabitIds: string[] = [];

  for (const habit of incoming.habits) {
    const existing = habits.get(habit.id);
    if (!wins(habit, existing, fingerprintHabit)) continue;

    habits.set(habit.id, habit);
    changedHabits.push(habit);

    // Here rather than in the entry loop, so it also happens on a payload
    // carrying the tombstone alone — the common case, since the deleting device
    // has already dropped the entries and has none to send.
    if (habit.deletedAt !== null && existing?.deletedAt == null) {
      purgedHabitIds.push(habit.id);
    }
  }

  const entries = new Map(local.entries);
  for (const id of purgedHabitIds) {
    for (const key of entries.keys()) {
      if (key.startsWith(`${id}:`)) entries.delete(key);
    }
  }

  const changedEntries: Entry[] = [];
  for (const entry of incoming.entries) {
    // The peer that sent these has not applied the tombstone yet; it will.
    const habit = habits.get(entry.habitId);
    if (!habit || habit.deletedAt !== null) continue;

    const key = entryKey(entry.habitId, entry.date);
    if (!wins(entry, entries.get(key), fingerprintEntry)) continue;

    entries.set(key, entry);
    changedEntries.push(entry);
  }

  const settingsChanged =
    incoming.settings !== null &&
    wins(incoming.settings, local.settings, fingerprintSettings);

  return {
    snapshot: {
      // Tombstones sort with everything else; the store filters them on read.
      habits: [...habits.values()].sort((a, b) => a.order - b.order),
      entries,
      settings: settingsChanged ? incoming.settings! : local.settings,
    },
    changedHabits,
    changedEntries,
    settingsChanged,
    purgedHabitIds,
  };
}

/**
 * Choose the local records to send.
 *
 * `pushedThrough` is the highest `updatedAt` the server has accepted. Anything
 * later is a local edit — or a pulled record whose stamp sits past the watermark,
 * which is re-sent wastefully but harmlessly. Avoiding that would mean a dirty
 * flag per row: a second source of truth that can drift.
 *
 * Note what is *not* here: no renumbering of `habit.order`. A device that
 * renumbers on every merge produces an edit on every merge, and two of them would
 * trade order rewrites forever with the user touching nothing.
 */
export function collectPush(
  local: LocalSnapshot,
  pushedThrough: number,
  limit: number = MAX_ROWS_PER_REQUEST,
): { habits: Habit[]; entries: Entry[]; settings: LocalSnapshot["settings"] | null; complete: boolean } {
  const habits = local.habits
    .filter((h) => h.updatedAt > pushedThrough)
    .sort((a, b) => a.updatedAt - b.updatedAt);

  const entries = [...local.entries.values()]
    .filter((e) => e.updatedAt > pushedThrough)
    .sort((a, b) => a.updatedAt - b.updatedAt);

  const settings = local.settings.updatedAt > pushedThrough ? local.settings : null;

  /**
   * One cutoff for every collection, the push-side twin of the server's
   * `resumePoint` (§13.5). The watermark is a single number, so truncating each
   * collection on its own lets a newer habit or settings stamp carry it past
   * entries that were never sent — a first sync of a long history would upload
   * 500 days and silently skip the rest.
   */
  const cutoff = Math.min(cutAt(habits, limit), cutAt(entries, limit));
  if (cutoff === Infinity) return { habits, entries, settings, complete: true };

  const sent = (record: { updatedAt: number }) => record.updatedAt <= cutoff;
  return {
    // Sliced as well as filtered for the one case `cutAt` cannot avoid.
    habits: habits.filter(sent).slice(0, limit),
    entries: entries.filter(sent).slice(0, limit),
    settings: settings && sent(settings) ? settings : null,
    complete: false,
  };
}

/**
 * The highest stamp through which `rows` (sorted oldest-first) fits in one
 * request: just below the first row that does not fit, so a run of equal stamps
 * is never split — the watermark would land on that stamp and step over the half
 * left behind.
 *
 * When more than `limit` rows share the oldest pending stamp no cut avoids a
 * split, and the tie is broken the way it always was: the first `limit` go and
 * the rest are stepped over. Only `restore` of a habit with a very long history
 * stamps that many rows alike.
 */
function cutAt(rows: { updatedAt: number }[], limit: number): number {
  if (rows.length <= limit) return Infinity;
  const below = rows[limit].updatedAt - 1;
  return below >= rows[0].updatedAt ? below : rows[limit - 1].updatedAt;
}

/**
 * The newest stamp actually sent, not `Date.now()`: the clock would skip any edit
 * made while the request was in flight, leaving its stamp below the new watermark
 * and never selected again.
 */
export function watermarkAfterPush(
  sent: { habits: Habit[]; entries: Entry[]; settings: { updatedAt: number } | null },
  previous: number,
): number {
  let max = previous;
  for (const h of sent.habits) max = Math.max(max, h.updatedAt);
  for (const e of sent.entries) max = Math.max(max, e.updatedAt);
  if (sent.settings) max = Math.max(max, sent.settings.updatedAt);
  return max;
}
