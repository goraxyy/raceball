import { NullEngine, Scene, Vector3 } from "@babylonjs/core";
import { tuning } from "@raceball/game-core";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  ChaseCamera,
  chaseFov,
  eventShake,
  landing,
  shakeEnvelope,
  shakeWobble,
  swoopPose,
  swoopProgress,
} from "./cameras";

const t = { ...tuning };

describe("chaseFov", () => {
  it("is camFovBase standing still and camFovMax from camFovSpeed up", () => {
    expect(chaseFov(0, t)).toBe(t.camFovBase);
    expect(chaseFov(t.camFovSpeed, t)).toBeCloseTo(t.camFovMax);
    expect(chaseFov(t.camFovSpeed * 2, t)).toBeCloseTo(t.camFovMax);
  });

  it("widens smoothly: never narrower at a higher speed, no jumps, flat near a standstill", () => {
    let last = chaseFov(0, t);
    for (let v = 0.5; v <= 30; v += 0.5) {
      const fov = chaseFov(v, t);
      expect(fov).toBeGreaterThanOrEqual(last);
      expect(fov - last).toBeLessThan(0.02);
      last = fov;
    }
    expect(chaseFov(1, t) - t.camFovBase).toBeLessThan(0.002); // crawling doesn't breathe the view
  });

  it("is camFovMax when camFovSpeed is slid to 0", () => {
    expect(chaseFov(0, { ...t, camFovSpeed: 0 })).toBe(t.camFovMax);
  });
});

describe("shakeEnvelope", () => {
  it("starts at the strength and dies out over the duration", () => {
    expect(shakeEnvelope(0.6, 0, 0.5)).toBeCloseTo(0.6);
    expect(shakeEnvelope(0.6, 0.25, 0.5)).toBeCloseTo(0.15);
    expect(shakeEnvelope(0.6, 0.5, 0.5)).toBe(0);
    expect(shakeEnvelope(0.6, 2, 0.5)).toBe(0);
    let last = Infinity;
    for (let age = 0; age < 0.5; age += 0.01) {
      const amount = shakeEnvelope(1, age, 0.5);
      expect(amount).toBeLessThan(last);
      last = amount;
    }
  });

  it("clamps the strength to 0…1, and nothing before the hit", () => {
    expect(shakeEnvelope(3, 0, 0.5)).toBe(1);
    expect(shakeEnvelope(-1, 0, 0.5)).toBe(0);
    expect(shakeEnvelope(1, -0.1, 0.5)).toBe(0);
    expect(shakeEnvelope(1, 0, 0)).toBe(0);
  });
});

describe("shakeWobble", () => {
  it("stays within -1…1, hits on the first frame and moves smoothly", () => {
    expect(shakeWobble(0).y).toBeLessThan(-0.9);
    let last = shakeWobble(0);
    for (let time = 0.002; time < 1; time += 0.002) {
      const w = shakeWobble(time);
      for (const v of [w.x, w.y, w.z])
        expect(Math.abs(v)).toBeLessThanOrEqual(1);
      expect(Vector3.Distance(w, last)).toBeLessThan(0.4);
      last = w;
    }
  });
});

describe("landing", () => {
  const dt = 1 / 60;
  /** Feeds vertical speeds in frame by frame, and returns every shake */
  const run = (speeds: number[]) => {
    let fall = 0;
    const shakes: number[] = [];
    for (const vy of speeds) {
      const out = landing(fall, vy, dt);
      fall = out.fall;
      if (out.shake > 0) shakes.push(out.shake);
    }
    return shakes;
  };
  const freeFall = (to: number) =>
    Array.from(
      { length: Math.ceil(to / (9.81 * dt)) },
      (_, i) => -9.81 * dt * (i + 1),
    );

  it("shakes once when a big fall stops, harder for a bigger fall", () => {
    const small = run([...freeFall(8), 0, 0, 0]);
    const big = run([...freeFall(13), 0, 0, 0]);
    expect(small).toHaveLength(1);
    expect(big).toHaveLength(1);
    expect(big[0]).toBeGreaterThan(small[0]);
  });

  it("doesn't shake for a short hop, a steady slope or a slope easing out", () => {
    expect(run([...freeFall(4), 0, 0])).toEqual([]);
    expect(run(Array(120).fill(-6))).toEqual([]);
    const easing = Array.from({ length: 40 }, (_, i) => -8 * (1 - i / 39));
    expect(run([...Array(30).fill(-8), ...easing])).toEqual([]);
  });

  it("still counts a landing that net smoothing spreads over a few frames", () => {
    expect(run([...freeFall(12), -8, -4, -1, 0])).toHaveLength(1);
  });
});

describe("eventShake", () => {
  const bump = { type: "bump" as const, a: "me", b: "you", strength: 0.7 };

  it("shakes for bumps you're in, by their strength", () => {
    expect(eventShake(bump, "me")).toBe(0.7);
    expect(eventShake({ ...bump, a: "you", b: "me" }, "me")).toBe(0.7);
  });

  it("ignores other players' bumps, other events and the big screen", () => {
    expect(eventShake(bump, "them")).toBe(0);
    expect(eventShake(bump, null)).toBe(0);
    expect(eventShake({ type: "lap", player: "me", lap: 2 }, "me")).toBe(0);
  });

  it("shakes when a Lion Paw kicks your own ball", () => {
    const kick = {
      type: "bounce" as const,
      player: "me",
      pos: [0, 0, 0] as [number, number, number],
    };
    expect(eventShake(kick, "me")).toBeGreaterThan(0.3);
    expect(eventShake({ ...kick, player: "you" }, "me")).toBe(0);
  });
});

describe("grid swoop", () => {
  const ball = new Vector3(10, 2, -5);
  const h = 0.8;
  const fwd = new Vector3(Math.sin(h), 0, Math.cos(h));

  it("runs through the countdown and lands before it ends", () => {
    expect(swoopProgress(0, 3)).toBe(0);
    expect(swoopProgress(1.3, 3)).toBeCloseTo(0.5);
    expect(swoopProgress(2.7, 3)).toBe(1);
    expect(swoopProgress(5, 3)).toBe(1);
    expect(swoopProgress(0, 0.2)).toBe(1); // too short to fly: straight to the chase pose
  });

  it("starts high in front of the ball, looking back over the grid", () => {
    const { position, target } = swoopPose(0, ball, h, t);
    const ahead = Vector3.Dot(position.subtract(ball), fwd);
    expect(ahead).toBeGreaterThan(10);
    expect(position.y - ball.y).toBeGreaterThan(t.camHeight * 2);
    expect(Vector3.Dot(target.subtract(ball), fwd)).toBeLessThan(0);
  });

  it("ends exactly on the chase pose", () => {
    const { position, target } = swoopPose(1, ball, h, t);
    const chase = ball
      .subtract(fwd.scale(t.camDistance))
      .add(new Vector3(0, t.camHeight, 0));
    expect(Vector3.Distance(position, chase)).toBeLessThan(1e-9);
    expect(
      Vector3.Distance(target, ball.add(fwd.scale(t.camLookAhead))),
    ).toBeLessThan(1e-9);
  });

  it("comes down smoothly and never closer to the ball than the chase camera", () => {
    let last = swoopPose(0, ball, h, t).position;
    for (let s = 0.01; s <= 1; s += 0.01) {
      const { position } = swoopPose(s, ball, h, t);
      expect(position.y).toBeLessThanOrEqual(last.y + 1e-9);
      expect(Vector3.Distance(position, last)).toBeLessThan(1);
      expect(Vector3.Distance(position, ball)).toBeGreaterThanOrEqual(
        Math.hypot(t.camDistance, t.camHeight) - 1e-9,
      );
      last = position;
    }
  });
});

describe("ChaseCamera", () => {
  let engine: NullEngine;
  let scene: Scene;
  let reduced = false;

  beforeEach(() => {
    engine = new NullEngine();
    scene = new Scene(engine);
    reduced = false;
    vi.stubGlobal("matchMedia", (query: string) => ({
      get matches() {
        return query.includes("reduce") && reduced;
      },
    }));
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    scene.dispose();
    engine.dispose();
  });

  /** Drives the ball along +Z at `speed` for `seconds`, and returns where it ended */
  const drive = (
    chase: ChaseCamera,
    speed: number,
    seconds: number,
    from = 0,
  ) => {
    const dt = 1 / 60;
    let z = from;
    for (let time = 0; time < seconds; time += dt) {
      z += speed * dt;
      chase.follow(new Vector3(0, 0.5, z), 0, dt);
    }
    return z;
  };
  /** Pitch and yaw, rad: setTarget sets them right away, while getTarget() waits for a render */
  const lookDir = (chase: ChaseCamera) => chase.camera.rotation.clone();

  it("widens the FOV with speed and eases back when you stop", () => {
    const chase = new ChaseCamera(scene, t);
    expect(chase.camera.fov).toBe(t.camFovBase);
    const z = drive(chase, 18, 3);
    expect(chase.camera.fov).toBeCloseTo(chaseFov(18, t), 2);
    drive(chase, 0, 3, z);
    expect(chase.camera.fov).toBeCloseTo(t.camFovBase, 2);
  });

  it("ignores a respawn's jump instead of reading it as speed", () => {
    const chase = new ChaseCamera(scene, t);
    chase.follow(new Vector3(0, 0.5, 0), 0, 1 / 60);
    chase.follow(new Vector3(0, 0.5, 80), 0, 1 / 60);
    expect(chase.camera.fov).toBe(t.camFovBase);
  });

  it("shake() jolts the view, then settles back", () => {
    const calm = new ChaseCamera(scene, t);
    const shaken = new ChaseCamera(scene, t);
    drive(calm, 0, 0.5);
    drive(shaken, 0, 0.5);
    shaken.shake(1);
    drive(calm, 0, 1 / 60);
    drive(shaken, 0, 1 / 60);
    expect(Vector3.Distance(lookDir(calm), lookDir(shaken))).toBeGreaterThan(
      0.02,
    );
    drive(calm, 0, t.camShakeSeconds + 0.1);
    drive(shaken, 0, t.camShakeSeconds + 0.1);
    expect(Vector3.Distance(lookDir(calm), lookDir(shaken))).toBeLessThan(1e-6);
  });

  it("doesn't shake or swoop with reduced motion", () => {
    reduced = true;
    const calm = new ChaseCamera(scene, t);
    const chase = new ChaseCamera(scene, t);
    drive(calm, 0, 0.5);
    drive(chase, 0, 0.5);
    chase.shake(1);
    calm.follow(new Vector3(0, 0.5, 0), 0, 1 / 60, 0);
    chase.follow(new Vector3(0, 0.5, 0), 0, 1 / 60, 0);
    expect(Vector3.Distance(lookDir(calm), lookDir(chase))).toBeLessThan(1e-6);
    expect(chase.camera.position.z).toBeLessThan(0); // still behind the ball, not out in front
  });

  it("swoops during the countdown and hands over to the chase without a jump", () => {
    const chase = new ChaseCamera(scene, t);
    const ball = new Vector3(0, 0.5, 0);
    chase.follow(ball, 0, 1 / 60, 0);
    expect(chase.camera.position.z).toBeGreaterThan(10); // out in front of the grid
    for (let s = 0.01; s < 1; s += 0.01) chase.follow(ball, 0, 1 / 60, s);
    const landed = chase.camera.position.clone();
    expect(landed.z).toBeCloseTo(-t.camDistance, 1);
    chase.follow(ball, 0, 1 / 60, 1); // the last moments of the countdown
    chase.follow(ball, 0, 1 / 60); // racing
    expect(Vector3.Distance(chase.camera.position, landed)).toBeLessThan(0.01);
  });
});
