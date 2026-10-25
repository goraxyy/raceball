import { describe, expect, it } from "vitest";
import { DIP_SECONDS, SHOT_SECONDS, TOUR, tourFrame } from "./lobby-tour";

describe("lobby tour", () => {
  it("opens on the starting grid, under the navy cover", () => {
    const frame = tourFrame(0);
    expect(TOUR[frame.stop].name).toBe("The starting grid");
    expect(frame.dip).toBe(1);
    expect(frame.eye).toEqual([...TOUR[0].from]);
  });

  it("is clear mid-shot, and dips to navy at each cut", () => {
    expect(tourFrame(SHOT_SECONDS / 2).dip).toBe(0);
    expect(tourFrame(DIP_SECONDS / 2).dip).toBeCloseTo(0.5);
    expect(tourFrame(SHOT_SECONDS - DIP_SECONDS / 2).dip).toBeCloseTo(0.5);
    expect(tourFrame(SHOT_SECONDS - 1e-6).dip).toBeCloseTo(1);
  });

  it("visits every stop in route order, then starts over", () => {
    const stops = TOUR.map((_, i) => tourFrame((i + 0.5) * SHOT_SECONDS).stop);
    expect(stops).toEqual(TOUR.map((_, i) => i));
    expect(tourFrame((TOUR.length + 0.5) * SHOT_SECONDS).stop).toBe(0);
  });

  it("drifts from each shot's start to its end, looking at its landmark", () => {
    const frame = tourFrame(1.5 * SHOT_SECONDS);
    const { from, to, look } = TOUR[1];
    expect(frame.eye).toEqual(from.map((v, k) => (v + to[k]) / 2));
    expect(frame.look).toEqual([...look]);
  });

  it("holds each shot still for reduced motion", () => {
    const early = tourFrame(SHOT_SECONDS + 1, true);
    const late = tourFrame(2 * SHOT_SECONDS - 1, true);
    expect(early.eye).toEqual(late.eye);
  });

  it("keeps every shot above the ground and looking a good way off", () => {
    for (const { from, to, look } of TOUR)
      for (const eye of [from, to]) {
        expect(eye[1]).toBeGreaterThan(2);
        expect(Math.hypot(...eye.map((v, k) => v - look[k]))).toBeGreaterThan(
          15,
        );
      }
  });
});
