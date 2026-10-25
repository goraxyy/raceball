import { describe, expect, it } from "vitest";
import { KeyboardInput, tuning, type KeyState } from "./index";

const NONE: KeyState = {
  up: false,
  down: false,
  left: false,
  right: false,
  item: false,
};
const dt = 1 / 60;

function hold(kb: KeyboardInput, keys: KeyState, seconds: number) {
  let msg = kb.next(keys, dt);
  for (let i = 1; i < Math.round(seconds / dt); i++) msg = kb.next(keys, dt);
  return msg;
}

describe("keyboard adapter", () => {
  it("maps W to gas and S to brake", () => {
    const kb = new KeyboardInput();
    expect(kb.next({ ...NONE, up: true }, dt)).toMatchObject({
      gas: 1,
      brake: false,
    });
    expect(kb.next({ ...NONE, down: true }, dt)).toMatchObject({
      gas: 0,
      brake: true,
    });
  });

  it("ramps steering like a wheel instead of snapping", () => {
    const kb = new KeyboardInput();
    const first = kb.next({ ...NONE, right: true }, dt);
    expect(first.steer).toBeCloseTo(tuning.keySteerRate * dt);
    expect(hold(kb, { ...NONE, right: true }, 1).steer).toBe(1);
    expect(hold(kb, { ...NONE, left: true }, 1).steer).toBe(-1);
    expect(hold(kb, NONE, 1).steer).toBe(0);
  });

  it("fires the item in exactly one message per press", () => {
    const kb = new KeyboardInput();
    const msgs = [true, true, true, false, true].map(
      (item) => kb.next({ ...NONE, item }, dt).item,
    );
    expect(msgs).toEqual([true, false, false, false, true]);
  });

  it("increments seq on every message", () => {
    const kb = new KeyboardInput();
    expect([
      kb.next(NONE, dt).seq,
      kb.next(NONE, dt).seq,
      kb.next(NONE, dt).seq,
    ]).toEqual([1, 2, 3]);
  });
});
