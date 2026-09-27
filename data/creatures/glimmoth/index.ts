import type { Creature, Line } from "@/lib/types";
import { light } from "../elements";
import {
  bump,
  dive,
  glimmer,
  lanternHold,
  mothToIt,
  neverOut,
  nightLight,
} from "../moves";
import { OUTLINE } from "../pixels";

const forms: Creature[] = [
  {
    id: "glimmoth",
    name: "Glimmoth",
    blurb:
      "Only comes out after a day you finished. Nobody knows how it knows.",
    elements: [light],
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
    elements: [light],
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
  moves: [
    [1, glimmer],
    [1, bump],
    [7, mothToIt],
    [10, dive],
    [14, lanternHold],
    [19, nightLight],
    [30, neverOut],
  ],
};

export default line;
