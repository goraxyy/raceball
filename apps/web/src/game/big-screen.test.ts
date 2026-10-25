import {
  ArcRotateCamera,
  NullEngine,
  Scene,
  type TargetCamera,
  Vector3,
} from "@babylonjs/core";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { BallPose } from "./balls";
import {
  BigScreen,
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

  const players = (noLaptop: string[]): BigScreenPlayers => ({ noLaptop });

  it("splits the screen: every player gets a first-person view, drawn where the page framed it", () => {
    const big = new BigScreen(scene, overview);
    const ids = ["a", "b", "c", "d", "e", "f", "g", "h", "i"];
    const poses = new Map(ids.map((id, i) => [id, at(i * 3, 0)]));
    const all = players(["gone", ...ids]); // "gone" has no ball yet
    expect(big.update(poses, all, 1 / 60)).toBe(true);
    expect(big.tileIds).toEqual(ids.slice(0, MAX_TILES)); // 8 at most
    expect(scene.activeCameras).toHaveLength(0); // no frames on the page yet

    big.setRects(
      new Map([["b", { left: 18, top: 18, width: 320, height: 200 }]]),
    );
    // only the views draw: the overview stays off while the screen is split
    expect(scene.activeCameras?.map((c) => c.name)).toEqual(["tile-b"]);
    const viewport = scene.activeCameras![0].viewport;
    expect(viewport.x).toBeCloseTo(18 / 1280);
    expect(viewport.y).toBeCloseTo(1 - 218 / 720); // from the bottom
    expect(viewport.width).toBeCloseTo(320 / 1280);

    expect(big.update(poses, all, 1 / 60)).toBe(false);
    big.dispose();
  });

  it("puts each view low behind its ball, looking along the heading, so the ball is in shot", () => {
    const big = new BigScreen(scene, overview);
    const poses = new Map([["a", { ...at(10, 20), h: Math.PI / 2 }]]); // heading +x
    big.update(poses, players(["a"]), 1 / 60);
    big.setRects(
      new Map([["a", { left: 0, top: 0, width: 1280, height: 720 }]]),
    );
    const camera = scene.activeCameras![0] as TargetCamera;
    expect(camera.position.x).toBeLessThan(9); // behind the ball
    expect(camera.position.z).toBeCloseTo(20);
    expect(camera.position.y).toBeGreaterThan(1); // above the 1 m ball
    // the ball itself is in front of the camera and inside its view
    const toBall = new Vector3(10, 0.5, 20)
      .subtract(camera.position)
      .normalize();
    const forward = camera.getForwardRay().direction;
    expect(forward.x).toBeGreaterThan(0.9); // looking down the road, along +x
    expect(Vector3.Dot(toBall, forward)).toBeGreaterThan(
      Math.cos(camera.fov / 2),
    );
    big.dispose();
  });

  it("frames the pack with the overview", () => {
    const big = new BigScreen(scene, overview);
    const poses = new Map([
      ["a", at(100, 40)],
      ["b", at(120, 40)],
    ]);
    for (let i = 0; i < 600; i++) big.update(poses, players([]), 1 / 60);
    expect(overview.target.x).toBeCloseTo(110, 0);
    expect(overview.target.z).toBeCloseTo(40, 0);
    expect(overview.radius).toBeCloseTo(54, 0);
    expect(overview.beta).toBeCloseTo(0.65); // same angle, only closer
    big.dispose();
  });

  it("never leaves the split screen during a race, however slow the frames", () => {
    const big = new BigScreen(scene, overview);
    let passes = 0;
    big.onPassesChanged = () => passes++;
    const poses = new Map([
      ["a", at(0, 0)],
      ["b", at(5, 0)],
    ]);
    const all = players(["a", "b"]);
    big.update(poses, all, 1 / 60);
    big.setRects(
      new Map([
        ["a", { left: 0, top: 0, width: 640, height: 720 }],
        ["b", { left: 640, top: 0, width: 640, height: 720 }],
      ]),
    );
    expect(passes).toBe(1); // the two views started drawing: the frame rate is judged afresh
    let changed = false;
    for (let t = 0; t < 60; t += 0.1)
      changed = big.update(poses, all, 0.1) || changed; // 10 fps for a minute
    expect(changed).toBe(false);
    expect(big.tileIds).toEqual(["a", "b"]);
    expect(scene.activeCameras).toHaveLength(2);
    big.dispose();
  });

  it("a stall or a hidden page never drops the split screen", () => {
    const big = new BigScreen(scene, overview);
    const poses = new Map([["a", at(0, 0)]]);
    const all = players(["a"]);
    big.update(poses, all, 1 / 60);
    big.setRects(
      new Map([["a", { left: 0, top: 0, width: 1280, height: 720 }]]),
    );
    for (let i = 0; i < 60; i++) big.update(poses, all, 1); // one frame a second, like a hidden pane
    expect(big.tileIds).toEqual(["a"]);
    big.dispose();
  });
});
