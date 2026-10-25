import { MAX_PLAYERS } from "@raceball/shared";
import { Chip, PlanetBall, PlayerShape, playerStyle } from "./pieces";
import type { LobbyPlayer } from "./types";

/** The entry list: one race-number plate per player, plus the open slots */
export function PlayerList({ players }: { players: LobbyPlayer[] }) {
  const open = Math.max(0, MAX_PLAYERS - players.length);
  return (
    <ol className="player-list">
      {players.map((p) => (
        <li
          key={p.id}
          className={p.connected ? "entry" : "entry is-offline"}
          style={playerStyle(p.color)}
        >
          <span className="entry-plate">
            <PlayerShape slot={p.shape} />
          </span>
          <PlanetBall planet={p.ball} slot={p.color} size={40} />
          <span className="entry-name">{p.name}</span>
          <span className="entry-chips">
            {!p.connected ? (
              <Chip on={false}>Reconnecting</Chip>
            ) : (
              <>
                <Chip on={p.phoneOnly || p.paired}>
                  {p.phoneOnly
                    ? "Phone only"
                    : p.paired
                      ? "Paired"
                      : "Pair phone"}
                </Chip>
                <Chip on={p.calibrated}>Calibrated</Chip>
                <Chip on={p.ready}>{p.ready ? "Ready" : "Not ready"}</Chip>
              </>
            )}
          </span>
        </li>
      ))}
      {Array.from({ length: open }, (_, i) => (
        <li key={`open-${i}`} className="entry is-open">
          Open slot
        </li>
      ))}
    </ol>
  );
}
