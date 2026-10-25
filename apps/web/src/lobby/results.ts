import { useEffect, useState } from "react";
import { RESULTS_MS, type RaceStateView } from "@raceball/shared";
import { useRaceState, type NetSession } from "../net";
import type { ResultRow } from "../ui";

/**
 * The synced players as the results ceremony shows them: place, finish time (DNF when they didn't finish), the
 * session's best lap and the bumps this screen counted. In finishing order
 */
export function resultRows(
  state: Pick<RaceStateView, "players">,
  bumps: ReadonlyMap<string, number>,
): ResultRow[] {
  const players = Object.entries(state.players ?? {});
  return players
    .map(([id, p]) => ({
      id,
      place: p.place || players.length,
      name: p.name,
      color: p.color,
      shape: p.shape,
      ball: p.ball,
      time: p.finishedAt > 0 ? p.finishedAt : null,
      bestLap: p.bestLap > 0 ? p.bestLap : null,
      bumps: bumps.get(id) ?? 0,
    }))
    .sort((a, b) => a.place - b.place);
}

/**
 * The final leaderboard for a screen in the room: null until the race ends. Counts every ball's bumps from the
 * events during the race (screens hear them all), and when the room goes back to the lobby (RESULTS_MS after the
 * results begin, on server time)
 */
export function useRaceResults(session: NetSession) {
  const state = useRaceState(session);
  const [ending, setEnding] = useState<{
    bumps: Map<string, number>;
    lobbyAt: number;
  }>();

  useEffect(() => {
    let bumps = new Map<string, number>();
    let phase = session.state.phase;
    const offEvents = session.onEvent((evt) => {
      if (evt.type !== "bump") return;
      for (const id of [evt.a, evt.b])
        if (id) bumps.set(id, (bumps.get(id) ?? 0) + 1);
    });
    const offState = session.subscribe(() => {
      const next = session.state.phase;
      if (next === phase) return;
      phase = next;
      if (next === "countdown") bumps = new Map(); // a new race
      if (next === "results")
        setEnding({
          bumps: new Map(bumps),
          lobbyAt: session.clock.serverNow() + RESULTS_MS,
        });
    });
    return () => {
      offEvents();
      offState();
    };
  }, [session]);

  if (state.phase !== "results") return null;
  return {
    rows: resultRows(state, ending?.bumps ?? new Map<string, number>()),
    laps: state.laps,
    lobbyAt: ending?.lobbyAt,
    now: () => session.clock.serverNow(),
  };
}
