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
  // the interactables (v7): each one is about the ball that hit it
  const at: [number, number, number] = [0, 1, 2];
  expect(playersIn({ type: "pad", player: "p6", pos: at })).toEqual(["p6"]);
  expect(playersIn({ type: "scoop", player: "p6", count: 3, pos: at })).toEqual(
    ["p6"],
  );
  expect(playersIn({ type: "drop", player: "p7", lost: 2, pos: at })).toEqual([
    "p7",
  ]);
  expect(playersIn({ type: "bounce", player: "p8", pos: at })).toEqual(["p8"]);
});
