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

/** Runs before paint, inlined into <head>. Keep it tiny and total-failure-safe. */
export const THEME_SCRIPT = `try{var t=localStorage.getItem('${THEME_KEY}');if(t==='dark'||t==='light'){document.documentElement.dataset.theme=t}}catch(e){}`;

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
