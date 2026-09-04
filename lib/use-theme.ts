"use client";

/**
 * The React surface for the theme. See DESIGN.md §13.8 #1.
 *
 * A separate module for the reason `lib/use-palette.ts` is one: `lib/theme.ts`
 * is imported by `app/layout.tsx` — a Server Component — for `THEME_SCRIPT`,
 * and a `"use client"` directive on that file would drag the whole appearance
 * layer into the client graph to serve one string.
 *
 * The shape is `lib/skin.ts`'s, deliberately. Theme, skin and palette are three
 * axes of the same device-local decision, and a reader who has understood one
 * should recognise the other two.
 */

import { useSyncExternalStore } from "react";
import { THEME_KEY, applyTheme, readTheme, type Theme } from "./theme";

const listeners = new Set<() => void>();

function subscribe(listener: () => void): () => void {
  listeners.add(listener);

  // `storage` fires in *other* tabs: switch to dark in one, and the rest should
  // follow rather than sit on the old theme until reload.
  const onStorage = (event: StorageEvent) => {
    if (event.key !== THEME_KEY) return;
    applyTheme(readTheme());
    listener();
  };
  window.addEventListener("storage", onStorage);

  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", onStorage);
  };
}

/**
 * Reactive `readTheme()`. Reports `system` on the server and through hydration,
 * exactly as `useSkin` and `usePalette` do, so **every consumer must sit inside
 * a subtree gated on `store.hydrated`**. Nothing token-level needs this hook:
 * `data-theme` is on the document before first paint, so CSS has the real
 * answer while this still says `system`.
 */
export function useTheme(): Theme {
  return useSyncExternalStore(subscribe, readTheme, () => "system" as Theme);
}

/** The only way a component should change theme. */
export function changeTheme(theme: Theme): void {
  applyTheme(theme);
  for (const listener of listeners) listener();
}
