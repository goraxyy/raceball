// Small vector/quaternion helpers for interpolating snapshots. Quaternions are [x, y, z, w].

export type Vec3 = [number, number, number];
export type Quat = [number, number, number, number];

export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

export const lerpVec = (a: Vec3, b: Vec3, t: number): Vec3 => [
  lerp(a[0], b[0], t),
  lerp(a[1], b[1], t),
  lerp(a[2], b[2], t),
];

/** Lerp an angle the short way round (radians) */
export function lerpAngle(a: number, b: number, t: number): number {
  const d = Math.atan2(Math.sin(b - a), Math.cos(b - a));
  return a + d * t;
}

/** Spherical lerp, taking the shorter path */
export function slerp(a: Quat, b: Quat, t: number): Quat {
  let [bx, by, bz, bw] = b;
  let cos = a[0] * bx + a[1] * by + a[2] * bz + a[3] * bw;
  if (cos < 0) {
    cos = -cos;
    bx = -bx;
    by = -by;
    bz = -bz;
    bw = -bw;
  }
  let wa: number;
  let wb: number;
  if (cos > 0.9995) {
    // Nearly identical: lerp, then normalize
    wa = 1 - t;
    wb = t;
  } else {
    const theta = Math.acos(cos);
    const sin = Math.sin(theta);
    wa = Math.sin((1 - t) * theta) / sin;
    wb = Math.sin(t * theta) / sin;
  }
  const q: Quat = [
    wa * a[0] + wb * bx,
    wa * a[1] + wb * by,
    wa * a[2] + wb * bz,
    wa * a[3] + wb * bw,
  ];
  const len = Math.hypot(...q);
  return [q[0] / len, q[1] / len, q[2] / len, q[3] / len];
}
