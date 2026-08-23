"use client";

/**
 * The client half of sync. See DESIGN.md §13.
 *
 * Runs beside the app, not inside it: nothing in the UI awaits a sync, and every
 * mutation still lands in IndexedDB first. That is what keeps the §10 tick budget
 * intact and the app usable offline, signed out, or with no database at all.
 */

import { useEffect } from "react";
import { markSignedOut, signedIn, useSignedIn } from "../session";
import * as store from "../store";
import { collectPush, mergeIncoming, watermarkAfterPush } from "./merge";
import {
  MAX_CLOCK_SKEW_MS,
  type SyncErrorBody,
  type SyncPull,
  type SyncPush,
} from "./protocol";

/**
 * Ceiling on round trips per `syncNow()` call. A finite history always terminates
 * well inside this; the cap exists for the bug that leaves `more` stuck true. A
 * sync that gives up is repairable, a hot loop on someone's phone is not.
 */
const MAX_ROUND_TRIPS = 50;

let inFlight: Promise<void> | null = null;

/**
 * Sync until the device and the server agree, or until something stops us.
 *
 * Single-flight: two overlapping syncs would each read the cursor before the
 * other wrote it, and the second to finish would save the older one —
 * reprocessing a payload harmlessly, but forever.
 */
export function syncNow(): Promise<void> {
  inFlight ??= run().finally(() => {
    inFlight = null;
  });
  return inFlight;
}

async function run(): Promise<void> {
  if (!syncEnabled()) {
    // Guarded here as well as in `useSync`, so a direct `syncNow()` cannot post
    // for a signed-out device just because it skipped the hook.
    store.setSyncStatus({ kind: "off" });
    return;
  }

  if (typeof navigator !== "undefined" && navigator.onLine === false) {
    // Not an error: offline is the expected state for a PWA, and `useSync`'s
    // listeners call back the moment it changes.
    return;
  }

  store.setSyncStatus({ kind: "syncing" });

  try {
    for (let trip = 0; trip < MAX_ROUND_TRIPS; trip++) {
      const outcome = await roundTrip();

      if (outcome.kind === "stop") {
        store.setSyncStatus(outcome.status);
        return;
      }
      if (outcome.kind === "retry") continue;
      if (!outcome.more) break;
    }

    store.setSyncStatus({ kind: "idle" });
  } catch (cause) {
    // A failed sync is not a failed app — the data is on the device either way.
    console.error("hapi: sync failed", cause);
    store.setSyncStatus({ kind: "error", message: "Could not reach the server." });
  }
}

type Outcome =
  | { kind: "ok"; more: boolean }
  /** Local state was reset; go round again from the new baseline. */
  | { kind: "retry" }
  | { kind: "stop"; status: store.SyncStatus };

async function roundTrip(): Promise<Outcome> {
  const meta = store.syncMeta();
  const before = store.localSnapshot();

  // Nothing is pushed until the account is known: a device that has never synced
  // pulls first, which cannot put local data anywhere it should not go.
  const pending =
    meta.accountId === null
      ? { habits: [], entries: [], settings: null, complete: false }
      : collectPush(before, meta.pushedThrough);

  const body: SyncPush = {
    since: meta.cursor,
    accountId: meta.accountId,
    habits: pending.habits,
    entries: pending.entries,
    settings: pending.settings,
  };

  const response = await fetch("/api/sync", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    // The user's habit history is not something to leave in a shared cache.
    cache: "no-store",
    credentials: "same-origin",
  });

  if (!response.ok) return handleError(response);

  const pull: SyncPull = await response.json();
  warnOnClockSkew(pull.serverNow);

  if (meta.accountId !== null && pull.accountId !== meta.accountId) {
    // The 409 path should have caught this, but applying a payload from the
    // wrong account is the one outcome worth an extra check.
    store.adoptAccount(pull.accountId);
    return { kind: "retry" };
  }

  // Re-read rather than reusing `before`: the user may have ticked a habit while
  // the request was in flight, and merging into a stale snapshot would drop it.
  const merged = mergeIncoming(store.localSnapshot(), pull);

  store.applyPulled(merged, {
    cursor: pull.seq,
    // Advanced past everything sent, rejected records included: their winning
    // version arrives in this same response. Orphans the server dropped move
    // past it too, or retrying them forever would wedge this device's sync.
    pushedThrough: watermarkAfterPush(pending, meta.pushedThrough),
    lastSyncAt: Date.now(),
    accountId: pull.accountId,
  });

  return { kind: "ok", more: pull.more || !pending.complete };
}

async function handleError(response: Response): Promise<Outcome> {
  const body = await response.json().catch(() => null) as SyncErrorBody | null;

  switch (response.status) {
    case 401:
      // Clearing the hint is what makes `syncEnabled()` safe to trust: a session
      // that expired while the tab was closed would otherwise retry on every
      // foreground and online event for as long as the app stayed open.
      markSignedOut();
      return { kind: "stop", status: { kind: "off" } };

    case 409:
      // Someone else is signed in here: the previous account's copy is cleared
      // rather than merged or uploaded.
      store.adoptAccount(null);
      return { kind: "retry" };

    case 503:
      return { kind: "stop", status: { kind: "off" } };

    case 400:
    case 413:
      // The server rejects this payload every time, so retrying only burns
      // battery. A bug in the client, not a condition to wait out.
      console.error("hapi: server rejected the sync payload", body?.message);
      return {
        kind: "stop",
        status: { kind: "error", message: "This device's data could not be synced." },
      };

    default:
      return {
        kind: "stop",
        status: { kind: "error", message: "Could not reach the server." },
      };
  }
}

/**
 * A device clock far enough out to break merge ordering. The damage is invisible
 * — an hour behind, every edit here loses and the user sees changes revert — and
 * only the OS can fix it, so this logs rather than acts.
 */
function warnOnClockSkew(serverNow: number): void {
  const skew = Math.abs(Date.now() - serverNow);
  if (skew > MAX_CLOCK_SKEW_MS) {
    console.warn(
      `hapi: this device's clock is ${Math.round(skew / 60000)} minutes off the server. ` +
        "Edits may merge in the wrong order until it is corrected.",
    );
  }
}

/**
 * How often a foregrounded app checks in, in ms. Long, deliberately: the triggers
 * that matter are the event-driven ones below, and this only covers an app left
 * open and visible for hours.
 */
const POLL_MS = 5 * 60 * 1000;

/**
 * Whether this device should attempt to sync at all — per device rather than per
 * build, so one deployment serves signed-in and signed-out visitors and only the
 * former make requests. Only a hint: the server still decides, and a device that
 * lies to itself here gets a 401 and is switched off by `handleError`.
 */
function syncEnabled(): boolean {
  return signedIn();
}

/**
 * Mount once, high in the tree, alongside `useHydrate`.
 *
 * Deliberately not on every mutation — a habit tick would fire a request per tap,
 * and the merge is designed to arrive late rather than often.
 */
export function useSync(): void {
  const { hydrated } = store.useHapi();
  // Subscribed rather than read, so signing in starts sync on the spot and
  // signing out in another tab tears the listeners down in this one.
  const enabled = useSignedIn();

  useEffect(() => {
    if (!enabled) return;
    // Syncing before hydration would push an empty snapshot as though the
    // device had no habits, and read the cursor as 0 with a real one on disk.
    if (!hydrated) return;

    void syncNow();

    const onVisible = () => {
      if (document.visibilityState === "visible") void syncNow();
    };
    const onOnline = () => void syncNow();
    const timer = window.setInterval(() => void syncNow(), POLL_MS);

    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("online", onOnline);

    return () => {
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("online", onOnline);
      window.clearInterval(timer);
    };
  }, [hydrated, enabled]);
}
