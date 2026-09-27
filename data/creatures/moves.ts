/**
 * Every move, stated once so any line can learn it; the line says at what level (§5.5).
 * The plain ones come first: each weaker than every line's own, and in `COMMON_MOVES`.
 */

import type { Move } from "@/lib/types";
import {
  dark,
  earth,
  fire,
  grass,
  ice,
  light,
  metal,
  might,
  spirit,
  water,
  wind,
  normal,
} from "./elements";

export const scratch: Move = {
  name: "Scratch",
  element: normal,
  power: 10,
  accuracy: 100,
  text: "A quick swipe with whatever it has for claws.",
};

export const nip: Move = {
  name: "Nip",
  element: normal,
  power: 10,
  accuracy: 100,
  text: "A small bite, mostly to make a point.",
};

export const bump: Move = {
  name: "Bump",
  element: normal,
  power: 10,
  accuracy: 100,
  text: "Walks into it on purpose.",
};

export const peck: Move = {
  name: "Peck",
  element: normal,
  power: 10,
  accuracy: 100,
  text: "Taps at it until something gives.",
};

export const spritz: Move = {
  name: "Spritz",
  element: normal,
  power: 10,
  accuracy: 100,
  text: "Flicks cold water in its face.",
};

export const grind: Move = {
  name: "Grind",
  element: normal,
  power: 10,
  accuracy: 100,
  text: "Turns its teeth against it, one notch at a time.",
};

export const pounce: Move = {
  name: "Pounce",
  element: normal,
  power: 20,
  accuracy: 95,
  text: "Waits, then lands on it all at once.",
};

export const charge: Move = {
  name: "Charge",
  element: normal,
  power: 20,
  accuracy: 95,
  text: "Runs at it head down.",
};

export const roll: Move = {
  name: "Roll",
  element: normal,
  power: 20,
  accuracy: 95,
  text: "Tucks in and rolls straight through.",
};

export const swat: Move = {
  name: "Swat",
  element: normal,
  power: 20,
  accuracy: 95,
  text: "Bats it aside without looking.",
};

export const dive: Move = {
  name: "Dive",
  element: normal,
  power: 20,
  accuracy: 95,
  text: "Drops on it from above.",
};

export const COMMON_MOVES = [
  scratch,
  nip,
  bump,
  peck,
  spritz,
  grind,
  pounce,
  charge,
  roll,
  swat,
  dive,
];

export const notch: Move = {
  name: "Notch",
  element: metal,
  power: 25,
  accuracy: 100,
  text: "A notch one way, a notch the other.",
};

export const justSo: Move = {
  name: "Just So",
  element: metal,
  power: 40,
  accuracy: 95,
  text: "Clicks once everything is where you left it.",
};

export const putBack: Move = {
  name: "Put Back",
  element: metal,
  power: 65,
  accuracy: 90,
  text: "Returns whatever was nudged out of place.",
};

export const fineTune: Move = {
  name: "Fine Tune",
  element: metal,
  power: 95,
  accuracy: 85,
  text: "Turns the smallest thing until it clicks.",
};

export const clunk: Move = {
  name: "Clunk",
  element: metal,
  power: 25,
  accuracy: 100,
  text: "Snaps back together after checking its seams.",
};

export const squareUp: Move = {
  name: "Square Up",
  element: metal,
  power: 40,
  accuracy: 95,
  text: "Makes sure every tile is square.",
};

export const stack: Move = {
  name: "Stack",
  element: metal,
  power: 65,
  accuracy: 90,
  text: "Sets each day squarely on the last.",
};

export const loadbearing: Move = {
  name: "Load-Bearing",
  element: metal,
  power: 95,
  accuracy: 85,
  text: "Nothing it has built comes loose.",
};

export const fillIn: Move = {
  name: "Fill In",
  element: metal,
  power: 25,
  accuracy: 100,
  text: "Fills in one cell of the day.",
};

export const columnByColumn: Move = {
  name: "Column by Column",
  element: metal,
  power: 40,
  accuracy: 95,
  text: "Works down a week, then starts the next.",
};

export const deepGreen: Move = {
  name: "Deep Green",
  element: metal,
  power: 65,
  accuracy: 90,
  text: "A full cell turns the brightest green it has.",
};

export const yearAtAGlance: Move = {
  name: "Year at a Glance",
  element: metal,
  power: 95,
  accuracy: 85,
  text: "Has filled enough cells to see the whole year.",
};

export const morningDew: Move = {
  name: "Morning Dew",
  element: grass,
  power: 25,
  accuracy: 100,
  text: "Catches the first drop of the day on its leaf and keeps it.",
};

export const leafCount: Move = {
  name: "Leaf Count",
  element: grass,
  power: 35,
  accuracy: 95,
  text: "Counts its leaves out loud. There is always one more than yesterday.",
};

export const selfwater: Move = {
  name: "Self-Water",
  element: grass,
  power: 50,
  accuracy: 95,
  text: "Tips its own bloom over its roots. Nobody had to remind it.",
};

export const deepRoots: Move = {
  name: "Deep Roots",
  element: grass,
  power: 60,
  accuracy: 90,
  text: "Holds fast through a bad week. The roots were growing the whole time.",
};

export const harvestGift: Move = {
  name: "Harvest Gift",
  element: grass,
  power: 80,
  accuracy: 85,
  text: "Drops a ripe fruit for whoever showed up today.",
};

export const warmTail: Move = {
  name: "Warm Tail",
  element: fire,
  power: 25,
  accuracy: 100,
  text: "Wags a tail that glows one shade warmer for every day of the streak.",
};

export const kindle: Move = {
  name: "Kindle",
  element: fire,
  power: 35,
  accuracy: 100,
  text: "Breathes on a cold start until it catches.",
};

export const steadyFlame: Move = {
  name: "Steady Flame",
  element: fire,
  power: 50,
  accuracy: 95,
  text: "Gutters some days, and never two in a row.",
};

export const hearthGuard: Move = {
  name: "Hearth Guard",
  element: fire,
  power: 65,
  accuracy: 90,
  text: "Curls round the fire so the streak lasts the night.",
};

export const dawnRoar: Move = {
  name: "Dawn Roar",
  element: fire,
  power: 80,
  accuracy: 85,
  text: "Roars the sun up. It has not been late once.",
};

export const oneDrop: Move = {
  name: "One Drop",
  element: water,
  power: 25,
  accuracy: 100,
  text: "Falls exactly once a day, and makes it count.",
};

export const puddleUp: Move = {
  name: "Puddle Up",
  element: water,
  power: 35,
  accuracy: 100,
  text: "Gathers yesterday's drops into something you can stand in.",
};

export const rippleOut: Move = {
  name: "Ripple Out",
  element: water,
  power: 50,
  accuracy: 95,
  text: "Each ripple goes a little further than the last.",
};

export const keepEveryDrop: Move = {
  name: "Keep Every Drop",
  element: water,
  power: 60,
  accuracy: 90,
  text: "Nothing it catches is ever spilled.",
};

export const stillWater: Move = {
  name: "Still Water",
  element: water,
  power: 80,
  accuracy: 90,
  text: "Goes so calm that fish move in.",
};

export const keepStill: Move = {
  name: "Keep Still",
  element: earth,
  power: 25,
  accuracy: 100,
  text: "Stays exactly where it said it would be.",
};

export const mossCoat: Move = {
  name: "Moss Coat",
  element: grass,
  power: 40,
  accuracy: 95,
  text: "Grows a coat of moss by not fidgeting.",
};

export const slowMarch: Move = {
  name: "Slow March",
  element: earth,
  power: 50,
  accuracy: 95,
  text: "Arrives late to nothing, ever.",
};

export const shellGarden: Move = {
  name: "Shell Garden",
  element: grass,
  power: 60,
  accuracy: 90,
  text: "Lets a small garden take root on its back.",
};

export const oldGrowth: Move = {
  name: "Old Growth",
  element: grass,
  power: 85,
  accuracy: 85,
  text: "Keeps still for a season and blooms for the next.",
};

export const firstBreeze: Move = {
  name: "First Breeze",
  element: wind,
  power: 25,
  accuracy: 100,
  text: "Catches the day's first wind before anyone is up.",
};

export const tailwind: Move = {
  name: "Tailwind",
  element: wind,
  power: 35,
  accuracy: 95,
  text: "Pushes you the last few steps home.",
};

export const updraft: Move = {
  name: "Updraft",
  element: wind,
  power: 50,
  accuracy: 95,
  text: "Rises on whatever the day throws at it.",
};

export const makeWeather: Move = {
  name: "Make Weather",
  element: wind,
  power: 65,
  accuracy: 90,
  text: "Stops waiting for a breeze and starts one.",
};

export const homeBeforeDark: Move = {
  name: "Home Before Dark",
  element: wind,
  power: 85,
  accuracy: 85,
  text: "However far it goes, it is back by nightfall.",
};

export const doItTwice: Move = {
  name: "Do It Twice",
  element: earth,
  power: 25,
  accuracy: 100,
  text: "Does everything twice, just to be sure.",
};

export const skipStone: Move = {
  name: "Skip Stone",
  element: earth,
  power: 40,
  accuracy: 95,
  text: "Bounces across a bad day without sinking.",
};

export const balanceAct: Move = {
  name: "Balance Act",
  element: earth,
  power: 55,
  accuracy: 95,
  text: "Keeps a pebble on its head. Drops it. Tries again.",
};

export const stackUp: Move = {
  name: "Stack Up",
  element: earth,
  power: 70,
  accuracy: 90,
  text: "Adds one more stone. The pile has never fallen.",
};

export const cairnKeep: Move = {
  name: "Cairn Keep",
  element: earth,
  power: 85,
  accuracy: 85,
  text: "Holds every stone a traveller ever left on it.",
};

export const glimmer: Move = {
  name: "Glimmer",
  element: light,
  power: 25,
  accuracy: 100,
  text: "Lights up after a finished day, and only then.",
};

export const mothToIt: Move = {
  name: "Moth to It",
  element: light,
  power: 35,
  accuracy: 95,
  text: "Finds the one lamp still on and keeps it company.",
};

export const lanternHold: Move = {
  name: "Lantern Hold",
  element: light,
  power: 50,
  accuracy: 95,
  text: "Stores a finished day in its lantern for later.",
};

export const nightLight: Move = {
  name: "Night Light",
  element: light,
  power: 55,
  accuracy: 90,
  text: "Lights the way back for a day that nearly got away.",
};

export const neverOut: Move = {
  name: "Never Out",
  element: light,
  power: 75,
  accuracy: 90,
  text: "Has kept so many finished days that it cannot go dark.",
};

export const coldPlunge: Move = {
  name: "Cold Plunge",
  element: water,
  power: 25,
  accuracy: 100,
  text: "Jumps in first and never complains.",
};

export const shiverOff: Move = {
  name: "Shiver Off",
  element: ice,
  power: 35,
  accuracy: 95,
  text: "Shakes the cold off and says it feels great.",
};

export const iceBreak: Move = {
  name: "Ice Break",
  element: ice,
  power: 45,
  accuracy: 95,
  text: "Cracks the ice when the pond freezes over, and swims anyway.",
};

export const rimeBeak: Move = {
  name: "Rime Beak",
  element: ice,
  power: 60,
  accuracy: 90,
  text: "Cuts through any excuse that has frozen solid.",
};

export const morningSwim: Move = {
  name: "Morning Swim",
  element: water,
  power: 80,
  accuracy: 90,
  text: "Has not missed one in a year, ice or no ice.",
};

export const shedScale: Move = {
  name: "Shed Scale",
  element: dark,
  power: 25,
  accuracy: 100,
  text: "Drops one dark scale for a good day.",
};

export const goldBeneath: Move = {
  name: "Gold Beneath",
  element: light,
  power: 40,
  accuracy: 95,
  text: "Shows a glint of what it is turning into.",
};

export const duskFlutter: Move = {
  name: "Dusk Flutter",
  element: dark,
  power: 50,
  accuracy: 95,
  text: "Flies out when everything else is heading home.",
};

export const firstLight: Move = {
  name: "First Light",
  element: light,
  power: 65,
  accuracy: 90,
  text: "Sheds its last dark scale and gives off light instead.",
};

export const dawnbreak: Move = {
  name: "Dawnbreak",
  element: light,
  power: 85,
  accuracy: 85,
  text: "Makes morning come a little earlier for everyone.",
};

export const peekOut: Move = {
  name: "Peek Out",
  element: earth,
  power: 25,
  accuracy: 100,
  text: "Lifts the lid to check before coming out.",
};

export const thousandSunrises: Move = {
  name: "Thousand Sunrises",
  element: earth,
  power: 35,
  accuracy: 100,
  text: "Waits it out. It has done this before.",
};

export const staffGrow: Move = {
  name: "Staff Grow",
  element: might,
  power: 50,
  accuracy: 95,
  text: "Its staff gets a little longer every day it trains.",
};

export const measureUp: Move = {
  name: "Measure Up",
  element: might,
  power: 70,
  accuracy: 90,
  text: "Checks the staff against yesterday's. It is longer.",
};

export const cloudLeap: Move = {
  name: "Cloud Leap",
  element: wind,
  power: 85,
  accuracy: 85,
  text: "One somersault, a hundred thousand li, and back by breakfast.",
};

export const spineSnap: Move = {
  name: "Spine Snap",
  element: might,
  power: 25,
  accuracy: 100,
  text: "Breaks a spine on the day's first problem.",
};

export const growBack: Move = {
  name: "Grow Back",
  element: might,
  power: 35,
  accuracy: 95,
  text: "Regrows overnight, a little harder than before.",
};

export const quillVolley: Move = {
  name: "Quill Volley",
  element: might,
  power: 55,
  accuracy: 95,
  text: "Throws every spine it has at the problem in front of it.",
};

export const hardened: Move = {
  name: "Hardened",
  element: might,
  power: 70,
  accuracy: 90,
  text: "Nothing breaks it the same way twice.",
};

export const blackThorn: Move = {
  name: "Black Thorn",
  element: dark,
  power: 90,
  accuracy: 85,
  text: "Throws itself at the day with every spine it ever lost.",
};

export const puddleFlex: Move = {
  name: "Puddle Flex",
  element: water,
  power: 25,
  accuracy: 100,
  text: "Flexes at its reflection. Nothing there yet.",
};

export const oneMoreRep: Move = {
  name: "One More Rep",
  element: might,
  power: 35,
  accuracy: 100,
  text: "Always finds one more in the tank.",
};

export const repCroak: Move = {
  name: "Rep Croak",
  element: water,
  power: 55,
  accuracy: 90,
  text: "Croaks once per rep. Has never lost count.",
};

export const legDay: Move = {
  name: "Leg Day",
  element: might,
  power: 75,
  accuracy: 90,
  text: "Never skips it.",
};

export const sevendaySplit: Move = {
  name: "Seven-Day Split",
  element: metal,
  power: 90,
  accuracy: 85,
  text: "Never skips the other six either.",
};

export const vineSnare: Move = {
  name: "Vine Snare",
  element: grass,
  power: 25,
  accuracy: 100,
  text: "Catches 'tomorrow' before it gets away.",
};

export const thornReading: Move = {
  name: "Thorn Reading",
  element: spirit,
  power: 40,
  accuracy: 95,
  text: "Reads today's plan off the thorns of its vine.",
};

export const nextLine: Move = {
  name: "Next Line",
  element: spirit,
  power: 50,
  accuracy: 95,
  text: "Says your excuse a second before you do.",
};

export const sunRipple: Move = {
  name: "Sun Ripple",
  element: light,
  power: 60,
  accuracy: 90,
  text: "Runs sunlight down its vines into whatever they hold.",
};

export const noonPulse: Move = {
  name: "Noon Pulse",
  element: light,
  power: 80,
  accuracy: 85,
  text: "Sends a pulse of daylight through every excuse at once.",
};

export const quickJab: Move = {
  name: "Quick Jab",
  element: might,
  power: 25,
  accuracy: 100,
  text: "Lands a jab before you finish blinking.",
};

export const hundredJabs: Move = {
  name: "Hundred Jabs",
  element: might,
  power: 40,
  accuracy: 95,
  text: "Then lands the other ninety-nine.",
};

export const sharpEye: Move = {
  name: "Sharp Eye",
  element: spirit,
  power: 50,
  accuracy: 95,
  text: "Spots the one thing that needed doing and does it.",
};

export const stillMoment: Move = {
  name: "Still Moment",
  element: spirit,
  power: 65,
  accuracy: 90,
  text: "Holds the world still for a few seconds of its own.",
};

export const doneAlready: Move = {
  name: "Done Already",
  element: spirit,
  power: 80,
  accuracy: 85,
  text: "When time moves again, the habit is done.",
};

export const patchUp: Move = {
  name: "Patch Up",
  element: earth,
  power: 25,
  accuracy: 100,
  text: "Mends one thing that broke yesterday.",
};

export const stitchBack: Move = {
  name: "Stitch Back",
  element: spirit,
  power: 40,
  accuracy: 95,
  text: "Puts a missed day back where it fits.",
};

export const piecesHome: Move = {
  name: "Pieces Home",
  element: earth,
  power: 50,
  accuracy: 95,
  text: "Sends every broken piece flying back into place.",
};

export const hairCheck: Move = {
  name: "Hair Check",
  element: spirit,
  power: 60,
  accuracy: 90,
  text: "Checks its hair. Say nothing about the hair.",
};

export const goodAsNew: Move = {
  name: "Good as New",
  element: spirit,
  power: 85,
  accuracy: 85,
  text: "Leaves whatever it touches as it was before it broke.",
};

export const leafToWing: Move = {
  name: "Leaf to Wing",
  element: grass,
  power: 25,
  accuracy: 100,
  text: "Turns a dull leaf into a butterfly.",
};

export const lifeSpark: Move = {
  name: "Life Spark",
  element: grass,
  power: 40,
  accuracy: 95,
  text: "Gives whatever it touches a pulse of its own.",
};

export const dreamBig: Move = {
  name: "Dream Big",
  element: spirit,
  power: 50,
  accuracy: 95,
  text: "Has a dream, and works on it every day.",
};

export const backToZero: Move = {
  name: "Back to Zero",
  element: dark,
  power: 65,
  accuracy: 90,
  text: "Sends an excuse back to where it started.",
};

export const noArrival: Move = {
  name: "No Arrival",
  element: dark,
  power: 85,
  accuracy: 85,
  text: "An excuse sent its way keeps setting out and never gets there.",
};

export const looseThread: Move = {
  name: "Loose Thread",
  element: spirit,
  power: 25,
  accuracy: 100,
  text: "Comes a little undone on a hard day.",
};

export const tieTight: Move = {
  name: "Tie Tight",
  element: might,
  power: 40,
  accuracy: 95,
  text: "Ties itself back together tighter than before.",
};

export const stringLine: Move = {
  name: "String Line",
  element: spirit,
  power: 50,
  accuracy: 95,
  text: "Pays out a thread to find its way back tomorrow.",
};

export const dayNet: Move = {
  name: "Day Net",
  element: might,
  power: 70,
  accuracy: 90,
  text: "Unwinds into a net and catches the whole day.",
};

export const walkFree: Move = {
  name: "Walk Free",
  element: spirit,
  power: 85,
  accuracy: 85,
  text: "Winds back up and does as it pleases.",
};

export const spiralShell: Move = {
  name: "Spiral Shell",
  element: spirit,
  power: 25,
  accuracy: 100,
  text: "Adds a turn to its shell, a little wider than the last.",
};

export const nailSpin: Move = {
  name: "Nail Spin",
  element: wind,
  power: 40,
  accuracy: 95,
  text: "Spins something small until it goes further than it should.",
};

export const goldenTurn: Move = {
  name: "Golden Turn",
  element: spirit,
  power: 50,
  accuracy: 95,
  text: "Finds the one angle that makes the turn work.",
};

export const endlessSpin: Move = {
  name: "Endless Spin",
  element: wind,
  power: 70,
  accuracy: 90,
  text: "Sets something turning that never stops.",
};

export const thankYou: Move = {
  name: "Thank You",
  element: spirit,
  power: 90,
  accuracy: 85,
  text: "Never forgets to say it.",
};

export const bubbleUp: Move = {
  name: "Bubble Up",
  element: water,
  power: 25,
  accuracy: 100,
  text: "Wraps a bad habit in a bubble.",
};

export const plunder: Move = {
  name: "Plunder",
  element: spirit,
  power: 40,
  accuracy: 95,
  text: "Takes one bad habit a day and does not give it back.",
};

export const floatAway: Move = {
  name: "Float Away",
  element: water,
  power: 50,
  accuracy: 95,
  text: "Lets the bubble drift off with whatever is inside.",
};

export const thinBubble: Move = {
  name: "Thin Bubble",
  element: spirit,
  power: 70,
  accuracy: 90,
  text: "Blows a bubble so thin it isn't really there.",
};

export const whoAmI: Move = {
  name: "Who Am I",
  element: spirit,
  power: 90,
  accuracy: 85,
  text: "Still wonders. Keeps going anyway.",
};

export const heavyDrop: Move = {
  name: "Heavy Drop",
  element: water,
  power: 25,
  accuracy: 100,
  text: "A single raindrop that lands like a stone.",
};

export const pressIn: Move = {
  name: "Press In",
  element: spirit,
  power: 40,
  accuracy: 95,
  text: "Pushes a habit into place and holds it there.",
};

export const downpour: Move = {
  name: "Downpour",
  element: water,
  power: 50,
  accuracy: 95,
  text: "Rains hard enough that nothing moves until it stops.",
};

export const exactAim: Move = {
  name: "Exact Aim",
  element: spirit,
  power: 75,
  accuracy: 90,
  text: "Every drop lands exactly where it means to.",
};

export const stayPressed: Move = {
  name: "Stay Pressed",
  element: spirit,
  power: 90,
  accuracy: 85,
  text: "What it presses stays pressed.",
};
