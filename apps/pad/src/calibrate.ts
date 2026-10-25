import { wrap, type Calibration } from "./steering";

/** Step 1: hold level this long, ms */
export const LEVEL_MS = 1000;
/** Step 1 restarts if the phone moves more than this from the running average, rad */
const STEADY = (10 * Math.PI) / 180;
/** Step 2 completes once the phone has turned this far, rad */
export const TURN = (20 * Math.PI) / 180;
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
    this.progress = Math.min(Math.abs(delta) / TURN, 1);
    if (this.progress >= 1)
      return { neutral: this.neutral, sign: delta > 0 ? 1 : -1 };
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
