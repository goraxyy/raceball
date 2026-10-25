import type { CSSProperties } from "react";
import { PLAYER_COLORS, PLAYER_SHAPES } from "@raceball/shared";

/** CSS variable that colors a player's pieces (shape, orbit ring, plate) */
export const playerStyle = (slot: number): CSSProperties =>
  ({ "--player": PLAYER_COLORS[slot % PLAYER_COLORS.length] }) as CSSProperties;

/** The player's shape in their color: shape + color, never color alone */
export function PlayerShape({ slot }: { slot: number }) {
  return (
    <span
      className="shape"
      data-shape={PLAYER_SHAPES[slot % PLAYER_SHAPES.length]}
      style={playerStyle(slot)}
      aria-hidden
    />
  );
}

/** A planet ball with the orbit ring in the player's color. size is in px */
export function PlanetBall({
  planet,
  slot,
  size,
  rolling,
}: {
  planet: string;
  slot: number;
  size?: number;
  rolling?: boolean;
}) {
  const style = {
    ...playerStyle(slot),
    ...(size ? { "--size": `${size}px` } : {}),
  } as CSSProperties;
  return (
    <span
      className={rolling ? "ball ball-roll" : "ball"}
      data-planet={planet}
      style={style}
      aria-hidden
    />
  );
}

/** A small status sticker: on (done) or off (waiting) */
export function Chip({ on, children }: { on: boolean; children: string }) {
  return <span className={on ? "chip is-on" : "chip"}>{children}</span>;
}
