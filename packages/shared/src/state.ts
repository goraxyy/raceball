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
