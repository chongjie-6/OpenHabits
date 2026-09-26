import type { Creature, Line } from "@/lib/types";
import { OUTLINE } from "../pixels";

const forms: Creature[] = [
  {
    id: "glimmoth",
    name: "Glimmoth",
    blurb:
      "Only comes out after a day you finished. Nobody knows how it knows.",
    colors: { o: OUTLINE, w: "#f7e27a", b: "#9b7fd4", l: "#4a3a6b" },
    sprite: [
      "............",
      ".oo......oo.",
      "obbo.oo.obbo",
      "obbbollobbbo",
      "obwbollobwbo",
      "obbbollobbbo",
      ".obbollobbo.",
      ".obbollobbo.",
      "..oboollobo.",
      ".....oo.....",
      "............",
      "............",
    ],
    rig: {
      parts: { wingL: [0, 1, 4, 8], wingR: [8, 1, 4, 8] },
      fx: {
        glint: [[10, 10, "w"]],
        rays: [
          [9, 10, "w"],
          [11, 10, "w"],
          [10, 9, "w"],
          [10, 11, "w"],
        ],
      },
    },
  },
  {
    id: "lanthorn",
    name: "Lanthorn",
    blurb:
      "Grew out of a Glimmoth. Keeps every finished day in its lantern, so it never goes out.",
    colors: {
      o: OUTLINE,
      w: "#f7e27a",
      b: "#9b7fd4",
      m: "#c3b0ec",
      l: "#4a3a6b",
      g: "#ffcf5c",
    },
    sprite: [
      ".....o....o.....",
      ".oo...o..o...oo.",
      "obmo...oo...ombo",
      "obmbo.ollo.obmbo",
      "obwwbbollobbwwbo",
      "obwwbbollobbwwbo",
      "obbbbbollobbbbbo",
      ".obbbmollombbbo.",
      "..ooooollooooo..",
      "..obbbollobbbo..",
      ".obwbbollobbwbo.",
      ".obbbboggobbbbo.",
      "..obbboggobbbo..",
      "...ooooggoooo...",
      "......oggo......",
      ".......oo.......",
    ],
    rig: {
      parts: { wingL: [0, 1, 6, 13], wingR: [10, 1, 6, 13] },
      fx: {
        halo: [
          [6, 15, "g"],
          [9, 15, "g"],
          [7, 16, "g"],
          [8, 16, "g"],
        ],
      },
    },
  },
];

const line: Line = {
  id: "glimmoth",
  forms,
  evolvesAt: [18],
  kind: "fey",
  alignment: "neutral good",
  abilities: { str: 8, dex: 14, con: 10, int: 12, wis: 13, cha: 15 },
  skills: ["Insight", "Stealth"],
  moves: [
    {
      level: 1,
      name: "Glimmer",
      text: "Lights up after a finished day, and only then.",
      use: "action",
      ability: "cha",
      against: "dex",
      dice: "1d8 radiant",
    },
    {
      level: 7,
      name: "Moth to It",
      text: "Finds the one lamp still on and keeps it company.",
      use: "bonus",
      ability: "dex",
    },
    {
      level: 14,
      name: "Lantern Hold",
      text: "Stores a finished day in its lantern for later.",
      use: "bonus",
      ability: "cha",
      dice: "1d8 healing",
      uses: "3/Day",
    },
    {
      level: 19,
      name: "Night Light",
      text: "Lights the way back for a day that nearly got away.",
      use: "action",
      ability: "cha",
      dice: "2d8 healing",
      uses: "1/Day",
    },
    {
      level: 30,
      name: "Never Out",
      text: "Has kept so many finished days that it cannot go dark.",
      use: "trait",
      ability: "cha",
    },
  ],
};

export default line;
