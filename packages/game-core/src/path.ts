/**
 * The route's centerline as a closed polyline in the ground plane (game x, z), measured in meters
 * from the finish line in the racing direction. Ranking and bots measure along it; the big screen
 * draws it (Nuris's TrackMap).
 */
export interface TrackPath {
  points: [number, number][];
  /** cumulative[i] = distance from points[0] to points[i] along the route */
  cumulative: number[];
  /** Once round the loop, back to points[0] */
  length: number;
}

export function makePath(points: [number, number][]): TrackPath {
  if (points.length < 2)
    throw new Error("a track path needs at least 2 points");
  const cumulative = [0];
  for (let i = 1; i < points.length; i++)
    cumulative.push(cumulative[i - 1] + dist(points[i - 1], points[i]));
  const length =
    cumulative[points.length - 1] + dist(points[points.length - 1], points[0]);
  return { points, cumulative, length };
}

/**
 * Distance along the route (0 … length) of the point on it nearest to (x, z).
 * With `near`, only route within `window` meters of that distance counts, so a ball on one leg of
 * a hairpin never snaps to the other leg.
 */
export function project(
  path: TrackPath,
  x: number,
  z: number,
  near?: number,
  window = 60,
): number {
  const { points, cumulative, length } = path;
  let best = Infinity;
  let bestS = 0;
  for (let i = 0; i < points.length; i++) {
    const j = (i + 1) % points.length;
    const segLength = j
      ? cumulative[j] - cumulative[i]
      : length - cumulative[i];
    if (near !== undefined) {
      const mid = cumulative[i] + segLength / 2;
      if (loopGap(mid, near, length) > window + segLength / 2) continue;
    }
    const [ax, az] = points[i];
    const [bx, bz] = points[j];
    const dx = bx - ax;
    const dz = bz - az;
    const t = Math.max(
      0,
      Math.min(1, ((x - ax) * dx + (z - az) * dz) / (dx * dx + dz * dz || 1)),
    );
    const d = Math.hypot(ax + dx * t - x, az + dz * t - z);
    if (d < best) {
      best = d;
      bestS = cumulative[i] + segLength * t;
    }
  }
  return bestS % length;
}

/** The point on the route at distance s (any s: it wraps round the loop). */
export function pointAt(path: TrackPath, s: number): [number, number] {
  const { points, cumulative, length } = path;
  const at = ((s % length) + length) % length;
  let lo = 0;
  let hi = points.length - 1;
  while (lo < hi) {
    // the last segment start at or before `at`
    const mid = (lo + hi + 1) >> 1;
    if (cumulative[mid] <= at) lo = mid;
    else hi = mid - 1;
  }
  const j = (lo + 1) % points.length;
  const segLength = (j ? cumulative[j] : length) - cumulative[lo];
  const t = segLength > 0 ? (at - cumulative[lo]) / segLength : 0;
  const [ax, az] = points[lo];
  const [bx, bz] = points[j];
  return [ax + (bx - ax) * t, az + (bz - az) * t];
}

/** Shortest distance between two positions on a loop of this length. */
function loopGap(a: number, b: number, length: number): number {
  const d = Math.abs(a - b) % length;
  return Math.min(d, length - d);
}

function dist(a: [number, number], b: [number, number]): number {
  return Math.hypot(b[0] - a[0], b[1] - a[1]);
}
