import type { Creature, Line } from "@/lib/types";
import { OUTLINE, SHINE } from "../pixels";

const forms: Creature[] = [
  {
    id: "duskmolt",
    name: "Duskmolt",
    blurb: "Sheds one dark scale for every good day. Underneath, it is gold.",
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
  kind: "dragon",
  alignment: "neutral",
  abilities: { str: 10, dex: 14, con: 12, int: 8, wis: 13, cha: 15 },
  skills: ["Insight", "Stealth"],
  moves: [
    {
      level: 1,
      name: "Shed Scale",
      text: "Drops one dark scale for a good day.",
      use: "trait",
      ability: "cha",
    },
    {
      level: 8,
      name: "Gold Beneath",
      text: "Shows a glint of what it is turning into.",
      use: "action",
      ability: "cha",
      against: "con",
      dice: "1d8 radiant",
    },
    {
      level: 15,
      name: "Dusk Flutter",
      text: "Flies out when everything else is heading home.",
      use: "bonus",
      ability: "dex",
    },
    {
      level: 23,
      name: "First Light",
      text: "Sheds its last dark scale and gives off light instead.",
      use: "action",
      ability: "cha",
      against: "dex",
      dice: "3d6 radiant",
      uses: "Recharge 5–6",
    },
    {
      level: 34,
      name: "Dawnbreak",
      text: "Makes morning come a little earlier for everyone.",
      use: "action",
      ability: "cha",
      against: "con",
      dice: "4d8 radiant",
      uses: "1/Day",
    },
  ],
};

export default line;
