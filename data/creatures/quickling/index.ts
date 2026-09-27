import type { Creature, Line } from "@/lib/types";
import { dark, grass, spirit } from "../elements";
import {
  backToZero,
  dreamBig,
  leafToWing,
  lifeSpark,
  nip,
  noArrival,
  swat,
} from "../moves";
import { OUTLINE, SHINE, STAR, pixelsAt } from "../pixels";

const forms: Creature[] = [
  {
    id: "quickling",
    name: "Quickling",
    blurb:
      "Has a dream: that no dull leaf stays a leaf. Most of them become butterflies.",
    elements: [spirit, grass],
    colors: {
      o: OUTLINE,
      w: SHINE,
      g: STAR,
      b: "#e8863a",
      l: "#fff3e0",
      n: "#9a6a3a",
      f: "#f7a8c9",
    },
    sprite: [
      "................",
      "..o........o....",
      "..oo......oo....",
      "..obo....obo....",
      "..obboooobbo....",
      ".obbbbbbbbbbo...",
      ".obwobbbbwobo...",
      ".ollbbbbbbllo...",
      "..ollloolllo....",
      "...oobbbboo.....",
      "...ogllllbo..oo.",
      "..oggglllbboollo",
      "..obgllllbbobbbo",
      "..obbllllbbobbo.",
      "..obbobbobbbbo..",
      "..oooooooooooo..",
    ],
    rig: {
      parts: { earR: [9, 1, 3, 3], tail: [12, 10, 4, 4] },
      fx: {
        leaf: [
          [14, 2, "n"],
          [15, 3, "n"],
        ],
        wingsOpen: pixelsAt(12, 5, ["f.f", "fof", "f.f"]),
        wingsShut: pixelsAt(12, 5, [".f.", ".o.", ".f."]),
      },
    },
  },
  {
    id: "neverfox",
    name: "Neverfox",
    blurb:
      "Any excuse sent its way goes back to zero and never arrives. Useless, useless, useless.",
    elements: [spirit, dark],
    colors: {
      o: OUTLINE,
      w: SHINE,
      g: STAR,
      b: "#e8863a",
      l: "#fff3e0",
      x: "#5b5560",
    },
    sprite: [
      "....................",
      "..ooo...............",
      ".obbbo..............",
      "obooobo.............",
      "obo.obo.............",
      "obooobo....o......o.",
      ".obbbo.....oo....oo.",
      "..olo......obo..obo.",
      "..obo......obboobbo.",
      "..obo.....obbbbbbbbo",
      "..obo.....obwobbwobo",
      "..obo.....ollbbbbllo",
      "..obbooooooolloollo.",
      "..obbgbbbbbbolllo...",
      "..obgggbbbbbbbbbo...",
      "..obbgbbbbbllllbo...",
      "..obbbbbbbbllllbo...",
      "..obbbbooobbooobo...",
      "..obbo..obo..obbo...",
      "..ooo...ooo..ooo....",
    ],
    rig: {
      parts: { earR: [16, 5, 3, 3], tail: [0, 1, 7, 6] },
      fx: {
        zero: pixelsAt(15, 0, [".ggg.", "g...g", "g...g", "g...g", ".ggg."]),
        excuse: pixelsAt(16, 1, ["x.x", ".x.", "x.x"]),
      },
    },
  },
];

const line: Line = {
  id: "quickling",
  forms,
  evolvesAt: [23],
  moves: [
    [1, leafToWing],
    [1, nip],
    [8, lifeSpark],
    [10, swat],
    [16, dreamBig],
    [24, backToZero],
    [35, noArrival],
  ],
};

export default line;
