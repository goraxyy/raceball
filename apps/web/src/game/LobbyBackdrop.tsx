import type { RefObject } from "react";
import { useRaceState } from "../net";
import { TOUR } from "./lobby-tour";
import type { SnapshotSource } from "./net-feed";
import "./lobby-backdrop.css";

/**
 * Between a laptop's lobby screen and the landmark tour behind it: a navy wash that softens the map so the lobby
 * reads, the HackPSU space theme card, and the name of the landmark in view. dipRef: the navy cover that hides the
 * cuts between shots (GameView sets its opacity every frame, with no React render)
 */
export function LobbyBackdrop({
  session,
  stop,
  dipRef,
}: {
  session: SnapshotSource;
  /** The tour's shot, an index into TOUR (null before the map is in) */
  stop: number | null;
  dipRef: RefObject<HTMLDivElement | null>;
}) {
  const state = useRaceState(session);
  if (state.phase && state.phase !== "lobby") return null;
  const shot = stop === null ? undefined : TOUR[stop];
  return (
    <div className="lobby-backdrop">
      <div className="lobby-dip" ref={dipRef} />
      <header className="lobby-theme">
        <span className="eyebrow">HackPSU Fall 2026 · Space</span>
        <h1>The Happy Valley Grand Prix</h1>
        <p>Eight planets race a toy-sized Penn State</p>
      </header>
      {shot && (
        // keyed by the shot, so each landmark's name slides in fresh
        <p className="lobby-landmark" key={stop} aria-hidden="true">
          <span className="lobby-landmark-name">{shot.name}</span>
          <span className="lobby-landmark-line">{shot.line}</span>
        </p>
      )}
    </div>
  );
}
