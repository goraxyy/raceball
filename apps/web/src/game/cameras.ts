import { Scene, UniversalCamera, Vector3 } from "@babylonjs/core";
import { BALL_RADIUS, tuning, type Tuning } from "@raceball/game-core";

/** First-person eye: just over the top of the ball, looking ahead and a little down, m */
const EYE_HEIGHT = BALL_RADIUS + 0.45;
/** …and this far ahead of its centre, so your own ball and its planet ring stay out of the view */
const EYE_FORWARD = 0.7;
const EYE_LOOK_AHEAD = 12;
const EYE_LOOK_DOWN = 1.6;
/** How fast the view turns with the ball's heading (per second): steady, but no lag you can feel */
const EYE_TURN = 12;
/** A little wider than the chase camera, for a sense of speed */
const EYE_FOV = 1.25;

/**
 * Driving view from on top of the ball, for the big screen's split screen. The ball rolls, so the camera follows
 * its position and heading, never its rotation. The heading is smoothed so snapshot jitter doesn't shake the view.
 */
export class FirstPersonCamera {
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
      .add(fwd.scale(EYE_FORWARD))
      .addInPlace(new Vector3(0, EYE_HEIGHT, 0));
    this.camera.position.copyFrom(eye);
    this.camera.setTarget(
      eye
        .add(fwd.scale(EYE_LOOK_AHEAD))
        .subtractInPlace(new Vector3(0, EYE_LOOK_DOWN, 0)),
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
