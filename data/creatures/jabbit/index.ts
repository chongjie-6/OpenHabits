import type { Creature, Line } from "@/lib/types";
import { might, spirit } from "../elements";
import {
  doneAlready,
  hundredJabs,
  pounce,
  quickJab,
  scratch,
  sharpEye,
  stillMoment,
} from "../moves";
import { OUTLINE, SHINE, STAR, pixelsAt } from "../pixels";

const forms: Creature[] = [
  {
    id: "jabbit",
    name: "Jabbit",
    blurb:
      "Says only 'good grief.' Then it lands a hundred jabs before you can blink.",
    elements: [spirit, might],
    colors: { o: OUTLINE, w: SHINE, g: STAR, b: "#4d5db3", l: "#b9c4f3" },
    sprite: [
      "..oo....oo......",
      ".oblo..olbo.....",
      ".oblo..olbo.....",
      ".oblo..olbo.....",
      ".oblo..olbo.....",
      ".obboooobbo.....",
      "obbbbbbbbbbo....",
      "obwobbbbwobo....",
      "obbbbllbbbbo....",
      ".obbbbbbbbo.....",
      "..obglllbooo.oo.",
      "..ogggllbbbbollo",
      "..obglllbooo.oo.",
      "..obbbbbbo......",
      "..obo..obo......",
      "..ooo..ooo......",
    ],
    rig: {
      parts: { earL: [1, 0, 4, 5], earR: [7, 0, 4, 5], fist: [12, 10, 4, 3] },
      fx: {
        jabA: pixelsAt(12, 6, [".oo.", "ollo", ".oo."]),
        jabB: pixelsAt(12, 13, [".oo.", "ollo", ".oo."]),
      },
    },
  },
  {
    id: "stillhare",
    name: "Stillhare",
    blurb:
      "For a few seconds, only it can move. When time begins to move again, the habit is already done.",
    elements: [spirit, might],
    colors: {
      o: OUTLINE,
      w: SHINE,
      g: STAR,
      b: "#4d5db3",
      l: "#b9c4f3",
      u: "#8fd4ff",
      s: "#8a8d99",
    },
    sprite: [
      ".oo....oo...........",
      "oblo..oblo..........",
      "oblbo.oblbo.........",
      ".oblbo.oblbo........",
      "..oblbo.oblbo.......",
      "...oblbo.oblbo......",
      "....obbbbbbbbbbo....",
      "...obbbbbbbbbbbbo...",
      "...obbbbbbbbwobbo...",
      "...obbbbbbbbbbbblo..",
      "...obbbbbbbbbbbbo...",
      "....obbbbbbbbbbo....",
      ".....oobbbbbboo.....",
      "....obglllbbbbbo....",
      "....ogggollbooo.ooo.",
      "....obglloobbbbolllo",
      "....oblllllbooo.ooo.",
      "....obblllbbbo......",
      "...obbo...obbo......",
      "...oooo...oooo......",
    ],
    rig: {
      parts: { earL: [0, 0, 5, 3], fist: [15, 14, 5, 3] },
      fx: {
        drop: [
          [18, 3, "u"],
          [18, 4, "u"],
        ],
        burst: pixelsAt(17, 7, ["u.u", "...", "...", "u.u"]),
        jabA: pixelsAt(15, 10, [".ooo.", "olllo", ".ooo."]),
        jabB: pixelsAt(15, 17, [".ooo.", "olllo", ".ooo."]),
      },
    },
  },
];

const line: Line = {
  id: "jabbit",
  forms,
  evolvesAt: [22],
  moves: [
    [1, quickJab],
    [1, scratch],
    [8, hundredJabs],
    [10, pounce],
    [15, sharpEye],
    [23, stillMoment],
    [33, doneAlready],
  ],
};

export default line;
