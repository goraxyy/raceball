import { useState, type FormEvent } from "react";
import { PLANETS } from "@raceball/shared";
import { PlanetBall } from "./pieces";

export interface ViewerJoinProps {
  onJoin: (code: string, name: string, ball: string) => void;
  /** Planets other players in the room already picked */
  taken?: string[];
  /** Pre-filled from ?room= in the URL */
  initialCode?: string;
  /** A Back button next to Join (the host's "Play on this laptop") */
  onCancel?: () => void;
}

/** A laptop player joins: room code, name and planet */
export function ViewerJoin({
  onJoin,
  taken = [],
  initialCode = "",
  onCancel,
}: ViewerJoinProps) {
  const [code, setCode] = useState(initialCode);
  const [name, setName] = useState("");
  const [ball, setBall] = useState<string>(
    PLANETS.find((p) => !taken.includes(p)) ?? PLANETS[0],
  );
  const valid = /^[A-Z]{4}$/.test(code) && name.trim().length > 0;

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (valid) onJoin(code, name.trim(), ball);
  };

  return (
    <section className="ui-screen viewer-join">
      <form className="join-card" onSubmit={submit}>
        <span className="eyebrow">Step 1</span>
        <h1>Join the race</h1>
        <div className="join-fields">
          <label className="field">
            Room code
            <input
              className="code-input"
              value={code}
              onChange={(e) =>
                setCode(
                  e.target.value
                    .toUpperCase()
                    .replace(/[^A-Z]/g, "")
                    .slice(0, 4),
                )
              }
              placeholder="ABCD"
              autoComplete="off"
              autoCapitalize="characters"
              spellCheck={false}
              inputMode="text"
            />
          </label>
          <label className="field">
            Name
            <input
              value={name}
              onChange={(e) => setName(e.target.value.slice(0, 12))}
              placeholder="Your name"
              autoComplete="nickname"
            />
          </label>
        </div>
        <fieldset className="planet-picker">
          <legend>Pick your planet</legend>
          {PLANETS.map((p) => (
            <label key={p} className="planet-option">
              <input
                type="radio"
                name="ball"
                value={p}
                checked={ball === p}
                disabled={taken.includes(p)}
                onChange={() => setBall(p)}
              />
              <PlanetBall planet={p} slot={1} size={52} />
              {p}
            </label>
          ))}
        </fieldset>
        <div className="join-actions">
          {onCancel && (
            <button type="button" className="btn btn-ghost" onClick={onCancel}>
              Back
            </button>
          )}
          <button type="submit" className="btn" disabled={!valid}>
            Join race
          </button>
        </div>
      </form>
    </section>
  );
}
