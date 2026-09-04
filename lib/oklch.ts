/**
 * sRGB ↔ OKLCh, and gamut mapping. See DESIGN.md §6.6.
 *
 * A custom palette is derived from one seed colour, which means holding a hue
 * steady while moving lightness until a contrast target is met. sRGB has no
 * axis that does that — its "lightness" drags hue and saturation with it — so
 * the maths happens in OKLab and comes back as hex.
 *
 * CSS can do the same thing inline (`oklch(from … l c h)`, which is what
 * `lib/colors.ts` uses for habit accents) but only the browser can evaluate it.
 * A palette has to be measured for contrast before it is applied, and stored as
 * plain hex so the pre-paint script in `lib/theme.ts` can write it without a
 * parser. Hence the duplication: CSS for one live value, this for whole
 * palettes.
 *
 * Conversion coefficients are Björn Ottosson's OKLab definition.
 */

export type Rgb = { r: number; g: number; b: number };
export type Oklch = { l: number; c: number; h: number };

const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);

/** Accepts `#rgb` and `#rrggbb`; anything else is not a colour we can measure. */
export function parseHex(value: string): Rgb | null {
  const hex = value.trim().toLowerCase();
  if (/^#[0-9a-f]{3}$/.test(hex)) {
    return {
      r: parseInt(hex[1] + hex[1], 16) / 255,
      g: parseInt(hex[2] + hex[2], 16) / 255,
      b: parseInt(hex[3] + hex[3], 16) / 255,
    };
  }
  if (!/^#[0-9a-f]{6}$/.test(hex)) return null;
  return {
    r: parseInt(hex.slice(1, 3), 16) / 255,
    g: parseInt(hex.slice(3, 5), 16) / 255,
    b: parseInt(hex.slice(5, 7), 16) / 255,
  };
}

export function toHex({ r, g, b }: Rgb): string {
  const byte = (v: number) =>
    Math.round(clamp01(v) * 255)
      .toString(16)
      .padStart(2, "0");
  return `#${byte(r)}${byte(g)}${byte(b)}`;
}

/** sRGB transfer function, both directions. Values are 0–1, not 0–255. */
function toLinear(v: number): number {
  return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
}

function toGamma(v: number): number {
  return v <= 0.0031308 ? v * 12.92 : 1.055 * v ** (1 / 2.4) - 0.055;
}

export function rgbToOklch(rgb: Rgb): Oklch {
  const r = toLinear(rgb.r);
  const g = toLinear(rgb.g);
  const b = toLinear(rgb.b);

  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);

  const L = 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s;
  const A = 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s;
  const B = 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s;

  const c = Math.sqrt(A * A + B * B);
  // A neutral has no meaningful hue; reporting 0 keeps it stable through a
  // round trip instead of letting float noise pick an angle.
  const h = c < 1e-6 ? 0 : ((Math.atan2(B, A) * 180) / Math.PI + 360) % 360;
  return { l: L, c, h };
}

/** May land outside sRGB — `inGamut` is the check, `clipChroma` the fix. */
export function oklchToRgb({ l: L, c, h }: Oklch): Rgb {
  const rad = (h * Math.PI) / 180;
  const A = c * Math.cos(rad);
  const B = c * Math.sin(rad);

  const l = (L + 0.3963377774 * A + 0.2158037573 * B) ** 3;
  const m = (L - 0.1055613458 * A - 0.0638541728 * B) ** 3;
  const s = (L - 0.0894841775 * A - 1.291485548 * B) ** 3;

  return {
    r: toGamma(4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s),
    g: toGamma(-1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s),
    b: toGamma(-0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s),
  };
}

function inGamut({ r, g, b }: Rgb): boolean {
  const ok = (v: number) => v >= -1e-4 && v <= 1 + 1e-4;
  return ok(r) && ok(g) && ok(b);
}

/**
 * Pull chroma down until the colour fits sRGB, keeping lightness and hue.
 *
 * Clamping the channels instead — the obvious shortcut — shifts the hue,
 * which is the one thing the caller asked to hold fixed.
 */
export function clipChroma(colour: Oklch): Rgb {
  const direct = oklchToRgb(colour);
  if (inGamut(direct)) return direct;

  let lo = 0;
  let hi = colour.c;
  for (let i = 0; i < 24; i++) {
    const mid = (lo + hi) / 2;
    if (inGamut(oklchToRgb({ ...colour, c: mid }))) lo = mid;
    else hi = mid;
  }
  return oklchToRgb({ ...colour, c: lo });
}

export function oklchToHex(colour: Oklch): string {
  return toHex(clipChroma(colour));
}

export function hexToOklch(hex: string): Oklch | null {
  const rgb = parseHex(hex);
  return rgb === null ? null : rgbToOklch(rgb);
}
