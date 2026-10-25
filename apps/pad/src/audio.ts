// Short sounds for race events. Browsers (iOS especially) only allow audio after a tap,
// so unlockAudio() runs inside the "Tap to start" handler. Files are in public/sfx
// (copies of Nuris's sounds in apps/web/public/assets/sfx).

const FILES = {
  bump: ["sfx_bump_01.mp3", "sfx_bump_02.mp3", "sfx_bump_03.mp3"],
  itemPickup: ["sfx_item_pickup.mp3"],
  lap: ["sfx_lap.mp3"],
  finalLap: ["sfx_final_lap.mp3"],
  finish: ["sfx_finish.mp3"],
  fall: ["sfx_fall.mp3"],
  respawn: ["sfx_respawn.mp3"],
} as const;

export type SoundId = keyof typeof FILES;

let ctx: AudioContext | undefined;
const buffers = new Map<string, AudioBuffer>();

async function load(file: string) {
  if (!ctx || buffers.has(file)) return;
  try {
    const data = await (await fetch(`/sfx/${file}`)).arrayBuffer();
    buffers.set(file, await ctx.decodeAudioData(data));
  } catch {
    // a missing sound shouldn't break the controller
  }
}

/** Call inside a tap. Creates the audio context and starts loading every sound */
export function unlockAudio() {
  if (ctx) return void ctx.resume();
  // webkitAudioContext: older iOS Safari, missing from the DOM typings
  const AC =
    window.AudioContext ??
    (window as unknown as { webkitAudioContext?: typeof AudioContext })
      .webkitAudioContext;
  if (!AC) return;
  ctx = new AC();
  void ctx.resume();
  for (const files of Object.values(FILES)) for (const f of files) void load(f);
}

/**
 * Play a sound. Several files: one at random. spread varies the pitch a little (±),
 * so repeated bumps don't sound copied (from the sound rules in docs/ASSETS.md).
 */
export function play(id: SoundId, gain = 1, spread = 0, delayS = 0) {
  if (!ctx) return;
  const files = FILES[id];
  const buffer = buffers.get(files[Math.floor(Math.random() * files.length)]);
  if (!buffer) return;
  const src = ctx.createBufferSource();
  src.buffer = buffer;
  src.playbackRate.value = 1 + (Math.random() * 2 - 1) * spread;
  const vol = ctx.createGain();
  vol.gain.value = Math.max(0, Math.min(1, gain));
  src.connect(vol).connect(ctx.destination);
  src.start(ctx.currentTime + delayS);
}
