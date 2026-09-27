import type { Move } from "@/lib/types";

/**
 * Plain moves any line can know, each weaker than every line's own (§5.5).
 * Shared by reference: these are the only names that repeat across lines.
 */
export const scratch: Move = {
  level: 1,
  name: "Scratch",
  power: 10,
  accuracy: 100,
  text: "A quick swipe with whatever it has for claws.",
};

export const nip: Move = {
  level: 1,
  name: "Nip",
  power: 10,
  accuracy: 100,
  text: "A small bite, mostly to make a point.",
};

export const bump: Move = {
  level: 1,
  name: "Bump",
  power: 10,
  accuracy: 100,
  text: "Walks into it on purpose.",
};

export const peck: Move = {
  level: 1,
  name: "Peck",
  power: 10,
  accuracy: 100,
  text: "Taps at it until something gives.",
};

export const spritz: Move = {
  level: 1,
  name: "Spritz",
  power: 10,
  accuracy: 100,
  text: "Flicks cold water in its face.",
};

export const grind: Move = {
  level: 1,
  name: "Grind",
  power: 10,
  accuracy: 100,
  text: "Turns its teeth against it, one notch at a time.",
};

export const pounce: Move = {
  level: 10,
  name: "Pounce",
  power: 20,
  accuracy: 95,
  text: "Waits, then lands on it all at once.",
};

export const charge: Move = {
  level: 10,
  name: "Charge",
  power: 20,
  accuracy: 95,
  text: "Runs at it head down.",
};

export const roll: Move = {
  level: 10,
  name: "Roll",
  power: 20,
  accuracy: 95,
  text: "Tucks in and rolls straight through.",
};

export const swat: Move = {
  level: 10,
  name: "Swat",
  power: 20,
  accuracy: 95,
  text: "Bats it aside without looking.",
};

export const dive: Move = {
  level: 10,
  name: "Dive",
  power: 20,
  accuracy: 95,
  text: "Drops on it from above.",
};
