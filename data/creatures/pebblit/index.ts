import type { Creature, Line } from "@/lib/types";
import { earth } from "../elements";
import {
  balanceAct,
  bump,
  cairnKeep,
  doItTwice,
  roll,
  skipStone,
  stackUp,
} from "../moves";
import { OUTLINE, SHINE } from "../pixels";

const forms: Creature[] = [
  {
    id: "pebblit",
    name: "Pebblit",
    blurb: "Made of every small thing it ever did twice.",
    elements: [earth],
    colors: { o: OUTLINE, w: SHINE, b: "#9a9aa6", l: "#c8c8d2" },
    sprite: [
      "............",
      "............",
      "...oooooo...",
      "..obblbbbo..",
      ".obbbbbbbbo.",
      ".obwobbwobo.",
      "oobbbbbbbboo",
      "obobbbbbbobo",
      "oo.obbbbo.oo",
      "...obbbbo...",
      "...oo..oo...",
      "............",
    ],
    rig: {
      parts: { armL: [0, 6, 2, 3], armR: [10, 6, 2, 3] },
      fx: {
        dust: [
          [2, 10, "b"],
          [9, 10, "b"],
        ],
      },
    },
  },
  {
    id: "cobblet",
    name: "Cobblet",
    blurb:
      "Balances a pebble on its head. When it drops it, it picks it up and tries again.",
    elements: [earth],
    colors: { o: OUTLINE, w: SHINE, b: "#9a9aa6", l: "#c8c8d2", m: "#8fae6a" },
    sprite: [
      "......oo......",
      ".....olbo.....",
      "......oo......",
      "...oooooooo...",
      "..obblbbbmbo..",
      ".obblbbbbmmbo.",
      ".obwobbbbwobo.",
      "oobbbbbbbbbboo",
      "obobbboobbbobo",
      "obobbbbbbbbobo",
      "oo.obbbbbbo.oo",
      "...obbbbbbo...",
      "...ooo..ooo...",
      "..............",
    ],
    rig: {
      parts: {
        stone: [5, 0, 4, 3],
        armL: [0, 7, 2, 4],
        armR: [12, 7, 2, 4],
      },
    },
  },
  {
    id: "cairnhold",
    name: "Cairnhold",
    blurb:
      "Every stone is a week that held. Travellers add one on top, and it has never let one fall.",
    elements: [earth],
    colors: { o: OUTLINE, w: SHINE, b: "#9a9aa6", l: "#c8c8d2", m: "#8fae6a" },
    sprite: [
      "................",
      "....oooooooo....",
      "...obblbbbbbo...",
      "...obwobbwobo...",
      "...obbboobbbo...",
      "....oooooooo....",
      "..oooooooooooo..",
      "ooommbblbbbmmooo",
      "obombbbbbbbbmobo",
      "obobbbllbbbbbobo",
      "obobbbbbbbbbbobo",
      "ooobbbbbbbbbbooo",
      "..oooooooooooo..",
      "...obbo..obbo...",
      "...obbo..obbo...",
      "...oooo..oooo...",
    ],
    rig: {
      parts: { head: [3, 1, 10, 4] },
      fx: {
        stone: [
          [7, 0, "l"],
          [8, 0, "l"],
        ],
      },
    },
  },
];

const line: Line = {
  id: "pebblit",
  forms,
  evolvesAt: [16, 34],
  moves: [
    [1, doItTwice],
    [1, bump],
    [8, skipStone],
    [10, roll],
    [17, balanceAct],
    [26, stackUp],
    [36, cairnKeep],
  ],
};

export default line;
