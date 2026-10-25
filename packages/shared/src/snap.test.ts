import { describe, expect, test } from "vitest";
import type { SnapMsg } from "./protocol";
import { SNAP_STRIDE, packSnap, unpackSnap } from "./snap";

const s = Math.SQRT1_2;
const snap: SnapMsg = {
  tick: 1234,
  t: 1_729_000_000_123,
  balls: [
    {
      id: "p1",
      p: [12.3456, 0.5, -88.8888],
      q: [0, s, 0, s],
      v: [10.123, -0.4, 3.333],
      h: 1.5708,
      s: -0.734,
      d: -1,
    },
    {
      id: "b2",
      p: [-150.25, 3.75, 401.01],
      q: [0.1, 0.2, 0.3, 0.927],
      v: [0, 0, 0],
      h: -3.1,
    },
  ],
};

describe("snapshot packing", () => {
  test("packs to integers, SNAP_STRIDE per ball", () => {
    const packed = packSnap(snap);
    expect(packed.ids).toEqual(["p1", "b2"]);
    expect(packed.d).toHaveLength(2 * SNAP_STRIDE);
    expect(packed.d.every(Number.isInteger)).toBe(true);
    // quaternions fit Int16
    expect(
      packed.d.every(
        (n, i) =>
          i % SNAP_STRIDE < 3 || i % SNAP_STRIDE > 6 || Math.abs(n) <= 32767,
      ),
    ).toBe(true);
  });

  test("round trip: within a centimeter, a hair of rotation and a milliradian", () => {
    const back = unpackSnap(packSnap(snap));
    expect(back.tick).toBe(snap.tick);
    expect(back.t).toBe(snap.t);
    back.balls.forEach((b, i) => {
      const a = snap.balls[i];
      expect(b.id).toBe(a.id);
      b.p.forEach((v, k) =>
        expect(Math.abs(v - a.p[k])).toBeLessThanOrEqual(0.005),
      );
      b.v.forEach((v, k) =>
        expect(Math.abs(v - a.v[k])).toBeLessThanOrEqual(0.005),
      );
      expect(Math.abs(b.h - a.h)).toBeLessThanOrEqual(0.0005);
      expect(Math.abs(b.s! - (a.s ?? 0))).toBeLessThanOrEqual(0.005);
      expect(b.d).toBe(a.d ?? 0);
      expect(Math.hypot(...b.q)).toBeCloseTo(1, 6); // still a unit quaternion
      const len = Math.hypot(...a.q);
      b.q.forEach((v, k) =>
        expect(Math.abs(v - a.q[k] / len)).toBeLessThan(1e-4),
      );
    });
  });

  test("an empty race packs and unpacks", () => {
    expect(unpackSnap(packSnap({ tick: 1, t: 2, balls: [] }))).toEqual({
      tick: 1,
      t: 2,
      balls: [],
    });
  });
});
