import { expect, test } from "vitest";
import { lapStats } from "../src/rooms/RaceRoom";

const lap = (n: number) => ({ type: "lap" as const, player: "p1", lap: n });
const finish = (place: number) => ({
  type: "finish" as const,
  player: "p1",
  place,
});

test("the first completed lap sets the best lap", () => {
  expect(lapStats({ wins: 0, bestLap: 0 }, lap(2), 1000, 61_000)).toEqual({
    wins: 0,
    bestLap: 60_000,
  });
});

test("only a faster lap replaces the best", () => {
  expect(
    lapStats({ wins: 0, bestLap: 60_000 }, lap(3), 0, 65_000).bestLap,
  ).toBe(60_000);
  expect(
    lapStats({ wins: 0, bestLap: 60_000 }, lap(3), 0, 55_000).bestLap,
  ).toBe(55_000);
});

test("finishing 1st is a win; the final lap still counts for best lap", () => {
  expect(lapStats({ wins: 2, bestLap: 60_000 }, finish(1), 0, 50_000)).toEqual({
    wins: 3,
    bestLap: 50_000,
  });
  expect(lapStats({ wins: 2, bestLap: 60_000 }, finish(2), 0, 70_000)).toEqual({
    wins: 2,
    bestLap: 60_000,
  });
});

test("no lap start known (joined mid-race): no lap time, wins still count", () => {
  expect(
    lapStats({ wins: 0, bestLap: 0 }, finish(1), undefined, 5_000),
  ).toEqual({ wins: 1, bestLap: 0 });
});
