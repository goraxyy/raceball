import RAPIER from "@dimforge/rapier3d-compat";
import type { PlatformIO } from "@gltf-transform/core";
import type {
  GameEvent,
  InputMsg,
  ItemId,
  Phase,
  SnapMsg,
} from "@raceball/shared";
import { addBall, applyControls, BALL_RADIUS, type PlayerSim } from "./ball";
import { NEUTRAL_INPUT } from "./input";
import { rollItem } from "./items";
import { pointAt, project } from "./path";
import { createWorld, initPhysics, TICK_DT } from "./physics";
import {
  createFlatTrack,
  loadTrack,
  type BoostPad,
  type Surface,
  type TrackData,
  type Vec3,
} from "./track";
import { tuning, type Tuning } from "./tuning";

export interface RaceConfig {
  laps: number;
  /** 0 … 1, like Math.random (the default). Tests pass a fixed one to pick items */
  random?: () => number;
}

export interface Standing {
  id: string;
  place: number; // 1 = leading: finishers by time, then everyone else by progress
  lap: number; // the lap being raced, 1 … laps (laps once finished)
  checkpoint: number; // index of the last checkpoint crossed in order (0 = the finish line)
  finishedAt: number | null; // race time in ms, null while still racing
  progress: number; // m along the race from the start line (negative on the grid)
  item: ItemId | null; // the item the player holds, fired with input.item
}

/** An item box: hidden for itemBoxRespawn after a ball hits it */
export interface ItemBoxState {
  id: string;
  pos: Vec3;
  active: boolean;
}

/** A Creamery Spill puddle on the road */
export interface PuddleState {
  id: string;
  pos: Vec3;
  radius: number;
}

/** The game-core API the server (and local mode) drives. Agreed with Rasim; see docs/team/ali-game.md. */
export interface Race {
  addPlayer(id: string, ball: string): void; // takes the next free spawn slot
  removePlayer(id: string): void;
  setInput(id: string, input: InputMsg): void; // latest wins; the server handles staleness
  start(countdownMs: number, laps: number): void; // lobby → countdown → racing. laps = 1 (demo) or 3
  step(dt: number): void; // always 1/60
  snapshot(tick: number, t: number): SnapMsg;
  drainEvents(): GameEvent[]; // events since the last call
  standings(): Standing[]; // id, place, lap, checkpoint, finishedAt, progress, item
  itemBoxes(): ItemBoxState[]; // for the synced state (screens draw the boxes)
  puddles(): PuddleState[]; // Creamery Spill puddles, for screens to draw
  readonly phase: Phase;
  readonly laps: number;
  /** The route's centerline as [x, z] points from the finish line, for the big-screen map; [] without a route */
  readonly path: [number, number][];
  // bots, for Rasim's fill-up and load tests:
  botInput(id: string): InputMsg; // follow the route (or head for the next checkpoint), full gas
  dispose(): void; // frees the Rapier world (room disposed, page left)
}

/** A race on a map exported from Blender (happy_valley_col.glb). io: NodeIO on the server, WebIO in the browser. */
export async function createRace(
  trackGlb: Uint8Array,
  io: PlatformIO,
  cfg: RaceConfig,
  t: Tuning = tuning,
): Promise<Race> {
  await initPhysics();
  const world = createWorld();
  const track = await loadTrack(world, trackGlb, io);
  if (track.spawns.length === 0) {
    world.free();
    throw new Error("createRace: the track has no spawn_* markers");
  }
  return new TrackRace(world, track, cfg, t);
}

/** A race on the flat M0 ground. Used by local mode and the tests. */
export async function createFlatRace(
  cfg: RaceConfig,
  t: Tuning = tuning,
): Promise<Race> {
  await initPhysics();
  const world = createWorld();
  return new TrackRace(world, createFlatTrack(world), cfg, t);
}

/** A ball in the race, plus its progress around the track. */
interface Racer extends PlayerSim {
  collider: number; // handle of the ball's collider, for gate events
  next: number; // position in track.checkpoints of the gate to cross next
  last: number; // position of the last gate crossed, -1 before the first
  passed: number; // gates crossed in order since the start, the first crossing of the finish line included
  lapsDone: number;
  finishedAt: number | null; // race time in ms
  routeS: number; // where the ball is along the track path, in the path's own meters
  stuckFor: number; // seconds of gas while barely moving
  surfaces: Set<Surface>; // surface volumes the ball is inside
  boostLeft: number; // seconds of raised top speed left after a boost pad or item
  slowLeft: number; // seconds of Snow Day slowdown left
  item: ItemId | null;
}

interface Box {
  id: string;
  pos: Vec3;
  collider: number;
  hiddenUntil: number; // simMs
}

interface Puddle {
  id: string;
  pos: Vec3;
  surface: Surface;
  until: number; // simMs
}

class TrackRace implements Race {
  phase: Phase = "lobby";
  laps: number;
  readonly path: [number, number][];
  private readonly world: RAPIER.World;
  private readonly track: TrackData;
  private readonly t: Tuning;
  private readonly queue = new RAPIER.EventQueue(true);
  private readonly gateOrder = new Map<number, number>(); // collider handle → position in track.checkpoints
  private readonly surfaceByCollider = new Map<number, Surface>();
  private readonly padByCollider = new Map<number, BoostPad>();
  private readonly boxes: Box[] = [];
  private readonly boxByCollider = new Map<number, Box>();
  private puddleList: Puddle[] = [];
  private puddleCount = 0;
  private readonly random: () => number;
  private readonly byCollider = new Map<number, Racer>();
  private players = new Map<string, Racer>();
  private events: GameEvent[] = [];
  private countdownLeftMs = 0;
  private raceMs = 0; // race time, counting from the end of the countdown
  private winnerAt: number | null = null;
  private finishers = 0;
  private simMs = 0; // simulated time in every phase but the lobby, for bump cooldowns
  private lastBump = new Map<string, number>(); // "a|b" → simMs of their last bump
  /** Unfinished racers, leader first: changes only when someone is clearly ahead, for overtake events */
  private order: string[] = [];
  /** Distance of each gate from the finish line, along the route (straight gate to gate without one) */
  private readonly gateS: number[];
  /** Once round the track, in the same meters as gateS */
  private readonly loopLength: number;
  /** Where the finish line is along the track path, in the path's own meters */
  private readonly pathStart: number;

  constructor(
    world: RAPIER.World,
    track: TrackData,
    cfg: RaceConfig,
    t: Tuning,
  ) {
    this.world = world;
    this.track = track;
    this.t = t;
    this.laps = cfg.laps;
    this.path = track.path?.points ?? [];
    track.checkpoints.forEach((c, i) => this.gateOrder.set(c.collider, i));
    for (const s of track.surfaces) this.surfaceByCollider.set(s.collider, s);
    for (const b of track.boosts) this.padByCollider.set(b.collider, b);
    this.random = cfg.random ?? Math.random;
    const half = t.itemBoxSize;
    track.items.forEach(({ pos }, i) => {
      const c = world.createCollider(
        RAPIER.ColliderDesc.cuboid(half, half, half)
          .setTranslation(...pos)
          .setSensor(true)
          .setActiveEvents(RAPIER.ActiveEvents.COLLISION_EVENTS),
      );
      const box: Box = {
        id: `box${i}`,
        pos,
        collider: c.handle,
        hiddenUntil: 0,
      };
      this.boxes.push(box);
      this.boxByCollider.set(c.handle, box);
    });

    const gates = track.checkpoints;
    const route = track.path;
    if (route && gates.length) {
      this.pathStart = project(route, gates[0].pos[0], gates[0].pos[2]);
      this.loopLength = route.length;
      this.gateS = gates.map((c) =>
        this.fromStart(project(route, c.pos[0], c.pos[2])),
      );
      this.gateS[0] = 0;
    } else {
      this.pathStart = 0;
      this.gateS = [];
      let s = 0;
      gates.forEach((c, i) => {
        if (i > 0) s += flatDistance(gates[i - 1].pos, c.pos);
        this.gateS.push(s);
      });
      this.loopLength = gates.length
        ? s + flatDistance(gates[gates.length - 1].pos, gates[0].pos)
        : 0;
    }
  }

  addPlayer(id: string, ball: string): void {
    if (this.players.has(id))
      throw new Error(`player ${id} is already in the race`);
    const taken = new Set([...this.players.values()].map((p) => p.slot));
    const spawn = this.track.spawns.find((s) => !taken.has(s.slot));
    if (!spawn) throw new Error("race is full");
    const body = addBall(this.world, ...spawn.pos, this.t.bumpForceMin);
    const racer: Racer = {
      id,
      ball,
      slot: spawn.slot,
      body,
      heading: spawn.heading,
      input: { ...NEUTRAL_INPUT },
      maxSpeedMul: 1,
      surfaceGrip: 1,
      collider: body.collider(0).handle,
      next: 0,
      last: -1,
      passed: 0,
      lapsDone: 0,
      finishedAt: null,
      routeS: this.track.path
        ? project(this.track.path, spawn.pos[0], spawn.pos[2])
        : 0,
      stuckFor: 0,
      surfaces: new Set(),
      boostLeft: 0,
      slowLeft: 0,
      item: null,
    };
    this.players.set(id, racer);
    this.byCollider.set(racer.collider, racer);
  }

  removePlayer(id: string): void {
    const p = this.players.get(id);
    if (!p) return;
    this.order = this.order.filter((o) => o !== id);
    this.byCollider.delete(p.collider);
    this.world.removeRigidBody(p.body);
    this.players.delete(id);
  }

  setInput(id: string, input: InputMsg): void {
    const p = this.players.get(id);
    if (p) p.input = { ...input };
  }

  start(countdownMs: number, laps: number): void {
    if (this.phase !== "lobby") return;
    this.laps = laps;
    this.countdownLeftMs = countdownMs;
    this.phase = countdownMs > 0 ? "countdown" : "racing";
  }

  step(dt: number): void {
    if (Math.abs(dt - TICK_DT) > 1e-9)
      throw new Error(`Race.step: dt must be 1/60, got ${dt}`);
    if (this.phase === "lobby") return; // no physics, balls stay parked on their spawns

    if (this.phase === "countdown") {
      this.countdownLeftMs -= dt * 1000;
      if (this.countdownLeftMs <= 0) this.phase = "racing";
    }
    // inputs count only while racing, and not once a ball has finished: it rolls on to a stop
    const racing = this.phase === "racing";
    const drives = (p: Racer) => racing && p.finishedAt === null;
    if (racing) this.raceMs += dt * 1000;
    this.simMs += dt * 1000;
    this.expirePuddles();
    for (const p of this.players.values()) {
      if (p.input.item && p.item && drives(p)) this.fire(p, p.item);
      this.applySurfaces(p, dt);
      applyControls(
        p,
        drives(p) ? p.input : NEUTRAL_INPUT,
        dt,
        this.t,
        this.world,
      );
      p.input.item = false; // fires once, even if no new input arrives before the next tick
    }
    this.world.step(this.queue);
    this.queue.drainCollisionEvents((h1, h2, started) => {
      const p = this.byCollider.get(h1) ?? this.byCollider.get(h2);
      if (!p) return;
      const other = p.collider === h1 ? h2 : h1;
      const surface = this.surfaceByCollider.get(other);
      if (surface) {
        if (started) p.surfaces.add(surface);
        else p.surfaces.delete(surface);
        return;
      }
      if (!started) return;
      const pad = this.padByCollider.get(other);
      if (pad) return this.boost(p, pad);
      const box = this.boxByCollider.get(other);
      if (box) return this.hitBox(p, box, drives(p));
      const gate = this.gateOrder.get(other);
      // only the next gate counts, so shortcuts and driving backwards don't
      if (gate !== undefined && gate === p.next && drives(p))
        this.passGate(p, gate);
    });
    this.queue.drainContactForceEvents((e) => {
      const a = this.byCollider.get(e.collider1());
      const b = this.byCollider.get(e.collider2());
      if (a && b) this.bump(a, b, e.totalForceMagnitude()); // balls against the track don't count
    });

    const route = this.track.path;
    for (const p of this.players.values()) {
      const pos = p.body.translation();
      if (route) p.routeS = project(route, pos.x, pos.z, p.routeS);
      if (pos.y < this.t.fallY) this.respawn(p);
      else if (drives(p) && this.isStuck(p, dt)) this.respawn(p);
    }

    this.updateOrder(racing);

    // the race ends when everyone is in, or finishGraceSeconds after the winner
    if (racing && this.players.size > 0) {
      const allIn = [...this.players.values()].every(
        (p) => p.finishedAt !== null,
      );
      const graceOver =
        this.winnerAt !== null &&
        this.raceMs - this.winnerAt >= this.t.finishGraceSeconds * 1000;
      if (allIn || graceOver) this.phase = "results";
    }
  }

  snapshot(tick: number, t: number): SnapMsg {
    const balls = [...this.players.values()].map((p) => {
      const pos = p.body.translation();
      const rot = p.body.rotation();
      const vel = p.body.linvel();
      return {
        id: p.id,
        p: [pos.x, pos.y, pos.z] as [number, number, number],
        q: [rot.x, rot.y, rot.z, rot.w] as [number, number, number, number],
        v: [vel.x, vel.y, vel.z] as [number, number, number],
        h: p.heading,
      };
    });
    return { tick, t, balls };
  }

  drainEvents(): GameEvent[] {
    const out = this.events;
    this.events = [];
    return out;
  }

  standings(): Standing[] {
    const gates = Math.max(1, this.track.checkpoints.length);
    return [...this.players.values()]
      .map((p) => ({ p, progress: this.progress(p) }))
      .sort((a, b) => {
        const fa = a.p.finishedAt;
        const fb = b.p.finishedAt;
        const byTime =
          fa !== null || fb !== null
            ? (fa ?? Infinity) - (fb ?? Infinity)
            : b.progress - a.progress;
        return byTime || a.p.slot - b.p.slot;
      })
      .map(({ p, progress }, i) => ({
        id: p.id,
        place: i + 1,
        lap: Math.min(p.lapsDone + 1, this.laps),
        checkpoint: p.passed > 0 ? (p.passed - 1) % gates : 0,
        finishedAt: p.finishedAt,
        progress,
        item: p.item,
      }));
  }

  itemBoxes(): ItemBoxState[] {
    return this.boxes.map((b) => ({
      id: b.id,
      pos: b.pos,
      active: this.simMs >= b.hiddenUntil,
    }));
  }

  puddles(): PuddleState[] {
    return this.puddleList.map((d) => ({
      id: d.id,
      pos: d.pos,
      radius: this.t.spillRadius,
    }));
  }

  /**
   * Pure pursuit: aim at a point a little way ahead on the route (further at speed), full gas, and
   * brake only when that point is well off to the side at speed. Without a route, head for the
   * next checkpoint; with no checkpoints either, drive straight.
   */
  botInput(id: string): InputMsg {
    const p = this.players.get(id);
    if (!p) return { ...NEUTRAL_INPUT };
    const t = this.t;
    const pos = p.body.translation();
    const v = p.body.linvel();
    const speed = Math.hypot(v.x, v.z);
    let target: [number, number] | undefined;
    if (this.track.path) {
      const ahead = Math.min(
        t.botLookahead + t.botLookaheadPerSpeed * speed,
        t.botLookaheadMax,
      );
      target = pointAt(this.track.path, p.routeS + ahead);
    } else if (this.track.checkpoints.length) {
      const [x, , z] = this.track.checkpoints[p.next].pos;
      target = [x, z];
    }
    if (!target) return { ...NEUTRAL_INPUT, gas: 1 };
    // steer > 0 turns right, which lowers the heading
    const off = wrapAngle(
      Math.atan2(target[0] - pos.x, target[1] - pos.z) - p.heading,
    );
    return {
      ...NEUTRAL_INPUT,
      steer: Math.max(-1, Math.min(1, -off * t.botSteerGain)),
      gas: 1,
      brake: Math.abs(off) > t.botBrakeAngle && speed > t.botBrakeSpeed,
    };
  }

  dispose(): void {
    this.queue.free();
    this.world.free();
    this.players.clear();
    this.byCollider.clear();
  }

  /** Crossing the finish line after the last gate completes a lap; the first crossing starts the race. */
  private passGate(p: Racer, gate: number): void {
    p.last = gate;
    p.next = (gate + 1) % this.track.checkpoints.length;
    p.passed++;
    if (gate !== 0 || p.passed === 1) return;
    p.lapsDone++;
    if (p.lapsDone < this.laps) {
      this.events.push({ type: "lap", player: p.id, lap: p.lapsDone + 1 }); // the lap just started
      return;
    }
    p.finishedAt = this.raceMs;
    this.winnerAt ??= this.raceMs;
    this.events.push({ type: "finish", player: p.id, place: ++this.finishers });
  }

  /**
   * Surfaces set the ball's grip (the lowest one it's inside wins: ice 0.1, ice cream 0.2,
   * snow 0.6), and snow also drags like a light brake. A recent boost raises the top speed.
   */
  private applySurfaces(p: Racer, dt: number): void {
    let grip = 1;
    let snow = false;
    for (const s of p.surfaces) {
      grip = Math.min(grip, s.grip);
      if (s.kind === "snow") snow = true;
    }
    p.surfaceGrip = grip;
    p.maxSpeedMul =
      (p.boostLeft > 0 ? this.t.boostMaxSpeedMul : 1) *
      (p.slowLeft > 0 ? this.t.snowDaySpeedMul : 1);
    p.boostLeft = Math.max(0, p.boostLeft - dt);
    p.slowLeft = Math.max(0, p.slowLeft - dt);
    if (snow) {
      const v = p.body.linvel();
      const k = (1 - Math.exp(-this.t.snowDrag * dt)) * p.body.mass();
      p.body.applyImpulse({ x: -v.x * k, y: 0, z: -v.z * k }, true);
    }
  }

  /** A boost pad adds speed along its own facing, and raises the top speed for boostSeconds. */
  private boost(p: Racer, pad: BoostPad): void {
    const j = this.t.boostPadSpeed * pad.power * p.body.mass();
    p.body.applyImpulse(
      { x: Math.sin(pad.heading) * j, y: 0, z: Math.cos(pad.heading) * j },
      true,
    );
    p.boostLeft = this.t.boostSeconds;
  }

  /** An active box hides for itemBoxRespawn and gives an item, by place, to a racer whose slot is empty */
  private hitBox(p: Racer, box: Box, racing: boolean): void {
    if (!racing || this.simMs < box.hiddenUntil) return;
    box.hiddenUntil = this.simMs + this.t.itemBoxRespawn * 1000;
    if (p.item) return;
    const place = this.standings().find((s) => s.id === p.id)?.place ?? 1;
    p.item = rollItem(place, this.players.size, this.random);
    this.events.push({ type: "item", player: p.id, item: p.item });
  }

  private fire(p: Racer, item: ItemId): void {
    const t = this.t;
    const pos = p.body.translation();
    const mass = p.body.mass();
    const fwd = { x: Math.sin(p.heading), z: Math.cos(p.heading) };
    let at: Vec3 = [pos.x, pos.y, pos.z];
    switch (item) {
      case "boost": {
        const j = t.itemBoostSpeed * mass;
        p.body.applyImpulse({ x: fwd.x * j, y: 0, z: fwd.z * j }, true);
        p.boostLeft = t.boostSeconds;
        break;
      }
      case "roar":
        for (const q of this.players.values()) {
          if (q === p) continue;
          const qp = q.body.translation();
          const dx = qp.x - pos.x;
          const dz = qp.z - pos.z;
          const d = Math.hypot(dx, dz);
          if (d >= t.roarRadius) continue;
          const k = (1 - d / t.roarRadius) * q.body.mass();
          // straight away from the roarer; a ball right on top of it goes forward
          const [ux, uz] = d > 1e-3 ? [dx / d, dz / d] : [fwd.x, fwd.z];
          q.body.applyImpulse(
            {
              x: ux * t.roarSpeed * k,
              y: t.roarLift * k,
              z: uz * t.roarSpeed * k,
            },
            true,
          );
        }
        break;
      case "spill": {
        at = [
          pos.x - fwd.x * t.spillBehind,
          pos.y - BALL_RADIUS,
          pos.z - fwd.z * t.spillBehind,
        ];
        const c = this.world.createCollider(
          RAPIER.ColliderDesc.cylinder(BALL_RADIUS, t.spillRadius)
            .setTranslation(...at)
            .setSensor(true)
            .setActiveEvents(RAPIER.ActiveEvents.COLLISION_EVENTS),
        );
        const surface: Surface = {
          kind: "icecream",
          grip: t.spillGrip,
          collider: c.handle,
        };
        this.surfaceByCollider.set(c.handle, surface);
        this.puddleList.push({
          id: `spill${this.puddleCount++}`,
          pos: at,
          surface,
          until: this.simMs + t.spillSeconds * 1000,
        });
        break;
      }
      case "snowday": {
        const place = new Map(this.standings().map((s) => [s.id, s.place]));
        const mine = place.get(p.id) ?? 1;
        for (const q of this.players.values())
          if ((place.get(q.id) ?? mine) < mine) q.slowLeft = t.snowDaySeconds;
        break;
      }
    }
    p.item = null;
    this.events.push({ type: "fire", player: p.id, item, pos: at });
  }

  /** Puddles dry up after spillSeconds. Balls inside drop the surface right away */
  private expirePuddles(): void {
    if (!this.puddleList.some((d) => this.simMs >= d.until)) return;
    this.puddleList = this.puddleList.filter((d) => {
      if (this.simMs < d.until) return true;
      for (const p of this.players.values()) p.surfaces.delete(d.surface);
      this.surfaceByCollider.delete(d.surface.collider);
      const c = this.world.getCollider(d.surface.collider);
      if (c) this.world.removeCollider(c, false);
      return false;
    });
  }

  /**
   * Meters along the race from the start line. Within a lap it's the distance along the route
   * past the last gate crossed, clamped to the next gate, so a shortcut or reversing never gains
   * anything. On the grid it's minus the distance left to the line.
   */
  private progress(p: Racer): number {
    const gates = this.track.checkpoints;
    const n = gates.length;
    const length = this.loopLength;
    if (n === 0 || length <= 0) return 0;
    const pos = p.body.translation();
    const s = this.track.path ? this.fromStart(p.routeS) : null;
    if (p.passed === 0) {
      if (s === null) return -flatDistance([pos.x, 0, pos.z], gates[0].pos);
      const toLine = length - s;
      return toLine > length / 2 ? 0 : -toLine; // just over the line, not counted yet
    }
    const g = (p.passed - 1) % n;
    const lap = Math.floor((p.passed - 1) / n);
    const from = this.gateS[g];
    const segment = Math.max(
      0,
      (g + 1 < n ? this.gateS[g + 1] : length) - from,
    );
    let into: number;
    if (s === null) {
      into = segment - flatDistance([pos.x, 0, pos.z], gates[(g + 1) % n].pos);
    } else {
      into = mod(s - from, length);
      if (into > segment + (length - segment) / 2) into -= length; // behind the last gate
    }
    return lap * length + from + Math.max(0, Math.min(segment, into));
  }

  /** One bump event per hit: the same two balls can bump again after bumpCooldown */
  private bump(a: Racer, b: Racer, force: number): void {
    const key = a.id < b.id ? `${a.id}|${b.id}` : `${b.id}|${a.id}`;
    const last = this.lastBump.get(key);
    if (last !== undefined && this.simMs - last < this.t.bumpCooldown * 1000)
      return;
    this.lastBump.set(key, this.simMs);
    const strength = Math.min(1, force / this.t.bumpBigHit);
    this.events.push({ type: "bump", a: a.id, b: b.id, strength });
  }

  /**
   * Keeps the unfinished racers in race order and emits `overtake` when one gets overtakeGap
   * ahead of the racer in front. Outside the racing phase it just sorts, without events.
   */
  private updateOrder(racing: boolean): void {
    const progress = new Map<string, number>();
    for (const p of this.players.values())
      if (p.finishedAt === null) progress.set(p.id, this.progress(p));
    const at = (id: string) => progress.get(id)!;
    if (!racing) {
      this.order = [...progress.keys()].sort((a, b) => at(b) - at(a));
      return;
    }
    this.order = this.order.filter((id) => progress.has(id));
    for (const id of progress.keys()) {
      if (this.order.includes(id)) continue;
      const i = this.order.findIndex((o) => at(o) < at(id)); // newcomers slot in quietly
      this.order.splice(i < 0 ? this.order.length : i, 0, id);
    }
    const gap = Math.max(0, this.t.overtakeGap); // a negative gap would swap two racers back and forth forever
    for (let swapped = true; swapped;) {
      swapped = false;
      for (let i = 0; i + 1 < this.order.length; i++) {
        const [ahead, behind] = [this.order[i], this.order[i + 1]];
        if (at(behind) <= at(ahead) + gap) continue;
        this.order[i] = behind;
        this.order[i + 1] = ahead;
        swapped = true;
        this.events.push({
          type: "overtake",
          player: behind,
          passed: ahead,
          section: this.sectionOf(this.players.get(behind)!),
        });
      }
    }
  }

  /** The section of the last gate a racer crossed (the start's before the first) */
  private sectionOf(p: Racer): string {
    const gates = this.track.checkpoints;
    return gates.length ? gates[Math.max(0, p.last)].section : "";
  }

  /** A position on the track path, measured from the finish line instead */
  private fromStart(routeS: number): number {
    return mod(routeS - this.pathStart, this.loopLength);
  }

  /**
   * Stuck = holding gas for stuckSeconds while moving slower than stuckSpeed: wedged against a
   * wall, caught in a gap, or pinned in a pile-up. Distance to the next gate would misfire on
   * Happy Valley's hairpin, where the road heads away from the next gate for 54 m.
   */
  private isStuck(p: Racer, dt: number): boolean {
    const v = p.body.linvel();
    if (p.input.gas > 0 && Math.hypot(v.x, v.z) < this.t.stuckSpeed)
      p.stuckFor += dt;
    else p.stuckFor = 0;
    return p.stuckFor >= this.t.stuckSeconds;
  }

  /**
   * Back to the respawn marker of the last gate crossed (or the nearest earlier gate that has one),
   * or to the grid slot before the first gate.
   */
  private respawn(p: Racer): void {
    let at: { pos: Vec3; heading: number } | undefined;
    for (let i = p.last; i >= 0 && !at; i--) {
      const index = this.track.checkpoints[i].index;
      at = this.track.respawns.find((r) => r.checkpoint === index);
    }
    at ??= this.track.spawns.find((s) => s.slot === p.slot);
    if (!at) throw new Error(`no spawn for slot ${p.slot}`);
    p.body.setTranslation(
      { x: at.pos[0], y: at.pos[1] + BALL_RADIUS + 0.1, z: at.pos[2] },
      true,
    );
    p.body.setLinvel({ x: 0, y: 0, z: 0 }, true);
    p.body.setAngvel({ x: 0, y: 0, z: 0 }, true);
    p.heading = at.heading;
    p.stuckFor = 0;
    p.boostLeft = 0;
    p.surfaces.clear(); // the teleport leaves them; their exit events may never arrive
    if (this.track.path)
      p.routeS = project(this.track.path, at.pos[0], at.pos[2]);
    this.events.push({ type: "respawn", player: p.id });
  }
}

function mod(a: number, n: number): number {
  return ((a % n) + n) % n;
}

/** -π … π */
function wrapAngle(a: number): number {
  return mod(a + Math.PI, 2 * Math.PI) - Math.PI;
}

/** Distance in the ground plane */
function flatDistance(a: Vec3, b: Vec3): number {
  return Math.hypot(b[0] - a[0], b[2] - a[2]);
}
