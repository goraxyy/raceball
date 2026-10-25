import type { ReactNode } from "react";
import { PlayerShape, playerStyle } from "./pieces";

export interface FollowTileProps {
  name: string;
  color: number;
  shape: number;
  /** 0 hides the place (before the race has standings) */
  place: number;
  /** Ali's camera view goes behind the frame; children (if any) render inside it */
  children?: ReactNode;
}

const suffix = (n: number) => ({ 1: "st", 2: "nd", 3: "rd" })[n] ?? "th";

/**
 * The frame around a phone-only player's follow-cam tile on the big screen: a border in their
 * color, a race-number plate with their place and shape, and their name.
 */
export function FollowTile({
  name,
  color,
  shape,
  place,
  children,
}: FollowTileProps) {
  return (
    <figure className="follow-tile" style={playerStyle(color)}>
      <div className="follow-view">{children}</div>
      <figcaption className="follow-plate">
        {place > 0 && (
          <span className="follow-place">
            {place}
            <small>{suffix(place)}</small>
          </span>
        )}
        <PlayerShape slot={shape} />
        <span className="follow-name">{name}</span>
      </figcaption>
    </figure>
  );
}
