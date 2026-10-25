import {
  ArcRotateCamera,
  type AssetContainer,
  Color3,
  Color4,
  CubeTexture,
  DirectionalLight,
  DynamicTexture,
  HemisphericLight,
  LoadAssetContainerAsync,
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
import { LocalSession, type LocalMap, type LocalStats } from "./local";

export type GameMode = "local" | "viewer" | "host";

/** How strongly the sky HDRI lights PBR models: a fill under the sun, not the main light (art bible, docs/ASSETS.md) */
const SKY_FILL = 0.6;

export interface Game {
  update(dt: number): void;
  reset(): void;
  toggleOverview(): void;
  dispose(): void;
}

export interface GameStatus {
  state: "loading" | "ready" | "error";
  map: LocalMap;
  message: string;
  overview: boolean;
  stats?: LocalStats;
}

interface GameOptions {
  map?: LocalMap;
  overview?: boolean;
  onStatus?: (status: GameStatus) => void;
}

/** Builds the 3D scene for one screen and updates it from a ball feed every frame. */
export function createGame(
  scene: Scene,
  mode: GameMode,
  options: GameOptions = {},
): Game {
  const map = options.map ?? "happy_valley";
  const status: GameStatus = {
    state: "loading",
    map,
    message:
      map === "flat" ? "Preparing flat test ground…" : "Loading Happy Valley…",
    overview: options.overview ?? false,
  };
  const publish = () =>
    options.onStatus?.({
      ...status,
      stats: local ? { ...local.stats } : undefined,
    });
  scene.clearColor = new Color4(0.62, 0.8, 0.95, 1);
  const sky = new HemisphericLight("sky", new Vector3(0, 1, 0), scene);
  sky.intensity = 0.3;
  const sun = new DirectionalLight("sun", new Vector3(-0.4, -1, 0.35), scene);
  sun.position = new Vector3(20, 40, -20);
  sun.intensity = 0.9;
  const shadows = new ShadowGenerator(1024, sun); // only balls cast, so the shadow map stays tight around them
  shadows.usePercentageCloserFiltering = true;

  if (map === "flat" || mode !== "local") createFlatGround(scene);
  const balls = new BallViews(scene, shadows);
  const chase = new ChaseCamera(scene);
  scene.activeCamera = chase.camera;
  const overview = new ArcRotateCamera(
    "map-overview",
    -Math.PI / 2,
    0.65,
    180,
    Vector3.Zero(),
    scene,
  );
  overview.minZ = 0.1;
  overview.maxZ = 3000;
  overview.lowerRadiusLimit = 20;
  overview.upperRadiusLimit = 1000;
  overview.inputs.removeByType("ArcRotateCameraKeyboardMoveInput");

  let local: LocalSession | undefined;
  let feed: BallFeed | undefined; // viewer/host: Rasim's net library plugs in here
  let disposed = false;
  let container: AssetContainer | undefined;
  let publishAfter = 0;
  const abort = new AbortController();
  void loadSky().catch((error: unknown) => {
    if (!disposed) console.warn("Sky HDRI failed to load", error);
  });
  const applyCamera = () => {
    scene.activeCamera = status.overview ? overview : chase.camera;
    if (status.overview) overview.attachControl(true);
    else overview.detachControl();
  };
  const toggleOverview = () => {
    status.overview = !status.overview;
    applyCamera();
    publish();
  };
  const onKeyDown = (event: KeyboardEvent) => {
    if (
      event.code !== "KeyV" ||
      event.repeat ||
      event.metaKey ||
      event.ctrlKey ||
      event.altKey
    )
      return;
    if (
      (event.target as HTMLElement | null)?.closest?.(
        "input, textarea, select, button, .lil-gui",
      )
    )
      return;
    event.preventDefault();
    toggleOverview();
  };
  addEventListener("keydown", onKeyDown);
  applyCamera();
  if (mode === "local") {
    publish();
    void loadLocal().catch((error: unknown) => {
      if (disposed) return;
      local?.dispose();
      local = feed = undefined;
      container?.dispose();
      container = undefined;
      status.state = "error";
      status.message = error instanceof Error ? error.message : String(error);
      publish();
    });
  }

  /**
   * The sky HDRI fills in the light on glTF (PBR) models, so the hemispheric light is turned down to suit; it still
   * lights the StandardMaterial ground and placeholder balls. It's fetched with the abort signal first: a CubeTexture
   * load can't be cancelled, and in dev React mounts twice on the same canvas, where a first load that finishes after
   * its engine is gone leaves the second one rendering black.
   */
  async function loadSky(): Promise<void> {
    const response = await fetch(
      `${import.meta.env.BASE_URL}assets/tex/env_happy_valley.env`,
      { signal: abort.signal },
    );
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const blob = await response.blob();
    if (disposed) return;
    const url = URL.createObjectURL(blob);
    const env = CubeTexture.CreateFromPrefilteredData(url, scene, ".env");
    env.onLoadObservable.addOnce(() => URL.revokeObjectURL(url));
    scene.environmentTexture = env;
    scene.environmentIntensity = SKY_FILL;
  }

  async function loadLocal(): Promise<void> {
    const results = await Promise.allSettled([
      LocalSession.start(map, abort.signal).then((session) => {
        if (disposed) {
          session.dispose();
          throw new DOMException("Local load cancelled", "AbortError");
        }
        local = session;
        return session;
      }),
      map === "happy_valley"
        ? LoadAssetContainerAsync(
            `${import.meta.env.BASE_URL}assets/maps/happy_valley.glb`,
            scene,
          ).then((assets) => {
            if (disposed) {
              assets.dispose();
              throw new DOMException("Map load cancelled", "AbortError");
            }
            container = assets;
            return assets;
          })
        : Promise.resolve(undefined),
    ]);
    const [sessionResult, visualResult] = results;
    const error = results.find((result) => result.status === "rejected");
    if (disposed || error) {
      local?.dispose();
      local = undefined;
      container?.dispose();
      container = undefined;
      if (!disposed && error?.status === "rejected") {
        status.state = "error";
        status.message =
          error.reason instanceof Error
            ? error.reason.message
            : String(error.reason);
        publish();
      }
      return;
    }
    if (
      sessionResult.status !== "fulfilled" ||
      visualResult.status !== "fulfilled"
    )
      return;
    local = feed = sessionResult.value;
    container = visualResult.value;
    if (container) {
      container.addAllToScene();
      const meshes = container.meshes.filter(
        (mesh) => mesh.getTotalVertices() > 0,
      );
      for (const mesh of meshes) {
        mesh.receiveShadows = true;
        mesh.computeWorldMatrix(true);
        mesh.freezeWorldMatrix();
      }
      const bounds = meshes.map((mesh) => mesh.getBoundingInfo().boundingBox);
      if (bounds.length) {
        const min = bounds.reduce(
          (value, box) => Vector3.Minimize(value, box.minimumWorld),
          bounds[0].minimumWorld.clone(),
        );
        const max = bounds.reduce(
          (value, box) => Vector3.Maximize(value, box.maximumWorld),
          bounds[0].maximumWorld.clone(),
        );
        overview.setTarget(min.add(max).scale(0.5));
        overview.radius = Math.max(max.x - min.x, max.z - min.z) * 1.1;
      }
    }
    status.state = "ready";
    status.message = "Ready";
    publish();
  }

  return {
    update(dt) {
      if (disposed || (mode === "local" && status.state !== "ready")) return;
      local?.advance(dt);
      if (!feed) return;
      const poses = feed.sample(performance.now());
      balls.sync(poses);
      const own = feed.ownId ? poses.get(feed.ownId) : undefined;
      if (own) chase.follow(Vector3.FromArray(own.p), own.h, dt);
      publishAfter -= dt;
      if (publishAfter <= 0) {
        publishAfter = 0.1;
        publish();
      }
    },
    reset() {
      void local?.reset();
    },
    toggleOverview,
    dispose() {
      if (disposed) return;
      disposed = true;
      abort.abort();
      removeEventListener("keydown", onKeyDown);
      local?.dispose();
      local = feed = undefined;
      container?.dispose();
      container = undefined;
      balls.dispose();
      overview.dispose();
      chase.camera.dispose();
      shadows.dispose();
      sky.dispose();
      sun.dispose();
      scene.environmentTexture?.dispose();
      scene.environmentTexture = null;
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
