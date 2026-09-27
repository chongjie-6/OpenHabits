import type { Creature, Line } from "@/lib/types";
import { earth, might, wind } from "../elements";
import {
  cloudLeap,
  measureUp,
  peekOut,
  pounce,
  scratch,
  staffGrow,
  thousandSunrises,
} from "../moves";
import { OUTLINE, SHINE, pixelsAt } from "../pixels";

const FUR = { o: OUTLINE, w: SHINE, e: OUTLINE, b: "#d4974f", l: "#f8ddb0" };
const GEAR = { g: "#f4c23f", r: "#d8453a", t: "#f0913a" };

const forms: Creature[] = [
  {
    id: "stonkey",
    name: "Stonkey",
    blurb:
      "Sat inside a mountain stone for a thousand sunrises. Still lifts the lid to check before coming out.",
    elements: [earth],
    colors: { ...FUR, k: "#aca59c", h: "#dcd6cc" },
    sprite: [
      "....oooo....",
      "...ohkkko...",
      "..okkookko..",
      "..obbbbbbo..",
      ".obbbbbbbbo.",
      "olbllbbllblo",
      "olbwellweblo",
      ".obllllllbo.",
      "okkollllokko",
      "okhkkkkkkkko",
      ".okkkkkkkko.",
      "..oooooooo..",
    ],
    rig: {
      parts: { lid: [2, 0, 8, 3] },
      fx: { scalp: pixelsAt(3, 2, ["oooooo"]) },
    },
  },
  {
    id: "staffling",
    name: "Staffling",
    blurb:
      "Its staff grows a little longer every day it trains. It likes to check.",
    elements: [might],
    colors: { ...FUR, ...GEAR },
    sprite: [
      "..............o.",
      "....ooooo....ogo",
      "...obbbbbo...ogo",
      "..ogggggggo..oro",
      ".obllbbbllbo.oro",
      "olbwelllweblooro",
      "olblllllllblooro",
      ".oblllllllbo.oro",
      "..ooooooooo..oro",
      ".o.oblllboooooro",
      "o.obblllbbbbbbbo",
      "o.obolllboooooro",
      "o.ootototo...oro",
      ".ooottotto...ogo",
      "...obo.obo...ogo",
      "...ooo.ooo....o.",
    ],
    rig: {
      parts: { tip: [13, 0, 3, 3] },
      fx: { shaft: pixelsAt(13, 0, ["oro", "oro", "oro"]) },
    },
  },
  {
    id: "cloudsage",
    name: "Cloudsage",
    blurb:
      "One somersault carries it a hundred thousand li. It still practises one every morning.",
    elements: [might, wind],
    colors: { ...FUR, ...GEAR, c: "#f7f4ff", s: "#c6bde6" },
    sprite: [
      "..rrr......rrr......",
      ".r...r....r...r.....",
      ".r....r..r....r..o..",
      ".r...oooooo...r.ogo.",
      "....obbbbbbo....ogo.",
      "...oggggggggo...oro.",
      "..oblllbblllbo..oro.",
      ".olblwellwelblo.oro.",
      ".olbllllllllblo.oro.",
      "..obllllllllbo..oro.",
      "...ooooooooooooooro.",
      "...obgllllgbbbbbbbo.",
      "...obggllggooooooro.",
      "...ootottoto....oro.",
      ".....oooooooooo.ooo.",
      ".ooooccccccccccoccco",
      "occcsccccccccccscsco",
      "ocsccccccccccccccsco",
      ".osssccsssssscccsso.",
      "..oooooooooooooooo..",
    ],
    rig: {
      parts: { body: [0, 0, 20, 14] },
      fx: { puff: pixelsAt(-4, 15, [".oo.", "occo", ".oo."]) },
    },
  },
];

const line: Line = {
  id: "stonkey",
  forms,
  evolvesAt: [15, 32],
  moves: [
    [1, peekOut],
    [1, scratch],
    [6, thousandSunrises],
    [10, pounce],
    [16, staffGrow],
    [25, measureUp],
    [34, cloudLeap],
  ],
};

export default line;
