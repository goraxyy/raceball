import type { BallSnap, SnapMsg } from "./protocol";

// Snapshot compression (docs/team/rasim-platform.md#m3-hardening): the server sends PackedSnapMsg, ~60 times a
// second to every screen. Small integers cost 1–3 bytes in MessagePack, a float costs 9.

/** Integers per ball in PackedSnapMsg.d */
export const SNAP_STRIDE = 11;
const CM = 100; // positions and velocities in centimeters
const QUAT = 32767; // quaternion components (−1…1) as Int16
const MRAD = 1000; // heading in milliradians

/** server → host + viewers: "snap". unpackSnap() turns it back into a SnapMsg */
export interface PackedSnapMsg {
  tick: number;
  /** Server time in ms */
  t: number;
  /** Ball ids, in the same order as their numbers in d */
  ids: string[];
  /** SNAP_STRIDE integers per ball: position (cm) ×3, quaternion (×32767) ×4, velocity (cm/s) ×3, heading (mrad) */
  d: number[];
}

export function packSnap(snap: SnapMsg): PackedSnapMsg {
  const d: number[] = [];
  for (const b of snap.balls) {
    d.push(
      Math.round(b.p[0] * CM),
      Math.round(b.p[1] * CM),
      Math.round(b.p[2] * CM),
      Math.round(b.q[0] * QUAT),
      Math.round(b.q[1] * QUAT),
      Math.round(b.q[2] * QUAT),
      Math.round(b.q[3] * QUAT),
      Math.round(b.v[0] * CM),
      Math.round(b.v[1] * CM),
      Math.round(b.v[2] * CM),
      Math.round(b.h * MRAD),
    );
  }
  return { tick: snap.tick, t: snap.t, ids: snap.balls.map((b) => b.id), d };
}

export function unpackSnap(msg: PackedSnapMsg): SnapMsg {
  const balls: BallSnap[] = msg.ids.map((id, i) => {
    const o = i * SNAP_STRIDE;
    const d = msg.d;
    const q: BallSnap["q"] = [
      d[o + 3] / QUAT,
      d[o + 4] / QUAT,
      d[o + 5] / QUAT,
      d[o + 6] / QUAT,
    ];
    const len = Math.hypot(...q) || 1; // rounding nudges the length off 1: renormalize
    return {
      id,
      p: [d[o] / CM, d[o + 1] / CM, d[o + 2] / CM],
      q: [q[0] / len, q[1] / len, q[2] / len, q[3] / len],
      v: [d[o + 7] / CM, d[o + 8] / CM, d[o + 9] / CM],
      h: d[o + 10] / MRAD,
    };
  });
  return { tick: msg.tick, t: msg.t, balls };
}
