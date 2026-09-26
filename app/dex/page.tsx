"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { formOf, Nameplate } from "@/components/Buddy";
import { Sheet } from "@/components/Sheet";
import { Sprite } from "@/components/Sprite";
import {
  COGLINGS,
  creatureLevel,
  CREATURES,
  DISCOVERY_DAYS,
  formFor,
  isFound,
  lineOf,
  LINES,
  movesAt,
  PARTY_SIZE,
  payout,
  QUALIFYING_RATE,
  stageAt,
  STARTERS,
  type CreatureState,
} from "@/lib/creatures";
import { firstDayOf, statFor } from "@/lib/history";
import { chooseStarter, setParty, useCreatures } from "@/lib/party";
import { useSignedIn } from "@/lib/session";
import { useOpenHabits } from "@/lib/store";
import { useToday } from "@/lib/use-today";

const SCALE = 6;
const STAGE =
  Math.max(...[...COGLINGS, ...CREATURES].map((c) => c.sprite.length)) * SCALE;

export default function DexPage() {
  const { hydrated } = useOpenHabits();
  const signedIn = useSignedIn();
  const owned = useCreatures();
  const [open, setOpen] = useState<string | null>(null);

  if (!hydrated) return <Skeleton />;

  return (
    <section className="space-y-6">
      <h1 className="display-type text-[15px]">Creatures</h1>

      {!signedIn ? (
        <p className="text-[13px] leading-relaxed text-muted">
          Creatures are raised on an account, so that what they earn is checked
          rather than claimed.{" "}
          <Link
            href="/settings"
            className="underline underline-offset-4 hover:text-foreground"
          >
            Sign in from Settings
          </Link>{" "}
          to choose your first.
        </p>
      ) : !owned ? (
        <Skeleton />
      ) : owned.creatures.length === 0 ? (
        <StarterPicker />
      ) : (
        <>
          <Party state={owned} onOpen={setOpen} />
          <Progress state={owned} />
          <Box state={owned} onOpen={setOpen} />
        </>
      )}

      <Dex owned={signedIn ? owned : null} />

      {owned && (
        <CreatureSheet
          state={owned}
          line={open}
          onClose={() => setOpen(null)}
        />
      )}
    </section>
  );
}

function StarterPicker() {
  const [picked, setPicked] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const chosen = picked ? lineOf(picked) : undefined;

  async function start() {
    if (!picked) return;
    setBusy(true);
    setProblem(await chooseStarter(picked));
    setBusy(false);
  }

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-[15px] font-medium">Choose your first creature</h2>
        <p className="mt-1 text-[13px] leading-relaxed text-muted">
          It becomes your buddy, and grows on every day you finish. The other
          two can still be found later.
        </p>
      </div>

      <ul className="grid grid-cols-3 gap-2">
        {STARTERS.map((id) => {
          const base = lineOf(id)!.forms[0];
          const selected = picked === id;
          return (
            <li key={id}>
              <button
                type="button"
                aria-pressed={selected}
                onClick={() => setPicked(id)}
                className={`surface-card flex w-full flex-col items-center bg-surface px-2 py-4 text-center transition-colors ${
                  selected ? "border-accent ring-2 ring-accent" : ""
                }`}
              >
                <Sprite creature={base} still scale={5} />
                <span className="mt-2 text-[13px] font-medium">
                  {base.name}
                </span>
              </button>
            </li>
          );
        })}
      </ul>

      {chosen && (
        <p className="text-[12px] leading-relaxed text-muted">
          {chosen.forms[0].blurb}
        </p>
      )}

      <button
        type="button"
        disabled={!chosen || busy}
        onClick={start}
        className="h-10 rounded-control border border-accent bg-accent px-3 text-[13px] font-medium text-accent-fg transition-opacity disabled:opacity-50"
      >
        {chosen ? `Start with ${chosen.forms[0].name}` : "Pick one"}
      </button>
      {problem && (
        <p role="alert" className="text-[12px] text-muted">
          {problem}
        </p>
      )}
    </div>
  );
}

function Party({
  state,
  onOpen,
}: {
  state: CreatureState;
  onOpen: (line: string) => void;
}) {
  const seats = Array.from(
    { length: PARTY_SIZE },
    (_, slot) => state.creatures.find((c) => c.slot === slot) ?? null,
  );
  const [buddy, ...rest] = seats;

  return (
    <div className="space-y-2">
      <h2 className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted">
        Party
      </h2>
      {buddy && (
        <button
          type="button"
          onClick={() => onOpen(buddy.line)}
          className="surface-card flex w-full items-center gap-4 bg-surface p-4 text-left"
        >
          <Sprite creature={formOf(buddy)} still scale={5} />
          <span className="min-w-0 flex-1">
            <span className="text-[11px] text-muted">Buddy</span>
            <Nameplate creature={buddy} />
          </span>
        </button>
      )}
      <ul className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {rest.map((creature, i) => (
          <li key={creature?.line ?? `empty-${i}`}>
            {creature ? (
              <button
                type="button"
                onClick={() => onOpen(creature.line)}
                className="surface-card flex w-full flex-col items-center bg-surface p-3 text-center"
              >
                <Sprite creature={formOf(creature)} still scale={3} />
                <Nameplate creature={creature} compact />
              </button>
            ) : (
              <div className="flex h-full min-h-24 items-center justify-center rounded-card border border-dashed border-border text-[11px] text-muted">
                Empty
              </div>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}

function Box({
  state,
  onOpen,
}: {
  state: CreatureState;
  onOpen: (line: string) => void;
}) {
  const boxed = state.creatures.filter((c) => c.slot === null);
  if (boxed.length === 0) return null;

  return (
    <div className="space-y-2">
      <h2 className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted">
        Resting
      </h2>
      <p className="text-[12px] text-muted">
        Only the party earns exp. Tap one to bring it along.
      </p>
      <ul className="grid grid-cols-3 gap-2 sm:grid-cols-5">
        {boxed.map((creature) => (
          <li key={creature.line}>
            <button
              type="button"
              onClick={() => onOpen(creature.line)}
              className="surface-card flex w-full flex-col items-center bg-surface p-2 text-center"
            >
              <Sprite creature={formOf(creature)} still scale={3} />
              <Nameplate creature={creature} compact />
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

function Progress({ state }: { state: CreatureState }) {
  const { habits, entries, settings } = useOpenHabits();
  const today = useToday(settings.dayStartHour);
  const stat = today
    ? statFor(habits, entries, today, settings.weekStartsOn, firstDayOf(habits))
    : null;
  const rate =
    stat && stat.scheduled > 0 ? stat.completed / stat.scheduled : null;
  const worth = stat ? payout(stat.completed, stat.scheduled) : 0;
  const paid = state.lastDay?.day === today ? state.lastDay.expPaid : 0;
  const toward = state.goodDays % DISCOVERY_DAYS;
  const everyone = state.creatures.length === LINES.length;

  return (
    <p className="text-[13px] leading-relaxed text-muted">
      {rate === null ? (
        <>Nothing scheduled today. </>
      ) : (
        <>
          Today so far:{" "}
          <strong className="font-medium text-foreground">
            {Math.round(rate * 100)}%
          </strong>
          {paid > 0 && paid >= worth
            ? `, which earned the party +${paid} exp. `
            : worth > 0
              ? `, worth +${worth} exp to the party. `
              : ". Reach 60% to earn exp. "}
        </>
      )}
      {everyone ? (
        <>You have found every creature.</>
      ) : (
        <>
          {toward} of {DISCOVERY_DAYS} days at{" "}
          {Math.round(QUALIFYING_RATE * 100)}% toward the next creature.
        </>
      )}
    </p>
  );
}

function Dex({ owned }: { owned: CreatureState | null }) {
  const { settings } = useOpenHabits();
  const today = useToday(settings.dayStartHour);

  const reached = useMemo(() => {
    const forms = new Set<string>();
    for (const creature of owned?.creatures ?? []) {
      const line = lineOf(creature.line);
      if (!line) continue;
      const stage = stageAt(line, creatureLevel(creature.exp));
      for (const form of line.forms.slice(0, stage + 1)) forms.add(form.id);
    }
    return forms;
  }, [owned]);

  // Gated on the clock so `window` exists; the build drops this.
  const revealAll =
    today !== null &&
    process.env.NODE_ENV === "development" &&
    new URLSearchParams(window.location.search).has("all");
  // Cogling's line sits outside the lines, all at #000.
  const dex = [
    ...COGLINGS.map((creature) => ({
      creature,
      number: 0,
      known: revealAll || isFound(creature.id),
    })),
    ...CREATURES.map((creature, index) => ({
      creature,
      number: index + 1,
      known: revealAll || reached.has(creature.id),
    })),
  ];

  return (
    <div className="space-y-2">
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted">
          Dex
        </h2>
        <p className="font-mono text-[12px] tabular-nums text-muted">
          {dex.filter((entry) => entry.known).length}/{dex.length} seen
        </p>
      </div>
      <ul className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {dex.map(({ creature, number, known }) => (
          <li
            key={creature.id}
            className="surface-card flex flex-col items-center bg-surface px-3 py-4 text-center"
          >
            <p className="self-start font-mono text-[11px] tabular-nums text-muted">
              #{String(number).padStart(3, "0")}
            </p>
            <div className="flex items-end" style={{ height: STAGE }}>
              <Sprite creature={creature} silhouette={!known} scale={SCALE} />
            </div>
            <p className="mt-2 text-[13px] font-medium">
              {known ? creature.name : "???"}
            </p>
            {known && (
              <p className="mt-1 text-[11px] leading-snug text-muted">
                {creature.blurb}
              </p>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}

function CreatureSheet({
  state,
  line: id,
  onClose,
}: {
  state: CreatureState;
  line: string | null;
  onClose: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  // The last one opened stays drawn while the sheet animates out.
  const [shown, setShown] = useState(id);
  if (id !== null && id !== shown) setShown(id);
  const creature = state.creatures.find((c) => c.line === shown);
  const line = shown ? lineOf(shown) : undefined;

  const party = state.creatures
    .filter((c) => c.slot !== null)
    .sort((a, b) => a.slot! - b.slot!)
    .map((c) => c.line);

  async function seat(lines: string[]) {
    setBusy(true);
    const reason = await setParty(lines.slice(0, PARTY_SIZE));
    setBusy(false);
    setProblem(reason);
  }

  const close = () => {
    setProblem(null);
    onClose();
  };

  if (!creature || !line) return null;

  const form = formFor(line, creature.exp);
  const level = creatureLevel(creature.exp);
  const known = movesAt(line, level);
  const next = line.moves[known.length];
  const evolvesAt = line.evolvesAt.find((at) => at > level);
  const inParty = creature.slot !== null;

  return (
    <Sheet open={id !== null} onClose={close} title={form.name}>
      <div className="space-y-5">
        <div className="flex items-center gap-4">
          <Sprite creature={form} scale={5} />
          <div className="min-w-0 flex-1">
            <Nameplate creature={creature} />
            <p className="mt-2 text-[12px] leading-snug text-muted">
              {form.blurb}
            </p>
            {evolvesAt && (
              <p className="mt-1 text-[12px] text-muted">
                Changes at Lv {evolvesAt}.
              </p>
            )}
          </div>
        </div>

        <div>
          <h3 className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted">
            Moves
          </h3>
          <ul className="mt-2 space-y-2">
            {known.map((move) => (
              <li key={move.name}>
                <p className="text-[13px] font-medium">{move.name}</p>
                <p className="text-[12px] leading-snug text-muted">
                  {move.text}
                </p>
              </li>
            ))}
            {next && (
              <li className="text-[12px] text-muted">
                Learns {next.name} at Lv {next.level}.
              </li>
            )}
          </ul>
        </div>

        <div className="flex flex-wrap gap-2">
          {creature.slot !== 0 && (
            <button
              type="button"
              disabled={busy}
              onClick={() =>
                seat([
                  creature.line,
                  ...party.filter((l) => l !== creature.line),
                ])
              }
              className="h-10 rounded-control border border-accent bg-accent px-3 text-[13px] font-medium text-accent-fg transition-opacity disabled:opacity-50"
            >
              Make buddy
            </button>
          )}
          {inParty ? (
            <button
              type="button"
              disabled={busy || party.length === 1}
              onClick={() => seat(party.filter((l) => l !== creature.line))}
              className="h-10 rounded-control border border-border px-3 text-[13px] font-medium text-muted transition-colors hover:text-foreground disabled:opacity-50"
            >
              Rest
            </button>
          ) : (
            <button
              type="button"
              disabled={busy || party.length >= PARTY_SIZE}
              onClick={() => seat([...party, creature.line])}
              className="h-10 rounded-control border border-border px-3 text-[13px] font-medium text-muted transition-colors hover:text-foreground disabled:opacity-50"
            >
              {party.length >= PARTY_SIZE ? "Party is full" : "Add to party"}
            </button>
          )}
        </div>
        {problem && (
          <p role="alert" className="text-[12px] text-muted">
            {problem}
          </p>
        )}
      </div>
    </Sheet>
  );
}

function Skeleton() {
  return (
    <div className="space-y-4" aria-hidden="true">
      <div className="h-4 w-24 rounded bg-surface-2" />
      <div className="h-48 rounded-card bg-surface-2" />
    </div>
  );
}
