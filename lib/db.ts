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

import { DEFAULT_SETTINGS, normaliseHabit, type Entry, type Habit, type Settings } from "./types";

const DB_NAME = "hapi";
const DB_VERSION = 2;

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

      // v2 adds the sync metadata from §13. Nothing is created or dropped — the
      // existing rows are rewritten in place with the two new fields.
      if (from < 2) {
        // `request.transaction` is the upgrade transaction; the writes below
        // belong to it and commit with the version change or not at all.
        backfillSyncMetadata(request.transaction!);
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
    request.onblocked = () =>
      reject(new Error("hapi database blocked by another open tab"));
  });

  return dbPromise;
}

/**
 * Give every pre-sync record the metadata sync needs.
 *
 * Habits get `updatedAt` derived from their creation day, not from the clock: a
 * habit created last year is not an edit made during this upgrade, and stamping
 * it "now" would let a stale local copy outrank the same habit's later edits
 * already sitting on the server.
 *
 * Settings are the exception and get the clock. They have no creation date to
 * fall back on, and unlike a habit the stored value genuinely does represent a
 * choice the user made and would expect to keep. The cost is that if two devices
 * upgrade separately, the one that upgraded later wins the first settings merge.
 * For a preferences blob that is a fair outcome; for a year of history it would
 * not have been, which is why the two are treated differently.
 */
function backfillSyncMetadata(transaction: IDBTransaction): void {
  const cursorRequest = transaction.objectStore("habits").openCursor();
  cursorRequest.onsuccess = () => {
    const cursor = cursorRequest.result;
    if (!cursor) return;
    cursor.update(normaliseHabit(cursor.value));
    cursor.continue();
  };

  const kv = transaction.objectStore("kv");
  const settingsRequest = kv.get("settings");
  settingsRequest.onsuccess = () => {
    const row = settingsRequest.result;
    if (row && row.updatedAt === undefined) {
      kv.put({ ...row, updatedAt: Date.now() });
    }
  };
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
  /**
   * Deleted habits, kept so sync can tell peers about the deletion. They are
   * handed back separately rather than mixed into `habits` because every UI
   * surface reads that array, and one forgotten filter would put a deleted habit
   * back on the Today list.
   */
  tombstones: Habit[];
  entries: Entry[];
  settings: Settings;
  settingsUpdatedAt: number;
  sync: SyncMeta;
};

/**
 * Local sync bookkeeping. See `lib/sync/client.ts`.
 *
 * `cursor` is the server's `seq`; `pushedThrough` is a local `updatedAt`
 * watermark. They are different clocks and must not be compared or conflated —
 * see the header of `lib/sync/protocol.ts`.
 */
export type SyncMeta = {
  cursor: number;
  pushedThrough: number;
  lastSyncAt: number;
  /** Account the local data belongs to; a change means the store must be reset. */
  accountId: string | null;
};

export const NO_SYNC: SyncMeta = {
  cursor: 0,
  pushedThrough: 0,
  lastSyncAt: 0,
  accountId: null,
};

export async function loadAll(): Promise<Snapshot> {
  const db = await openDb();
  const t = tx(db, ["habits", "entries", "kv"], "readonly");

  const [habits, entries, settingsRow, syncRow] = await Promise.all([
    promisify<Habit[]>(t.objectStore("habits").getAll()),
    promisify<Entry[]>(t.objectStore("entries").getAll()),
    promisify<{ key: string; value: Settings; updatedAt?: number } | undefined>(
      t.objectStore("kv").get("settings"),
    ),
    promisify<{ key: string; value: SyncMeta } | undefined>(t.objectStore("kv").get("sync")),
  ]);

  const live = habits.filter((h) => h.deletedAt === null);
  const tombstones = habits.filter((h) => h.deletedAt !== null);

  return {
    habits: live.sort((a, b) => a.order - b.order),
    tombstones,
    // Entries belonging to a deleted habit were removed when the tombstone was
    // written, so nothing here needs filtering against it.
    entries,
    // Spread over the defaults so a settings field added in a later release
    // does not arrive as undefined for existing users.
    settings: { ...DEFAULT_SETTINGS, ...(settingsRow?.value ?? {}) },
    settingsUpdatedAt: settingsRow?.updatedAt ?? 0,
    sync: { ...NO_SYNC, ...(syncRow?.value ?? {}) },
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

/**
 * Delete a habit by writing a tombstone, not by removing the row.
 *
 * The habit record stays with `deletedAt` set; only its entries go. On a store
 * that replicates, a *missing* row and a row *the peer has not seen yet* are the
 * same observation — so a hard delete here would be re-learned from the server on
 * the next sync and the habit would reappear, along with its history.
 */
export async function deleteHabitRecord(habit: Habit): Promise<void> {
  const db = await openDb();
  const t = tx(db, ["habits", "entries"], "readwrite");

  // Both requests are issued before either is awaited. An IndexedDB transaction
  // auto-commits once its request queue drains, so awaiting the first would let
  // the transaction close before the second was ever queued.
  const wrote = promisify(t.objectStore("habits").put(habit));
  // Entries are keyed [habitId, date], so a bounded key range deletes every
  // entry for this habit without scanning the whole store.
  const cleared = promisify(
    t.objectStore("entries").delete(IDBKeyRange.bound([habit.id, ""], [habit.id, "￿"])),
  );

  await Promise.all([wrote, cleared]);
}

/** Drop a habit's entries without touching the habit — used when a peer's tombstone arrives. */
export async function deleteEntriesFor(habitIds: string[]): Promise<void> {
  if (habitIds.length === 0) return;

  const db = await openDb();
  const store = tx(db, ["entries"], "readwrite").objectStore("entries");
  await Promise.all(
    habitIds.map((id) =>
      promisify(store.delete(IDBKeyRange.bound([id, ""], [id, "￿"]))),
    ),
  );
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

export async function putSettings(settings: Settings, updatedAt: number): Promise<void> {
  const db = await openDb();
  await promisify(
    tx(db, ["kv"], "readwrite")
      .objectStore("kv")
      .put({ key: "settings", value: settings, updatedAt }),
  );
}

export async function putSyncMeta(meta: SyncMeta): Promise<void> {
  const db = await openDb();
  await promisify(
    tx(db, ["kv"], "readwrite").objectStore("kv").put({ key: "sync", value: meta }),
  );
}

/**
 * Write a merged pull to disk as one transaction.
 *
 * Atomicity is the point. The cursor is only advanced by the caller after this
 * resolves, so a failure part-way through means the same payload is fetched and
 * applied again — whereas a partial commit paired with a saved cursor would leave
 * a permanent hole that no later sync would think to fill.
 */
export async function applyMerge(input: {
  habits: Habit[];
  entries: Entry[];
  purgedHabitIds: string[];
  settings: { value: Settings; updatedAt: number } | null;
  sync: SyncMeta;
}): Promise<void> {
  const db = await openDb();
  const t = tx(db, ["habits", "entries", "kv"], "readwrite");

  const habitStore = t.objectStore("habits");
  const entryStore = t.objectStore("entries");
  const kv = t.objectStore("kv");

  const pending: Promise<unknown>[] = [];
  for (const habit of input.habits) pending.push(promisify(habitStore.put(habit)));
  for (const id of input.purgedHabitIds) {
    pending.push(promisify(entryStore.delete(IDBKeyRange.bound([id, ""], [id, "￿"]))));
  }
  // After the purge, so an entry that survived the merge for a habit deleted in
  // the same payload is not reinstated by request ordering.
  for (const entry of input.entries) pending.push(promisify(entryStore.put(entry)));
  if (input.settings) {
    pending.push(
      promisify(
        kv.put({ key: "settings", value: input.settings.value, updatedAt: input.settings.updatedAt }),
      ),
    );
  }
  pending.push(promisify(kv.put({ key: "sync", value: input.sync })));

  await Promise.all(pending);
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
