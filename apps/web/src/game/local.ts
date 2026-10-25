import GUI from "lil-gui";
import type { SnapMsg } from "@raceball/shared";
import { createFlatRace, KeyboardInput, TICK_DT, tuning, type KeyState, type Race } from "@raceball/game-core";
import type { BallFeed, BallPose } from "./balls";

const OWN_ID = "local";

const KEY_CODES: Record<string, keyof KeyState> = {
  KeyW: "up", ArrowUp: "up",
  KeyS: "down", ArrowDown: "down",
  KeyA: "left", ArrowLeft: "left",
  KeyD: "right", ArrowRight: "right",
  Space: "item",
};

/**
 * Local mode (/play?local=1): runs game-core in the browser at a fixed 60 Hz, driven by the keyboard.
 * For testing and tuning only. Online, the physics runs on the server.
 */
export class LocalSession implements BallFeed {
  readonly ownId = OWN_ID;
  private keys: KeyState = { up: false, down: false, left: false, right: false, item: false };
  private kb = new KeyboardInput();
  private acc = 0;
  private tick = 0;
  private prev: SnapMsg;
  private curr: SnapMsg;
  private gui: GUI;
  private stats = { speed: 0, phase: "lobby" };

  private constructor(private race: Race) {
    this.prev = this.curr = race.snapshot(0, 0);
    addEventListener("keydown", this.onKeyDown);
    addEventListener("keyup", this.onKeyUp);
    addEventListener("blur", this.onBlur);
    this.gui = createTuningPanel(this.stats, () => void this.reset());
  }

  static async start(): Promise<LocalSession> {
    return new LocalSession(await newRace());
  }

  /** Runs as many fixed 1/60 s steps as the frame time covers. */
  advance(frameDt: number): void {
    this.acc += Math.min(frameDt, 0.25); // after a stall, skip ahead instead of spiralling
    while (this.acc >= TICK_DT) {
      this.race.setInput(OWN_ID, this.kb.next(this.keys, TICK_DT));
      this.race.step(TICK_DT);
      this.tick++;
      this.prev = this.curr;
      this.curr = this.race.snapshot(this.tick, this.tick * TICK_DT * 1000);
      for (const e of this.race.drainEvents()) console.debug("[local] event", e);
      this.acc -= TICK_DT;
    }
    const own = this.curr.balls.find((b) => b.id === OWN_ID);
    this.stats.speed = own ? Math.round(Math.hypot(own.v[0], own.v[2]) * 10) / 10 : 0;
    this.stats.phase = this.race.phase;
  }

  /** Blends the last two ticks, so motion stays smooth on displays faster than 60 Hz. */
  sample(): Map<string, BallPose> {
    const a = this.acc / TICK_DT;
    const out = new Map<string, BallPose>();
    for (const b of this.curr.balls) {
      const p = this.prev.balls.find((x) => x.id === b.id) ?? b;
      out.set(b.id, {
        p: [lerp(p.p[0], b.p[0], a), lerp(p.p[1], b.p[1], a), lerp(p.p[2], b.p[2], a)],
        q: nlerp(p.q, b.q, a),
        h: lerp(p.h, b.h, a),
      });
    }
    return out;
  }

  dispose(): void {
    removeEventListener("keydown", this.onKeyDown);
    removeEventListener("keyup", this.onKeyUp);
    removeEventListener("blur", this.onBlur);
    this.gui.destroy();
    this.race.dispose();
  }

  private async reset(): Promise<void> {
    const next = await newRace();
    this.race.dispose();
    this.race = next;
    this.prev = this.curr = next.snapshot(0, 0);
    this.tick = 0;
  }

  private onKeyDown = (e: KeyboardEvent) => {
    const key = KEY_CODES[e.code];
    if (!key || e.shiftKey || e.metaKey || e.ctrlKey) return;
    if ((e.target as HTMLElement | null)?.closest?.(".lil-gui")) return; // typing a value in the panel
    e.preventDefault(); // arrows and Space would scroll the page
    this.keys[key] = true;
  };

  private onKeyUp = (e: KeyboardEvent) => {
    const key = KEY_CODES[e.code];
    if (key) this.keys[key] = false;
  };

  private onBlur = () => {
    this.keys = { up: false, down: false, left: false, right: false, item: false };
  };
}

async function newRace(): Promise<Race> {
  const race = await createFlatRace({ laps: 3 });
  race.addPlayer(OWN_ID, "lion");
  race.start(0, 3);
  return race;
}

/** lil-gui sliders over the live tuning object. "Copy tuning" puts the values on the clipboard for tuning.ts. */
function createTuningPanel(stats: { speed: number; phase: string }, onReset: () => void): GUI {
  const gui = new GUI({ title: "Local mode" });
  gui.add(stats, "speed").name("speed (m/s)").listen().disable();
  gui.add(stats, "phase").listen().disable();

  const folder = gui.addFolder("tuning.ts");
  for (const key of Object.keys(tuning) as (keyof typeof tuning)[]) {
    const v = tuning[key];
    if (v < 0) folder.add(tuning, key, v * 3, 0);
    else folder.add(tuning, key, 0, Math.max(1, v * 3));
  }

  gui.add({ reset: onReset }, "reset").name("Reset race");
  gui.add({ copy: () => void navigator.clipboard.writeText(JSON.stringify(tuning, null, 2)) }, "copy").name("Copy tuning");
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
