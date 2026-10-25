import type { PongMsg } from "./protocol";

/** How much each new ping moves the offset/jitter estimates (exponential moving average) */
const SMOOTHING = 0.1;
/** Round trips kept for p50/p95 */
const RTT_SAMPLES = 120;

/**
 * Estimates the server clock from ping/pong (NTP-style), and tracks round-trip stats.
 * Local times are performance.now(); server times are the server's Date.now().
 */
export class Clock {
  /** Server clock minus local clock, ms. Undefined until the first pong */
  offset?: number;
  /** Latest round trip, ms */
  rtt = 0;
  /** Average change in round trip between pings, ms */
  jitter = 0;
  private rtts: number[] = [];

  onPong({ c, s }: PongMsg, now: number) {
    const rtt = now - c;
    const offset = s - (c + rtt / 2);
    if (this.offset === undefined) {
      this.offset = offset;
    } else {
      this.offset += (offset - this.offset) * SMOOTHING;
      this.jitter += (Math.abs(rtt - this.rtt) - this.jitter) * SMOOTHING;
    }
    this.rtt = rtt;
    this.rtts.push(rtt);
    if (this.rtts.length > RTT_SAMPLES) this.rtts.shift();
  }

  /** Estimated server time now, ms */
  serverNow(now = performance.now()) {
    return now + (this.offset ?? 0);
  }

  /** Round-trip percentile over the last ~2 minutes, e.g. percentile(95) */
  percentile(p: number): number {
    if (!this.rtts.length) return 0;
    const sorted = [...this.rtts].sort((a, b) => a - b);
    return sorted[
      Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length))
    ];
  }
}
