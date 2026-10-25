import { OneEuroFilter } from "./one-euro";
import { settings } from "./settings";

/** Default phone rotation for full lock (players can change it in the settings) */
export const MAX_STEER = (45 * Math.PI) / 180;
/** Fraction of full lock ignored around center */
export const DEAD_ZONE = 0.05;
/** Below this in-screen gravity (m/s²) the phone is nearly flat, so the angle is noise */
const MIN_PLANE_GRAVITY = 3;

/** Set by calibration (M1). neutral = angle when held level; sign = +1 or -1 so right is positive. */
export interface Calibration {
  neutral: number;
  sign: 1 | -1;
}

/** Keep an angle within -π…π */
export const wrap = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));

export const deadzone = (x: number, dz = DEAD_ZONE) =>
  Math.abs(x) < dz ? 0 : (Math.sign(x) * (Math.abs(x) - dz)) / (1 - dz);

/** Finer control near center; clamps to -1…1 */
export const curve = (x: number) =>
  Math.sign(x) * Math.min(1, Math.abs(x)) ** 1.5;

/** Where gravity points in the screen plane, in the device frame (immune to page rotation) */
export const gravityAngle = (gx: number, gy: number) => Math.atan2(gy, gx);

export class Steering {
  private fx = new OneEuroFilter();
  private fy = new OneEuroFilter();
  gx = 0;
  gy = 0;
  steer = 0;
  calib: Calibration | null = null;
  /** Full-lock angle and dead zone: the player's accessibility settings (settings.ts) */
  tuning: { sensitivityDeg: number; deadZone: number } = {
    sensitivityDeg: (MAX_STEER * 180) / Math.PI,
    deadZone: DEAD_ZONE,
  };

  /** Feed raw gravity; t in seconds */
  update(x: number, y: number, t: number) {
    this.gx = this.fx.filter(x, t);
    this.gy = this.fy.filter(y, t);
  }

  get angle() {
    return gravityAngle(this.gx, this.gy);
  }

  /** -1 full left … 1 full right. 0 until calibrated; holds the last value while the phone is flat. */
  read(): number {
    if (!this.calib) return 0;
    if (Math.hypot(this.gx, this.gy) < MIN_PLANE_GRAVITY) return this.steer;
    const delta = wrap(this.angle - this.calib.neutral) * this.calib.sign;
    const maxSteer = (this.tuning.sensitivityDeg * Math.PI) / 180;
    return (this.steer = curve(
      deadzone(delta / maxSteer, this.tuning.deadZone),
    ));
  }
}

export const steering = new Steering();
steering.tuning = settings; // the live settings object: changes apply at once
