import { describe, expect, test } from "vitest";
import { SHAKE_COOLDOWN_MS, SHAKE_THRESHOLD, ShakeDetector } from "./shake";

const still = { x: 0, y: 9.81, z: 0 };
const zero = { x: 0, y: 0, z: 0 };

describe("ShakeDetector", () => {
  test("steering and bumps don't fire; a real shake does", () => {
    const s = new ShakeDetector();
    expect(s.feed({ x: 3, y: 2, z: 1 }, still, 0)).toBe(false);
    expect(s.feed({ x: SHAKE_THRESHOLD + 2, y: 0, z: 0 }, still, 16)).toBe(
      true,
    );
  });

  test("one shake fires once: the cooldown swallows the rest of it", () => {
    const s = new ShakeDetector();
    const hard = { x: 25, y: 0, z: 0 };
    expect(s.feed(hard, still, 0)).toBe(true);
    expect(s.feed(hard, still, 100)).toBe(false);
    expect(s.feed(hard, still, SHAKE_COOLDOWN_MS + 1)).toBe(true);
  });

  test("phones without a gyroscope: gravity is removed with a high-pass filter", () => {
    const s = new ShakeDetector();
    // a long still period: no fire, even though gravity alone is 9.81
    for (let t = 0; t < 1000; t += 16)
      expect(s.feed(null, still, t)).toBe(false);
    // a sudden jolt on top of gravity fires
    expect(s.feed(null, { x: 30, y: 9.81, z: 0 }, 1000)).toBe(true);
    expect(s.feed(zero, still, 2000)).toBe(false);
  });
});
