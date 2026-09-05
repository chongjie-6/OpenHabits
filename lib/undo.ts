"use client";

/**
 * One slot of undo, held in memory for a few seconds. See DESIGN.md §7.4.
 *
 * Separate from `lib/store.ts` on purpose: this is a piece of interface state
 * with a timer attached, and the store is the data. It is shaped like
 * `lib/skin.ts` — a module-level value, a listener set, and
 * `useSyncExternalStore` — so nothing has to thread a callback through the tree.
 *
 * **One slot, not a stack.** Undo here is a way out of the tap you just
 * regretted, not a history: a stack would need every entry to stay valid as the
 * ones under it were undone, and the actions worth undoing at all are the rare,
 * loud ones. Offering a second undo pushes the first out.
 *
 * The offer expires. An undo that sits in the corner for ten minutes is a
 * button whose meaning nobody remembers, and the payload it holds — a deleted
 * habit's entire history — is not something to keep alive indefinitely for a
 * user who has moved on.
 */

import { useSyncExternalStore } from "react";

export type UndoOffer = {
  /** Past tense, addressed to the user: "Run deleted". */
  message: string;
  /** Runs on tap. Must be safe to call once; the offer is cleared first. */
  undo: () => void;
  /** Distinguishes one offer from the next for React, and for the timer. */
  id: number;
};

/** Long enough to notice and reach, short enough not to become furniture. */
export const UNDO_TTL_MS = 8000;

let offer: UndoOffer | null = null;
let timer: ReturnType<typeof setTimeout> | null = null;
let nextId = 1;

const listeners = new Set<() => void>();

function emit(): void {
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function clearTimer(): void {
  if (timer !== null) clearTimeout(timer);
  timer = null;
}

/**
 * Offer an undo. Returns the offer, mostly so a test can name it.
 *
 * `undo` is called at most once: `dismiss()` runs first, so a double tap on a
 * slow device cannot restore the same habit twice.
 */
export function offerUndo(message: string, undo: () => void): UndoOffer {
  clearTimer();
  const id = nextId++;
  offer = { message, undo, id };

  timer = setTimeout(() => {
    // Guarded on the id so a stale timer cannot dismiss a newer offer — a
    // second offer replaces the first while the first timer is still pending.
    if (offer?.id === id) dismiss();
  }, UNDO_TTL_MS);

  emit();
  return offer;
}

export function dismiss(): void {
  clearTimer();
  if (offer === null) return;
  offer = null;
  emit();
}

/** Run the standing offer and clear it. A no-op when there is none. */
export function runUndo(): void {
  const current = offer;
  if (!current) return;
  dismiss();
  current.undo();
}

export function currentOffer(): UndoOffer | null {
  return offer;
}

/**
 * Reactive `currentOffer()`. Reports null on the server and through hydration,
 * which is the honest answer: nothing has been undone yet at that point, and
 * the bar has nothing to render either way.
 */
export function useUndoOffer(): UndoOffer | null {
  return useSyncExternalStore(subscribe, currentOffer, () => null);
}

/** Test seam: drops the offer and its timer without notifying anyone. */
export function resetUndo(): void {
  clearTimer();
  offer = null;
}
