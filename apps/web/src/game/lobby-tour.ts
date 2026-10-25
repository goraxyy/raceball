import { type Scene, UniversalCamera, Vector3 } from "@babylonjs/core";

type Vec3 = readonly [number, number, number];

/**
 * One shot of the lobby's landmark tour: the camera drifts from `from` to `to` while it looks at `look`, map m.
 * Look points sit a little right of each landmark, so it stays clear of the pairing card on the right of the lobby
 * (tuned by eye at 1024 x 768).
 */
export interface TourStop {
  name: string;
  /** One line under the name */
  line: string;
  from: Vec3;
  to: Vec3;
  look: Vec3;
}

/**
 * Behind a laptop's lobby, in route order: the grid first, where every joined planet already sits, then the
 * landmarks a lap passes (positions from landmarks.ts and tools/models/build_landmarks.py).
 */
export const TOUR: readonly TourStop[] = [
  {
    name: "The starting grid",
    line: "Every planet that joins rolls up to the line",
    from: [9, 3.2, -27],
    to: [6, 3.6, -22],
    look: [-5, 1.5, 0],
  },
  {
    name: "Old Main",
    line: "Start and finish under the bell tower",
    from: [-18, 12, -32],
    to: [-30, 13, -31],
    look: [-33, 17, 18],
  },
  {
    name: "Pattee Library",
    line: "Bounce down the library steps",
    from: [36, 12, 228],
    to: [36, 13, 246],
    look: [-26, 9, 236],
  },
  {
    name: "The Lion Shrine",
    line: "A banked hairpin, or take the jump",
    from: [56, 16, 258],
    to: [44, 16, 252],
    look: [29, 4, 284],
  },
  {
    name: "The Creamery",
    line: "Up the giant cone, past the ice-cream spills",
    from: [152, 16, 198],
    to: [146, 17, 190],
    look: [116, 9, 225],
  },
  {
    name: "Beaver Stadium",
    line: "Through the tunnel and round the field",
    from: [188, 26, 128],
    to: [210, 28, 126],
    look: [217, 12, 6],
  },
  {
    name: "Mount Nittany",
    line: "Snow on the Arboretum run home",
    from: [92, 22, 22],
    to: [110, 24, 14],
    look: [178, 28, -94],
  },
];

/** How long each shot lasts, and how long the dip to navy takes at each end of it, s */
export const SHOT_SECONDS = 7;
export const DIP_SECONDS = 0.5;

export interface TourFrame {
  /** Index into the stops */
  stop: number;
  eye: [number, number, number];
  look: [number, number, number];
  /** 1 = covered in navy (the cut between shots), 0 = clear */
  dip: number;
}

/** Where the tour is t seconds in. still: hold each shot at its middle instead of drifting (reduced motion) */
export function tourFrame(
  t: number,
  still = false,
  stops: readonly TourStop[] = TOUR,
): TourFrame {
  const shots = Math.max(0, t) / SHOT_SECONDS;
  const k = Math.floor(shots);
  const u = shots - k; // 0 … 1 through this shot
  const stop = k % stops.length;
  const { from, to, look } = stops[stop];
  const s = still ? 0.5 : u;
  const eye: [number, number, number] = [
    from[0] + (to[0] - from[0]) * s,
    from[1] + (to[1] - from[1]) * s,
    from[2] + (to[2] - from[2]) * s,
  ];
  const edge = (Math.min(u, 1 - u) * SHOT_SECONDS) / DIP_SECONDS;
  return { stop, eye, look: [...look], dip: Math.max(0, 1 - edge) };
}

/**
 * The camera behind a laptop's lobby: it tours the landmarks, dipping to navy between shots so the cuts are soft.
 * Players who ask their OS for reduced motion get still shots.
 */
export class LobbyTour {
  readonly camera: UniversalCamera;
  private readonly motion?: MediaQueryList;
  private t = 0;

  constructor(scene: Scene) {
    this.camera = new UniversalCamera("lobby-tour", Vector3.Zero(), scene);
    this.camera.minZ = 0.1;
    this.camera.maxZ = 3000;
    this.camera.fov = 0.9;
    this.camera.inputs.clear(); // the tour drives it
    this.motion =
      typeof matchMedia === "function"
        ? matchMedia("(prefers-reduced-motion: reduce)")
        : undefined;
  }

  /** Moves the camera on by dt seconds, and says which shot it's on and how far it has dipped */
  update(dt: number): TourFrame {
    this.t += dt;
    const frame = tourFrame(this.t, this.motion?.matches ?? false);
    this.camera.position.set(...frame.eye);
    this.camera.setTarget(Vector3.FromArray(frame.look));
    return frame;
  }
}
