/**
 * How much the screen draws, as one ladder for every screen (laptops, the big screen, local mode). The top rungs
 * render sharper than the page's pixels, on hi-dpi screens (most Windows laptops run at 125-150% display scaling,
 * so drawing one pixel per page pixel and stretching it looks pixelly). Lower rungs give up the costly effects
 * before they give up sharpness, and only then draw fewer pixels.
 */
export interface QualityLevel {
  /** Image pixels per page pixel (never above the screen's devicePixelRatio) */
  scale: number;
  /** The glow on the boost pads and paw lights (laptops only; the big screen never has it) */
  glow: boolean;
  /**
   * The balls' shadows, drawn or not. Off only stops drawing them: every rung keeps the same shaders, since switching
   * the shadows' filtering or the shadows themselves out of the materials recompiles them all, a freeze mid-race
   */
  shadows: boolean;
}

export const QUALITY_LADDER: readonly QualityLevel[] = [
  { scale: 1.5, glow: true, shadows: true },
  { scale: 1.25, glow: true, shadows: true },
  { scale: 1, glow: true, shadows: true },
  { scale: 1, glow: false, shadows: true },
  { scale: 0.85, glow: false, shadows: true },
  { scale: 0.7, glow: false, shadows: true },
  { scale: 0.6, glow: false, shadows: false },
];

/** The ladder for a screen: rungs sharper than its devicePixelRatio would cost pixels nobody can see */
export function ladderFor(dpr: number): QualityLevel[] {
  const top = Math.max(1, dpr);
  return QUALITY_LADDER.filter((q) => q.scale <= top + 1e-6);
}

/** Right after a change (new render passes, shaders compiling) the fps doesn't count, s */
const GRACE = 3;
/** Under the target this long: a rung down, s */
const LOW_SECONDS = 2.5;
/** Well over the target this long: a rung back up, s */
const HIGH_SECONDS = 8;
/** "Well over": this much more than the target, fps */
const HEADROOM = 12;
/** A frame longer than this is a stall (a model loading, a tab switch), not a slow screen, s… */
const HITCH = 0.25;
/** …unless this many come in a row: then the screen really is that slow */
const STALLS_IN_A_ROW = 3;
/** How long the frame time is averaged over, s */
const WINDOW = 0.5;

/**
 * Picks the rung each frame from the measured frame rate: down a rung after LOW_SECONDS under the target, back up
 * after HIGH_SECONDS with room to spare, but never back onto a rung that already proved too slow (no see-sawing).
 * One-off stalls and a hidden page don't count; long frames in a row do.
 */
export class QualityGovernor {
  /** Index into the ladder */
  level: number;
  readonly ladder: readonly QualityLevel[];
  /** fps the screen should hold: 55 for a laptop, about 30 for the big screen's split screen */
  target: number;
  /** The best rung that proved too slow: never climb back to it */
  private floor = -1;
  private frameTime = 1 / 60;
  private low = 0;
  private high = 0;
  private grace = GRACE;
  private stalls = 0;

  constructor(ladder: readonly QualityLevel[], target: number, start = 0) {
    this.ladder = ladder;
    this.target = target;
    this.level = Math.min(start, ladder.length - 1);
  }

  get quality(): QualityLevel {
    return this.ladder[this.level];
  }

  /** Call every frame. True when the rung changed: apply `quality` */
  update(dt: number, hidden = false): boolean {
    if (hidden) {
      this.restart(); // a hidden page barely draws; judge it afresh once it's back
      return false;
    }
    if (dt <= 0) return false;
    if (dt > HITCH) {
      if (++this.stalls < STALLS_IN_A_ROW) return false;
      dt = Math.min(dt, 1);
    } else this.stalls = 0;
    this.frameTime += (dt - this.frameTime) * Math.min(1, dt / WINDOW);
    if (this.grace > 0) {
      this.grace -= dt;
      return false;
    }
    const fps = 1 / this.frameTime;
    this.low = fps < this.target ? this.low + dt : 0;
    this.high = fps > this.target + HEADROOM ? this.high + dt : 0;
    if (this.low >= LOW_SECONDS && this.level + 1 < this.ladder.length) {
      this.floor = Math.max(this.floor, this.level);
      return this.step(+1);
    }
    if (this.high >= HIGH_SECONDS && this.level - 1 > this.floor)
      return this.step(-1);
    return false;
  }

  /** Something changed what the screen draws (the split screen's views): wait out the grace again */
  restart(): void {
    this.grace = GRACE;
    this.low = 0;
    this.high = 0;
  }

  private step(by: number): boolean {
    this.level += by;
    this.restart();
    return true;
  }
}
