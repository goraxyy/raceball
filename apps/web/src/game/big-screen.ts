import {
  type AbstractEngine,
  ArcRotateCamera,
  type Camera,
  Color3,
  DynamicTexture,
  Engine,
  Mesh,
  MeshBuilder,
  type Observer,
  Scene,
  StandardMaterial,
  Vector3,
  Viewport,
} from "@babylonjs/core";
import { MAX_PLAYERS, PLAYER_COLORS } from "@raceball/shared";
import type { BallLook, BallPose } from "./balls";
import { DriverCamera } from "./cameras";

/** Split-screen views on the big screen: one per player */
export const MAX_TILES = MAX_PLAYERS;
/** Below this fps for LOW_FPS_SECONDS, the split screen draws at a lower resolution, then gives way to the overview */
export const MIN_FPS = 30;
const LOW_FPS_SECONDS = 3;
/** Right after the tiles change (new render passes, shader compiles) the fps doesn't count, s */
const FPS_GRACE = 3;
/** A frame longer than this is a one-off stall (a model loading, a hidden window, a tab switch), not a slow screen, s */
const HITCH = 0.25;
/** How long the frame time is averaged over, s */
const FPS_WINDOW = 0.5;
/** Hardware scaling levels the split screen steps through before giving up: 1 = full resolution, 2 = half */
export const RESOLUTION_STEPS = [1, 1.5, 2] as const;
/** Overview framing: the camera backs off this much per metre of pack spread, plus a margin, m */
const PACK_ZOOM = 1.2;
const PACK_MARGIN = 30;
const PACK_MIN_RADIUS = 45;
/** How fast the overview follows the pack (per second) */
const PACK_FOLLOW = 1.5;
/** Name tag height as a share of the camera distance, so tags read the same at any zoom */
const TAG_SCALE = 0.035;

/** A tile's view in CSS pixels from the canvas's top left, as the DOM measures it */
export interface TileRect {
  left: number;
  top: number;
  width: number;
  height: number;
}

/** Who a ball belongs to, for the split screen and name tags */
export interface BigScreenPlayers {
  /** Every player in join order: each gets a split-screen view */
  readonly all: readonly string[];
  /** Phone-only players in join order */
  readonly phoneOnly: readonly string[];
  name(id: string): string | undefined;
  look(id: string): BallLook | undefined;
}

/**
 * Every tile draws the scene again, so this is the safety valve: one slow projector laptop shouldn't make the whole
 * race stutter. When the frame rate (measured from the frame times) stays under MIN_FPS for LOW_FPS_SECONDS, it asks
 * for the next lower resolution (RESOLUTION_STEPS), and only once the lowest is still too slow does it trip.
 * One-off stalls and a hidden page don't count: they say nothing about how fast the screen can draw.
 */
export class FpsGuard {
  tripped = false;
  /** Index into RESOLUTION_STEPS */
  step = 0;
  /** The host brought the split screen back by hand: never trip again */
  disabled = false;
  private low = 0;
  private grace = FPS_GRACE;
  private frameTime = 1 / 60;

  /** Call every frame while tiles draw: "lower" = draw at RESOLUTION_STEPS[step], "trip" = give up on the tiles */
  update(dt: number, hidden = false): "keep" | "lower" | "trip" {
    if (this.tripped) return "trip";
    if (this.disabled) return "keep";
    if (hidden) {
      this.restart(); // a hidden page barely draws; judge it afresh once it's back
      return "keep";
    }
    if (dt <= 0 || dt > HITCH) return "keep";
    this.frameTime += (dt - this.frameTime) * Math.min(1, dt / FPS_WINDOW);
    if (this.grace > 0) {
      this.grace -= dt;
      return "keep";
    }
    this.low = 1 / this.frameTime < MIN_FPS ? this.low + dt : 0;
    if (this.low < LOW_FPS_SECONDS) return "keep";
    if (this.step + 1 < RESOLUTION_STEPS.length) {
      this.step++;
      this.restart();
      return "lower";
    }
    this.tripped = true;
    return "trip";
  }

  /** The tiles changed: wait out the grace period again before judging */
  restart(): void {
    this.grace = FPS_GRACE;
    this.low = 0;
  }

  /** The host wants the split screen back after a trip: keep it, at the lowest resolution */
  override(): void {
    this.tripped = false;
    this.disabled = true;
  }
}

/** Where the overview looks, and how far back it sits to keep every ball in view. Null with no balls */
export function framePack(
  poses: Iterable<BallPose>,
  maxRadius = Infinity,
): { target: Vector3; radius: number } | null {
  const min = new Vector3(Infinity, Infinity, Infinity);
  const max = new Vector3(-Infinity, -Infinity, -Infinity);
  for (const { p } of poses) {
    const v = Vector3.FromArray(p);
    min.minimizeInPlace(v);
    max.maximizeInPlace(v);
  }
  if (!Number.isFinite(min.x)) return null;
  const spread = Math.max(max.x - min.x, max.z - min.z);
  const radius = spread * PACK_ZOOM + PACK_MARGIN;
  return {
    target: min.add(max).scaleInPlace(0.5),
    radius: Math.min(Math.max(radius, PACK_MIN_RADIUS), maxRadius),
  };
}

interface Tile {
  eye: DriverCamera;
  drawn: boolean;
}

/**
 * The big screen's cameras: a split screen with a driver's view (just behind the ball) for every player (up to MAX_TILES), each drawn
 * into the frame the page lays out on top of the canvas (`setRects`). If the fps can't take a render pass per
 * player, the split screen goes for good and the overview frames the pack, with a name tag on every ball.
 * The host can also switch to that global view by hand (`setGlobal`) and back.
 */
export class BigScreen {
  /** Players with a tile now, in order. The page draws a frame for each and reports its rect */
  tileIds: string[] = [];
  /** True once the tiles fell back to name tags */
  nameTags = false;
  /** The host picked the global view: the overview with name tags instead of the split screen */
  global = false;
  private readonly scene: Scene;
  private readonly overview: ArcRotateCamera;
  private readonly guard = new FpsGuard();
  private readonly tiles = new Map<string, Tile>();
  private rects = new Map<string, TileRect>();
  private tags = new Map<string, { mesh: Mesh; key: string }>();
  private maxRadius = Infinity;
  private drawnKey = "";
  private readonly clearTile: Observer<Camera>;

  constructor(scene: Scene, overview: ArcRotateCamera) {
    this.scene = scene;
    this.overview = overview;
    // Babylon clears only depth before the second camera on, so a tile's sky would show the overview through it
    this.clearTile = scene.onBeforeCameraRenderObservable.add((camera) => {
      if (camera === this.overview) return;
      const engine = scene.getEngine();
      if (!(engine instanceof Engine)) return;
      const { x, y, width, height } = camera.viewport.toGlobal(
        engine.getRenderWidth(),
        engine.getRenderHeight(),
      );
      engine.scissorClear(x, y, width, height, scene.clearColor);
    });
  }

  /**
   * Global view (true) or split screen (false). The next update() swaps the tiles. Asking for the split screen after
   * the fps guard gave up on it brings it back for good: the host can see whether it's smooth enough
   */
  setGlobal(on: boolean): void {
    this.global = on;
    if (!on && this.nameTags) {
      this.nameTags = false;
      this.guard.override();
    }
    this.guard.restart(); // the render passes change: judge the fps afresh
    this.applyResolution();
  }

  /** True while the overview is what's on screen: picked by the host, or forced by a low fps */
  get overviewShown(): boolean {
    return this.nameTags || this.global;
  }

  /** The map's size caps how far back the overview goes */
  fitMap(radius: number): void {
    this.maxRadius = radius;
  }

  /** Where the page drew each tile's frame (CSS pixels); tiles without one aren't drawn */
  setRects(rects: Map<string, TileRect>): void {
    this.rects = rects;
    this.applyCameras();
  }

  /** Once per frame. Returns true when the tiles or name tags changed, so the page can redraw its frames */
  update(
    poses: Map<string, BallPose>,
    players: BigScreenPlayers,
    dt: number,
  ): boolean {
    this.frame(poses, dt);
    let changed = false;
    if (
      !this.overviewShown &&
      this.tileIds.some((id) => this.tiles.get(id)?.drawn)
    ) {
      const hidden = typeof document !== "undefined" && document.hidden;
      const verdict = this.guard.update(dt, hidden);
      if (verdict === "lower") this.applyResolution();
      if (verdict === "trip") {
        this.nameTags = true;
        changed = true;
      }
    }
    const want = this.overviewShown
      ? []
      : players.all.filter((id) => poses.has(id)).slice(0, MAX_TILES);
    if (want.join() !== this.tileIds.join()) {
      this.setTiles(want);
      changed = true;
    }
    for (const id of this.tileIds) {
      const pose = poses.get(id)!;
      this.tiles.get(id)!.eye.follow(Vector3.FromArray(pose.p), pose.h, dt);
    }
    if (this.overviewShown) this.syncTags(poses, players);
    else this.clearTags();
    return changed;
  }

  dispose(): void {
    this.setTiles([]);
    this.clearTags();
    this.scene.onBeforeCameraRenderObservable.remove(this.clearTile);
  }

  /** Ease the overview toward the pack: target and distance, keeping the angle */
  private frame(poses: Map<string, BallPose>, dt: number): void {
    const pack = framePack(poses.values(), this.maxRadius);
    if (!pack) return;
    const k = 1 - Math.exp(-PACK_FOLLOW * dt);
    const target = Vector3.Lerp(this.overview.target, pack.target, k);
    this.overview.setTarget(target, false, false, true);
    this.overview.radius += (pack.radius - this.overview.radius) * k;
  }

  private setTiles(ids: string[]): void {
    for (const [id, tile] of this.tiles) {
      if (ids.includes(id)) continue;
      tile.eye.camera.dispose();
      this.tiles.delete(id);
    }
    for (const id of ids) {
      if (this.tiles.has(id)) continue;
      const eye = new DriverCamera(this.scene, `tile-${id}`);
      this.tiles.set(id, { eye, drawn: false });
    }
    this.tileIds = ids;
    this.applyCameras();
  }

  /** Each player's view draws inside its frame and the overview isn't drawn; with no views, the overview fills the screen */
  private applyCameras(): void {
    const engine: AbstractEngine = this.scene.getEngine();
    const canvas = engine.getRenderingCanvasClientRect();
    const drawn: Camera[] = [];
    for (const id of this.tileIds) {
      const tile = this.tiles.get(id)!;
      const rect = this.rects.get(id);
      tile.drawn = !!rect && !!canvas && canvas.width > 0 && canvas.height > 0;
      if (!tile.drawn || !rect || !canvas) continue;
      // viewports are 0-1 of the canvas, with y up from the bottom
      tile.eye.camera.viewport = new Viewport(
        (rect.left - canvas.left) / canvas.width,
        1 - (rect.top - canvas.top + rect.height) / canvas.height,
        rect.width / canvas.width,
        rect.height / canvas.height,
      );
      drawn.push(tile.eye.camera);
    }
    const key = drawn.map((camera) => camera.name).join();
    if (key !== this.drawnKey) this.guard.restart(); // new render passes: judge the fps afresh
    this.drawnKey = key;
    this.scene.activeCamera = drawn[0] ?? this.overview;
    this.scene.activeCameras = drawn.length ? drawn : [];
    this.applyResolution();
  }

  /** The hardware scaling level the screen draws at: the guard's step for the split screen; the overview is one pass, so full resolution */
  get resolution(): number {
    return this.tileIds.length
      ? RESOLUTION_STEPS[this.guard.step]
      : RESOLUTION_STEPS[0];
  }

  private applyResolution(): void {
    const engine = this.scene.getEngine();
    if (engine.getHardwareScalingLevel() !== this.resolution)
      engine.setHardwareScalingLevel(this.resolution);
  }

  private clearTags(): void {
    for (const tag of this.tags.values()) disposeTag(tag.mesh);
    this.tags.clear();
  }

  /** A billboard over each ball with the player's name, sized by distance so it reads the same at any zoom */
  private syncTags(
    poses: Map<string, BallPose>,
    players: BigScreenPlayers,
  ): void {
    for (const [id, tag] of this.tags) {
      if (poses.has(id)) continue;
      disposeTag(tag.mesh);
      this.tags.delete(id);
    }
    const eye = this.overview.position;
    for (const [id, pose] of poses) {
      const name = players.name(id) ?? "";
      const color = players.look(id)?.color ?? 0;
      const key = `${name}|${color}`;
      let tag = this.tags.get(id);
      if (tag?.key !== key) {
        if (tag) disposeTag(tag.mesh);
        tag = { mesh: makeTag(this.scene, id, name, color), key };
        this.tags.set(id, tag);
      }
      const ball = Vector3.FromArray(pose.p);
      const scale = Vector3.Distance(eye, ball) * TAG_SCALE;
      tag.mesh.scaling.setAll(scale);
      tag.mesh.position.set(ball.x, ball.y + 1 + scale * 0.6, ball.z);
    }
  }
}

const TAG_W = 512;
const TAG_H = 128;

/** A paper plate with an ink outline, a dot in the player color and the name, like the lobby's name plates */
function makeTag(scene: Scene, id: string, name: string, color: number): Mesh {
  const tex = new DynamicTexture(
    `tag-${id}`,
    { width: TAG_W, height: TAG_H },
    scene,
    true,
  );
  tex.hasAlpha = true;
  const ctx = tex.getContext() as CanvasRenderingContext2D;
  ctx.clearRect(0, 0, TAG_W, TAG_H);
  ctx.fillStyle = "#17151f";
  ctx.beginPath();
  ctx.roundRect?.(6, 6, TAG_W - 12, TAG_H - 12, 24);
  ctx.fill();
  ctx.fillStyle = "#f3ead9";
  ctx.beginPath();
  ctx.roundRect?.(14, 14, TAG_W - 28, TAG_H - 28, 18);
  ctx.fill();
  ctx.fillStyle = PLAYER_COLORS[color] ?? PLAYER_COLORS[0];
  ctx.beginPath();
  ctx.arc(TAG_H / 2 + 4, TAG_H / 2, 30, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#17151f";
  ctx.font = "italic 900 64px Barlow, system-ui, sans-serif";
  ctx.textBaseline = "middle";
  ctx.fillText(
    name.toUpperCase(),
    TAG_H + 8,
    TAG_H / 2 + 4,
    TAG_W - TAG_H - 30,
  );
  tex.update();

  const mat = new StandardMaterial(`tag-${id}`, scene);
  mat.diffuseTexture = tex;
  mat.emissiveColor = Color3.White();
  mat.disableLighting = true;
  mat.useAlphaFromDiffuseTexture = true;
  mat.backFaceCulling = false;
  const mesh = MeshBuilder.CreatePlane(
    `tag-${id}`,
    { width: TAG_W / TAG_H, height: 1 },
    scene,
  );
  mesh.material = mat;
  mesh.billboardMode = Mesh.BILLBOARDMODE_ALL;
  mesh.renderingGroupId = 1; // drawn after the world, so walls and hills never hide a name
  mesh.isPickable = false;
  return mesh;
}

function disposeTag(mesh: Mesh): void {
  mesh.material?.dispose(true, true);
  mesh.dispose();
}
