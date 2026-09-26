"use client";

import { useState, type CSSProperties } from "react";
import type { Creature, Pixel, PixelBox } from "@/lib/types";
import "@/app/dex/idle";

/**
 * A creature drawn from its pixel map (§5.5), idling when it has a rig. A
 * silhouette neither idles nor answers a tap; `still` keeps the idle but drops
 * the tap, for a sprite that sits inside some other control.
 */
export function Sprite({
  creature,
  silhouette = false,
  still = false,
  scale = 6,
  className,
}: {
  creature: Creature;
  silhouette?: boolean;
  still?: boolean;
  scale?: number;
  /** Replaces the silhouette's muted ink, which is `currentColor`. */
  className?: string;
}) {
  const [poked, setPoked] = useState(false);
  const size = creature.sprite.length;
  const rig = silhouette ? undefined : creature.rig;
  const parts = Object.entries(rig?.parts ?? {});
  const pixels = creature.sprite.flatMap((row, y) =>
    [...row].flatMap((key, x): Pixel[] => (key === "." ? [] : [[x, y, key]])),
  );
  const inside = ([x, y]: Pixel, [bx, by, w, h]: PixelBox) =>
    x >= bx && x < bx + w && y >= by && y < by + h;
  const draw = ([x, y, key]: Pixel) => (
    <rect
      key={`${x},${y}`}
      x={x}
      y={y}
      width={1}
      height={1}
      data-px={key}
      fill={silhouette ? "currentColor" : creature.colors[key]}
    />
  );
  // Keyframes name colours by key, e.g. a blink is `fill: var(--o)`.
  const inks = Object.fromEntries(
    Object.entries(creature.colors).map(([key, hex]) => [`--${key}`, hex]),
  ) as CSSProperties;

  const svg = (
    <svg
      viewBox={`0 0 ${size} ${size}`}
      width={size * scale}
      height={size * scale}
      shapeRendering="crispEdges"
      className={silhouette ? (className ?? "text-muted") : "overflow-visible"}
      data-creature={rig && creature.id}
      style={rig && inks}
      role="img"
      aria-label={silhouette ? "Undiscovered creature" : creature.name}
    >
      <g>
        <g
          data-poked={poked || undefined}
          onAnimationEnd={(e) =>
            e.target === e.currentTarget && setPoked(false)
          }
        >
          {pixels
            .filter((p) => !parts.some(([, box]) => inside(p, box)))
            .map(draw)}
          {Object.entries(rig?.fx ?? {}).map(([name, fx]) => (
            <g key={name} data-fx={name}>
              {fx.map(draw)}
            </g>
          ))}
          {parts.map(([name, box]) => (
            <g key={name} data-part={name}>
              {pixels.filter((p) => inside(p, box)).map(draw)}
            </g>
          ))}
        </g>
      </g>
    </svg>
  );

  if (!rig || still) return svg;
  return (
    <button
      type="button"
      onClick={() => setPoked(true)}
      className="cursor-pointer touch-manipulation"
    >
      {svg}
    </button>
  );
}
