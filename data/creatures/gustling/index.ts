import type { Creature, Line } from "@/lib/types";
import { OUTLINE, SHINE } from "../pixels";

const forms: Creature[] = [
  {
    id: "gustling",
    name: "Gustling",
    blurb: "Rides the first breeze of the day and is home before dark.",
    colors: { o: OUTLINE, w: SHINE, b: "#e8eef2", l: "#f2c14e", g: "#a7c4d8" },
    sprite: [
      "............",
      "....oooo....",
      "...obbbbo...",
      "..obwobbbo..",
      "..obbbbbboll",
      ".oollbbbbo..",
      "olllllbbbo..",
      ".oollbbbbo..",
      "..obbbbbo...",
      "...oooooo...",
      "....o..o....",
      "............",
    ],
    rig: {
      parts: { wing: [0, 5, 5, 3] },
      fx: {
        gustA: [
          [0, 0, "g"],
          [1, 0, "g"],
          [2, 0, "g"],
        ],
        gustB: [
          [0, 11, "g"],
          [1, 11, "g"],
        ],
      },
    },
  },
  {
    id: "galecrest",
    name: "Galecrest",
    blurb:
      "Grew out of a Gustling. Stopped waiting for the breeze, and now makes its own.",
    colors: {
      o: OUTLINE,
      w: SHINE,
      b: "#e8eef2",
      l: "#f2c14e",
      k: "#d9a23a",
      g: "#a7c4d8",
    },
    sprite: [
      "..........l.....",
      ".o.........ll...",
      "olo.......oooo..",
      "olko.....obbbbo.",
      ".olklo...obwobo.",
      ".ollklo..obbbbll",
      "..ollllkobbbbbo.",
      "...ollllllbbbbo.",
      "....oooooobbbbo.",
      "...obbbbbbbbbbo.",
      "olllobbbbbbbbo..",
      ".olllobbbbbbo...",
      "..ooo.oooooo....",
      "........o..o....",
      ".......oo.oo....",
      "................",
    ],
    rig: {
      parts: { wing: [0, 1, 9, 8], crest: [10, 0, 3, 2] },
      fx: {
        gustA: [
          [0, 8, "g"],
          [1, 8, "g"],
          [2, 8, "g"],
        ],
        gustB: [
          [1, 14, "g"],
          [2, 14, "g"],
        ],
      },
    },
  },
];

const line: Line = {
  id: "gustling",
  forms,
  evolvesAt: [14],
  moves: [
    {
      level: 1,
      name: "First Breeze",
      text: "Catches the day's first wind before anyone is up.",
    },
    { level: 7, name: "Tailwind", text: "Pushes you the last few steps home." },
    {
      level: 15,
      name: "Updraft",
      text: "Rises on whatever the day throws at it.",
    },
    {
      level: 24,
      name: "Make Weather",
      text: "Stops waiting for a breeze and starts one.",
    },
    {
      level: 35,
      name: "Home Before Dark",
      text: "However far it goes, it is back by nightfall.",
    },
  ],
};

export default line;
