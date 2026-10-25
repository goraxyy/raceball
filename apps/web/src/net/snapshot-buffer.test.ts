import type { BallSnap, SnapMsg } from "@raceball/shared";
import { describe, expect, test } from "vitest";
import { SnapshotBuffer } from "./snapshot-buffer";

const ball = (id: string, x: number, vx = 0, h = 0): BallSnap => ({
  id,
  p: [x, 0, 0],
  q: [0, 0, 0, 1],
  v: [vx, 0, 0],
  h,
});
const snap = (tick: number, t: number, balls: BallSnap[]): SnapMsg => ({
  tick,
  t,
  balls,
});

/** 30 Hz snapshots of ball "a" moving 1 m per snapshot, arriving evenly */
function filled() {
  const buf = new SnapshotBuffer();
  for (let i = 0; i <= 10; i++)
    buf.push(snap(i, (i * 1000) / 30, [ball("a", i, 30)]), (i * 1000) / 30);
  return buf;
}

describe("SnapshotBuffer", () => {
  test("measures the snapshot rate", () => {
    expect(filled().rate).toBeCloseTo(30);
  });

  test("interpolates other balls in the past", () => {
    const buf = filled();
    const now = (10 * 1000) / 30; // the newest snapshot's time
    const x = buf.sample(now).get("a")!.p[0];
    // 1.5 intervals behind the newest (x = 10) is x = 8.5
    expect(x).toBeCloseTo(8.5);
  });

  test("holds at the newest snapshot instead of running ahead", () => {
    const buf = filled();
    expect(buf.sample(1e6).get("a")!.p[0]).toBe(10);
  });

  test("drops late and duplicate snapshots", () => {
    const buf = filled();
    buf.push(snap(5, (5 * 1000) / 30, [ball("a", -100)]), 999);
    expect(buf.sample(1e6).get("a")!.p[0]).toBe(10);
  });

  test("extrapolates your own ball ahead, capped at 150 ms", () => {
    const buf = filled();
    buf.ownId = "a";
    const t = (10 * 1000) / 30;
    expect(buf.sample(t + 100).get("a")!.p[0]).toBeCloseTo(10 + 30 * 0.1);

    const capped = filled();
    capped.ownId = "a";
    expect(capped.sample(t + 1000).get("a")!.p[0]).toBeCloseTo(10 + 30 * 0.15);
  });

  test("blends own-ball corrections instead of snapping", () => {
    const buf = new SnapshotBuffer();
    buf.ownId = "a";
    buf.push(snap(1, 0, [ball("a", 0)]), 0);
    buf.sample(0);
    buf.push(snap(2, 16, [ball("a", 1)]), 16); // server says 1 m further
    const x = buf.sample(16).get("a")!.p[0];
    expect(x).toBeGreaterThan(0);
    expect(x).toBeLessThan(1);
  });

  test("snaps own ball on a respawn-sized jump", () => {
    const buf = new SnapshotBuffer();
    buf.ownId = "a";
    buf.push(snap(1, 0, [ball("a", 0)]), 0);
    buf.sample(0);
    buf.push(snap(2, 16, [ball("a", 50)]), 16);
    expect(buf.sample(16).get("a")!.p[0]).toBe(50);
  });

  test("only returns balls still in the newest snapshot", () => {
    const buf = new SnapshotBuffer();
    buf.push(snap(1, 0, [ball("a", 0), ball("b", 0)]), 0);
    buf.push(snap(2, 33, [ball("a", 1)]), 33);
    expect([...buf.sample(33).keys()]).toEqual(["a"]);
  });
});
