import { normalisePalette, type Mode, type Palette } from "./palette";

/** Light, dark, or whatever the OS says. */
export type Theme = "system" | "light" | "dark";

const DEFAULT_THEME: Theme = "system";

/**
 * Theme lives in localStorage, and **only** there. See DESIGN.md §13.8 #1.
 *
 * IndexedDB is async, so it cannot be read before first paint; the blocking
 * snippet in the document head reads this key synchronously to set
 * `data-theme`, which is what prevents a flash of the wrong theme (§7.1).
 *
 * It used to ride the synced settings blob as well, and that was recorded as a
 * wart from the day it shipped: choosing dark on a phone at night silently
 * repainted a laptop in another timezone. Appearance is now device-local on all
 * three axes — theme here, `skin` in `lib/skin.ts`, `palette` beside this — and
 * the cost is the one those two already pay: a look is not part of a backup,
 * and a new device starts on system.
 *
 * The key keeps its pre-rebrand name: a rename reads as "no theme stored" and
 * flashes every existing install back to system on its next load.
 */
export const THEME_KEY = "hapi-theme";

/**
 * The skin key lives here, beside the theme key, because both exist to be read
 * by the one pre-paint script below. `lib/skin.ts` owns everything else about
 * skins and imports this; the reverse would drag a `"use client"` module into
 * the server graph for the sake of one string. See DESIGN.md §6.5.
 */
export const SKIN_KEY = "hapi-skin";

/**
 * And the palette key, for the same reason. See DESIGN.md §6.6.
 *
 * Like `SKIN_KEY` this shares the `hapi` prefix by choice rather than by
 * history — it is not one of the four legacy names CLAUDE.md protects, but a
 * lone `openhabits-palette` beside `hapi-theme` in devtools reads as an
 * accident.
 */
export const PALETTE_KEY = "hapi-palette";

/**
 * Runs before paint, inlined into <head>. Keep it tiny and total-failure-safe.
 *
 * All three axes are read under one `try`: if `localStorage` throws — Safari in
 * private mode does — nothing is set and the document renders as
 * light/classic/unpainted, which is exactly what the prerendered HTML already
 * says. A malformed palette throws out of `JSON.parse` into the same catch.
 *
 * Only non-default values are written. An absent `data-theme` means "system",
 * an absent `data-skin` means "classic", and an empty inline style means "the
 * skin's own colours", so a default install produces a document element
 * identical to the static build's.
 *
 * The palette is applied as inline custom properties, which beat every skin's
 * `:root[data-skin=…]` block regardless of specificity — that is the whole
 * mechanism, and why no skin needs to know palettes exist. The regexes are not
 * decoration: these values are written straight into a style declaration, so
 * the script accepts a custom-property name and a six-digit hex and nothing
 * else. `applyPaletteVars` below is this code's runtime twin and must stay
 * behaviourally identical to it.
 */
export const THEME_SCRIPT = `try{var d=document.documentElement,t=localStorage.getItem('${THEME_KEY}');if(t==='dark'||t==='light'){d.dataset.theme=t}var s=localStorage.getItem('${SKIN_KEY}');if(s==='grid'||s==='blocks'){d.dataset.skin=s}var p=localStorage.getItem('${PALETTE_KEY}');if(p){var m=t==='dark'||(t!=='light'&&matchMedia('(prefers-color-scheme:dark)').matches)?'dark':'light',o=JSON.parse(p)[m];for(var k in o){if(/^--[a-z0-9-]+$/.test(k)&&/^#[0-9a-f]{6}$/i.test(o[k])){d.style.setProperty(k,o[k])}}}}catch(e){}`;

/**
 * Which half of a palette applies right now.
 *
 * `data-theme` when it is set, the OS preference when it is not — the same
 * question `@media (prefers-color-scheme: dark)` answers for the stylesheet,
 * asked in JS because an inline style cannot carry a media query.
 */
export function resolveMode(): Mode {
  if (typeof document === "undefined") return "light";
  const explicit = document.documentElement.dataset.theme;
  if (explicit === "dark") return "dark";
  if (explicit === "light") return "light";
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

function readStoredPalette(): Palette | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(PALETTE_KEY);
    return raw === null ? null : normalisePalette(JSON.parse(raw));
  } catch {
    // Storage disabled, or a value someone hand-edited into nonsense.
    return null;
  }
}

/**
 * The palette in force, held in memory rather than re-read on every paint.
 *
 * Two reasons, and the second is the one that matters. It gives `usePalette` a
 * stable identity to hand `useSyncExternalStore`, which would otherwise loop on
 * a freshly parsed object every render. And it is the only copy that exists
 * when `localStorage` throws — Safari in private mode — so a palette chosen in
 * such a session still survives a theme toggle instead of vanishing on the next
 * repaint.
 *
 * `undefined` means "not read yet", which is distinct from a stored `null`.
 */
let current: Palette | null | undefined;

export function currentPalette(): Palette | null {
  if (current === undefined) current = readStoredPalette();
  return current;
}

/**
 * Repaint the document element from the palette in force.
 *
 * Every custom property on the inline style is cleared first, so removing a
 * palette — or switching to a mode whose half differs — cannot leave a stale
 * colour behind. Wiping only custom properties, rather than the whole `style`
 * attribute, keeps this honest if anything else ever writes to it; today
 * nothing does.
 */
export function applyPaletteVars(): void {
  if (typeof document === "undefined") return;

  const root = document.documentElement;
  for (const name of Array.from(root.style)) {
    if (name.startsWith("--")) root.style.removeProperty(name);
  }

  const palette = currentPalette();
  if (palette === null) return;

  for (const [token, colour] of Object.entries(palette[resolveMode()])) {
    root.style.setProperty(token, colour);
  }

  syncThemeColor(palette);
}

/** The only way to change palette. Null restores the skin's own colours. */
export function setPalette(palette: Palette | null): void {
  current = palette;

  try {
    if (palette === null) localStorage.removeItem(PALETTE_KEY);
    else localStorage.setItem(PALETTE_KEY, JSON.stringify(palette));
  } catch {
    // Storage disabled. The palette still applies for this session.
  }

  applyPaletteVars();
}

/** Re-read storage and repaint — for a change another tab made. */
export function refreshPalette(): void {
  current = readStoredPalette();
  applyPaletteVars();
}

/**
 * Keep the browser chrome in step with the palette.
 *
 * `app/layout.tsx` ships two `theme-color` metas, one per `prefers-color-scheme`
 * branch. Both are rewritten rather than a third being appended, because the
 * browser honours the *first* tag whose media matches — an unmediated one added
 * at the end would never win.
 */
function syncThemeColor(palette: Palette): void {
  const pairs: [string, Mode][] = [
    ["(prefers-color-scheme: light)", "light"],
    ["(prefers-color-scheme: dark)", "dark"],
  ];

  for (const [media, mode] of pairs) {
    const tag = document.querySelector(`meta[name="theme-color"][media="${media}"]`);
    tag?.setAttribute("content", palette[mode]["--background"]);
  }
}

function isTheme(value: unknown): value is Theme {
  return value === "system" || value === "light" || value === "dark";
}

/**
 * Wrapped because Safari in private mode throws on `localStorage` rather than
 * returning null, and an optional look is no reason to take the app down.
 */
export function readTheme(): Theme {
  if (typeof window === "undefined") return DEFAULT_THEME;
  try {
    const stored = window.localStorage.getItem(THEME_KEY);
    return isTheme(stored) ? stored : DEFAULT_THEME;
  } catch {
    return DEFAULT_THEME;
  }
}

export function applyTheme(theme: Theme): void {
  if (typeof document === "undefined") return;

  if (theme === "system") {
    delete document.documentElement.dataset.theme;
  } else {
    document.documentElement.dataset.theme = theme;
  }

  try {
    localStorage.setItem(THEME_KEY, theme);
  } catch {
    // Storage disabled. The theme still applies for this session.
  }

  // A palette has a light half and a dark half, and the answer to which one
  // applies just changed. Every caller of `applyTheme` gets this for free,
  // which is why `lib/store.ts` needs to know nothing about palettes.
  applyPaletteVars();
}
