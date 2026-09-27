import type { Creature, Line } from "@/lib/types";
import { might, spirit } from "../elements";
import {
  dayNet,
  looseThread,
  nip,
  stringLine,
  swat,
  tieTight,
  walkFree,
} from "../moves";
import { OUTLINE, SHINE, STAR, pixelsAt } from "../pixels";

const forms: Creature[] = [
  {
    id: "threadle",
    name: "Threadle",
    blurb:
      "Comes a little unravelled on hard days. Ties itself back tighter, and walks free.",
    elements: [spirit, might],
    colors: {
      o: OUTLINE,
      w: SHINE,
      g: STAR,
      b: "#5aa9e6",
      l: "#a9d6f7",
      d: "#2d6fae",
    },
    sprite: [
      "................",
      "................",
      "................",
      "................",
      ".....oooooo.....",
      "...oogbbdbboo...",
      "..obgggdbbbbdo..",
      "..obbgdbbbbdbo..",
      ".obbbdbbbbdbbbo.",
      ".obwobbbbbbwobo.",
      ".oblbbbbbbbblbo.",
      ".obbdbbbbbbdbbo.",
      "..obbdbbbbdbbo..",
      "..obbbdbbdbbbo..",
      "...oobbddbboo...",
      ".....ooooooddd..",
    ],
    rig: {
      parts: { tail: [11, 15, 3, 1] },
      fx: {
        loose: pixelsAt(9, 1, [".dd", "d.d", "..d"]),
        string: [
          [4, 4, "d"],
          [3, 3, "d"],
          [2, 2, "d"],
          [1, 1, "d"],
          [0, 0, "d"],
        ],
      },
    },
  },
  {
    id: "tapestrel",
    name: "Tapestrel",
    blurb:
      "Unwinds into a net and catches the whole day in it. Then it winds back up, free to do as it pleases.",
    elements: [spirit, might],
    colors: {
      o: OUTLINE,
      w: SHINE,
      g: STAR,
      b: "#5aa9e6",
      l: "#a9d6f7",
      d: "#2d6fae",
      y: "#ffd95a",
    },
    sprite: [
      "oo................oo",
      "odo..............odo",
      "obdo............odbo",
      "odbdo..........odbdo",
      "obdbdo..oooo..odbdbo",
      ".obdbdoobbbboodbdbo.",
      ".odbdbobwobwobdbdbo.",
      "..obdbobbyybbobdbo..",
      "..odbdoobbyyoodbdo..",
      "...obdbobbbbobdbo...",
      "...odbdobllbodbdo...",
      "....ooobglllbooo....",
      "......oggglllbo.....",
      "......obgllllbo.....",
      "......obbllllbo.....",
      ".......obbbbbo......",
      "......odbdodbdo.....",
      ".....odo.odo.odo....",
      ".....d...d...d......",
      "..............dddd..",
    ],
    rig: {
      parts: { tail: [14, 19, 4, 1] },
      fx: {
        net: pixelsAt(3, 1, [
          "d.d.d.dd.d.d.d",
          ".d.d.d..d.d.d.",
          "...dddddddd...",
        ]),
        sun: pixelsAt(8, 0, [".y.", "yyy", ".y."]),
      },
    },
  },
];

const line: Line = {
  id: "threadle",
  forms,
  evolvesAt: [24],
  moves: [
    [1, looseThread],
    [1, nip],
    [8, tieTight],
    [10, swat],
    [16, stringLine],
    [25, dayNet],
    [36, walkFree],
  ],
};

export default line;
