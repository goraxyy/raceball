import { Scene, UniversalCamera, Vector3 } from "@babylonjs/core";
import { tuning, type Tuning } from "@raceball/game-core";

/**
 * Chase camera v0. The ball rolls, so the camera is never parented to it: it follows the heading.
 * Smoothing uses 1 - exp(-k·dt), so it feels the same at any frame rate.
 */
export class ChaseCamera {
  readonly camera: UniversalCamera;
  private placed = false;

  constructor(scene: Scene, private readonly t: Tuning = tuning) {
    this.camera = new UniversalCamera("chase", new Vector3(0, t.camHeight, -t.camDistance), scene);
    this.camera.minZ = 0.1;
    this.camera.fov = 1.0;
    this.camera.inputs.clear(); // the game drives it, not the mouse
  }

  /** ball = rendered ball position, h = heading, dt in seconds */
  follow(ball: Vector3, h: number, dt: number): void {
    const t = this.t;
    const fwd = new Vector3(Math.sin(h), 0, Math.cos(h));
    const desired = ball.subtract(fwd.scale(t.camDistance)).addInPlace(new Vector3(0, t.camHeight, 0));
    if (!this.placed) {
      this.camera.position.copyFrom(desired); // first frame: start behind the ball instead of swooping in
      this.placed = true;
    } else {
      const k = 1 - Math.exp(-t.camStiffness * dt);
      this.camera.position = Vector3.Lerp(this.camera.position, desired, k);
    }
    this.camera.setTarget(ball.add(fwd.scale(t.camLookAhead)));
  }
}
