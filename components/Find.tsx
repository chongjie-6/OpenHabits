"use client";

import { useEffect, useRef, useState } from "react";
import { Sprite } from "@/components/Sprite";
import { lineOf } from "@/lib/creatures";
import { findShown, useFind } from "@/lib/party";
import "@/app/evolution.css";

type Phase = "hidden" | "flash" | "reveal";

const NEXT: Partial<Record<Phase, [Phase, number]>> = {
  hidden: ["flash", 1200],
  flash: ["reveal", 450],
};

const SCALE = 7;

/**
 * Plays the head of the find queue (§5.5) on the evolution's stage: the
 * silhouette the dex showed, a flash, then the creature. Tapping skips to the
 * reveal; reduced motion starts there.
 */
export function Find() {
  const find = useFind();
  if (!find) return null;
  return <Reveal key={find} id={find} />;
}

function Reveal({ id }: { id: string }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [phase, setPhase] = useState<Phase>(() =>
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
      ? "reveal"
      : "hidden",
  );
  const creature = lineOf(id)!.forms[0];
  const stage = creature.sprite.length * SCALE;

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
    findShown();
  }

  return (
    <dialog
      ref={dialog}
      data-slot="find"
      aria-labelledby="find-status"
      onCancel={(event) => {
        event.preventDefault();
        if (phase === "reveal") finish();
        else setPhase("reveal");
      }}
      onClick={() => phase !== "reveal" && setPhase("reveal")}
      className="m-auto w-[min(22rem,calc(100vw-2rem))] p-6 text-center"
    >
      <div
        className="mx-auto flex items-end justify-center"
        style={{ height: stage, width: stage }}
      >
        {phase === "reveal" ? (
          <Sprite creature={creature} scale={SCALE} />
        ) : (
          <Sprite
            creature={creature}
            silhouette
            scale={SCALE}
            className="text-white"
          />
        )}
      </div>

      {phase === "flash" && <div data-evolve="flash" aria-hidden="true" />}

      <p
        id="find-status"
        aria-live="polite"
        className="mt-5 text-[15px] font-medium"
      >
        {phase === "reveal"
          ? `You found ${creature.name}!`
          : "Something's here…"}
      </p>

      {phase === "reveal" ? (
        <>
          <p className="mt-2 text-[12px] leading-snug opacity-80">
            {creature.blurb}
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
