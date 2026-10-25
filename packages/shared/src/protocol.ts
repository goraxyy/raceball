// Protocol v1: the contract between game-core, server, screens and pads.
// To change it: bump PROTOCOL_VERSION and update docs/ARCHITECTURE.md (see docs/WORKFLOW.md).
export const PROTOCOL_VERSION = 4;

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
  | { type: "item"; player: string; item: ItemId } // picked up from an item box
  | {
      type: "fire";
      player: string;
      item: ItemId;
      pos: [number, number, number];
    } // used; pos = where it happens (the puddle for a spill)
  | { type: "overtake"; player: string; passed: string; section: string } // position change
  | { type: "lap"; player: string; lap: number }
  | { type: "finish"; player: string; place: number }
  | { type: "respawn"; player: string };

/**
 * Which player slot is yours. Send "hello" (no payload) once your message handlers are
 * registered, and the server answers with "welcome". Asking avoids losing a message sent
 * before the client is listening.
 */
export interface WelcomeMsg {
  playerId: string;
  /** Viewer only: goes in the pairing QR (see padUrl) */
  pairToken?: string;
}

/** Close/reject codes the server uses, so clients can show the right error screen */
export const JoinError = {
  VersionMismatch: 4001,
  BadRole: 4002,
  HostTaken: 4003,
  RoomFull: 4004,
  BadPairToken: 4005,
  AlreadyPaired: 4006,
} as const;

/**
 * Clock sync, 1 Hz. Any client sends "ping" with its performance.now() as the payload;
 * the server answers "pong" with that value echoed back and its own clock.
 */
export interface PongMsg {
  /** The client's timestamp from the ping, echoed back */
  c: number;
  /** Server time in ms (same clock as SnapMsg.t) */
  s: number;
}

/** server → a player's pad and laptop, 1 Hz: numbers for the net HUD */
export interface NetStatMsg {
  /** How old this player's latest input is at the server, ms. 200+ means it's treated as neutral */
  inputAge: number;
}

/** Race lengths the host can pick: 1 for the demo, 3 by default */
export type Laps = 1 | 3;

/** host → server: "start". Allowed in the lobby once every player is readyToRace() */
export interface StartMsg {
  laps: Laps;
}

/** host → server: "removeBot". ("addBot" and "rematch" have no payload) */
export interface RemoveBotMsg {
  id: string;
}

/**
 * pad or laptop → server: "status", for its own player. Send only what changed.
 * calibrated: the pad finished calibrating. assetsLoaded: the laptop finished preloading.
 * ready: the player tapped Ready (pad or laptop).
 */
export interface StatusMsg {
  calibrated?: boolean;
  assetsLoaded?: boolean;
  ready?: boolean;
}

/**
 * pad or laptop → server: "setProfile", for its own player, in the lobby.
 * A phone-only player picks their name and planet on the pad. A taken planet is refused.
 */
export interface SetProfileMsg {
  name?: string;
  /** One of PLANETS */
  ball?: string;
}
