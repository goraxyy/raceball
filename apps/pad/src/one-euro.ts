// One Euro filter (Casiez et al. 2012): smooths jitter when still, follows fast moves with little lag.
// https://gery.casiez.net/1euro/

const alpha = (cutoff: number, dt: number) => {
  const tau = 1 / (2 * Math.PI * cutoff);
  return 1 / (1 + tau / dt);
};

export class OneEuroFilter {
  private x?: number;
  private dx = 0;
  private t?: number;
  private minCutoff: number;
  private beta: number;
  private dCutoff: number;

  /**
   * @param minCutoff Hz. Lower = smoother when still, more lag.
   * @param beta How fast the cutoff rises with speed. Higher = less lag on fast moves.
   * @param dCutoff Hz, for the derivative.
   */
  constructor(minCutoff = 1, beta = 0.05, dCutoff = 1) {
    this.minCutoff = minCutoff;
    this.beta = beta;
    this.dCutoff = dCutoff;
  }

  /** @param t Timestamp in seconds */
  filter(x: number, t: number): number {
    if (this.x === undefined || this.t === undefined || t <= this.t) {
      this.x = x;
      this.t = t;
      return x;
    }
    const dt = t - this.t;
    this.t = t;
    const dxRaw = (x - this.x) / dt;
    this.dx += alpha(this.dCutoff, dt) * (dxRaw - this.dx);
    const cutoff = this.minCutoff + this.beta * Math.abs(this.dx);
    this.x += alpha(cutoff, dt) * (x - this.x);
    return this.x;
  }

  reset() {
    this.x = undefined;
    this.t = undefined;
    this.dx = 0;
  }
}
