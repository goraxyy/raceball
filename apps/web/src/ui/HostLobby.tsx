import { MAX_PLAYERS } from "@raceball/shared";
import { PlayerList } from "./PlayerList";
import { QrCode } from "./QrCode";
import type { LobbyPlayer } from "./types";

const LAP_CHOICES = [1, 3];

export interface HostLobbyProps {
  code: string;
  /** What the big-screen QR encodes: the pad URL for phone-only players */
  phoneJoinUrl: string;
  players: LobbyPlayer[];
  laps: number;
  onLapsChange: (laps: number) => void;
  onAddBot: () => void;
  canStart: boolean;
  onStart: () => void;
}

/** The big screen before a race: room code and QR on the left, the entry list on the right */
export function HostLobby({
  code,
  phoneJoinUrl,
  players,
  laps,
  onLapsChange,
  onAddBot,
  canStart,
  onStart,
}: HostLobbyProps) {
  const full = players.length >= MAX_PLAYERS;
  const waiting = players.filter((p) => !p.ready).length;
  return (
    <section className="ui-screen host-lobby">
      <div className="host-join">
        <div className="logo">
          Race<span>Ball</span>
        </div>
        <div className="room-code">
          <span className="eyebrow">Room code</span>
          <span className="room-code-letters" aria-label={`Room code ${code}`}>
            {code.split("").map((c, i) => (
              <span key={i}>{c}</span>
            ))}
          </span>
        </div>
        <div className="host-qr">
          <QrCode
            url={phoneJoinUrl}
            label="QR code to join with just your phone"
          />
          <p>
            <b>Just a phone?</b> Scan to join. <b>Got a laptop?</b> Open{" "}
            <code>/play</code> and enter the code.
          </p>
        </div>
      </div>

      <div className="host-entries">
        <header className="host-entries-head">
          <h1>Entry list</h1>
          <span className="count">
            {players.length}/{MAX_PLAYERS}
          </span>
        </header>
        <PlayerList players={players} />
        <footer className="host-controls">
          <div className="laps" role="radiogroup" aria-label="Laps">
            <span className="laps-label">Laps</span>
            {LAP_CHOICES.map((n) => (
              <button
                key={n}
                type="button"
                role="radio"
                aria-checked={laps === n}
                className={laps === n ? "lap-choice is-on" : "lap-choice"}
                onClick={() => onLapsChange(n)}
              >
                {n}
              </button>
            ))}
          </div>
          <button
            type="button"
            className="btn btn-ghost"
            onClick={onAddBot}
            disabled={full}
          >
            + Bot
          </button>
          <button
            type="button"
            className="btn start-race"
            onClick={onStart}
            disabled={!canStart}
          >
            Start race
          </button>
        </footer>
        {!canStart && players.length > 0 && (
          <p className="host-hint">
            Waiting for {waiting} {waiting === 1 ? "player" : "players"} to get
            ready
          </p>
        )}
      </div>
    </section>
  );
}
