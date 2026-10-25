import RAPIER from "@dimforge/rapier3d-compat";
import type { PlatformIO } from "@gltf-transform/core";
import type { GameEvent, InputMsg, Phase, SnapMsg } from "@raceball/shared";
import { addBall, applyControls, BALL_RADIUS, type PlayerSim } from "./ball";
import { NEUTRAL_INPUT } from "./input";
import { createWorld, initPhysics, TICK_DT } from "./physics";
import { createFlatTrack, type Spawn, type TrackData } from "./track";
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
  // bots, for Rasim's fill-up and load tests:
  botInput(id: string): InputMsg; // steer toward the next checkpoint, full gas
  dispose(): void; // frees the Rapier world (room disposed, page left)
}

/** The real map. Needs loadTrack(), which lands in M1; until then use createFlatRace(). */
/* eslint-disable @typescript-eslint/no-unused-vars -- stub keeps the agreed signature until M1 */
export async function createRace(
  _trackGlb: Uint8Array,
  _io: PlatformIO,
  _cfg: RaceConfig,
): Promise<Race> {
  throw new Error(
    "createRace: loadTrack() isn't implemented yet (M1). Use createFlatRace() for now",
  );
}
/* eslint-enable @typescript-eslint/no-unused-vars */

/** A race on the flat M0 ground. Used by local mode and the tests, and by the server until the map exists. */
export async function createFlatRace(
  cfg: RaceConfig,
  t: Tuning = tuning,
): Promise<Race> {
  await initPhysics();
  const world = createWorld();
  return new FlatRace(world, createFlatTrack(world), cfg, t);
}

class FlatRace implements Race {
  phase: Phase = "lobby";
  laps: number;
  private readonly world: RAPIER.World;
  private readonly track: TrackData;
  private readonly t: Tuning;
  private players = new Map<string, PlayerSim>();
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
  }

  addPlayer(id: string, ball: string): void {
    if (this.players.has(id))
      throw new Error(`player ${id} is already in the race`);
    const taken = new Set([...this.players.values()].map((p) => p.slot));
    const spawn = this.track.spawns.find((s) => !taken.has(s.slot));
    if (!spawn) throw new Error("race is full");
    const body = addBall(this.world, ...spawn.pos);
    this.players.set(id, {
      id,
      ball,
      slot: spawn.slot,
      body,
      heading: spawn.heading,
      input: { ...NEUTRAL_INPUT },
      maxSpeedMul: 1,
      surfaceGrip: 1,
    });
  }

  removePlayer(id: string): void {
    const p = this.players.get(id);
    if (!p) return;
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
    this.world.step();

    for (const p of this.players.values()) {
      if (p.body.translation().y < this.t.fallY) this.respawn(p);
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
    this.world.free();
    this.players.clear();
  }

  /** Back to the grid for now; M1 uses the respawn marker of the last checkpoint instead. */
  private respawn(p: PlayerSim): void {
    const spawn = this.track.spawns.find((s) => s.slot === p.slot) as Spawn;
    p.body.setTranslation(
      { x: spawn.pos[0], y: spawn.pos[1] + BALL_RADIUS + 0.1, z: spawn.pos[2] },
      true,
    );
    p.body.setLinvel({ x: 0, y: 0, z: 0 }, true);
    p.body.setAngvel({ x: 0, y: 0, z: 0 }, true);
    p.heading = spawn.heading;
    this.events.push({ type: "respawn", player: p.id });
  }
}
