// Dev-only: the sound board. Every cue in the bank, played through the real mixer, with the
// big-screen / laptop mix switch and the captions the big screen shows. For /ui.
import { useEffect, useRef, useState, type CSSProperties } from "react";
import { Mixer } from "../audio/mixer";
import {
  EVENT_SOUNDS,
  SOUNDS,
  type Screen,
  type SoundId,
} from "../audio/sounds";
import { Captions } from "./Captions";

interface Pad {
  id: SoundId;
  label: string;
}

const GROUPS: { title: string; tone: string; pads: Pad[] }[] = [
  {
    title: "Race",
    tone: "var(--flag)",
    pads: [
      { id: "countdownBeep", label: "3, 2, 1" },
      { id: "countdownGo", label: "Go" },
      { id: "lap", label: "Lap" },
      { id: "finalLap", label: "Final lap" },
      { id: "finish", label: "Finish" },
      { id: "resultsSting", label: "Results" },
    ],
  },
  {
    title: "Ball",
    tone: "var(--brake)",
    pads: [
      { id: "bump", label: "Bump" },
      { id: "bumpHeavy", label: "Big hit" },
      { id: "land", label: "Land" },
      { id: "snowCrunch", label: "Snow" },
      { id: "fall", label: "Fall" },
      { id: "respawn", label: "Respawn" },
    ],
  },
  {
    title: "Items",
    tone: "var(--gas)",
    pads: [
      { id: "itemPickup", label: "Pickup" },
      { id: "boostStart", label: "Boost" },
      { id: "lionRoar", label: "Roar" },
      { id: "roarWhoomp", label: "Whoomp" },
      { id: "spill", label: "Spill" },
      { id: "snowDay", label: "Snow Day" },
    ],
  },
  {
    title: "Crowd",
    tone: "var(--go)",
    pads: [
      { id: "crowdCheer", label: "Cheer" },
      { id: "crowdOooh", label: "Oooh" },
    ],
  },
  {
    title: "Lobby",
    tone: "var(--paper-3)",
    pads: [
      { id: "join", label: "Join" },
      { id: "leave", label: "Leave" },
      { id: "ready", label: "Ready" },
      { id: "toggle", label: "Toggle" },
      { id: "select", label: "Select" },
      { id: "back", label: "Back" },
      { id: "click", label: "Click" },
      { id: "error", label: "Error" },
    ],
  },
];

/** Game events that play several sounds at once (EVENT_SOUNDS) */
const COMBOS: { name: keyof typeof EVENT_SOUNDS; label: string }[] = [
  { name: "bumpHard", label: "Hard hit" },
  { name: "overtake", label: "Overtake" },
  { name: "respawn", label: "Off the edge" },
  { name: "roar", label: "Lion Roar" },
  { name: "finish", label: "Win" },
];

export function SoundPreview() {
  const mixer = useRef<Mixer>(null);
  const [ready, setReady] = useState<Mixer | null>(null);
  const [loading, setLoading] = useState(false);
  const [screen, setScreen] = useState<Screen>("big");
  const [music, setMusic] = useState<"musicLobby" | "musicRace" | null>(null);
  const [finalLap, setFinalLap] = useState(false);
  const [loops, setLoops] = useState<Partial<Record<SoundId, boolean>>>({});
  const [hit, setHit] = useState<string | null>(null);

  useEffect(() => () => void mixer.current?.ctx.close(), []);

  async function start() {
    setLoading(true);
    const m = (mixer.current ??= new Mixer(screen));
    await m.load();
    setLoading(false);
    setReady(m);
  }

  function flash(key: string) {
    setHit(key);
    setTimeout(() => setHit((h) => (h === key ? null : h)), 160);
  }

  function pickScreen(s: Screen) {
    setScreen(s);
    const m = mixer.current;
    if (!m) return;
    m.screen = s; // re-levels the music and loops already running
  }

  function pickMusic(id: "musicLobby" | "musicRace") {
    const nextMusic = music === id ? null : id;
    mixer.current?.music(nextMusic);
    setMusic(nextMusic);
    if (nextMusic === "musicRace") mixer.current?.finalLap(finalLap);
  }

  function toggleLoop(id: SoundId) {
    const on = !loops[id];
    mixer.current?.loop(id, on);
    setLoops((l) => ({ ...l, [id]: on }));
  }

  if (!ready) {
    return (
      <section className="ui-screen sound-preview">
        <header className="music-head">
          <span className="eyebrow">Sound pass</span>
          <h1>The sound board</h1>
          <p>
            Every cue in the game, mixed for the big screen or a laptop. The
            browser needs a tap before it plays sound.
          </p>
        </header>
        <button
          type="button"
          className="btn"
          disabled={loading}
          onClick={() => void start()}
        >
          {loading ? "Loading…" : "Turn sound on"}
        </button>
      </section>
    );
  }

  return (
    <section className="ui-screen sound-preview">
      <Captions mixer={ready} />
      <header className="sound-head">
        <div>
          <span className="eyebrow">Sound pass</span>
          <h1>The sound board</h1>
        </div>
        <div className="sound-screens" role="radiogroup" aria-label="Mix">
          {(["big", "laptop"] as const).map((s) => (
            <button
              key={s}
              type="button"
              role="radio"
              aria-checked={screen === s}
              className={screen === s ? "toggle is-on" : "toggle"}
              onClick={() => pickScreen(s)}
            >
              {s === "big" ? "Big screen" : "Laptop"}
              <small>
                {s === "big" ? "full mix + crowd" : "music −8 dB, no crowd"}
              </small>
            </button>
          ))}
        </div>
      </header>

      <div className="sound-rack">
        <article
          className="sound-group"
          style={{ "--tone": "var(--ink)" } as CSSProperties}
        >
          <h2>Music + loops</h2>
          <div className="sound-pads">
            <PadButton
              label="Lobby"
              on={music === "musicLobby"}
              hint="loop"
              onClick={() => pickMusic("musicLobby")}
            />
            <PadButton
              label="Race"
              on={music === "musicRace"}
              hint="loop"
              onClick={() => pickMusic("musicRace")}
            />
            <PadButton
              label="Final lap"
              on={finalLap}
              hint="+6%"
              onClick={() => {
                setFinalLap(!finalLap);
                mixer.current?.finalLap(!finalLap);
              }}
            />
            <PadButton
              label="Rolling"
              on={!!loops.roll}
              hint="loop"
              onClick={() => toggleLoop("roll")}
            />
            <PadButton
              label="Boost"
              on={!!loops.boostLoop}
              hint="loop"
              onClick={() => toggleLoop("boostLoop")}
            />
          </div>
        </article>

        {GROUPS.map((g) => (
          <article
            key={g.title}
            className="sound-group"
            style={{ "--tone": g.tone } as CSSProperties}
          >
            <h2>{g.title}</h2>
            <div className="sound-pads">
              {g.pads.map((p) => {
                const s = SOUNDS[p.id];
                const muted = s.gain[screen] === 0;
                const variants = s.files.length;
                return (
                  <PadButton
                    key={p.id}
                    label={p.label}
                    on={hit === p.id}
                    muted={muted}
                    hint={
                      muted
                        ? "big screen only"
                        : variants > 1
                          ? `${variants} takes`
                          : "caption" in s
                            ? "captioned"
                            : undefined
                    }
                    onClick={() => {
                      mixer.current?.play(p.id);
                      flash(p.id);
                    }}
                  />
                );
              })}
            </div>
          </article>
        ))}

        <article
          className="sound-group is-combos"
          style={{ "--tone": "var(--stop)" } as CSSProperties}
        >
          <h2>Game events</h2>
          <div className="sound-pads">
            {COMBOS.map((c) => (
              <PadButton
                key={c.name}
                label={c.label}
                on={hit === c.name}
                hint={EVENT_SOUNDS[c.name].length + " layers"}
                onClick={() => {
                  mixer.current?.event(c.name);
                  flash(c.name);
                }}
              />
            ))}
          </div>
        </article>
      </div>
    </section>
  );
}

function PadButton(props: {
  label: string;
  on: boolean;
  muted?: boolean;
  hint?: string;
  onClick: () => void;
}) {
  const cls = ["sound-pad", props.on && "is-on", props.muted && "is-muted"]
    .filter(Boolean)
    .join(" ");
  return (
    <button type="button" className={cls} onClick={props.onClick}>
      <span className="sound-pad-label">{props.label}</span>
      {props.hint && <small>{props.hint}</small>}
    </button>
  );
}
