import RAPIER from "@dimforge/rapier3d-compat";

/** The only timestep the simulation runs at. Never pass a variable dt to Rapier. */
export const TICK_DT = 1 / 60;

let ready: Promise<void> | undefined;

/** Loads the Rapier WASM. Safe to call many times; it only loads once. */
export function initPhysics(): Promise<void> {
  ready ??= RAPIER.init();
  return ready;
}

/** Call after initPhysics() has resolved. */
export function createWorld(): RAPIER.World {
  const world = new RAPIER.World({ x: 0, y: -9.81, z: 0 });
  world.timestep = TICK_DT;
  return world;
}
