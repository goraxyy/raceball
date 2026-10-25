import { NodeIO } from "@gltf-transform/core";
import { createRace } from "@raceball/game-core";
import { MAX_PLAYERS } from "@raceball/shared";
import { expect, test } from "vitest";
import { trackBytes } from "../src/rooms/track-file";

test("the track loads and has a spawn for every player", async () => {
  const race = await createRace(await trackBytes(), new NodeIO(), { laps: 3 });
  for (let i = 0; i < MAX_PLAYERS; i++) race.addPlayer(`p${i}`, "earth");
  expect(race.snapshot(0, 0).balls).toHaveLength(MAX_PLAYERS);
  race.dispose();
});
