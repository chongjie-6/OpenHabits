import type { Creature, Line } from "@/lib/types";
import { metal, might, water } from "../elements";
import {
  legDay,
  oneMoreRep,
  pounce,
  puddleFlex,
  repCroak,
  sevendaySplit,
  spritz,
} from "../moves";
import { OUTLINE, SHINE, pixelsAt } from "../pixels";

const SKIN = {
  o: OUTLINE,
  w: SHINE,
  e: OUTLINE,
  b: "#45b39d",
  l: "#c4ecd9",
  r: "#e0493e",
  d: "#8fd4ff",
};
const IRON = { p: "#6b7089", s: "#a9aec2" };

const forms: Creature[] = [
  {
    id: "gainlet",
    name: "Gainlet",
    blurb:
      "Flexes at every puddle it passes. Nothing there yet. It flexes anyway.",
    elements: [water, might],
    colors: SKIN,
    sprite: [
      ".oo...oo....",
      "owwo.owwo...",
      "oweoooweo...",
      "orrrrrrro...",
      "obbbbbbbo.o.",
      "obobbboboobo",
      "obbooobbobbo",
      "oblllllbbbbo",
      "oblllllbooo.",
      "obblllbbo...",
      "obbbobbbo...",
      ".ooo.ooo....",
    ],
    rig: {
      parts: { arm: [9, 4, 3, 5] },
      fx: { sweat: [[9, 2, "d"]] },
    },
  },
  {
    id: "repcroak",
    name: "Repcroak",
    blurb: "Croaks once for every rep. Has never lost count, or stopped early.",
    elements: [water, might],
    colors: { ...SKIN, ...IRON },
    sprite: [
      "..ooo..ooo.o...o",
      ".owwwoowwwopooop",
      ".owweoowweopsssp",
      ".orrrrrrrropbbop",
      ".obbbbbbbboobboo",
      ".obobbbboboobbo.",
      ".obboooobboobbo.",
      ".obbbbbbbbobbbo.",
      ".obllllllbbbbbo.",
      ".obllllllbooo...",
      ".obllllllbo.....",
      ".obbllllbbo.....",
      "obbbbbbbbbbo....",
      "obbbboobbbbo....",
      ".obbo..obbo.....",
      "ooooo..ooooo....",
    ],
    rig: {
      parts: { bell: [11, 0, 5, 4] },
      fx: { sac: pixelsAt(3, 7, ["ollllo", ".oooo."]) },
    },
  },
  {
    id: "croaklossus",
    name: "Croaklossus",
    blurb: "Never skips leg day. Never skips the other six, either.",
    elements: [might, metal],
    colors: { ...SKIN, ...IRON, n: "#8a5a34", y: "#f2c14e" },
    sprite: [
      "oooo............oooo",
      "oppo............oppo",
      "oppooooooooooooooppo",
      "oppobbssssssssbboppo",
      "oppobboooooooobboppo",
      "oppobbowwoowwobboppo",
      "oooobboweooweobboooo",
      "...obborrrrrrobbo...",
      "..obbbobbbbbbobbbo..",
      "..obbboboooobobbbo..",
      "..obbbobbbbbbobbbo..",
      "..obbllllllllllbbo..",
      "...obllllllllllbo...",
      "...obllllllllllbo...",
      "...onnnnnyynnnnno...",
      "...onnnnnyynnnnno...",
      "..obbbbbbbbbbbbbbo..",
      ".obbbbbboooobbbbbbo.",
      ".obbbo........obbbo.",
      "oooooo........oooooo",
    ],
    rig: {
      parts: { top: [0, 0, 20, 16] },
      fx: {
        dust: [
          [-1, 19, "s"],
          [-2, 18, "s"],
          [20, 19, "s"],
          [21, 18, "s"],
        ],
      },
    },
  },
];

const line: Line = {
  id: "gainlet",
  forms,
  evolvesAt: [18, 36],
  moves: [
    [1, puddleFlex],
    [1, spritz],
    [6, oneMoreRep],
    [10, pounce],
    [19, repCroak],
    [28, legDay],
    [38, sevendaySplit],
  ],
};

export default line;
