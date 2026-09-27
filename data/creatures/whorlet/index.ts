import type { Creature, Line } from "@/lib/types";
import { spirit, wind } from "../elements";
import {
  bump,
  endlessSpin,
  goldenTurn,
  nailSpin,
  roll,
  spiralShell,
  thankYou,
} from "../moves";
import { OUTLINE, STAR } from "../pixels";

const forms: Creature[] = [
  {
    id: "whorlet",
    name: "Whorlet",
    blurb:
      "Its shell is a golden spiral, each turn a little wider than the last. It never stops turning.",
    elements: [spirit, wind],
    colors: {
      o: OUTLINE,
      g: STAR,
      b: "#a9c98f",
      l: "#d9ecc7",
      y: "#f2c14e",
      s: "#b5782a",
    },
    sprite: [
      "................",
      "................",
      "................",
      "........oooooo..",
      ".......oyyyyyyo.",
      ".o..o.osssssssyo",
      ".b..b.oyyyyyysyo",
      ".b..b.oyssssysyo",
      "oboobooysyysysyo",
      "obbgbboysyssysyo",
      "obgggboysyyyysyo",
      "obbgbo.osssssso.",
      "obbbbo..oooooo..",
      "obbbbbooooooooo.",
      "obllllllllllllbo",
      ".oooooooooooooo.",
    ],
    rig: { parts: { stalks: [0, 5, 6, 3], shell: [6, 3, 10, 10] } },
  },
  {
    id: "whorlinity",
    name: "Whorlinity",
    blurb:
      "Its spin reached infinity and never stops. Whatever it sets turning keeps turning, and it never forgets to say thank you.",
    elements: [spirit, wind],
    colors: {
      o: OUTLINE,
      g: STAR,
      b: "#a9c98f",
      l: "#d9ecc7",
      y: "#f2c14e",
      s: "#b5782a",
    },
    sprite: [
      "..............o..o..",
      "..............b..b..",
      ".............obbbbo.",
      ".............obgbbo.",
      "....ooooooooobgggbo.",
      "...obbbbbbbbbbbgbbo.",
      "...obbbbbbbbbbbbbo..",
      "....ollllllllllllo..",
      ".......oooooo.......",
      ".....ooyyyyyyoo.....",
      ".....osssssssso.....",
      "....oyyyyyyyysyo....",
      "ll..oyssssssysyo....",
      "....oysyyyysysyo....",
      ".ll.oysysyysysyo....",
      "....oysyssssysyo....",
      "ll..oysyyyyyysyo....",
      ".....osssssssso.....",
      ".....ooyyyyyyoo.....",
      ".......oooooo.......",
    ],
    rig: { parts: { stalks: [14, 0, 4, 2], shell: [4, 8, 12, 12] } },
  },
];

const line: Line = {
  id: "whorlet",
  forms,
  evolvesAt: [25],
  moves: [
    [1, spiralShell],
    [1, bump],
    [8, nailSpin],
    [10, roll],
    [16, goldenTurn],
    [26, endlessSpin],
    [37, thankYou],
  ],
};

export default line;
