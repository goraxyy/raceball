import { expect, test } from "vitest";
import { playersIn } from "../src/rooms/RaceRoom";

test("each event goes to the pads of the players it's about", () => {
  expect(playersIn({ type: "bump", a: "p1", b: "p2", strength: 0.5 })).toEqual([
    "p1",
    "p2",
  ]);
  expect(
    playersIn({
      type: "overtake",
      player: "p1",
      passed: "p3",
      section: "shrine",
    }),
  ).toEqual(["p1", "p3"]);
  expect(playersIn({ type: "lap", player: "p2", lap: 2 })).toEqual(["p2"]);
  expect(playersIn({ type: "finish", player: "p2", place: 1 })).toEqual(["p2"]);
  expect(playersIn({ type: "respawn", player: "p4" })).toEqual(["p4"]);
  expect(playersIn({ type: "item", player: "p5", item: "boost" })).toEqual([
    "p5",
  ]);
});
