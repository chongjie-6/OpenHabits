/**
 * IndexedDB persistence. See DESIGN.md §7.3.
 *
 * Deliberately dependency-free: the surface we need is small enough that a
 * wrapper library would cost more in supply chain than it saves in lines.
 *
 * Stores
 *   habits   keyPath 'id'
 *   entries  keyPath ['habitId', 'date']   ← the compound key from §3
 *   kv       keyPath 'key'                 ← settings and other singletons
 */

import { DEFAULT_SETTINGS, type Entry, type Habit, type Settings } from "./types";

const DB_NAME = "hapi";
const DB_VERSION = 1;

let dbPromise: Promise<IDBDatabase> | null = null;

function openDb(): Promise<IDBDatabase> {
  if (typeof indexedDB === "undefined") {
    return Promise.reject(new Error("IndexedDB unavailable"));
  }
  if (dbPromise) return dbPromise;

  dbPromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = (event) => {
      const db = request.result;
      const from = event.oldVersion;

      // Migrations are keyed on the previous version and must be additive.
      if (from < 1) {
        db.createObjectStore("habits", { keyPath: "id" });
        db.createObjectStore("entries", { keyPath: ["habitId", "date"] });
        db.createObjectStore("kv", { keyPath: "key" });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
    request.onblocked = () =>
      reject(new Error("hapi database blocked by another open tab"));
  });

  return dbPromise;
}

function promisify<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function tx(
  db: IDBDatabase,
  stores: string[],
  mode: IDBTransactionMode,
): IDBTransaction {
  return db.transaction(stores, mode);
}

// ---------------------------------------------------------------------------
// Reads
// ---------------------------------------------------------------------------

export type Snapshot = {
  habits: Habit[];
  entries: Entry[];
  settings: Settings;
};

export async function loadAll(): Promise<Snapshot> {
  const db = await openDb();
  const t = tx(db, ["habits", "entries", "kv"], "readonly");

  const [habits, entries, settingsRow] = await Promise.all([
    promisify<Habit[]>(t.objectStore("habits").getAll()),
    promisify<Entry[]>(t.objectStore("entries").getAll()),
    promisify<{ key: string; value: Settings } | undefined>(
      t.objectStore("kv").get("settings"),
    ),
  ]);

  return {
    habits: habits.sort((a, b) => a.order - b.order),
    entries,
    // Spread over the defaults so a settings field added in a later release
    // does not arrive as undefined for existing users.
    settings: { ...DEFAULT_SETTINGS, ...(settingsRow?.value ?? {}) },
  };
}

// ---------------------------------------------------------------------------
// Writes
// ---------------------------------------------------------------------------

export async function putHabit(habit: Habit): Promise<void> {
  const db = await openDb();
  await promisify(tx(db, ["habits"], "readwrite").objectStore("habits").put(habit));
}

export async function putHabits(habits: Habit[]): Promise<void> {
  const db = await openDb();
  const store = tx(db, ["habits"], "readwrite").objectStore("habits");
  await Promise.all(habits.map((h) => promisify(store.put(h))));
}

export async function deleteHabitRecord(id: string): Promise<void> {
  const db = await openDb();
  const t = tx(db, ["habits", "entries"], "readwrite");
  await promisify(t.objectStore("habits").delete(id));

  // Entries are keyed [habitId, date], so a bounded key range deletes every
  // entry for this habit without scanning the whole store.
  const range = IDBKeyRange.bound([id, ""], [id, "￿"]);
  await promisify(t.objectStore("entries").delete(range));
}

export async function putEntry(entry: Entry): Promise<void> {
  const db = await openDb();
  await promisify(tx(db, ["entries"], "readwrite").objectStore("entries").put(entry));
}

export async function putEntries(entries: Entry[]): Promise<void> {
  const db = await openDb();
  const store = tx(db, ["entries"], "readwrite").objectStore("entries");
  await Promise.all(entries.map((e) => promisify(store.put(e))));
}

export async function putSettings(settings: Settings): Promise<void> {
  const db = await openDb();
  await promisify(
    tx(db, ["kv"], "readwrite").objectStore("kv").put({ key: "settings", value: settings }),
  );
}

export async function clearAll(): Promise<void> {
  const db = await openDb();
  const t = tx(db, ["habits", "entries", "kv"], "readwrite");
  await Promise.all([
    promisify(t.objectStore("habits").clear()),
    promisify(t.objectStore("entries").clear()),
    promisify(t.objectStore("kv").clear()),
  ]);
}

/**
 * Ask the browser to move our data out of the evictable bucket.
 *
 * Without this, a year of streaks can be reclaimed under storage pressure —
 * the highest-value line in the persistence layer for the cost of one call.
 */
export async function requestPersistence(): Promise<boolean> {
  if (typeof navigator === "undefined" || !navigator.storage?.persist) return false;
  try {
    if (await navigator.storage.persisted()) return true;
    return await navigator.storage.persist();
  } catch {
    return false;
  }
}
