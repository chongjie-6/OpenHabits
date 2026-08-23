"use client";

/**
 * The client store. See DESIGN.md §7.2.
 *
 * Reads are synchronous from an in-memory cache; writes go to IndexedDB
 * fire-and-forget. The optimistic path is the *only* path — the UI never awaits
 * a write, because a habit tick that spins is a habit that dies.
 *
 * `useSyncExternalStore` rather than a `useState` + emitter, which would tear
 * under React 19 concurrent rendering.
 */

import { useEffect, useSyncExternalStore } from "react";
import * as db from "./db";
import { todayKey } from "./dates";
import type { LocalSnapshot, MergeResult } from "./sync/merge";
import { applyTheme } from "./theme";
import {
  DEFAULT_SETTINGS,
  entryKey,
  HABIT_COLORS,
  normaliseHabit,
  type AnyExportBundle,
  type Cadence,
  type DayKey,
  type Entry,
  type ExportBundle,
  type Habit,
  type HabitColorKey,
  type Settings,
} from "./types";

/** What the sync layer is doing, for the benefit of the UI. */
export type SyncStatus =
  | { kind: "off" }
  | { kind: "idle" }
  | { kind: "syncing" }
  | { kind: "error"; message: string };

export type State = {
  /** False until IndexedDB has been read. Gate any data-dependent UI on this. */
  hydrated: boolean;
  /** Live habits only. Deleted ones live in `tombstones` and never reach the UI. */
  habits: Habit[];
  entries: Map<string, Entry>;
  settings: Settings;
  /** Deleted habits, kept out of `habits` so no screen has to filter them. */
  tombstones: Habit[];
  settingsUpdatedAt: number;
  sync: db.SyncMeta;
  syncStatus: SyncStatus;
};

const EMPTY: State = {
  hydrated: false,
  habits: [],
  entries: new Map(),
  settings: DEFAULT_SETTINGS,
  tombstones: [],
  settingsUpdatedAt: 0,
  sync: db.NO_SYNC,
  syncStatus: { kind: "off" },
};

let state: State = EMPTY;
let version = 0;

const listeners = new Set<() => void>();

function emit(): void {
  version++;
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

// A version counter rather than the state object: `getSnapshot` must not
// allocate.
const getSnapshot = () => version;
const getServerSnapshot = () => 0;

/**
 * Subscribe to the store. `EMPTY` with `hydrated: false` on the server and the
 * first client render, which is what keeps SSR and hydration in agreement.
 */
export function useHapi(): State {
  useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  return state;
}

/** Mount once, high in the tree, to read IndexedDB into memory. */
export function useHydrate(): void {
  useEffect(() => {
    void hydrate();
  }, []);
}

let hydrating: Promise<void> | null = null;

function hydrate(): Promise<void> {
  if (state.hydrated) return Promise.resolve();
  if (hydrating) return hydrating;

  hydrating = db
    .loadAll()
    .then((snapshot) => {
      const entries = new Map<string, Entry>();
      for (const entry of snapshot.entries) {
        entries.set(entryKey(entry.habitId, entry.date), entry);
      }
      state = {
        ...state,
        hydrated: true,
        habits: snapshot.habits,
        entries,
        settings: snapshot.settings,
        tombstones: snapshot.tombstones,
        settingsUpdatedAt: snapshot.settingsUpdatedAt,
        sync: snapshot.sync,
      };
      // Reconcile the pre-paint localStorage guess with what was actually saved.
      applyTheme(snapshot.settings.theme);
      emit();
    })
    .catch((error) => {
      // Private-mode Safari and similar. Run in memory rather than showing a
      // dead app — the user loses persistence, not the session.
      console.error("hapi: could not open the database", error);
      state = { ...state, hydrated: true };
      emit();
    });

  return hydrating;
}

function persist(run: () => Promise<unknown>): void {
  void run().catch((error) => {
    console.error("hapi: write failed", error);
  });
}

export function today(): DayKey {
  return todayKey(state.settings.dayStartHour);
}

export function habitById(id: string): Habit | undefined {
  return state.habits.find((h) => h.id === id);
}

export function countFor(habitId: string, date: DayKey): number {
  return state.entries.get(entryKey(habitId, date))?.count ?? 0;
}

/** Advance a habit on a day: 0 → 1 → … → target → 0. */
export function toggleEntry(habitId: string, date: DayKey): void {
  const habit = habitById(habitId);
  if (!habit) return;

  const current = countFor(habitId, date);
  const next = current >= habit.target ? 0 : current + 1;

  setCount(habitId, date, next);
}

export function setCount(habitId: string, date: DayKey, count: number): void {
  const entry: Entry = {
    habitId,
    date,
    count: Math.max(0, count),
    updatedAt: Date.now(),
  };

  const entries = new Map(state.entries);
  entries.set(entryKey(habitId, date), entry);
  state = { ...state, entries };
  emit();

  persist(() => db.putEntry(entry));
}

export type NewHabit = {
  name: string;
  emoji: string;
  color?: HabitColorKey;
  cadence?: Cadence;
  target?: number;
};

export function addHabit(input: NewHabit): Habit {
  const order =
    state.habits.reduce((max, h) => Math.max(max, h.order), -1) + 1;

  const habit: Habit = {
    id: crypto.randomUUID(),
    name: input.name.trim(),
    emoji: input.emoji || "✅",
    // Cycle through the palette so consecutive habits look distinct.
    color: input.color ?? HABIT_COLORS[order % HABIT_COLORS.length],
    cadence: input.cadence ?? { kind: "daily" },
    target: Math.max(1, input.target ?? 1),
    order,
    createdAt: today(),
    archivedAt: null,
    updatedAt: Date.now(),
    deletedAt: null,
  };

  state = { ...state, habits: [...state.habits, habit] };
  emit();

  persist(() => db.putHabit(habit));
  // Only worth asking once the user has something to lose.
  if (state.habits.length === 1) persist(() => db.requestPersistence());

  return habit;
}

export function updateHabit(id: string, patch: Partial<Omit<Habit, "id">>): void {
  // `updatedAt` last, so a caller cannot accidentally pass a stamp that would
  // make this edit lose to the version already on the server.
  const habits = state.habits.map((h) =>
    h.id === id ? { ...h, ...patch, updatedAt: Date.now() } : h,
  );
  const updated = habits.find((h) => h.id === id);
  if (!updated) return;

  state = { ...state, habits };
  emit();
  persist(() => db.putHabit(updated));
}

/**
 * Delete locally and leave a tombstone for the other devices. See
 * `db.deleteHabitRecord` for why the row cannot simply be dropped.
 */
export function deleteHabit(id: string): void {
  const habit = state.habits.find((h) => h.id === id);
  if (!habit) return;

  const tombstone: Habit = { ...habit, deletedAt: Date.now(), updatedAt: Date.now() };

  const entries = new Map(state.entries);
  for (const key of entries.keys()) {
    if (key.startsWith(`${id}:`)) entries.delete(key);
  }

  state = {
    ...state,
    habits: state.habits.filter((h) => h.id !== id),
    tombstones: [...state.tombstones, tombstone],
    entries,
  };
  emit();
  persist(() => db.deleteHabitRecord(tombstone));
}

export function moveHabit(id: string, direction: -1 | 1): void {
  const ordered = [...state.habits].sort((a, b) => a.order - b.order);
  const habit = ordered.find((h) => h.id === id);
  if (!habit) return;

  // Swap within the habit's own group. Active and archived habits are shown as
  // separate lists, so stepping over an archived neighbour would look like the
  // button had done nothing.
  const isActive = (h: Habit) => h.archivedAt === null;
  const group = ordered.filter((h) => isActive(h) === isActive(habit));

  const index = group.indexOf(habit);
  const target = index + direction;
  if (target < 0 || target >= group.length) return;

  const [a, b] = [group[index], group[target]];
  const now = Date.now();
  const habits = ordered
    .map((h) =>
      h.id === a.id
        ? { ...h, order: b.order, updatedAt: now }
        : h.id === b.id
          ? { ...h, order: a.order, updatedAt: now }
          : h,
    )
    .sort((x, y) => x.order - y.order);

  state = { ...state, habits };
  emit();
  persist(() => db.putHabits([habits.find((h) => h.id === a.id)!, habits.find((h) => h.id === b.id)!]));
}

export function updateSettings(patch: Partial<Settings>): void {
  const settings = { ...state.settings, ...patch };
  const settingsUpdatedAt = Date.now();
  state = { ...state, settings, settingsUpdatedAt };
  if (patch.theme !== undefined) applyTheme(patch.theme);
  emit();
  persist(() => db.putSettings(settings, settingsUpdatedAt));
}

export function toggleFavourite(quoteId: string): void {
  const favourites = state.settings.favourites.includes(quoteId)
    ? state.settings.favourites.filter((id) => id !== quoteId)
    : [...state.settings.favourites, quoteId];
  updateSettings({ favourites });
}

/**
 * Tombstones are deliberately left out: a backup is what the user *has*, not a
 * log of what they discarded. Nothing is lost by it — a restored habit carries
 * its original `updatedAt`, so a later tombstone on the account still wins.
 */
export function exportBundle(): ExportBundle {
  return {
    version: 2,
    exportedAt: new Date().toISOString(),
    habits: state.habits,
    entries: [...state.entries.values()],
    settings: state.settings,
  };
}

export type ImportMode = "merge" | "replace";

export function importBundle(bundle: AnyExportBundle, mode: ImportMode): void {
  if (bundle.version !== 1 && bundle.version !== 2) {
    throw new Error(`Unsupported backup version: ${(bundle as { version: number }).version}`);
  }

  // v1 files predate sync and carry no `updatedAt`/`deletedAt`; `normaliseHabit`
  // supplies both without letting an old record outrank a newer edit.
  const incomingHabits = bundle.habits.map(normaliseHabit);

  let habits: Habit[];
  let entries: Map<string, Entry>;

  if (mode === "replace") {
    habits = incomingHabits;
    entries = new Map(bundle.entries.map((e) => [entryKey(e.habitId, e.date), e]));
  } else {
    const byId = new Map(state.habits.map((h) => [h.id, h]));
    for (const habit of incomingHabits) if (!byId.has(habit.id)) byId.set(habit.id, habit);
    habits = [...byId.values()];

    entries = new Map(state.entries);
    for (const incoming of bundle.entries) {
      const key = entryKey(incoming.habitId, incoming.date);
      const existing = entries.get(key);
      // Last write wins — the same rule `lib/sync/merge.ts` applies.
      if (!existing || incoming.updatedAt > existing.updatedAt) entries.set(key, incoming);
    }
  }

  // Renumbering is a genuine local edit, so the habits it touches get a fresh
  // stamp. The rest keep the stamp they came with, which is what stops an old
  // backup from outranking newer server data.
  const now = Date.now();
  habits = habits
    .sort((a, b) => a.order - b.order)
    .map((h, i) => (h.order === i ? h : { ...h, order: i, updatedAt: now }));

  const replacing = mode === "replace";
  const settings = replacing ? { ...DEFAULT_SETTINGS, ...bundle.settings } : state.settings;
  const settingsUpdatedAt = replacing ? now : state.settingsUpdatedAt;

  state = {
    ...state,
    hydrated: true,
    habits,
    entries,
    settings,
    settingsUpdatedAt,
    // A replace drops the tombstones this device was holding: a peer that has
    // not had them yet never will. Accepted, because the alternative is a
    // restore that silently re-deletes the habits it was meant to bring back.
    tombstones: replacing ? [] : state.tombstones,
  };
  emit();

  persist(async () => {
    if (replacing) await db.clearAll();
    await db.putHabits(habits);
    await db.putEntries([...entries.values()]);
    await db.putSettings(settings, settingsUpdatedAt);
    if (replacing) await db.putSyncMeta(state.sync);
  });
}

// The dependency runs one way: `lib/sync/client.ts` imports from here, and this
// file knows nothing about it. That is what keeps the app whole with sync off.

/** The store's contents in the shape `lib/sync/merge.ts` expects. */
export function localSnapshot(): LocalSnapshot {
  return {
    // Recombined here: the merge rules need to see tombstones to apply them,
    // even though no screen does.
    habits: [...state.habits, ...state.tombstones],
    entries: state.entries,
    settings: { value: state.settings, updatedAt: state.settingsUpdatedAt },
  };
}

export function syncMeta(): db.SyncMeta {
  return state.sync;
}

export function setSyncStatus(syncStatus: SyncStatus): void {
  if (state.syncStatus.kind === syncStatus.kind) {
    // Re-rendering the tree for an identical status is pure cost.
    if (syncStatus.kind !== "error") return;
    if ((state.syncStatus as { message: string }).message === syncStatus.message) return;
  }
  state = { ...state, syncStatus };
  emit();
}

export function saveSyncMeta(meta: db.SyncMeta): void {
  state = { ...state, sync: meta };
  emit();
  persist(() => db.putSyncMeta(meta));
}

/**
 * Adopt a merged pull. Memory first, disk after (§7.2): a failed write means the
 * old cursor is re-read and the same payload pulled again, which the merge
 * absorbs. The reverse — a cursor ahead of the data it describes — loses
 * records, so `db.applyMerge` writes both in one transaction.
 */
export function applyPulled(merged: MergeResult, meta: db.SyncMeta): void {
  const { snapshot } = merged;
  const live = snapshot.habits.filter((h) => h.deletedAt === null);
  const tombstones = snapshot.habits.filter((h) => h.deletedAt !== null);

  const themeChanged =
    merged.settingsChanged && snapshot.settings.value.theme !== state.settings.theme;

  state = {
    ...state,
    habits: live,
    tombstones,
    entries: snapshot.entries,
    settings: snapshot.settings.value,
    settingsUpdatedAt: snapshot.settings.updatedAt,
    sync: meta,
  };
  // The pre-paint script in `<head>` reads `localStorage`, so a theme from
  // another device has to be mirrored there to survive the next reload.
  if (themeChanged) applyTheme(snapshot.settings.value.theme);
  emit();

  persist(() =>
    db.applyMerge({
      habits: merged.changedHabits,
      entries: merged.changedEntries,
      purgedHabitIds: merged.purgedHabitIds,
      settings: merged.settingsChanged ? snapshot.settings : null,
      sync: meta,
    }),
  );
}

/**
 * Hand this device over to a different account: signing in as someone else must
 * neither merge two people's habits nor push the previous account's data up
 * under the new identity. Emptied and reset, so the new account's history
 * arrives as a first sync.
 */
export function adoptAccount(accountId: string | null): void {
  const meta: db.SyncMeta = { ...db.NO_SYNC, accountId };

  state = {
    ...state,
    habits: [],
    tombstones: [],
    entries: new Map(),
    settings: DEFAULT_SETTINGS,
    settingsUpdatedAt: 0,
    sync: meta,
  };
  applyTheme(DEFAULT_SETTINGS.theme);
  emit();

  persist(async () => {
    await db.clearAll();
    await db.putSyncMeta(meta);
  });
}

/**
 * Delete everything on this device — and, if signed in, everywhere else.
 *
 * The habits become tombstones rather than vanishing: on a synced account a
 * local-only wipe is undone by the next pull, so the button would appear to work
 * and then quietly put a year of data back.
 */
export function resetEverything(): void {
  const now = Date.now();
  const tombstones = [
    ...state.tombstones,
    ...state.habits.map((h) => ({ ...h, deletedAt: now, updatedAt: now })),
  ];

  state = {
    ...state,
    hydrated: true,
    habits: [],
    entries: new Map(),
    settings: DEFAULT_SETTINGS,
    settingsUpdatedAt: now,
    tombstones,
  };
  emit();

  persist(async () => {
    await db.clearAll();
    await db.putHabits(tombstones);
    await db.putSettings(DEFAULT_SETTINGS, now);
    await db.putSyncMeta(state.sync);
  });
}
