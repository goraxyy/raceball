import { useEffect, useState, type ReactNode } from "react";
import type { TrackPath } from "@raceball/game-core";
import { useRaceState } from "../net";
import {
  Standings,
  TrackMap,
  formatTime,
  type MapPlayer,
  type StandingRow,
} from "../ui";
import type { SnapshotSource } from "./net-feed";

/** How often the live map moves its markers, ms (TrackMap eases between updates) */
const MAP_EVERY = 100;

/**
 * The big screen's race board: the live 2D map and the timing tower (place, lap, gap to the leader), with the host's
 * buttons on top. In the split screen it fills its own cell or column of the grid (TileFrames), so it never covers a
 * player's view; with no views yet it sits at the side.
 */
export function HostBoard({
  session,
  path,
  positions,
  layout,
  controls,
}: {
  session: SnapshotSource;
  path: TrackPath;
  /** Every ball's [x, z] this frame */
  positions: () => Map<string, [number, number]>;
  layout: "slot" | "side";
  /** The host's buttons (rematch), clickable */
  controls?: ReactNode;
}) {
  const state = useRaceState(session);
  const [spots, setSpots] = useState(positions);
  useEffect(() => {
    const id = setInterval(() => setSpots(positions()), MAP_EVERY);
    return () => clearInterval(id);
  }, [positions]);

  const players = Object.entries(state.players ?? {}); // none before the room's first state
  const laps = state.laps || 3;
  const markers: MapPlayer[] = players.flatMap(([id, p]) => {
    const at = spots.get(id);
    return at
      ? [{ id, x: at[0], z: at[1], color: p.color, shape: p.shape }]
      : [];
  });
  const leader = Math.max(
    ...players.filter(([, p]) => !p.finishedAt).map(([, p]) => p.progress ?? 0),
  );
  const rows: StandingRow[] = players.map(([id, p]) => {
    const finished = p.finishedAt > 0;
    const behind = Math.max(0, leader - (p.progress ?? 0));
    return {
      id,
      place: p.place || players.length,
      name: p.name,
      color: p.color,
      shape: p.shape,
      lap: Math.max(1, p.lap),
      finished,
      gap: finished
        ? formatTime(p.finishedAt)
        : behind < 1
          ? "Leader"
          : `+${Math.round(behind)} m`,
    };
  });

  return (
    <aside
      className="host-board"
      data-layout={layout}
      aria-label="Live map and standings"
    >
      {controls && <div className="host-board-controls">{controls}</div>}
      <div className="map-card">
        <TrackMap path={path.points} players={markers} />
      </div>
      <Standings rows={rows} laps={laps} />
    </aside>
  );
}
