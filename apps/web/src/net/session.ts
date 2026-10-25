import { Client, type Room } from "@colyseus/sdk";
import {
  Clock,
  PAD_PORT,
  PROTOCOL_VERSION,
  SERVER_PORT,
  padUrl,
  type JoinOptions,
  type PongMsg,
  type RaceStateView,
  type SnapMsg,
  type WelcomeMsg,
} from "@raceball/shared";

import { SnapshotBuffer, type BallPose } from "./snapshot-buffer";

const PING_MS = 1000;

export const serverUrl = () =>
  import.meta.env.VITE_SERVER_URL ?? `ws://${location.hostname}:${SERVER_PORT}`;
export const padBaseUrl = () =>
  import.meta.env.VITE_PAD_URL ??
  `${location.protocol}//${location.hostname}:${PAD_PORT}`;

/**
 * One connection to a race room, for the big screen (host) or a laptop (viewer).
 * Owns clock sync and the snapshot buffer; the React hooks and the renderer read from it.
 */
export class NetSession {
  readonly clock = new Clock();
  readonly buffer = new SnapshotBuffer();
  /** Set by the server's welcome (viewers only) */
  playerId?: string;
  pairToken?: string;
  private listeners = new Set<() => void>();
  private pinger: ReturnType<typeof setInterval>;
  readonly room: Room;

  constructor(room: Room) {
    this.room = room;
    room.onMessage("pong", (msg: PongMsg) =>
      this.clock.onPong(msg, performance.now()),
    );
    room.onMessage("snap", (msg: SnapMsg) =>
      this.buffer.push(msg, performance.now()),
    );
    room.onMessage("welcome", (msg: WelcomeMsg) => {
      this.playerId = msg.playerId;
      this.pairToken = msg.pairToken;
      this.buffer.ownId = msg.playerId;
      this.emit();
    });
    room.onStateChange(() => this.emit());
    room.onLeave(() => clearInterval(this.pinger));

    const ping = () => room.send("ping", performance.now());
    ping();
    this.pinger = setInterval(ping, PING_MS);
    room.send("hello"); // handlers are registered, so ask for our welcome
  }

  /** The 4-letter room code */
  get code() {
    return this.room.roomId;
  }

  get state(): RaceStateView {
    return this.room.state.toJSON() as RaceStateView;
  }

  /** For Ali's renderer, once per frame: every ball's pose now, plus which one is ours */
  sample(): { balls: Map<string, BallPose>; ownId?: string } {
    return {
      balls: this.buffer.sample(this.clock.serverNow()),
      ownId: this.playerId,
    };
  }

  /** Link for this laptop's pairing QR (viewers), or the big screen's phone-only QR (host) */
  padUrl(): string {
    return padUrl(padBaseUrl(), this.code, this.pairToken);
  }

  /** Called on every state patch and on welcome. Returns an unsubscribe function */
  subscribe(listener: () => void) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  async leave() {
    clearInterval(this.pinger);
    await this.room.leave();
  }

  private emit() {
    for (const listener of this.listeners) listener();
  }
}

const client = () => new Client(serverUrl());

/** Big screen: create a new room */
export async function createAsHost(): Promise<NetSession> {
  const opts: JoinOptions = { role: "host", protocol: PROTOCOL_VERSION };
  return new NetSession(await client().create("race", opts));
}

/** Laptop player: join a room by its code */
export async function joinAsViewer(
  code: string,
  name: string,
  ball: string,
): Promise<NetSession> {
  const opts: JoinOptions = {
    role: "viewer",
    protocol: PROTOCOL_VERSION,
    name,
    ball,
  };
  return new NetSession(
    await client().joinById(code.trim().toUpperCase(), opts),
  );
}
