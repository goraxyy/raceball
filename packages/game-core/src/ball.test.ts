import RAPIER from "@dimforge/rapier3d-compat";
import { expect, it } from "vitest";
import { addBall, isGrounded, type PlayerSim } from "./ball";
import { NEUTRAL_INPUT } from "./input";
import { createWorld, initPhysics } from "./physics";
import { tuning } from "./tuning";

it("does not grant ground control inside a surface sensor without solid support", async () => {
  await initPhysics();
  const world = createWorld();
  try {
    world.createCollider(
      RAPIER.ColliderDesc.cuboid(2, 2, 2)
        .setTranslation(0, 3, 0)
        .setSensor(true),
    );
    const player: PlayerSim = {
      id: "me",
      ball: "lion",
      slot: 1,
      body: addBall(world, 0, 3, 0),
      heading: 0,
      input: { ...NEUTRAL_INPUT },
      maxSpeedMul: 1,
      surfaceGrip: 1,
    };
    world.step();
    expect(isGrounded(player, world, tuning)).toBe(false);

    world.createCollider(
      RAPIER.ColliderDesc.cuboid(2, 0.1, 2).setTranslation(0, 2.9, 0),
    );
    world.step();
    expect(isGrounded(player, world, tuning)).toBe(true);
  } finally {
    world.free();
  }
});
