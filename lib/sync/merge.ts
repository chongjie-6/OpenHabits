/**
 * Merging a pulled payload into local state, and choosing what to push.
 *
 * Kept pure and free of both IndexedDB and Postgres so the rules can be tested
 * directly. Everything in this file is a function of its arguments; the store
 * and the driver layers do the writing.
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
   * The subset of the merge that has to reach IndexedDB. Writing only the
   * changed rows keeps a routine sync from rewriting the user's whole history,
   * which on a large account is the difference between a frame and a stall.
   */
  changedHabits: Habit[];
  changedEntries: Entry[];
  settingsChanged: boolean;
  /** Habits newly known to be deleted, whose local entries were dropped. */
  purgedHabitIds: string[];
};

/**
 * Apply a pulled payload to local state under last-write-wins.
 *
 * Habits are merged before entries so that a tombstone arriving in the same
 * payload as its habit's entries is already known by the time those entries are
 * considered — otherwise a deleted habit's history would be reinstated for one
 * sync and pushed back up, resurrecting it.
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

    // A newly-won tombstone is the signal to drop the habit's history. Doing it
    // here rather than in the entry loop means it also happens on a payload that
    // carries the tombstone alone, which is the common case: the deleting device
    // has already dropped the entries, so it has none to send.
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
    // Entries for a habit we know to be gone are dropped rather than stored.
    // The peer that sent them has not applied the tombstone yet; it will.
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
 * `pushedThrough` is a local watermark: the highest `updatedAt` that has been
 * accepted by the server. Anything stamped later is either a local edit or a
 * record pulled from the server whose stamp happens to sit past the watermark.
 * Re-sending the latter is wasteful but harmless — the server's merge is
 * idempotent and the value is identical — and avoiding it would mean tracking a
 * dirty flag per row, which is a second source of truth that can drift out of
 * agreement with the data. One redundant round trip beats a bookkeeping bug.
 *
 * Note what is *not* here: no renumbering of `habit.order`. Import normalises
 * order to 0…n-1, and sync must not, because a device that renumbers on every
 * merge produces a fresh edit on every merge, and two such devices would trade
 * order rewrites forever without the user touching anything.
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

  // Oldest-first truncation, so a backlog drains in order and the watermark can
  // advance to the last row actually sent.
  const complete = habits.length <= limit && entries.length <= limit;

  return {
    habits: habits.slice(0, limit),
    entries: entries.slice(0, limit),
    settings: local.settings.updatedAt > pushedThrough ? local.settings : null,
    complete,
  };
}

/**
 * The watermark to store after a push is accepted.
 *
 * It is the newest stamp actually sent, not `Date.now()`. Using the clock would
 * skip any edit made while the request was in flight: that edit's stamp would
 * fall below the new watermark and never be selected again.
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
