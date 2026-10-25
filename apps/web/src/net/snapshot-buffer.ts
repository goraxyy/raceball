import type { BallSnap, SnapMsg } from "@raceball/shared";
import { lerpAngle, lerpVec, slerp, type Quat, type Vec3 } from "./math";

/** Snapshots kept (~0.5 s at 60 Hz) */
const MAX_SNAPS = 30;
/** Own-ball extrapolation never looks further ahead than this, ms */
const MAX_EXTRAPOLATE = 150;
/** How fast the shown own ball catches up with the extrapolated one (per second), from Ali's guide */
const CORRECTION_RATE = 15;
/** Bigger jumps than this (m) are respawns or teleports: snap instead of blending */
const SNAP_DISTANCE = 5;
const SMOOTHING = 0.1;

/** What the renderer draws for one ball */
export interface BallPose {
  p: Vec3;
  q: Quat;
  h: number;
}

/**
 * Buffers server snapshots and turns them into smooth poses at display rate.
 * Other balls are interpolated slightly in the past; your own ball is extrapolated ahead.
 */
export class SnapshotBuffer {
  /** The local player's ball, drawn ahead with extrapolation. Unset on the big screen */
  ownId?: string;
  /** Average time between snapshots, ms (server clock) */
  interval = 1000 / 30;
  /** Average snapshot arrival jitter, ms */
  jitter = 0;
  /** Snapshots accepted so far */
  received = 0;
  private snaps: SnapMsg[] = [];
  private lastArrival?: number;
  private shownOwn?: BallPose;
  private lastSampleAt?: number;

  /** Snapshots per second actually arriving */
  get rate() {
    return 1000 / this.interval;
  }

  /** Render delay for other balls, ms: 1.5 intervals, more when snapshots arrive unevenly */
  get interpDelay() {
    return Math.max(1.5 * this.interval, this.interval + 2 * this.jitter);
  }

  /** @param arrivedAt local performance.now() when the message arrived */
  push(snap: SnapMsg, arrivedAt: number) {
    const newest = this.snaps.at(-1);
    if (newest && snap.tick <= newest.tick) return; // late or duplicate
    if (newest && this.lastArrival !== undefined) {
      const gap = snap.t - newest.t;
      this.interval += (gap - this.interval) * SMOOTHING;
      const arrivalGap = arrivedAt - this.lastArrival;
      this.jitter += (Math.abs(arrivalGap - gap) - this.jitter) * SMOOTHING;
    }
    this.lastArrival = arrivedAt;
    this.snaps.push(snap);
    this.received++;
    if (this.snaps.length > MAX_SNAPS) this.snaps.shift();
  }

  /** Poses for every ball in the newest snapshot, at server time `serverNow` */
  sample(serverNow: number): Map<string, BallPose> {
    const poses = new Map<string, BallPose>();
    const newest = this.snaps.at(-1);
    if (!newest) return poses;

    const renderAt = serverNow - this.interpDelay;
    const [a, b, t] = this.bracket(renderAt);
    for (const ball of newest.balls) {
      if (ball.id === this.ownId) continue;
      const from = a.balls.find((x) => x.id === ball.id) ?? ball;
      const to = b.balls.find((x) => x.id === ball.id) ?? ball;
      poses.set(ball.id, {
        p: lerpVec(from.p, to.p, t),
        q: slerp(from.q, to.q, t),
        h: lerpAngle(from.h, to.h, t),
      });
    }

    const own = this.ownId && newest.balls.find((x) => x.id === this.ownId);
    if (own) poses.set(own.id, this.sampleOwn(own, newest.t, serverNow));
    this.lastSampleAt = serverNow;
    return poses;
  }

  /** The two snapshots around `at`, and how far between them it is (0–1). Holds at the ends */
  private bracket(at: number): [SnapMsg, SnapMsg, number] {
    const snaps = this.snaps;
    if (at <= snaps[0].t) return [snaps[0], snaps[0], 0];
    for (let i = snaps.length - 1; i > 0; i--) {
      const a = snaps[i - 1];
      const b = snaps[i];
      if (at >= a.t && at <= b.t) return [a, b, (at - a.t) / (b.t - a.t || 1)];
    }
    const last = snaps[snaps.length - 1];
    return [last, last, 0];
  }

  private sampleOwn(
    ball: BallSnap,
    snapT: number,
    serverNow: number,
  ): BallPose {
    const ahead =
      Math.min(Math.max(serverNow - snapT, 0), MAX_EXTRAPOLATE) / 1000;
    const target: BallPose = {
      p: [
        ball.p[0] + ball.v[0] * ahead,
        ball.p[1] + ball.v[1] * ahead,
        ball.p[2] + ball.v[2] * ahead,
      ],
      q: ball.q,
      h: ball.h,
    };
    const shown = this.shownOwn;
    const dt =
      this.lastSampleAt === undefined
        ? 0
        : Math.max(serverNow - this.lastSampleAt, 0) / 1000;
    const jump = shown && Math.hypot(...target.p.map((v, i) => v - shown.p[i]));
    if (!shown || jump === undefined || jump > SNAP_DISTANCE) {
      this.shownOwn = target;
      return target;
    }
    // Blend toward the target instead of snapping, so corrections don't jerk the camera
    const k = 1 - Math.exp(-CORRECTION_RATE * dt);
    this.shownOwn = {
      p: lerpVec(shown.p, target.p, k),
      q: slerp(shown.q, target.q, k),
      h: lerpAngle(shown.h, target.h, k),
    };
    return this.shownOwn;
  }
}
