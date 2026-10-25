import GUI from "lil-gui";
import { WebIO } from "@gltf-transform/core";
import {
  COUNTDOWN_MS,
  type GameEvent,
  type ItemId,
  type Phase,
  type SnapMsg,
} from "@raceball/shared";
import {
  createFlatRace,
  createRace,
  gateBox,
  HAPPY_VALLEY_GROUND,
  HAPPY_VALLEY_INTERACTABLES,
  KeyboardInput,
  readBoostPads,
  TICK_DT,
  tuning,
  type BoostPadMark,
  type ItemBoxState,
  type KeyState,
  type PuddleState,
  type Race,
  type ScoopState,
} from "@raceball/game-core";
import type { BallFeed, BallLook, BallPose } from "./balls";
import { LocalLapTimer, type TimingGate } from "./local-timing";
import collisionUrl from "../../../../packages/game-core/tracks/happy_valley_col.glb?url";

export type LocalMap = "happy_valley" | "flat";

export interface LocalStats {
  speed: number;
  phase: string;
  elapsed: number;
  lapElapsed: number | null;
  lap: number;
  checkpoint: number;
  section: string;
  lastLap: number | null;
  bestLap: number | null;
  error: string | null;
  position: [number, number, number];
  heading: number;
  item: ItemId | null; // held, fired with Space
  scoops: number; // Creamery Scoops held
}

const OWN_ID = "local";

const KEY_CODES: Record<string, keyof KeyState> = {
  KeyW: "up",
  ArrowUp: "up",
  KeyS: "down",
  ArrowDown: "down",
  KeyA: "left",
  ArrowLeft: "left",
  KeyD: "right",
  ArrowRight: "right",
  Space: "item",
};

/**
 * Local mode (/play?local=1): runs game-core in the browser at a fixed 60 Hz, driven by the keyboard.
 * For testing and tuning only. Online, the physics runs on the server.
 */
export class LocalSession implements BallFeed {
  readonly ownId = OWN_ID;
  /** The planet your ball wears (`&ball=` in the URL) */
  readonly ball: string;
  /** Called with every game event the race raises */
  onEvent?: (event: GameEvent) => void;
  private keys: KeyState = {
    up: false,
    down: false,
    left: false,
    right: false,
    item: false,
  };
  private kb = new KeyboardInput();
  private acc = 0;
  private tick = 0;
  private prev: SnapMsg;
  private curr: SnapMsg;
  /** The tuning panel; game.ts adds the effects test buttons to it */
  readonly gui: GUI;
  readonly stats: LocalStats = {
    speed: 0,
    phase: "lobby",
    elapsed: 0,
    lapElapsed: null,
    lap: 0,
    checkpoint: 0,
    section: "start",
    lastLap: null,
    bestLap: null,
    error: null,
    position: [0, 0, 0],
    heading: 0,
    item: null,
    scoops: 0,
  };
  /** Happy Valley's boost pads, for the views (none on the flat ground) */
  readonly pads: BoostPadMark[];
  private race: Race;
  private readonly makeRace: () => Promise<Race>;
  private readonly timer: LocalLapTimer;
  private disposed = false;
  private resetting = false;

  private constructor(
    race: Race,
    makeRace: () => Promise<Race>,
    gates: TimingGate[],
    ball: string,
    pads: BoostPadMark[],
  ) {
    this.race = race;
    this.pads = pads;
    this.ball = ball;
    this.makeRace = makeRace;
    this.timer = new LocalLapTimer(gates);
    this.prev = this.curr = race.snapshot(0, 0);
    addEventListener("keydown", this.onKeyDown);
    addEventListener("keyup", this.onKeyUp);
    addEventListener("blur", this.onBlur);
    this.gui = createTuningPanel(
      this.stats,
      () => void this.reset(),
      () => this.onEvent?.({ type: "bump", a: OWN_ID, b: "", strength: 1 }),
    );
  }

  static async start(
    map: LocalMap,
    signal: AbortSignal,
    ball = "earth",
  ): Promise<LocalSession> {
    let bytes: Uint8Array | undefined;
    if (map === "happy_valley") {
      const response = await fetch(collisionUrl, { signal });
      if (!response.ok)
        throw new Error(
          `Happy Valley collision failed to load (${response.status}).`,
        );
      bytes = new Uint8Array(await response.arrayBuffer());
    }
    const gates = bytes ? await timingGates(bytes) : [];
    const pads = bytes ? await readBoostPads(bytes, new WebIO()) : [];
    const makeRace = () => newRace(ball, bytes);
    const race = await makeRace();
    if (signal.aborted) {
      race.dispose();
      throw new DOMException("Local load cancelled", "AbortError");
    }
    return new LocalSession(race, makeRace, gates, ball, pads);
  }

  /** Runs as many fixed 1/60 s steps as the frame time covers. */
  advance(frameDt: number): void {
    if (this.disposed || this.resetting) return;
    this.acc += Math.min(frameDt, 0.25); // after a stall, skip ahead instead of spiralling
    while (this.acc >= TICK_DT) {
      this.race.setInput(OWN_ID, this.kb.next(this.keys, TICK_DT));
      this.race.step(TICK_DT);
      this.tick++;
      this.prev = this.curr;
      this.curr = this.race.snapshot(this.tick, this.tick * TICK_DT * 1000);
      let respawned = false;
      for (const e of this.race.drainEvents()) {
        if (e.type === "respawn" && e.player === OWN_ID) respawned = true;
        console.debug("[local] event", e);
        this.onEvent?.(e);
      }
      const from = this.prev.balls.find((b) => b.id === OWN_ID);
      const to = this.curr.balls.find((b) => b.id === OWN_ID);
      if (from && to && !respawned)
        this.timer.advance(from.p, to.p, this.tick * TICK_DT, TICK_DT);
      this.acc -= TICK_DT;
    }
    const own = this.curr.balls.find((b) => b.id === OWN_ID);
    this.stats.speed = own
      ? Math.round(Math.hypot(own.v[0], own.v[2]) * 10) / 10
      : 0;
    this.stats.phase = this.race.phase;
    this.stats.elapsed = this.tick * TICK_DT;
    this.stats.lapElapsed = this.timer.elapsed(this.stats.elapsed);
    this.stats.lap = this.timer.laps;
    this.stats.checkpoint = this.timer.nextCheckpoint;
    this.stats.section = this.timer.section;
    this.stats.lastLap = this.timer.lastLap;
    this.stats.bestLap = this.timer.bestLap;
    const mine = this.race.standings().find((s) => s.id === OWN_ID);
    this.stats.item = mine?.item ?? null;
    this.stats.scoops = mine?.scoops ?? 0;
    if (own) {
      this.stats.position = own.p;
      this.stats.heading = own.h;
    }
  }

  itemBoxes(): ItemBoxState[] {
    return this.race.itemBoxes();
  }

  puddles(): PuddleState[] {
    return this.race.puddles();
  }

  scoops(): ScoopState[] {
    return this.race.scoops();
  }

  get phase(): Phase {
    return this.race.phase;
  }

  look(id: string): BallLook | undefined {
    return id === OWN_ID ? { ball: this.ball, color: 0 } : undefined;
  }

  /** Blends the last two ticks, so motion stays smooth on displays faster than 60 Hz. */
  sample(): Map<string, BallPose> {
    const a = this.acc / TICK_DT;
    const out = new Map<string, BallPose>();
    for (const b of this.curr.balls) {
      const p = this.prev.balls.find((x) => x.id === b.id) ?? b;
      out.set(b.id, {
        p: [
          lerp(p.p[0], b.p[0], a),
          lerp(p.p[1], b.p[1], a),
          lerp(p.p[2], b.p[2], a),
        ],
        q: nlerp(p.q, b.q, a),
        h: lerp(p.h, b.h, a),
        s: b.s,
        d: b.d,
      });
    }
    return out;
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    removeEventListener("keydown", this.onKeyDown);
    removeEventListener("keyup", this.onKeyUp);
    removeEventListener("blur", this.onBlur);
    this.gui.destroy();
    this.race.dispose();
  }

  async reset(): Promise<void> {
    if (this.disposed || this.resetting) return;
    this.resetting = true;
    this.stats.error = null;
    try {
      const next = await this.makeRace();
      if (this.disposed) {
        next.dispose();
        return;
      }
      this.race.dispose();
      this.race = next;
      this.prev = this.curr = next.snapshot(0, 0);
      this.tick = this.acc = 0;
      this.timer.reset();
      this.kb = new KeyboardInput();
      this.onBlur();
      Object.assign(this.stats, {
        speed: 0,
        phase: next.phase,
        elapsed: 0,
        lapElapsed: null,
        lap: 0,
        checkpoint: 0,
        section: "start",
        lastLap: null,
        bestLap: null,
        item: null,
        scoops: 0,
      });
    } catch (error) {
      if (!this.disposed)
        this.stats.error =
          error instanceof Error ? error.message : String(error);
    } finally {
      this.resetting = false;
    }
  }

  private onKeyDown = (e: KeyboardEvent) => {
    if (e.shiftKey || e.metaKey || e.ctrlKey || e.altKey) return;
    if (
      (e.target as HTMLElement | null)?.closest?.(
        "input, textarea, select, button, .lil-gui",
      )
    )
      return;
    if (e.code === "KeyR" && !e.repeat) {
      e.preventDefault();
      void this.reset();
      return;
    }
    const key = KEY_CODES[e.code];
    if (!key) return;
    e.preventDefault(); // arrows and Space would scroll the page
    this.keys[key] = true;
  };

  private onKeyUp = (e: KeyboardEvent) => {
    const key = KEY_CODES[e.code];
    if (key) this.keys[key] = false;
  };

  private onBlur = () => {
    this.keys = {
      up: false,
      down: false,
      left: false,
      right: false,
      item: false,
    };
  };
}

async function newRace(ball: string, bytes?: Uint8Array): Promise<Race> {
  const race = bytes
    ? await createRace(bytes, new WebIO(), {
        laps: 3,
        ground: HAPPY_VALLEY_GROUND,
        interactables: HAPPY_VALLEY_INTERACTABLES,
      })
    : await createFlatRace({ laps: 3 });
  race.addPlayer(OWN_ID, ball);
  race.start(COUNTDOWN_MS, 3); // the same countdown as online, for the grid swoop
  return race;
}

async function timingGates(bytes: Uint8Array): Promise<TimingGate[]> {
  const doc = await new WebIO().readBinary(bytes);
  return doc
    .getRoot()
    .listNodes()
    .filter((node) => node.getExtras().rb === "checkpoint")
    .map((node) => {
      const rotation = node.getWorldRotation();
      // the same tall box as the race's gate, so a jump can't skip it here either
      const box = gateBox(
        node.getWorldTranslation(),
        rotation,
        node.getWorldScale(),
      );
      return {
        index: Number(node.getExtras().index),
        section: String(node.getExtras().section ?? ""),
        position: box.center,
        rotation,
        halfExtents: box.halfExtents,
      };
    });
}

/**
 * lil-gui sliders over the live tuning object. "Copy tuning" puts the values on the clipboard for tuning.ts.
 * "Test bump" fakes a strength 1 bump on your ball, to tune the camera shake without a second ball.
 */
function createTuningPanel(
  stats: { speed: number; phase: string },
  onReset: () => void,
  onBump: () => void,
): GUI {
  const gui = new GUI({ title: "Local mode" });
  gui.add(stats, "speed").name("speed (m/s)").listen().disable();
  gui.add(stats, "phase").listen().disable();

  const folder = gui.addFolder("tuning.ts");
  folder.close();
  for (const key of Object.keys(tuning) as (keyof typeof tuning)[]) {
    const v = tuning[key];
    if (v < 0) folder.add(tuning, key, v * 3, 0);
    else folder.add(tuning, key, 0, Math.max(1, v * 3));
  }

  gui.add({ reset: onReset }, "reset").name("Reset race");
  gui.add({ bump: onBump }, "bump").name("Test bump");
  gui
    .add(
      {
        copy: () =>
          void navigator.clipboard.writeText(JSON.stringify(tuning, null, 2)),
      },
      "copy",
    )
    .name("Copy tuning");
  return gui;
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function nlerp(a: BallPose["q"], b: BallPose["q"], t: number): BallPose["q"] {
  const s = a[0] * b[0] + a[1] * b[1] + a[2] * b[2] + a[3] * b[3] < 0 ? -1 : 1; // take the short way round
  const q = [0, 1, 2, 3].map((i) => lerp(a[i], b[i] * s, t)) as BallPose["q"];
  const n = Math.hypot(...q) || 1;
  return [q[0] / n, q[1] / n, q[2] / n, q[3] / n];
}
