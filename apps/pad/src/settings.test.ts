import { describe, expect, test } from "vitest";
import { DEFAULT_SETTINGS, sanitize } from "./settings";

describe("sanitize", () => {
  test("nothing saved: defaults", () => {
    expect(sanitize(null)).toEqual(DEFAULT_SETTINGS);
  });

  test("keeps valid values", () => {
    expect(
      sanitize({ autoGas: true, sensitivityDeg: 35, deadZone: 0.1 }),
    ).toEqual({
      autoGas: true,
      sensitivityDeg: 35,
      deadZone: 0.1,
    });
  });

  test("clamps out-of-range values and ignores junk", () => {
    expect(
      sanitize({ autoGas: "yes", sensitivityDeg: 999, deadZone: -1 }),
    ).toEqual({
      autoGas: false,
      sensitivityDeg: 60,
      deadZone: 0,
    });
    expect(sanitize({ sensitivityDeg: NaN }).sensitivityDeg).toBe(45);
  });
});
