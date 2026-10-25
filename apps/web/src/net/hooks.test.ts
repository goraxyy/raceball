import type { RaceStateView } from "@raceball/shared";
import { describe, expect, it } from "vitest";
import { stateSnapshot } from "./hooks";

/** Like NetSession: `state` is a fresh toJSON() object on every read */
class FakeSession {
  version = 0;
  reads = 0;
  phase: RaceStateView["phase"] = "lobby";
  get state(): RaceStateView {
    this.reads++;
    return {
      phase: this.phase,
      laps: 3,
      countdownEndsAt: 0,
      trackId: "happy_valley",
      players: {},
      itemBoxes: [],
      puddles: [],
    };
  }
}

describe("stateSnapshot", () => {
  it("returns the same object until the session changes", () => {
    const session = new FakeSession();
    const snapshot = stateSnapshot(session);
    const first = snapshot();
    expect(snapshot()).toBe(first);
    expect(session.reads).toBe(1);
  });

  it("sees a change that happened before anyone subscribed", () => {
    // render reads the snapshot, then the welcome arrives, then React subscribes and compares
    const session = new FakeSession();
    const snapshot = stateSnapshot(session);
    const rendered = snapshot();
    session.phase = "racing";
    session.version++;
    const after = snapshot();
    expect(after).not.toBe(rendered);
    expect(after.phase).toBe("racing");
  });
});
