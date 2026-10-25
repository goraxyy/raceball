import { ArcRotateCamera, NullEngine, Scene, Vector3 } from "@babylonjs/core";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { BallPose } from "./balls";
import {
  BigScreen,
  FpsGuard,
  MAX_TILES,
  framePack,
  type BigScreenPlayers,
} from "./big-screen";

const at = (x: number, z: number): BallPose => ({
  p: [x, 0.5, z],
  q: [0, 0, 0, 1],
  h: 0,
});

/** Name tags draw on a canvas, which Node doesn't have */
class FakeCanvas {
  width: number;
  height: number;
  constructor(width: number, height: number) {
    this.width = width;
    this.height = height;
  }
  getContext() {
    const noop = () => {};
    return {
      clearRect: noop,
      beginPath: noop,
      roundRect: noop,
      fill: noop,
      arc: noop,
      fillRect: noop,
      fillText: noop,
    };
  }
}

describe("FpsGuard", () => {
  const run = (guard: FpsGuard, fps: number, seconds: number) => {
    for (let t = 0; t < seconds; t += 0.1) guard.update(fps, 0.1);
    return guard.tripped;
  };

  it("trips after 3 s under 50 fps, not counting the first 2 s", () => {
    const guard = new FpsGuard();
    expect(run(guard, 20, 2)).toBe(false); // grace: shaders compiling
    expect(run(guard, 45, 2.5)).toBe(false);
    expect(run(guard, 45, 0.6)).toBe(true);
    expect(guard.update(60, 0.1)).toBe(true); // stays tripped
  });

  it("starts counting again after a good frame, or after the tiles change", () => {
    const guard = new FpsGuard();
    run(guard, 60, 2.1);
    run(guard, 40, 2.5);
    guard.update(60, 0.1);
    expect(run(guard, 40, 2.5)).toBe(false);
    guard.restart();
    expect(run(guard, 40, 4.5)).toBe(false); // 2 s grace + 2.5 s
    expect(run(guard, 40, 0.6)).toBe(true);
  });
});

describe("framePack", () => {
  it("centers on the pack and backs off with its spread, within limits", () => {
    expect(framePack([])).toBeNull();
    const tight = framePack([at(0, 0), at(4, 2)])!;
    expect(tight.target.x).toBeCloseTo(2);
    expect(tight.target.z).toBeCloseTo(1);
    expect(tight.radius).toBe(45); // never closer than this
    const wide = framePack([at(-100, 0), at(100, 0)])!;
    expect(wide.radius).toBeCloseTo(200 * 1.2 + 30);
    expect(framePack([at(-100, 0), at(100, 0)], 150)!.radius).toBe(150);
  });
});

describe("BigScreen", () => {
  let engine: NullEngine;
  let scene: Scene;
  let overview: ArcRotateCamera;

  beforeEach(() => {
    vi.stubGlobal("OffscreenCanvas", FakeCanvas);
    engine = new NullEngine();
    // NullEngine has no canvas; the page's 1280×720 one
    engine.getRenderingCanvasClientRect = () =>
      ({ left: 0, top: 0, width: 1280, height: 720 }) as DOMRect;
    scene = new Scene(engine);
    overview = new ArcRotateCamera(
      "overview",
      0,
      0.65,
      180,
      Vector3.Zero(),
      scene,
    );
  });

  afterEach(() => {
    scene.dispose();
    engine.dispose();
    vi.unstubAllGlobals();
  });

  const players = (phoneOnly: string[]): BigScreenPlayers => ({
    phoneOnly,
    name: (id) => `Name ${id}`,
    look: () => ({ ball: "earth", color: 1 }),
  });

  it("gives up to 4 phone-only players a tile, drawn where the page framed it", () => {
    const big = new BigScreen(scene, overview);
    const poses = new Map(
      ["a", "b", "c", "d", "e", "f"].map((id, i) => [id, at(i * 3, 0)]),
    );
    const phones = players(["gone", "b", "c", "d", "e", "f"]); // "gone" has no ball yet
    expect(big.update(poses, phones, 1 / 60, 60)).toBe(true);
    expect(big.tileIds).toEqual(["b", "c", "d", "e"]);
    expect(big.tileIds).toHaveLength(MAX_TILES);
    expect(scene.activeCameras).toHaveLength(0); // no frames on the page yet

    big.setRects(
      new Map([["b", { left: 18, top: 18, width: 320, height: 200 }]]),
    );
    expect(scene.activeCameras?.map((c) => c.name)).toEqual([
      "overview",
      "tile-b",
    ]);
    const viewport = scene.activeCameras![1].viewport;
    expect(viewport.x).toBeCloseTo(18 / 1280);
    expect(viewport.y).toBeCloseTo(1 - 218 / 720); // from the bottom
    expect(viewport.width).toBeCloseTo(320 / 1280);

    expect(big.update(poses, phones, 1 / 60, 60)).toBe(false);
    big.dispose();
  });

  it("frames the pack with the overview", () => {
    const big = new BigScreen(scene, overview);
    const poses = new Map([
      ["a", at(100, 40)],
      ["b", at(120, 40)],
    ]);
    for (let i = 0; i < 600; i++) big.update(poses, players([]), 1 / 60, 60);
    expect(overview.target.x).toBeCloseTo(110, 0);
    expect(overview.target.z).toBeCloseTo(40, 0);
    expect(overview.radius).toBeCloseTo(54, 0);
    expect(overview.beta).toBeCloseTo(0.65); // same angle, only closer
    big.dispose();
  });

  it("swaps the tiles for name tags when the fps can't keep up", () => {
    const big = new BigScreen(scene, overview);
    const poses = new Map([
      ["a", at(0, 0)],
      ["b", at(5, 0)],
    ]);
    const phones = players(["b"]);
    big.update(poses, phones, 0.1, 60);
    big.setRects(
      new Map([["b", { left: 18, top: 18, width: 320, height: 200 }]]),
    );
    let changed = false;
    for (let t = 0; t < 5.2; t += 0.1)
      changed = big.update(poses, phones, 0.1, 30) || changed;
    expect(changed).toBe(true);
    expect(big.nameTags).toBe(true);
    expect(big.tileIds).toEqual([]);
    expect(scene.activeCameras).toHaveLength(0);
    expect(scene.getMeshByName("tag-a")).toBeTruthy();
    expect(scene.getMeshByName("tag-b")).toBeTruthy();

    // a player who leaves loses their tag; tiles don't come back
    big.update(new Map([["b", at(5, 0)]]), phones, 0.1, 60);
    expect(scene.getMeshByName("tag-a")).toBeNull();
    expect(big.tileIds).toEqual([]);
    big.dispose();
    expect(scene.getMeshByName("tag-b")).toBeNull();
  });
});
