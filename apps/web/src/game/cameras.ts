import { Scene, UniversalCamera, Vector3 } from "@babylonjs/core";
import { BALL_RADIUS, tuning, type Tuning } from "@raceball/game-core";

/** Driver's view: low and close behind the ball, so you watch it roll down the road ahead, m */
const EYE_BEHIND = 2.6;
const EYE_HEIGHT = BALL_RADIUS + 0.8;
/** Where it looks: a little ahead of the ball, just above the road */
const EYE_LOOK_AHEAD = 6;
const EYE_LOOK_UP = BALL_RADIUS * 0.6;
/** How fast the view swings round with the ball's heading (per second): steady, but no lag you can feel */
const EYE_TURN = 10;
/** A little wider than the chase camera, for a sense of speed */
const EYE_FOV = 1.2;

/**
 * The big screen's split-screen view: low and close behind each player's ball, so they see it rolling while they
 * drive. The ball rolls, so the camera follows its position and heading, never its rotation. The heading is
 * smoothed so snapshot jitter doesn't shake the view.
 */
export class DriverCamera {
  readonly camera: UniversalCamera;
  private heading?: number;

  constructor(scene: Scene, name: string) {
    this.camera = new UniversalCamera(
      name,
      new Vector3(0, EYE_HEIGHT, 0),
      scene,
    );
    this.camera.minZ = 0.05;
    this.camera.fov = EYE_FOV;
    this.camera.inputs.clear(); // the game drives it
  }

  /** ball = rendered ball position, h = heading, dt in seconds */
  follow(ball: Vector3, h: number, dt: number): void {
    if (this.heading === undefined) {
      this.heading = h;
    } else {
      const turn = Math.atan2(
        Math.sin(h - this.heading),
        Math.cos(h - this.heading),
      ); // the short way round
      this.heading += turn * (1 - Math.exp(-EYE_TURN * dt));
    }
    const fwd = new Vector3(Math.sin(this.heading), 0, Math.cos(this.heading));
    const eye = ball
      .subtract(fwd.scale(EYE_BEHIND))
      .addInPlace(new Vector3(0, EYE_HEIGHT, 0));
    this.camera.position.copyFrom(eye);
    this.camera.setTarget(
      ball
        .add(fwd.scale(EYE_LOOK_AHEAD))
        .addInPlace(new Vector3(0, EYE_LOOK_UP, 0)),
    );
  }
}

/**
 * Chase camera v0. The ball rolls, so the camera is never parented to it: it follows the heading.
 * Smoothing uses 1 - exp(-k·dt), so it feels the same at any frame rate.
 */
export class ChaseCamera {
  readonly camera: UniversalCamera;
  private readonly t: Tuning;
  private placed = false;

  constructor(scene: Scene, t: Tuning = tuning) {
    this.t = t;
    this.camera = new UniversalCamera(
      "chase",
      new Vector3(0, t.camHeight, -t.camDistance),
      scene,
    );
    this.camera.minZ = 0.1;
    this.camera.fov = 1.0;
    this.camera.inputs.clear(); // the game drives it, not the mouse
  }

  /** ball = rendered ball position, h = heading, dt in seconds */
  follow(ball: Vector3, h: number, dt: number): void {
    const t = this.t;
    const fwd = new Vector3(Math.sin(h), 0, Math.cos(h));
    const desired = ball
      .subtract(fwd.scale(t.camDistance))
      .addInPlace(new Vector3(0, t.camHeight, 0));
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
