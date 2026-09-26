import {
  ABILITIES,
  modifier,
  moveRoll,
  movesAt,
  signed,
  statBlock,
} from "@/lib/creatures";
import type { Line, Move } from "@/lib/types";

const GROUPS: [Move["use"], string][] = [
  ["trait", "Traits"],
  ["action", "Actions"],
  ["bonus", "Bonus Actions"],
  ["reaction", "Reactions"],
];

const USE_NAMES: Record<Move["use"], string> = {
  trait: "trait",
  action: "action",
  bonus: "bonus action",
  reaction: "reaction",
};

/**
 * A creature written up as a D&D stat block (§5.5): scores, skills, and the
 * moves it knows under the action economy's headings. Every number derives from
 * its exp; nothing here is rolled.
 */
export function StatBlock({ line, exp }: { line: Line; exp: number }) {
  const block = statBlock(line, exp);
  const known = movesAt(line, block.level);
  const next = line.moves[known.length];

  return (
    <div className="space-y-4">
      <div className="space-y-2 border-y border-border py-3">
        <p className="text-[12px] italic text-muted">
          {block.size} {line.kind}, {line.alignment}
        </p>
        <p className="font-mono text-[12px] tabular-nums">
          <Stat name="AC" value={block.armorClass} />
          <Stat name="HP" value={block.hitPoints} />
          <Stat name="Prof" value={signed(block.proficiency)} />
        </p>
        <dl className="grid grid-cols-6 gap-1 text-center">
          {ABILITIES.map((ability) => (
            <div key={ability}>
              <dt className="text-[10px] font-semibold uppercase tracking-[0.08em] text-muted">
                {ability}
              </dt>
              <dd className="font-mono text-[13px] tabular-nums">
                {block.scores[ability]}
                <span className="block text-[11px] text-muted">
                  {signed(modifier(block.scores[ability]))}
                </span>
              </dd>
            </div>
          ))}
        </dl>
        <p className="text-[12px] leading-snug">
          <span className="font-semibold">Skills</span>{" "}
          {block.skills
            .map(({ skill, bonus }) => `${skill} ${signed(bonus)}`)
            .join(", ")}
        </p>
      </div>

      {GROUPS.map(([use, title]) => {
        const moves = known.filter((move) => move.use === use);
        if (moves.length === 0) return null;
        return (
          <div key={use}>
            <h3 className="border-b border-border pb-1 text-[11px] font-semibold uppercase tracking-[0.08em] text-muted">
              {title}
            </h3>
            <ul className="mt-2 space-y-2">
              {moves.map((move) => {
                const roll = moveRoll(move, block);
                return (
                  <li key={move.name} className="text-[12px] leading-snug">
                    <p className="font-semibold italic">
                      {move.name}
                      {move.uses && (
                        <span className="font-normal not-italic text-muted">
                          {" "}
                          ({move.uses})
                        </span>
                      )}
                    </p>
                    {roll && (
                      <p className="font-mono text-[11px] tabular-nums">
                        {roll}
                      </p>
                    )}
                    <p className="text-muted">{move.text}</p>
                  </li>
                );
              })}
            </ul>
          </div>
        );
      })}

      {next && (
        <p className="text-[12px] text-muted">
          Learns {next.name} ({USE_NAMES[next.use]}) at Lv {next.level}.
        </p>
      )}
    </div>
  );
}

function Stat({ name, value }: { name: string; value: number | string }) {
  return (
    <span className="mr-4 inline-block">
      <span className="font-sans font-semibold">{name}</span> {value}
    </span>
  );
}
