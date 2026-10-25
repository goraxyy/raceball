import type { Phase } from "./protocol";

// Plain-object views of the synced Colyseus schema (apps/server/src/rooms/schema.ts),
// as clients get them from room.state.toJSON(). Keep the two in step.

export interface PlayerView {
  name: string;
  ball: string;
  /** Index into the 8 player colors */
  color: number;
  /** Index into the 8 player shapes */
  shape: number;
  phoneOnly: boolean;
  /** A server-side fill-up bot (always ready) */
  bot: boolean;
  paired: boolean;
  calibrated: boolean;
  assetsLoaded: boolean;
  ready: boolean;
  lap: number;
  checkpoint: number;
  place: number;
  /** Server time in ms, 0 until finished */
  finishedAt: number;
  connected: boolean;
}

export interface ItemBoxView {
  id: string;
  x: number;
  y: number;
  z: number;
  active: boolean;
}

export interface RaceStateView {
  phase: Phase;
  laps: number;
  /** Server time in ms when the countdown ends, 0 outside the countdown */
  countdownEndsAt: number;
  trackId: string;
  /** By playerId */
  players: Record<string, PlayerView>;
  itemBoxes: ItemBoxView[];
}

/** Planets other players already have, for greying them out in the pickers */
export function takenPlanets(
  state: Pick<RaceStateView, "players">,
  exceptPlayer?: string,
): Set<string> {
  return new Set(
    Object.entries(state.players)
      .filter(([id]) => id !== exceptPlayer)
      .map(([, p]) => p.ball),
  );
}

/** Ready to start: the same rule for the host's Start button and the server. Bots are always ready */
export function readyToRace(p: PlayerView): boolean {
  if (p.bot) return true;
  return (
    p.connected &&
    p.paired &&
    p.calibrated &&
    (p.phoneOnly || p.assetsLoaded) &&
    p.ready
  );
}

/** The host may start once there's at least one player and everyone is readyToRace() */
export function canStart(
  state: Pick<RaceStateView, "phase" | "players">,
): boolean {
  const players = Object.values(state.players);
  return (
    state.phase === "lobby" && players.length > 0 && players.every(readyToRace)
  );
}
