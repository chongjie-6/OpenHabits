"use client";

/**
 * The client's view of who is signed in. See DESIGN.md §13.6.
 *
 * Two things that look redundant and are not: Better Auth's session
 * (authoritative, costs a request) and a local hint (instant, occasionally
 * wrong). `lib/sync/client.ts` needs the answer synchronously and offline to
 * decide whether to attempt a round trip at all; awaiting a session fetch would
 * put a request in front of sync on every load, for people who never signed in
 * included.
 *
 * The hint carries no authority — it is a localStorage flag anyone can set, and
 * setting it grants only permission to make a request the server answers 401.
 * `resolveUser` decides. A stale hint self-corrects on that 401; a missing one
 * costs a delayed first sync.
 *
 * The server snapshot reports *signed out* (§8.4): account UI may appear after
 * hydration, but must never be baked into cached HTML and then vanish.
 */

import { useEffect, useSyncExternalStore } from "react";
import { createAuthClient } from "better-auth/react";

/** No `baseURL`: hardcoding one would break every deploy preview. */
export const authClient = createAuthClient();

/** Pre-rebrand key, kept so signed-in devices do not lose the hint and skip
 *  a sync until the next sign-in. */
const HINT_KEY = "hapi:signed-in";

const listeners = new Set<() => void>();

function emit(): void {
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  // `storage` fires in *other* tabs, which a local emit cannot cover: sign out
  // on one tab, and the others should stop syncing.
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
 * Whether this browser believes it has a session. Wrapped because Safari in
 * private mode throws on `localStorage` rather than returning null, and a thrown
 * getter would take down the whole app for an optional feature.
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
 * Keep the local hint honest against what the server says. Mounted once, beside
 * `useSync()`. Repairs a hint left behind by a session that expired while the tab
 * was closed, and sets one where the cookie is valid but localStorage was
 * cleared.
 *
 * In an effect rather than during render: `setHint` notifies
 * `useSyncExternalStore` subscribers, and doing that from a render pass is an
 * update-during-render of some other component.
 */
export function useSessionSync(): void {
  const { data, isPending } = authClient.useSession();
  const present = Boolean(data?.user);

  useEffect(() => {
    if (isPending) return;
    if (signedIn() !== present) setHint(present);
  }, [present, isPending]);
}
