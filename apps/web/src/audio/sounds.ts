// The sound bank (Nuris): every sound the big screen and laptops play, and how it sits in the mix.
// Files live in public/assets/sfx and public/assets/mus. How they were made: docs/ASSETS.md > Audio.

/** Mix buses. Music ducks under the race cues; the crowd only plays on the big screen. */
export type Bus = "music" | "race" | "sfx" | "crowd" | "ui";

/** The big screen plays everything at full level; a laptop plays music quieter and no crowd. */
export type Screen = "big" | "laptop";

export interface Sound {
  /** One file, or several to pick from at random so repeats don't sound identical */
  files: string[];
  bus: Bus;
  /** Level on each screen, 0 to 1 (before the bus level) */
  gain: Record<Screen, number>;
  /** Random playback-rate spread, e.g. 0.05 = ±5% */
  spread?: number;
  /** Loops seamlessly (the WAV loops) */
  loop?: boolean;
  /** On-screen caption on the big screen, for cues that carry information */
  caption?: string;
  /** Duck the music under this cue by this much (0-1) */
  duck?: number;
}

const sfx = (...names: string[]) => names.map((n) => `/assets/sfx/${n}`);
const range = (base: string, n: number) =>
  Array.from(
    { length: n },
    (_, i) => `${base}_${String(i + 1).padStart(2, "0")}.mp3`,
  );

export const SOUNDS = {
  // music: the lobby and race loops; the laptop plays them 8 dB quieter
  musicLobby: {
    files: ["/assets/mus/mus_lobby_loop.wav"],
    bus: "music",
    gain: { big: 1, laptop: 0.4 },
    loop: true,
  },
  musicRace: {
    files: ["/assets/mus/mus_race_loop.wav"],
    bus: "music",
    gain: { big: 1, laptop: 0.4 },
    loop: true,
  },
  resultsSting: {
    files: sfx("mus_results_sting.mp3"),
    bus: "race",
    gain: { big: 0.9, laptop: 0.7 },
    duck: 1,
  },

  // race flow
  countdownBeep: {
    files: sfx("sfx_countdown_beep.mp3"),
    bus: "race",
    gain: { big: 0.8, laptop: 0.8 },
  },
  countdownGo: {
    files: sfx("sfx_countdown_go.mp3"),
    bus: "race",
    gain: { big: 0.9, laptop: 0.9 },
    caption: "Go!",
  },
  lap: {
    files: sfx("sfx_lap.mp3"),
    bus: "race",
    gain: { big: 0.8, laptop: 0.8 },
    caption: "New lap",
    duck: 0.5,
  },
  finalLap: {
    files: sfx("sfx_final_lap.mp3"),
    bus: "race",
    gain: { big: 0.9, laptop: 0.9 },
    caption: "Final lap!",
    duck: 0.6,
  },
  finish: {
    files: sfx("sfx_finish.mp3"),
    bus: "race",
    gain: { big: 1, laptop: 0.9 },
    caption: "Finish!",
    duck: 0.7,
  },

  // the ball
  roll: {
    files: sfx("sfx_roll_loop.wav"),
    bus: "sfx",
    gain: { big: 0.35, laptop: 0.6 },
    loop: true,
  },
  bump: {
    files: range("/assets/sfx/sfx_bump", 3),
    bus: "sfx",
    gain: { big: 0.7, laptop: 0.8 },
    spread: 0.05,
  },
  bumpHeavy: {
    files: range("/assets/sfx/sfx_bump_heavy", 5),
    bus: "sfx",
    gain: { big: 0.8, laptop: 0.8 },
    spread: 0.05,
  },
  land: {
    files: range("/assets/sfx/sfx_land", 5),
    bus: "sfx",
    gain: { big: 0.6, laptop: 0.7 },
    spread: 0.06,
  },
  snowCrunch: {
    files: range("/assets/sfx/sfx_snow_crunch", 2),
    bus: "sfx",
    gain: { big: 0.45, laptop: 0.6 },
    spread: 0.08,
  },
  fall: {
    files: sfx("sfx_fall.mp3"),
    bus: "sfx",
    gain: { big: 0.7, laptop: 0.8 },
  },
  respawn: {
    files: sfx("sfx_respawn.mp3"),
    bus: "sfx",
    gain: { big: 0.7, laptop: 0.8 },
  },

  // items
  itemPickup: {
    files: sfx("sfx_item_pickup.mp3"),
    bus: "sfx",
    gain: { big: 0.7, laptop: 0.8 },
  },
  boostStart: {
    files: sfx("sfx_boost_start.mp3"),
    bus: "sfx",
    gain: { big: 0.8, laptop: 0.8 },
    caption: "Boost!",
  },
  boostLoop: {
    files: sfx("sfx_boost_loop.wav"),
    bus: "sfx",
    gain: { big: 0.5, laptop: 0.6 },
    loop: true,
  },
  lionRoar: {
    files: sfx("sfx_lion_roar.mp3"),
    bus: "sfx",
    gain: { big: 1, laptop: 0.9 },
    caption: "Lion Roar!",
    duck: 0.5,
  },
  roarWhoomp: {
    files: sfx("sfx_roar_whoomp.mp3", "sfx_roar_boom.mp3"),
    bus: "sfx",
    gain: { big: 0.7, laptop: 0.7 },
  },
  spill: {
    files: sfx("sfx_spill.mp3"),
    bus: "sfx",
    gain: { big: 0.8, laptop: 0.8 },
    caption: "Creamery Spill!",
  },
  snowDay: {
    files: sfx("sfx_snowday.mp3"),
    bus: "sfx",
    gain: { big: 0.8, laptop: 0.8 },
    caption: "Snow Day!",
  },

  // the crowd (big screen only)
  crowdCheer: {
    files: sfx("sfx_crowd_cheer.mp3"),
    bus: "crowd",
    gain: { big: 0.7, laptop: 0 },
    spread: 0.04,
  },
  crowdOooh: {
    files: sfx("sfx_crowd_oooh.mp3"),
    bus: "crowd",
    gain: { big: 0.6, laptop: 0 },
    spread: 0.04,
  },

  // lobby and UI
  join: {
    files: sfx("sfx_ui_join.mp3"),
    bus: "ui",
    gain: { big: 0.8, laptop: 0.6 },
  },
  leave: {
    files: sfx("sfx_ui_leave.mp3"),
    bus: "ui",
    gain: { big: 0.7, laptop: 0.5 },
  },
  ready: {
    files: sfx("sfx_ui_ready.mp3"),
    bus: "ui",
    gain: { big: 0.8, laptop: 0.7 },
  },
  error: {
    files: sfx("sfx_ui_error.mp3"),
    bus: "ui",
    gain: { big: 0.8, laptop: 0.8 },
  },
  toggle: {
    files: sfx("sfx_ui_toggle.mp3"),
    bus: "ui",
    gain: { big: 0.6, laptop: 0.6 },
  },
  select: {
    files: sfx("sfx_ui_select.mp3"),
    bus: "ui",
    gain: { big: 0.5, laptop: 0.5 },
  },
  back: {
    files: sfx("sfx_ui_back.mp3"),
    bus: "ui",
    gain: { big: 0.6, laptop: 0.6 },
  },
  click: {
    files: sfx("sfx_ui_click.mp3"),
    bus: "ui",
    gain: { big: 0.6, laptop: 0.6 },
  },
} satisfies Record<string, Sound>;

export type SoundId = keyof typeof SOUNDS;

/** Bus levels: the overall balance between music, cues, effects, crowd and UI */
export const BUS_GAIN: Record<Bus, number> = {
  music: 0.55,
  race: 1,
  sfx: 0.85,
  crowd: 0.7,
  ui: 0.6,
};

/**
 * What each game event sounds like (GameEvent in packages/shared/src/protocol.ts).
 * A list plays together, e.g. the roar and its whoomp.
 */
export const EVENT_SOUNDS: Record<string, SoundId[]> = {
  bump: ["bump"],
  bumpHard: ["bump", "bumpHeavy", "crowdOooh"],
  overtake: ["crowdCheer"],
  lap: ["lap"],
  finalLap: ["finalLap"],
  finish: ["finish", "crowdCheer"],
  respawn: ["fall", "respawn"],
  pickup: ["itemPickup"],
  boost: ["boostStart"],
  roar: ["lionRoar", "roarWhoomp"],
  spill: ["spill"],
  snowday: ["snowDay"],
};
