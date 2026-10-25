import { useEffect, useState, type ReactNode } from "react";
import type { ItemId } from "@raceball/shared";
import { tuning, type TrackPath } from "@raceball/game-core";
import { useRaceState } from "../net";
import { RaceHud, SteerWheel } from "../ui";
import { HostBoard } from "./HostBoard";
import type { SnapshotSource } from "./net-feed";

/** How often the speedometer reads the ball's speed, ms */
const SPEED_EVERY = 100;

/**
 * A laptop player's race UI over their chase camera: Nuris's RaceHud (place, lap, item, speed, scoops) in the
 * corners, the wheel bottom center, and the live map with the timing tower bottom left, as on the big screen's board. controls: the host's
 * buttons, when the host is playing on this laptop.
 */
export function ViewerHud({
  session,
  path,
  positions,
  speed,
  controls,
  wheelRef,
}: {
  session: SnapshotSource;
  path: TrackPath | null;
  positions: () => Map<string, [number, number]>;
  /** This ball's speed now, m/s */
  speed: () => number;
  controls?: ReactNode;
  /** The wheel indicator, which GameView turns every frame */
  wheelRef: (el: HTMLElement | null) => void;
}) {
  const state = useRaceState(session);
  const [item, setItem] = useState<ItemId | null>(null);
  const [kmh, setKmh] = useState(0);

  useEffect(() => {
    const id = setInterval(() => setKmh(speed() * 3.6), SPEED_EVERY);
    return () => clearInterval(id);
  }, [speed]);

  // the held item isn't synced: it comes and goes with this player's item and fire events, and a race's end
  // (results, back to the lobby) empties the hand
  useEffect(() => {
    const offEvent = session.onEvent?.((evt) => {
      if (!("player" in evt) || evt.player !== session.playerId) return;
      if (evt.type === "item") setItem(evt.item);
      else if (evt.type === "fire") setItem(null);
    });
    const offState = session.subscribe(() => {
      if (session.state.phase !== "racing") setItem(null);
    });
    return () => {
      offEvent?.();
      offState();
    };
  }, [session]);

  const me = session.playerId ? state.players?.[session.playerId] : undefined;
  if (!me || !state.phase || state.phase === "lobby") return null; // the lobby screen covers the view then
  const total = Object.keys(state.players ?? {}).length;
  const laps = state.laps || 3;
  return (
    <>
      <RaceHud
        place={me.place || total}
        lap={Math.min(laps, Math.max(1, me.lap))}
        laps={laps}
        item={item}
        speed={kmh}
        wrongWay={false}
        color={me.color}
        shape={me.shape}
        total={total}
        maxSpeed={tuning.maxSpeed * 3.6 * tuning.boostMaxSpeedMul}
        scoops={me.scoops ?? 0}
        maxScoops={tuning.scoopMax}
      />
      <SteerWheel className="own-wheel" wheelRef={wheelRef} />
      {path && (
        <HostBoard
          session={session}
          path={path}
          positions={positions}
          layout="corner"
          controls={controls}
        />
      )}
    </>
  );
}
