import RAPIER from "@dimforge/rapier3d-compat";
import type { Node, PlatformIO } from "@gltf-transform/core";
import { vec3 } from "gl-matrix";
import { makePath, type TrackPath } from "./path";

export type Vec3 = [number, number, number];
export type Quat = [number, number, number, number];

export interface Spawn {
  slot: number; // 1..8
  pos: Vec3; // on the ground, just behind the start line
  heading: number; // rad, the direction the grid faces
}

export interface Checkpoint {
  index: number; // 0 = the finish line
  section: string; // e.g. "creamery", for overtake events and the standings
  pos: Vec3;
  collider: number; // handle of the sensor gate
}

export interface Respawn {
  checkpoint: number; // a ball returns here after passing this checkpoint
  pos: Vec3;
  heading: number;
}

export interface BoostPad {
  pos: Vec3;
  heading: number; // the impulse goes this way
  power: number;
  collider: number; // handle of the sensor pad
}

export interface Surface {
  kind: string; // "icecream" / "snow" / "ice"
  grip: number; // multiplies the ball's grip while it's inside
  collider: number; // handle of the sensor volume
}

export interface CameraSpot {
  section: string;
  pos: Vec3;
  rot: Quat;
}

/** Everything the race needs from a track: colliders live in the Rapier world, the rest is here. */
export interface TrackData {
  spawns: Spawn[];
  checkpoints: Checkpoint[]; // sorted by index
  respawns: Respawn[];
  items: { pos: Vec3 }[]; // item box positions
  boosts: BoostPad[];
  surfaces: Surface[];
  cameras: CameraSpot[];
  path: TrackPath | null; // the route's centerline, from the `route` marker; null on tracks without one
}

/**
 * Checkpoint gates reach at least this high above their base, m, so no jump clears one and costs a lap. On Happy
 * Valley balls cross the Lion Shrine gates up to 8 m up at normal speed, and 15 m at 1.6× speed; nothing passes overhead.
 */
export const GATE_MIN_HEIGHT = 30;

/**
 * A checkpoint gate's box from its Empty (scale = half-extents), stretched up to GATE_MIN_HEIGHT with its base where
 * it was. Local mode's lap timer uses the same box.
 */
export function gateBox(
  pos: Vec3,
  rot: Quat,
  scale: Vec3,
): { center: Vec3; halfExtents: Vec3 } {
  const [sx, sy, sz] = scale.map((s) => Math.max(Math.abs(s), 0.01));
  const hy = Math.max(sy, GATE_MIN_HEIGHT / 2);
  const up = vec3.transformQuat(vec3.create(), [0, hy - sy, 0], rot);
  return {
    center: [pos[0] + up[0], pos[1] + up[1], pos[2] + up[2]],
    halfExtents: [sx, hy, sz],
  };
}

/** M0 test ground: half-size of the flat square, in meters. Its top surface is at y = 0. */
export const FLAT_GROUND_HALF_SIZE = 50;

/**
 * A flat square with an 8-ball starting grid facing +Z. Stands in for Happy Valley in local mode,
 * and keeps unit tests independent of the map.
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
  return { ...emptyTrack(), spawns };
}

/**
 * Builds the track from happy_valley_col.glb (see the marker table in docs/ASSETS.md):
 * nodes with an `rb` custom property become markers, every other mesh becomes a solid trimesh.
 * io: new NodeIO() on the server, new WebIO() in the browser.
 */
export async function loadTrack(
  world: RAPIER.World,
  glb: Uint8Array,
  io: PlatformIO,
): Promise<TrackData> {
  const doc = await io.readBinary(glb);
  const track = emptyTrack();

  for (const node of doc.getRoot().listNodes()) {
    const extras = node.getExtras() as Record<string, unknown>;
    const pos = node.getWorldTranslation() as Vec3;
    const rot = node.getWorldRotation() as Quat;

    switch (extras.rb) {
      case "spawn":
        track.spawns.push({
          slot: Number(extras.slot),
          pos,
          heading: headingOf(rot),
        });
        break;
      case "checkpoint":
        track.checkpoints.push({
          index: Number(extras.index),
          section: String(extras.section ?? ""),
          pos,
          collider: addGate(
            world,
            node,
            gateBox(pos, rot, node.getWorldScale() as Vec3),
          ).handle,
        });
        break;
      case "respawn":
        track.respawns.push({
          checkpoint: Number(extras.checkpoint),
          pos,
          heading: headingOf(rot),
        });
        break;
      case "item":
        track.items.push({ pos });
        break;
      case "boost":
        track.boosts.push({
          pos,
          heading: headingOf(rot),
          power: Number(extras.power ?? 1),
          collider: addGate(world, node).handle,
        });
        break;
      case "surface":
        for (const verts of worldVertices(node)) {
          const desc =
            RAPIER.ColliderDesc.convexHull(verts.positions) ??
            RAPIER.ColliderDesc.trimesh(verts.positions, verts.indices);
          const c = world.createCollider(
            desc
              .setSensor(true)
              .setActiveEvents(RAPIER.ActiveEvents.COLLISION_EVENTS),
          );
          track.surfaces.push({
            kind: String(extras.kind ?? ""),
            grip: Number(extras.grip ?? 1),
            collider: c.handle,
          });
        }
        break;
      case "camera":
        track.cameras.push({ section: String(extras.section ?? ""), pos, rot });
        break;
      case "route": {
        const path = routeOf(node, extras);
        if (path) track.path = path;
        break;
      }
      default:
        // plain collision mesh (a *_col object); optional friction / restitution custom properties
        for (const verts of worldVertices(node)) {
          world.createCollider(
            trimesh(verts.positions, verts.indices)
              .setFriction(Number(extras.friction ?? 1))
              .setRestitution(Number(extras.restitution ?? 0)),
          );
        }
    }
  }

  track.spawns.sort((a, b) => a.slot - b.slot);
  track.checkpoints.sort((a, b) => a.index - b.index);
  return track;
}

/**
 * Just the route's centerline from a collision track, without building any physics: the big screen's live map
 * needs it, but has no race of its own. Null on tracks without a `route` marker.
 */
export async function readRoute(
  glb: Uint8Array,
  io: PlatformIO,
): Promise<TrackPath | null> {
  const doc = await io.readBinary(glb);
  for (const node of doc.getRoot().listNodes()) {
    const extras = node.getExtras() as Record<string, unknown>;
    if (extras.rb === "route") return routeOf(node, extras);
  }
  return null;
}

/** A boost pad as screens draw it: where its marker is, which way it pushes, and its size across and along, m */
export interface BoostPadMark {
  pos: Vec3;
  heading: number;
  size: [number, number];
}

/** Just the boost pads' markers from a collision track, without building any physics (screens draw the pads) */
export async function readBoostPads(
  glb: Uint8Array,
  io: PlatformIO,
): Promise<BoostPadMark[]> {
  const doc = await io.readBinary(glb);
  return doc
    .getRoot()
    .listNodes()
    .filter((node) => (node.getExtras() as { rb?: unknown }).rb === "boost")
    .map((node) => {
      const [sx, , sz] = node.getWorldScale().map((s) => Math.abs(s)); // half-extents, as for the sensor
      return {
        pos: node.getWorldTranslation() as Vec3,
        heading: headingOf(node.getWorldRotation() as Quat),
        size: [sx * 2, sz * 2] as [number, number],
      };
    });
}

/** A `route` marker's points: x, z pairs in the node's space, flattened [x0, z0, x1, z1, …] */
function routeOf(
  node: Node,
  extras: Record<string, unknown>,
): TrackPath | null {
  const flat = Array.isArray(extras.points) ? extras.points : [];
  const m = node.getWorldMatrix();
  const points: [number, number][] = [];
  for (let i = 0; i + 1 < flat.length; i += 2) {
    const p = vec3.transformMat4(
      vec3.create(),
      [Number(flat[i]), 0, Number(flat[i + 1])],
      m,
    );
    points.push([p[0], p[2]]);
  }
  return points.length >= 2 ? makePath(points) : null;
}

/**
 * Problems that make a track unraceable, for the track test and for checking a fresh export:
 * 8 spawns, checkpoints 0..N-1 with no gaps, and a respawn for every checkpoint.
 */
export function checkTrack(track: TrackData): string[] {
  const problems: string[] = [];
  const slots = track.spawns.map((s) => s.slot).join(",");
  if (slots !== "1,2,3,4,5,6,7,8")
    problems.push(`spawns should be slots 1-8, got [${slots}]`);
  if (track.checkpoints.length < 2)
    problems.push(
      `need at least 2 checkpoints, got ${track.checkpoints.length}`,
    );
  track.checkpoints.forEach((c, i) => {
    if (c.index !== i) problems.push(`checkpoint ${i} is missing`);
  });
  for (const c of track.checkpoints) {
    if (!track.respawns.some((r) => r.checkpoint === c.index))
      problems.push(`no respawn for checkpoint ${c.index}`);
  }
  return problems;
}

function emptyTrack(): TrackData {
  return {
    spawns: [],
    checkpoints: [],
    respawns: [],
    items: [],
    boosts: [],
    surfaces: [],
    cameras: [],
    path: null,
  };
}

/** Forward is the marker's local +Z, which is Blender's local -Y after a +Y-up glTF export. */
function headingOf(rot: Quat): number {
  const fwd = vec3.transformQuat(vec3.create(), [0, 0, 1], rot);
  return Math.atan2(fwd[0], fwd[2]);
}

/** A sensor box from an Empty with Cube display, size 1: its scale is the half-extents (or `box`, for a checkpoint). */
function addGate(
  world: RAPIER.World,
  node: Node,
  box = {
    center: node.getWorldTranslation() as Vec3,
    halfExtents: node
      .getWorldScale()
      .map((s) => Math.max(Math.abs(s), 0.01)) as Vec3,
  },
): RAPIER.Collider {
  const [sx, sy, sz] = box.halfExtents;
  const [x, y, z] = box.center;
  const [qx, qy, qz, qw] = node.getWorldRotation();
  return world.createCollider(
    RAPIER.ColliderDesc.cuboid(sx, sy, sz)
      .setTranslation(x, y, z)
      .setRotation({ x: qx, y: qy, z: qz, w: qw })
      .setSensor(true)
      .setActiveEvents(RAPIER.ActiveEvents.COLLISION_EVENTS),
  );
}

/** Each triangle primitive of the node's mesh, with the node's world matrix applied. */
function worldVertices(
  node: Node,
): { positions: Float32Array; indices: Uint32Array }[] {
  const mesh = node.getMesh();
  if (!mesh) return [];
  const m = node.getWorldMatrix();
  const out: { positions: Float32Array; indices: Uint32Array }[] = [];
  for (const prim of mesh.listPrimitives()) {
    const position = prim.getAttribute("POSITION");
    if (!position || prim.getMode() !== 4) continue; // 4 = TRIANGLES
    const count = position.getCount();
    const positions = new Float32Array(count * 3);
    const p: Vec3 = [0, 0, 0];
    for (let i = 0; i < count; i++) {
      position.getElement(i, p); // handles normalized / quantized accessors
      vec3.transformMat4(p, p, m);
      positions.set(p, i * 3);
    }
    const idx = prim.getIndices()?.getArray();
    const indices = idx
      ? Uint32Array.from(idx)
      : Uint32Array.from({ length: count }, (_, i) => i);
    out.push({ positions, indices });
  }
  return out;
}

/** Fixing internal edges stops a rolling ball from bumping on the seams between triangles. */
function trimesh(
  positions: Float32Array,
  indices: Uint32Array,
): RAPIER.ColliderDesc {
  return RAPIER.ColliderDesc.trimesh(
    positions,
    indices,
    RAPIER.TriMeshFlags.FIX_INTERNAL_EDGES,
  );
}
