import { useEffect, useState, type CSSProperties, type ReactNode } from "react";
import { PlanetBall, PlayerShape, playerStyle } from "./pieces";

export interface ResultRow {
  id: string;
  place: number;
  name: string;
  color: number;
  shape: number;
  /** Planet id from PLANETS */
  ball: string;
  /** Race time in ms, or null if they didn't finish */
  time: number | null;
  /** Best lap in ms, or null */
  bestLap: number | null;
  bumps: number;
  /** Optional brag title, e.g. "Shrine Jumper" */
  title?: string;
}

export interface ResultsProps {
  /** Everyone, in finishing order. The top three stand on the podium */
  rows: ResultRow[];
  laps: number;
  onRematch?: () => void;
  /** Server time in ms when the room goes back to the lobby, if it does on its own */
  lobbyAt?: number;
  /** Current server time, ms (the net session's clock.serverNow); defaults to Date.now */
  now?: () => number;
  /** Ali's 3D podium. When given, it replaces the drawn podium and shows through behind it */
  children?: ReactNode;
}

/** 1:04.3, the way race programs print times */
export function formatTime(ms: number | null): string {
  if (ms == null) return "DNF";
  const m = Math.floor(ms / 60000);
  const s = (ms % 60000) / 1000;
  return `${m}:${s.toFixed(1).padStart(4, "0")}`;
}

const suffix = (n: number) => ({ 1: "st", 2: "nd", 3: "rd" })[n] ?? "th";
/** Podium order on screen: 2nd, 1st, 3rd */
const STEPS = [2, 1, 3];
/** Livery colors (art bible): gas, brake, flag, go, stop, paper */
const CONFETTI_COLORS = [
  "#F5702A",
  "#7CC3E8",
  "#FFC81E",
  "#1F9E57",
  "#D7263D",
  "#F3EAD9",
];

/**
 * The prize ceremony after a race: a podium on the left (players' planets on slanted blocks that
 * rise 3rd, 2nd, 1st), the final classification on the right, and a short confetti burst.
 */
export function Results({
  rows,
  laps,
  onRematch,
  lobbyAt,
  now = Date.now,
  children,
}: ResultsProps) {
  const sorted = [...rows].sort((a, b) => a.place - b.place);
  const winner = sorted[0];
  const finishers = sorted.filter((r) => r.bestLap != null);
  const fastest = finishers.length
    ? finishers.reduce((a, b) => (b.bestLap! < a.bestLap! ? b : a)).id
    : undefined;
  const mostBumps = sorted.reduce(
    (a, b) => (b.bumps > a.bumps ? b : a),
    sorted[0],
  );
  const bumper = mostBumps && mostBumps.bumps > 0 ? mostBumps.id : undefined;

  return (
    <section className="ui-screen results-screen">
      <Confetti />
      <div className="results-podium">
        <header className="results-head">
          <span className="eyebrow">
            Happy Valley Grand Prix · {laps} {laps === 1 ? "lap" : "laps"}
          </span>
          {winner && (
            <h1 className="results-winner" style={playerStyle(winner.color)}>
              <span>{winner.name}</span> wins!
            </h1>
          )}
        </header>
        {children ?? (
          <div className="podium" aria-label="Podium">
            {STEPS.map((step, i) => {
              const r = sorted[step - 1];
              if (!r)
                return <div key={step} className="podium-spot is-empty" />;
              return (
                <div
                  key={r.id}
                  className={`podium-spot is-p${step}`}
                  style={
                    {
                      ...playerStyle(r.color),
                      "--rise": `${0.35 + (3 - step) * 0.45}s`,
                      "--i": i,
                    } as CSSProperties
                  }
                >
                  <PlanetBall
                    planet={r.ball}
                    slot={r.color}
                    size={step === 1 ? 104 : 80}
                  />
                  <span className="podium-name">{r.name}</span>
                  <div className="podium-block">
                    <span className="podium-place">
                      {step}
                      <small>{suffix(step)}</small>
                    </span>
                    <span className="podium-time">{formatTime(r.time)}</span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <div className="results-sheet">
        <header className="results-sheet-head">
          <h2>Final classification</h2>
        </header>
        <ol className="classification">
          <li className="classification-head" aria-hidden>
            <span />
            <span />
            <span>Driver</span>
            <span>Time</span>
            <span>Best lap</span>
            <span>Bumps</span>
          </li>
          {sorted.map((r, i) => (
            <li
              key={r.id}
              className={
                r.time == null
                  ? "classification-row is-dnf"
                  : "classification-row"
              }
              style={{ ...playerStyle(r.color), "--i": i } as CSSProperties}
            >
              <span className="cl-place">{r.place}</span>
              <span className="cl-plate">
                <PlayerShape slot={r.shape} />
              </span>
              <span className="cl-name">
                {r.name}
                {r.title && <em className="cl-title">{r.title}</em>}
              </span>
              <span className="cl-time">
                {i === 0 || r.time == null
                  ? formatTime(r.time)
                  : gap(r.time, winner.time)}
              </span>
              <span
                className={r.id === fastest ? "cl-best is-fastest" : "cl-best"}
              >
                {formatTime(r.bestLap)}
                {r.id === fastest && <b className="award">Fastest lap</b>}
              </span>
              <span
                className={r.id === bumper ? "cl-bumps is-bumper" : "cl-bumps"}
              >
                {r.bumps}
                {r.id === bumper && <b className="award">Bumper car</b>}
              </span>
            </li>
          ))}
        </ol>
        <footer className="results-actions">
          {lobbyAt !== undefined && <LobbyIn at={lobbyAt} now={now} />}
          {onRematch && (
            <button type="button" className="btn" onClick={onRematch}>
              Rematch
            </button>
          )}
        </footer>
      </div>
    </section>
  );
}

/** "+2.4" behind the winner, the way the classification reads after first place */
function gap(time: number, lead: number | null) {
  if (lead == null) return formatTime(time);
  return `+${((time - lead) / 1000).toFixed(1)}`;
}

function LobbyIn({ at, now }: { at: number; now: () => number }) {
  const [left, setLeft] = useState(() => at - now());
  useEffect(() => {
    const id = setInterval(() => setLeft(at - now()), 250);
    return () => clearInterval(id);
  }, [at, now]);
  const s = Math.max(0, Math.ceil(left / 1000));
  return <span className="lobby-in">Back to the lobby in {s}</span>;
}

/** A one-time burst of paper confetti in the livery colors; skipped with reduced motion */
function Confetti() {
  const [pieces] = useState(() =>
    Array.from({ length: 46 }, (_, i) => ({
      left: `${(i * 37) % 100}%`,
      color: CONFETTI_COLORS[i % CONFETTI_COLORS.length],
      delay: `${((i * 53) % 90) / 100}s`,
      drift: `${((i * 29) % 60) - 30}vw`,
      spin: `${((i * 71) % 4) + 2}turn`,
      wide: i % 3 === 0,
    })),
  );
  return (
    <div className="confetti" aria-hidden>
      {pieces.map((p, i) => (
        <span
          key={i}
          className={p.wide ? "confetti-piece is-wide" : "confetti-piece"}
          style={
            {
              left: p.left,
              background: p.color,
              animationDelay: p.delay,
              "--drift": p.drift,
              "--spin": p.spin,
            } as CSSProperties
          }
        />
      ))}
    </div>
  );
}
