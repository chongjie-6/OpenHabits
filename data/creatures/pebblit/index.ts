import type { Creature, Line } from "@/lib/types";
import { bump, roll } from "../common";
import { OUTLINE, SHINE } from "../pixels";

const forms: Creature[] = [
  {
    id: "pebblit",
    name: "Pebblit",
    blurb: "Made of every small thing it ever did twice.",
    elements: ["earth"],
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
    elements: ["earth"],
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
    elements: ["earth"],
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
    {
      level: 1,
      name: "Do It Twice",
      power: 25,
      accuracy: 100,
      text: "Does everything twice, just to be sure.",
    },
    bump,
    {
      level: 8,
      name: "Skip Stone",
      power: 40,
      accuracy: 95,
      text: "Bounces across a bad day without sinking.",
    },
    roll,
    {
      level: 17,
      name: "Balance Act",
      power: 55,
      accuracy: 95,
      text: "Keeps a pebble on its head. Drops it. Tries again.",
    },
    {
      level: 26,
      name: "Stack Up",
      power: 70,
      accuracy: 90,
      text: "Adds one more stone. The pile has never fallen.",
    },
    {
      level: 36,
      name: "Cairn Keep",
      power: 85,
      accuracy: 85,
      text: "Holds every stone a traveller ever left on it.",
    },
  ],
};

export default line;
