import { wrap, type Calibration } from "./steering";

/** Step 1: hold level this long, ms */
export const LEVEL_MS = 1000;
/** Step 1 restarts if the phone moves more than this from the running average, rad */
const STEADY = (10 * Math.PI) / 180;
/** Step 2: turn at least this far, rad */
export const TURN = (25 * Math.PI) / 180;
/** …and hold it there this long, so a passing wobble doesn't finish calibration, ms */
export const HOLD_MS = 400;
/**
 * Turning the phone clockwise ("right") always increases the gravity angle, on iPhone and Android
 * alike (iOS flips every axis, which doesn't change the direction of rotation). So a left turn is
 * the player's mistake, not the phone's. Only if they hold it this long do we accept it, in case
 * some phone reports mirrored axes, ms.
 */
export const WRONG_WAY_MS = 3000;
/** Below this in-screen gravity (m/s²) the phone is lying flat, not held like a wheel */
const MIN_PLANE_GRAVITY = 3;
const STORAGE_KEY = "raceball:calibration";

/** Average of angles that may straddle ±π */
export function circularMean(angles: number[]): number {
  let s = 0;
  let c = 0;
  for (const a of angles) {
    s += Math.sin(a);
    c += Math.cos(a);
  }
  return Math.atan2(s, c);
}

/**
 * The 2-step calibration from docs/CONTROLLER.md:
 * 1. hold it level for a second → neutral angle
 * 2. turn right → which way the angle moved is +1 (handles iPhone vs Android and either landscape)
 */
export class Calibrator {
  step: 1 | 2 = 1;
  /** 0…1 for the current step's meter */
  progress = 0;
  /** Step 2: the player is turning left instead of right */
  wrongWay = false;
  private turnedSince?: number;
  private turnedSign: 1 | -1 = 1;
  private samples: number[] = [];
  private since?: number;
  private neutral = 0;

  /**
   * Feed one sensor sample. Returns the calibration once step 2 is done.
   * @param angle gravity angle in the screen plane (rad), @param planeG its magnitude (m/s²), @param t ms
   */
  feed(angle: number, planeG: number, t: number): Calibration | undefined {
    if (planeG < MIN_PLANE_GRAVITY) {
      if (this.step === 1) this.restart();
      return;
    }
    if (this.step === 1) {
      const mean = this.samples.length ? circularMean(this.samples) : angle;
      if (Math.abs(wrap(angle - mean)) > STEADY) this.restart();
      this.since ??= t;
      this.samples.push(angle);
      this.progress = Math.min((t - this.since) / LEVEL_MS, 1);
      if (this.progress >= 1) {
        this.neutral = circularMean(this.samples);
        this.step = 2;
        this.progress = 0;
      }
      return;
    }
    const delta = wrap(angle - this.neutral);
    const sign = delta > 0 ? 1 : -1;
    this.wrongWay = delta < -TURN;
    if (Math.abs(delta) < TURN || sign !== this.turnedSign) {
      this.turnedSince = undefined; // not far enough, or switched direction: start the hold again
      this.turnedSign = sign;
    }
    if (Math.abs(delta) >= TURN) this.turnedSince ??= t;
    const held = this.turnedSince === undefined ? 0 : t - this.turnedSince;
    // The meter fills as you turn right, and finishes while you hold it
    this.progress =
      delta > 0
        ? Math.min(delta / TURN, 1) * 0.8 + Math.min(held / HOLD_MS, 1) * 0.2
        : 0;
    if (delta > 0 && held >= HOLD_MS) return { neutral: this.neutral, sign: 1 };
    if (delta < 0 && held >= WRONG_WAY_MS)
      return { neutral: this.neutral, sign: -1 };
  }

  private restart() {
    this.samples = [];
    this.since = undefined;
    this.progress = 0;
  }
}

/** Saved so a reload doesn't force recalibrating. localStorage can throw in private mode */
export function saveCalibration(calib: Calibration) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(calib));
  } catch {
    // not saved; the player just calibrates again next time
  }
}

export function loadCalibration(): Calibration | null {
  try {
    const c = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "null");
    if (typeof c?.neutral === "number" && (c.sign === 1 || c.sign === -1))
      return c;
  } catch {
    // ignore
  }
  return null;
}
