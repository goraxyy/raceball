// Values every app agrees on. protocol.ts is added after the protocol meeting.
export const SERVER_PORT = 2567;
export const WEB_PORT = 5173;
export const PAD_PORT = 5174;

/** Players per race (laptop + phone-only) */
export const MAX_PLAYERS = 8;
/** Default race length; demo races use 1 */
export const DEFAULT_LAPS = 3;

/** Player colors by slot (art bible in docs/ASSETS.md). Colorblind-safe, from Okabe-Ito. */
export const PLAYER_COLORS = [
  "#E69F00", // orange
  "#56B4E9", // sky blue
  "#009E73", // bluish green
  "#F0E442", // yellow
  "#0072B2", // blue
  "#D55E00", // vermillion
  "#CC79A7", // reddish purple
  "#FFFFFF", // white
] as const;

/** Player shapes by slot. Always shown with the slot's color, so color is never the only signal. */
export const PLAYER_SHAPES = [
  "circle",
  "square",
  "triangle",
  "star",
  "diamond",
  "cross",
  "pentagon",
  "hexagon",
] as const;

export type PlayerShape = (typeof PLAYER_SHAPES)[number];

/** Ball skins: the eight planets, one per player in a race (models/ball_<id>.glb) */
export const PLANETS = [
  "mercury",
  "venus",
  "earth",
  "mars",
  "jupiter",
  "saturn",
  "uranus",
  "neptune",
] as const;

export type Planet = (typeof PLANETS)[number];
