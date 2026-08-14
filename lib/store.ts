"use client";

/**
 * The client store. See DESIGN.md §7.2.
 *
 * Reads are synchronous from an in-memory cache; writes go through to
 * IndexedDB fire-and-forget. The optimistic path is the *only* path — the UI
 * never awaits a write, because a habit tick that spins is a habit that dies.
 *
 * Subscription is via `useSyncExternalStore`, which is the correct primitive
 * under React 19 concurrent rendering and avoids the tearing an ad-hoc
 * `useState` + emitter would introduce.
 */

import { useEffect, useSyncExternalStore } from "react";
import * as db from "./db";
import { todayKey } from "./dates";
import { applyTheme } from "./theme";
import {
  DEFAULT_SETTINGS,
  entryKey,
  HABIT_COLORS,
  type Cadence,
  type DayKey,
  type Entry,
  type ExportBundle,
  type Habit,
  type HabitColorKey,
  type Settings,
} from "./types";

export type State = {
  /** False until IndexedDB has been read. Gate any data-dependent UI on this. */
  hydrated: boolean;
  habits: Habit[];
  entries: Map<string, Entry>;
  settings: Settings;
};

const EMPTY: State = {
  hydrated: false,
  habits: [],
  entries: new Map(),
  settings: DEFAULT_SETTINGS,
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

// The snapshot is a version counter rather than the state object: it is cheap,
// referentially stable between mutations, and satisfies the invariant that
// getSnapshot must not allocate.
const getSnapshot = () => version;
const getServerSnapshot = () => 0;

/**
 * Subscribe to the store. Returns the live state.
 *
 * On the server and during the first client render this is `EMPTY` with
 * `hydrated: false`, which is what keeps SSR and hydration in agreement.
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
        hydrated: true,
        habits: snapshot.habits,
        entries,
        settings: snapshot.settings,
      };
      // Reconcile the pre-paint localStorage guess with what was actually saved.
      applyTheme(snapshot.settings.theme);
      emit();
    })
    .catch((error) => {
      // Private-mode Safari and similar. Run in memory rather than showing a
      // dead app; the user loses persistence, not the session.
      console.error("hapi: could not open the database", error);
      state = { ...state, hydrated: true };
      emit();
    });

  return hydrating;
}

// ---------------------------------------------------------------------------
// Mutations
// ---------------------------------------------------------------------------

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

/**
 * Advance a habit on a day: 0 → 1 → … → target → 0.
 *
 * Idempotent in the sense that matters — the entry is keyed by
 * `${habitId}:${date}`, so a replayed write can never create a duplicate row.
 */
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
  };

  state = { ...state, habits: [...state.habits, habit] };
  emit();

  persist(() => db.putHabit(habit));
  // Only worth asking once the user has something to lose.
  if (state.habits.length === 1) persist(() => db.requestPersistence());

  return habit;
}

export function updateHabit(id: string, patch: Partial<Omit<Habit, "id">>): void {
  const habits = state.habits.map((h) => (h.id === id ? { ...h, ...patch } : h));
  const updated = habits.find((h) => h.id === id);
  if (!updated) return;

  state = { ...state, habits };
  emit();
  persist(() => db.putHabit(updated));
}

export function deleteHabit(id: string): void {
  const entries = new Map(state.entries);
  for (const key of entries.keys()) {
    if (key.startsWith(`${id}:`)) entries.delete(key);
  }

  state = { ...state, habits: state.habits.filter((h) => h.id !== id), entries };
  emit();
  persist(() => db.deleteHabitRecord(id));
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
  const habits = ordered
    .map((h) =>
      h.id === a.id ? { ...h, order: b.order } : h.id === b.id ? { ...h, order: a.order } : h,
    )
    .sort((x, y) => x.order - y.order);

  state = { ...state, habits };
  emit();
  persist(() => db.putHabits([habits.find((h) => h.id === a.id)!, habits.find((h) => h.id === b.id)!]));
}

export function updateSettings(patch: Partial<Settings>): void {
  const settings = { ...state.settings, ...patch };
  state = { ...state, settings };
  if (patch.theme !== undefined) applyTheme(patch.theme);
  emit();
  persist(() => db.putSettings(settings));
}

export function toggleFavourite(quoteId: string): void {
  const favourites = state.settings.favourites.includes(quoteId)
    ? state.settings.favourites.filter((id) => id !== quoteId)
    : [...state.settings.favourites, quoteId];
  updateSettings({ favourites });
}

// ---------------------------------------------------------------------------
// Backup — the v1 answer to both "back up my streaks" and "move devices"
// ---------------------------------------------------------------------------

export function exportBundle(): ExportBundle {
  return {
    version: 1,
    exportedAt: new Date().toISOString(),
    habits: state.habits,
    entries: [...state.entries.values()],
    settings: state.settings,
  };
}

export type ImportMode = "merge" | "replace";

export function importBundle(bundle: ExportBundle, mode: ImportMode): void {
  if (bundle.version !== 1) {
    throw new Error(`Unsupported backup version: ${bundle.version}`);
  }

  let habits: Habit[];
  let entries: Map<string, Entry>;

  if (mode === "replace") {
    habits = bundle.habits;
    entries = new Map(bundle.entries.map((e) => [entryKey(e.habitId, e.date), e]));
  } else {
    const byId = new Map(state.habits.map((h) => [h.id, h]));
    for (const habit of bundle.habits) if (!byId.has(habit.id)) byId.set(habit.id, habit);
    habits = [...byId.values()];

    entries = new Map(state.entries);
    for (const incoming of bundle.entries) {
      const key = entryKey(incoming.habitId, incoming.date);
      const existing = entries.get(key);
      // Last write wins, which is also the rule a future sync layer will use.
      if (!existing || incoming.updatedAt > existing.updatedAt) entries.set(key, incoming);
    }
  }

  habits = habits
    .sort((a, b) => a.order - b.order)
    .map((h, i) => ({ ...h, order: i }));

  const settings = mode === "replace" ? { ...DEFAULT_SETTINGS, ...bundle.settings } : state.settings;

  state = { hydrated: true, habits, entries, settings };
  emit();

  persist(async () => {
    if (mode === "replace") await db.clearAll();
    await db.putHabits(habits);
    await db.putEntries([...entries.values()]);
    await db.putSettings(settings);
  });
}

export function resetEverything(): void {
  state = { hydrated: true, habits: [], entries: new Map(), settings: DEFAULT_SETTINGS };
  emit();
  persist(() => db.clearAll());
}
