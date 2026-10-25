import { Room, ServerError, type Client } from "colyseus";
import {
  JoinError,
  MAX_PLAYERS,
  PROTOCOL_VERSION,
  type JoinOptions,
  type Role,
  type WelcomeMsg,
} from "@raceball/shared";
import { claimRoomCode, releaseRoomCode } from "./room-code";
import { PlayerState, RaceState } from "./schema";

const ROLES: readonly Role[] = ["host", "viewer", "pad"];
const MAX_NAME = 16;

interface Seat {
  role: Role;
  playerId?: string;
}

export class RaceRoom extends Room<{ state: RaceState }> {
  maxClients = 20; // host + 8 viewers + 8 pads + spare
  state = new RaceState();

  /** By sessionId */
  private seats = new Map<string, Seat>();
  private hostSessionId?: string;
  private nextPlayer = 1;

  async onCreate() {
    this.roomId = await claimRoomCode(this.presence);
  }

  /** Runs before a seat is taken, so rejected clients never count against maxClients */
  onAuth(_client: Client, opts: Partial<JoinOptions>) {
    if (opts.protocol !== PROTOCOL_VERSION) {
      throw new ServerError(
        JoinError.VersionMismatch,
        "version mismatch, please refresh",
      );
    }
    if (!opts.role || !ROLES.includes(opts.role)) {
      throw new ServerError(JoinError.BadRole, `unknown role: ${opts.role}`);
    }
    if (opts.role === "host" && this.hostSessionId) {
      throw new ServerError(
        JoinError.HostTaken,
        "this room already has a big screen",
      );
    }
    if (opts.role === "pad" && opts.pairToken) {
      // Pairing lands in its own PR; until then only phone-only pads can join
      throw new ServerError(JoinError.BadPairToken, "unknown pairing code");
    }
    if (opts.role !== "host" && this.state.players.size >= MAX_PLAYERS) {
      throw new ServerError(JoinError.RoomFull, "this race is full");
    }
    return true;
  }

  onJoin(client: Client, opts: JoinOptions) {
    if (opts.role === "host") {
      this.hostSessionId = client.sessionId;
      this.seats.set(client.sessionId, { role: "host" });
      return;
    }
    // Two joins can pass onAuth at the same time, so check again
    if (this.state.players.size >= MAX_PLAYERS) {
      throw new ServerError(JoinError.RoomFull, "this race is full");
    }
    // viewer, or a phone-only pad (no laptop): both create a player
    const playerId = this.addPlayer(opts, opts.role === "pad");
    this.seats.set(client.sessionId, { role: opts.role, playerId });
    client.send("welcome", { playerId } satisfies WelcomeMsg);
  }

  onLeave(client: Client) {
    const seat = this.seats.get(client.sessionId);
    this.seats.delete(client.sessionId);
    if (!seat) return;
    if (seat.role === "host") {
      this.hostSessionId = undefined;
      return;
    }
    // Reconnecting into the same slot comes in M2; for now the player leaves with the client
    if (seat.playerId) this.state.players.delete(seat.playerId);
  }

  async onDispose() {
    await releaseRoomCode(this.presence, this.roomId);
  }

  private addPlayer(opts: JoinOptions, phoneOnly: boolean): string {
    const playerId = `p${this.nextPlayer++}`;
    const slot = this.freeSlot();
    const player = new PlayerState();
    player.name =
      (opts.name ?? "").trim().slice(0, MAX_NAME) || `Player ${slot + 1}`;
    player.ball = opts.ball ?? "";
    player.color = slot;
    player.shape = slot;
    player.phoneOnly = phoneOnly;
    player.paired = phoneOnly; // a phone-only pad is its own controller
    this.state.players.set(playerId, player);
    return playerId;
  }

  /** Lowest color/shape slot nobody is using */
  private freeSlot(): number {
    const used = new Set<number>();
    this.state.players.forEach((p) => used.add(p.color));
    let slot = 0;
    while (used.has(slot)) slot++;
    return slot;
  }
}
