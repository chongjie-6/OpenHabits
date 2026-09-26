import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it, vi } from "vitest";
import {
  claimNews,
  COGLINGS,
  creatureLevel,
  CREATURES,
  expForLevel,
  findCogling,
  isFound,
  LINES,
  MAX_LEVEL,
  movesAt,
  noticeEvolutions,
  payout,
  stageAt,
  STARTERS,
} from "@/lib/creatures";

const DEX = [...COGLINGS, ...CREATURES];

describe("creatureLevel", () => {
  it("starts at level 1 with no exp", () => {
    expect(creatureLevel(0)).toBe(1);
  });

  it("reaches each level at exactly its threshold, not a point before", () => {
    for (const level of [2, 12, 28, MAX_LEVEL]) {
      expect(creatureLevel(expForLevel(level))).toBe(level);
      expect(creatureLevel(expForLevel(level) - 1)).toBe(level - 1);
    }
  });

  it("stops at the cap", () => {
    expect(creatureLevel(expForLevel(MAX_LEVEL) * 4)).toBe(MAX_LEVEL);
  });
});

describe("payout", () => {
  it("pays nothing below 60% or on a day with nothing scheduled", () => {
    expect(payout(59, 100)).toBe(0);
    expect(payout(0, 0)).toBe(0);
  });

  it("pays each tier from its threshold", () => {
    expect(payout(60, 100)).toBe(20);
    expect(payout(79, 100)).toBe(20);
    expect(payout(80, 100)).toBe(35);
    expect(payout(99, 100)).toBe(35);
    expect(payout(3, 3)).toBe(50);
  });

  it("does not pay extra for overachieving", () => {
    expect(payout(4, 3)).toBe(50);
  });
});

describe("stageAt and movesAt", () => {
  const sproutle = LINES.find((line) => line.id === "sproutle")!;
  const [first, second] = sproutle.evolvesAt;

  it("evolves at each of the line's levels", () => {
    expect(stageAt(sproutle, first - 1)).toBe(0);
    expect(stageAt(sproutle, first)).toBe(1);
    expect(stageAt(sproutle, second)).toBe(2);
    expect(stageAt(sproutle, MAX_LEVEL)).toBe(sproutle.forms.length - 1);
  });

  it("knows a move from its level on", () => {
    const [opener, next] = sproutle.moves;
    expect(movesAt(sproutle, 1)).toEqual([opener]);
    expect(movesAt(sproutle, next.level - 1)).toEqual([opener]);
    expect(movesAt(sproutle, next.level)).toEqual([opener, next]);
  });
});

describe("the lines", () => {
  it("are named by their base form", () => {
    expect(LINES.map((line) => line.forms[0].id)).toEqual(
      LINES.map((line) => line.id),
    );
  });

  // Dex numbers are the flattened order, so splitting the lines must not move one.
  it("keep every dex number where it was", () => {
    const ids = CREATURES.map((c) => c.id);
    expect(ids).toHaveLength(47);
    expect(ids.slice(0, 4)).toEqual([
      "sproutle",
      "bloomkin",
      "bountree",
      "emberpup",
    ]);
    expect(ids.slice(-4)).toEqual([
      "burblet",
      "burblivion",
      "pelter",
      "pelterra",
    ]);
  });

  it("start with the three starters", () => {
    expect(STARTERS).toEqual(LINES.slice(0, 3).map((line) => line.id));
  });

  it("evolve once per later form, at rising levels under the cap", () => {
    for (const { id, forms, evolvesAt } of LINES) {
      expect(evolvesAt.length, id).toBe(forms.length - 1);
      evolvesAt.forEach((level, i) => {
        expect(level, id).toBeGreaterThan(i === 0 ? 1 : evolvesAt[i - 1]);
        expect(level, id).toBeLessThanOrEqual(MAX_LEVEL);
      });
    }
  });

  it("learn a first move at level 1 and the rest at rising levels", () => {
    for (const { id, moves } of LINES) {
      expect(moves[0]?.level, id).toBe(1);
      moves.slice(1).forEach((move, i) => {
        expect(move.level, `${id} ${move.name}`).toBeGreaterThan(
          moves[i].level,
        );
        expect(move.level, `${id} ${move.name}`).toBeLessThanOrEqual(MAX_LEVEL);
      });
    }
  });

  it("never share a move name", () => {
    const names = LINES.flatMap((line) => line.moves.map((m) => m.name));
    expect(new Set(names).size).toBe(names.length);
  });
});

describe("noticeEvolutions", () => {
  const sproutle = LINES[0];
  const at = (level: number) => ({
    line: "sproutle",
    exp: expForLevel(level),
    slot: 0,
  });

  it("records a creature it has never seen without evolving it", () => {
    const { seen, evolutions } = noticeEvolutions({}, [at(30)]);
    expect(seen).toEqual({ sproutle: 2 });
    expect(evolutions).toEqual([]);
  });

  it("evolves a creature seen at an earlier stage, once", () => {
    const first = noticeEvolutions({ sproutle: 0 }, [
      at(sproutle.evolvesAt[0]),
    ]);
    expect(first.evolutions).toEqual([{ line: "sproutle", from: 0, to: 1 }]);
    expect(
      noticeEvolutions(first.seen, [at(sproutle.evolvesAt[0])]).evolutions,
    ).toEqual([]);
  });
});

describe("claimNews", () => {
  const state = (exp: number, extra: string[] = []) => ({
    creatures: [
      { line: "sproutle", exp, slot: 0 },
      ...extra.map((line) => ({ line, exp: 0, slot: 1 })),
    ],
    goodDays: 0,
    lastDay: null,
  });

  it("says what the party earned, and nothing when it earned nothing", () => {
    const before = state(0);
    expect(claimNews(before, { ...state(20), gained: 20, found: [] })).toEqual([
      "+20 exp",
      "Sproutle reached Lv 2",
    ]);
    expect(claimNews(before, { ...before, gained: 0, found: [] })).toEqual([]);
  });

  it("names a move learned and a creature found", () => {
    const leafCount = LINES[0].moves[1];
    const before = state(expForLevel(leafCount.level) - 1);
    const after = {
      ...state(expForLevel(leafCount.level), ["emberpup"]),
      gained: 1,
      found: ["emberpup"],
    };
    expect(claimNews(before, after)).toEqual([
      "+1 exp",
      `Sproutle reached Lv ${leafCount.level}`,
      `Sproutle learned ${leafCount.name}`,
      "You found Emberpup!",
    ]);
  });
});

describe("findCogling", () => {
  it("finds Cogling in any skin, and each form only in its own", () => {
    const stored = new Map<string, string>();
    vi.stubGlobal("localStorage", {
      getItem: (key: string) => stored.get(key) ?? null,
      setItem: (key: string, value: string) => stored.set(key, value),
    });
    const found = () => COGLINGS.filter((c) => isFound(c.id)).map((c) => c.id);

    findCogling("classic");
    expect(found()).toEqual(["cogling"]);
    findCogling("grid");
    expect(found()).toEqual(["cogling", "latticog"]);
    findCogling("blocks");
    expect(found()).toEqual(["cogling", "blockog", "latticog"]);
    vi.unstubAllGlobals();
  });
});

describe("the dex", () => {
  it("has unique ids", () => {
    const ids = DEX.map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("draws every sprite as a square using only its own colours", () => {
    for (const { id, sprite, colors } of DEX) {
      for (const row of sprite) {
        expect(row.length, id).toBe(sprite.length);
        for (const pixel of row) {
          if (pixel !== ".")
            expect(colors[pixel], `${id} ${pixel}`).toBeTruthy();
        }
      }
    }
  });
});

describe("creature rigs", () => {
  it("lift disjoint, non-empty boxes and paint effects in known colours", () => {
    for (const { id, sprite, colors, rig } of DEX) {
      const claimed = new Set<string>();
      for (const [name, [x, y, w, h]] of Object.entries(rig?.parts ?? {})) {
        let drawn = 0;
        for (let row = y; row < y + h; row++) {
          for (let col = x; col < x + w; col++) {
            const pixel = sprite[row]?.[col];
            expect(pixel, `${id}.${name} leaves the grid`).toBeDefined();
            expect(claimed.has(`${col},${row}`), `${id}.${name}`).toBe(false);
            claimed.add(`${col},${row}`);
            if (pixel !== ".") drawn++;
          }
        }
        expect(drawn, `${id}.${name} is empty`).toBeGreaterThan(0);
      }
      for (const [name, pixels] of Object.entries(rig?.fx ?? {})) {
        for (const [, , key] of pixels) {
          expect(colors[key], `${id}.${name}`).toBeDefined();
        }
      }
    }
  });
});

// CSS names parts, effects and colours by string, so a typo there animates
// nothing and throws nothing. Reading the stylesheets back is the only check.
describe("idle loops", () => {
  const root = fileURLToPath(new URL("../", import.meta.url));
  const dir = join(root, "data/creatures");
  const lines = readdirSync(dir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map(({ name }) => {
      const idle = join(dir, name, "idle.css");
      const styled = existsSync(idle);
      return {
        name,
        ids: [
          ...readFileSync(join(dir, name, "index.ts"), "utf8").matchAll(
            /id: "([\w-]+)"/g,
          ),
        ].map((m) => m[1]),
        styled,
        css: styled
          ? readFileSync(idle, "utf8").replace(/\/\*[\s\S]*?\*\//g, "")
          : "",
      };
    });
  const rig = readFileSync(join(root, "app/dex/rig.css"), "utf8");
  const keyframes = (css: string) =>
    [...css.matchAll(/@keyframes ([\w-]+)/g)].map((m) => m[1]);

  it("belong to lines the corpus lists", () => {
    const listed = new Set(DEX.map((c) => c.id));
    for (const { name, ids } of lines) {
      for (const id of ids) {
        expect(listed.has(id), `${name}/${id} is not in the dex`).toBe(true);
      }
    }
  });

  it("are all imported by the dex", () => {
    const entry = readFileSync(join(root, "app/dex/idle.ts"), "utf8");
    for (const { name, styled } of lines) {
      if (!styled) continue;
      expect(entry).toContain(`import "@/data/creatures/${name}/idle.css";`);
    }
  });

  it("only name parts, effects and colours their own creature has", () => {
    const rigs = { part: "parts", fx: "fx" } as const;
    for (const { name, ids, css } of lines) {
      const selectors = [...css.matchAll(/([^{}]+)\{/g)]
        .flatMap((m) => m[1].split(","))
        .filter((s) => s.includes("[data-creature"));
      const animated = new Set<string>();
      for (const selector of selectors) {
        const id = selector.match(/\[data-creature="([\w-]+)"\]/)?.[1];
        expect(ids, `${name}: ${selector.trim()}`).toContain(id);
        const creature = DEX.find((c) => c.id === id);
        expect(creature, `${id} is not in the dex`).toBeDefined();
        animated.add(id!);
        for (const [, attr, prefix, value] of selector.matchAll(
          /\[data-(part|fx|px)(\^?)="(\w+)"\]/g,
        )) {
          const names = Object.keys(
            attr === "px"
              ? creature!.colors
              : (creature!.rig?.[rigs[attr as keyof typeof rigs]] ?? {}),
          );
          const found = prefix
            ? names.some((n) => n.startsWith(value))
            : names.includes(value);
          expect(found, `${id}: data-${attr}${prefix}="${value}"`).toBe(true);
        }
      }
      for (const id of ids) {
        if (DEX.find((c) => c.id === id)?.rig)
          expect(animated.has(id), `${id} has a rig but no loop`).toBe(true);
      }
    }
  });

  it("own their keyframes, and only play keyframes that exist", () => {
    const all = [rig, ...lines.map((l) => l.css)].flatMap(keyframes);
    expect(all.length).toBe(new Set(all).size);
    for (const { name, ids, css } of lines) {
      for (const frames of keyframes(css)) {
        expect(
          ids.some((id) => frames.startsWith(`idle-${id}-`)),
          `${name}: @keyframes ${frames}`,
        ).toBe(true);
      }
      for (const [, played] of css.matchAll(/animation:\s*([\w-]+)/g)) {
        expect(all, `${name}: animation ${played}`).toContain(played);
      }
    }
  });
});
