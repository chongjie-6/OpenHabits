"use client";

import { useCallback, useSyncExternalStore } from "react";
import { todayKey } from "./dates";
import type { DayKey } from "./types";

/**
 * The current civil day, as external state.
 *
 * The clock genuinely is an external system, so this is a `useSyncExternalStore`
 * subscription rather than a `setState` in an effect: React uses the server
 * snapshot (`null`) through hydration and then switches over, with no mismatch
 * and no cascading render.
 *
 * Subscribing also means the app rolls over correctly if it is left open across
 * midnight — a habit tracker sitting on a bedside table at 23:59 should not
 * still be showing yesterday at 00:01.
 */

const TICK_MS = 60_000;

function subscribe(onChange: () => void): () => void {
  const onVisible = () => {
    if (!document.hidden) onChange();
  };

  const timer = setInterval(onChange, TICK_MS);
  document.addEventListener("visibilitychange", onVisible);
  window.addEventListener("focus", onChange);

  return () => {
    clearInterval(timer);
    document.removeEventListener("visibilitychange", onVisible);
    window.removeEventListener("focus", onChange);
  };
}

/** Null on the server and through hydration; a DayKey from then on. */
export function useToday(dayStartHour: number): DayKey | null {
  // A DayKey is a string, so React's Object.is check settles on value equality
  // and a fresh call per snapshot does not loop.
  const getSnapshot = useCallback(() => todayKey(dayStartHour), [dayStartHour]);
  return useSyncExternalStore(subscribe, getSnapshot, () => null);
}
