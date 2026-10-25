// Shake the phone to fire an item (docs/CONTROLLER.md). Tune both numbers on real phones.

/** Acceleration without gravity above this fires, m/s² */
export const SHAKE_THRESHOLD = 18;
/** No second fire within this, ms */
export const SHAKE_COOLDOWN_MS = 600;
/** Gravity estimate smoothing for phones that don't report acceleration without gravity */
const GRAVITY_SMOOTHING = 0.8;

type Vec = { x: number; y: number; z: number };

export class ShakeDetector {
  private lastFire = -Infinity;
  private g?: Vec;

  /**
   * Feed one devicemotion sample. Returns true when this sample fires an item.
   * @param linear e.acceleration (gravity removed); null on phones without a gyroscope
   * @param withGravity e.accelerationIncludingGravity, used to remove gravity ourselves then
   * @param t ms
   */
  feed(linear: Vec | null, withGravity: Vec, t: number): boolean {
    let a = linear;
    if (!a) {
      // High-pass: track gravity slowly, and what's left is the shake
      const g = (this.g ??= { ...withGravity });
      g.x = GRAVITY_SMOOTHING * g.x + (1 - GRAVITY_SMOOTHING) * withGravity.x;
      g.y = GRAVITY_SMOOTHING * g.y + (1 - GRAVITY_SMOOTHING) * withGravity.y;
      g.z = GRAVITY_SMOOTHING * g.z + (1 - GRAVITY_SMOOTHING) * withGravity.z;
      a = {
        x: withGravity.x - g.x,
        y: withGravity.y - g.y,
        z: withGravity.z - g.z,
      };
    }
    if (Math.hypot(a.x, a.y, a.z) < SHAKE_THRESHOLD) return false;
    if (t - this.lastFire < SHAKE_COOLDOWN_MS) return false;
    this.lastFire = t;
    return true;
  }
}
