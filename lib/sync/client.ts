"use client";

/**
 * The client half of sync. See DESIGN.md §13.
 *
 * Runs entirely beside the app rather than inside it. Nothing in the UI awaits a
 * sync, no screen renders a spinner for one, and every mutation still lands in
 * IndexedDB first — sync only ever arrives later and merges. That is what keeps
 * the tick budget from §10 intact and the app fully usable offline, signed out,
 * or with the database switched off entirely.
 */

import { useEffect } from "react";
import * as store from "../store";
import { collectPush, mergeIncoming, watermarkAfterPush } from "./merge";
import {
  MAX_CLOCK_SKEW_MS,
  type SyncErrorBody,
  type SyncPull,
  type SyncPush,
} from "./protocol";

/**
 * Ceiling on round trips per `syncNow()` call.
 *
 * Each trip either advances the cursor or drains part of the push backlog, so a
 * finite history always terminates well inside this. It exists for the case where
 * it does not — a bug that leaves `more` stuck true would otherwise spin against
 * the server indefinitely, and a sync that gives up is repairable while a hot
 * loop on someone's phone is not.
 */
const MAX_ROUND_TRIPS = 50;

let inFlight: Promise<void> | null = null;

/**
 * Sync until the device and the server agree, or until something stops us.
 *
 * Single-flight: concurrent callers join the run already in progress. Two
 * overlapping syncs would each read the cursor before the other wrote it, and the
 * second to finish would save the older one — reprocessing a payload harmlessly,
 * but forever.
 */
export function syncNow(): Promise<void> {
  inFlight ??= run().finally(() => {
    inFlight = null;
  });
  return inFlight;
}

async function run(): Promise<void> {
  if (typeof navigator !== "undefined" && navigator.onLine === false) {
    // Not an error. Offline is the expected state for a PWA, and the listeners in
    // `useSync` will call back the moment it changes.
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
    // A failed sync is not a failed app: the data is on the device either way, so
    // this is reported quietly and retried on the next trigger.
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

  // Nothing is pushed until the account is known. On a device that has never
  // synced, `accountId` is null and this first request is a pull — which is also
  // the safe direction, since it cannot put local data anywhere it should not go.
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
    // The 409 path should have caught this. Belt and braces: applying a payload
    // from the wrong account is the one outcome worth an extra check.
    store.adoptAccount(pull.accountId);
    return { kind: "retry" };
  }

  // Re-read rather than reusing `before`: the user may have ticked a habit while
  // the request was in flight, and merging into a stale snapshot would drop it.
  const merged = mergeIncoming(store.localSnapshot(), pull);

  store.applyPulled(merged, {
    cursor: pull.seq,
    // Advanced past everything sent, including records the server rejected —
    // their winning version arrives in this same response, so the local copy no
    // longer carries the stamp that would re-select it. Orphaned entries the
    // server dropped move past the watermark too, which is the point: retrying
    // them forever would wedge this device's sync on garbage.
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
      // Signed out, or never signed in. Sync is simply off; the app is unaffected.
      return { kind: "stop", status: { kind: "off" } };

    case 409:
      // Someone else is signed in on this device. The local copy belongs to the
      // previous account and is cleared rather than merged or uploaded.
      store.adoptAccount(null);
      return { kind: "retry" };

    case 503:
      return { kind: "stop", status: { kind: "off" } };

    case 400:
    case 413:
      // The server will reject this payload every time, so retrying is pointless
      // and would burn the device's battery doing it. Surfaced loudly instead:
      // this is a bug in the client, not a condition to wait out.
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
 * A device clock far enough out to break merge ordering.
 *
 * Worth saying out loud because the damage is invisible: with a clock an hour
 * behind, every edit made on this device loses to whatever the other device
 * wrote, and the user sees their changes silently reverting. Nothing here can fix
 * it — only the OS can — so this logs rather than acts.
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
 * How often a foregrounded app checks in, in ms.
 *
 * Long, deliberately. The triggers that matter are the event-driven ones below —
 * a tick on another device shows up when this one is next looked at, which is
 * when it is next brought to the front. The interval only covers the case of an
 * app left open and visible for hours.
 */
const POLL_MS = 5 * 60 * 1000;

/**
 * Whether this build should attempt to sync at all.
 *
 * Without this gate the client posts to `/api/sync` on every page load and gets
 * a 503 (no database) or a 401 (not signed in) — and the browser logs a console
 * error for the failed request no matter how gracefully the JS handles it. A
 * deployment with sync switched off would show an error to every visitor on every
 * load, and phase 7 caught exactly that.
 *
 * `NEXT_PUBLIC_` is inlined at build time, so when this is unset the whole
 * request path is statically unreachable rather than merely unused.
 *
 * This is a placeholder for the real signal, which is a session: once §13.6's
 * auth seam is filled in, "should I sync" becomes "is someone signed in", the
 * client learns that locally, and this flag goes away.
 */
function syncEnabled(): boolean {
  return process.env.NEXT_PUBLIC_SYNC_ENABLED === "1";
}

/**
 * Mount once, high in the tree, alongside `useHydrate`.
 *
 * Syncs after hydration and on the three events that mean the picture may have
 * changed: the app coming to the front, the network coming back, and the timer.
 * Deliberately not on every mutation — a habit tick would otherwise fire a
 * request per tap, and the merge is designed to arrive late rather than often.
 */
export function useSync(): void {
  const { hydrated } = store.useHapi();

  useEffect(() => {
    if (!syncEnabled()) return;
    // Syncing before hydration would push an empty snapshot as though the device
    // had no habits, and read the cursor as 0 when a real one is on disk.
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
  }, [hydrated]);
}
