import type { Level } from "./history";
import { isHexColor, type HabitColor } from "./types";

/** "neutral" is the all-habits green ramp; a habit colour recolours it. */
export type Ramp = "neutral" | HabitColor;

/**
 * A CSS colour for a habit accent.
 *
 * Palette keys are custom properties, so they pick up the theme's variant. A
 * user-picked hex has only the one value, so its lightness is clamped into the
 * band the palette occupies in the current theme (`--habit-l-*`) while hue and
 * chroma are left alone. Without that, "any colour you like" includes navy on
 * the dark background and yellow on the light one, and DESIGN.md §6.2's 3:1
 * floor for the ramp's first step stops holding.
 */
export function habitColor(color: HabitColor): string {
  if (!isHexColor(color)) return `var(--habit-${color})`;
  return `oklch(from ${color} clamp(var(--habit-l-min), l, var(--habit-l-max)) c h)`;
}

// Per-habit ramps are mixed from the habit accent rather than hand-tuned into
// six five-step scales. `oklab` keeps the steps perceptually even, and mixing
// toward the empty-cell colour means both themes fall out of the same formula.
const MIX: Record<1 | 2 | 3 | 4, number> = { 1: 30, 2: 55, 3: 78, 4: 100 };

/** Fill for a contribution cell at a given level. */
export function levelColor(level: Level, ramp: Ramp = "neutral"): string {
  if (level === "rest") return "transparent";
  if (ramp === "neutral") return `var(--hm-${level})`;
  if (level === 0) return "var(--hm-0)";
  return `color-mix(in oklab, ${habitColor(ramp)} ${MIX[level]}%, var(--hm-0))`;
}

/** Plain-language level, for the cell's accessible name. */
export const LEVEL_LABEL: Record<string, string> = {
  rest: "nothing scheduled",
  "0": "nothing completed",
  "1": "a little done",
  "2": "some done",
  "3": "most done",
  "4": "everything done",
};
