import RAPIER from "@dimforge/rapier3d-compat";
import happyValley from "../tracks/happy_valley_world.json";

/**
 * The ground around a track: a board of grass at groundY with holes in it (voids, the dangerous places). The same
 * definition builds the colliders here and the visible board (tools/models/build_world.py), so what you see is what
 * you land on. Leaving the road onto grass respawns you, as falling into a void does.
 */
export interface GroundDef {
  /** Top of the grass, m */
  groundY: number;
  /** Size of a ground cell, m: void edges follow this grid */
  cell: number;
  /** [min x, min z, max x, max z] */
  board: [number, number, number, number];
  voids: { name: string; poly: [number, number][] }[];
}

export const HAPPY_VALLEY_GROUND = happyValley as unknown as GroundDef;

/** How deep the ground colliders reach below the grass, m */
const THICKNESS = 2;

/** Whether (x, z) is inside a polygon (even-odd rule) */
export function insidePoly(poly: [number, number][], x: number, z: number) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, zi] = poly[i];
    const [xj, zj] = poly[j];
    if (zi > z !== zj > z && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi)
      inside = !inside;
  }
  return inside;
}

/** Whether there's grass under (x, z): on the board and not in a void (judged at the cell's center, as built) */
export function solidAt(def: GroundDef, x: number, z: number): boolean {
  const [x0, z0, x1, z1] = def.board;
  if (x < x0 || x >= x1 || z < z0 || z >= z1) return false;
  const cx = x0 + (Math.floor((x - x0) / def.cell) + 0.5) * def.cell;
  const cz = z0 + (Math.floor((z - z0) / def.cell) + 0.5) * def.cell;
  return !def.voids.some((v) => insidePoly(v.poly, cx, cz));
}

/**
 * The solid ground as strips: one per run of solid cells in a row, [min x, min z, max x, max z]. Few strips, so few
 * colliders: a row without a void is one strip.
 */
export function groundStrips(
  def: GroundDef,
): [number, number, number, number][] {
  const [x0, z0, x1, z1] = def.board;
  const cols = Math.round((x1 - x0) / def.cell);
  const rows = Math.round((z1 - z0) / def.cell);
  const strips: [number, number, number, number][] = [];
  for (let r = 0; r < rows; r++) {
    const za = z0 + r * def.cell;
    let start = -1;
    for (let c = 0; c <= cols; c++) {
      const solid =
        c < cols && solidAt(def, x0 + (c + 0.5) * def.cell, za + def.cell / 2);
      if (solid && start < 0) start = c;
      if (!solid && start >= 0) {
        strips.push([
          x0 + start * def.cell,
          za,
          x0 + c * def.cell,
          za + def.cell,
        ]);
        start = -1;
      }
    }
  }
  return strips;
}

/** Adds the ground's colliders to the world; returns their handles (touching one means you've left the road) */
export function createGround(world: RAPIER.World, def: GroundDef): number[] {
  return groundStrips(def).map(([xa, za, xb, zb]) => {
    const c = world.createCollider(
      RAPIER.ColliderDesc.cuboid((xb - xa) / 2, THICKNESS / 2, (zb - za) / 2)
        .setTranslation(
          (xa + xb) / 2,
          def.groundY - THICKNESS / 2,
          (za + zb) / 2,
        )
        .setFriction(1)
        .setActiveEvents(RAPIER.ActiveEvents.COLLISION_EVENTS),
    );
    return c.handle;
  });
}
