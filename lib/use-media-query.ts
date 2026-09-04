"use client";

import { useCallback, useSyncExternalStore } from "react";

/**
 * Returns false on the server and through hydration, so every consumer must sit
 * inside a subtree that only renders once the store has hydrated.
 */
export function useMediaQuery(query: string): boolean {
  const subscribe = useCallback(
    (onChange: () => void) => {
      const mq = window.matchMedia(query);
      mq.addEventListener("change", onChange);
      return () => mq.removeEventListener("change", onChange);
    },
    [query],
  );

  const getSnapshot = useCallback(() => window.matchMedia(query).matches, [query]);

  return useSyncExternalStore(subscribe, getSnapshot, () => false);
}

export const WIDE = "(min-width: 640px)";

/**
 * "Is this a phone", for the two things that answer differently.
 *
 * The pointer half is the honest signal and the one that survives rotation: a
 * phone in landscape is past every sensible width breakpoint while still being
 * the device a bottom sheet exists for, and a width-only test would swap the
 * form's presentation under the user mid-edit.
 *
 * The width half is there because the pointer half is not always told the
 * truth. A desktop browser's device emulation reports a fine pointer unless
 * touch emulation is separately switched on, so the phone layout could not be
 * seen from a laptop at all — and a window genuinely this narrow wants the
 * sheet regardless of what is pointing at it. Being a union, it only ever adds
 * the sheet, and it cannot take one away from a device that rotates.
 */
export const MOBILE = "(pointer: coarse), (max-width: 639px)";
