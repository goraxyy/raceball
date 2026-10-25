import {
  Color3,
  Color4,
  DirectionalLight,
  DynamicTexture,
  HemisphericLight,
  MeshBuilder,
  Scene,
  ShadowGenerator,
  StandardMaterial,
  Texture,
  Vector3,
} from "@babylonjs/core";
import { FLAT_GROUND_HALF_SIZE } from "@raceball/game-core";
import { BallViews, type BallFeed } from "./balls";
import { ChaseCamera } from "./cameras";
import { LocalSession } from "./local";

export type GameMode = "local" | "viewer" | "host";

export interface Game {
  update(dt: number): void;
  dispose(): void;
}

/** Builds the 3D scene for one screen and updates it from a ball feed every frame. */
export function createGame(scene: Scene, mode: GameMode): Game {
  scene.clearColor = new Color4(0.62, 0.8, 0.95, 1);
  const sky = new HemisphericLight("sky", new Vector3(0, 1, 0), scene);
  sky.intensity = 0.65;
  const sun = new DirectionalLight("sun", new Vector3(-0.4, -1, 0.35), scene);
  sun.position = new Vector3(20, 40, -20);
  sun.intensity = 0.9;
  const shadows = new ShadowGenerator(1024, sun); // only balls cast, so the shadow map stays tight around them
  shadows.usePercentageCloserFiltering = true;

  createFlatGround(scene);
  const balls = new BallViews(scene, shadows);
  const chase = new ChaseCamera(scene);
  scene.activeCamera = chase.camera;

  let local: LocalSession | undefined;
  let feed: BallFeed | undefined; // viewer/host: Rasim's net library plugs in here
  let disposed = false;
  if (mode === "local") {
    void LocalSession.start().then((s) => {
      if (disposed) return s.dispose(); // React StrictMode unmounted us while Rapier was loading
      local = feed = s;
    });
  }

  return {
    update(dt) {
      local?.advance(dt);
      if (!feed) return;
      const poses = feed.sample(performance.now());
      balls.sync(poses);
      const own = feed.ownId ? poses.get(feed.ownId) : undefined;
      if (own) chase.follow(Vector3.FromArray(own.p), own.h, dt);
    },
    dispose() {
      disposed = true;
      local?.dispose();
      balls.dispose();
    },
  };
}

/** Matches the flat M0 physics ground in game-core: a 0.2 m slab whose top is at y = 0, with a 2 m grid. */
function createFlatGround(scene: Scene): void {
  const size = FLAT_GROUND_HALF_SIZE * 2;
  const ground = MeshBuilder.CreateBox(
    "ground",
    { width: size, height: 0.2, depth: size },
    scene,
  );
  ground.position.y = -0.1;
  ground.receiveShadows = true;

  const tex = new DynamicTexture(
    "ground-grid",
    { width: 128, height: 128 },
    scene,
    true,
  );
  const ctx = tex.getContext();
  ctx.fillStyle = "#7fb069";
  ctx.fillRect(0, 0, 128, 128);
  ctx.fillStyle = "#6a9a56";
  ctx.fillRect(0, 0, 128, 4);
  ctx.fillRect(0, 0, 4, 128);
  tex.update();
  tex.wrapU = tex.wrapV = Texture.WRAP_ADDRESSMODE;
  tex.uScale = tex.vScale = size / 2;

  const mat = new StandardMaterial("ground", scene);
  mat.diffuseTexture = tex;
  mat.specularColor = Color3.Black();
  ground.material = mat;
  ground.freezeWorldMatrix();

  // the start line at z = 0.5, just ahead of the grid
  const line = MeshBuilder.CreateGround(
    "start-line",
    { width: 8, height: 0.4 },
    scene,
  );
  line.position.set(0, 0.005, 0.5);
  const lineMat = new StandardMaterial("start-line", scene);
  lineMat.diffuseColor = Color3.White();
  lineMat.specularColor = Color3.Black();
  line.material = lineMat;
}
