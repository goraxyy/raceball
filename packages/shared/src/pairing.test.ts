import { expect, test } from "vitest";
import { padUrl, readPadParams } from "./pairing";

test("round-trips room and token", () => {
  const url = padUrl("https://pad.example.com", "ABCD", "x_Y-12ab");
  expect(url).toBe("https://pad.example.com/?room=ABCD&t=x_Y-12ab");
  expect(readPadParams(new URL(url).search)).toEqual({
    room: "ABCD",
    pairToken: "x_Y-12ab",
  });
});

test("phone-only QR has no token", () => {
  const url = padUrl("http://localhost:5174", "ABCD");
  expect(readPadParams(new URL(url).search)).toEqual({
    room: "ABCD",
    pairToken: undefined,
  });
});

test("keeps other params like debug", () => {
  const url = padUrl("http://localhost:5174/?debug=1", "ABCD");
  expect(new URL(url).searchParams.get("debug")).toBe("1");
});

test("normalizes a hand-typed room code", () => {
  expect(readPadParams("?room=%20abcd%20").room).toBe("ABCD");
  expect(readPadParams("").room).toBeUndefined();
});
