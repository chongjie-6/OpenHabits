import type { Creature, Line } from "@/lib/types";
import { spirit, water } from "../elements";
import {
  bubbleUp,
  floatAway,
  plunder,
  roll,
  spritz,
  thinBubble,
  whoAmI,
} from "../moves";
import { OUTLINE, SHINE, STAR, pixelsAt } from "../pixels";

const forms: Creature[] = [
  {
    id: "burblet",
    name: "Burblet",
    blurb: "Plunders one bad habit a day in a bubble, and lets it float away.",
    elements: [spirit, water],
    colors: {
      o: OUTLINE,
      w: SHINE,
      g: STAR,
      b: "#f4a7c0",
      l: "#ffd6e3",
      r: "#e0607e",
      u: "#8fd4ff",
    },
    sprite: [
      "................",
      "................",
      "................",
      "................",
      "................",
      "r..............r",
      ".r..oooooooo..r.",
      ".r.obbbbbbbbo.r.",
      "rrobbbbbbbbbborr",
      "..obwobbbbwobo..",
      ".robbbbbbbbbbor.",
      "r.obbgboobbbbo.r",
      "...ogggbbbbbo...",
      "....ogllllbo....",
      "...obbllllbbo...",
      "...oooo..oooo...",
    ],
    rig: {
      parts: { gillL: [0, 5, 2, 7], gillR: [14, 5, 2, 7] },
      fx: {
        bubble: pixelsAt(6, 1, [".uu.", "u.ou", "u..u", ".uu."]),
        pop: [
          [5, -2, "u"],
          [10, -2, "u"],
          [5, 1, "u"],
          [10, 1, "u"],
        ],
      },
    },
  },
  {
    id: "burblivion",
    name: "Burblivion",
    blurb:
      "Blows a bubble spun so thin it isn't really there, so nothing can stop it. It still wonders who it is.",
    elements: [spirit, water],
    colors: {
      o: OUTLINE,
      w: SHINE,
      g: STAR,
      b: "#f4a7c0",
      l: "#ffd6e3",
      r: "#e0607e",
      u: "#8fd4ff",
    },
    sprite: [
      "......uu....uu......",
      "....u..........u....",
      "...u............u...",
      "..u....oooooo....u..",
      ".rr..oobbbbbboo..rr.",
      "...robbbbbbbbbbor...",
      "rrrrobwobbbbwoborrrr",
      "...robbbbbbbbbbor...",
      ".rr.obbbboobbbbo.rr.",
      ".....obbbbbbbbo.....",
      "u....obglllllbo....u",
      ".....ogggllllbo.....",
      "u....obglllllbo....u",
      ".....obbllllbbo.....",
      "u...obbo....obbo...u",
      "....ooo......ooo....",
      "..u..............u..",
      "...u............u...",
      "....uu........uu....",
      "......uu....uu......",
    ],
    rig: {
      parts: { gillL: [0, 4, 4, 5], gillR: [16, 4, 4, 5] },
      fx: { who: pixelsAt(3, 0, ["oo.", "..o", ".o.", "...", ".o."]) },
    },
  },
];

const line: Line = {
  id: "burblet",
  forms,
  evolvesAt: [26],
  moves: [
    [1, bubbleUp],
    [1, spritz],
    [8, plunder],
    [10, roll],
    [16, floatAway],
    [27, thinBubble],
    [38, whoAmI],
  ],
};

export default line;
