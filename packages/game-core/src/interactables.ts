import happyValley from "../tracks/happy_valley_interactables.json";

/**
 * Things on the road you just drive into, no button (Nuris's M3 pass): Creamery Scoops, Mario Kart's coins (each
 * one held adds a little top speed; hard bumps, Lion Roars and respawns knock them off), and Lion Paw bumpers,
 * pinball posts that kick you back out. tools/track/build_interactables.py places them on the route; the web
 * draws them on the same spots.
 */
export interface InteractablesDef {
  /** Each scoop's center, map meters */
  scoops: [number, number, number][];
  /** Each paw bumper's base center, on the road */
  paws: [number, number, number][];
}

export const HAPPY_VALLEY_INTERACTABLES =
  happyValley as unknown as InteractablesDef;
