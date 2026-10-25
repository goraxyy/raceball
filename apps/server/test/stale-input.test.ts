import { NEUTRAL_INPUT } from "@raceball/game-core";
import { expect, test } from "vitest";
import { STALE_MS, inputForStep } from "../src/rooms/stale-input";

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
