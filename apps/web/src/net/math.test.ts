import { describe, expect, test } from "vitest";
import { lerpAngle, lerpVec, slerp, type Quat } from "./math";

const yaw = (a: number): Quat => [0, Math.sin(a / 2), 0, Math.cos(a / 2)];

describe("math", () => {
  test("lerpVec", () => {
    expect(lerpVec([0, 0, 0], [2, 4, -6], 0.5)).toEqual([1, 2, -3]);
  });

  test("lerpAngle goes the short way across ±π", () => {
    const mid = lerpAngle(Math.PI - 0.1, -Math.PI + 0.1, 0.5);
    expect(Math.abs(Math.abs(mid) - Math.PI)).toBeLessThan(1e-9);
  });

  test("slerp halfway between two yaws is the middle yaw", () => {
    const q = slerp(yaw(0), yaw(1), 0.5);
    yaw(0.5).forEach((v, i) => expect(q[i]).toBeCloseTo(v));
  });

  test("slerp takes the shorter path when signs are flipped", () => {
    const b = yaw(1).map((v) => -v) as Quat; // same rotation, opposite sign
    const q = slerp(yaw(0), b, 0.5);
    yaw(0.5).forEach((v, i) => expect(q[i]).toBeCloseTo(v));
  });
});
