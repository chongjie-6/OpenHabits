"use client";

/**
 * The contribution grid, rendered to an image the user can keep. See DESIGN.md
 * §4.6.
 *
 * Social features are a v1 non-goal and this is not one: nothing is posted,
 * no account is involved, and the file goes wherever the user's own share sheet
 * sends it. It is an *export* — G5's "the data is theirs" pointed at the one
 * screen G2 calls the emotional payoff.
 *
 * Drawn rather than screenshotted. `components/Heatmap.tsx` renders SVG sized
 * for a phone, with a keyboard cursor, selection rings and month gutters that
 * belong to an interface, not to a picture; serialising it would also inline
 * every CSS variable it depends on. The layout here is its own, at a fixed size
 * that does not depend on the viewport.
 */

import { levelColor, type Ramp } from "./colors";
import { formatMonthShort } from "./dates";
import type { DayStat } from "./history";

/**
 * Fixed cell metrics rather than a fixed canvas: the grid is the subject, and a
 * cell should be the same size whether the card covers twenty weeks or
 * fifty-three. The canvas is sized to fit what it holds, down to a floor wide
 * enough that a short window still reads as a card rather than a strip.
 */
const CELL = 22;
const GAP = 5;
const STEP = CELL + GAP;
const MIN_W = 1080;

const PAD = 72;
/** Title, subtitle, and the month labels that sit just above the first row. */
const GRID_TOP = 260;
/** Baseline of the figures row below the grid, then the footer under that. */
const FIGURES_DROP = 108;
const FOOTER_DROP = 92;

export type ShareCard = {
  title: string;
  /** The line under the title — a cadence, a date range, whatever names it. */
  subtitle: string;
  /** Up to three headline numbers, drawn as a row under the grid. */
  figures: { value: string; label: string }[];
  stats: DayStat[];
  ramp?: Ramp;
};

/**
 * Every colour the card needs, already resolved to something a canvas accepts.
 *
 * The tokens are CSS custom properties, and two of the ramps are `color-mix`
 * or relative-colour expressions on top of them — none of which
 * `ctx.fillStyle` can parse. So each one is assigned to a throwaway element and
 * read back through `getComputedStyle`, which is the browser's own resolver and
 * the only thing that knows the current theme, skin and palette.
 */
function resolveColors(values: string[]): string[] {
  const probe = document.createElement("span");
  probe.style.display = "none";
  document.body.appendChild(probe);

  try {
    return values.map((value) => {
      probe.style.color = "";
      probe.style.color = value;
      const computed = getComputedStyle(probe).color;
      // An unparseable value leaves `color` unset, and the computed value is
      // then whatever the span inherited — wrong, but never invalid, so the
      // card renders in the wrong colour rather than throwing mid-draw.
      return computed || "#000000";
    });
  } finally {
    probe.remove();
  }
}

type Palette = {
  background: string;
  foreground: string;
  muted: string;
  border: string;
  levels: string[];
};

function palette(ramp: Ramp): Palette {
  const [background, foreground, muted, border, l0, l1, l2, l3, l4] = resolveColors([
    "var(--background)",
    "var(--foreground)",
    "var(--muted)",
    "var(--border)",
    levelColor(0, ramp),
    levelColor(1, ramp),
    levelColor(2, ramp),
    levelColor(3, ramp),
    levelColor(4, ramp),
  ]);
  return { background, foreground, muted, border, levels: [l0, l1, l2, l3, l4] };
}

export type Geometry = {
  width: number;
  height: number;
  /** Left edge of the first column, centred when the grid is narrower than the card. */
  left: number;
  gridBottom: number;
};

/**
 * Canvas size and grid origin for a given number of weeks.
 *
 * Seven rows deep and as many columns as there are weeks. Exported because it
 * is the one part of this file that can be checked without a canvas — and the
 * part where an off-by-one puts the last week over the edge of the image.
 */
export function geometry(weeks: number): Geometry {
  const grid = Math.max(1, weeks) * STEP - GAP;
  const width = Math.max(MIN_W, grid + PAD * 2);
  const gridBottom = GRID_TOP + 7 * STEP - GAP;
  return {
    width,
    height: gridBottom + FIGURES_DROP + FOOTER_DROP + PAD,
    left: Math.round((width - grid) / 2),
    gridBottom,
  };
}

/**
 * Render the card. Returns a PNG blob, or null where the browser gives no 2D
 * context — which is the same answer as "this device cannot share an image".
 */
export async function renderShareCard(card: ShareCard): Promise<Blob | null> {
  const weeks = Math.ceil(card.stats.length / 7);
  const { width, height, left, gridBottom } = geometry(weeks);
  const colors = palette(card.ramp ?? "neutral");

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;

  ctx.fillStyle = colors.background;
  ctx.fillRect(0, 0, width, height);

  ctx.textBaseline = "alphabetic";
  ctx.fillStyle = colors.foreground;
  ctx.font = "600 56px system-ui, sans-serif";
  ctx.fillText(truncate(ctx, card.title, width - PAD * 2), PAD, PAD + 56);

  ctx.fillStyle = colors.muted;
  ctx.font = "400 30px system-ui, sans-serif";
  ctx.fillText(truncate(ctx, card.subtitle, width - PAD * 2), PAD, PAD + 110);

  // Month labels, at the first week of each month with the same three-column
  // breathing room the on-screen grid uses to keep February off January.
  ctx.font = "400 22px system-ui, sans-serif";
  let previousMonth = "";
  let lastLabelled = -3;
  for (let week = 0; week < weeks; week++) {
    const first = card.stats[week * 7];
    if (!first) continue;
    const month = first.date.slice(0, 7);
    if (month !== previousMonth && week - lastLabelled >= 3) {
      ctx.fillText(formatMonthShort(first.date), left + week * STEP, GRID_TOP - 18);
      lastLabelled = week;
    }
    previousMonth = month;
  }

  card.stats.forEach((stat, index) => {
    const x = left + Math.floor(index / 7) * STEP;
    const y = GRID_TOP + (index % 7) * STEP;

    if (stat.level === "rest") {
      // A rest day is an outline, exactly as on screen — an empty square and a
      // day with nothing done are different things and must not look alike.
      ctx.strokeStyle = colors.border;
      ctx.lineWidth = 1.5;
      roundRect(ctx, x + 0.75, y + 0.75, CELL - 1.5, CELL - 1.5, 5);
      ctx.stroke();
      return;
    }

    ctx.fillStyle = colors.levels[stat.level];
    roundRect(ctx, x, y, CELL, CELL, 5);
    ctx.fill();
  });

  drawFigures(ctx, card.figures, gridBottom + FIGURES_DROP, width, colors);

  ctx.fillStyle = colors.muted;
  ctx.font = "400 24px system-ui, sans-serif";
  ctx.fillText("OpenHabits", PAD, height - PAD);

  return new Promise((resolve) => canvas.toBlob(resolve, "image/png"));
}

function drawFigures(
  ctx: CanvasRenderingContext2D,
  figures: ShareCard["figures"],
  y: number,
  width: number,
  colors: Palette,
): void {
  if (figures.length === 0) return;
  const column = (width - PAD * 2) / figures.length;

  figures.forEach((figure, i) => {
    const x = PAD + i * column;
    ctx.fillStyle = colors.foreground;
    ctx.font = "600 64px ui-monospace, monospace";
    ctx.fillText(figure.value, x, y);
    ctx.fillStyle = colors.muted;
    ctx.font = "400 24px system-ui, sans-serif";
    ctx.fillText(figure.label.toUpperCase(), x, y + 36);
  });
}

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
): void {
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, r);
}

/** Trim to fit the measured width, with an ellipsis, using the current font. */
function truncate(ctx: CanvasRenderingContext2D, text: string, max: number): string {
  if (ctx.measureText(text).width <= max) return text;
  let cut = text;
  while (cut.length > 1 && ctx.measureText(`${cut}…`).width > max) {
    cut = cut.slice(0, -1);
  }
  return `${cut}…`;
}

/**
 * Hand the image to the user: the system share sheet where there is one, a
 * download where there is not.
 *
 * `canShare` is checked with the actual file, not just for the API's existence
 * — desktop Chrome has `navigator.share` and refuses files — and a cancelled
 * share sheet throws `AbortError`, which is a completed interaction rather than
 * a failure to report.
 */
export async function shareImage(blob: Blob, filename: string): Promise<"shared" | "saved"> {
  const file = new File([blob], filename, { type: "image/png" });

  if (navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file] });
      return "shared";
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return "shared";
      // Anything else — a share target that rejected the file, a permissions
      // policy — falls through to the download, which always works.
    }
  }

  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
  return "saved";
}
