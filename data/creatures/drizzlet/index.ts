import type { Creature, Line, Pixel } from "@/lib/types";
import { water } from "../elements";
import {
  keepEveryDrop,
  oneDrop,
  puddleUp,
  rippleOut,
  roll,
  spritz,
  stillWater,
} from "../moves";
import { OUTLINE, SHINE, pixelsAt } from "../pixels";

const forms: Creature[] = [
  {
    id: "drizzlet",
    name: "Drizzlet",
    blurb: "Falls as one drop a day. Given a year, it becomes a lake.",
    elements: [water],
    colors: { o: OUTLINE, w: SHINE, b: "#5aa9e6", l: "#bfe3ff" },
    sprite: [
      ".....oo.....",
      "....obbo....",
      "....obbo....",
      "...obbbbo...",
      "..obbbbbbo..",
      ".oblbbbbbbo.",
      ".olbwobwobo.",
      ".olbbbbbbbo.",
      ".obbbooobbo.",
      "..obbbbbbo..",
      "...oooooo...",
      "............",
    ],
    rig: {
      parts: { tip: [4, 0, 4, 3] },
      fx: {
        drop: [[6, 11, "b"]],
        puddle: [3, 4, 5, 6, 7, 8].map((x): Pixel => [x, 12, "b"]),
      },
    },
  },
  {
    id: "ripplet",
    name: "Ripplet",
    blurb: "Keeps every drop it catches. Each ripple goes a little further.",
    elements: [water],
    colors: { o: OUTLINE, w: SHINE, b: "#5aa9e6", l: "#bfe3ff", p: "#3d8fd1" },
    sprite: [
      ".......oo.......",
      "......obbo......",
      "......obbo......",
      ".....obbbbo.....",
      "....obbbbbbo....",
      "...obbbbbbbbo...",
      "..olbbbbbbbbbo..",
      "..olwobbbwobbo..",
      "..olbbbbbbbbbo..",
      "..obbbboobbbbo..",
      "..obbbbbbbbbbo..",
      "pppobbbbbbbboppp",
      "pllpoooooooopllp",
      ".ppllppppppllpp.",
      "...pppppppppp...",
      "................",
    ],
    rig: {
      fx: {
        drop: [[7, -2, "b"]],
        ring1: pixelsAt(1, 12, ["ww..........ww", "..ww......ww.."]),
        ring2: pixelsAt(0, 12, [
          "l..............l",
          ".ll..........ll.",
          "...ll......ll...",
        ]),
        ring3: pixelsAt(-1, 13, [
          "b................b",
          ".bb............bb.",
          "...bbb......bbb...",
        ]),
      },
    },
  },
  {
    id: "stillmere",
    name: "Stillmere",
    blurb: "Started as one drop a day. Now fish live in it.",
    elements: [water],
    colors: {
      o: OUTLINE,
      w: SHINE,
      b: "#5aa9e6",
      l: "#bfe3ff",
      d: "#3b7fc4",
      k: "#f4a259",
    },
    sprite: [
      "....................",
      "....................",
      "....................",
      "....................",
      "........oooo........",
      "......oobbbboo......",
      "....oobbbbbbbboo....",
      "...oblbbbbbbbbbbo...",
      "..oblbbbbbbbbbbbbo..",
      "..olbbwobbbwobbbbo..",
      ".olbbbbbbbbbbbbbbbo.",
      ".obbbbbboooobbbbbbo.",
      "obllbbbbbbbbbbbbllbo",
      "oddddddddddddddddddo",
      "oddddddddddddddddddo",
      "oddllddddddddddddddo",
      "oddddddddddddddddldo",
      ".oddddddddddddddddo.",
      "..oooooooooooooooo..",
      "....................",
    ],
    rig: {
      fx: {
        koi: pixelsAt(10, 14, ["..kkk.k", "kokkkk.", "..kkk.k"]),
        leap: pixelsAt(14, 5, ["..kkk.k", "kokkkk.", "..kkk.k"]),
        splashOut: pixelsAt(13, 3, ["..b..", "b...b"]),
        splashIn: pixelsAt(2, 3, ["..b..", "b...b"]),
      },
    },
  },
];

const line: Line = {
  id: "drizzlet",
  forms,
  evolvesAt: [13, 29],
  moves: [
    [1, oneDrop],
    [1, spritz],
    [6, puddleUp],
    [10, roll],
    [14, rippleOut],
    [21, keepEveryDrop],
    [31, stillWater],
  ],
};

export default line;
