"use client";

/**
 * The client's view of who is signed in. See DESIGN.md §13.6.
 *
 * Two things live here that look redundant and are not: Better Auth's session
 * (authoritative, costs a request) and a local hint (instant, occasionally
 * wrong). The split exists because of §7.1.
 *
 * ## Why a hint at all
 *
 * Every route in this app prerenders to static HTML that the service worker then
 * caches, so the document can carry no trace of who is looking at it. The only
 * honest place for "am I signed in" is the browser, read after hydration.
 *
 * `lib/sync/client.ts` needs that answer *synchronously and offline*: it decides
 * whether to attempt a round trip at all. Making it await a session fetch would
 * put a network request in front of sync on every load, including for people who
 * have never signed in — which is the console-noise problem that
 * `NEXT_PUBLIC_SYNC_ENABLED` was a placeholder for in the first place.
 *
 * ## Why it is safe to be wrong
 *
 * The hint carries no authority. It is a localStorage flag any user could set by
 * hand, and setting it grants exactly one thing: permission to make a request
 * that the server will then answer 401. `resolveUser` is what decides. A stale
 * hint self-corrects — `client.ts` clears it on a 401 — and a missing one costs
 * only a delayed first sync.
 *
 * The `useSyncExternalStore` server snapshot deliberately reports *signed out*,
 * matching `display-mode` and `beforeinstallprompt` (§8.4): the account UI may
 * appear after hydration, but it must never be baked into cached HTML and then
 * vanish.
 */

import { useEffect, useSyncExternalStore } from "react";
import { createAuthClient } from "better-auth/react";

/**
 * No `baseURL`: same-origin, so the default is right, and hardcoding one would
 * break every deploy preview.
 */
export const authClient = createAuthClient();

/** Mirrored in `lib/theme.ts` style — a browser fact, kept where the browser can read it. */
const HINT_KEY = "hapi:signed-in";

const listeners = new Set<() => void>();

function emit(): void {
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  // `storage` fires in *other* tabs, which is exactly the case a local emit
  // cannot cover: sign out on one tab, and the others should stop syncing.
  const onStorage = (event: StorageEvent) => {
    if (event.key === HINT_KEY) listener();
  };
  window.addEventListener("storage", onStorage);

  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", onStorage);
  };
}

/**
 * Whether this browser believes it has a session.
 *
 * Wrapped in try/catch because Safari in private mode throws on `localStorage`
 * rather than returning null, and a thrown getter here would take down the whole
 * app for the sake of an optional feature.
 */
export function signedIn(): boolean {
  try {
    return window.localStorage.getItem(HINT_KEY) === "1";
  } catch {
    return false;
  }
}

function setHint(value: boolean): void {
  try {
    if (value) window.localStorage.setItem(HINT_KEY, "1");
    else window.localStorage.removeItem(HINT_KEY);
  } catch {
    // Storage unavailable. Sync stays off; nothing else is affected.
  }
  emit();
}

export function markSignedIn(): void {
  setHint(true);
}

export function markSignedOut(): void {
  setHint(false);
}

/** Reactive `signedIn()`. Reports signed out on the server, always. */
export function useSignedIn(): boolean {
  return useSyncExternalStore(subscribe, signedIn, () => false);
}

/**
 * Keep the local hint honest against what the server actually says.
 *
 * Mounted once, beside `useSync()`. Better Auth's hook fetches the real session;
 * whatever it reports becomes the local flag. This is what repairs a hint left
 * behind by a session that expired while the tab was closed, and what sets one
 * on a device where the cookie is valid but localStorage was cleared.
 *
 * In an effect rather than during render: `setHint` notifies
 * `useSyncExternalStore` subscribers, and writing to those from a render pass is
 * an update-during-render of some other component.
 */
export function useSessionSync(): void {
  const { data, isPending } = authClient.useSession();
  const present = Boolean(data?.user);

  useEffect(() => {
    if (isPending) return;
    if (signedIn() !== present) setHint(present);
  }, [present, isPending]);
}
