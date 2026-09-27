import type { Creature, Line } from "@/lib/types";
import { earth, spirit } from "../elements";
import {
  bump,
  charge,
  goodAsNew,
  hairCheck,
  patchUp,
  piecesHome,
  stitchBack,
} from "../moves";
import { OUTLINE, SHINE, STAR, pixelsAt } from "../pixels";

const forms: Creature[] = [
  {
    id: "mendle",
    name: "Mendle",
    blurb:
      "Mends whatever broke yesterday, missed days included. The one thing it can't mend is itself.",
    elements: [spirit, earth],
    colors: {
      o: OUTLINE,
      w: SHINE,
      g: STAR,
      b: "#ec7fb0",
      l: "#ffc9e0",
      d: "#b8507f",
    },
    sprite: [
      "................",
      "................",
      "................",
      "................",
      "......oooo......",
      ".....olwlbo.....",
      "....olllllbo....",
      "...ollllllbbo...",
      "..oddddddddddo..",
      "..obbbbbbbbbdo..",
      "..obwobbbbwodo..",
      "...obbgbbbbdo...",
      "..o.ogggbbdo.o..",
      ".obo.ogbbdo.obo.",
      "..o...obdo...o..",
      ".......oo.......",
    ],
    rig: {
      parts: { handL: [1, 12, 3, 3], handR: [12, 12, 3, 3] },
      fx: {
        crack: [
          [8, 9, "o"],
          [9, 10, "o"],
          [8, 11, "o"],
          [9, 12, "o"],
        ],
        glint: pixelsAt(11, 3, [".w.", "www", ".w."]),
      },
    },
  },
  {
    id: "mendazzle",
    name: "Mendazzle",
    blurb:
      "Every broken piece it finds flies straight back to where it belongs. Say what you like, just not about its hair.",
    elements: [spirit, earth],
    colors: {
      o: OUTLINE,
      w: SHINE,
      g: STAR,
      b: "#ec7fb0",
      l: "#ffc9e0",
      d: "#b8507f",
    },
    sprite: [
      "....ooooooooo.......",
      "..oolwwwlllllooo....",
      ".olwllldddddlllbo...",
      "oldlloooooooodllbo..",
      "oldlo.......olldbo..",
      ".odlo......olwlldbo.",
      "..oo.......olwlllbo.",
      ".....oooooolllldbbo.",
      "....olwlldldllldbdo.",
      "...ollllddldlllllo..",
      "..olllldlllldlllbo..",
      ".oddddddddddddddddo.",
      "..obbwobbbbbbwobbo..",
      "...obdbbgbbbbbdbo...",
      ".oo.obdgggbbbbbo.oo.",
      "oblo.obdgbbbbbo.olbo",
      "obbo..obdbbbbo..obbo",
      ".oo....obdbbo....oo.",
      "........obdo........",
      ".........oo.........",
    ],
    rig: {
      parts: { handL: [0, 14, 4, 4], handR: [16, 14, 4, 4] },
      fx: {
        crack: pixelsAt(4, 9, ["ddd", "dd."]),
        chip: pixelsAt(4, 9, ["wll", "ll."]),
        glint: pixelsAt(16, 0, [".w.", "www", ".w."]),
      },
    },
  },
];

const line: Line = {
  id: "mendle",
  forms,
  evolvesAt: [21],
  moves: [
    [1, patchUp],
    [1, bump],
    [8, stitchBack],
    [10, charge],
    [15, piecesHome],
    [22, hairCheck],
    [34, goodAsNew],
  ],
};

export default line;
