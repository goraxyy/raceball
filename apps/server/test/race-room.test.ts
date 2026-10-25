import { boot, type ColyseusTestServer } from "@colyseus/testing";
import {
  JoinError,
  MAX_PLAYERS,
  PROTOCOL_VERSION,
  type JoinOptions,
  type WelcomeMsg,
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

/** Ask for and return the welcome message (see WelcomeMsg) */
const welcome = async (client: Awaited<ReturnType<typeof join>>) => {
  const msg = client.waitForMessage("welcome");
  client.send("hello");
  return (await msg) as WelcomeMsg;
};

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

describe("pairing", () => {
  /** A laptop player plus their pairing token */
  const viewer = async () => {
    const client = await join({ role: "viewer", name: "Laptop" });
    const msg = await welcome(client);
    return { client, ...msg, pairToken: msg.pairToken! };
  };

  test("a viewer gets a pair token; a pad never does", async () => {
    const v = await viewer();
    expect(v.pairToken).toMatch(/^[\w-]{8}$/);
    const pad = await join({ role: "pad", pairToken: v.pairToken });
    expect((await welcome(pad)).pairToken).toBeUndefined();
  });

  test("a pad with the token binds to the viewer's player", async () => {
    const v = await viewer();
    expect(room.state.players.get(v.playerId)!.paired).toBe(false);

    const pad = await join({ role: "pad", pairToken: v.pairToken });
    expect((await welcome(pad)).playerId).toBe(v.playerId);
    const player = room.state.players.get(v.playerId)!;
    expect(player.paired).toBe(true);
    expect(player.phoneOnly).toBe(false);
    expect(room.state.players.size).toBe(1);
  });

  test("rejects an unknown token", async () => {
    await viewer();
    expect(await rejectCode({ role: "pad", pairToken: "nope" })).toBe(
      JoinError.BadPairToken,
    );
  });

  test("only one phone per player", async () => {
    const v = await viewer();
    await join({ role: "pad", pairToken: v.pairToken });
    expect(await rejectCode({ role: "pad", pairToken: v.pairToken })).toBe(
      JoinError.AlreadyPaired,
    );
  });

  test("a phone can pair again after it leaves", async () => {
    const v = await viewer();
    const pad = await join({ role: "pad", pairToken: v.pairToken });
    await pad.leave();
    await room.waitForNextPatch?.();
    expect(room.state.players.get(v.playerId)!.paired).toBe(false);

    await join({ role: "pad", pairToken: v.pairToken });
    expect(room.state.players.get(v.playerId)!.paired).toBe(true);
  });

  test("pairing works even when the race is full", async () => {
    const v = await viewer();
    for (let i = 1; i < MAX_PLAYERS; i++) await join({ role: "viewer" });
    await join({ role: "pad", pairToken: v.pairToken });
    expect(room.state.players.get(v.playerId)!.paired).toBe(true);
  });

  test("when the laptop leaves, its phone is disconnected and the token dies", async () => {
    await join({ role: "host" }); // keeps the room alive after the laptop leaves
    const v = await viewer();
    const pad = await join({ role: "pad", pairToken: v.pairToken });
    const kicked = new Promise<number>((resolve) => pad.onLeave(resolve));

    await v.client.leave();
    expect(await kicked).toBe(4100);
    expect(room.state.players.size).toBe(0);
    expect(await rejectCode({ role: "pad", pairToken: v.pairToken })).toBe(
      JoinError.BadPairToken,
    );
  });
});

describe("clock sync", () => {
  test("pong echoes the client time and adds server time", async () => {
    const client = await join({ role: "host" });
    const pong = client.waitForMessage("pong");
    const before = Date.now();
    client.send("ping", 1234.5);
    const msg = await pong;
    expect(msg.c).toBe(1234.5);
    expect(msg.s).toBeGreaterThanOrEqual(before);
  });
});

describe("input", () => {
  const input = (seq: number, steer = 0) => ({
    seq,
    steer,
    gas: 0,
    brake: false,
    item: false,
  });

  test("a paired pad's input is stored, latest seq wins", async () => {
    const laptop = await join({ role: "viewer" });
    const { playerId, pairToken } = await welcome(laptop);
    const pad = await join({ role: "pad", pairToken });
    pad.send("input", input(2, 0.5));
    pad.send("input", input(1, -1)); // older, dropped
    await new Promise((r) => setTimeout(r, 50));
    expect(room.latestInput(playerId)?.msg.steer).toBe(0.5);
  });

  test("screens can't send input", async () => {
    const laptop = await join({ role: "viewer" });
    const { playerId } = await welcome(laptop);
    laptop.send("input", input(1, 1));
    await new Promise((r) => setTimeout(r, 50));
    expect(room.latestInput(playerId)).toBeUndefined();
  });

  test("pad and laptop get the input age once a second", async () => {
    const laptop = await join({ role: "viewer" });
    const { pairToken } = await welcome(laptop);
    const pad = await join({ role: "pad", pairToken });
    pad.send("input", input(1));
    const [padStat, laptopStat] = await Promise.all([
      pad.waitForMessage("netstat", 2500),
      laptop.waitForMessage("netstat", 2500),
    ]);
    expect(padStat.inputAge).toBeGreaterThanOrEqual(0);
    expect(laptopStat.inputAge).toBeLessThan(1500);
  });
});
