import type { Creature, Line, Pixel } from "@/lib/types";
import { OUTLINE, SHINE, pixelsAt } from "../pixels";

const forms: Creature[] = [
  {
    id: "drizzlet",
    name: "Drizzlet",
    blurb: "Falls as one drop a day. Given a year, it becomes a lake.",
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
    {
      level: 1,
      name: "One Drop",
      text: "Falls exactly once a day, and makes it count.",
    },
    {
      level: 6,
      name: "Puddle Up",
      text: "Gathers yesterday's drops into something you can stand in.",
    },
    {
      level: 14,
      name: "Ripple Out",
      text: "Each ripple goes a little further than the last.",
    },
    {
      level: 21,
      name: "Keep Every Drop",
      text: "Nothing it catches is ever spilled.",
    },
    { level: 31, name: "Still Water", text: "Goes so calm that fish move in." },
  ],
};

export default line;
