// Protocol v1: the contract between game-core, server, screens and pads.
// To change it: bump PROTOCOL_VERSION and update docs/ARCHITECTURE.md (see docs/WORKFLOW.md).
export const PROTOCOL_VERSION = 1;

export type Role = "host" | "viewer" | "pad";
export type Phase = "lobby" | "countdown" | "racing" | "results";
export type ItemId = "boost" | "roar" | "spill" | "snowday";

/** Options sent when joining a room */
export interface JoinOptions {
  role: Role;
  /** Must equal PROTOCOL_VERSION, or the server rejects with "please refresh" */
  protocol: number;
  /** Viewer, or a phone-only pad */
  name?: string;
  /** Skin id */
  ball?: string;
  /** Pad: from a laptop's QR code. Absent = phone-only player */
  pairToken?: string;
  /** Reconnecting into the same slot */
  playerId?: string;
}

/** pad → server: every 16 ms (latest wins) and on any button change */
export interface InputMsg {
  /** +1 per message */
  seq: number;
  /** -1 full left … 1 full right (already filtered, dead-zoned, curved) */
  steer: number;
  /** 0 … 1 (held right thumb) */
  gas: number;
  brake: boolean;
  /** true in exactly one message when a shake/tap fires the item */
  item: boolean;
}

/** server → host + viewers: 60 Hz */
export interface SnapMsg {
  tick: number;
  /** Server time in ms */
  t: number;
  balls: BallSnap[];
}

export interface BallSnap {
  id: string;
  /** Position (m) */
  p: [number, number, number];
  /** Rotation quaternion [x, y, z, w] */
  q: [number, number, number, number];
  /** Velocity (m/s), used for extrapolation */
  v: [number, number, number];
  /** Heading (rad), used by the chase camera */
  h: number;
}

/** server → pad + viewer + host */
export type GameEvent =
  | { type: "bump"; a: string; b: string; strength: number } // strength 0 … 1
  | { type: "item"; player: string; item: ItemId }
  | { type: "overtake"; player: string; passed: string; section: string } // position change
  | { type: "lap"; player: string; lap: number }
  | { type: "finish"; player: string; place: number }
  | { type: "respawn"; player: string };

/** server → the joining viewer or pad, right after join: which player slot is theirs */
export interface WelcomeMsg {
  playerId: string;
}

/** Close/reject codes the server uses, so clients can show the right error screen */
export const JoinError = {
  VersionMismatch: 4001,
  BadRole: 4002,
  HostTaken: 4003,
  RoomFull: 4004,
  BadPairToken: 4005,
} as const;
