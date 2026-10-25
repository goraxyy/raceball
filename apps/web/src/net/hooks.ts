import { useEffect, useState, useSyncExternalStore } from "react";
import type { RaceStateView } from "@raceball/shared";
import type { NetSession } from "./session";

const STATS_MS = 500;

/** Lobby and race state, re-rendered on every server patch */
export function useRaceState(session: NetSession): RaceStateView {
  // toJSON() builds a new object each call, so cache it per patch for useSyncExternalStore
  const [cache] = useState(() => ({ state: session.state }));
  return useSyncExternalStore(
    (onChange) =>
      session.subscribe(() => {
        cache.state = session.state;
        onChange();
      }),
    () => cache.state,
  );
}

/** The room's 4-letter code */
export const useRoomCode = (session: NetSession) => session.code;

export interface Pairing {
  /** This laptop's player, once the server has welcomed us */
  playerId?: string;
  pairToken?: string;
  /** True once a phone has joined with our token */
  paired: boolean;
  /** What the pairing QR encodes. Undefined until we have a token */
  padUrl?: string;
}

/** For the laptop's pairing QR: shows the QR until the phone is paired */
export function usePairing(session: NetSession): Pairing {
  const state = useRaceState(session);
  const { playerId, pairToken } = session;
  return {
    playerId,
    pairToken,
    paired: (playerId && state.players[playerId]?.paired) || false,
    padUrl: pairToken ? session.padUrl() : undefined,
  };
}

export interface NetStats {
  /** Latest round trip, ms */
  rtt: number;
  p50: number;
  p95: number;
  jitter: number;
  /** Snapshots per second, 0 until at least two have arrived */
  snapRate: number;
  /** Our player's input age at the server, ms. Undefined on the big screen or before the phone sends */
  inputAge?: number;
}

const readStats = (s: NetSession): NetStats => ({
  rtt: s.clock.rtt,
  p50: s.clock.percentile(50),
  p95: s.clock.percentile(95),
  jitter: s.clock.jitter,
  snapRate: s.buffer.received > 1 ? s.buffer.rate : 0,
  inputAge: s.inputAge,
});

/** Network numbers for the net HUD, refreshed twice a second */
export function useNetStats(session: NetSession): NetStats {
  const [stats, setStats] = useState(() => readStats(session));
  useEffect(() => {
    const id = setInterval(() => setStats(readStats(session)), STATS_MS);
    return () => clearInterval(id);
  }, [session]);
  return stats;
}
