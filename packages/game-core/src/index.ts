// Pure TypeScript simulation (no Babylon, no DOM, no network). Ali owns this package.
export { initPhysics, TICK_DT } from "./physics";
export {
  createRace,
  createFlatRace,
  type Race,
  type RaceConfig,
  type Standing,
} from "./race";
export { KeyboardInput, NEUTRAL_INPUT, type KeyState } from "./input";
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
