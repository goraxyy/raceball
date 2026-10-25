import { describe, expect, test } from "vitest";
import { Clock } from "./clock";

describe("Clock", () => {
  test("first pong sets offset from the midpoint of the round trip", () => {
    const clock = new Clock();
    // sent at local 1000, server stamped 5050, received at local 1100: rtt 100, midpoint 1050
    clock.onPong({ c: 1000, s: 5050 }, 1100);
    expect(clock.rtt).toBe(100);
    expect(clock.offset).toBe(4000);
    expect(clock.serverNow(2000)).toBe(6000);
  });

  test("later pongs smooth the offset and track jitter", () => {
    const clock = new Clock();
    clock.onPong({ c: 0, s: 4050 }, 100);
    clock.onPong({ c: 1000, s: 5100 }, 1200); // rtt 200, offset 4000 again
    expect(clock.offset).toBeCloseTo(4000);
    expect(clock.jitter).toBeCloseTo(10); // 0.1 × |200 − 100|
  });

  test("percentiles", () => {
    const clock = new Clock();
    for (let i = 1; i <= 100; i++) clock.onPong({ c: 0, s: 0 }, i);
    expect(clock.percentile(50)).toBe(51);
    expect(clock.percentile(95)).toBe(96);
  });
});
