import { describe, expect, it } from "vitest";
import { LocalLapTimer, type TimingGate } from "./local-timing";

function gate(index: number, z: number): TimingGate {
  return {
    index,
    section: `section-${index}`,
    position: [0, 1, z],
    rotation: [0, 0, 0, 1],
    halfExtents: [4, 2, 0.5],
  };
}

describe("local playtest stopwatch", () => {
  it("starts on the first finish crossing and times an ordered lap between crossings", () => {
    const timer = new LocalLapTimer([gate(1, 10), gate(0, 0)]);
    timer.advance([0, 1, -1], [0, 1, 1], 1, 1);
    expect(timer.elapsed(1)).toBe(0.5);
    expect(timer.laps).toBe(0);
    timer.advance([0, 1, 9], [0, 1, 11], 10, 1);
    timer.advance([0, 1, -1], [0, 1, 1], 66, 1);
    expect(timer.laps).toBe(1);
    expect(timer.lastLap).toBe(65);
    expect(timer.bestLap).toBe(65);
    expect(timer.section).toBe("section-0");
  });

  it("rejects backwards, off-track and out-of-order gate crossings", () => {
    const timer = new LocalLapTimer([gate(0, 0), gate(1, 10)]);
    timer.advance([0, 1, 1], [0, 1, -1], 1, 1);
    timer.advance([5, 1, -1], [5, 1, 1], 2, 1);
    timer.advance([0, 4, -1], [0, 4, 1], 3, 1);
    timer.advance([0, 1, 9], [0, 1, 11], 4, 1);
    expect(timer.elapsed(4)).toBeNull();
    timer.advance([0, 1, -1], [0, 1, 1], 5, 1);
    timer.advance([0, 1, -1], [0, 1, 1], 70, 1);
    expect(timer.laps).toBe(0);
    expect(timer.nextCheckpoint).toBe(1);
  });

  it("uses the gate orientation and half-extents for a fast crossing", () => {
    const start = gate(0, 0);
    start.rotation = [0, Math.SQRT1_2, 0, Math.SQRT1_2];
    const timer = new LocalLapTimer([start, gate(1, 10)]);
    timer.advance([-10, 1, 3], [10, 1, 3], 1, 1);
    expect(timer.nextCheckpoint).toBe(1);
    expect(timer.elapsed(1)).toBeCloseTo(0.5);
    timer.reset();
    expect(timer.elapsed(1)).toBeNull();
    expect(timer.nextCheckpoint).toBe(0);
  });
});
