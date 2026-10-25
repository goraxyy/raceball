// The event-to-effect table (Nuris): what every game event looks and sounds like on the big screen
// and on a laptop, and the player that runs it. game.ts hands it the events and the ball poses;
// Ali adds the camera shake. Particle files: public/assets/fx (docs/ASSETS.md > VFX). Sounds: ../audio.
import {
  Color3,
  Color4,
  GPUParticleSystem,
  ParticleSystem,
  PointParticleEmitter,
  Vector3,
  type Scene,
} from "@babylonjs/core";
import { tuning } from "@raceball/game-core";
import {
  PLAYER_COLORS,
  type GameEvent,
  type ItemId,
  type Phase,
} from "@raceball/shared";
import type { Mixer } from "../audio/mixer";
import { EVENT_SOUNDS, SOUNDS, type Screen } from "../audio/sounds";
import type { BallPose } from "./balls";

/** A game event, plus an item being fired (the protocol's `item` is the pickup, as on the pad) */
export type FxEvent = GameEvent | { type: "use"; player: string; item: ItemId };

type FxFile =
  | "fx_dust"
  | "fx_bump_sparks"
  | "fx_respawn_poof"
  | "fx_respawn_stars"
  | "fx_boost_flames"
  | "fx_boost_trail"
  | "fx_roar_ring"
  | "fx_roar_debris"
  | "fx_spill_splat"
  | "fx_spill_sprinkles"
  | "fx_snowfall"
  | "fx_snow_puff"
  | "fx_confetti";
type BurstFile = Exclude<
  FxFile,
  "fx_dust" | "fx_boost_flames" | "fx_boost_trail" | "fx_snowfall"
>;
type Fx = ParticleSystem | GPUParticleSystem;

/** Where a burst goes off */
export type Anchor =
  | "ball" // on the player's ball
  | "contact" // where the two bumping balls touch
  | "behind" // 1.2 m behind the ball, where a dropped spill lands
  | "above" // 2.5 m over the ball
  | "ahead"; // 6 m ahead on the road: a finisher rolls on into the confetti cannon

export interface Burst {
  file: BurstFile;
  at: Anchor;
  /** Particles at strength 0, plus perStrength × strength */
  count: number;
  perStrength?: number;
  /** A beat later, e.g. the roar's second ring */
  afterMs?: number;
  /** Paint it in the player's color */
  tint?: "player";
}

export interface FxCue {
  bursts: Burst[];
  /** Which line of EVENT_SOUNDS plays */
  sound?: keyof typeof EVENT_SOUNDS;
  /** The big screen's caption: {name}, {lap}, {laps} and {place} are filled in */
  caption?: string;
  /** On a laptop: "own" only for your ball; "near" for any ball, quieter the further away it is */
  laptop: "own" | "near";
  /** The sound (not the particles) waits this long before it can play again, so a pile-up isn't a wall of noise */
  coolMs?: number;
}

/** Above this strength a bump is a crash: heavier thud, more sparks, and the crowd gasps on the big screen */
export const HARD_BUMP = 0.6;

export type CueName =
  | "bump"
  | "bumpHard"
  | "pickup"
  | "takeLead"
  | "lap"
  | "finalLap"
  | "win"
  | "finish"
  | "respawn"
  | "boost"
  | "roar"
  | "spill"
  | "snowday";

/** The table. Read a row as: when this happens, these particles go off here, this plays, this caption shows. */
export const FX_TABLE: Record<CueName, FxCue> = {
  bump: {
    bursts: [
      { file: "fx_bump_sparks", at: "contact", count: 6, perStrength: 12 },
    ],
    sound: "bump",
    laptop: "near",
    coolMs: 70,
  },
  bumpHard: {
    bursts: [
      { file: "fx_bump_sparks", at: "contact", count: 12, perStrength: 14 },
    ],
    sound: "bumpHard",
    laptop: "near",
    coolMs: 1600, // inside it, a crash sounds like a plain bump: one gasp per pile-up
  },
  pickup: {
    bursts: [{ file: "fx_bump_sparks", at: "ball", count: 18 }],
    sound: "pickup",
    laptop: "own",
  },
  takeLead: {
    bursts: [],
    sound: "overtake",
    caption: "{name} takes the lead!",
    laptop: "own",
    coolMs: 3000,
  },
  lap: {
    bursts: [],
    sound: "lap",
    caption: "Lap {lap}/{laps}",
    laptop: "own",
  },
  finalLap: {
    bursts: [],
    sound: "finalLap",
    caption: "Final lap!",
    laptop: "own",
  },
  win: {
    bursts: [{ file: "fx_confetti", at: "ahead", count: 260 }],
    sound: "finish",
    caption: "{name} wins!",
    laptop: "near",
  },
  finish: {
    bursts: [{ file: "fx_confetti", at: "ahead", count: 70 }],
    sound: "finish",
    caption: "{name} · {place}",
    laptop: "own",
  },
  respawn: {
    bursts: [
      { file: "fx_respawn_poof", at: "ball", count: 10 },
      { file: "fx_respawn_stars", at: "ball", count: 7, tint: "player" },
    ],
    sound: "respawn", // the fall when it happens, the chime with the poof (see run)
    laptop: "near",
  },
  boost: {
    bursts: [], // the flames run on the ball for the whole boost, see update()
    sound: "boost",
    caption: "{name}: Boost!",
    laptop: "near",
  },
  roar: {
    bursts: [
      { file: "fx_roar_ring", at: "ball", count: 1 },
      { file: "fx_roar_ring", at: "ball", count: 1, afterMs: 120 },
      { file: "fx_roar_debris", at: "ball", count: 14 },
    ],
    sound: "roar",
    caption: "{name}: Lion Roar!",
    laptop: "near",
  },
  spill: {
    bursts: [
      { file: "fx_spill_splat", at: "behind", count: 12 },
      { file: "fx_spill_sprinkles", at: "behind", count: 20 },
    ],
    sound: "spill",
    caption: "{name}: Creamery Spill!",
    laptop: "near",
  },
  snowday: {
    bursts: [{ file: "fx_snow_puff", at: "above", count: 30 }],
    sound: "snowday",
    caption: "Snow Day!",
    laptop: "near",
  },
};

/** What the screen knows about the race, to pick and word a cue */
export interface FxWorld {
  screen: Screen;
  /** Your ball on a laptop; null on the big screen */
  ownId(): string | null;
  laps(): number;
  name(id: string): string;
  /** Player color slot (PLAYER_COLORS) */
  color(id: string): number;
  /** Current place, 1 = leading; 0 if unknown */
  place(id: string): number;
}

export interface Cue {
  name: CueName;
  /** Whose cue it is: where it plays, and whose name goes in the caption */
  player: string;
  /** The other ball in a bump */
  other?: string;
  strength: number;
  vars: Record<string, string | number>;
}

const ITEM_CUE: Record<ItemId, CueName> = {
  boost: "boost",
  roar: "roar",
  spill: "spill",
  snowday: "snowday",
};

/**
 * Which cue an event is on this screen, or null if this screen stays quiet about it. The big screen
 * tells the story of the race (the leader's laps, a new leader, every finish); a laptop follows its
 * own ball and hears the others nearby.
 */
export function cueFor(evt: FxEvent, world: FxWorld): Cue | null {
  const own = world.ownId();
  const laps = world.laps();
  switch (evt.type) {
    case "bump": {
      // on a laptop the bump is "yours" if you're in it, so it plays at full level
      const player = own === evt.b ? evt.b : evt.a;
      const other = player === evt.a ? evt.b : evt.a;
      const name = evt.strength >= HARD_BUMP ? "bumpHard" : "bump";
      return { name, player, other, strength: evt.strength, vars: {} };
    }
    case "item":
      return cue("pickup", evt.player);
    case "use":
      return cue(ITEM_CUE[evt.item], evt.player);
    case "overtake":
      // only a change at the front is news; the standings tower shows the rest
      if (world.place(evt.passed) !== 1) return null;
      return cue("takeLead", evt.player);
    case "lap": {
      const final = evt.lap >= laps;
      if (world.screen === "big" && world.place(evt.player) > 1) return null;
      return cue(final ? "finalLap" : "lap", evt.player, { lap: evt.lap });
    }
    case "finish":
      return cue(evt.place === 1 ? "win" : "finish", evt.player, {
        place: ordinal(evt.place),
      });
    case "respawn":
      return cue("respawn", evt.player);
  }

  function cue(
    name: CueName,
    player: string,
    vars: Record<string, string | number> = {},
  ): Cue {
    return {
      name,
      player,
      strength: 1,
      vars: { name: world.name(player), laps, ...vars },
    };
  }
}

/** The caption with its {placeholders} filled in */
export function caption(text: string, vars: Cue["vars"]): string {
  return text.replace(/\{(\w+)\}/g, (m, key: string) =>
    key in vars ? String(vars[key]) : m,
  );
}

export const ordinal = (n: number) =>
  `${n}${n % 100 >= 11 && n % 100 <= 13 ? "th" : ({ 1: "st", 2: "nd", 3: "rd" }[n % 10] ?? "th")}`;

/** On a laptop, someone else's cue fades out over this distance, m */
const HEAR_RANGE = 45;
/** How loud a laptop plays a cue from someone else's ball, at distance 0 */
const OTHERS_LEVEL = 0.7;

/** How loud this screen plays a cue: 1 for the big screen and your own ball, less for balls further away */
export function cueLevel(
  cue: Cue,
  world: FxWorld,
  distance: (a: string, b: string) => number,
): number {
  if (world.screen === "big") return 1;
  const own = world.ownId();
  if (!own) return 1; // a laptop that hasn't been told its ball yet
  if (cue.player === own) return 1;
  if (FX_TABLE[cue.name].laptop === "own") return 0;
  const d = distance(cue.player, own);
  return Number.isFinite(d)
    ? OTHERS_LEVEL * Math.max(0, 1 - d / HEAR_RANGE)
    : 0;
}

const FX_URL = `${import.meta.env.BASE_URL}assets/fx/`;
/** The heavy ones run on the GPU where the browser supports it */
const GPU_FILES: readonly FxFile[] = ["fx_snowfall", "fx_confetti"];
/** Copies of each burst, used in turn, so two bursts in one frame don't share an emitter */
const POOL: Record<BurstFile, number> = {
  fx_bump_sparks: 3,
  fx_respawn_poof: 2,
  fx_respawn_stars: 2,
  fx_roar_ring: 2,
  fx_roar_debris: 2,
  fx_spill_splat: 2,
  fx_spill_sprinkles: 2,
  fx_snow_puff: 2,
  fx_confetti: 1,
};
const DUST_RATE = 24; // per second at top speed (ASSETS.md > VFX v1)
const FLAMES_RATE = 70;
const TRAIL_RATE = 40;
/** A fired Blue & White Boost burns this long; a boost pad lights the flames for as long as the ball is over top speed */
const BOOST_SECONDS = 2.2;
/** Above normal top speed by this much, a ball must have been boosted */
const OVERSPEED = 1.04;
/** A respawn's poof waits for the ball to reappear: a jump this big in one frame, or this long at most */
const TELEPORT_M = 3;
const RESPAWN_WAIT_S = 0.6;
const SNOW_DUST = "#F4F6F8";

interface Tracked {
  p: Vector3;
  v: Vector3; // smoothed velocity, m/s
  h: number;
  dust?: Fx;
  flames?: Fx;
  trail?: Fx;
  boostLeft: number;
  /** When the ball last jumped like a respawn (clock seconds) */
  jumpedAt: number;
}

/**
 * Runs the table: loads every particle file once, keeps a dust trail and boost flames on each ball,
 * fires bursts at the right spot, and plays the sound and caption through the mixer.
 *   const fx = new GameFx(scene, world); await fx.load();
 *   fx.play(evt);                         // whenever an event arrives
 *   fx.update(dt, poses, cameraTarget);   // every frame
 */
export class GameFx {
  /** Set once the player has tapped (browsers need one before audio starts); the visuals run without it */
  mixer?: Mixer;
  private readonly json = new Map<FxFile, unknown>();
  private readonly pools = new Map<BurstFile, Fx[]>();
  private readonly turn = new Map<BurstFile, number>();
  private readonly balls = new Map<string, Tracked>();
  private readonly queue: FxEvent[] = [];
  private readonly later: { at: number; run: () => void }[] = [];
  private readonly respawns = new Map<string, number>();
  private readonly lastSound = new Map<CueName, number>();
  private snowfall?: Fx;
  private snowOn = false;
  private clock = 0;
  private phase?: Phase;
  private beeped = Infinity;
  private loaded = false;
  private disposed = false;
  private readonly scene: Scene;
  private readonly world: FxWorld;

  constructor(scene: Scene, world: FxWorld) {
    this.scene = scene;
    this.world = world;
  }

  async load(): Promise<void> {
    const files = [
      ...Object.keys(POOL),
      "fx_dust",
      "fx_boost_flames",
      "fx_boost_trail",
      "fx_snowfall",
    ] as FxFile[];
    await Promise.all(
      files.map(async (f) => {
        const res = await fetch(`${FX_URL}${f}.json`);
        if (!res.ok) throw new Error(`${f}.json: HTTP ${res.status}`);
        this.json.set(f, await res.json());
      }),
    );
    if (this.disposed) return;
    for (const [file, n] of Object.entries(POOL) as [BurstFile, number][]) {
      const copies = Array.from({ length: n }, () => this.make(file));
      copies.forEach((ps) => ps.start()); // bursts sit idle until a count is set
      this.pools.set(file, copies);
    }
    this.snowfall = this.make("fx_snowfall");
    if (this.snowOn) this.snowfall.start();
    this.loaded = true;
  }

  /** Queue an event. It plays on the next update, when the ball poses are current. */
  play(evt: FxEvent): void {
    if (!this.disposed) this.queue.push(evt);
  }

  /** The Arboretum: snowfall around the camera, snow-white dust, and puffs on bumps */
  set snow(on: boolean) {
    if (on === this.snowOn) return;
    this.snowOn = on;
    if (on) this.snowfall?.start();
    else this.snowfall?.stop();
    for (const b of this.balls.values()) if (b.dust) this.paintDust(b.dust);
  }

  /** Music follows the race: lobby loop, a hush for the countdown, the race loop from Go, the sting at the end */
  setPhase(phase: Phase): void {
    if (phase === this.phase) return;
    const was = this.phase;
    this.phase = phase;
    const mix = this.mixer;
    if (!mix) return;
    if (phase === "lobby") {
      mix.finalLap(false);
      mix.music("musicLobby");
    } else if (phase === "countdown") {
      this.beeped = Infinity;
      mix.music(null);
    } else if (phase === "racing") {
      mix.music("musicRace");
      if (was !== "countdown") mix.finalLap(false); // joined mid-race
    } else {
      mix.finalLap(false);
      mix.play("resultsSting");
      mix.music("musicLobby");
    }
  }

  /** During the countdown, every frame: beeps on 3, 2, 1 and the horn on Go, on server time */
  countdown(msLeft: number): void {
    const step = Math.ceil(msLeft / 1000); // 3, 2, 1, then 0 = Go
    if (step >= this.beeped || step > 3) return;
    this.beeped = step;
    this.mixer?.play(step > 0 ? "countdownBeep" : "countdownGo");
  }

  update(dt: number, poses: Map<string, BallPose>, focus?: Vector3): void {
    if (this.disposed) return;
    this.clock += dt;
    this.track(dt, poses);
    if (!this.loaded) return; // events wait in the queue until the files are in
    for (const evt of this.queue.splice(0)) this.run(evt);
    for (const [id, waited] of this.respawns) {
      const b = this.balls.get(id);
      if (!b) {
        this.respawns.delete(id);
        continue;
      }
      if (waited + dt < RESPAWN_WAIT_S) this.respawns.set(id, waited + dt);
      else this.fireRespawn(id);
    }
    for (let i = this.later.length - 1; i >= 0; i--) {
      if (this.later[i].at > this.clock) continue;
      const [job] = this.later.splice(i, 1);
      job.run();
    }
    this.trails(dt);
    if (this.snowfall && focus)
      (this.snowfall.emitter as Vector3).copyFrom(focus);
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.mixer?.loop("roll", false);
    this.mixer?.loop("boostLoop", false);
    for (const pool of this.pools.values()) pool.forEach((ps) => ps.dispose());
    for (const b of this.balls.values()) this.dropBall(b);
    this.snowfall?.dispose();
    this.pools.clear();
    this.balls.clear();
  }

  private make(file: FxFile): Fx {
    const json = this.json.get(file);
    return GPU_FILES.includes(file) && GPUParticleSystem.IsSupported
      ? GPUParticleSystem.Parse(json, this.scene, FX_URL, true)
      : ParticleSystem.Parse(json, this.scene, FX_URL, true);
  }

  /** Follows every ball: position, a smoothed velocity, and its own dust and boost systems */
  private track(dt: number, poses: Map<string, BallPose>): void {
    for (const [id, pose] of poses) {
      const p = Vector3.FromArray(pose.p);
      let b = this.balls.get(id);
      if (!b) {
        b = { p, v: Vector3.Zero(), h: pose.h, boostLeft: 0, jumpedAt: -1 };
        this.balls.set(id, b);
      }
      const jump = Vector3.Distance(p, b.p);
      if (jump > TELEPORT_M) {
        b.v.setAll(0); // a respawn, not a very fast frame
        b.jumpedAt = this.clock;
        if (this.respawns.has(id)) {
          b.p = p;
          this.fireRespawn(id);
        }
      } else if (dt > 0) {
        const k = 1 - Math.exp(-12 * dt);
        b.v
          .scaleInPlace(1 - k)
          .addInPlace(p.subtract(b.p).scaleInPlace(k / dt));
      }
      b.p = p;
      b.h = pose.h;
      if (this.loaded && !b.dust) {
        b.dust = this.make("fx_dust");
        b.dust.emitter = b.p.clone();
        this.paintDust(b.dust);
        b.dust.start();
      }
    }
    for (const [id, b] of this.balls) {
      if (poses.has(id)) continue;
      this.dropBall(b);
      this.balls.delete(id);
    }
  }

  /** Dust, boost flames and the rolling sound of your own ball */
  private trails(dt: number): void {
    const own = this.world.ownId();
    let ownSpeed = -1;
    let ownBoost = false;
    for (const [id, b] of this.balls) {
      const speed = Math.hypot(b.v.x, b.v.z);
      const grounded = Math.abs(b.v.y) < 1.5;
      if (b.dust) {
        (b.dust.emitter as Vector3).copyFrom(b.p);
        b.dust.emitRate = grounded
          ? DUST_RATE * Math.min(1, speed / tuning.maxSpeed)
          : 0;
      }
      b.boostLeft = Math.max(0, b.boostLeft - dt);
      const boosting = b.boostLeft > 0 || speed > tuning.maxSpeed * OVERSPEED;
      if (boosting && !b.flames) {
        b.flames = this.make("fx_boost_flames");
        b.trail = this.make("fx_boost_trail");
        b.flames.start();
        b.trail.start();
      }
      if (b.flames && b.trail) {
        this.aimBoost(b, b.flames, 1.6, 2.4, [0.5, 1.1], 0.35);
        this.aimBoost(b, b.trail, 0.8, 1.2, [0.1, 0.3], 0.15);
        b.flames.emitRate = boosting ? FLAMES_RATE : 0;
        b.trail.emitRate = boosting ? TRAIL_RATE : 0;
      }
      if (id === own) {
        ownSpeed = grounded ? speed : 0;
        ownBoost = boosting;
      }
    }
    const mix = this.mixer;
    if (!mix || !own) return; // the big screen has no ball of its own to listen to
    const racing = this.phase === undefined || this.phase === "racing";
    const f = Math.min(1.3, Math.max(0, ownSpeed) / tuning.maxSpeed);
    mix.loop("roll", racing && ownSpeed > 0.5, {
      strength: Math.min(1, 0.25 + f),
      rate: 0.6 + f, // 0.6 at a crawl to 1.6 at top speed (ASSETS.md > Audio)
    });
    mix.loop("boostLoop", racing && ownBoost);
  }

  /** The boost blows backward along the heading, not the roll */
  private aimBoost(
    b: Tracked,
    ps: Fx,
    lo: number,
    hi: number,
    up: readonly [number, number],
    spread: number,
  ): void {
    const back = new Vector3(-Math.sin(b.h), 0, -Math.cos(b.h));
    const side = new Vector3(back.z, 0, -back.x);
    // from the back of the ball, not its middle, so the ball doesn't hide the first of the flame
    (ps.emitter as Vector3).copyFrom(b.p).addInPlace(back.scale(0.45)).y += 0.1;
    const e = ps.particleEmitterType as PointParticleEmitter;
    e.direction1.copyFrom(back.scale(lo).addInPlace(side.scale(-spread))).y =
      up[0];
    e.direction2.copyFrom(back.scale(hi).addInPlace(side.scale(spread))).y =
      up[1];
  }

  private run(evt: FxEvent): void {
    const cue = cueFor(evt, this.world);
    if (!cue) return;
    if (cue.name === "respawn") {
      // the fall plays now; the poof and its chime wait until the ball reappears on the track
      const level = this.levelOf(cue);
      if (level > 0) this.mixer?.play("fall", { strength: level });
      this.respawns.set(cue.player, 0);
      const b = this.balls.get(cue.player);
      if (b && this.clock - b.jumpedAt < 0.3) this.fireRespawn(cue.player); // it already reappeared
      return;
    }
    if (cue.name === "boost") {
      const b = this.balls.get(cue.player);
      if (b) b.boostLeft = BOOST_SECONDS;
    }
    if (cue.name === "finalLap" && this.levelOf(cue) > 0)
      this.mixer?.finalLap();
    this.burst(cue);
    if (this.snowOn && cue.name.startsWith("bump"))
      this.emit("fx_snow_puff", this.at(cue, "contact"), 6 + 8 * cue.strength);
    this.sound(cue);
  }

  private fireRespawn(id: string): void {
    this.respawns.delete(id);
    const cue: Cue = { name: "respawn", player: id, strength: 1, vars: {} };
    this.burst(cue);
    const level = this.levelOf(cue);
    if (level > 0) this.mixer?.play("respawn", { strength: level });
  }

  private burst(cue: Cue): void {
    for (const b of FX_TABLE[cue.name].bursts) {
      const go = () => {
        const at = this.at(cue, b.at);
        if (!at) return;
        if (b.tint === "player") this.tintFor(b.file, cue.player);
        this.emit(b.file, at, b.count + (b.perStrength ?? 0) * cue.strength);
      };
      if (b.afterMs)
        this.later.push({ at: this.clock + b.afterMs / 1000, run: go });
      else go();
    }
  }

  private at(cue: Cue, anchor: Anchor): Vector3 | undefined {
    const b = this.balls.get(cue.player);
    if (!b) return undefined;
    switch (anchor) {
      case "ball":
        return b.p.clone();
      case "contact": {
        const o = cue.other ? this.balls.get(cue.other) : undefined;
        return o ? Vector3.Center(b.p, o.p) : b.p.clone();
      }
      case "behind":
        return b.p.add(
          new Vector3(-Math.sin(b.h), 0, -Math.cos(b.h)).scale(1.2),
        );
      case "above":
        return b.p.add(new Vector3(0, 2.5, 0));
      case "ahead":
        return b.p.add(new Vector3(Math.sin(b.h) * 6, 0, Math.cos(b.h) * 6));
    }
  }

  private emit(file: BurstFile, at: Vector3 | undefined, count: number): void {
    const pool = this.pools.get(file);
    if (!pool || !at) return;
    const i = this.turn.get(file) ?? 0;
    this.turn.set(file, (i + 1) % pool.length);
    const ps = pool[i];
    (ps.emitter as Vector3).copyFrom(at);
    ps.manualEmitCount = Math.max(0, ps.manualEmitCount) + Math.round(count);
  }

  /** The next copy of a burst takes the player's color (the respawn stars) */
  private tintFor(file: BurstFile, player: string): void {
    const pool = this.pools.get(file);
    if (!pool) return;
    const ps = pool[this.turn.get(file) ?? 0];
    const slot = this.world.color(player);
    const c = Color3.FromHexString(PLAYER_COLORS[slot % PLAYER_COLORS.length]);
    ps.color1 = new Color4(c.r, c.g, c.b, 1);
    ps.color2 = new Color4(c.r, c.g, c.b, 1);
    ps.colorDead = new Color4(c.r, c.g, c.b, 0);
  }

  private paintDust(ps: Fx): void {
    if (!this.snowOn) {
      const fresh = this.json.get("fx_dust") as {
        color1: number[];
        color2: number[];
        colorDead: number[];
      };
      ps.color1 = Color4.FromArray(fresh.color1);
      ps.color2 = Color4.FromArray(fresh.color2);
      ps.colorDead = Color4.FromArray(fresh.colorDead);
      return;
    }
    const c = Color3.FromHexString(SNOW_DUST);
    ps.color1 = new Color4(c.r, c.g, c.b, 0.7);
    ps.color2 = new Color4(c.r, c.g, c.b, 0.7);
    ps.colorDead = new Color4(c.r, c.g, c.b, 0);
  }

  private levelOf(cue: Cue): number {
    return cueLevel(cue, this.world, (a, b) => {
      const pa = this.balls.get(a)?.p;
      const pb = this.balls.get(b)?.p;
      return pa && pb ? Vector3.Distance(pa, pb) : Infinity;
    });
  }

  private sound(cue: Cue): void {
    const mix = this.mixer;
    const row = FX_TABLE[cue.name];
    if (!mix || !row.sound) return;
    const level = this.levelOf(cue);
    if (level <= 0) return;
    let line = row.sound;
    const last = this.lastSound.get(cue.name) ?? -Infinity;
    if (row.coolMs && (this.clock - last) * 1000 < row.coolMs) {
      if (cue.name !== "bumpHard") return;
      line = "bump"; // a crash inside the cooldown still thuds, without another gasp
    } else {
      this.lastSound.set(cue.name, this.clock);
    }
    const strength = cue.name.startsWith("bump")
      ? level * (0.4 + 0.6 * cue.strength)
      : level;
    const text = row.caption ? caption(row.caption, cue.vars) : undefined;
    // the caption rides on the cue that has one, so a two-sound line shows one sticker
    let captioned = false;
    for (const id of EVENT_SOUNDS[line]) {
      const own = "caption" in SOUNDS[id];
      const give =
        text && !captioned && (own || id === EVENT_SOUNDS[line].at(-1));
      mix.play(id, { strength }, give ? text : "");
      if (give) captioned = true;
    }
  }

  private dropBall(b: Tracked): void {
    b.dust?.dispose();
    b.flames?.dispose();
    b.trail?.dispose();
  }
}
