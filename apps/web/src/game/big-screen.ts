import {
  type AbstractEngine,
  ArcRotateCamera,
  type Camera,
  Engine,
  type Observer,
  Scene,
  Vector3,
  Viewport,
} from "@babylonjs/core";
import { MAX_PLAYERS } from "@raceball/shared";
import type { BallPose } from "./balls";
import { DriverCamera } from "./cameras";

/** Split-screen views on the big screen: one per player */
export const MAX_TILES = MAX_PLAYERS;
/** Overview framing: the camera backs off this much per metre of pack spread, plus a margin, m */
const PACK_ZOOM = 1.2;
const PACK_MARGIN = 30;
const PACK_MIN_RADIUS = 45;
/** How fast the overview follows the pack (per second) */
const PACK_FOLLOW = 1.5;

/** A tile's view in CSS pixels from the canvas's top left, as the DOM measures it */
export interface TileRect {
  left: number;
  top: number;
  width: number;
  height: number;
}

/** Who gets a view on the split screen */
export interface BigScreenPlayers {
  /** Every player in join order: each gets a split-screen view */
  readonly all: readonly string[];
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
 * The big screen's cameras: a split screen with a driver's view (just behind the ball) for every player (up to
 * MAX_TILES), each drawn into the frame the page lays out on top of the canvas (`setRects`). It never switches to a
 * global view during the race: a slow screen draws less instead (quality.ts, run by game.ts, which hears about every
 * change to the views through `onPassesChanged`). The overview, framing the pack, only fills the screen while no
 * player has a view yet.
 */
export class BigScreen {
  /** Players with a tile now, in order. The page draws a frame for each and reports its rect */
  tileIds: string[] = [];
  private readonly scene: Scene;
  private readonly overview: ArcRotateCamera;
  /** The views drawn changed (new render passes, shaders compiling): the frame rate needs judging afresh */
  onPassesChanged?: () => void;
  private readonly tiles = new Map<string, Tile>();
  private rects = new Map<string, TileRect>();
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

  /** The map's size caps how far back the overview goes */
  fitMap(radius: number): void {
    this.maxRadius = radius;
  }

  /** Where the page drew each tile's frame (CSS pixels); tiles without one aren't drawn */
  setRects(rects: Map<string, TileRect>): void {
    this.rects = rects;
    this.applyCameras();
  }

  /** Once per frame. Returns true when the tiles changed, so the page can redraw its frames */
  update(
    poses: Map<string, BallPose>,
    players: BigScreenPlayers,
    dt: number,
  ): boolean {
    this.frame(poses, dt);
    let changed = false;
    const want = players.all.filter((id) => poses.has(id)).slice(0, MAX_TILES);
    if (want.join() !== this.tileIds.join()) {
      this.setTiles(want);
      changed = true;
    }
    for (const id of this.tileIds) {
      const pose = poses.get(id)!;
      this.tiles.get(id)!.eye.follow(Vector3.FromArray(pose.p), pose.h, dt);
    }
    return changed;
  }

  dispose(): void {
    this.setTiles([]);
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
    if (key !== this.drawnKey) this.onPassesChanged?.();
    this.drawnKey = key;
    this.scene.activeCamera = drawn[0] ?? this.overview;
    this.scene.activeCameras = drawn.length ? drawn : [];
  }
}
