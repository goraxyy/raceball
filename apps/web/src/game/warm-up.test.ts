import { FreeCamera, NullEngine, Scene, Vector3 } from "@babylonjs/core";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { WarmUp, warmUpSpots, WARM_UP_MS } from "./warm-up";

const loop = (n: number): [number, number][] =>
  Array.from({ length: n }, (_, i) => [
    100 * Math.cos((i / n) * Math.PI * 2),
    100 * Math.sin((i / n) * Math.PI * 2),
  ]);

describe("warmUpSpots", () => {
  it("spreads at most 16 spots evenly round the route, each looking ahead along it", () => {
    const spots = warmUpSpots(loop(160));
    expect(spots).toHaveLength(16);
    // the first spot stands on the first point and looks towards the second
    expect(spots[0].eye[0]).toBeCloseTo(100);
    expect(spots[0].eye[2]).toBeCloseTo(0);
    expect(spots[0].target[2]).toBeGreaterThan(spots[0].eye[2]);
    expect(warmUpSpots(loop(5))).toHaveLength(5);
    expect(warmUpSpots([[0, 0]])).toEqual([]);
  });
});

describe("WarmUp", () => {
  let engine: NullEngine;
  let scene: Scene;
  beforeEach(() => {
    engine = new NullEngine();
    scene = new Scene(engine);
    scene.activeCamera = new FreeCamera("chase", Vector3.Zero(), scene);
  });
  afterEach(() => {
    scene.dispose();
    engine.dispose();
    vi.restoreAllMocks();
  });

  it("draws the scene from every spot, twice round, then finishes, leaving the cameras as they were", async () => {
    const chase = scene.activeCamera;
    const looks: number[] = [];
    vi.spyOn(scene, "render").mockImplementation(() => {
      looks.push(scene.activeCamera!.position.x);
    });
    const warm = new WarmUp(scene, warmUpSpots(loop(3)), chase!);
    let finished = false;
    void warm.done.then(() => (finished = true));
    for (let i = 0; i < 100 && !finished; i++) {
      warm.frame();
      await Promise.resolve();
    }
    expect(finished).toBe(true);
    expect(looks).toHaveLength(6);
    expect(looks.slice(0, 3)).toEqual(looks.slice(3));
    expect(scene.activeCamera).toBe(chase);
    expect(scene.cameras.some((c) => c.name === "warm-up-eye")).toBe(false);
  });

  it("gives up after WARM_UP_MS, so a slow GPU still gets to race", async () => {
    const now = vi.spyOn(performance, "now").mockReturnValue(0);
    vi.spyOn(scene, "isReady").mockReturnValue(false);
    vi.spyOn(engine, "areAllEffectsReady").mockReturnValue(false);
    const warm = new WarmUp(scene, warmUpSpots(loop(3)), scene.activeCamera!);
    let finished = false;
    void warm.done.then(() => (finished = true));
    warm.frame();
    await Promise.resolve();
    expect(finished).toBe(false); // still compiling
    now.mockReturnValue(WARM_UP_MS + 1);
    warm.frame();
    await Promise.resolve();
    expect(finished).toBe(true);
  });
});
