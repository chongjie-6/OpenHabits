/**
 * The sync wire format. See DESIGN.md §13.
 *
 * Push and pull are one request because they have to be atomic — a push that
 * succeeded beside a pull that failed would leave the client believing it was up
 * to date.
 *
 * ## Two clocks
 *
 * `updatedAt` is a client epoch-ms stamp and decides merges. It cannot also drive
 * the pull cursor: device clocks disagree by hours, so a phone running five
 * minutes slow writing an entry at 10:00 after the laptop pulled through 10:03
 * would be stepped over permanently — no error, no retry, just a gap.
 *
 * `seq` is server-assigned from a single Postgres sequence, gap-free in the order
 * that matters (`lockUser` in `lib/server/sync-store.ts`), and never compared
 * against a client clock. `seq` moves the cursor; `updatedAt` decides conflicts.
 */

import type { Entry, Habit, Settings } from "../types";

/** Records the client believes are newer than what the server holds. */
export type SyncPush = {
  /**
   * The highest `seq` this client has already applied; 0 for a first sync,
   * which pulls the account's entire history.
   */
  since: number;
  /**
   * The account this client believes its data belongs to, or null if it has never
   * synced. Stated up front so the server can refuse a mismatch *before* applying
   * anything: otherwise a device where someone else has since signed in uploads
   * the previous person's habits into the new account. Reading the identity off
   * the response is too late, and a prior round trip costs a request every sync.
   */
  accountId: string | null;
  habits: Habit[];
  entries: Entry[];
  /** Omitted when settings have not changed since the last successful sync. */
  settings: { value: Settings; updatedAt: number } | null;
};

/** Everything stored past `since`, after the push has been merged in. */
export type SyncPull = {
  /**
   * The new cursor. Persist this only after the response has been applied
   * locally — a cursor saved ahead of the data it describes is a silent gap.
   */
  seq: number;
  /** The account actually written to. The client records it and checks it. */
  accountId: string;
  habits: Habit[];
  entries: Entry[];
  settings: { value: Settings; updatedAt: number } | null;
  /**
   * True when the response was truncated and another round trip is due. Reported
   * rather than inferred from row counts: after the clamp in `resumePoint` a
   * truncated collection can hold fewer rows than the limit, so counting would
   * stop the client halfway through its own history.
   */
  more: boolean;
  /**
   * Server clock at the time of the response, epoch ms. The client uses it to
   * warn about a device clock far enough out to corrupt merge ordering.
   */
  serverNow: number;
};

export type SyncErrorCode =
  | "unauthenticated"
  | "account-mismatch"
  | "payload-too-large"
  | "malformed"
  | "server-error";

export type SyncErrorBody = { error: SyncErrorCode; message: string };

/**
 * Cap on records per request, applied per collection. A first sync from a
 * multi-year account runs to tens of thousands of entries, which no serverless
 * function should hold in memory at once. The server truncates and leaves the
 * cursor short, so the next round trip resumes where this one stopped.
 */
export const MAX_ROWS_PER_REQUEST = 500;

/** Beyond this much clock skew, LWW ordering stops being trustworthy. */
export const MAX_CLOCK_SKEW_MS = 5 * 60 * 1000;

/**
 * How long a tombstone is kept before it is collected. See DESIGN.md §13.8 #3.
 *
 * Tombstones exist because a missing row and a row a peer has not seen yet are
 * the same observation, so a delete has to be stated rather than implied. The
 * cost is that they accumulate for the life of an account, on every device.
 *
 * **What the window actually bounds is resurrection.** A device that has been
 * offline for longer than this comes back holding a live copy of a habit whose
 * tombstone both it and the server have since forgotten. Nothing then
 * contradicts its copy, so it wins by default and the habit returns from the
 * dead — with its history, which was purged everywhere else. Six months is
 * chosen against that single failure, not against storage: a phone in a drawer
 * for half a year is a plausible device, one gone longer is a restored backup,
 * and the row it protects costs a few hundred bytes.
 *
 * Both halves of the system apply it — `lib/store.ts` on hydrate and
 * `lib/server/sync-store.ts` inside the sync transaction — and they must use
 * this constant rather than two numbers that happen to agree today.
 */
export const TOMBSTONE_TTL_MS = 180 * 24 * 60 * 60 * 1000;

/**
 * Last-write-wins, with a tiebreaker that has to be there.
 *
 * "Incoming wins ties" is quietly broken: two devices writing the same record in
 * the same millisecond each see the *other* value as incoming, so they swap
 * rather than converge and stay disagreed forever with no error anywhere. A
 * content tiebreaker is symmetric by construction — which value it picks is
 * arbitrary, that both sides pick the same one is the entire point.
 *
 * Equal fingerprints mean identical records, so `false` also keeps a replayed
 * push off the disk.
 */
export function wins<T extends { updatedAt: number }>(
  incoming: T,
  existing: T | undefined,
  fingerprint: (record: T) => string,
): boolean {
  if (!existing) return true;
  if (incoming.updatedAt !== existing.updatedAt) return incoming.updatedAt > existing.updatedAt;
  return fingerprint(incoming) > fingerprint(existing);
}

/**
 * Content fingerprints for the tiebreaker. Field by field rather than
 * `JSON.stringify`, whose output follows key insertion order — the same habit
 * built by two code paths would serialise differently and break the symmetry this
 * exists to provide. Only fields a user can change; `id` and `createdAt` are
 * fixed for the life of a record.
 */
export function fingerprintHabit(h: Habit): string {
  return [
    h.name,
    h.emoji,
    h.color,
    h.target,
    h.order,
    h.archivedAt ?? "",
    h.deletedAt ?? "",
    h.cadence.kind,
    h.cadence.kind === "weekdays" ? h.cadence.days.join(",") : "",
    h.cadence.kind === "weekly" ? h.cadence.times : "",
  ].join(" ");
}

export function fingerprintEntry(e: Entry): string {
  return String(e.count);
}

export function fingerprintSettings(s: { value: Settings }): string {
  return [
    s.value.weekStartsOn,
    s.value.dayStartHour,
    s.value.reminderHour,
    s.value.haptics,
    s.value.dailyMode,
    // Sorted, so two devices that favourited the same quotes in a different
    // order still fingerprint identically and neither write wins spuriously.
    [...s.value.favourites].sort().join(","),
  ].join(" ");
}
