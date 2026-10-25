import { boot, type ColyseusTestServer } from "@colyseus/testing";
import {
  JoinError,
  MAX_PLAYERS,
  PROTOCOL_VERSION,
  type JoinOptions,
} from "@raceball/shared";
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  test,
} from "vitest";
import appConfig from "../src/app.config";
import type { RaceRoom } from "../src/rooms/RaceRoom";

let colyseus: ColyseusTestServer;
let room: RaceRoom;

const join = (opts: Partial<JoinOptions>) =>
  colyseus.connectTo(room, { protocol: PROTOCOL_VERSION, ...opts });

/** Resolves with the ServerError code the join was rejected with */
const rejectCode = async (opts: Partial<JoinOptions>) => {
  try {
    await join(opts);
  } catch (e) {
    return (e as { code?: number }).code;
  }
  throw new Error("join was not rejected");
};

beforeAll(async () => {
  colyseus = await boot(appConfig);
});
afterAll(async () => {
  await colyseus.shutdown();
});
beforeEach(async () => {
  await colyseus.cleanup();
  room = await colyseus.createRoom<RaceRoom>("race", {});
});

describe("RaceRoom", () => {
  test("gets a 4-letter room code", () => {
    expect(room.roomId).toMatch(/^[A-HJ-NP-Z]{4}$/);
  });

  test("rejects an old client", async () => {
    expect(
      await rejectCode({ role: "viewer", protocol: PROTOCOL_VERSION - 1 }),
    ).toBe(JoinError.VersionMismatch);
  });

  test("rejects an unknown role", async () => {
    expect(await rejectCode({ role: "judge" as never })).toBe(
      JoinError.BadRole,
    );
  });

  test("allows one host", async () => {
    await join({ role: "host" });
    expect(await rejectCode({ role: "host" })).toBe(JoinError.HostTaken);
    expect(room.state.players.size).toBe(0);
  });

  test("a viewer gets a player and a welcome", async () => {
    const client = await join({
      role: "viewer",
      name: "  Rasim  ",
      ball: "lion",
    });
    const welcomed = client.waitForMessage("welcome");
    client.send("hello");
    const welcome = await welcomed;
    const player = room.state.players.get(welcome.playerId)!;
    expect(player.name).toBe("Rasim");
    expect(player.ball).toBe("lion");
    expect(player.phoneOnly).toBe(false);
    expect(player.paired).toBe(false);
  });

  test("a pad without a pair token is a phone-only player", async () => {
    await join({ role: "pad", name: "Nuris" });
    const [player] = [...room.state.players.values()];
    expect(player.phoneOnly).toBe(true);
    expect(player.paired).toBe(true);
  });

  test("rejects pair tokens until pairing exists", async () => {
    expect(await rejectCode({ role: "pad", pairToken: "nope" })).toBe(
      JoinError.BadPairToken,
    );
  });

  test("caps players, but the host still fits", async () => {
    for (let i = 0; i < MAX_PLAYERS; i++) await join({ role: "viewer" });
    expect(await rejectCode({ role: "pad" })).toBe(JoinError.RoomFull);
    await join({ role: "host" });
    expect(room.state.players.size).toBe(MAX_PLAYERS);
  });

  test("leaving frees the player's color slot", async () => {
    const a = await join({ role: "viewer", name: "A" });
    await join({ role: "viewer", name: "B" });
    const colors = () =>
      [...room.state.players.values()].map((p) => p.color).sort();
    expect(colors()).toEqual([0, 1]);

    await a.leave();
    await room.waitForNextPatch?.();
    expect(colors()).toEqual([1]);

    await join({ role: "viewer", name: "C" });
    expect(colors()).toEqual([0, 1]);
  });

  test("default names use the slot number", async () => {
    await join({ role: "viewer" });
    const [player] = [...room.state.players.values()];
    expect(player.name).toBe("Player 1");
  });
});
