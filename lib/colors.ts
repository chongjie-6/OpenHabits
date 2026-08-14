import type { Level } from "./history";
import type { HabitColorKey } from "./types";

/** "neutral" is the all-habits green ramp; a habit key recolours it. */
export type Ramp = "neutral" | HabitColorKey;

/** CSS custom property for a habit accent. */
export function habitColor(key: HabitColorKey): string {
  return `var(--habit-${key})`;
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
  return `color-mix(in oklab, var(--habit-${ramp}) ${MIX[level]}%, var(--hm-0))`;
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
