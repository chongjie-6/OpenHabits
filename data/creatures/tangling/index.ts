import type { Creature, Line } from "@/lib/types";
import { grass, light, spirit } from "../elements";
import {
  bump,
  nextLine,
  noonPulse,
  sunRipple,
  swat,
  thornReading,
  vineSnare,
} from "../moves";
import { OUTLINE, SHINE, STAR, pixelsAt } from "../pixels";

const forms: Creature[] = [
  {
    id: "tangling",
    name: "Tangling",
    blurb:
      "Your next line is 'I'll do it tomorrow.' Its thorny vine has already found today's.",
    elements: [spirit, grass],
    colors: {
      o: OUTLINE,
      w: SHINE,
      g: STAR,
      b: "#a883d4",
      l: "#dccbf1",
      v: "#6c3f9e",
      d: "#3c1f5c",
    },
    sprite: [
      "..vv........vv..",
      ".v..v......v..v.",
      "dv.vv......vv.vd",
      "..v..........v..",
      "..dv........vd..",
      "....v......v....",
      ".....oooooo.....",
      "....obbbbbbo....",
      "...obbbbbbbbo...",
      "..obwobbbbwobo..",
      "..obgbbbbbbbbo..",
      "..ogggllllbbbo..",
      "...ogllllllbo...",
      "....obbbbbbo....",
      "....obo..obo....",
      "....oo....oo....",
    ],
    rig: {
      parts: { vineL: [0, 0, 5, 6], vineR: [11, 0, 5, 6] },
      fx: { found: pixelsAt(6, 1, [".gg.", "gwwg", ".gg."]) },
    },
  },
  {
    id: "tanglare",
    name: "Tanglare",
    blurb:
      "Runs a ripple of sunlight down its vines into every excuse they catch. 'Oh my god!' it cries, every single time.",
    elements: [spirit, light],
    colors: {
      o: OUTLINE,
      w: SHINE,
      g: STAR,
      b: "#a883d4",
      l: "#dccbf1",
      v: "#6c3f9e",
      d: "#3c1f5c",
      y: "#fff1a8",
    },
    sprite: [
      ".......yy..yy.......",
      "......y.yyyy.y......",
      ".....y.oooooo.y.....",
      "......obbbbbbo......",
      ".....obbbbbbbbo.....",
      ".....obwobbwobo.....",
      "...vvobbbbbbbbovv...",
      "..v..vobbllbbov..v..",
      ".v....vobbbbov....v.",
      ".v...vobbbbbbov...v.",
      ".dv..obgllllbbo..vd.",
      "..v.obggglllllbo.v..",
      "..v.oblgllllllbo.v..",
      ".dv.obllllllllbo.vd.",
      "..v.obllllllllbo.v..",
      "..v..obbbbbbbbo..v..",
      ".vd..obbbooobbo..dv.",
      ".v...obbo..obbo...v.",
      "v.v..obbo..obbo..v.v",
      ".v...oooo..oooo...v.",
    ],
    rig: {
      parts: { vineL: [0, 6, 4, 14], vineR: [16, 6, 4, 14] },
      fx: { found: pixelsAt(8, 0, [".ww.", "gwwg"]) },
    },
  },
];

const line: Line = {
  id: "tangling",
  forms,
  evolvesAt: [20],
  moves: [
    [1, vineSnare],
    [1, bump],
    [8, thornReading],
    [10, swat],
    [16, nextLine],
    [21, sunRipple],
    [32, noonPulse],
  ],
};

export default line;
