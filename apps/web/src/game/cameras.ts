import { Scene, UniversalCamera, Vector3 } from "@babylonjs/core";
import { BALL_RADIUS, tuning, type Tuning } from "@raceball/game-core";
import type { GameEvent } from "@raceball/shared";

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

/** How fast the chase FOV follows the speed (per second): a boost pad widens it in a beat, not a snap */
const FOV_FOLLOW = 4;
/** A ball that moved further than this in one frame was respawned or reset: no speed, no landing, m */
const TELEPORT = 5;
/** A landing shakes once it stops a fall faster than LAND_MIN (about a 2 m drop), at full strength from LAND_FULL, m/s */
const LAND_MIN = 6;
const LAND_FULL = 14;
/** Slower than this downward and the ball has landed, m/s */
const LAND_STOPPED = 1.5;
/** How long a fall is remembered, so a landing that net smoothing spreads over a few frames still counts, s */
const LAND_MEMORY = 0.15;
/** Grid swoop: it starts this far in front of the ball and this high, looking back over the grid, m */
const SWOOP_DISTANCE = 16;
const SWOOP_HEIGHT = 10;
const SWOOP_LOOK_BACK = 4;
/** The swoop lands behind the ball this long before the countdown ends, so a late state patch can't cut it short, s */
const SWOOP_SETTLE = 0.4;

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

/** The chase FOV (rad) at a speed (m/s): camFovBase standing still, widening on an S-curve to camFovMax at camFovSpeed */
export function chaseFov(speed: number, t: Tuning = tuning): number {
  const s = smoothstep(t.camFovSpeed > 0 ? speed / t.camFovSpeed : 1);
  return t.camFovBase + (t.camFovMax - t.camFovBase) * s;
}

/** How much of a hit of `strength` (0…1) still shakes the view `age` s later: 0…1, dying out over `seconds` */
export function shakeEnvelope(
  strength: number,
  age: number,
  seconds: number,
): number {
  if (age < 0 || age >= seconds) return 0;
  const left = 1 - age / seconds;
  return clamp01(strength) * left * left;
}

/**
 * Where the look point wobbles `time` s into a shake, -1…1 on each axis. Two sines per axis at unrelated rates, so it
 * never reads as a loop, and it starts on a dip, so the hit lands on the first frame.
 */
export function shakeWobble(time: number): Vector3 {
  return new Vector3(
    0.6 * Math.sin(time * 41 + 0.7) + 0.4 * Math.sin(time * 67 + 2.1),
    -0.6 * Math.cos(time * 53) - 0.4 * Math.cos(time * 89 + 0.4),
    0.6 * Math.sin(time * 37 + 1.9) + 0.4 * Math.sin(time * 73 + 0.3),
  );
}

/**
 * Big landings, once a frame. `fall` is how fast the ball fell lately (m/s, fading over LAND_MEMORY), `vy` its vertical
 * speed now. Returns the fall to keep, and a shake strength that is 0 unless the ball just stopped a fall of LAND_MIN.
 */
export function landing(
  fall: number,
  vy: number,
  dt: number,
): { fall: number; shake: number } {
  const falling = Math.max(-vy, 0);
  const fell = Math.max(falling, fall * Math.exp(-dt / LAND_MEMORY));
  if (falling > LAND_STOPPED || fell < LAND_MIN)
    return { fall: fell, shake: 0 };
  return {
    fall: falling,
    shake: clamp01((fell - LAND_MIN) / (LAND_FULL - LAND_MIN)),
  };
}

/** How hard an event shakes your chase camera, 0…1: a bump you're in, by its strength. fx.ts can add more */
export function eventShake(
  event: GameEvent,
  ownId: string | null | undefined,
): number {
  if (!ownId || event.type !== "bump") return 0;
  return event.a === ownId || event.b === ownId ? event.strength : 0;
}

/** How far through the grid swoop the camera is (0…1), `elapsed` s into a countdown of `seconds` */
export function swoopProgress(elapsed: number, seconds: number): number {
  const flight = seconds - SWOOP_SETTLE;
  return flight > 0 ? clamp01(elapsed / flight) : 1;
}

/**
 * The grid swoop at progress `s` (0…1). It starts high in front of the ball, looking back over the grid, swings round
 * one side as it comes down, and ends exactly on the chase pose, so the chase camera takes over without a bump.
 */
export function swoopPose(
  s: number,
  ball: Vector3,
  h: number,
  t: Tuning = tuning,
): { position: Vector3; target: Vector3 } {
  const e = smoothstep(s);
  const angle = Math.PI * (1 - e); // from in front of the ball (π) round to behind it (0)
  const distance = lerp(SWOOP_DISTANCE, t.camDistance, e);
  const fwd = new Vector3(Math.sin(h), 0, Math.cos(h));
  const side = new Vector3(Math.cos(h), 0, -Math.sin(h));
  const position = ball
    .subtract(fwd.scale(Math.cos(angle) * distance))
    .addInPlace(side.scale(Math.sin(angle) * distance))
    .addInPlace(new Vector3(0, lerp(SWOOP_HEIGHT, t.camHeight, e), 0));
  const target = ball.add(fwd.scale(lerp(-SWOOP_LOOK_BACK, t.camLookAhead, e)));
  return { position, target };
}

/**
 * Chase camera. The ball rolls, so the camera is never parented to it: it follows the heading.
 * Smoothing uses 1 - exp(-k·dt), so it feels the same at any frame rate. The FOV widens with speed, `shake()` jolts
 * the view (your bumps and big landings here, more from fx.ts), and during the countdown it swoops in over the grid.
 * Players who ask their OS for reduced motion get no shake and no swoop.
 */
export class ChaseCamera {
  readonly camera: UniversalCamera;
  private readonly t: Tuning;
  private readonly motion?: MediaQueryList;
  private placed = false;
  private last?: Vector3;
  private fall = 0;
  private shakeStrength = 0;
  private shakeAge = Infinity;

  constructor(scene: Scene, t: Tuning = tuning) {
    this.t = t;
    this.camera = new UniversalCamera(
      "chase",
      new Vector3(0, t.camHeight, -t.camDistance),
      scene,
    );
    this.camera.minZ = 0.1;
    this.camera.fov = t.camFovBase;
    this.camera.inputs.clear(); // the game drives it, not the mouse
    this.motion =
      typeof matchMedia === "function"
        ? matchMedia("(prefers-reduced-motion: reduce)")
        : undefined;
  }

  /** Jolts the view: strength 0…1, where 1 is the biggest bump. A weaker shake never cuts a stronger one short */
  shake(strength: number): void {
    if (this.motion?.matches) return;
    const now = shakeEnvelope(
      this.shakeStrength,
      this.shakeAge,
      this.t.camShakeSeconds,
    );
    if (strength <= now) return;
    this.shakeStrength = strength;
    this.shakeAge = 0;
  }

  /** ball = rendered ball position, h = heading, dt in seconds, swoop = grid swoop progress (0…1) during the countdown */
  follow(ball: Vector3, h: number, dt: number, swoop?: number): void {
    const t = this.t;
    this.track(ball, dt);
    const fwd = new Vector3(Math.sin(h), 0, Math.cos(h));
    let target: Vector3;
    if (swoop !== undefined && swoop < 1 && !this.motion?.matches) {
      const pose = swoopPose(swoop, ball, h, t);
      this.camera.position.copyFrom(pose.position);
      target = pose.target;
      this.placed = true;
    } else {
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
      target = ball.add(fwd.scale(t.camLookAhead));
    }
    const amount =
      shakeEnvelope(this.shakeStrength, this.shakeAge, t.camShakeSeconds) *
      t.camShake;
    if (amount > 0)
      target.addInPlace(shakeWobble(this.shakeAge).scaleInPlace(amount));
    this.shakeAge += dt;
    this.camera.setTarget(target);
  }

  /** Speed for the FOV and falls for landings, from how far the ball moved since the last frame */
  private track(ball: Vector3, dt: number): void {
    const last = this.last;
    this.last = ball.clone();
    if (!last || dt <= 0) return;
    const moved = ball.subtract(last);
    if (moved.length() > TELEPORT) {
      this.fall = 0; // respawned: neither a speed nor a landing
      return;
    }
    const fov = chaseFov(Math.hypot(moved.x, moved.z) / dt, this.t);
    this.camera.fov +=
      (fov - this.camera.fov) * (1 - Math.exp(-FOV_FOLLOW * dt));
    const land = landing(this.fall, moved.y / dt, dt);
    this.fall = land.fall;
    if (land.shake > 0) this.shake(land.shake);
  }
}

function clamp01(x: number): number {
  return Math.min(Math.max(x, 0), 1);
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

/** 0 → 0 and 1 → 1, flat at both ends */
function smoothstep(x: number): number {
  const s = clamp01(x);
  return s * s * (3 - 2 * s);
}
