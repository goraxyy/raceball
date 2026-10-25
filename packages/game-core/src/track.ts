import RAPIER from "@dimforge/rapier3d-compat";

export interface Spawn {
  slot: number; // 1..8
  pos: [number, number, number]; // on the ground, just behind the start line
  heading: number; // rad, the direction the grid faces
}

/** Everything the race needs from a track. Grows with loadTrack() in M1 (checkpoints, respawns, items…). */
export interface TrackData {
  spawns: Spawn[];
}

/** M0 test ground: half-size of the flat square, in meters. Its top surface is at y = 0. */
export const FLAT_GROUND_HALF_SIZE = 50;

/**
 * A flat square with an 8-ball starting grid facing +Z. Stands in for Happy Valley until
 * loadTrack() reads happy_valley_col.glb, and keeps unit tests independent of the map.
 */
export function createFlatTrack(world: RAPIER.World): TrackData {
  world.createCollider(
    RAPIER.ColliderDesc.cuboid(
      FLAT_GROUND_HALF_SIZE,
      0.1,
      FLAT_GROUND_HALF_SIZE,
    )
      .setTranslation(0, -0.1, 0)
      .setFriction(1.0),
  );
  const spawns: Spawn[] = [];
  for (let i = 0; i < 8; i++) {
    // two staggered columns, 3 m between rows
    spawns.push({
      slot: i + 1,
      pos: [
        i % 2 === 0 ? -1.5 : 1.5,
        0,
        -3 * Math.floor(i / 2) - (i % 2) * 1.5,
      ],
      heading: 0,
    });
  }
  return { spawns };
}
