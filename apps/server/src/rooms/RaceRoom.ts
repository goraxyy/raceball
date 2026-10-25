import { randomBytes } from "node:crypto";
import { NodeIO } from "@gltf-transform/core";
import { TICK_DT, createRace, type Race } from "@raceball/game-core";
import { Room, ServerError, type Client, type Delayed } from "colyseus";
import {
  COUNTDOWN_MS,
  JoinError,
  MAX_PLAYERS,
  RESULTS_MS,
  canStart,
  packSnap,
  PLANETS,
  PROTOCOL_VERSION,
  type GameEvent,
  type InputMsg,
  type JoinOptions,
  type NetStatMsg,
  type Planet,
  type PongMsg,
  type RaceStateView,
  type RemoveBotMsg,
  type SetProfileMsg,
  type Role,
  type StartMsg,
  type StatusMsg,
  type WelcomeMsg,
} from "@raceball/shared";
import { claimRoomCode, releaseRoomCode } from "./room-code";
import { inputForStep } from "./stale-input";
import { trackBytes } from "./track-file";
import { PlayerState, RaceState } from "./schema";

const ROLES: readonly Role[] = ["host", "viewer", "pad"];
const MAX_NAME = 16;
/** A dropped pad or laptop (locked phone, Wi-Fi blip) keeps its slot this long, s */
const RECONNECT_S = 20;
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
/** Race lengths the host may pick */
const LAP_CHOICES = [1, 3];

/**
 * Session stats after a lap or finish event: the lap that just ended may be a new best,
 * and a 1st-place finish is a win. lapStartedAt is when that lap began (server ms).
 */
export function lapStats(
  stats: { wins: number; bestLap: number },
  evt: Extract<GameEvent, { type: "lap" | "finish" }>,
  lapStartedAt: number | undefined,
  now: number,
): { wins: number; bestLap: number } {
  let { wins, bestLap } = stats;
  if (lapStartedAt !== undefined) {
    const lap = now - lapStartedAt;
    if (bestLap === 0 || lap < bestLap) bestLap = lap;
  }
  if (evt.type === "finish" && evt.place === 1) wins++;
  return { wins, bestLap };
}

/** The players an event is about: their phones get the sound and visual cue */
export function playersIn(evt: GameEvent): string[] {
  switch (evt.type) {
    case "bump":
      return [evt.a, evt.b];
    case "overtake":
      return [evt.player, evt.passed];
    default:
      return [evt.player];
  }
}

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
  private nextBot = 1;
  /** playerId → server time their current lap started, for lap times */
  private lapStartedAt = new Map<string, number>();
  /** True while rematch builds a fresh race; the loop waits */
  private rebuilding = false;
  /** Sends the room back to the lobby a while after the results */
  private resultsTimer?: Delayed;

  async onCreate() {
    this.roomId = await claimRoomCode(this.presence);
    this.race = await createRace(await trackBytes(), new NodeIO(), {
      laps: this.state.laps,
    });
    this.state.phase = this.race.phase; // lobby: balls wait on the grid until the host starts
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
    this.onMessage("setProfile", (client, msg: SetProfileMsg) =>
      this.setProfile(client, msg),
    );
    this.onMessage("status", (client, msg: StatusMsg) =>
      this.setStatus(client, msg),
    );
    this.onMessage("start", (client, msg: StartMsg) => {
      if (this.isHost(client)) this.startRace(msg?.laps);
    });
    this.onMessage("addBot", (client) => {
      if (this.isHost(client)) this.addBot();
    });
    this.onMessage("removeBot", (client, msg: RemoveBotMsg) => {
      if (this.isHost(client) && this.state.players.get(msg?.id)?.bot)
        this.removePlayer(msg.id);
    });
    this.onMessage("rematch", (client) => {
      if (this.isHost(client) && this.state.phase !== "lobby")
        void this.rematch();
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

  /** Lost without saying goodbye: hold the slot so the same client can come back */
  onDrop(client: Client) {
    const playerId = this.seats.get(client.sessionId)?.playerId;
    const player = playerId && this.state.players.get(playerId);
    if (player) player.connected = false; // its input goes stale, so the ball coasts with no gas
    void this.allowReconnection(client, RECONNECT_S).catch(() => {
      // gave up: Colyseus calls onLeave, which frees the slot
    });
  }

  onReconnect(client: Client) {
    const playerId = this.seats.get(client.sessionId)?.playerId;
    const player = playerId && this.state.players.get(playerId);
    if (player) player.connected = true;
  }

  /** Left on purpose, or didn't come back in time */
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
      player.connected = true; // the laptop is still connected
      return;
    }
    this.removePlayer(playerId);
  }

  async onDispose() {
    this.race?.dispose();
    await releaseRoomCode(this.presence, this.roomId);
  }

  /** Fixed 1/60 s steps however unevenly the timer fires, then one snapshot to the screens */
  private tick(elapsedMs: number) {
    if (this.rebuilding) return;
    this.acc = Math.min(this.acc + elapsedMs, MAX_CATCH_UP * TICK_MS);
    let stepped = false;
    while (this.acc >= TICK_MS) {
      const now = Date.now();
      this.state.players.forEach((p, id) => {
        this.race.setInput(
          id,
          p.bot
            ? this.race.botInput(id)
            : inputForStep(this.padInputs.get(id), now),
        );
      });
      this.race.step(TICK_DT);
      this.acc -= TICK_MS;
      this.tickCount++;
      stepped = true;
    }
    if (!stepped) return;
    this.syncPhase();
    this.syncStandings();
    const events = this.race.drainEvents();
    for (const evt of events) {
      this.recordStats(evt);
      this.sendToScreens("evt", evt); // screens show every event (VFX, standings)
      this.sendToPads(playersIn(evt), "evt", evt); // phones only hear about their own player
    }
    if (this.tickCount % SNAP_EVERY === 0) {
      // compact integer arrays (packSnap), about a third of the bytes of plain objects
      this.sendToScreens(
        "snap",
        packSnap(this.race.snapshot(this.tickCount, Date.now())),
      );
    }
  }

  /** Lap, checkpoint, place and finish time from game-core, for the HUD, standings and results */
  private syncStandings() {
    for (const s of this.race.standings()) {
      const p = this.state.players.get(s.id);
      if (!p) continue;
      // only real changes go out: Colyseus patches what's different
      if (p.lap !== s.lap) p.lap = s.lap;
      if (p.checkpoint !== s.checkpoint) p.checkpoint = s.checkpoint;
      if (p.place !== s.place) p.place = s.place;
      const finished = s.finishedAt ?? 0;
      if (p.finishedAt !== finished) p.finishedAt = finished;
    }
  }

  /** Session stats from race events: lap times (best lap) and wins */
  private recordStats(evt: GameEvent) {
    if (evt.type !== "lap" && evt.type !== "finish") return;
    const p = this.state.players.get(evt.player);
    const now = Date.now();
    if (p) {
      const next = lapStats(p, evt, this.lapStartedAt.get(evt.player), now);
      p.wins = next.wins;
      p.bestLap = next.bestLap;
    }
    this.lapStartedAt.set(evt.player, now);
  }

  /** Copy game-core's phase into the synced state, and act on the changes */
  private syncPhase() {
    const prev = this.state.phase;
    const phase = this.race.phase;
    if (phase === prev) return;
    this.state.phase = phase;
    if (phase === "racing") {
      this.state.countdownEndsAt = 0;
      // lap 1 starts with the race: everyone crosses the line in the first moments
      const now = Date.now();
      this.state.players.forEach((_, id) => this.lapStartedAt.set(id, now));
    }
    if (phase === "results") {
      this.resultsTimer?.clear();
      this.resultsTimer = this.clock.setTimeout(
        () => void this.rematch(),
        RESULTS_MS,
      );
    }
  }

  private isHost(client: Client) {
    return client.sessionId === this.hostSessionId;
  }

  /** Lobby → countdown, once every player is ready (the same rule as the host's Start button) */
  private startRace(laps: unknown) {
    if (!LAP_CHOICES.includes(laps as number)) return;
    if (!canStart(this.state.toJSON() as RaceStateView)) return;
    this.state.laps = laps as number;
    this.race.start(COUNTDOWN_MS, this.state.laps);
    this.state.countdownEndsAt = Date.now() + COUNTDOWN_MS;
    this.state.phase = this.race.phase;
  }

  /** A pad reports calibrated/ready; a laptop reports assetsLoaded/ready. Only for their own player */
  private setStatus(client: Client, msg: StatusMsg) {
    const seat = this.seats.get(client.sessionId);
    const player = seat?.playerId && this.state.players.get(seat.playerId);
    if (!seat || !player || typeof msg !== "object" || !msg) return;
    if (seat.role === "pad" && typeof msg.calibrated === "boolean")
      player.calibrated = msg.calibrated;
    if (seat.role === "viewer" && typeof msg.assetsLoaded === "boolean")
      player.assetsLoaded = msg.assetsLoaded;
    if (typeof msg.ready === "boolean") player.ready = msg.ready;
  }

  /** Name and planet for the sender's own player, in the lobby. A taken planet is refused */
  private setProfile(client: Client, msg: SetProfileMsg) {
    if (this.state.phase !== "lobby" || typeof msg !== "object" || !msg) return;
    const playerId = this.seats.get(client.sessionId)?.playerId;
    const player = playerId && this.state.players.get(playerId);
    if (!player) return;
    if (typeof msg.name === "string") {
      const name = msg.name.trim().slice(0, MAX_NAME);
      if (name) player.name = name;
    }
    if (
      typeof msg.ball === "string" &&
      this.freePlanet(msg.ball, playerId) === msg.ball
    ) {
      player.ball = msg.ball;
    }
  }

  /** A server-side bot that drives with game-core's botInput. Always ready */
  private addBot() {
    if (this.state.phase !== "lobby") return;
    if (this.state.players.size >= MAX_PLAYERS) return;
    const n = this.nextBot++;
    const id = this.createPlayer(`b${n}`, `Bot ${n}`, "", false);
    const bot = this.state.players.get(id)!;
    bot.bot = true;
    bot.paired = bot.calibrated = bot.assetsLoaded = bot.ready = true;
  }

  /** Back to the lobby with the same players on a fresh race. Everyone taps Ready again */
  private async rematch() {
    if (this.rebuilding) return;
    this.rebuilding = true;
    this.resultsTimer?.clear();
    this.resultsTimer = undefined;
    try {
      const race = await createRace(await trackBytes(), new NodeIO(), {
        laps: this.state.laps,
      });
      this.race.dispose();
      this.race = race;
      this.state.players.forEach((p, id) => {
        race.addPlayer(id, p.ball);
        p.ready = p.bot;
        p.lap = p.checkpoint = p.place = p.finishedAt = 0;
      });
      this.padInputs.clear();
      this.lapStartedAt.clear();
      this.acc = 0;
      this.state.countdownEndsAt = 0;
      this.state.phase = race.phase;
    } finally {
      this.rebuilding = false;
    }
  }

  /** Send to the pads of these players */
  private sendToPads(playerIds: string[], type: string, msg: unknown) {
    for (const client of this.clients) {
      const seat = this.seats.get(client.sessionId);
      if (
        seat?.role === "pad" &&
        seat.playerId &&
        playerIds.includes(seat.playerId)
      )
        client.send(type, msg);
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
    return this.createPlayer(
      `p${this.nextPlayer++}`,
      opts.name ?? "",
      opts.ball ?? "",
      phoneOnly,
    );
  }

  private createPlayer(
    playerId: string,
    name: string,
    ball: string,
    phoneOnly: boolean,
  ): string {
    const slot = this.freeSlot();
    const player = new PlayerState();
    player.name = name.trim().slice(0, MAX_NAME) || `Player ${slot + 1}`;
    player.ball = this.freePlanet(ball);
    player.color = slot;
    player.shape = slot;
    player.phoneOnly = phoneOnly;
    player.paired = phoneOnly; // a phone-only pad is its own controller
    this.state.players.set(playerId, player);
    this.race.addPlayer(playerId, player.ball);
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

  /** The planet asked for if it's valid and free, otherwise the first free one (one planet per player) */
  private freePlanet(want: string, forPlayer?: string): Planet {
    const taken = new Set<string>();
    this.state.players.forEach((p, id) => {
      if (id !== forPlayer) taken.add(p.ball);
    });
    const valid = (PLANETS as readonly string[]).includes(want);
    if (valid && !taken.has(want)) return want as Planet;
    return PLANETS.find((p) => !taken.has(p)) ?? PLANETS[0];
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
