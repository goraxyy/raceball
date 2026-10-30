import type { PongMsg } from "./protocol";

/** How much each new ping moves the offset/jitter estimates (exponential moving average) */
const SMOOTHING = 0.1;
/** Round trips kept for p50/p95 */
const RTT_SAMPLES = 120;
/** The offset only learns from pings this close to the fastest recent round trip: a slow one (Wi-Fi retries,
 * a busy frame) was delayed one way more than the other, so its midpoint lies */
const RTT_SLACK = 1.5;
const RTT_SLACK_MS = 10;
/** Recent round trips that set "fastest" */
const RECENT = 10;
/** How fast the clock it reads out moves toward a new offset: 5% faster or slower than real time, so a
 * correction glides in instead of making every ball jump */
const SLEW = 0.05;
/** A correction bigger than this jumps (a first estimate that was way off), ms */
const SLEW_LIMIT = 250;

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
  /** The offset serverNow() reads out: it glides toward `offset` */
  private shown?: number;
  private lastRead?: number;

  onPong({ c, s }: PongMsg, now: number) {
    const rtt = now - c;
    const offset = s - (c + rtt / 2);
    if (this.offset === undefined) {
      this.offset = offset;
    } else {
      const fastest = Math.min(rtt, ...this.rtts.slice(-RECENT));
      if (rtt <= fastest * RTT_SLACK + RTT_SLACK_MS)
        this.offset += (offset - this.offset) * SMOOTHING;
      this.jitter += (Math.abs(rtt - this.rtt) - this.jitter) * SMOOTHING;
    }
    this.rtt = rtt;
    this.rtts.push(rtt);
    if (this.rtts.length > RTT_SAMPLES) this.rtts.shift();
  }

  /** Estimated server time now, ms. Smooth: a new offset glides in at SLEW */
  serverNow(now = performance.now()) {
    if (this.offset === undefined) return now;
    const error = this.offset - (this.shown ?? this.offset);
    if (this.shown === undefined || Math.abs(error) > SLEW_LIMIT)
      this.shown = this.offset;
    else {
      const most = Math.max(0, now - (this.lastRead ?? now)) * SLEW;
      this.shown += Math.min(Math.max(error, -most), most);
    }
    this.lastRead = now;
    return now + this.shown;
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
