import type { ItemId } from "@raceball/shared";
import { PlayerShape, playerStyle } from "./pieces";

export interface RaceHudProps {
  place: number;
  lap: number;
  laps: number;
  /** The item the player holds, or null */
  item: ItemId | null;
  /** km/h (the ball's speed in m/s × 3.6) */
  speed: number;
  wrongWay: boolean;
  /** The player's slots into PLAYER_COLORS / PLAYER_SHAPES */
  color: number;
  shape: number;
  /** Players in the race, for "of 6" under the place */
  total?: number;
  /** Top of the speedometer, km/h */
  maxSpeed?: number;
}

const ITEM_LABEL: Record<ItemId, string> = {
  boost: "Boost",
  roar: "Roar",
  spill: "Spill",
  snowday: "Snow day",
};

const suffix = (n: number) => ({ 1: "st", 2: "nd", 3: "rd" })[n] ?? "th";

/** Gauge segments, and the arc they sit on (degrees, 0 = straight up) */
const SEGMENTS = 14;
const ARC_FROM = -120;
const ARC_TO = 120;

/**
 * The laptop player's HUD, drawn over their chase camera. Everything sits in the corners so the
 * middle stays clear for the race: place + lap top left, item top right, speed bottom right,
 * and the wrong-way banner top center only when needed.
 */
export function RaceHud({
  place,
  lap,
  laps,
  item,
  speed,
  wrongWay,
  color,
  shape,
  total,
  maxSpeed = 40,
}: RaceHudProps) {
  const finalLap = lap >= laps;
  const lit = Math.round(Math.min(1, Math.max(0, speed / maxSpeed)) * SEGMENTS);
  return (
    <div className="race-hud" style={playerStyle(color)}>
      <div className="hud-place">
        <span className="hud-place-plate">
          <b>{place}</b>
          <small>{suffix(place)}</small>
        </span>
        <span className="hud-place-side">
          <PlayerShape slot={shape} />
          {total ? <span className="hud-of">of {total}</span> : null}
        </span>
        <span className={finalLap ? "hud-lap is-final" : "hud-lap"}>
          {finalLap ? "Final lap" : `Lap ${lap}/${laps}`}
        </span>
      </div>

      <div className="hud-item" data-item={item ?? ""}>
        <span className="hud-item-badge">
          {item ? ITEM_LABEL[item] : "No item"}
        </span>
        {item && <span className="hud-item-hint">Shake!</span>}
      </div>

      <div className="hud-speed" aria-label={`${Math.round(speed)} km/h`}>
        <svg viewBox="-60 -60 120 92" aria-hidden>
          {Array.from({ length: SEGMENTS }, (_, i) => {
            const a = ARC_FROM + ((i + 0.5) / SEGMENTS) * (ARC_TO - ARC_FROM);
            const hot = i >= SEGMENTS - 3;
            return (
              <rect
                key={i}
                className={
                  i < lit ? (hot ? "seg is-on is-hot" : "seg is-on") : "seg"
                }
                x="-4"
                y="-52"
                width="8"
                height="15"
                rx="2"
                transform={`rotate(${a})`}
              />
            );
          })}
        </svg>
        <span className="hud-speed-number">{Math.round(speed)}</span>
        <span className="hud-speed-unit">km/h</span>
      </div>

      {wrongWay && <div className="hud-wrong-way">Wrong way!</div>}
    </div>
  );
}
