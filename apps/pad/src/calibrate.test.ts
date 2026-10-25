import { describe, expect, test } from "vitest";
import {
  Calibrator,
  HOLD_MS,
  LEVEL_MS,
  TURN,
  WRONG_WAY_MS,
  circularMean,
} from "./calibrate";

const G = 9.81;
const deg = (d: number) => (d * Math.PI) / 180;

/** Hold `angle` for `ms`, sampling at 60 Hz from time t0. Returns the end time and any result */
function hold(cal: Calibrator, angle: number, ms: number, t0 = 0) {
  let result;
  let t = t0;
  for (; t <= t0 + ms; t += 1000 / 60) result = cal.feed(angle, G, t) ?? result;
  return { t, result };
}

describe("circularMean", () => {
  test("averages across ±π", () => {
    expect(Math.abs(circularMean([Math.PI - 0.1, -Math.PI + 0.1]))).toBeCloseTo(
      Math.PI,
    );
  });
});

describe("Calibrator", () => {
  test("step 1 takes a second of holding level", () => {
    const cal = new Calibrator();
    hold(cal, deg(90), LEVEL_MS / 2);
    expect(cal.step).toBe(1);
    expect(cal.progress).toBeGreaterThan(0.4);
    hold(cal, deg(90), LEVEL_MS / 2 + 20, LEVEL_MS / 2 + 1);
    expect(cal.step).toBe(2);
  });

  test("step 1 restarts if the phone moves or lies flat", () => {
    const cal = new Calibrator();
    hold(cal, deg(90), 800);
    cal.feed(deg(130), G, 810); // jerked by 40°
    expect(cal.progress).toBe(0);
    hold(cal, deg(130), 500, 820);
    cal.feed(deg(130), 1, 1400); // flat on the table
    expect(cal.progress).toBe(0);
  });

  test("a right turn has to be held before it counts", () => {
    const cal = new Calibrator();
    const { t } = hold(cal, deg(90), LEVEL_MS + 50);
    const passing = hold(cal, deg(90) + TURN + 0.05, HOLD_MS / 2, t);
    expect(passing.result).toBeUndefined();
    const held = hold(cal, deg(90) + TURN + 0.05, HOLD_MS, passing.t);
    expect(held.result).toEqual({ neutral: expect.closeTo(deg(90)), sign: 1 });
  });

  test("a left turn shows a hint instead of finishing", () => {
    const cal = new Calibrator();
    const { t } = hold(cal, deg(90), LEVEL_MS + 50);
    const left = hold(cal, deg(90) - TURN - 0.05, 1000, t);
    expect(left.result).toBeUndefined();
    expect(cal.wrongWay).toBe(true);
    expect(cal.progress).toBe(0);
  });

  test("turning back right after a wrong turn still works", () => {
    const cal = new Calibrator();
    const { t } = hold(cal, deg(90), LEVEL_MS + 50);
    const left = hold(cal, deg(90) - TURN - 0.05, 500, t);
    const right = hold(cal, deg(90) + TURN + 0.05, HOLD_MS + 50, left.t);
    expect(right.result?.sign).toBe(1);
    expect(cal.wrongWay).toBe(false);
  });

  test("a long-held left turn is accepted, for phones with mirrored axes", () => {
    const cal = new Calibrator();
    const { t } = hold(cal, deg(90), LEVEL_MS + 50);
    const left = hold(cal, deg(90) - TURN - 0.05, WRONG_WAY_MS + 50, t);
    expect(left.result?.sign).toBe(-1);
  });

  test("neutral near ±π works (the other landscape)", () => {
    const cal = new Calibrator();
    const { t } = hold(cal, deg(179), LEVEL_MS + 50);
    const { result } = hold(cal, deg(-170), 50, t); // 11° past 180 counts as +, but under TURN
    expect(result).toBeUndefined();
    const done = hold(cal, deg(-150), HOLD_MS + 50, t + 100).result; // 31° past neutral, held
    expect(done?.sign).toBe(1);
  });
});
