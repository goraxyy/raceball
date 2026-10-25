import {
  ArcRotateCamera,
  type AssetContainer,
  Color3,
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
import {
  FLAT_GROUND_HALF_SIZE,
  HAPPY_VALLEY_INTERACTABLES,
} from "@raceball/game-core";
import { COUNTDOWN_MS, type GameEvent } from "@raceball/shared";
import type { Mixer } from "../audio/mixer";
import { BallViews, type BallFeed, type BallPose } from "./balls";
import { BigScreen, type TileRect } from "./big-screen";
import { ChaseCamera, eventShake, swoopProgress } from "./cameras";
import { GameFx, type FxEvent } from "./fx";
import { loadLandmarks } from "./landmarks";
import { GREYBOX_PADS, InteractableViews } from "./interactables";
import { ItemViews } from "./items";
import { LocalSession, type LocalMap, type LocalStats } from "./local";
import { NetFeed, type SnapshotSource } from "./net-feed";
import { loadBoostPads } from "./route";
import { createSky, finishGreybox, loadWorld, tintLights } from "./world";

export type GameMode = "local" | "viewer" | "host";

/** How strongly the sky HDRI lights PBR models: a fill under the sun, not the main light (art bible, docs/ASSETS.md) */
const SKY_FILL = 0.6;

export interface Game {
  update(dt: number): void;
  reset(): void;
  toggleOverview(): void;
  /** Host: where the page drew each follow-cam tile's frame */
  setTileRects(rects: Map<string, TileRect>): void;
  dispose(): void;
}

export interface GameStatus {
  state: "loading" | "ready" | "error";
  map: LocalMap;
  message: string;
  overview: boolean;
  stats?: LocalStats;
  /** Host: players with a follow-cam tile, in order (the page draws a frame for each) */
  tiles?: string[];
}

interface GameOptions {
  map?: LocalMap;
  /** Local mode: the planet your ball wears */
  ball?: string;
  overview?: boolean;
  /** Viewer and host: the room whose snapshots the balls follow */
  session?: SnapshotSource;
  /** Plays the event sounds and music (fx.ts); without it the effects are silent */
  mixer?: Mixer;
  /** Every frame, with every ball's pose: the page's wheel indicators and live map read them */
  onFrame?: (poses: Map<string, BallPose>) => void;
  onStatus?: (status: GameStatus) => void;
}

/** Builds the 3D scene for one screen and updates it from a ball feed every frame. */
export function createGame(
  scene: Scene,
  mode: GameMode,
  options: GameOptions = {},
): Game {
  // the server always races on Happy Valley; the flat ground is a local test map
  const map =
    mode === "local" ? (options.map ?? "happy_valley") : "happy_valley";
  const status: GameStatus = {
    state: "loading",
    map,
    message:
      map === "flat" ? "Preparing flat test ground…" : "Loading Happy Valley…",
    overview: options.overview ?? mode === "host", // the big screen watches the whole map
  };
  const publish = () =>
    options.onStatus?.({
      ...status,
      stats: local ? { ...local.stats } : undefined,
    });
  const sky = new HemisphericLight("sky", new Vector3(0, 1, 0), scene);
  sky.intensity = 0.3;
  const sun = new DirectionalLight("sun", new Vector3(-0.4, -1, 0.35), scene);
  sun.position = new Vector3(20, 40, -20);
  sun.intensity = 0.9;
  const shadows = new ShadowGenerator(1024, sun); // only balls cast, so the shadow map stays tight around them
  shadows.usePercentageCloserFiltering = true;
  tintLights(sun, sky);
  const heavens = createSky(scene); // the dome, haze and clouds (world.ts)

  if (map === "flat") createFlatGround(scene);
  const balls = new BallViews(scene, shadows);
  const items = new ItemViews(scene);
  void items.load().catch((error: unknown) => {
    if (!disposed) console.warn("Item box model failed to load", error);
  });
  // boost pads, Lion Paw bumpers and Creamery Scoops; the glow is too dear for the big screen's tiles
  const toys = new InteractableViews(scene, { glow: mode !== "host" });
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
  const big = mode === "host" ? new BigScreen(scene, overview) : undefined;
  // the effects for every game event (Nuris's fx.ts); its files load alongside the map
  const fx = new GameFx(scene, {
    screen: mode === "host" ? "big" : "laptop",
    ownId: () => feed?.ownId ?? null,
    laps: () => net?.laps ?? 3, // local mode races 3 laps
    name: (id) => net?.name(id) ?? "You",
    color: (id) => feed?.look?.(id)?.color ?? 0,
    place: (id) => (net ? net.place(id) : 1),
  });
  fx.mixer = options.mixer;
  void fx.load().catch((error: unknown) => {
    if (!disposed) console.warn("Effects failed to load", error);
  });

  let local: LocalSession | undefined;
  let net: NetFeed | undefined;
  let feed: BallFeed | undefined;
  let disposed = false;
  let container: AssetContainer | undefined;
  let landmarks: { dispose(): void } | undefined;
  let world: AssetContainer | undefined;
  let publishAfter = 0;
  let countdown = 0; // s into the countdown, for the grid swoop
  const abort = new AbortController();
  void loadSky().catch((error: unknown) => {
    if (!disposed) console.warn("Sky HDRI failed to load", error);
  });
  /** Every game event this screen hears, from the local race or the server. Nuris's fx.ts table goes here too */
  const onEvent = (event: GameEvent) => {
    chase.shake(eventShake(event, feed?.ownId));
    fx.play(event); // particles, sound and caption, on the next frame when the poses are current
    toys.onEvent(event); // the pad or paw that was hit lights up
  };
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
    if (mode === "host") return; // the big screen has no ball of its own to follow
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
  const fail = (error: unknown) => {
    if (disposed) return;
    local?.dispose();
    local = feed = undefined;
    container?.dispose();
    container = undefined;
    status.state = "error";
    status.message = error instanceof Error ? error.message : String(error);
    publish();
  };
  publish();
  if (mode === "local") {
    void loadLocal().catch(fail);
  } else if (options.session) {
    feed = net = new NetFeed(options.session);
    net.onEvent = onEvent;
    void loadMap()
      .then((assets) => {
        container = assets;
        showMap(assets);
        status.state = "ready";
        status.message = "Ready";
        publish();
      })
      .catch(fail);
  } else {
    fail(new Error("No room to watch"));
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

  /** The visual map. A load that finishes after dispose is thrown away */
  async function loadMap(): Promise<AssetContainer> {
    const assets = await LoadAssetContainerAsync(
      `${import.meta.env.BASE_URL}assets/maps/happy_valley.glb`,
      scene,
    );
    if (disposed) {
      assets.dispose();
      throw new DOMException("Map load cancelled", "AbortError");
    }
    return assets;
  }

  /** Adds the map to the scene, freezes it (it never moves) and frames the overview camera on it */
  function showMap(assets: AssetContainer): void {
    assets.addAllToScene();
    finishGreybox(assets);
    // the grass board, its chasms and the causeways under the raised road, from the same JSON as the ground colliders
    void loadWorld(scene, () => disposed)
      .then((layer) => (world = layer))
      .catch((error: unknown) => {
        if (!disposed) console.warn("World failed to load", error);
      });
    // the boost pads (from the collision track's markers), paws and scoops; the greybox pads go once they're in
    void (local ? Promise.resolve(local.pads) : loadBoostPads())
      .then((pads) => toys.load(pads, HAPPY_VALLEY_INTERACTABLES.paws))
      .then((loaded) => {
        if (loaded)
          assets.meshes.find((m) => m.name === GREYBOX_PADS)?.setEnabled(false);
      })
      .catch((error: unknown) => {
        if (!disposed) console.warn("Interactables failed to load", error);
      });
    // the landmarks (and the animated arch and flags) go over the greybox once they're in; the race doesn't wait
    void loadLandmarks(scene, assets, () => disposed)
      .then((layer) => (landmarks = layer))
      .catch((error: unknown) => {
        if (!disposed) console.warn("Landmarks failed to load", error);
      });
    const meshes = assets.meshes.filter((mesh) => mesh.getTotalVertices() > 0);
    for (const mesh of meshes) {
      mesh.receiveShadows = true;
      mesh.computeWorldMatrix(true);
      mesh.freezeWorldMatrix();
    }
    const bounds = meshes.map((mesh) => mesh.getBoundingInfo().boundingBox);
    if (!bounds.length) return;
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
    big?.fitMap(overview.radius);
  }

  async function loadLocal(): Promise<void> {
    const results = await Promise.allSettled([
      LocalSession.start(map, abort.signal, options.ball).then((session) => {
        if (disposed) {
          session.dispose();
          throw new DOMException("Local load cancelled", "AbortError");
        }
        local = session;
        return session;
      }),
      map === "happy_valley"
        ? loadMap().then((assets) => (container = assets))
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
    addFxButtons(local);
    local.onEvent = onEvent;
    container = visualResult.value;
    if (container) showMap(container);
    status.state = "ready";
    status.message = "Ready";
    publish();
  }

  /** Local mode: fire each effect on your own ball from the panel, to judge it without a full race */
  function addFxButtons(session: LocalSession): void {
    const me = session.ownId;
    const folder = session.gui.addFolder("Effects (fx.ts)");
    folder.close();
    // where an item fires, as the server reports it: on the ball, or the puddle 1.2 m behind it for a spill
    const at = (back = 0): [number, number, number] => {
      const [x, y, z] = session.stats.position;
      const h = session.stats.heading;
      return [x - Math.sin(h) * back, y, z - Math.cos(h) * back];
    };
    const buttons: [string, () => FxEvent][] = [
      ["Bump", () => ({ type: "bump", a: me, b: "", strength: 0.35 })],
      ["Crash", () => ({ type: "bump", a: me, b: "", strength: 1 })],
      ["Item pickup", () => ({ type: "item", player: me, item: "boost" })],
      ["Boost", () => ({ type: "fire", player: me, item: "boost", pos: at() })],
      [
        "Lion Roar",
        () => ({ type: "fire", player: me, item: "roar", pos: at() }),
      ],
      [
        "Creamery Spill",
        () => ({ type: "fire", player: me, item: "spill", pos: at(1.2) }),
      ],
      ["Lap 2", () => ({ type: "lap", player: me, lap: 2 })],
      ["Final lap", () => ({ type: "lap", player: me, lap: 3 })],
      ["Win", () => ({ type: "finish", player: me, place: 1 })],
    ];
    for (const [label, evt] of buttons)
      folder.add({ go: () => fx.play(evt()) }, "go").name(label);
  }

  return {
    update(dt) {
      if (disposed) return;
      heavens.update(dt);
      if (status.state !== "ready") return;
      local?.advance(dt);
      if (!feed) return;
      const poses = feed.sample(performance.now());
      balls.sync(poses, (id) => feed?.look?.(id));
      options.onFrame?.(poses);
      const own = feed.ownId ? poses.get(feed.ownId) : undefined;
      const phase = local?.phase ?? net?.phase;
      // local race time starts with the countdown; online it's counted from the state patch that began it
      if (phase !== "countdown") countdown = 0;
      else if (local) countdown = local.stats.elapsed;
      else countdown += dt;
      const swoop =
        phase === "countdown"
          ? swoopProgress(countdown, COUNTDOWN_MS / 1000)
          : undefined;
      if (own) chase.follow(Vector3.FromArray(own.p), own.h, dt, swoop);
      if (phase) fx.setPhase(phase);
      if (phase === "countdown") {
        // the beeps land on the countdown numbers: race time locally, server time online
        const serverNow = net?.serverNow();
        if (local) fx.countdown(COUNTDOWN_MS - local.stats.elapsed * 1000);
        else if (net && serverNow !== undefined)
          fx.countdown(net.countdownEndsAt - serverNow);
      }
      if (local) fx.snow = local.stats.section === "arboretum";
      fx.update(
        dt,
        poses,
        status.overview || !own ? overview.target : Vector3.FromArray(own.p),
      );
      if (local) {
        items.sync(local.itemBoxes(), local.puddles());
        toys.syncScoops(local.scoops());
      } else if (options.session) {
        const {
          itemBoxes = [],
          puddles = [],
          scoops = [],
        } = options.session.state;
        toys.syncScoops(
          scoops.map((b) => ({
            id: b.id,
            pos: [b.x, b.y, b.z],
            active: b.active,
          })),
        );
        items.sync(
          itemBoxes.map((b) => ({
            id: b.id,
            pos: [b.x, b.y, b.z],
            active: b.active,
          })),
          puddles.map((d) => ({
            id: d.id,
            pos: [d.x, d.y, d.z],
            radius: d.radius,
          })),
        );
      }
      items.update(dt);
      toys.update(dt);
      if (big && net) {
        if (big.update(poses, net, dt)) {
          status.tiles = big.tileIds;
          publish();
        }
      }
      if (!local) return; // only local mode has stats for the HUD
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
    setTileRects(rects) {
      big?.setRects(rects);
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      abort.abort();
      removeEventListener("keydown", onKeyDown);
      local?.dispose();
      net?.dispose();
      local = net = feed = undefined;
      container?.dispose();
      container = undefined;
      landmarks?.dispose();
      landmarks = undefined;
      world?.dispose();
      world = undefined;
      heavens.dispose();
      big?.dispose();
      fx.dispose();
      balls.dispose();
      items.dispose();
      toys.dispose();
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
