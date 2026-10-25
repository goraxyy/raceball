import { NEUTRAL_INPUT } from "@raceball/game-core";
import { expect, test } from "vitest";
import { STALE_MS, inputForStep, nextInput } from "../src/rooms/stale-input";

const msg = { seq: 3, steer: 0.5, gas: 1, brake: false, item: false };

test("fresh input is used as is", () => {
  expect(inputForStep({ msg, at: 1000 }, 1000 + STALE_MS)).toBe(msg);
});

test("input older than 200 ms is neutral", () => {
  expect(inputForStep({ msg, at: 1000 }, 1001 + STALE_MS)).toBe(NEUTRAL_INPUT);
});

test("no input yet is neutral", () => {
  expect(inputForStep(undefined, 0)).toBe(NEUTRAL_INPUT);
});

test("an item press survives the next message and fires on one tick only", () => {
  const press = { ...msg, seq: 4, item: true };
  const after = { ...msg, seq: 5, item: false };
  // both land before the simulation steps: the press must not be lost
  const latest = nextInput(nextInput(undefined, press, 1000), after, 1016);
  expect(inputForStep(latest, 1020).item).toBe(true);
  expect(inputForStep(latest, 1036).item).toBe(false);
});

test("a press in the latest message fires once, not every tick until the next message", () => {
  const latest = nextInput(undefined, { ...msg, item: true }, 1000);
  expect(inputForStep(latest, 1005).item).toBe(true);
  expect(inputForStep(latest, 1021).item).toBe(false);
});
