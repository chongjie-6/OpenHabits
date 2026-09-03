import type { Settings } from "./types";

/**
 * Theme is mirrored into localStorage as well as IndexedDB.
 *
 * IndexedDB is async, so it cannot be read before first paint. The blocking
 * snippet in the document head reads this key synchronously to set
 * `data-theme`, which is what prevents a flash of the wrong theme.
 * See DESIGN.md §7.1.
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
 * Runs before paint, inlined into <head>. Keep it tiny and total-failure-safe.
 *
 * Both axes are read under one `try`: if `localStorage` throws — Safari in
 * private mode does — neither attribute is set and the document renders as
 * light/classic, which is exactly what the prerendered HTML already says.
 *
 * Only non-default values are written. An absent `data-theme` means "system"
 * and an absent `data-skin` means "classic", so a default install produces a
 * document element identical to the static build's.
 */
export const THEME_SCRIPT = `try{var d=document.documentElement,t=localStorage.getItem('${THEME_KEY}');if(t==='dark'||t==='light'){d.dataset.theme=t}var s=localStorage.getItem('${SKIN_KEY}');if(s==='grid'||s==='blocks'){d.dataset.skin=s}}catch(e){}`;

export function applyTheme(theme: Settings["theme"]): void {
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
}
