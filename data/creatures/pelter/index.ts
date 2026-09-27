import type { Creature, Line } from "@/lib/types";
import { spirit, water } from "../elements";
import {
  dive,
  downpour,
  exactAim,
  heavyDrop,
  pressIn,
  spritz,
  stayPressed,
} from "../moves";
import { OUTLINE, SHINE, STAR, pixelsAt } from "../pixels";

const forms: Creature[] = [
  {
    id: "pelter",
    name: "Pelter",
    blurb:
      "The youngest of Tangling's family. Rains like it's November, hard enough to press a habit into place.",
    elements: [spirit, water],
    colors: {
      o: OUTLINE,
      w: SHINE,
      g: STAR,
      b: "#8b93a7",
      l: "#c3c9d6",
      s: "#5f6679",
      d: "#4f8fd6",
    },
    sprite: [
      "................",
      "................",
      "......oooo......",
      ".....ollbbo.....",
      ".....olbbbbooo..",
      "..ooobbbbbbllbo.",
      ".ollbbbbbbbbbbbo",
      "obgbwobbbbwobbbo",
      "ogggbbboobbbbbbo",
      "osgsssssssssssso",
      ".oooooooooooooo.",
      "................",
      "................",
      "................",
      "................",
      "...dddddddddd...",
    ],
    rig: {
      fx: {
        dropA: [
          [3, 11, "d"],
          [3, 12, "d"],
        ],
        dropB: [
          [7, 12, "d"],
          [7, 13, "d"],
        ],
        dropC: [
          [11, 11, "d"],
          [11, 12, "d"],
        ],
        splash: [
          [2, 14, "d"],
          [6, 14, "d"],
          [9, 14, "d"],
          [13, 14, "d"],
        ],
      },
    },
  },
  {
    id: "pelterra",
    name: "Pelterra",
    blurb:
      "It's all about the mechanism: every drop lands exactly where it means to, and what it presses stays pressed.",
    elements: [spirit, water],
    colors: {
      o: OUTLINE,
      w: SHINE,
      g: STAR,
      b: "#8b93a7",
      l: "#c3c9d6",
      s: "#5f6679",
      d: "#4f8fd6",
    },
    sprite: [
      "....ooo.ooo.........",
      "...os.sos.so........",
      "....ooo.ooo.........",
      "......oso...........",
      "...oooosooo..oooo...",
      "..ollllbbbbooollbo..",
      ".ollbbbbbbbbbbbbbbo.",
      ".obbbbbbbbbbbbbbbbo.",
      "obbbbwobbbbbbwobbbbo",
      "obbgbbbbboobbbbbbbbo",
      "obgggbbbbbbbbbbbbbbo",
      "ossgssssssssssssssso",
      ".osssssssssssssssso.",
      "..oooooooooooooooo..",
      "....................",
      "....................",
      "....................",
      "....................",
      "....................",
      "..dddddddddddddddd..",
    ],
    rig: {
      fx: {
        dropA: [
          [4, 14, "d"],
          [4, 15, "d"],
        ],
        dropB: [
          [10, 14, "d"],
          [10, 15, "d"],
        ],
        dropC: [
          [15, 14, "d"],
          [15, 15, "d"],
        ],
        markA: pixelsAt(3, 18, ["g.g", ".g."]),
        markB: pixelsAt(9, 18, ["g.g", ".g."]),
        markC: pixelsAt(14, 18, ["g.g", ".g."]),
      },
    },
  },
];

const line: Line = {
  id: "pelter",
  forms,
  evolvesAt: [27],
  moves: [
    [1, heavyDrop],
    [1, spritz],
    [8, pressIn],
    [10, dive],
    [16, downpour],
    [28, exactAim],
    [39, stayPressed],
  ],
};

export default line;
