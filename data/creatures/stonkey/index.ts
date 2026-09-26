import type { Creature, Line } from "@/lib/types";
import { OUTLINE, SHINE, pixelsAt } from "../pixels";

const FUR = { o: OUTLINE, w: SHINE, e: OUTLINE, b: "#d4974f", l: "#f8ddb0" };
const GEAR = { g: "#f4c23f", r: "#d8453a", t: "#f0913a" };

const forms: Creature[] = [
  {
    id: "stonkey",
    name: "Stonkey",
    blurb:
      "Sat inside a mountain stone for a thousand sunrises. Still lifts the lid to check before coming out.",
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
    {
      level: 1,
      name: "Peek Out",
      text: "Lifts the lid to check before coming out.",
    },
    {
      level: 6,
      name: "Thousand Sunrises",
      text: "Waits it out. It has done this before.",
    },
    {
      level: 16,
      name: "Staff Grow",
      text: "Its staff gets a little longer every day it trains.",
    },
    {
      level: 25,
      name: "Measure Up",
      text: "Checks the staff against yesterday's. It is longer.",
    },
    {
      level: 34,
      name: "Cloud Leap",
      text: "One somersault, a hundred thousand li, and back by breakfast.",
    },
  ],
};

export default line;
