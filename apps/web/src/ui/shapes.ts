import type { PlayerShape } from "@raceball/shared";

/**
 * The 8 player shapes as SVG points in a -1…1 box, matching the CSS clip-paths in
 * packages/shared/theme/theme.css. Used where shapes are drawn in SVG (the track map).
 */
const pts = (s: string) =>
  s
    .split(" ")
    .map((p) =>
      p
        .split(",")
        .map((n) => (Number(n) / 50 - 1).toFixed(3))
        .join(","),
    )
    .join(" ");

export const SHAPE_POINTS: Record<Exclude<PlayerShape, "circle">, string> = {
  square: pts("7,7 93,7 93,93 7,93"),
  triangle: pts("50,6 96,90 4,90"),
  star: pts("50,2 62,36 98,37 69,59 80,95 50,74 20,95 31,59 2,37 38,36"),
  diamond: pts("50,0 100,50 50,100 0,50"),
  cross: pts(
    "35,0 65,0 65,35 100,35 100,65 65,65 65,100 35,100 35,65 0,65 0,35 35,35",
  ),
  pentagon: pts("50,2 98,38 79,96 21,96 2,38"),
  hexagon: pts("25,5 75,5 100,50 75,95 25,95 0,50"),
};
