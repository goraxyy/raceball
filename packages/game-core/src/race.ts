import RAPIER from "@dimforge/rapier3d-compat";
import type { PlatformIO } from "@gltf-transform/core";
import type { GameEvent, InputMsg, Phase, SnapMsg } from "@raceball/shared";
import { addBall, applyControls, BALL_RADIUS, type PlayerSim } from "./ball";
import { NEUTRAL_INPUT } from "./input";
import { createWorld, initPhysics, TICK_DT } from "./physics";
import { createFlatTrack, loadTrack, type TrackData, type Vec3 } from "./track";
import { tuning, type Tuning } from "./tuning";

export interface RaceConfig {
  laps: number;
}

export interface Standing {
  id: string;
  place: number; // 1 = leading
  lap: number;
  checkpoint: number;
  finishedAt: number | null; // race time in ms, null while still racing
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
  standings(): Standing[]; // id, place, lap, checkpoint, finishedAt
  readonly phase: Phase;
  readonly laps: number;
  /** The route's centerline as [x, z] points from the finish line, for the big-screen map; [] without a route */
  readonly path: [number, number][];
  // bots, for Rasim's fill-up and load tests:
  botInput(id: string): InputMsg; // steer toward the next checkpoint, full gas
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
  stuckFor: number; // seconds of gas while barely moving
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
  private readonly byCollider = new Map<number, Racer>();
  private players = new Map<string, Racer>();
  private events: GameEvent[] = [];
  private countdownLeftMs = 0;

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
  }

  addPlayer(id: string, ball: string): void {
    if (this.players.has(id))
      throw new Error(`player ${id} is already in the race`);
    const taken = new Set([...this.players.values()].map((p) => p.slot));
    const spawn = this.track.spawns.find((s) => !taken.has(s.slot));
    if (!spawn) throw new Error("race is full");
    const body = addBall(this.world, ...spawn.pos);
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
      stuckFor: 0,
    };
    this.players.set(id, racer);
    this.byCollider.set(racer.collider, racer);
  }

  removePlayer(id: string): void {
    const p = this.players.get(id);
    if (!p) return;
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
    const acceptInput = this.phase === "racing";
    for (const p of this.players.values()) {
      applyControls(
        p,
        acceptInput ? p.input : NEUTRAL_INPUT,
        dt,
        this.t,
        this.world,
      );
      p.input.item = false; // fires once, even if no new input arrives before the next tick
    }
    this.world.step(this.queue);
    this.queue.drainCollisionEvents((h1, h2, started) => {
      if (!started) return;
      const gate = this.gateOrder.get(h1) ?? this.gateOrder.get(h2);
      const p = this.byCollider.get(h1) ?? this.byCollider.get(h2);
      // only the next gate counts, so shortcuts and driving backwards don't
      if (gate !== undefined && p && gate === p.next) this.passGate(p, gate);
    });

    for (const p of this.players.values()) {
      if (p.body.translation().y < this.t.fallY) this.respawn(p);
      else if (acceptInput && this.isStuck(p, dt)) this.respawn(p);
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
    // Placeholder order (by grid slot) until checkpoints and ranking land in M2
    return [...this.players.values()]
      .sort((a, b) => a.slot - b.slot)
      .map((p, i) => ({
        id: p.id,
        place: i + 1,
        lap: 0,
        checkpoint: 0,
        finishedAt: null,
      }));
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars -- steering per player arrives with checkpoints (M2)
  botInput(_id: string): InputMsg {
    // No checkpoints to steer toward yet (M2), so bots just drive straight
    return { ...NEUTRAL_INPUT, gas: 1 };
  }

  dispose(): void {
    this.queue.free();
    this.world.free();
    this.players.clear();
    this.byCollider.clear();
  }

  private passGate(p: Racer, gate: number): void {
    p.last = gate;
    p.next = (gate + 1) % this.track.checkpoints.length;
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
    this.events.push({ type: "respawn", player: p.id });
  }
}
