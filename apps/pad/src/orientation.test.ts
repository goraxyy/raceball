import { describe, expect, test } from "vitest";
import { nextSide, signLooksWrong, uiRotation } from "./orientation";

const G = 9.81;
const deg = (d: number) => (d * Math.PI) / 180;
/** "up" for a phone turned `d` degrees from upright, clockwise as seen from the front */
const up = (d: number): [number, number] => [
  -G * Math.sin(deg(d)),
  G * Math.cos(deg(d)),
];

describe("nextSide", () => {
  test("upright portrait is null", () => {
    expect(nextSide(null, ...up(0))).toBeNull();
  });

  test("landscape either way", () => {
    expect(nextSide(null, ...up(-90))).toBe(90); // right edge up
    expect(nextSide(null, ...up(90))).toBe(-90); // left edge up
  });

  test("steering hard (±60° from level) never flips the side", () => {
    for (const steer of [-60, -30, 0, 30, 60]) {
      expect(nextSide(90, ...up(-90 + steer))).toBe(90);
    }
  });

  test("turning the phone around switches sides", () => {
    expect(nextSide(90, ...up(90))).toBe(-90);
  });

  test("locked (racing): turning the wheel past upright never drops to portrait", () => {
    for (const steer of [-90, -80, 80, 90]) {
      expect(nextSide(90, ...up(-90 + steer), true)).toBe(90);
      expect(nextSide(-90, ...up(90 + steer), true)).toBe(-90);
    }
    expect(nextSide(90, ...up(0))).toBeNull(); // unlocked, upright is portrait again
  });

  test("locked still finds landscape from portrait, and still turns round", () => {
    expect(nextSide(null, ...up(-90), true)).toBe(90);
    expect(nextSide(90, ...up(90), true)).toBe(-90);
  });

  test("lying flat keeps the last side", () => {
    expect(nextSide(-90, 0.2, 0.1)).toBe(-90);
  });
});

describe("uiRotation", () => {
  test("Portrait Lock on: we do the whole turn", () => {
    expect(uiRotation(90, 0)).toBe(90);
    expect(uiRotation(-90, 0)).toBe(-90);
  });

  test("browser already rotated the same way: nothing left to do", () => {
    expect(uiRotation(90, 90)).toBe(0);
    expect(uiRotation(-90, 270)).toBe(0);
  });

  test("browser rotated to portrait mid-steer: counter-rotate", () => {
    expect(uiRotation(90, 0)).toBe(90);
  });

  test("upright portrait: leave it to the browser", () => {
    expect(uiRotation(null, 90)).toBe(0);
  });
});

describe("signLooksWrong", () => {
  test("browser landscape opposite to ours means our sensor sign is wrong", () => {
    expect(signLooksWrong(-90, 90)).toBe(true);
    expect(signLooksWrong(90, 270)).toBe(true);
  });

  test("agreeing, or the browser in portrait, tells us nothing", () => {
    expect(signLooksWrong(90, 90)).toBe(false);
    expect(signLooksWrong(90, 0)).toBe(false);
    expect(signLooksWrong(null, 90)).toBe(false);
  });
});

describe("extreme steering", () => {
  test("even 75° from level doesn't count as upright portrait", () => {
    expect(nextSide(90, ...up(-90 + 75))).toBe(90);
  });
});
