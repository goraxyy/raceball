import { describe, expect, it } from "vitest";
import { makePath, pointAt, project } from "./path";

// A 100 m x 20 m loop, counter-clockwise from the origin: 240 m round
const loop = makePath([
  [0, 0],
  [100, 0],
  [100, 20],
  [0, 20],
]);

describe("track path", () => {
  it("measures the closed loop, including the way back to the start", () => {
    expect(loop.cumulative).toEqual([0, 100, 120, 220]);
    expect(loop.length).toBe(240);
  });

  it("finds the distance along the route of the nearest point", () => {
    expect(project(loop, 30, -3)).toBeCloseTo(30); // beside the first leg
    expect(project(loop, 104, 10)).toBeCloseTo(110); // beside the far end
    expect(project(loop, 60, 23)).toBeCloseTo(160); // beside the way back
    expect(project(loop, -2, 15)).toBeCloseTo(225); // on the closing segment
  });

  it("only looks near a hint, so a point between two legs keeps to its own leg", () => {
    expect(project(loop, 50, 9)).toBeCloseTo(50); // nearer the first leg
    expect(project(loop, 50, 9, 170, 30)).toBeCloseTo(170); // but the hint says the way back
  });

  it("gives the point at any distance, wrapping round the loop", () => {
    expect(pointAt(loop, 0)).toEqual([0, 0]);
    expect(pointAt(loop, 110)).toEqual([100, 10]);
    expect(pointAt(loop, 230)).toEqual([0, 10]);
    expect(pointAt(loop, 240 + 50)).toEqual([50, 0]);
    expect(pointAt(loop, -10)).toEqual([0, 10]);
  });

  it("refuses a path with fewer than 2 points", () => {
    expect(() => makePath([[0, 0]])).toThrow();
  });
});
