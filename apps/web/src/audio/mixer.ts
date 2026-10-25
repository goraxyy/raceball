// The mixer (Nuris): plays the sound bank through Web Audio, mixed for the big screen or a laptop.
//   const mix = new Mixer("big"); await mix.load();   // after a user tap (browsers need one)
//   mix.music("musicLobby"); mix.play("bump", { strength: 0.8 }); mix.event("roar");
import {
  BUS_GAIN,
  EVENT_SOUNDS,
  SOUNDS,
  type Bus,
  type Screen,
  type SoundId,
} from "./sounds";

export interface PlayOptions {
  /** 0 to 1: scales the level, e.g. a bump's strength */
  strength?: number;
  /** Extra playback rate on top of the random spread */
  rate?: number;
}

/** Called with a caption whenever a cue that has one plays (the big screen shows them) */
export type CaptionListener = (text: string, id: SoundId) => void;

const MUSIC_FADE = 1; // s, lobby <-> race crossfade
const FINAL_LAP_RATE = 1.06; // about a semitone up: the classic kart-racer lift
const DUCK_HOLD = 0.6; // s the music stays ducked under a cue

export class Mixer {
  readonly ctx = new AudioContext();
  private readonly master = this.ctx.createGain();
  private readonly buses = {} as Record<Bus, GainNode>;
  private readonly buffers = new Map<string, AudioBuffer>();
  private readonly loops = new Map<
    SoundId,
    { src: AudioBufferSourceNode; gain: GainNode; strength: number }
  >();
  private currentMusic?: SoundId;
  private captionListeners = new Set<CaptionListener>();

  private mix: Screen;

  constructor(screen: Screen) {
    this.mix = screen;
    this.master.connect(this.ctx.destination);
    for (const bus of Object.keys(BUS_GAIN) as Bus[]) {
      const g = this.ctx.createGain();
      g.gain.value = BUS_GAIN[bus];
      g.connect(this.master);
      this.buses[bus] = g;
    }
  }

  /** Decode every file once (or just the ids given). Decoding works before the first tap; sound starts after one. */
  async load(ids: SoundId[] = Object.keys(SOUNDS) as SoundId[]) {
    void this.ctx.resume(); // only starts after a user gesture; GameView retries on the first tap
    const files = [...new Set(ids.flatMap((id) => SOUNDS[id].files))].filter(
      (f) => !this.buffers.has(f),
    );
    await Promise.all(
      files.map(async (f) => {
        const data = await (await fetch(f)).arrayBuffer();
        this.buffers.set(f, await this.ctx.decodeAudioData(data));
      }),
    );
  }

  /** Which mix plays: the big screen or a laptop. Switching re-levels anything looping. */
  get screen() {
    return this.mix;
  }
  set screen(s: Screen) {
    this.mix = s;
    for (const [id, l] of this.loops)
      l.gain.gain.setTargetAtTime(
        SOUNDS[id].gain[s] * l.strength,
        this.ctx.currentTime,
        0.1,
      );
  }

  onCaption(fn: CaptionListener) {
    this.captionListeners.add(fn);
    return () => this.captionListeners.delete(fn);
  }

  /** A one-shot. Returns false if the sound isn't loaded or isn't heard on this screen. */
  play(
    id: SoundId,
    { strength = 1, rate = 1 }: PlayOptions = {},
    caption?: string,
  ) {
    const s = SOUNDS[id];
    const level = s.gain[this.screen] * strength;
    const file = s.files[Math.floor(Math.random() * s.files.length)];
    const buffer = this.buffers.get(file);
    if (!buffer || level <= 0) return false;
    const src = this.ctx.createBufferSource();
    src.buffer = buffer;
    const spread = "spread" in s ? s.spread : 0;
    src.playbackRate.value = rate * (1 + (Math.random() * 2 - 1) * spread);
    const gain = this.ctx.createGain();
    gain.gain.value = level;
    src.connect(gain).connect(this.buses[s.bus]);
    src.start();
    if ("duck" in s) this.duck(s.duck);
    const text = caption ?? ("caption" in s ? s.caption : undefined);
    if (text) this.captionListeners.forEach((fn) => fn(text, id));
    return true;
  }

  /** Everything a game event plays (EVENT_SOUNDS), e.g. event("bumpHard", { strength }). */
  event(
    name: keyof typeof EVENT_SOUNDS,
    options?: PlayOptions,
    caption?: string,
  ) {
    for (const id of EVENT_SOUNDS[name] ?? []) this.play(id, options, caption);
  }

  /** Start or stop a loop (rolling, the boost), and set its level and rate while it runs. */
  loop(id: SoundId, on: boolean, { strength = 1, rate = 1 }: PlayOptions = {}) {
    const running = this.loops.get(id);
    const level = SOUNDS[id].gain[this.screen] * strength;
    const now = this.ctx.currentTime;
    if (!on) {
      if (running) {
        running.gain.gain.setTargetAtTime(0, now, 0.08);
        running.src.stop(now + 0.5);
        this.loops.delete(id);
      }
      return;
    }
    if (running) {
      running.strength = strength;
      running.gain.gain.setTargetAtTime(level, now, 0.05);
      running.src.playbackRate.setTargetAtTime(rate, now, 0.05);
      return;
    }
    const buffer = this.buffers.get(SOUNDS[id].files[0]);
    if (!buffer) return;
    const src = this.ctx.createBufferSource();
    src.buffer = buffer;
    src.loop = true;
    src.playbackRate.value = rate;
    const gain = this.ctx.createGain();
    gain.gain.value = 0;
    gain.gain.setTargetAtTime(level, now, 0.05);
    src.connect(gain).connect(this.buses[SOUNDS[id].bus]);
    src.start();
    this.loops.set(id, { src, gain, strength });
  }

  /** Crossfade to a music loop (or to silence with null) over about a second. */
  music(id: "musicLobby" | "musicRace" | null) {
    if (id === this.currentMusic) return;
    if (this.currentMusic) this.loopFade(this.currentMusic, false);
    if (id) this.loopFade(id, true);
    this.currentMusic = id ?? undefined;
  }

  /** The final-lap lift: ramp the race music about a semitone up over half a second. */
  finalLap(on = true) {
    const race = this.loops.get("musicRace");
    race?.src.playbackRate.setTargetAtTime(
      on ? FINAL_LAP_RATE : 1,
      this.ctx.currentTime,
      0.18,
    );
  }

  /** Master level, 0 to 1 (a settings slider, or 0 to mute) */
  set volume(v: number) {
    this.master.gain.setTargetAtTime(
      Math.max(0, Math.min(1, v)),
      this.ctx.currentTime,
      0.05,
    );
  }

  private loopFade(id: SoundId, on: boolean) {
    const now = this.ctx.currentTime;
    if (on) {
      this.loop(id, true);
      const l = this.loops.get(id);
      if (l) {
        l.gain.gain.cancelScheduledValues(now);
        l.gain.gain.setValueAtTime(0, now);
        l.gain.gain.linearRampToValueAtTime(
          SOUNDS[id].gain[this.screen],
          now + MUSIC_FADE,
        );
      }
    } else {
      const l = this.loops.get(id);
      if (!l) return;
      l.gain.gain.cancelScheduledValues(now);
      l.gain.gain.setValueAtTime(l.gain.gain.value, now);
      l.gain.gain.linearRampToValueAtTime(0, now + MUSIC_FADE);
      l.src.stop(now + MUSIC_FADE + 0.05);
      this.loops.delete(id);
    }
  }

  /** Dip the music under an important cue, so it reads over the race */
  private duck(amount: number) {
    const g = this.buses.music.gain;
    const now = this.ctx.currentTime;
    const base = BUS_GAIN.music;
    g.cancelScheduledValues(now);
    g.setTargetAtTime(base * (1 - 0.7 * amount), now, 0.03);
    g.setTargetAtTime(base, now + DUCK_HOLD, 0.25);
  }
}
