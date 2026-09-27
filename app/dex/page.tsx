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
  expToEvolve,
  formFor,
  foundByDays,
  goodDaysToFind,
  isFound,
  lineOf,
  LINES,
  LOWEST_PAYING_RATE,
  matchups,
  movesAt,
  PARTY_SIZE,
  payout,
  QUALIFYING_RATE,
  stageAt,
  STARTERS,
  STRONG_AGAINST,
  swapSeats,
  type CreatureState,
} from "@/lib/creatures";
import { firstDayOf, statFor } from "@/lib/history";
import { chooseStarter, setParty, useCreatures } from "@/lib/party";
import { useSignedIn } from "@/lib/session";
import { useOpenHabits } from "@/lib/store";
import type { CreatureElement } from "@/lib/types";
import { useToday } from "@/lib/use-today";

// Decorative: the name beside each dot carries the meaning, so these need no contrast.
const ELEMENT_COLORS: Record<CreatureElement, string> = {
  grass: "#5fb85a",
  fire: "#f08a4b",
  water: "#3d8fd1",
  wind: "#a7c4d8",
  earth: "#b08a5a",
  ice: "#8fdcef",
  light: "#f2c14e",
  dark: "#54466b",
  metal: "#9aa0ae",
  might: "#d8453a",
  spirit: "#a883d4",
};

const SCALE = 6;
const STAGE =
  Math.max(...[...COGLINGS, ...CREATURES].map((c) => c.sprite.length)) * SCALE;

export default function DexPage() {
  const { hydrated } = useOpenHabits();
  const signedIn = useSignedIn();
  const owned = useCreatures();
  const [open, setOpen] = useState<string | null>(null);
  const [filling, setFilling] = useState(false);
  const [charting, setCharting] = useState(false);

  if (!hydrated) return <Skeleton />;

  return (
    <section className="space-y-6">
      <div className="flex items-center justify-between gap-3">
        <h1 className="display-type text-[15px]">Creatures</h1>
        <button
          type="button"
          onClick={() => setCharting(true)}
          className="display-type h-8 rounded-control border border-border px-3 text-[12px] text-muted transition-colors hover:text-foreground"
        >
          Element chart
        </button>
      </div>
      <ChartSheet open={charting} onClose={() => setCharting(false)} />

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
          <Party
            state={owned}
            onOpen={setOpen}
            onFill={() => setFilling(true)}
          />
          <Progress state={owned} />
          <Box state={owned} onOpen={setOpen} />
        </>
      )}

      <Dex owned={signedIn ? owned : null} />

      {owned && (
        <>
          <CreatureSheet
            state={owned}
            line={open}
            onClose={() => setOpen(null)}
          />
          <SeatSheet
            state={owned}
            open={filling}
            onClose={() => setFilling(false)}
          />
        </>
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
                <Elements elements={base.elements} className="mt-1" />
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
  onFill,
}: {
  state: CreatureState;
  onOpen: (line: string) => void;
  onFill: () => void;
}) {
  // Seated in order, so the gaps are always at the end.
  const party = partyOf(state).map(
    (line) => state.creatures.find((c) => c.line === line)!,
  );
  const [buddy, ...rest] = Array.from(
    { length: PARTY_SIZE },
    (_, i) => party[i] ?? null,
  );
  const resting = state.creatures.some((c) => c.slot === null);

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
                className="surface-card flex h-full w-full flex-col items-center justify-end bg-surface p-3 text-center"
              >
                <Sprite creature={formOf(creature)} still scale={3} />
                <Nameplate creature={creature} compact />
              </button>
            ) : resting ? (
              <button
                type="button"
                onClick={onFill}
                className="flex h-full min-h-24 w-full items-center justify-center rounded-card border border-dashed border-border text-[12px] text-muted transition-colors hover:text-foreground"
              >
                + Add
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
              className="surface-card flex h-full w-full flex-col items-center justify-end bg-surface p-2 text-center"
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
  const find = foundByDays(state.creatures);
  const since = goodDaysToFind(find - 1);
  const needed = goodDaysToFind(find) - since;
  // Clamped: finds earned before the starter arrive only on the next claim.
  const toward = Math.min(needed, Math.max(0, state.goodDays - since));
  const everyone = find === LINES.length;

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
            ? `, which earned each creature in the party +${paid} exp. `
            : worth > 0
              ? `, worth +${worth} exp to each creature in the party. `
              : `. Reach ${Math.round(LOWEST_PAYING_RATE * 100)}% to earn exp. `}
        </>
      )}
      {everyone ? (
        <>You have found every creature.</>
      ) : (
        <>
          {toward} of {needed} {needed === 1 ? "day" : "days"} at{" "}
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
      known: revealAll || isFound(creature.id) || reached.has(creature.id),
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
              <>
                <Elements elements={creature.elements} className="mt-1" />
                <p className="mt-1 text-[11px] leading-snug text-muted">
                  {creature.blurb}
                </p>
              </>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}

function ChartSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const elements = Object.keys(STRONG_AGAINST) as CreatureElement[];
  const [picked, setPicked] = useState<CreatureElement>("fire");

  return (
    <Sheet open={open} onClose={onClose} title="Element chart">
      <p className="text-[12px] text-muted">
        Each element is strong against two and weak to two.
      </p>
      <ElementWheel picked={picked} onPick={setPicked} />
      <table className="mt-3 w-full border-separate border-spacing-y-1 text-left text-[12px]">
        <thead className="text-[11px] text-muted">
          <tr>
            <th scope="col" className="w-px pb-1 pl-2 pr-2 font-medium">
              Element
            </th>
            <th scope="col" colSpan={2} className="pb-1 pl-3 pr-2 font-medium">
              Strong against
            </th>
            <th scope="col" colSpan={2} className="pb-1 pl-3 font-medium">
              Weak to
            </th>
          </tr>
        </thead>
        <tbody>
          {elements.map((element) => {
            const { strong, weak } = matchups([element]);
            const quiet = element !== picked;
            return (
              <tr
                key={element}
                onClick={() => setPicked(element)}
                className={`cursor-pointer *:border-y *:border-border *:transition-colors *:first:rounded-l-control *:first:border-l *:first:pl-2 *:last:rounded-r-control *:last:border-r ${
                  quiet ? "hover:*:bg-surface-2" : "*:bg-surface-2"
                }`}
              >
                <th scope="row" className="py-2 pr-2 font-normal">
                  {/* The row takes the click; this is its keyboard and screen-reader handle. */}
                  <button
                    type="button"
                    aria-pressed={!quiet}
                    className="rounded-full"
                  >
                    <Elements elements={[element]} quiet={quiet} />
                  </button>
                </th>
                {/* The first of each pair hugs its chip, so the spare width falls between the two groups. */}
                {[...strong, ...weak].map((other, i) => (
                  <td
                    key={i}
                    className={`py-2 pr-2 ${i % 2 === 0 ? "w-px border-l pl-3" : ""}`}
                  >
                    <Elements elements={[other]} quiet={quiet} />
                  </td>
                ))}
              </tr>
            );
          })}
        </tbody>
      </table>
    </Sheet>
  );
}

// Searched for: no matchup joins two neighbours, whose arrows would be too short to read.
const WHEEL: CreatureElement[] = [
  "fire",
  "wind",
  "spirit",
  "grass",
  "dark",
  "metal",
  "earth",
  "light",
  "ice",
  "water",
  "might",
];

/** In the wheel's 0–100 box. */
function wheelPoint(element: CreatureElement) {
  const angle =
    -Math.PI / 2 + (WHEEL.indexOf(element) * 2 * Math.PI) / WHEEL.length;
  return { x: 50 + 38 * Math.cos(angle), y: 50 + 38 * Math.sin(angle) };
}

/** A chord from one label to another, as points, ending in an arrowhead. */
function arrow(from: CreatureElement, to: CreatureElement) {
  const a = wheelPoint(from);
  const b = wheelPoint(to);
  // Bowed to the right of travel, so a mutual pair draws two curves, not one line.
  const c = {
    x: (a.x + b.x) / 2 - (b.y - a.y) * 0.15,
    y: (a.y + b.y) / 2 + (b.x - a.x) * 0.15,
  };
  const at = (t: number) => ({
    x: (1 - t) ** 2 * a.x + 2 * (1 - t) * t * c.x + t ** 2 * b.x,
    y: (1 - t) ** 2 * a.y + 2 * (1 - t) * t * c.y + t ** 2 * b.y,
  });
  // Roughly a label's box, so a line starts and stops at its edge.
  const clear = (p: { x: number; y: number }, n: { x: number; y: number }) =>
    ((p.x - n.x) / 10) ** 2 + ((p.y - n.y) / 4.5) ** 2 >= 1;
  const points = Array.from({ length: 41 }, (_, i) => at(i / 40)).filter(
    (p) => clear(p, a) && clear(p, b),
  );
  const tip = points[points.length - 1];
  const prev = points[points.length - 2];
  const len = Math.hypot(tip.x - prev.x, tip.y - prev.y);
  const [dx, dy] = [(tip.x - prev.x) / len, (tip.y - prev.y) / len];
  const head = [
    tip,
    { x: tip.x - dx * 2.4 - dy * 1.2, y: tip.y - dy * 2.4 + dx * 1.2 },
    { x: tip.x - dx * 2.4 + dy * 1.2, y: tip.y - dy * 2.4 - dx * 1.2 },
  ];
  const svg = (ps: { x: number; y: number }[]) =>
    ps.map((p) => `${p.x.toFixed(2)},${p.y.toFixed(2)}`).join(" ");
  return { line: svg(points), head: svg(head) };
}

const title = (element: CreatureElement) =>
  element[0].toUpperCase() + element.slice(1);

function ElementWheel({
  picked,
  onPick,
}: {
  picked: CreatureElement;
  onPick: (element: CreatureElement) => void;
}) {
  const { strong, weak } = matchups([picked]);
  const edges = [
    ...strong.map((to) => ({ from: picked, to, role: "strong" })),
    ...weak.map((from) => ({ from, to: picked, role: "weak" })),
  ];

  return (
    <figure className="mt-3">
      <div className="relative mx-auto aspect-square w-full max-w-[320px]">
        <svg
          viewBox="0 0 100 100"
          aria-hidden="true"
          className="absolute inset-0 size-full"
        >
          {edges.map(({ from, to, role }) => {
            const { line, head } = arrow(from, to);
            const weakTo = role === "weak";
            return (
              <g
                key={`${from}-${to}`}
                className={
                  weakTo
                    ? "stroke-muted fill-muted"
                    : "stroke-foreground fill-foreground"
                }
              >
                <polyline
                  points={line}
                  fill="none"
                  strokeWidth={0.6}
                  strokeDasharray={weakTo ? "1.6 1.2" : undefined}
                  strokeLinecap="round"
                />
                <polygon points={head} stroke="none" />
              </g>
            );
          })}
        </svg>
        {WHEEL.map((element) => {
          const { x, y } = wheelPoint(element);
          const selected = element === picked;
          const related = strong.includes(element) || weak.includes(element);
          return (
            <button
              key={element}
              type="button"
              aria-pressed={selected}
              onClick={() => onPick(element)}
              style={{ left: `${x}%`, top: `${y}%` }}
              className={`absolute inline-flex -translate-x-1/2 -translate-y-1/2 items-center gap-1 rounded-full border bg-surface px-2 py-1 text-[11px] leading-none transition-colors ${
                selected
                  ? "border-foreground font-medium text-foreground"
                  : related
                    ? "border-border text-foreground"
                    : "border-transparent text-muted"
              }`}
            >
              <span
                aria-hidden="true"
                className="size-1.5 rounded-full"
                style={{
                  background:
                    selected || related
                      ? ELEMENT_COLORS[element]
                      : "var(--muted)",
                }}
              />
              {title(element)}
            </button>
          );
        })}
      </div>
      <figcaption
        aria-live="polite"
        className="mt-2 text-center text-[12px] leading-snug text-muted"
      >
        {title(picked)} is strong against {strong.map(title).join(" and ")}, and
        weak to {weak.map(title).join(" and ")}.
      </figcaption>
      <div
        aria-hidden="true"
        className="mt-2 flex justify-center gap-4 text-[11px] text-muted"
      >
        <span className="inline-flex items-center gap-1.5">
          <svg width="20" height="6" className="stroke-foreground">
            <line x1="0" y1="3" x2="20" y2="3" strokeWidth="1.5" />
          </svg>
          Strong against
        </span>
        <span className="inline-flex items-center gap-1.5">
          <svg width="20" height="6" className="stroke-muted">
            <line
              x1="0"
              y1="3"
              x2="20"
              y2="3"
              strokeWidth="1.5"
              strokeDasharray="4 3"
            />
          </svg>
          Weak to
        </span>
      </div>
    </figure>
  );
}

/**
 * Spans, not a list, so it can sit inside a button. `quiet` recedes by losing its
 * border and colour, never by opacity: `--muted` text has no contrast to spare.
 */
function Elements({
  elements,
  quiet = false,
  className = "",
}: {
  elements: CreatureElement[];
  quiet?: boolean;
  className?: string;
}) {
  return (
    <span className={`flex flex-wrap gap-1 ${className}`}>
      {elements.map((element) => (
        <span
          key={element}
          className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] capitalize leading-none text-muted ${
            quiet ? "border-transparent" : "border-border"
          }`}
        >
          <span
            aria-hidden="true"
            className="size-1.5 rounded-full"
            style={{
              background: quiet ? "var(--muted)" : ELEMENT_COLORS[element],
            }}
          />
          {element}
        </span>
      ))}
    </span>
  );
}

/** Party lines in seat order, buddy first. */
function partyOf(state: CreatureState): string[] {
  return state.creatures
    .filter((c) => c.slot !== null)
    .sort((a, b) => a.slot! - b.slot!)
    .map((c) => c.line);
}

/** Seats a new party, keeping the reason when the server refuses. */
function useSeat() {
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  async function seat(lines: string[]): Promise<boolean> {
    setBusy(true);
    const reason = await setParty(lines);
    setBusy(false);
    setProblem(reason);
    return reason === null;
  }

  return { busy, problem, seat, clear: () => setProblem(null) };
}

const PRIMARY =
  "h-10 rounded-control border border-accent bg-accent px-3 text-[13px] font-medium text-accent-fg transition-opacity disabled:opacity-50";
const SECONDARY =
  "h-10 rounded-control border border-border px-3 text-[13px] font-medium text-muted transition-colors hover:text-foreground disabled:opacity-50";

function CreatureSheet({
  state,
  line: id,
  onClose,
}: {
  state: CreatureState;
  line: string | null;
  onClose: () => void;
}) {
  const { busy, problem, seat, clear } = useSeat();
  const [picking, setPicking] = useState(false);
  // The last one opened stays drawn while the sheet animates out.
  const [shown, setShown] = useState(id);
  if (id !== null && id !== shown) {
    setShown(id);
    setPicking(false);
  }
  const creature = state.creatures.find((c) => c.line === shown);
  const line = shown ? lineOf(shown) : undefined;

  const party = partyOf(state);
  const boxed = state.creatures.filter((c) => c.slot === null);

  const close = () => {
    clear();
    setPicking(false);
    onClose();
  };

  if (!creature || !line) return null;

  const me = creature.line;
  const form = formFor(line, creature.exp);
  const level = creatureLevel(creature.exp);
  const known = movesAt(line, level);
  const evolvesAt = line.evolvesAt.find((at) => at > level);
  const toEvolve = expToEvolve(line, creature.exp);
  const inParty = creature.slot !== null;
  const full = party.length >= PARTY_SIZE;
  // Who a swap trades with: from the party, anyone resting; from the box, the party.
  const candidates = inParty
    ? boxed
    : state.creatures
        .filter((c) => c.slot !== null)
        .sort((a, b) => a.slot! - b.slot!);

  async function swapWith(other: string) {
    const lines = inParty
      ? swapSeats(party, other, me)
      : swapSeats(party, me, other);
    if (await seat(lines)) setPicking(false);
  }

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
            {evolvesAt && toEvolve !== null && (
              <p className="mt-1 text-[12px] text-muted">
                Changes at Lv {evolvesAt}, {toEvolve} exp from now.
              </p>
            )}
          </div>
        </div>

        <div>
          <h3 className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted">
            Elements
          </h3>
          <Elements elements={form.elements} className="mt-2" />
        </div>

        <div>
          <h3 className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted">
            Moves
          </h3>
          <ul className="mt-2 space-y-2">
            {known.map((move) => (
              <li key={move.name} className="flex items-center gap-3">
                <div className="min-w-0 flex-1">
                  <p className="text-[13px] font-medium">{move.name}</p>
                  <p className="text-[12px] leading-snug text-muted">
                    {move.text}
                  </p>
                </div>
                <p className="shrink-0 text-right text-[12px] leading-snug text-muted">
                  Power {move.power}
                  <br />
                  Accuracy {move.accuracy}%
                </p>
              </li>
            ))}
          </ul>
        </div>

        <div className="space-y-3">
          {creature.slot === 0 && (
            <p className="text-[12px] text-muted">
              Your buddy. It earns exp with the party.
            </p>
          )}

          <div className="flex flex-wrap gap-2">
            {inParty && creature.slot !== 0 && (
              <button
                type="button"
                disabled={busy}
                onClick={() => seat(swapSeats(party, me, party[0]))}
                className={PRIMARY}
              >
                Make buddy
              </button>
            )}
            {!inParty && !full && (
              <>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => seat([...party, me])}
                  className={PRIMARY}
                >
                  Add to party
                </button>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => seat([me, ...party])}
                  className={SECONDARY}
                >
                  Make buddy
                </button>
              </>
            )}
            {candidates.length > 0 && (inParty || full) && (
              <button
                type="button"
                disabled={busy}
                aria-expanded={picking}
                onClick={() => setPicking(!picking)}
                className={inParty ? SECONDARY : PRIMARY}
              >
                {inParty ? "Swap out" : "Swap in"}
              </button>
            )}
            {inParty && (
              <button
                type="button"
                disabled={busy || party.length === 1}
                onClick={() => seat(party.filter((l) => l !== me))}
                className={SECONDARY}
              >
                Rest
              </button>
            )}
          </div>

          {picking && (
            <div className="space-y-2">
              <p className="text-[12px] text-muted">
                {inParty
                  ? `Who takes ${form.name}'s seat?`
                  : `Who does ${form.name} replace? They go to rest.`}
              </p>
              <ul className="grid grid-cols-3 gap-2">
                {candidates.map((other) => (
                  <li key={other.line}>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => swapWith(other.line)}
                      className="surface-card flex h-full w-full flex-col items-center justify-end bg-surface p-2 text-center disabled:opacity-50"
                    >
                      <Sprite creature={formOf(other)} still scale={3} />
                      <Nameplate creature={other} compact />
                      {other.slot === 0 && (
                        <span className="text-[10px] text-muted">Buddy</span>
                      )}
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {problem && (
            <p role="alert" className="text-[12px] text-muted">
              {problem}
            </p>
          )}
        </div>
      </div>
    </Sheet>
  );
}

/** Tapping an empty seat: anyone resting can take it. */
function SeatSheet({
  state,
  open,
  onClose,
}: {
  state: CreatureState;
  open: boolean;
  onClose: () => void;
}) {
  const { busy, problem, seat, clear } = useSeat();
  const boxed = state.creatures.filter((c) => c.slot === null);

  const close = () => {
    clear();
    onClose();
  };

  return (
    <Sheet open={open} onClose={close} title="Fill a seat">
      <div className="space-y-3">
        <p className="text-[12px] text-muted">
          Only the party earns exp. Who comes along?
        </p>
        <ul className="grid grid-cols-3 gap-2">
          {boxed.map((creature) => (
            <li key={creature.line}>
              <button
                type="button"
                disabled={busy}
                onClick={async () => {
                  if (await seat([...partyOf(state), creature.line])) close();
                }}
                className="surface-card flex h-full w-full flex-col items-center justify-end bg-surface p-2 text-center disabled:opacity-50"
              >
                <Sprite creature={formOf(creature)} still scale={3} />
                <Nameplate creature={creature} compact />
              </button>
            </li>
          ))}
        </ul>
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
