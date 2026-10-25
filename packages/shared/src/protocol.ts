// Protocol v1 DRAFT, copied from docs/ARCHITECTURE.md so game-core and web can build against it.
// It becomes final at the protocol meeting; after that, change it only through the protocol process
// in docs/WORKFLOW.md (bump PROTOCOL_VERSION, update ARCHITECTURE.md).

export const PROTOCOL_VERSION = 1;

export type Role = "host" | "viewer" | "pad";
export type Phase = "lobby" | "countdown" | "racing" | "results";
export type ItemId = "boost" | "roar" | "spill" | "snowday";

/** Options sent when joining a room */
export interface JoinOptions {
  role: Role;
  protocol: number;    // must equal PROTOCOL_VERSION, or the server rejects with "please refresh"
  name?: string;       // viewer, or a phone-only pad
  ball?: string;       // skin id
  pairToken?: string;  // pad: from a laptop's QR code. Absent = phone-only player
  playerId?: string;   // reconnecting into the same slot
}

/** pad → server: every 16 ms (latest wins) and on any button change */
export interface InputMsg {
  seq: number;    // +1 per message
  steer: number;  // -1 full left … 1 full right (already filtered, dead-zoned, curved)
  gas: number;    // 0 … 1 (held right thumb)
  brake: boolean;
  item: boolean;  // true in exactly one message when a shake/tap fires the item
}

/** server → host + viewers: 60 Hz */
export interface SnapMsg {
  tick: number;
  t: number;          // server time in ms
  balls: BallSnap[];
}
export interface BallSnap {
  id: string;
  p: [number, number, number];          // position (m)
  q: [number, number, number, number];  // rotation quaternion
  v: [number, number, number];          // velocity (m/s), used for extrapolation
  h: number;                            // heading (rad), used by the chase camera
}

/** server → pad + viewer + host */
export type GameEvent =
  | { type: "bump"; a: string; b: string; strength: number }  // strength 0 … 1
  | { type: "item"; player: string; item: ItemId }
  | { type: "overtake"; player: string; passed: string; section: string } // position change
  | { type: "lap"; player: string; lap: number }
  | { type: "finish"; player: string; place: number }
  | { type: "respawn"; player: string };
