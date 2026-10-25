// Captions for the key audio cues (Nuris): stickers that slap onto the big screen when a cue
// plays, so the race reads with the sound off or over a loud venue. Feed it the mixer.
import { useEffect, useState, type CSSProperties } from "react";
import type { Mixer } from "../audio/mixer";
import type { SoundId } from "../audio/sounds";

export interface CaptionsProps {
  mixer: Mixer;
}

/** How long a caption stays up, in ms */
const HOLD = 1800;
/** Older captions fall off when a fourth arrives */
const MAX = 3;

/** Sticker color per cue: race flow in the flag colors, items in their own colors */
const TONE: Partial<Record<SoundId, string>> = {
  countdownGo: "var(--go)",
  lap: "var(--brake)",
  finalLap: "var(--stop)",
  finish: "var(--flag)",
  boostStart: "var(--gas)",
  lionRoar: "var(--flag)",
  spill: "#fff",
  snowDay: "var(--brake)",
};

interface Shown {
  key: number;
  text: string;
  id: SoundId;
  tilt: number;
}

let next = 0;

export function Captions({ mixer }: CaptionsProps) {
  const [shown, setShown] = useState<Shown[]>([]);

  useEffect(() => {
    const timers = new Set<ReturnType<typeof setTimeout>>();
    const off = mixer.onCaption((text, id) => {
      const key = next++;
      const tilt = ((key * 7) % 5) - 2; // -2..2 deg, varied but steady
      setShown((s) => [...s.slice(1 - MAX), { key, text, id, tilt }]);
      const t = setTimeout(() => {
        setShown((s) => s.filter((c) => c.key !== key));
        timers.delete(t);
      }, HOLD);
      timers.add(t);
    });
    return () => {
      off();
      timers.forEach(clearTimeout);
    };
  }, [mixer]);

  return (
    <div className="captions" role="status" aria-live="polite">
      {shown.map((c) => (
        <span
          key={c.key}
          className={c.id === "finalLap" ? "caption is-dark" : "caption"}
          style={
            {
              "--tone": TONE[c.id] ?? "var(--paper)",
              "--tilt": `${c.tilt}deg`,
              "--hold": `${HOLD}ms`,
            } as CSSProperties
          }
        >
          <svg className="caption-wave" viewBox="0 0 16 16" aria-hidden>
            <path d="M2 6v4M6 3v10M10 5v6M14 7v2" />
          </svg>
          {c.text}
        </span>
      ))}
    </div>
  );
}
