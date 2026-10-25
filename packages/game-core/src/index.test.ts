import { expect, test } from "vitest";
import { GAME_CORE_VERSION } from "./index";

test("game-core loads", () => {
  expect(GAME_CORE_VERSION).toBe(0);
});
