import { randomBytes } from "node:crypto";
import { NodeIO } from "@gltf-transform/core";
import { TICK_DT, createRace, type Race } from "@raceball/game-core";
import { Room, ServerError, type Client } from "colyseus";
import {
  JoinError,
  MAX_PLAYERS,
  PLANETS,
  PROTOCOL_VERSION,
  type InputMsg,
  type JoinOptions,
  type NetStatMsg,
  type PongMsg,
  type Role,
  type WelcomeMsg,
} from "@raceball/shared";
import { claimRoomCode, releaseRoomCode } from "./room-code";
import { inputForStep } from "./stale-input";
import { trackBytes } from "./track-file";
import { PlayerState, RaceState } from "./schema";

const ROLES: readonly Role[] = ["host", "viewer", "pad"];
const MAX_NAME = 16;
/** How often each player's pad and laptop get a NetStatMsg, ms */
const NETSTAT_MS = 1000;
/** Close code for a pad whose laptop player left */
const PLAYER_GONE = 4100;
/** One simulation step, ms */
const TICK_MS = TICK_DT * 1000;
/** Send a snapshot every Nth step: 1 = 60 Hz */
const SNAP_EVERY = 1;
/** After a stall (GC, slow host), catch up at most this many steps instead of spiralling */
const MAX_CATCH_UP = 5;

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
  /** pairToken → playerId. Valid while the viewer is in the room, so a pad can re-pair after a reload */
  private pairTokens = new Map<string, string>();
  /** playerId → pairToken */
  private tokenOf = new Map<string, string>();
  /** playerId → latest input from their pad, and when it arrived (ms) */
  private padInputs = new Map<string, { msg: InputMsg; at: number }>();
  /** The only simulation (game-core). Screens draw its snapshots */
  private race!: Race;
  /** Time not yet simulated, ms */
  private acc = 0;
  private tickCount = 0;

  async onCreate() {
    this.roomId = await claimRoomCode(this.presence);
    this.race = await createRace(await trackBytes(), new NodeIO(), {
      laps: this.state.laps,
    });
    // M1 vertical slice: drive freely from the start. The M2 lobby flow starts it from the host instead
    this.race.start(0, this.state.laps);
    this.state.phase = this.race.phase;
    this.onMessage("hello", (client) => {
      const seat = this.seats.get(client.sessionId);
      if (!seat?.playerId) return;
      const msg: WelcomeMsg = { playerId: seat.playerId };
      if (seat.role === "viewer")
        msg.pairToken = this.tokenOf.get(seat.playerId);
      client.send("welcome", msg);
    });
    this.onMessage("ping", (client, c: number) => {
      client.send("pong", { c, s: Date.now() } satisfies PongMsg);
    });
    this.onMessage("input", (client, msg: InputMsg) => {
      const seat = this.seats.get(client.sessionId);
      if (seat?.role !== "pad" || !seat.playerId) return; // only a bound pad may drive
      const last = this.padInputs.get(seat.playerId);
      if (last && msg.seq <= last.msg.seq) return; // latest wins
      this.padInputs.set(seat.playerId, { msg, at: Date.now() });
    });
    this.clock.setInterval(() => this.sendNetStats(), NETSTAT_MS);
    // Check twice per step: coarse OS timers (15.6 ms on Windows) would otherwise skip snapshots
    this.setSimulationInterval((dt) => this.tick(dt), TICK_MS / 2);
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
      this.pairedPlayer(opts.pairToken); // throws if the token is unknown or taken
      return true; // binds to an existing player, so the player cap doesn't apply
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
    if (opts.role === "pad" && opts.pairToken) {
      // Check again: another pad may have used the token since onAuth
      const playerId = this.pairedPlayer(opts.pairToken);
      this.state.players.get(playerId)!.paired = true;
      this.seats.set(client.sessionId, { role: "pad", playerId });
      return;
    }
    // Two joins can pass onAuth at the same time, so check again
    if (this.state.players.size >= MAX_PLAYERS) {
      throw new ServerError(JoinError.RoomFull, "this race is full");
    }
    // viewer, or a phone-only pad (no laptop): both create a player
    const playerId = this.addPlayer(opts, opts.role === "pad");
    this.seats.set(client.sessionId, { role: opts.role, playerId });
    if (opts.role === "viewer") {
      const token = randomBytes(6).toString("base64url");
      this.pairTokens.set(token, playerId);
      this.tokenOf.set(playerId, token);
    }
  }

  onLeave(client: Client) {
    const seat = this.seats.get(client.sessionId);
    this.seats.delete(client.sessionId);
    if (!seat) return;
    if (seat.role === "host") {
      this.hostSessionId = undefined;
      return;
    }
    const { playerId } = seat;
    if (!playerId) return;
    const player = this.state.players.get(playerId);
    if (seat.role === "pad" && player && !player.phoneOnly) {
      // The laptop is still here: free the slot so the phone can pair again
      player.paired = false;
      return;
    }
    // Reconnecting into the same slot comes in M2; for now the player leaves with the client
    this.removePlayer(playerId);
  }

  async onDispose() {
    this.race?.dispose();
    await releaseRoomCode(this.presence, this.roomId);
  }

  /** Fixed 1/60 s steps however unevenly the timer fires, then one snapshot to the screens */
  private tick(elapsedMs: number) {
    this.acc = Math.min(this.acc + elapsedMs, MAX_CATCH_UP * TICK_MS);
    let stepped = false;
    while (this.acc >= TICK_MS) {
      const now = Date.now();
      this.state.players.forEach((_, id) => {
        this.race.setInput(id, inputForStep(this.padInputs.get(id), now));
      });
      this.race.step(TICK_DT);
      this.acc -= TICK_MS;
      this.tickCount++;
      stepped = true;
    }
    if (!stepped) return;
    const events = this.race.drainEvents();
    // Screens get every event for VFX; routing them to the right pads comes in M2
    for (const evt of events) this.sendToScreens("evt", evt);
    if (this.tickCount % SNAP_EVERY === 0) {
      this.sendToScreens(
        "snap",
        this.race.snapshot(this.tickCount, Date.now()),
      );
    }
  }

  /** The big screen and laptops draw the race; pads don't need snapshots */
  private sendToScreens(type: string, msg: unknown) {
    for (const client of this.clients) {
      const role = this.seats.get(client.sessionId)?.role;
      if (role === "host" || role === "viewer") client.send(type, msg);
    }
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
    this.race.addPlayer(playerId, player.ball || PLANETS[slot]);
    return playerId;
  }

  /** Latest input from a player's pad, with when it arrived (tests) */
  latestInput(playerId: string) {
    return this.padInputs.get(playerId);
  }

  /** Tell each player's pad and laptop how fresh their input is at the server */
  private sendNetStats() {
    const now = Date.now();
    for (const client of this.clients) {
      const playerId = this.seats.get(client.sessionId)?.playerId;
      const input = playerId && this.padInputs.get(playerId);
      if (input)
        client.send("netstat", {
          inputAge: now - input.at,
        } satisfies NetStatMsg);
    }
  }

  /** Remove a player and their pairing token, and disconnect their paired pad */
  private removePlayer(playerId: string) {
    this.state.players.delete(playerId);
    this.race.removePlayer(playerId);
    this.padInputs.delete(playerId);
    const token = this.tokenOf.get(playerId);
    if (token) this.pairTokens.delete(token);
    this.tokenOf.delete(playerId);
    for (const client of this.clients) {
      const seat = this.seats.get(client.sessionId);
      if (seat?.role === "pad" && seat.playerId === playerId) {
        this.seats.delete(client.sessionId);
        client.leave(PLAYER_GONE);
      }
    }
  }

  /** The player a pad's token belongs to. Throws if unknown or already paired. */
  private pairedPlayer(token: string): string {
    const playerId = this.pairTokens.get(token);
    const player = playerId ? this.state.players.get(playerId) : undefined;
    if (!playerId || !player) {
      throw new ServerError(JoinError.BadPairToken, "unknown pairing code");
    }
    if (player.paired) {
      throw new ServerError(
        JoinError.AlreadyPaired,
        "a phone is already paired",
      );
    }
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
