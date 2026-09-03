"use client";

/**
 * The visual skin — a second, independent axis to `theme`. See DESIGN.md §6.5.
 *
 * `theme` answers "light or dark". `skin` answers "which design", and the two
 * compose: every skin has a light and a dark definition. Three ship —
 * `classic` (the original), `grid` (data-first) and `blocks` (a hard-edged
 * tile grid).
 *
 * **Device-local, deliberately.** Skin lives in `localStorage` alone and never
 * enters the synced settings blob. DESIGN.md §13.8 #1 already records `theme`
 * riding that blob as a wart — picking a look on a phone silently repaints a
 * laptop — and adding a second, louder look to the same blob would repeat the
 * mistake at three times the volume. The cost is that a skin is not in a backup
 * and a new device starts on `classic`; that is the intended trade.
 *
 * **The absent attribute is `classic`.** `data-skin` is only ever set for a
 * non-default skin, mirroring `data-theme`, so prerendered HTML carries no skin
 * attribute and the static build stays identical to what it was before skins
 * existed.
 *
 * `SKIN_KEY` itself is declared in `lib/theme.ts`, beside the theme key, because
 * the pre-paint script is the one thing that has to read both. It shares the
 * `hapi` prefix on purpose: it is not one of the four legacy names CLAUDE.md
 * protects — nothing has ever been stored under it — but a lone
 * `openhabits-skin` sitting beside `hapi-theme` in devtools reads as an
 * accident rather than a decision.
 */

import { useSyncExternalStore } from "react";
import { SKIN_KEY } from "./theme";

export type Skin = "classic" | "grid" | "blocks";

export const SKINS: { value: Skin; label: string; hint: string }[] = [
  { value: "classic", label: "Classic", hint: "Cards, soft edges, one column." },
  { value: "grid", label: "Grid", hint: "Your year up top, dense rows below." },
  { value: "blocks", label: "Blocks", hint: "Hard edges and big tiles." },
];

export { SKIN_KEY };

const DEFAULT_SKIN: Skin = "classic";

function isSkin(value: unknown): value is Skin {
  return value === "classic" || value === "grid" || value === "blocks";
}

const listeners = new Set<() => void>();

function emit(): void {
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  // `storage` fires in *other* tabs: change the skin in one, and the rest
  // should follow rather than sit on a stale layout until reload.
  const onStorage = (event: StorageEvent) => {
    if (event.key !== SKIN_KEY) return;
    applyAttribute(readSkin());
    listener();
  };
  window.addEventListener("storage", onStorage);

  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", onStorage);
  };
}

/**
 * Wrapped because Safari in private mode throws on `localStorage` rather than
 * returning null, and an optional look is no reason to take the app down.
 */
export function readSkin(): Skin {
  try {
    const stored = window.localStorage.getItem(SKIN_KEY);
    return isSkin(stored) ? stored : DEFAULT_SKIN;
  } catch {
    return DEFAULT_SKIN;
  }
}

function applyAttribute(skin: Skin): void {
  if (skin === DEFAULT_SKIN) delete document.documentElement.dataset.skin;
  else document.documentElement.dataset.skin = skin;
}

/**
 * The only way to change skin. Sets the attribute the tokens hang off, mirrors
 * to storage for the pre-paint script, and notifies the layout switches.
 */
export function applySkin(skin: Skin): void {
  if (typeof document === "undefined") return;

  applyAttribute(skin);

  try {
    localStorage.setItem(SKIN_KEY, skin);
  } catch {
    // Storage disabled. The skin still applies for this session.
  }

  emit();
}

/**
 * Reactive `readSkin()`. Reports `classic` on the server and through hydration,
 * so — exactly as with `useMediaQuery` — **every consumer must sit inside a
 * subtree that only renders once the store has hydrated**. Token-level
 * differences do not need this hook at all: `data-skin` is on the document
 * before first paint, so CSS has the real answer while this still says
 * `classic`. Reach for the hook only where the markup itself has to change
 * shape, and never in `BottomNav`, which renders un-gated.
 */
export function useSkin(): Skin {
  return useSyncExternalStore(subscribe, readSkin, () => DEFAULT_SKIN);
}
