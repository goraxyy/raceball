import { useMemo } from "react";
import { PLAYER_COLORS, PLAYER_SHAPES } from "@raceball/shared";
import { SHAPE_POINTS } from "./shapes";

export interface MapPlayer {
  id: string;
  /** World position in meters (the ball's x and z) */
  x: number;
  z: number;
  /** Slots into PLAYER_COLORS / PLAYER_SHAPES */
  color: number;
  shape: number;
}

export interface MapLabel {
  x: number;
  z: number;
  text: string;
}

export interface TrackMapProps {
  /** The route's centerline as [x, z] points in meters, in driving order (from Ali) */
  path: [number, number][];
  players: MapPlayer[];
  /** Optional section names placed on the map, e.g. "Lion Shrine" */
  labels?: MapLabel[];
  /** Track width in meters, so the ribbon matches the real road */
  width?: number;
}

/**
 * The live map seen from above: the route as an asphalt ribbon with ink edges and a checkered
 * start line, and each player as their shape in their color. +z points up the screen.
 * Positions arrive at about 10 Hz; a short CSS transition smooths the jumps between updates.
 */
export function TrackMap({
  path,
  players,
  labels = [],
  width = 12,
}: TrackMapProps) {
  const view = useMemo(() => {
    const xs = path.map((p) => p[0]);
    const zs = path.map((p) => -p[1]);
    const pad = width * 2.2;
    const minX = Math.min(...xs) - pad;
    const minY = Math.min(...zs) - pad;
    const w = Math.max(...xs) + pad - minX;
    const h = Math.max(...zs) + pad - minY;
    const d =
      path
        .map(
          (p, i) => `${i ? "L" : "M"}${p[0].toFixed(1)} ${(-p[1]).toFixed(1)}`,
        )
        .join(" ") + " Z";
    // start line across the road at the first point, perpendicular to the direction of travel
    const [x0, z0] = path[0];
    const [x1, z1] = path[1];
    const angle = (Math.atan2(-(z1 - z0), x1 - x0) * 180) / Math.PI;
    return {
      box: `${minX} ${minY} ${w} ${h}`,
      d,
      start: { x: x0, y: -z0, angle },
      size: Math.max(w, h),
    };
  }, [path, width]);

  const marker = view.size * 0.04;

  return (
    <svg
      className="track-map"
      viewBox={view.box}
      role="img"
      aria-label="Live track map"
    >
      <defs>
        <pattern
          id="map-checker"
          width="3"
          height="3"
          patternUnits="userSpaceOnUse"
        >
          <rect width="3" height="3" fill="#f3ead9" />
          <rect width="1.5" height="1.5" fill="#17151f" />
          <rect x="1.5" y="1.5" width="1.5" height="1.5" fill="#17151f" />
        </pattern>
      </defs>
      {/* hard offset shadow, ink edge, asphalt, then a dashed center line */}
      <path
        d={view.d}
        className="map-shadow"
        strokeWidth={width + 6}
        transform={`translate(${width * 0.35} ${width * 0.45})`}
      />
      <path d={view.d} className="map-edge" strokeWidth={width + 6} />
      <path d={view.d} className="map-road" strokeWidth={width} />
      <path
        d={view.d}
        className="map-center"
        strokeWidth={width * 0.08}
        strokeDasharray={`${width * 0.5} ${width * 0.5}`}
      />
      <rect
        className="map-start"
        x={-width / 2}
        y={-width * 0.3}
        width={width}
        height={width * 0.6}
        fill="url(#map-checker)"
        transform={`translate(${view.start.x} ${view.start.y}) rotate(${view.start.angle + 90})`}
      />
      {labels.map((l) => (
        <text
          key={l.text}
          className="map-label"
          x={l.x}
          y={-l.z}
          fontSize={view.size * 0.036}
        >
          {l.text}
        </text>
      ))}
      {players.map((p) => {
        const shape = PLAYER_SHAPES[p.shape % PLAYER_SHAPES.length];
        const fill = PLAYER_COLORS[p.color % PLAYER_COLORS.length];
        return (
          <g
            key={p.id}
            className="map-player"
            style={{
              transform: `translate(${p.x}px, ${-p.z}px) scale(${marker})`,
            }}
          >
            {shape === "circle" ? (
              <circle r="0.9" fill={fill} />
            ) : (
              <polygon points={SHAPE_POINTS[shape]} fill={fill} />
            )}
          </g>
        );
      })}
    </svg>
  );
}
