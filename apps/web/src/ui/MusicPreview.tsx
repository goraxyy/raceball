// Dev-only: listen to the two music loops the way the game plays them (Web Audio, looping
// buffers), with the final-lap lift and the quieter laptop mix. For /ui.
import { useEffect, useRef, useState, type CSSProperties } from "react";

const TRACKS = [
  {
    id: "lobby",
    file: "/assets/mus/mus_lobby_loop.wav",
    title: "Lobby",
    sub: "100 BPM · F major · swung",
    notes: "Marimba, plucked bass, glockenspiel, brushes",
    sleeve: "var(--brake)",
  },
  {
    id: "race",
    file: "/assets/mus/mus_race_loop.wav",
    title: "Race",
    sub: "148 BPM · G major",
    notes: "Steel-drum hook, plucked bass, marimba, kit",
    sleeve: "var(--gas)",
  },
] as const;
type TrackId = (typeof TRACKS)[number]["id"];

/** The game plays the race loop this much faster on the final lap: about a semitone up */
const FINAL_LAP_RATE = 1.06;
/** Laptops play music quieter than the big screen (docs/ASSETS.md > Audio) */
const LAPTOP_GAIN = 10 ** (-8 / 20);
const BARS = 12;

export function MusicPreview() {
  const ctx = useRef<AudioContext>(null);
  const buffers = useRef(new Map<string, AudioBuffer>());
  const playing = useRef<{
    id: TrackId;
    src: AudioBufferSourceNode;
    gain: GainNode;
    meter: AnalyserNode;
    startedAt: number;
  } | null>(null);
  const [now, setNow] = useState<TrackId | null>(null);
  const [finalLap, setFinalLap] = useState(false);
  const [laptop, setLaptop] = useState(false);
  const [level, setLevel] = useState(0);
  const [loops, setLoops] = useState(0);

  // live level for the meter, and how many times the loop has wrapped
  useEffect(() => {
    let frame = 0;
    const data = new Float32Array(1024);
    const tick = () => {
      const p = playing.current;
      if (p && ctx.current) {
        p.meter.getFloatTimeDomainData(data);
        let sum = 0;
        for (const v of data) sum += v * v;
        const db = 20 * Math.log10(Math.sqrt(sum / data.length) || 1e-6);
        setLevel(Math.max(0, Math.min(1, (db + 42) / 36)));
        const dur = p.src.buffer!.duration / p.src.playbackRate.value;
        setLoops(Math.floor((ctx.current.currentTime - p.startedAt) / dur));
      } else {
        setLevel(0);
      }
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, []);

  useEffect(() => () => void ctx.current?.close(), []);

  useEffect(() => {
    const p = playing.current;
    if (!p || !ctx.current) return;
    p.src.playbackRate.setTargetAtTime(
      p.id === "race" && finalLap ? FINAL_LAP_RATE : 1,
      ctx.current.currentTime,
      0.4,
    );
    p.gain.gain.setTargetAtTime(
      laptop ? LAPTOP_GAIN : 1,
      ctx.current.currentTime,
      0.1,
    );
  }, [finalLap, laptop, now]);

  async function toggle(id: TrackId) {
    const audio = (ctx.current ??= new AudioContext());
    await audio.resume();
    const old = playing.current;
    if (old) {
      old.gain.gain.setTargetAtTime(0, audio.currentTime, 0.08);
      old.src.stop(audio.currentTime + 0.4);
      playing.current = null;
    }
    if (old?.id === id) {
      setNow(null);
      return;
    }
    const track = TRACKS.find((t) => t.id === id)!;
    let buffer = buffers.current.get(id);
    if (!buffer) {
      buffer = await audio.decodeAudioData(
        await (await fetch(track.file)).arrayBuffer(),
      );
      buffers.current.set(id, buffer);
    }
    const src = audio.createBufferSource();
    src.buffer = buffer;
    src.loop = true; // the files are built to loop with no seam
    const gain = audio.createGain();
    const meter = audio.createAnalyser();
    meter.fftSize = 1024;
    src.connect(gain).connect(meter).connect(audio.destination);
    src.start();
    playing.current = { id, src, gain, meter, startedAt: audio.currentTime };
    setLoops(0);
    setNow(id);
  }

  return (
    <section className="ui-screen music-preview">
      <header className="music-head">
        <span className="eyebrow">Original soundtrack</span>
        <h1>Happy Valley Grand Prix</h1>
        <p>
          Two seamless loops, composed in code by{" "}
          <code>tools/audio/gen_music.py</code>.
        </p>
      </header>
      <div className="music-sleeves">
        {TRACKS.map((t) => {
          const on = now === t.id;
          return (
            <article
              key={t.id}
              className={on ? "sleeve is-on" : "sleeve"}
              style={{ "--sleeve": t.sleeve } as CSSProperties}
            >
              <div className="sleeve-art" aria-hidden>
                <span className="sleeve-record" />
              </div>
              <div className="sleeve-body">
                <h2>{t.title}</h2>
                <span className="sleeve-sub">{t.sub}</span>
                <span className="sleeve-notes">{t.notes}</span>
                <div className="sleeve-meter" aria-hidden>
                  {Array.from({ length: BARS }, (_, i) => (
                    <span
                      key={i}
                      className={
                        on && i < Math.round(level * BARS) ? "is-lit" : ""
                      }
                    />
                  ))}
                </div>
                <div className="sleeve-controls">
                  <button
                    type="button"
                    className="btn"
                    onClick={() => void toggle(t.id)}
                  >
                    {on ? "Stop" : "Play"}
                  </button>
                  {on && <span className="sleeve-loops">Loop {loops + 1}</span>}
                </div>
              </div>
            </article>
          );
        })}
      </div>
      <footer className="music-toggles">
        <label className={finalLap ? "toggle is-on" : "toggle"}>
          <input
            type="checkbox"
            checked={finalLap}
            onChange={(e) => setFinalLap(e.target.checked)}
          />
          Final lap <small>race +6%</small>
        </label>
        <label className={laptop ? "toggle is-on" : "toggle"}>
          <input
            type="checkbox"
            checked={laptop}
            onChange={(e) => setLaptop(e.target.checked)}
          />
          Laptop mix <small>−8 dB</small>
        </label>
      </footer>
    </section>
  );
}
