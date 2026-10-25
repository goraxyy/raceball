import { describe, expect, test } from "vitest";
import { OneEuroFilter } from "./one-euro";
import { MAX_STEER, Steering, curve, deadzone, wrap } from "./steering";

const G = 9.81;
/** Gravity in the screen plane for a phone rotated `a` rad from angle 0 */
const feed = (s: Steering, a: number, t = 0) =>
  s.update(G * Math.cos(a), G * Math.sin(a), t);

describe("helpers", () => {
  test("wrap keeps angles within -π…π", () => {
    expect(wrap(3 * Math.PI)).toBeCloseTo(Math.PI);
    expect(wrap(-Math.PI / 2 - 2 * Math.PI)).toBeCloseTo(-Math.PI / 2);
  });

  test("deadzone zeroes the center and still reaches 1", () => {
    expect(deadzone(0.04)).toBe(0);
    expect(deadzone(1)).toBe(1);
    expect(deadzone(-1)).toBe(-1);
  });

  test("curve keeps sign and clamps", () => {
    expect(curve(0.25)).toBeCloseTo(0.125);
    expect(curve(-2)).toBe(-1);
  });
});

describe("Steering", () => {
  test("is 0 until calibrated", () => {
    const s = new Steering();
    feed(s, 0.3);
    expect(s.read()).toBe(0);
  });

  test("full lock at MAX_STEER, both signs", () => {
    const s = new Steering();
    s.calib = { neutral: 0, sign: 1 };
    feed(s, MAX_STEER);
    expect(s.read()).toBeCloseTo(1);

    const flipped = new Steering();
    flipped.calib = { neutral: 0, sign: -1 };
    feed(flipped, MAX_STEER);
    expect(flipped.read()).toBeCloseTo(-1);
  });

  test("wraps across ±π (landscape held the other way)", () => {
    const s = new Steering();
    s.calib = { neutral: Math.PI, sign: 1 };
    feed(s, -Math.PI + MAX_STEER / 2);
    expect(s.read()).toBeGreaterThan(0);
  });

  test("holds the last value when the phone is flat", () => {
    const s = new Steering();
    s.calib = { neutral: 0, sign: 1 };
    feed(s, MAX_STEER, 0);
    const before = s.read();
    const flat = new Steering();
    flat.calib = s.calib;
    flat.steer = before;
    flat.update(0.5, 0.5, 0);
    expect(flat.read()).toBe(before);
  });
});

describe("OneEuroFilter", () => {
  test("smooths a noisy constant signal", () => {
    const f = new OneEuroFilter();
    let out = 0;
    for (let i = 0; i < 120; i++)
      out = f.filter(5 + (i % 2 ? 0.5 : -0.5), i / 60);
    expect(Math.abs(out - 5)).toBeLessThan(0.2);
  });
});
