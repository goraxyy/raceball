import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { Document, NodeIO, type Buffer } from "@gltf-transform/core";
import { afterEach, describe, expect, it } from "vitest";
import type { GameEvent, InputMsg } from "@raceball/shared";
import {
  NEUTRAL_INPUT,
  TICK_DT,
  tuning,
  type Race,
  type Tuning,
} from "./index";
import { createFlatRace, createRace } from "./race";

const R = 30; // the loop's radius: a circle through the origin, centered on (30, 0)
const ROUTE_POINTS = 48;
const GATES = [0, 12, 24, 36]; // route points with a gate: a quarter of the loop apart

/** The loop at route point k (racing way: north from the origin, curving right). */
function onLoop(k: number) {
  const a = Math.PI - (2 * Math.PI * k) / ROUTE_POINTS;
  return {
    x: R + R * Math.cos(a),
    z: R * Math.sin(a),
    heading: Math.atan2(Math.sin(a), -Math.cos(a)),
  };
}

const yaw = (h: number): [number, number, number, number] => [
  0,
  Math.sin(h / 2),
  0,
  Math.cos(h / 2),
];

/** A solid box mesh with half-extents h, for the ground. */
function box(doc: Document, buffer: Buffer, [hx, hy, hz]: number[]) {
  const pos = [];
  for (const y of [-hy, hy])
    for (const [x, z] of [
      [-hx, -hz],
      [hx, -hz],
      [hx, hz],
      [-hx, hz],
    ])
      pos.push(x, y, z);
  // counter-clockwise from outside, so every face's normal points out of the box
  const idx = [
    0, 1, 2, 0, 2, 3, 4, 6, 5, 4, 7, 6, 0, 5, 1, 0, 4, 5, 1, 6, 2, 1, 5, 6, 2,
    7, 3, 2, 6, 7, 3, 4, 0, 3, 7, 4,
  ];
  const prim = doc
    .createPrimitive()
    .setAttribute(
      "POSITION",
      doc
        .createAccessor()
        .setType("VEC3")
        .setArray(new Float32Array(pos))
        .setBuffer(buffer),
    )
    .setIndices(
      doc
        .createAccessor()
        .setType("SCALAR")
        .setArray(new Uint32Array(idx))
        .setBuffer(buffer),
    );
  return doc.createMesh().addPrimitive(prim);
}

/**
 * A loop on flat ground: gates cp_00 … cp_03 a quarter of the loop apart, a respawn 2 m after
 * each, the grid behind cp_00 facing north, and (unless route is false) the route marker.
 */
async function loopTrack(route = true): Promise<Uint8Array> {
  const doc = new Document();
  const buffer = doc.createBuffer();
  const scene = doc.createScene();
  scene.addChild(
    doc
      .createNode("ground_col")
      .setTranslation([R, -0.5, 0])
      .setMesh(box(doc, buffer, [80, 0.5, 80])),
  );
  const add = (name: string, extras: Record<string, unknown>) => {
    const n = doc.createNode(name).setExtras(extras);
    scene.addChild(n);
    return n;
  };
  GATES.forEach((k, index) => {
    const at = onLoop(k);
    add(`cp_0${index}`, { rb: "checkpoint", index, section: `s${index}` })
      .setTranslation([at.x, 1, at.z])
      .setScale([4, 2, 0.5])
      .setRotation(yaw(at.heading));
    add(`respawn_0${index}`, { rb: "respawn", checkpoint: index })
      .setTranslation([
        at.x + 2 * Math.sin(at.heading),
        0,
        at.z + 2 * Math.cos(at.heading),
      ])
      .setRotation(yaw(at.heading));
  });
  for (let slot = 1; slot <= 8; slot++)
    add(`spawn_${slot}`, { rb: "spawn", slot }).setTranslation([
      slot % 2 ? -1.5 : 1.5,
      0,
      -3 - 3 * Math.floor((slot - 1) / 2),
    ]);
  if (route) {
    const points = [];
    for (let k = 0; k < ROUTE_POINTS; k++) {
      const at = onLoop(k);
      points.push(at.x, at.z);
    }
    add("route", { rb: "route", points });
  }
  return new NodeIO().writeBinary(doc);
}

let race: Race | undefined;
afterEach(() => {
  race?.dispose();
  race = undefined;
});

async function loopRace(
  players: string[],
  laps: number,
  opts: { route?: boolean; tuning?: Partial<Tuning> } = {},
): Promise<Race> {
  race = await createRace(
    await loopTrack(opts.route),
    new NodeIO(),
    { laps },
    { ...tuning, ...opts.tuning },
  );
  for (const id of players) race.addPlayer(id, "earth");
  race.start(0, laps);
  return race;
}

/**
 * Steps the race: bots drive with botInput, everyone else holds their given input.
 * Stops when `until` is true or after `seconds`; returns the events and the time taken.
 */
function run(
  r: Race,
  seconds: number,
  opts: {
    bots?: string[];
    hold?: Record<string, InputMsg>;
    until?: (r: Race) => boolean;
  } = {},
) {
  const events: (GameEvent & { at: number })[] = [];
  let t = 0;
  for (let i = 1; i <= Math.round(seconds / TICK_DT); i++) {
    for (const id of opts.bots ?? []) r.setInput(id, r.botInput(id));
    for (const [id, input] of Object.entries(opts.hold ?? {}))
      r.setInput(id, input);
    r.step(TICK_DT);
    t = i * TICK_DT;
    for (const e of r.drainEvents()) events.push({ ...e, at: t });
    if (opts.until?.(r)) break;
  }
  return { events, t };
}

const standing = (r: Race, id: string) =>
  r.standings().find((s) => s.id === id)!;

describe("laps, finishing and the results phase", () => {
  it("counts laps at the finish line, then finishes the race when everyone is in", async () => {
    const r = await loopRace(["bot"], 2);
    const { events } = run(r, 60, {
      bots: ["bot"],
      until: (r) => r.phase === "results",
    });

    const story = events
      .filter((e) => e.type === "lap" || e.type === "finish")
      .map((e) => ({ ...e, at: undefined }));
    expect(story).toEqual([
      { type: "lap", player: "bot", lap: 2, at: undefined },
      { type: "finish", player: "bot", place: 1, at: undefined },
    ]);
    expect(r.phase).toBe("results");
    const s = standing(r, "bot");
    expect(s).toMatchObject({ place: 1, lap: 2, checkpoint: 0 });
    // two laps of a 30 m circle at up to 18 m/s
    expect(s.finishedAt).toBeGreaterThan(((2 * 2 * Math.PI * R) / 18) * 1000);
    expect(s.finishedAt).toBeLessThan(40_000);
    expect(events.some((e) => e.type === "respawn")).toBe(false);
  });

  it("ranks by distance along the route, and reports each racer's lap and last checkpoint", async () => {
    const r = await loopRace(["bot", "parked"], 3);
    run(r, 6, { bots: ["bot"] });
    const [first, second] = r.standings();
    expect(first).toMatchObject({ id: "bot", place: 1, lap: 1 });
    expect(first.checkpoint).toBeGreaterThanOrEqual(1);
    expect(first.progress).toBeGreaterThan(50);
    expect(second).toMatchObject({
      id: "parked",
      place: 2,
      lap: 1,
      checkpoint: 0,
    });
    expect(second.progress).toBeLessThan(0); // still on the grid, behind the line
  });

  it("puts finishers first, in finishing order, and ends the race finishGraceSeconds after the winner", async () => {
    const r = await loopRace(["fast", "parked"], 1, {
      tuning: { finishGraceSeconds: 2 },
    });
    const { events } = run(r, 60, {
      bots: ["fast"],
      until: (r) => r.phase === "results",
    });
    const finish = events.find((e) => e.type === "finish")!;
    expect(finish).toMatchObject({ player: "fast", place: 1 });
    const ended = events[events.length - 1]?.at ?? 0;
    expect(r.phase).toBe("results");
    expect(standing(r, "fast")).toMatchObject({ place: 1 });
    expect(standing(r, "parked")).toMatchObject({ place: 2, finishedAt: null });
    expect(ended).toBeGreaterThanOrEqual(finish.at);
  });

  it("ignores input once a ball has finished, so it rolls to a stop", async () => {
    const r = await loopRace(["done", "parked"], 1);
    run(r, 60, {
      bots: ["done"],
      until: (r) => standing(r, "done").finishedAt !== null,
    });
    const speed = () => {
      const [vx, , vz] = r.snapshot(0, 0).balls.find((b) => b.id === "done")!.v;
      return Math.hypot(vx, vz);
    };
    const atFinish = speed();
    run(r, 3, { hold: { done: { ...NEUTRAL_INPUT, gas: 1 } } });
    expect(speed()).toBeLessThan(atFinish);
    expect(r.phase).toBe("racing"); // "parked" hasn't finished, and the grace period hasn't run out
  });

  it("doesn't count a lap for a ball that turns round and crosses the finish line backwards", async () => {
    // balls can't normally turn round (maxRouteAngle); lift that to check the gates on their own
    const r = await loopRace(["me"], 1, {
      tuning: { maxRouteAngle: Math.PI },
    });
    run(r, 1.5, { hold: { me: { ...NEUTRAL_INPUT, gas: 1 } } }); // over the line, heading north
    // then steer back south through the middle of the line, to a point behind the grid's front row
    const events: GameEvent[] = [];
    let ball = r.snapshot(0, 0).balls[0];
    for (let i = 0; i < 10 / TICK_DT && ball.p[2] > -4; i++) {
      const off = Math.atan2(0 - ball.p[0], -8 - ball.p[2]) - ball.h;
      const turn = Math.atan2(Math.sin(off), Math.cos(off)); // -π … π
      r.setInput("me", {
        ...NEUTRAL_INPUT,
        steer: Math.max(-1, Math.min(1, -2.5 * turn)),
        gas: Math.abs(turn) < 0.5 ? 1 : 0,
        brake: Math.abs(turn) > 1.5,
      });
      r.step(TICK_DT);
      events.push(...r.drainEvents());
      ball = r.snapshot(0, 0).balls[0];
    }
    expect(ball.p[2], "back behind the line").toBeLessThan(-3);
    expect(Math.abs(ball.p[0]), "through the gate, not round it").toBeLessThan(
      4,
    );
    expect(
      events.filter((e) => e.type === "lap" || e.type === "finish"),
    ).toEqual([]);
    expect(standing(r, "me")).toMatchObject({
      lap: 1,
      finishedAt: null,
      progress: 0,
    });
  });
});

describe("no turning round", () => {
  it("full steer one way never turns the heading more than maxRouteAngle from the road", async () => {
    const r = await loopRace(["me"], 1);
    run(r, 1, { hold: { me: { ...NEUTRAL_INPUT, gas: 1 } } }); // up to speed, heading north along the loop
    let worst = 0;
    for (let i = 0; i < 4 / TICK_DT; i++) {
      // hard left, away from the loop's right-hand curve, at a crawl so the ball stays near the road
      r.setInput("me", { ...NEUTRAL_INPUT, steer: -1, gas: 0.3 });
      r.step(TICK_DT);
      const ball = r.snapshot(0, 0).balls[0];
      // the loop's direction at the nearest point: a circle round (30, 0), driven clockwise seen from above
      if (Math.hypot(ball.p[0] - R, ball.p[2]) < R / 3) continue; // near the middle every way is "radial"
      const a = Math.atan2(ball.p[2], ball.p[0] - R);
      const road = Math.atan2(Math.sin(a), -Math.cos(a));
      const off = Math.abs(
        Math.atan2(Math.sin(ball.h - road), Math.cos(ball.h - road)),
      );
      worst = Math.max(worst, off);
    }
    expect(worst).toBeLessThanOrEqual(tuning.maxRouteAngle + 0.1); // the race reads the road a tick behind
    expect(worst).toBeGreaterThan(tuning.maxRouteAngle - 0.2); // it did reach the limit
  });

  it("a track without a route doesn't limit the heading", async () => {
    race = await createFlatRace({ laps: 1 });
    race.addPlayer("me", "earth");
    race.start(0, 1);
    run(race, 3, { hold: { me: { ...NEUTRAL_INPUT, steer: 1, gas: 0.5 } } });
    const turned = -race.snapshot(0, 0).balls[0].h; // steer right lowers the heading
    expect(turned).toBeGreaterThan(Math.PI);
  });
});

describe("drifting", () => {
  /** A flat race with one ball up to speed, going straight. One race at a time; afterEach frees the last */
  async function upToSpeed(): Promise<Race> {
    race?.dispose();
    const r = (race = await createFlatRace({ laps: 1 }));
    r.addPlayer("me", "earth");
    r.start(0, 1);
    run(r, 1.2, { hold: { me: { ...NEUTRAL_INPUT, gas: 1 } } });
    return r;
  }
  const hold = (r: Race, input: Partial<InputMsg>, seconds: number) =>
    run(r, seconds, { hold: { me: { ...NEUTRAL_INPUT, ...input } } });
  const me = (r: Race) => r.snapshot(0, 0).balls[0];
  const speedOf = (b: { v: number[] }) => Math.hypot(b.v[0], b.v[2]);
  const course = (v: number[]) => Math.atan2(v[0], v[2]);

  /** Up to speed, then `seconds` of `input`: how far the heading and the path turned right */
  async function drive(input: Partial<InputMsg>, seconds: number) {
    const r = await upToSpeed();
    const start = me(r);
    hold(r, input, seconds);
    const b = me(r);
    return {
      race: r,
      ball: b,
      speed: speedOf(b),
      turned: start.h - b.h,
      pathTurned: course(start.v) - course(b.v),
    };
  }

  it("brake into a turn at speed drifts: keeps speed and turns tighter than steering alone", async () => {
    const drift = await drive({ steer: 1, gas: 1, brake: true }, 0.8);
    expect(drift.ball.d).toBe(1);
    const steer = await drive({ steer: 1, gas: 1 }, 0.8);
    const brake = await drive({ gas: 1, brake: true }, 0.8);
    expect(drift.turned).toBeGreaterThan(steer.turned);
    expect(drift.pathTurned).toBeGreaterThan(steer.pathTurned); // the ball goes round tighter, not just spins
    expect(drift.speed).toBeGreaterThan(brake.speed * 1.5); // a drift isn't a brake
    expect(drift.speed).toBeGreaterThan(tuning.driftKeepSpeed);
  });

  it("brake with the wheel straight still brakes, and doesn't drift", async () => {
    const r = await drive({ brake: true }, 0.4);
    expect(r.ball.d).toBe(0);
  });

  it("steering out of a drift widens the line but keeps turning its way", async () => {
    const tight = await drive({ steer: 1, gas: 1, brake: true }, 0.8);
    const r = await upToSpeed();
    const h0 = me(r).h;
    hold(r, { steer: 1, gas: 1, brake: true }, 0.1);
    hold(r, { steer: -1, gas: 1, brake: true }, 0.7);
    const wide = h0 - me(r).h;
    expect(wide).toBeGreaterThan(0); // still turning right
    expect(wide).toBeLessThan(tight.turned);
  });

  it("letting go after a long drift fires a mini-turbo", async () => {
    const gainAfter = async (seconds: number) => {
      const d = await drive({ steer: 0.6, gas: 1, brake: true }, seconds);
      hold(d.race, { gas: 1 }, 0.05);
      const after = me(d.race);
      expect(after.d).toBe(0);
      return speedOf(after) - d.speed;
    };
    const short = await gainAfter(0.3);
    const long = await gainAfter(1);
    expect(long).toBeGreaterThan(short + tuning.driftTurboSpeed * 0.6);
  });
});

describe("bump and overtake events", () => {
  it("emits one bump per hit, with a strength from the impact, when a ball rams another", async () => {
    // flat ground: slot 3 starts 3 m straight behind slot 1
    race = await createFlatRace({ laps: 1 });
    for (const id of ["front", "side", "back"]) race.addPlayer(id, "earth");
    race.start(0, 1);
    const gas = { back: { ...NEUTRAL_INPUT, gas: 1 } };
    const first = run(race, 1, { hold: gas }).events;
    expect(first.filter((e) => e.type === "bump")).toEqual([
      expect.objectContaining({ a: "front", b: "back" }),
    ]); // pushing after the hit stays under bumpForceMin
    const [hit] = first.filter((e) => e.type === "bump") as Extract<
      GameEvent,
      { type: "bump" }
    >[];
    expect(hit.strength).toBeGreaterThan(0.2);
    expect(hit.strength).toBeLessThan(0.6);

    // with the gas still held, the back ball catches up and hits again: never within bumpCooldown
    const later = run(race, 3, { hold: gas }).events.filter(
      (e) => e.type === "bump",
    );
    const times = [
      first.find((e) => e.type === "bump")!.at,
      ...later.map((e) => e.at + 1),
    ];
    for (let i = 1; i < times.length; i++)
      expect(times[i] - times[i - 1]).toBeGreaterThanOrEqual(
        tuning.bumpCooldown,
      );
  });

  it("never reports a ball landing on or rolling along the track as a bump", async () => {
    race = await createFlatRace({ laps: 1 });
    race.addPlayer("me", "earth");
    race.start(0, 1);
    const { events } = run(race, 4, {
      hold: { me: { ...NEUTRAL_INPUT, gas: 1 } },
    });
    expect(events.filter((e) => e.type === "bump")).toEqual([]);
  });

  it("emits overtake, with the section, once a racer is clearly ahead of the one in front", async () => {
    const r = await loopRace(["parked", "bot"], 1); // side by side on the front row
    const { events } = run(r, 5, { bots: ["bot"] });
    const overtakes = events.filter((e) => e.type === "overtake");
    expect(overtakes).toEqual([
      expect.objectContaining({
        type: "overtake",
        player: "bot",
        passed: "parked",
        section: "s0",
      }),
    ]);
  });
});

describe("botInput", () => {
  it("heads for the next checkpoint on a track without a route", async () => {
    const r = await loopRace(["bot"], 1, { route: false });
    run(r, 20, {
      bots: ["bot"],
      until: (r) => standing(r, "bot").checkpoint >= 2,
    });
    expect(standing(r, "bot").checkpoint).toBeGreaterThanOrEqual(2);
  });

  it("returns neutral input for a player who isn't in the race", async () => {
    const r = await loopRace(["bot"], 1);
    expect(r.botInput("nobody")).toEqual(NEUTRAL_INPUT);
  });
});

const realTrack = fileURLToPath(
  new URL("../tracks/happy_valley_col.glb", import.meta.url),
);
it("a bot laps Happy Valley within 2 minutes", async () => {
  race = await createRace(
    new Uint8Array(readFileSync(realTrack)),
    new NodeIO(),
    {
      laps: 1,
    },
  );
  race.addPlayer("bot", "earth");
  race.start(0, 1);
  const { events, t } = run(race, 120, {
    bots: ["bot"],
    until: (r) => r.phase === "results",
  });
  expect(race.phase, `still racing after ${t.toFixed(1)} s`).toBe("results");
  const finish = standing(race, "bot").finishedAt!;
  console.log(
    `bot lap: ${(finish / 1000).toFixed(1)} s, respawns: ${events.filter((e) => e.type === "respawn").length}`,
  );
  expect(finish).toBeLessThan(120_000);
}, 60_000);
