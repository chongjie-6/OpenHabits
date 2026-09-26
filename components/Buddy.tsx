"use client";

import Link from "next/link";
import { Sprite } from "@/components/Sprite";
import {
  creatureLevel,
  expForLevel,
  formFor,
  lineOf,
  MAX_LEVEL,
  type OwnedCreature,
} from "@/lib/creatures";
import { useCreatures } from "@/lib/party";

/** Today's buddy (§5.5). Nothing signed out, or before a starter is chosen. */
export function Buddy() {
  const buddy = useCreatures()?.creatures.find((c) => c.slot === 0);
  if (!buddy) return null;

  return (
    <Link
      href="/dex"
      aria-label={`${formOf(buddy).name}, your buddy, level ${creatureLevel(buddy.exp)}`}
      className="surface-card flex items-center gap-3 bg-surface px-4 py-3"
    >
      <Sprite creature={formOf(buddy)} still scale={3} />
      <Nameplate creature={buddy} />
    </Link>
  );
}

/** Name, level and the bar toward the next one. */
export function Nameplate({
  creature,
  compact = false,
}: {
  creature: OwnedCreature;
  compact?: boolean;
}) {
  const level = creatureLevel(creature.exp);
  const floor = expForLevel(level);
  const span = expForLevel(level + 1) - floor;
  const progress =
    level === MAX_LEVEL ? 1 : Math.min(1, (creature.exp - floor) / span);

  return (
    <span className={`block w-full min-w-0 ${compact ? "mt-1" : ""}`}>
      <span className="flex items-baseline justify-between gap-2">
        <span
          className={`truncate font-medium ${compact ? "text-[12px]" : "text-[15px]"}`}
        >
          {formOf(creature).name}
        </span>
        <span className="shrink-0 font-mono text-[11px] tabular-nums text-muted">
          Lv {level}
        </span>
      </span>
      <span
        role="meter"
        aria-label="Exp toward the next level"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(progress * 100)}
        className="mt-1 block h-1.5 overflow-hidden rounded-full bg-surface-2"
      >
        <span
          className="block h-full rounded-full bg-accent"
          style={{ width: `${Math.round(progress * 100)}%` }}
        />
      </span>
      {!compact && (
        <span className="mt-1 block font-mono text-[11px] tabular-nums text-muted">
          {level === MAX_LEVEL
            ? `${creature.exp} exp · top level`
            : `${creature.exp - floor} / ${span} exp to Lv ${level + 1}`}
        </span>
      )}
    </span>
  );
}

export function formOf(creature: OwnedCreature) {
  return formFor(lineOf(creature.line)!, creature.exp);
}
