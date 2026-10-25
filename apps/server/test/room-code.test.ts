import { LocalPresence } from "colyseus";
import { describe, expect, test } from "vitest";
import {
  claimRoomCode,
  normalizeCode,
  randomCode,
  releaseRoomCode,
} from "../src/rooms/room-code";

describe("room codes", () => {
  test("are 4 letters without lookalikes", () => {
    for (let i = 0; i < 200; i++)
      expect(randomCode()).toMatch(/^[A-HJ-NP-Z]{4}$/);
  });

  test("never repeat while claimed", async () => {
    const presence = new LocalPresence();
    const codes = new Set<string>();
    for (let i = 0; i < 300; i++) codes.add(await claimRoomCode(presence));
    expect(codes.size).toBe(300);
  });

  test("can be reused after release", async () => {
    const presence = new LocalPresence();
    const code = await claimRoomCode(presence);
    await releaseRoomCode(presence, code);
    expect(await presence.sismember("raceball:roomCodes", code)).toBeFalsy();
  });

  test("normalize typed input", () => {
    expect(normalizeCode(" abcd ")).toBe("ABCD");
  });
});
