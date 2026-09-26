import type { Creature, Line, Pixel } from "@/lib/types";
import { OUTLINE, SHINE } from "../pixels";

const forms: Creature[] = [
  {
    id: "frostnib",
    name: "Frostnib",
    blurb: "Takes a cold swim every day, and says it feels great afterwards.",
    colors: { o: OUTLINE, w: SHINE, b: "#3d5a80", l: "#eef4fa", d: "#7fc8f8" },
    sprite: [
      "....oooo....",
      "...obbbbo...",
      "..obwobwobo.",
      "..obbllbbo..",
      ".obbllllbbo.",
      "obbllllllbbo",
      "obbllllllbbo",
      ".obllllllbo.",
      ".obllllllbo.",
      "..obbbbbbo..",
      "..oooooooo..",
      "...ll..ll...",
    ],
    rig: {
      parts: {
        body: [0, 0, 12, 11],
        footL: [3, 11, 2, 1],
        footR: [7, 11, 2, 1],
      },
      fx: {
        spray1: [
          [0, 4, "d"],
          [11, 4, "d"],
        ],
        spray2: [
          [-1, 2, "d"],
          [12, 2, "d"],
        ],
      },
    },
  },
  {
    id: "rimebill",
    name: "Rimebill",
    blurb:
      "Grew out of a Frostnib. Still swims every morning, even when it has to break the ice first.",
    colors: {
      o: OUTLINE,
      w: SHINE,
      b: "#3d5a80",
      l: "#eef4fa",
      d: "#7fc8f8",
      k: "#f2a541",
    },
    sprite: [
      "....d..dd..d....",
      "....oooooooo....",
      "...obbbbbbbbo...",
      "...obwobbwobo...",
      "...obbbkkbbbo...",
      "..obbbllllbbbo..",
      ".oobbllllllbboo.",
      "obobllllllllbobo",
      "obobllllllllbobo",
      "obobllllllllbobo",
      "odobllllllllbodo",
      ".oobllllllllboo.",
      "..obllllllllbo..",
      "...obbllllbbo...",
      "....oooooooo....",
      "....kk....kk....",
    ],
    rig: {
      parts: { flipperL: [0, 6, 2, 6], flipperR: [14, 6, 2, 6] },
      fx: {
        crack: [3, 4, 6, 9, 11, 12].map((x): Pixel => [x, 16, "d"]),
        spray: [
          [-1, 5, "d"],
          [16, 5, "d"],
          [-2, 3, "d"],
          [17, 3, "d"],
        ],
      },
    },
  },
];

const line: Line = {
  id: "frostnib",
  forms,
  evolvesAt: [16],
  kind: "beast",
  alignment: "chaotic good",
  abilities: { str: 14, dex: 13, con: 15, int: 8, wis: 10, cha: 12 },
  skills: ["Athletics", "Survival"],
  moves: [
    {
      level: 1,
      name: "Cold Plunge",
      text: "Jumps in first and never complains.",
      use: "bonus",
      ability: "con",
    },
    {
      level: 7,
      name: "Shiver Off",
      text: "Shakes the cold off and says it feels great.",
      use: "reaction",
      ability: "con",
    },
    {
      level: 13,
      name: "Ice Break",
      text: "Cracks the ice when the pond freezes over, and swims anyway.",
      use: "action",
      ability: "str",
      against: "dex",
      dice: "2d6 bludgeoning",
    },
    {
      level: 20,
      name: "Rime Beak",
      text: "Cuts through any excuse that has frozen solid.",
      use: "action",
      ability: "str",
      against: "ac",
      dice: "2d8 cold",
    },
    {
      level: 31,
      name: "Morning Swim",
      text: "Has not missed one in a year, ice or no ice.",
      use: "trait",
      ability: "con",
    },
  ],
};

export default line;
