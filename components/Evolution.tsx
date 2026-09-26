"use client";

import { useEffect, useRef, useState, type CSSProperties } from "react";
import { Sprite } from "@/components/Sprite";
import { lineOf, type Evolution as Change } from "@/lib/creatures";
import { evolutionShown, useEvolution } from "@/lib/party";
import "@/app/evolution.css";

type Phase = "intro" | "morph" | "flash" | "reveal";

const NEXT: Partial<Record<Phase, [Phase, number]>> = {
  intro: ["morph", 1400],
  morph: ["flash", 3200],
  flash: ["reveal", 450],
};

const SCALE = 7;
const SPARKS = 10;

/**
 * Plays the head of the evolution queue (§5.5). Mounted once in the root
 * layout, since a claim can evolve a creature from any screen. Tapping skips to
 * the reveal; reduced motion starts there.
 */
export function Evolution() {
  const evolution = useEvolution();
  if (!evolution) return null;
  return (
    <Sequence key={`${evolution.line}:${evolution.to}`} change={evolution} />
  );
}

function Sequence({ change }: { change: Change }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [phase, setPhase] = useState<Phase>(() =>
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
      ? "reveal"
      : "intro",
  );
  const line = lineOf(change.line)!;
  const before = line.forms[change.from];
  const after = line.forms[change.to];
  const stage = Math.max(before.sprite.length, after.sprite.length) * SCALE;

  useEffect(() => {
    dialog.current?.showModal();
  }, []);

  useEffect(() => {
    const next = NEXT[phase];
    if (!next) return;
    const timer = setTimeout(() => setPhase(next[0]), next[1]);
    return () => clearTimeout(timer);
  }, [phase]);

  function finish() {
    dialog.current?.close();
    evolutionShown();
  }

  const inks = Object.entries(after.colors)
    .filter(([key]) => key !== "o")
    .map(([, hex]) => hex);

  return (
    <dialog
      ref={dialog}
      data-slot="evolution"
      aria-labelledby="evolution-status"
      onCancel={(event) => {
        event.preventDefault();
        if (phase === "reveal") finish();
        else setPhase("reveal");
      }}
      onClick={() => phase !== "reveal" && setPhase("reveal")}
      className="m-auto w-[min(22rem,calc(100vw-2rem))] p-6 text-center"
    >
      <div
        className="relative mx-auto flex items-end justify-center"
        style={{ height: stage, width: stage }}
      >
        {phase === "intro" && <Sprite creature={before} still scale={SCALE} />}

        {(phase === "morph" || phase === "flash") && (
          <>
            <div data-evolve="old" className="absolute bottom-0">
              <Sprite
                creature={before}
                silhouette
                scale={SCALE}
                className="text-white"
              />
            </div>
            <div data-evolve="new" className="absolute bottom-0">
              <Sprite
                creature={after}
                silhouette
                scale={SCALE}
                className="text-white"
              />
            </div>
            {Array.from({ length: SPARKS }, (_, i) => {
              const angle = (i / SPARKS) * Math.PI * 2;
              const reach = stage * 0.7;
              return (
                <span
                  key={i}
                  data-spark
                  aria-hidden="true"
                  style={
                    {
                      background: inks[i % inks.length],
                      "--dx": `${Math.round(Math.cos(angle) * reach)}px`,
                      "--dy": `${Math.round(Math.sin(angle) * reach)}px`,
                      animationDelay: `${(i % 4) * 0.4}s`,
                    } as CSSProperties
                  }
                />
              );
            })}
          </>
        )}

        {phase === "reveal" && <Sprite creature={after} scale={SCALE} />}
      </div>

      {phase === "flash" && <div data-evolve="flash" aria-hidden="true" />}

      <p
        id="evolution-status"
        aria-live="polite"
        className="mt-5 text-[15px] font-medium"
      >
        {phase === "reveal"
          ? `${before.name} became ${after.name}!`
          : `${before.name} is changing…`}
      </p>

      {phase === "reveal" ? (
        <>
          <p className="mt-2 text-[12px] leading-snug opacity-80">
            {after.blurb}
          </p>
          <button
            type="button"
            autoFocus
            onClick={finish}
            className="mt-5 h-10 rounded-control border border-white/40 px-4 text-[13px] font-medium"
          >
            Continue
          </button>
        </>
      ) : (
        <p className="mt-2 text-[12px] opacity-60">Tap to skip</p>
      )}
    </dialog>
  );
}
