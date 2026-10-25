import { afterEach, describe, expect, it } from "vitest";
import type { InputMsg } from "@raceball/shared";
import {
  createFlatRace,
  NEUTRAL_INPUT,
  TICK_DT,
  tuning,
  type Race,
} from "./index";

const GAS: InputMsg = { ...NEUTRAL_INPUT, gas: 1 };

let race: Race | undefined;
afterEach(() => race?.dispose());

async function soloRace(): Promise<Race> {
  race = await createFlatRace({ laps: 3 });
  race.addPlayer("me", "lion");
  race.start(0, 3);
  return race;
}

function run(r: Race, seconds: number, input?: InputMsg) {
  for (let i = 0; i < Math.round(seconds / TICK_DT); i++) {
    if (input) r.setInput("me", input);
    r.step(TICK_DT);
  }
}

const ball = (r: Race, id = "me") =>
  r.snapshot(0, 0).balls.find((b) => b.id === id)!;

describe("flat race", () => {
  it("drops the ball onto the ground and lets it settle", async () => {
    const r = await soloRace();
    run(r, 2);
    const b = ball(r);
    expect(b.p[1]).toBeCloseTo(0.5, 1);
    expect(Math.hypot(...b.v)).toBeLessThan(0.05);
  });

  it("gas rolls the ball along the heading (+Z at h = 0) and caps the speed", async () => {
    const r = await soloRace();
    run(r, 0.5);
    run(r, 4, GAS);
    const b = ball(r);
    expect(b.p[2]).toBeGreaterThan(10);
    expect(Math.abs(b.p[0] - -1.5)).toBeLessThan(0.5); // stays on its grid column
    expect(Math.hypot(b.v[0], b.v[2])).toBeLessThan(tuning.maxSpeed * 1.1);
  });

  it("steering right decreases the heading and curves the ball to -X", async () => {
    const r = await soloRace();
    run(r, 1, { ...GAS, steer: 1 });
    const b = ball(r);
    expect(b.h).toBeLessThan(-1);
    expect(b.p[0]).toBeLessThan(-1.5);
  });

  it("brake slows a rolling ball", async () => {
    const r = await soloRace();
    run(r, 2, GAS);
    const before = Math.hypot(ball(r).v[0], ball(r).v[2]);
    run(r, 1, { ...NEUTRAL_INPUT, brake: true });
    expect(Math.hypot(ball(r).v[0], ball(r).v[2])).toBeLessThan(before * 0.3);
  });

  it("parks balls in the lobby and ignores input during the countdown", async () => {
    race = await createFlatRace({ laps: 3 });
    const r = race;
    r.addPlayer("me", "lion");
    run(r, 1, GAS);
    expect(r.phase).toBe("lobby");
    expect(ball(r).v).toEqual([0, 0, 0]);

    r.start(1000, 1);
    expect(r.phase).toBe("countdown");
    expect(r.laps).toBe(1);
    run(r, 0.9, GAS);
    expect(r.phase).toBe("countdown");
    expect(Math.abs(ball(r).v[2])).toBeLessThan(0.05);
    run(r, 0.2, GAS);
    expect(r.phase).toBe("racing");
    run(r, 1, GAS);
    expect(ball(r).v[2]).toBeGreaterThan(2);
  });

  it("respawns a ball that falls off the edge and emits a respawn event", async () => {
    const r = await soloRace();
    run(r, 8, GAS); // 50 m to the edge at up to 18 m/s
    const events = r.drainEvents();
    expect(events).toContainEqual({ type: "respawn", player: "me" });
    expect(ball(r).p[1]).toBeGreaterThan(tuning.fallY);
    expect(r.drainEvents()).toEqual([]);
  });

  it("fills spawn slots in order and reuses freed ones", async () => {
    race = await createFlatRace({ laps: 3 });
    const r = race;
    for (let i = 1; i <= 8; i++) r.addPlayer(`p${i}`, "lion");
    expect(() => r.addPlayer("p9", "lion")).toThrow("full");
    expect(() => r.addPlayer("p1", "lion")).toThrow("already");
    const p3 = ball(r, "p3").p;
    r.removePlayer("p3");
    r.addPlayer("late", "lion");
    expect(ball(r, "late").p).toEqual(p3);
    expect(r.standings().map((s) => s.place)).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
  });

  it("only accepts the fixed 1/60 s step", async () => {
    const r = await soloRace();
    expect(() => r.step(1 / 30)).toThrow("1/60");
  });

  it("snapshot carries every ball with a unit quaternion", async () => {
    const r = await soloRace();
    r.addPlayer("you", "creamery");
    run(r, 1, GAS);
    const snap = r.snapshot(42, 1234);
    expect(snap.tick).toBe(42);
    expect(snap.t).toBe(1234);
    expect(snap.balls.map((b) => b.id)).toEqual(["me", "you"]);
    for (const b of snap.balls) expect(Math.hypot(...b.q)).toBeCloseTo(1, 5);
  });
});
