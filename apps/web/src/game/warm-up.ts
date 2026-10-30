import { type Camera, FreeCamera, type Scene, Vector3 } from "@babylonjs/core";

/** Places along the route the warm-up camera looks from */
const SPOTS = 16;
/** The longest the warm-up holds the loading screen, ms: a slow GPU still gets to race, it just stutters once */
export const WARM_UP_MS = 12000;
/** The warm-up camera: this high over the route, looking this far ahead along it, m */
const EYE_HEIGHT = 5;
const LOOK_AHEAD = 30;
/** Frames in a row with no shader left compiling before a stage counts as done */
const SETTLED_FRAMES = 6;

/** Where the warm-up camera stands and what it looks at, game x, y, z */
export interface WarmUpSpot {
  eye: [number, number, number];
  target: [number, number, number];
}

/**
 * Up to SPOTS places evenly round the route (game x, z), each looking ahead along it from just above the road, the
 * way the chase camera and the big screen's views see the track
 */
export function warmUpSpots(route: readonly [number, number][]): WarmUpSpot[] {
  if (route.length < 2) return [];
  const n = Math.min(SPOTS, route.length);
  const spots: WarmUpSpot[] = [];
  for (let k = 0; k < n; k++) {
    const i = Math.floor((k * route.length) / n);
    const [x, z] = route[i];
    const [nx, nz] = route[(i + 1) % route.length];
    const len = Math.hypot(nx - x, nz - z) || 1;
    spots.push({
      eye: [x, EYE_HEIGHT, z],
      target: [
        x + ((nx - x) / len) * LOOK_AHEAD,
        0,
        z + ((nz - z) / len) * LOOK_AHEAD,
      ],
    });
  }
  return spots;
}

/**
 * Compiles the shaders the race will draw while the screen still says it's loading. Babylon compiles a material
 * the first time it's drawn, and a compile stalls that frame (tens to hundreds of ms on Windows), so without this the
 * first look at each part of the track, the first boost and the first spill would each freeze the race.
 *
 * Call `frame()` once a frame before the scene renders. It first lets `scene.isReady()` start a compile for every
 * mesh, in view or not, and every particle system; then it draws the scene from each spot along the route, twice
 * round, so the variants actually drawn (instanced or not, near or far) compile too. It draws on the real canvas,
 * since the GPU also sets itself up per target the first time it draws to one, and the page's own render that
 * follows in the same frame paints over it: nobody sees the tour. `done` resolves when nothing is left to compile,
 * or after WARM_UP_MS.
 */
export class WarmUp {
  readonly done: Promise<void>;
  private readonly scene: Scene;
  private readonly spots: readonly WarmUpSpot[];
  private readonly eye: FreeCamera;
  private readonly deadline: number;
  /** -1: settling before the tour; then the index of the next spot over two laps of the spots */
  private next = -1;
  private settled = 0;
  private finished = false;
  private resolve!: () => void;

  constructor(
    scene: Scene,
    spots: readonly WarmUpSpot[],
    lens: Pick<Camera, "fov" | "minZ" | "maxZ">,
  ) {
    this.scene = scene;
    this.spots = spots;
    this.deadline = performance.now() + WARM_UP_MS;
    this.eye = new FreeCamera("warm-up-eye", Vector3.Zero(), scene, false);
    this.eye.fov = lens.fov;
    this.eye.minZ = lens.minZ;
    this.eye.maxZ = lens.maxZ;
    this.done = new Promise((resolve) => (this.resolve = resolve));
  }

  frame(): void {
    if (this.finished) return;
    if (performance.now() > this.deadline) return this.finish();
    if (this.next >= 0 && this.next < this.spots.length * 2 && this.settled) {
      this.draw(this.spots[this.next % this.spots.length]);
      this.next++;
      // settle after each lap, so the second lap sees what only shows once the first lap's shaders are in
      if (this.next % this.spots.length === 0) this.settled = 0;
      return;
    }
    const scene = this.scene;
    const ready = scene.isReady(true); // starts compiles for anything not drawn yet
    this.settled =
      ready || scene.getEngine().areAllEffectsReady() ? this.settled + 1 : 0;
    if (this.settled < SETTLED_FRAMES) return;
    if (this.next >= this.spots.length * 2) return this.finish();
    this.next = Math.max(this.next, 0);
  }

  /** Gives up without finishing (the game was disposed) */
  dispose(): void {
    this.finish();
  }

  private draw(spot: WarmUpSpot): void {
    const scene = this.scene;
    const one = scene.activeCamera;
    const many = scene.activeCameras;
    this.eye.position.set(...spot.eye);
    this.eye.setTarget(Vector3.FromArray(spot.target));
    scene.activeCameras = null;
    scene.activeCamera = this.eye;
    try {
      scene.render(true, true); // no animation steps: the page's own render does those
    } finally {
      scene.activeCamera = one;
      scene.activeCameras = many;
    }
  }

  private finish(): void {
    if (this.finished) return;
    this.finished = true;
    this.eye.dispose();
    this.resolve();
  }
}
