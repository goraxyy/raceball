import {
  AssetContainer,
  Color3,
  Mesh,
  MeshBuilder,
  NullEngine,
  PBRMaterial,
  Scene,
  Vector3,
} from "@babylonjs/core";
import { existsSync } from "node:fs";
import { PLANETS, PLAYER_COLORS } from "@raceball/shared";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  BallViews,
  PLANET_MODELS,
  type BallLook,
  type BallPose,
  type LoadBallModel,
} from "./balls";

// The placeholder's striped texture draws on a canvas, which Node doesn't have
class FakeCanvas {
  width: number;
  height: number;
  constructor(width: number, height: number) {
    this.width = width;
    this.height = height;
  }
  getContext() {
    return { fillStyle: "", fillRect() {} };
  }
}

/** A stand-in for ball_<planet>.glb: a glTF root holding the planet and the ring. */
const fakeModel: LoadBallModel = async (planet, scene) => {
  const container = new AssetContainer(scene);
  const root = new Mesh("__root__", scene);
  const body = MeshBuilder.CreateSphere(`ball_${planet}`, {}, scene);
  const ring = MeshBuilder.CreateTorus("ring", { diameter: 1.7 }, scene);
  ring.material = new PBRMaterial("mat_player_color", scene);
  body.parent = ring.parent = root;
  container.meshes.push(root, body, ring);
  container.materials.push(ring.material);
  container.removeAllFromScene();
  return container;
};

const tilted: BallPose = {
  p: [3, 0.5, -2],
  q: [Math.SQRT1_2, 0, 0, Math.SQRT1_2], // rolled 90° about x
  h: 0,
};

async function settle() {
  for (let i = 0; i < 3; i++) await new Promise((r) => setTimeout(r, 0));
}

describe("ball views", () => {
  let engine: NullEngine;
  let scene: Scene;

  beforeEach(() => {
    vi.stubGlobal("OffscreenCanvas", FakeCanvas);
    engine = new NullEngine();
    scene = new Scene(engine);
    scene.useRightHandedSystem = true;
  });

  afterEach(() => {
    scene.dispose();
    engine.dispose();
    vi.unstubAllGlobals();
  });

  function show(
    views: BallViews,
    look: BallLook,
    pose: BallPose = tilted,
  ): void {
    views.sync(new Map([["a", pose]]), () => look);
  }

  it("rolls the planet but keeps the orbit ring level, in the player color", async () => {
    const views = new BallViews(scene, undefined, fakeModel);
    show(views, { ball: "mars", color: 2 });
    await settle();
    show(views, { ball: "mars", color: 2 });

    const planet = scene.getMeshByName("ball_mars-a")!;
    const ring = scene.getMeshByName("ring-a")!;
    expect(scene.getMeshByName("placeholder-a")).toBeNull();
    for (const mesh of [planet, ring]) {
      mesh.computeWorldMatrix(true);
      expect(mesh.getAbsolutePosition().asArray()).toEqual([3, 0.5, -2]);
    }
    // the planet's north pole (+y) now points along +z; the ring's axis still points up
    const up = (mesh: Mesh) =>
      Vector3.TransformNormal(Vector3.Up(), mesh.getWorldMatrix());
    expect(up(planet as Mesh).z).toBeCloseTo(1);
    expect(up(ring as Mesh).y).toBeCloseTo(1);

    const tint = (ring.material as PBRMaterial).albedoColor;
    const expected = Color3.FromHexString(PLAYER_COLORS[2]).toLinearSpace();
    expect(tint.equalsWithEpsilon(expected, 1e-6)).toBe(true);
  });

  it("gives every ball its own ring material, sharing one loaded model", async () => {
    const load = vi.fn(fakeModel);
    const views = new BallViews(scene, undefined, load);
    const looks: Record<string, BallLook> = {
      a: { ball: "earth", color: 0 },
      b: { ball: "earth", color: 7 },
    };
    const poses = new Map([
      ["a", tilted],
      ["b", tilted],
    ]);
    views.sync(poses, (id) => looks[id]);
    await settle();

    expect(load).toHaveBeenCalledTimes(1);
    const a = scene.getMeshByName("ring-a")!.material as PBRMaterial;
    const b = scene.getMeshByName("ring-b")!.material as PBRMaterial;
    expect(a).not.toBe(b);
    expect(a.albedoColor.equals(b.albedoColor)).toBe(false);
  });

  it("has a model file for every planet", () => {
    expect([...PLANET_MODELS].sort()).toEqual([...PLANETS].sort());
    for (const planet of PLANET_MODELS)
      expect(
        existsSync(
          new URL(
            `../../public/assets/models/ball_${planet}.glb`,
            import.meta.url,
          ),
        ),
        planet,
      ).toBe(true);
  });

  it("keeps the placeholder for planets without a model, and still adds the ring", async () => {
    const views = new BallViews(scene, undefined, fakeModel);
    show(views, { ball: "pluto", color: 4 }); // every planet has a model now, so an unknown one
    await settle();

    expect(scene.getMeshByName("placeholder-a")).not.toBeNull();
    expect(scene.getMeshByName("ring-a")).not.toBeNull();
    expect(scene.meshes.some((mesh) => mesh.name.startsWith("ball_"))).toBe(
      false,
    );
  });

  it("removes every mesh and the ring material when a ball leaves", async () => {
    const views = new BallViews(scene, undefined, fakeModel);
    show(views, { ball: "saturn", color: 1 });
    await settle();
    const ringMaterial = scene.getMeshByName("ring-a")!.material!;

    views.sync(new Map());
    expect(scene.meshes).toHaveLength(0);
    expect(scene.transformNodes).toHaveLength(0);
    expect(scene.materials).not.toContain(ringMaterial);
  });

  it("drops a model that loads after its ball already left", async () => {
    const views = new BallViews(scene, undefined, fakeModel);
    show(views, { ball: "jupiter", color: 3 });
    views.sync(new Map());
    await settle();

    expect(scene.meshes).toHaveLength(0);
  });
});
