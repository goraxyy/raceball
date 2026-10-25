import type { GameEvent, PlayerView, RaceStateView } from "@raceball/shared";
import { describe, expect, it } from "vitest";
import type { BallPose } from "../net";
import { NetFeed, type SnapshotSource } from "./net-feed";

const player = (over: Partial<PlayerView>): PlayerView => ({
  name: "P",
  ball: "",
  color: 0,
  shape: 0,
  phoneOnly: false,
  bot: false,
  paired: false,
  calibrated: false,
  assetsLoaded: false,
  ready: false,
  lap: 0,
  checkpoint: 0,
  place: 0,
  finishedAt: 0,
  connected: true,
  ...over,
});

/** Stands in for NetSession: state patches arrive through `patch` */
class FakeRoom implements SnapshotSource {
  playerId?: string;
  version = 0;
  state: RaceStateView = {
    phase: "racing",
    laps: 3,
    countdownEndsAt: 0,
    trackId: "happy_valley",
    players: {},
    itemBoxes: [],
  };
  balls = new Map<string, BallPose>();
  listeners = new Set<() => void>();
  eventListeners = new Set<(evt: GameEvent) => void>();

  onEvent(listener: (evt: GameEvent) => void) {
    this.eventListeners.add(listener);
    return () => this.eventListeners.delete(listener);
  }

  send(evt: GameEvent) {
    for (const listener of this.eventListeners) listener(evt);
  }

  sample() {
    return { balls: this.balls, ownId: this.playerId };
  }

  subscribe(listener: () => void) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  patch(players: Record<string, PlayerView>, playerId = this.playerId) {
    this.state = { ...this.state, players };
    this.playerId = playerId;
    this.version++;
    for (const listener of this.listeners) listener();
  }
}

describe("NetFeed", () => {
  it("queues game events for the effects until the renderer takes them, then stops listening", () => {
    const room = new FakeRoom();
    const feed = new NetFeed(room);
    room.send({ type: "lap", player: "p1", lap: 2 });
    room.send({ type: "respawn", player: "p2" });
    expect(feed.drainEvents()).toEqual([
      { type: "lap", player: "p1", lap: 2 },
      { type: "respawn", player: "p2" },
    ]);
    expect(feed.drainEvents()).toEqual([]);
    feed.dispose();
    expect(room.eventListeners.size).toBe(0);
  });

  it("keeps the phase, laps and places from the latest patch", () => {
    const room = new FakeRoom();
    const feed = new NetFeed(room);
    room.state = {
      ...room.state,
      phase: "countdown",
      laps: 1,
      countdownEndsAt: 5000,
    };
    room.patch({ a: player({ place: 2 }), b: player({ place: 1 }) });
    expect([feed.phase, feed.laps, feed.countdownEndsAt]).toEqual([
      "countdown",
      1,
      5000,
    ]);
    expect([feed.place("a"), feed.place("b"), feed.place("nobody")]).toEqual([
      2, 1, 0,
    ]);
  });

  it("passes the session's poses through and follows your own ball once welcomed", () => {
    const room = new FakeRoom();
    const feed = new NetFeed(room);
    const pose: BallPose = { p: [1, 0.5, 2], q: [0, 0, 0, 1], h: 0.3 };
    room.balls.set("p1", pose);
    expect(feed.ownId).toBeNull(); // the big screen, or a laptop before its welcome
    expect(feed.sample().get("p1")).toBe(pose);
    room.patch({ p1: player({ ball: "mars", color: 2 }) }, "p1");
    expect(feed.ownId).toBe("p1");
  });

  it("dresses each ball from the synced player state", () => {
    const room = new FakeRoom();
    room.state.players.p1 = player({ ball: "jupiter", color: 1 });
    const feed = new NetFeed(room);
    expect(feed.look("p1")).toEqual({ ball: "jupiter", color: 1 });
    expect(feed.look("p9")).toBeUndefined();

    // no planet picked: the server races PLANETS[slot], and slot = color
    room.patch({
      p1: player({ ball: "jupiter", color: 1 }),
      p2: player({ color: 3, phoneOnly: true }),
    });
    expect(feed.look("p2")).toEqual({ ball: "mars", color: 3 });
    expect(feed.phoneOnly).toEqual(["p2"]);
  });

  it("copes with a room whose first state hasn't arrived yet", () => {
    // right after joining, room.state.toJSON() can still be {} with no players
    const room = new FakeRoom();
    room.state = {} as RaceStateView;
    const feed = new NetFeed(room);
    expect(feed.look("p1")).toBeUndefined();
    expect(feed.phoneOnly).toEqual([]);
    room.patch({ p1: player({ ball: "earth", color: 0 }) }, "p1");
    expect(feed.look("p1")).toEqual({ ball: "earth", color: 0 });
  });

  it("stops listening when disposed", () => {
    const room = new FakeRoom();
    const feed = new NetFeed(room);
    expect(room.listeners.size).toBe(1);
    feed.dispose();
    expect(room.listeners.size).toBe(0);
  });
});
