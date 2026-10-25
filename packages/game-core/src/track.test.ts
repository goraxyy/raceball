import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import RAPIER from "@dimforge/rapier3d-compat";
import { Document, NodeIO, type Buffer, type Node } from "@gltf-transform/core";
import { afterEach, describe, expect, it } from "vitest";
import type { InputMsg } from "@raceball/shared";
import { NEUTRAL_INPUT, TICK_DT, tuning, type Race } from "./index";
import { createWorld, initPhysics } from "./physics";
import { createRace } from "./race";
import { pointAt, project as alongPath } from "./path";
import { checkTrack, loadTrack, type TrackData } from "./track";

const FACE_PLUS_X: [number, number, number, number] = [
  0,
  Math.SQRT1_2,
  0,
  Math.SQRT1_2,
]; // 90° around +Y: local +Z turns to +X

/** A grid of quads in the XZ plane facing up, so the trimesh has internal edges. */
function groundMesh(doc: Document, buffer: Buffer, half: number, cells = 4) {
  const pos: number[] = [];
  const idx: number[] = [];
  for (let z = 0; z <= cells; z++)
    for (let x = 0; x <= cells; x++)
      pos.push(
        -half + (2 * half * x) / cells,
        0,
        -half + (2 * half * z) / cells,
      );
  for (let z = 0; z < cells; z++)
    for (let x = 0; x < cells; x++) {
      const a = z * (cells + 1) + x;
      const c = a + cells + 1;
      idx.push(a, c, a + 1, a + 1, c, c + 1);
    }
  return mesh(doc, buffer, pos, idx);
}

function boxMesh(doc: Document, buffer: Buffer, h: number) {
  const pos: number[] = [];
  for (const x of [-h, h])
    for (const y of [-h, h]) for (const z of [-h, h]) pos.push(x, y, z);
  // the surface loader only uses the convex hull, so a few triangles are enough
  return mesh(doc, buffer, pos, [0, 1, 2, 1, 3, 2, 4, 6, 5, 5, 6, 7]);
}

/** A closed box with outward-facing triangles, for solid walls. */
function solidBox(doc: Document, buffer: Buffer, [hx, hy, hz]: number[]) {
  const pos: number[] = [];
  for (const x of [-hx, hx])
    for (const y of [-hy, hy]) for (const z of [-hz, hz]) pos.push(x, y, z);
  // vertex i = x * 4 + y * 2 + z; two triangles per face, counter-clockwise from outside
  return mesh(
    doc,
    buffer,
    pos,
    [
      0, 1, 3, 0, 3, 2, 4, 6, 7, 4, 7, 5, 0, 4, 5, 0, 5, 1, 2, 3, 7, 2, 7, 6, 0,
      2, 6, 0, 6, 4, 1, 5, 7, 1, 7, 3,
    ],
  );
}

function mesh(doc: Document, buffer: Buffer, pos: number[], idx: number[]) {
  const position = doc
    .createAccessor()
    .setType("VEC3")
    .setArray(new Float32Array(pos))
    .setBuffer(buffer);
  const indices = doc
    .createAccessor()
    .setType("SCALAR")
    .setArray(new Uint32Array(idx))
    .setBuffer(buffer);
  return doc
    .createMesh()
    .addPrimitive(
      doc
        .createPrimitive()
        .setAttribute("POSITION", position)
        .setIndices(indices),
    );
}

/**
 * A small raceable track, built like the Blender export: a scaled ground under a moved parent,
 * and markers under their own moved parent, listed out of order. The grid faces +X, and gates
 * 0..3 stand across the road at x = 0, 8, 16, 24, each with a respawn 2 m after it. The ground
 * ends at x = ±40.
 * - wall: a solid wall across the road at x = 12, between gates 1 and 2
 * - swapGates: gates 1 and 2 trade places, so a ball crosses them out of order
 * - surface: a surface volume over the road from x = -4 to 24, covering the grid
 * - itemsAt: extra item boxes at these [x, z] spots on the road (grid slot 1 is at [-3, -1.5])
 * A power-2 boost pad across the road at x = 20 faces +X.
 */
async function syntheticTrack(
  opts: {
    spawns?: boolean;
    wall?: boolean;
    swapGates?: boolean;
    route?: boolean;
    surface?: { kind: string; grip: number };
    itemsAt?: [number, number][];
  } = {},
): Promise<Uint8Array> {
  const doc = new Document();
  const buffer = doc.createBuffer();
  const scene = doc.createScene();

  const collision = doc.createNode("collision").setTranslation([0, -1, 0]);
  collision.addChild(
    doc
      .createNode("ground_col")
      .setScale([2, 1, 2])
      .setMesh(groundMesh(doc, buffer, 20)),
  );
  if (opts.wall)
    collision.addChild(
      doc
        .createNode("wall_col")
        .setTranslation([12, 1, 0])
        .setMesh(solidBox(doc, buffer, [0.5, 2, 6])),
    );
  const markers = doc.createNode("markers").setTranslation([0, -1, 0]);
  const add = (
    name: string,
    extras: Record<string, unknown>,
    setup?: (n: Node) => void,
  ) => {
    const n = doc.createNode(name).setExtras(extras);
    setup?.(n);
    markers.addChild(n);
  };

  if (opts.spawns !== false)
    for (let slot = 8; slot >= 1; slot--)
      add(`spawn_${slot}`, { rb: "spawn", slot }, (n) =>
        n
          .setTranslation([-3 * slot, 0, slot % 2 ? -1.5 : 1.5])
          .setRotation(FACE_PLUS_X),
      );
  for (const index of [2, 0, 3, 1]) {
    const slot =
      opts.swapGates && (index === 1 || index === 2) ? 3 - index : index;
    add(
      `cp_0${index}`,
      { rb: "checkpoint", index, section: `s${index}` },
      (n) =>
        n
          .setTranslation([slot * 8, 1, 0])
          .setScale([3, 2, 0.5]) // 6 m across the road, 1 m thick
          .setRotation(FACE_PLUS_X),
    );
    add(`respawn_0${index}`, { rb: "respawn", checkpoint: index }, (n) =>
      n.setTranslation([index * 8 + 2, 0, 0]).setRotation(FACE_PLUS_X),
    );
  }
  add("item_1", { rb: "item" }, (n) => n.setTranslation([12, 0, 4]));
  opts.itemsAt?.forEach(([x, z], i) =>
    add(`item_test_${i}`, { rb: "item" }, (n) => n.setTranslation([x, 0, z])),
  );
  add("boost_1", { rb: "boost", power: 2 }, (n) =>
    n.setTranslation([20, 0, 0]).setScale([3, 1, 1]).setRotation(FACE_PLUS_X),
  );
  if (opts.surface)
    add("surface_road", { rb: "surface", ...opts.surface }, (n) =>
      n.setTranslation([10, 0, 0]).setMesh(solidBox(doc, buffer, [14, 1, 4])),
    );
  add("surface_1", { rb: "surface", grip: 0.2, kind: "icecream" }, (n) =>
    n.setTranslation([0, 0, 10]).setMesh(boxMesh(doc, buffer, 1)),
  );
  add("cam_1", { rb: "camera", section: "start" }, (n) =>
    n.setTranslation([0, 15, -20]),
  );
  if (opts.route)
    // a 30 m x 10 m rectangle in the node's space; the node sits 5 m along x
    add("route", { rb: "route", points: [-5, 0, 25, 0, 25, 10, -5, 10] }, (n) =>
      n.setTranslation([5, 0, 0]),
    );

  scene.addChild(collision).addChild(markers);
  return new NodeIO().writeBinary(doc);
}

describe("loadTrack", () => {
  it("reads every marker type, in world space, sorted", async () => {
    await initPhysics();
    const world = createWorld();
    const track = await loadTrack(world, await syntheticTrack(), new NodeIO());

    expect(track.spawns.map((s) => s.slot)).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
    expect(track.spawns[0].pos).toEqual([-3, -1, -1.5]); // parent moved it down 1 m
    expect(track.spawns[0].heading).toBeCloseTo(Math.PI / 2);

    expect(track.checkpoints.map((c) => [c.index, c.section])).toEqual([
      [0, "s0"],
      [1, "s1"],
      [2, "s2"],
      [3, "s3"],
    ]);
    const gate = world.getCollider(track.checkpoints[1].collider);
    expect(gate.isSensor()).toBe(true);
    expect(gate.halfExtents()).toEqual({ x: 3, y: 2, z: 0.5 }); // the Empty's scale

    expect(track.respawns).toHaveLength(4);
    expect(track.respawns.find((r) => r.checkpoint === 3)?.pos).toEqual([
      26, -1, 0,
    ]);
    expect(track.items).toEqual([{ pos: [12, -1, 4] }]);
    expect(track.boosts[0]).toMatchObject({
      pos: [20, -1, 0],
      power: 2,
      heading: expect.closeTo(Math.PI / 2),
    });
    expect(track.surfaces).toMatchObject([{ kind: "icecream", grip: 0.2 }]);
    expect(world.getCollider(track.surfaces[0].collider).isSensor()).toBe(true);
    expect(track.cameras).toMatchObject([
      { section: "start", pos: [0, 14, -20] },
    ]);
    expect(checkTrack(track)).toEqual([]);
    world.free();
  });
});

describe("the route marker", () => {
  it("becomes a closed path in world space, and the race exposes its points", async () => {
    await initPhysics();
    const world = createWorld();
    try {
      const glb = await syntheticTrack({ route: true });
      const track = await loadTrack(world, glb, new NodeIO());
      expect(track.path?.points).toEqual([
        [0, 0],
        [30, 0],
        [30, 10],
        [0, 10],
      ]);
      expect(track.path?.length).toBeCloseTo(80);
      const race = await createRace(glb, new NodeIO(), { laps: 1 });
      expect(race.path).toEqual(track.path?.points);
      race.dispose();
    } finally {
      world.free();
    }
  });

  it("leaves the path empty on a track without one", async () => {
    const race = await createRace(await syntheticTrack(), new NodeIO(), {
      laps: 1,
    });
    expect(race.path).toEqual([]);
    race.dispose();
  });
});

describe("createRace on a loaded track", () => {
  let race: Race | undefined;
  afterEach(() => {
    race?.dispose();
    race = undefined;
  });

  it("drops balls on the scaled, moved ground mesh and drives them along the spawn heading", async () => {
    race = await createRace(await syntheticTrack(), new NodeIO(), { laps: 1 });
    race.addPlayer("me", "lion");
    race.start(0, 1);
    const run = (s: number, gas = 0) => {
      for (let i = 0; i < s / TICK_DT; i++) {
        race!.setInput("me", { ...NEUTRAL_INPUT, gas });
        race!.step(TICK_DT);
      }
    };
    run(2);
    let b = race.snapshot(0, 0).balls[0];
    expect(b.p[1]).toBeCloseTo(-0.5, 1); // ground at y = -1, ball radius 0.5
    expect(b.h).toBeCloseTo(Math.PI / 2);

    run(1.5, 1);
    b = race.snapshot(0, 0).balls[0];
    expect(b.p[0]).toBeGreaterThan(5); // spawn faces +X
    expect(b.p[1]).toBeCloseTo(-0.5, 1); // stays on the trimesh instead of falling through
    expect(Math.abs(b.v[1])).toBeLessThan(0.5); // no bumping on the grid's internal edges
  });

  it("refuses a track without spawns", async () => {
    await expect(
      createRace(await syntheticTrack({ spawns: false }), new NodeIO(), {
        laps: 1,
      }),
    ).rejects.toThrow("no spawn_* markers");
  });
});

describe("respawn on a loaded track", () => {
  let race: Race | undefined;
  afterEach(() => {
    race?.dispose();
    race = undefined;
  });

  async function drive(opts: Parameters<typeof syntheticTrack>[0] = {}) {
    race = await createRace(await syntheticTrack(opts), new NodeIO(), {
      laps: 1,
    });
    race.addPlayer("me", "lion"); // slot 1, at (-3, -1, -1.5) facing +X
    race.start(0, 1);
    return race;
  }

  /** Steps until the first respawn (or the time limit) and returns when it happened and where to. */
  function untilRespawn(r: Race, input: InputMsg, seconds = 15) {
    for (let i = 1; i <= seconds / TICK_DT; i++) {
      r.setInput("me", input);
      r.step(TICK_DT);
      if (r.drainEvents().some((e) => e.type === "respawn"))
        return { t: i * TICK_DT, ball: r.snapshot(0, 0).balls[0] };
    }
    return null;
  }

  const GAS: InputMsg = { ...NEUTRAL_INPUT, gas: 1 };

  it("returns a fallen ball to the respawn marker of the last gate it crossed", async () => {
    const r = await drive();
    const hit = untilRespawn(r, GAS); // gates 0..3, then off the end at x = 40
    expect(hit).not.toBeNull();
    expect(hit!.ball.p[0]).toBeCloseTo(26); // respawn_03 at (26, -1, 0)
    expect(hit!.ball.p[1]).toBeCloseTo(-0.4); // ball radius + 0.1 above it
    expect(hit!.ball.p[2]).toBeCloseTo(0);
    expect(hit!.ball.h).toBeCloseTo(Math.PI / 2); // the marker's facing
    expect(hit!.ball.v).toEqual([0, 0, 0]);
  });

  it("returns a ball that falls before the first gate to its grid slot", async () => {
    const r = await drive();
    // turn around on the spot (no gas), then drive off the back of the ground
    for (let i = 0; i < Math.PI / tuning.turnRate / TICK_DT; i++) {
      r.setInput("me", { ...NEUTRAL_INPUT, steer: 1 });
      r.step(TICK_DT);
    }
    const hit = untilRespawn(r, GAS);
    expect(hit!.ball.p).toEqual([
      expect.closeTo(-3),
      expect.closeTo(-0.4),
      expect.closeTo(-1.5),
    ]);
    expect(hit!.ball.h).toBeCloseTo(Math.PI / 2);
  });

  it("counts gates only in order, so a skipped gate is not a respawn point", async () => {
    const r = await drive({ swapGates: true }); // crosses gates 0, 2, 1, 3
    const hit = untilRespawn(r, GAS);
    expect(hit!.ball.p[0]).toBeCloseTo(10); // respawn_01: gate 2 and 3 were out of order
  });

  it("respawns a ball held against a wall after stuckSeconds of gas", async () => {
    const r = await drive({ wall: true });
    const hit = untilRespawn(r, GAS);
    expect(hit!.ball.p[0]).toBeCloseTo(10); // respawn_01, the last gate before the wall
    // about 1 s to reach the wall and stop bouncing off it, then stuckSeconds pinned against it
    expect(hit!.t).toBeGreaterThan(tuning.stuckSeconds);
    expect(hit!.t).toBeLessThan(tuning.stuckSeconds + 3);
  });

  it("never respawns a ball that isn't trying to drive", async () => {
    const r = await drive({ wall: true });
    expect(untilRespawn(r, NEUTRAL_INPUT, 10)).toBeNull();
  });
});

describe("section mechanics", () => {
  const races: Race[] = [];
  afterEach(() => {
    for (const r of races.splice(0)) r.dispose();
  });

  async function onTrack(opts: Parameters<typeof syntheticTrack>[0] = {}) {
    const r = await createRace(await syntheticTrack(opts), new NodeIO(), {
      laps: 1,
    });
    races.push(r);
    r.addPlayer("me", "lion"); // slot 1, at (-3, -1, -1.5) facing +X
    r.start(0, 1);
    return r;
  }

  function run(r: Race, seconds: number, input: InputMsg) {
    for (let i = 0; i < Math.round(seconds / TICK_DT); i++) {
      r.setInput("me", input);
      r.step(TICK_DT);
    }
    return r.snapshot(0, 0).balls[0];
  }

  const GAS: InputMsg = { ...NEUTRAL_INPUT, gas: 1 };
  const flatSpeed = (v: number[]) => Math.hypot(v[0], v[2]);
  /** Angle between where the ball faces and where it's actually going */
  const slip = (b: { v: number[]; h: number }) =>
    Math.abs(
      Math.atan2(
        Math.sin(Math.atan2(b.v[0], b.v[2]) - b.h),
        Math.cos(Math.atan2(b.v[0], b.v[2]) - b.h),
      ),
    );

  it("a boost pad pushes the ball along its facing, past top speed", async () => {
    const r = await onTrack();
    let before = 0;
    let after = 0;
    for (let i = 0; i < 3 / TICK_DT; i++) {
      r.setInput("me", GAS);
      r.step(TICK_DT);
      const b = r.snapshot(0, 0).balls[0];
      // the pad's box spans x = 19..21, so the ball touches it from x = 18.5
      if (b.p[0] < 17) before = Math.max(before, flatSpeed(b.v));
      else if (b.p[0] > 21 && b.p[0] < 40)
        after = Math.max(after, flatSpeed(b.v));
    }
    expect(before).toBeLessThan(tuning.maxSpeed * 1.05);
    // power 2: +16 m/s along +X, the way the ball is going
    expect(after).toBeGreaterThan(before + tuning.boostPadSpeed);
  });

  it("ice cuts grip, so the ball slides wide in a turn", async () => {
    const turn = async (opts: Parameters<typeof syntheticTrack>[0]) => {
      const r = await onTrack(opts);
      run(r, 0.8, GAS); // up to speed, still on the patch and short of the pad
      return slip(run(r, 0.4, { ...GAS, steer: 1 }));
    };
    const road = await turn({});
    const ice = await turn({ surface: { kind: "ice", grip: 0.1 } });
    // measured: about 0.22 rad of slip on the road, 0.48 on ice
    expect(ice).toBeGreaterThan(road * 1.6);
    expect(ice - road).toBeGreaterThan(0.15);
  });

  it("snow drags the ball, and ice cream doesn't", async () => {
    const speedAfter = async (opts: Parameters<typeof syntheticTrack>[0]) =>
      flatSpeed(run(await onTrack(opts), 1, GAS).v);
    const road = await speedAfter({});
    const snow = await speedAfter({ surface: { kind: "snow", grip: 0.6 } });
    const iceCream = await speedAfter({
      surface: { kind: "icecream", grip: 0.2 },
    });
    // measured after 1 s of gas: about 18 m/s on the road, 14.3 on snow
    expect(snow).toBeLessThan(road - 2);
    expect(iceCream).toBeCloseTo(road, 0);
  });
});

describe("items", () => {
  const races: Race[] = [];
  afterEach(() => {
    for (const r of races.splice(0)) r.dispose();
  });

  /** "me" in grid slot 1 (-3, -1.5) and optionally "you" in slot 2 (-6, 1.5), both facing +X */
  async function race(
    opts: Parameters<typeof syntheticTrack>[0],
    random: number,
    two = false,
  ) {
    const r = await createRace(await syntheticTrack(opts), new NodeIO(), {
      laps: 1,
      random: () => random,
    });
    races.push(r);
    r.addPlayer("me", "earth");
    if (two) r.addPlayer("you", "mars");
    r.start(0, 1);
    return r;
  }

  const ball = (r: Race, id = "me") =>
    r.snapshot(0, 0).balls.find((b) => b.id === id)!;
  const flatSpeed = (v: number[]) => Math.hypot(v[0], v[2]);
  const held = (r: Race, id = "me") =>
    r.standings().find((s) => s.id === id)!.item;

  function step(r: Race, inputs: Record<string, InputMsg> = {}) {
    for (const [id, input] of Object.entries(inputs)) r.setInput(id, input);
    r.step(TICK_DT);
    return r.drainEvents();
  }
  function run(
    r: Race,
    seconds: number,
    inputs: Record<string, InputMsg> = {},
  ) {
    for (let i = 0; i < Math.round(seconds / TICK_DT); i++) step(r, inputs);
  }
  const FIRE: InputMsg = { ...NEUTRAL_INPUT, item: true };
  const GAS: InputMsg = { ...NEUTRAL_INPUT, gas: 1 };

  it("an item box gives one item by place, then hides for itemBoxRespawn", async () => {
    // the leader's row is boost 20 / roar 40 / spill 40, so random 0 draws a boost
    const r = await race({ itemsAt: [[-3, -1.5]] }, 0);
    expect(step(r)).toContainEqual({
      type: "item",
      player: "me",
      item: "boost",
    });
    expect(held(r)).toBe("boost");
    const test = () => r.itemBoxes().find((b) => b.pos[0] === -3)!;
    expect(r.itemBoxes()).toHaveLength(2); // the track's own box at (12, 4) too
    expect(test().active).toBe(false);
    run(r, tuning.itemBoxRespawn - 0.1);
    expect(test().active).toBe(false);
    run(r, 0.2);
    expect(test().active).toBe(true);
  });

  it("Boost fires once, along the heading", async () => {
    const r = await race({ itemsAt: [[-3, -1.5]] }, 0);
    step(r);
    const events = step(r, { me: FIRE });
    expect(events).toContainEqual(
      expect.objectContaining({ type: "fire", player: "me", item: "boost" }),
    );
    expect(held(r)).toBeNull();
    const b = ball(r);
    expect(b.v[0]).toBeGreaterThan(tuning.itemBoostSpeed * 0.6); // the grid faces +X
    expect(Math.abs(b.v[2])).toBeLessThan(0.5);
    expect(step(r, { me: FIRE }).some((e) => e.type === "fire")).toBe(false);
  });

  it("Lion Roar knocks nearby balls away from the roarer", async () => {
    // two players: the leader's row again, and 0.3 lands in roar (20 … 60)
    const r = await race({ itemsAt: [[-3, -1.5]] }, 0.3, true);
    step(r);
    expect(held(r)).toBe("roar");
    step(r, { me: FIRE });
    const you = ball(r, "you"); // 4.2 m away, up and to the left
    expect(flatSpeed(you.v)).toBeGreaterThan(2);
    expect(you.v[0]).toBeLessThan(0); // away from me, along -X …
    expect(you.v[2]).toBeGreaterThan(0); // … and +Z
    expect(flatSpeed(ball(r).v)).toBeLessThan(0.5); // the roarer isn't pushed
  });

  it("Creamery Spill leaves a puddle behind that dries up after spillSeconds", async () => {
    const r = await race({ itemsAt: [[-3, -1.5]] }, 0.7); // 60 … 100 is spill
    step(r);
    const fired = step(r, { me: FIRE }).find((e) => e.type === "fire");
    expect(fired).toMatchObject({ item: "spill" });
    const [puddle] = r.puddles();
    expect(puddle.pos[0]).toBeCloseTo(-5, 0); // 2 m behind a ball facing +X
    expect(puddle.pos[2]).toBeCloseTo(-1.5, 0);
    expect(puddle.radius).toBe(tuning.spillRadius);
    expect(fired).toMatchObject({ pos: puddle.pos });
    run(r, tuning.spillSeconds - 0.1);
    expect(r.puddles()).toHaveLength(1);
    run(r, 0.2);
    expect(r.puddles()).toHaveLength(0);
  });

  it("Snow Day slows everyone ahead for snowDaySeconds", async () => {
    // "you" starts second of two, so the last row: boost 50 / roar 20 / snowday 30, and 0.9 is snowday
    const r = await race({ itemsAt: [[-6, 1.5]] }, 0.9, true);
    step(r);
    expect(held(r, "you")).toBe("snowday");
    step(r, { you: FIRE });
    let mine = 0;
    let yours = 0;
    for (let i = 0; i < 1.5 / TICK_DT; i++) {
      step(r, { me: GAS, you: GAS });
      mine = Math.max(mine, flatSpeed(ball(r).v));
      yours = Math.max(yours, flatSpeed(ball(r, "you").v));
    }
    expect(mine).toBeLessThan(tuning.maxSpeed * tuning.snowDaySpeedMul * 1.05);
    expect(yours).toBeGreaterThan(tuning.maxSpeed * 0.9);
  });
});

describe("checkTrack", () => {
  it("names what's missing", () => {
    const track: TrackData = {
      spawns: [1, 2, 3].map((slot) => ({ slot, pos: [0, 0, 0], heading: 0 })),
      checkpoints: [0, 1, 3].map((index) => ({
        index,
        section: "",
        pos: [0, 0, 0],
        collider: 0,
      })),
      respawns: [{ checkpoint: 0, pos: [0, 0, 0], heading: 0 }],
      items: [],
      boosts: [],
      surfaces: [],
      cameras: [],
      path: null,
    };
    expect(checkTrack(track)).toEqual([
      "spawns should be slots 1-8, got [1,2,3]",
      "checkpoint 2 is missing",
      "no respawn for checkpoint 1",
      "no respawn for checkpoint 3",
    ]);
  });
});

// The committed greybox is required: missing or broken exports must fail CI.
const realTrack = fileURLToPath(
  new URL("../tracks/happy_valley_col.glb", import.meta.url),
);
it("happy_valley_col.glb is raceable", async () => {
  await initPhysics();
  const world = createWorld();
  try {
    const bytes = new Uint8Array(readFileSync(realTrack));
    const track = await loadTrack(world, bytes, new NodeIO());
    expect(checkTrack(track)).toEqual([]);
    expect([...new Set(track.checkpoints.map((c) => c.section))]).toEqual([
      "start",
      "pollock",
      "library",
      "lionshrine",
      "creamery",
      "stadium",
      "arboretum",
      "collegeave",
    ]);

    // Check dimensions in the grid's local frame, so the route can be rotated.
    const heading = track.spawns[0].heading;
    const forward = [Math.sin(heading), Math.cos(heading)];
    const right = [forward[1], -forward[0]];
    const project = (a: number[], b: number[], axis: number[]) =>
      (a[0] - b[0]) * axis[0] + (a[2] - b[2]) * axis[1];
    expect(
      Math.abs(project(track.spawns[1].pos, track.spawns[0].pos, right)),
    ).toBeCloseTo(1.5, 2);
    expect(
      Math.abs(project(track.spawns[1].pos, track.spawns[0].pos, forward)),
    ).toBeCloseTo(1.5, 2);
    for (const [i, spawn] of track.spawns.entries()) {
      expect(Math.cos(spawn.heading - heading)).toBeCloseTo(1);
      expect(
        project(track.checkpoints[0].pos, spawn.pos, forward),
      ).toBeGreaterThan(0);
      if (i >= 2) {
        expect(project(spawn.pos, track.spawns[i - 2].pos, right)).toBeCloseTo(
          0,
          2,
        );
        expect(
          project(spawn.pos, track.spawns[i - 2].pos, forward),
        ).toBeCloseTo(-3, 2);
      }
    }

    // The route: a closed loop from the finish line that runs through every gate, in order
    const path = track.path!;
    expect(path).not.toBeNull();
    expect(path.length).toBeGreaterThan(1000);
    expect(path.length).toBeLessThan(1200);
    const [x0, , z0] = track.checkpoints[0].pos;
    expect(
      Math.hypot(path.points[0][0] - x0, path.points[0][1] - z0),
    ).toBeLessThan(1);
    let previous = -1;
    for (const gate of track.checkpoints) {
      const s = alongPath(path, gate.pos[0], gate.pos[2]);
      const [px, pz] = pointAt(path, s);
      expect(
        Math.hypot(px - gate.pos[0], pz - gate.pos[2]),
        `gate ${gate.index} on the route`,
      ).toBeLessThan(2);
      expect(s, `gate ${gate.index} after the one before`).toBeGreaterThan(
        previous,
      );
      previous = gate.index === 0 ? 0 : s;
    }

    expect(track.items.length).toBeGreaterThanOrEqual(3);
    expect(track.boosts.length).toBeGreaterThanOrEqual(2);
    for (const boost of track.boosts) expect(boost.power).toBe(1);
    expect(track.cameras.length).toBeGreaterThanOrEqual(3);
    for (const [kind, grip] of [
      ["icecream", 0.2],
      ["snow", 0.6],
      ["ice", 0.1],
    ] as const) {
      expect(track.surfaces).toEqual(
        expect.arrayContaining([expect.objectContaining({ kind, grip })]),
      );
    }

    const doc = await new NodeIO().readBinary(bytes);
    const librarySteps = doc
      .getRoot()
      .listNodes()
      .filter(
        (node) => /library.*_col$/.test(node.getName()) && node.getMesh(),
      );
    expect(librarySteps.length).toBeGreaterThan(0);
    expect(
      librarySteps.some((node) => node.getExtras().restitution === 0.5),
    ).toBe(true);

    // A valid marker index alone cannot ensure that a ball has somewhere to land.
    world.step();
    for (const marker of [...track.spawns, ...track.respawns]) {
      const [x, y, z] = marker.pos;
      const hit = world.castRay(
        new RAPIER.Ray({ x, y: y + 1, z }, { x: 0, y: -1, z: 0 }),
        1.25,
        true,
        RAPIER.QueryFilterFlags.EXCLUDE_SENSORS,
      );
      expect(
        hit,
        `solid road below marker at ${marker.pos.join(", ")}`,
      ).not.toBeNull();
      expect(hit!.timeOfImpact).toBeGreaterThanOrEqual(0.75);
    }
  } finally {
    world.free();
  }
});
