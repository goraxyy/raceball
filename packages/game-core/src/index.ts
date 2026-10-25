// Pure TypeScript simulation (no Babylon, no DOM, no network). Ali owns this package.
export { initPhysics, TICK_DT } from "./physics";
export {
  createRace,
  createFlatRace,
  type ItemBoxState,
  type PuddleState,
  type Race,
  type RaceConfig,
  type Standing,
} from "./race";
export { ITEM_ODDS, oddsRow, rollItem } from "./items";
export { KeyboardInput, NEUTRAL_INPUT, type KeyState } from "./input";
export { makePath, pointAt, project, type TrackPath } from "./path";
export { BALL_RADIUS } from "./ball";
export {
  checkTrack,
  createFlatTrack,
  FLAT_GROUND_HALF_SIZE,
  loadTrack,
  type BoostPad,
  type CameraSpot,
  type Checkpoint,
  type Respawn,
  type Spawn,
  type Surface,
  type TrackData,
} from "./track";
export { tuning, type Tuning } from "./tuning";
