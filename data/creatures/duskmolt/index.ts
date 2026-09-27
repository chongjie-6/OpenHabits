import type { Creature, Line } from "@/lib/types";
import { dive, nip } from "../common";
import { OUTLINE, SHINE } from "../pixels";

const forms: Creature[] = [
  {
    id: "duskmolt",
    name: "Duskmolt",
    blurb: "Sheds one dark scale for every good day. Underneath, it is gold.",
    elements: ["dark"],
    colors: { o: OUTLINE, b: "#54466b", m: "#8a74ab", l: "#f0c75e" },
    sprite: [
      "o..............o",
      "oo............oo",
      "obo..........obo",
      "obbo.o....o.obbo",
      "obmbo.o..o.obmbo",
      "obmmboooooobmmbo",
      "obbmmobbbbommbbo",
      "obbmmommmmommbbo",
      "obmbmobbbbombmbo",
      "obmbmoobboombmbo",
      "obmbmobllbombmbo",
      "oboboolllloobobo",
      "ob.o.obllbo.o.bo",
      "ob...obbbbo...bo",
      "ob...oboobo...bo",
      "oo...oo..oo...oo",
    ],
    rig: {
      parts: { wingL: [0, 0, 5, 16], wingR: [11, 0, 5, 16] },
      fx: {
        feelers: [
          [4, 2, "m"],
          [3, 1, "m"],
          [11, 2, "m"],
          [12, 1, "m"],
        ],
        scale: [[16, 6, "b"]],
      },
    },
  },
  {
    id: "dawnmolt",
    name: "Dawnmolt",
    blurb:
      "Grew out of a Duskmolt. Its last dark scale fell, and now it sheds light instead.",
    elements: ["light"],
    colors: { o: OUTLINE, w: SHINE, b: "#d6cfe6", m: "#f0c75e", l: "#fff3c4" },
    sprite: [
      "o.....m....m.....o",
      "oo...om....mo...oo",
      "obo..omo..omo..obo",
      "obmo..omoomo..ombo",
      "obmboooooooooobmbo",
      "olbbmobbbbbbombblo",
      "ombmmoowoowoommbmo",
      "ombmlobbbbbbolmbmo",
      "ombmmoobbbboommbmo",
      "ombmmooobbooommbmo",
      "ombmmobbmmbbommbmo",
      "ombmmobbllbbommbmo",
      "ombmmomllllmommbmo",
      "oboboobbllbboobobo",
      "obo.oobbmmbboo.obo",
      "obo..oobbbboo..obo",
      "obo..obo..obo..obo",
      "ooo..oo....oo..ooo",
    ],
    rig: {
      parts: { wingL: [0, 0, 5, 18], wingR: [13, 0, 5, 18] },
      fx: {
        moteA: [
          [2, 1, "m"],
          [15, 1, "m"],
        ],
        moteB: [
          [4, 2, "m"],
          [13, 2, "m"],
        ],
      },
    },
  },
];

const line: Line = {
  id: "duskmolt",
  forms,
  evolvesAt: [22],
  moves: [
    {
      level: 1,
      name: "Shed Scale",
      power: 25,
      accuracy: 100,
      text: "Drops one dark scale for a good day.",
    },
    nip,
    {
      level: 8,
      name: "Gold Beneath",
      power: 40,
      accuracy: 95,
      text: "Shows a glint of what it is turning into.",
    },
    dive,
    {
      level: 15,
      name: "Dusk Flutter",
      power: 50,
      accuracy: 95,
      text: "Flies out when everything else is heading home.",
    },
    {
      level: 23,
      name: "First Light",
      power: 65,
      accuracy: 90,
      text: "Sheds its last dark scale and gives off light instead.",
    },
    {
      level: 34,
      name: "Dawnbreak",
      power: 85,
      accuracy: 85,
      text: "Makes morning come a little earlier for everyone.",
    },
  ],
};

export default line;
