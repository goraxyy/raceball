import {
  PLANETS,
  type GameEvent,
  type Phase,
  type RaceStateView,
} from "@raceball/shared";
import type { BallPose } from "../net";
import type { BallFeed, BallLook } from "./balls";

/** The part of Rasim's NetSession the renderer reads (tests pass a fake) */
export interface SnapshotSource {
  readonly playerId?: string;
  readonly state: RaceStateView;
  /** +1 whenever `state` changes */
  readonly version: number;
  sample(): { balls: Map<string, BallPose>; ownId?: string };
  subscribe(listener: () => void): () => void;
  /** Game events as the server sends them. Returns an unsubscribe function */
  onEvent?(listener: (event: GameEvent) => void): () => void;
  /** Server time now, ms: the countdown beeps land on the same beat as the countdown numbers */
  serverNow?(): number;
}

/**
 * Ball poses from server snapshots: Rasim's net library interpolates the other balls and
 * extrapolates your own. Each ball's planet and color come from the synced player state,
 * cached on every state patch so the renderer can ask once per ball per frame.
 */
export class NetFeed implements BallFeed {
  /** Called with every game event the server sends this screen */
  onEvent?: (event: GameEvent) => void;
  private readonly session: SnapshotSource;
  private readonly unsubscribe: () => void;
  private readonly unsubscribeEvents?: () => void;
  private racePhase: Phase = "lobby";
  private places = new Map<string, number>();
  /** The race's lap count and countdown end (server ms), as of the last state patch */
  laps = 3;
  countdownEndsAt = 0;
  private looks = new Map<string, BallLook>();
  private names = new Map<string, string>();
  private phoneOnlyIds: string[] = [];
  private allIds: string[] = [];

  constructor(session: SnapshotSource) {
    this.session = session;
    this.unsubscribe = session.subscribe(() => this.refresh());
    this.unsubscribeEvents = session.onEvent?.((event) =>
      this.onEvent?.(event),
    );
    this.refresh();
  }

  /** The race phase, as of the last state patch */
  get phase(): Phase {
    return this.racePhase;
  }

  /** Your own ball on a laptop; null on the big screen */
  get ownId(): string | null {
    return this.session.playerId ?? null;
  }

  sample(): Map<string, BallPose> {
    return this.session.sample().balls;
  }

  look(id: string): BallLook | undefined {
    return this.looks.get(id);
  }

  name(id: string): string | undefined {
    return this.names.get(id);
  }

  place(id: string): number {
    return this.places.get(id) ?? 0;
  }

  /** Server time now, ms, if the session keeps a clock */
  serverNow(): number | undefined {
    return this.session.serverNow?.();
  }

  /** Every player in join order: the big screen splits into a view for each */
  get all(): readonly string[] {
    return this.allIds;
  }

  /** Players without a laptop, in join order */
  get phoneOnly(): readonly string[] {
    return this.phoneOnlyIds;
  }

  dispose(): void {
    this.unsubscribe();
    this.unsubscribeEvents?.();
  }

  private refresh(): void {
    // right after joining, the room's first state may not have arrived: no phase or players yet
    const state: Partial<RaceStateView> = this.session.state;
    this.racePhase = state.phase ?? "lobby";
    this.laps = state.laps || 3;
    this.countdownEndsAt = state.countdownEndsAt ?? 0;
    const players = Object.entries(state.players ?? {});
    // the server races a player without a chosen planet on PLANETS[slot], and slot = color
    this.looks = new Map(
      players.map(([id, p]) => [
        id,
        { ball: p.ball || PLANETS[p.color % PLANETS.length], color: p.color },
      ]),
    );
    this.names = new Map(players.map(([id, p]) => [id, p.name]));
    this.places = new Map(players.map(([id, p]) => [id, p.place]));
    this.allIds = players.map(([id]) => id);
    this.phoneOnlyIds = players
      .filter(([, p]) => p.phoneOnly)
      .map(([id]) => id);
  }
}
