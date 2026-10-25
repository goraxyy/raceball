import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { NodeIO } from "@gltf-transform/core";
import { afterEach, describe, expect, it } from "vitest";
import type { InputMsg } from "@raceball/shared";
import {
  createFlatRace,
  createRace,
  groundStrips,
  HAPPY_VALLEY_GROUND,
  NEUTRAL_INPUT,
  solidAt,
  TICK_DT,
  type GroundDef,
  type Race,
} from "./index";

// grass beyond the flat test square's far edge (z = 50), a little lower, with a void past z = 70
const GRASS: GroundDef = {
  groundY: -0.3,
  cell: 4,
  board: [-20, 48, 20, 100],
  voids: [
    {
      name: "pit",
      poly: [
        [-20, 72],
        [20, 72],
        [20, 100],
        [-20, 100],
      ],
    },
  ],
};

let race: Race | undefined;
afterEach(() => race?.dispose());

describe("ground", () => {
  it("leaves out the voids, row by row", () => {
    const strips = groundStrips(GRASS);
    expect(strips.length).toBe(6); // rows from z 48 to 72, each one strip across
    for (const [x0, z0, x1, z1] of strips) {
      expect([x0, x1]).toEqual([-20, 20]);
      expect(z1 - z0).toBe(4);
      expect(z1).toBeLessThanOrEqual(72);
    }
    expect(solidAt(GRASS, 0, 60)).toBe(true);
    expect(solidAt(GRASS, 0, 80)).toBe(false); // the pit
    expect(solidAt(GRASS, 30, 60)).toBe(false); // off the board
  });

  it("keeps Happy Valley's voids beside the road, not under it", () => {
    // spots on the road's centerline in each section (tools/track/build_happy_valley.py)
    for (const [x, z] of [
      [0, 0],
      [0, 100],
      [0, 210],
      [70, 250],
      [130, 207],
      [206, 126],
      [123, 10],
      [57, -73],
    ])
      expect(solidAt(HAPPY_VALLEY_GROUND, x, z), `${x}, ${z}`).toBe(true);
  });

  it("respawns a ball that rolls off the road onto the grass", async () => {
    race = await createFlatRace({ laps: 3, ground: GRASS });
    race.addPlayer("me", "earth");
    race.start(0, 3);
    const gas: InputMsg = { ...NEUTRAL_INPUT, gas: 1 };
    let respawnedAt = -1;
    for (let i = 0; i < Math.round(8 / TICK_DT) && respawnedAt < 0; i++) {
      race.setInput("me", gas);
      race.step(TICK_DT);
      if (race.drainEvents().some((e) => e.type === "respawn"))
        respawnedAt = i * TICK_DT;
    }
    expect(respawnedAt).toBeGreaterThan(0);
    const b = race.snapshot(0, 0).balls[0];
    expect(b.p[2]).toBeLessThan(50); // back on the square, at its grid slot
  });

  it("never catches a bot lapping Happy Valley: the grass is only beside the road", async () => {
    const glb = fileURLToPath(
      new URL("../tracks/happy_valley_col.glb", import.meta.url),
    );
    race = await createRace(new Uint8Array(readFileSync(glb)), new NodeIO(), {
      laps: 1,
      ground: HAPPY_VALLEY_GROUND,
    });
    race.addPlayer("bot", "earth");
    race.start(0, 1);
    let respawns = 0;
    for (let t = 0; race.phase !== "results" && t < 120; t += TICK_DT) {
      race.setInput("bot", race.botInput("bot"));
      race.step(TICK_DT);
      respawns += race.drainEvents().filter((e) => e.type === "respawn").length;
    }
    expect(race.phase).toBe("results");
    expect(respawns).toBe(0);
  }, 60_000);
});
