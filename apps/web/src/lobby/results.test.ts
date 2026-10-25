import { describe, expect, it } from "vitest";
import type { PlayerView } from "@raceball/shared";
import { resultRows } from "./results";

const player = (over: Partial<PlayerView>): PlayerView => ({
  name: "",
  ball: "earth",
  color: 0,
  shape: 0,
  phoneOnly: false,
  bot: false,
  paired: true,
  calibrated: true,
  assetsLoaded: true,
  ready: true,
  lap: 3,
  checkpoint: 0,
  place: 0,
  progress: 0,
  finishedAt: 0,
  connected: true,
  wins: 0,
  bestLap: 0,
  ...over,
});

describe("resultRows", () => {
  it("lists everyone in finishing order, with DNF for anyone who didn't finish", () => {
    const rows = resultRows(
      {
        players: {
          b: player({ name: "Rasim", place: 3, finishedAt: 0 }),
          a: player({
            name: "Ali",
            place: 1,
            finishedAt: 190_000,
            bestLap: 61_000,
          }),
          c: player({
            name: "Nuris",
            place: 2,
            finishedAt: 192_500,
            bestLap: 60_400,
          }),
        },
      },
      new Map([["c", 4]]),
    );
    expect(rows.map((r) => r.name)).toEqual(["Ali", "Nuris", "Rasim"]);
    expect(rows[0]).toMatchObject({ time: 190_000, bestLap: 61_000, bumps: 0 });
    expect(rows[1].bumps).toBe(4);
    expect(rows[2]).toMatchObject({ time: null, bestLap: null }); // DNF
  });

  it("puts a player without a place last", () => {
    const rows = resultRows(
      {
        players: {
          a: player({ name: "Late", place: 0 }),
          b: player({ name: "First", place: 1, finishedAt: 100 }),
        },
      },
      new Map(),
    );
    expect(rows.map((r) => r.name)).toEqual(["First", "Late"]);
  });
});
