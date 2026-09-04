"use client";

/**
 * The React and DOM surface for custom palettes. See DESIGN.md §6.6.
 *
 * `lib/palette.ts` is the pure half — what a palette is, how one is derived,
 * what it measures. `lib/theme.ts` owns storage and the pre-paint script. This
 * file is what a component touches.
 */

import { useSyncExternalStore } from "react";
import {
  PALETTE_KEY,
  applyPaletteVars,
  currentPalette,
  refreshPalette,
  setPalette,
} from "./theme";
import { PALETTE_TOKENS, type Mode, type Palette, type Swatches } from "./palette";

const listeners = new Set<() => void>();

function emit(): void {
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);

  // `storage` fires in *other* tabs: change the palette in one and the rest
  // should follow rather than sit on stale colours until reload.
  const onStorage = (event: StorageEvent) => {
    if (event.key !== PALETTE_KEY) return;
    refreshPalette();
    listener();
  };
  window.addEventListener("storage", onStorage);

  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", onStorage);
  };
}

/**
 * The palette in force, or null when the skin's own colours are showing.
 *
 * Reports null on the server and through hydration, exactly as `useSkin` does,
 * so **every consumer must sit inside a subtree gated on `store.hydrated`**.
 * Token-level differences never need this hook: the pre-paint script has
 * already written the inline properties, so CSS has the real answer while this
 * still says null.
 */
export function usePalette(): Palette | null {
  return useSyncExternalStore(subscribe, currentPalette, () => null);
}

/** `setPalette`, plus the notification the hook needs. */
export function changePalette(palette: Palette | null): void {
  setPalette(palette);
  emit();
}

/**
 * Follow the OS between light and dark.
 *
 * A palette carries both halves and an inline style cannot hold a media query,
 * so the swap that CSS does for free has to be done by hand. Mounted once, from
 * `Hydrator`.
 */
export function watchPaletteMode(): () => void {
  const query = window.matchMedia("(prefers-color-scheme: dark)");
  const onChange = () => applyPaletteVars();
  query.addEventListener("change", onChange);
  return () => query.removeEventListener("change", onChange);
}

/**
 * Read the active skin's own colours out of the stylesheet, both modes.
 *
 * The starting point for "customise what I am already looking at". It works by
 * asking the browser rather than duplicating `app/globals.css` in TypeScript —
 * a second copy of three skins' worth of hexes would be wrong within a release.
 *
 * The inline properties are lifted and `data-theme` is driven to each mode in
 * turn to read the other half. Both are restored in a `finally`, and none of it
 * paints: the whole function runs inside one task, so the browser never gets a
 * frame in which the document is mid-flip.
 */
export function paletteFromSkin(): Palette {
  const root = document.documentElement;
  const inline = root.getAttribute("style");
  const theme = root.dataset.theme;

  // Any palette already applied would otherwise be read straight back out.
  root.removeAttribute("style");

  try {
    return { light: readSkinMode(root, "light"), dark: readSkinMode(root, "dark") };
  } finally {
    if (theme === undefined) delete root.dataset.theme;
    else root.dataset.theme = theme;

    if (inline === null) root.removeAttribute("style");
    else root.setAttribute("style", inline);
  }
}

/** What a token falls back to when a skin left it un-hexable. */
const LAST_RESORT: Record<Mode, string> = { light: "#ffffff", dark: "#0d1117" };

function readSkinMode(root: HTMLElement, mode: Mode): Swatches {
  root.dataset.theme = mode;
  const computed = window.getComputedStyle(root);
  const raw = (token: string) => computed.getPropertyValue(token);

  // The page colour is resolved first so everything else can fall back to it.
  // `grid` sets `--quote-bg: transparent`, which is not a colour a swatch can
  // hold; sitting on the page is what it looked like, so that is what it gets.
  const background = toHex(raw("--background")) ?? LAST_RESORT[mode];

  const swatches = {} as Swatches;
  for (const token of PALETTE_TOKENS) {
    swatches[token] = toHex(raw(token)) ?? background;
  }
  return swatches;
}

/**
 * A computed custom property as `#rrggbb`, or null if it is not an opaque
 * colour.
 *
 * Custom properties are not parsed as colours by the engine — `getPropertyValue`
 * hands back whatever the stylesheet wrote, with `var()` substituted. So the
 * common case is already a hex, and anything else is handed to the one parser
 * that is guaranteed to agree with the renderer: the renderer.
 */
function toHex(value: string): string | null {
  const trimmed = value.trim().toLowerCase();
  if (/^#[0-9a-f]{6}$/.test(trimmed)) return trimmed;
  if (/^#[0-9a-f]{3}$/.test(trimmed)) {
    const [, r, g, b] = trimmed;
    return `#${r}${r}${g}${g}${b}${b}`;
  }
  if (trimmed === "") return null;
  return resolveColour(trimmed);
}

/** An unlikely colour, so an assignment the parser rejected is recognisable. */
const SENTINEL = "rgb(1, 2, 3)";

function resolveColour(value: string): string | null {
  const probe = document.createElement("span");
  probe.style.display = "none";
  probe.style.color = SENTINEL;
  probe.style.color = value;
  document.body.appendChild(probe);
  const computed = window.getComputedStyle(probe).color;
  probe.remove();

  const parts = /^rgba?\(([^)]+)\)$/.exec(computed)?.[1].split(/[\s,/]+/).filter(Boolean);
  if (parts === undefined || parts.length < 3) return null;

  const [r, g, b, a] = parts.map(Number);
  // `transparent` resolves to a fully transparent black, which as a swatch
  // would read as "the user picked black". It did not pick anything.
  if (a === 0) return null;
  if (computed === SENTINEL) return null;

  const byte = (v: number) => Math.round(v).toString(16).padStart(2, "0");
  return `#${byte(r)}${byte(g)}${byte(b)}`;
}
