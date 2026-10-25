import { boot, type ColyseusTestServer } from "@colyseus/testing";
import {
  COUNTDOWN_MS,
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

  test("syncs the track's item boxes into the state, all active", () => {
    // Happy Valley has a row of five on Pollock Road
    expect(room.state.itemBoxes.length).toBe(5);
    for (const box of room.state.itemBoxes) {
      expect(box.id).toMatch(/^box\d$/);
      expect(box.active).toBe(true);
    }
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
      ball: "earth",
    });
    const welcomed = client.waitForMessage("welcome");
    client.send("hello");
    const welcome = await welcomed;
    const player = room.state.players.get(welcome.playerId)!;
    expect(player.name).toBe("Rasim");
    expect(player.ball).toBe("earth");
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

describe("simulation loop", () => {
  const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
  type Snap = {
    tick: number;
    balls: { id: string; p: number[]; v: number[] }[];
  };

  /** Collect snapshots a screen receives */
  const collect = (client: Awaited<ReturnType<typeof join>>) => {
    const snaps: Snap[] = [];
    client.onMessage("snap", (s: Snap) => snaps.push(s));
    return snaps;
  };

  test("screens get snapshots at about 60 Hz; pads don't", async () => {
    const host = await join({ role: "host" });
    const laptop = await join({ role: "viewer" });
    const { pairToken } = await welcome(laptop);
    const pad = await join({ role: "pad", pairToken });
    const [hostSnaps, laptopSnaps] = [collect(host), collect(laptop)];
    let padSnaps = 0;
    pad.onMessage("snap", () => padSnaps++);
    await sleep(1000);
    expect(hostSnaps.length).toBeGreaterThan(45);
    expect(hostSnaps.length).toBeLessThan(75);
    expect(laptopSnaps.length).toBeGreaterThan(45);
    expect(padSnaps).toBe(0);
    const ticks = hostSnaps.map((s) => s.tick);
    expect(ticks).toEqual([...ticks].sort((a, b) => a - b));
  });

  test("rooms start in the lobby", () => {
    expect(room.state.phase).toBe("lobby");
  });

  test("a pad holding gas drives its ball; an idle ball stays put", async () => {
    const host = await join({ role: "host" });
    const driver = await join({ role: "viewer", name: "Driver" });
    const { playerId: driverId, pairToken } = await welcome(driver);
    const idle = await join({ role: "pad", name: "Idle" }); // phone-only, never touches gas
    const { playerId: idleId } = await welcome(idle);
    const pad = await join({ role: "pad", pairToken });
    driver.send("status", { assetsLoaded: true });
    for (const c of [pad, idle])
      c.send("status", { calibrated: true, ready: true });
    await sleep(100);
    host.send("start", { laps: 1 });
    await sleep(COUNTDOWN_MS + 200);
    expect(room.state.phase).toBe("racing");
    const snaps = collect(host);
    await sleep(300); // settle on the grid
    const start = snaps.at(-1)!;

    let seq = 0;
    const gas = setInterval(
      () =>
        pad.send("input", {
          seq: ++seq,
          steer: 0,
          gas: 1,
          brake: false,
          item: false,
        }),
      16,
    );
    await sleep(1500);
    clearInterval(gas);
    const end = snaps.at(-1)!;

    const moved = (id: string) => {
      const a = start.balls.find((b) => b.id === id)!.p;
      const b = end.balls.find((b) => b.id === id)!.p;
      return Math.hypot(b[0] - a[0], b[2] - a[2]);
    };
    expect(moved(driverId)).toBeGreaterThan(1);
    expect(moved(idleId)).toBeLessThan(0.2);
  });

  test("a player who leaves disappears from snapshots", async () => {
    const host = await join({ role: "host" });
    const laptop = await join({ role: "viewer" });
    const { playerId } = await welcome(laptop);
    const snaps = collect(host);
    await sleep(100);
    expect(snaps.at(-1)!.balls.map((b) => b.id)).toContain(playerId);
    await laptop.leave();
    await sleep(100);
    expect(snaps.at(-1)!.balls.map((b) => b.id)).not.toContain(playerId);
  });
});

describe("host controls", () => {
  const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

  /** A laptop + paired phone, fully ready to race */
  const readyLaptopPlayer = async () => {
    const laptop = await join({ role: "viewer" });
    const { playerId, pairToken } = await welcome(laptop);
    const pad = await join({ role: "pad", pairToken });
    laptop.send("status", { assetsLoaded: true });
    pad.send("status", { calibrated: true, ready: true });
    await sleep(50);
    return { laptop, pad, playerId };
  };

  test("only the host can start, and only when everyone is ready", async () => {
    const host = await join({ role: "host" });
    const { laptop, pad } = await readyLaptopPlayer();
    const notReady = await join({ role: "pad", name: "Late" }); // phone-only, not calibrated
    laptop.send("start", { laps: 1 });
    pad.send("start", { laps: 1 });
    host.send("start", { laps: 1 });
    await sleep(100);
    expect(room.state.phase).toBe("lobby");

    notReady.send("status", { calibrated: true, ready: true });
    await sleep(50);
    host.send("start", { laps: 1 });
    await sleep(100);
    expect(room.state.phase).toBe("countdown");
    expect(room.state.laps).toBe(1);
    expect(room.state.countdownEndsAt).toBeGreaterThan(Date.now());
  });

  test("laps must be 1 or 3", async () => {
    const host = await join({ role: "host" });
    await readyLaptopPlayer();
    host.send("start", { laps: 7 });
    await sleep(100);
    expect(room.state.phase).toBe("lobby");
  });

  test("countdown turns into racing after 3 s", async () => {
    const host = await join({ role: "host" });
    await readyLaptopPlayer();
    host.send("start", { laps: 3 });
    await sleep(COUNTDOWN_MS + 300);
    expect(room.state.phase).toBe("racing");
    expect(room.state.countdownEndsAt).toBe(0);
  });

  test("a status message only sets the sender's own kind of flag", async () => {
    const laptop = await join({ role: "viewer" });
    const { playerId, pairToken } = await welcome(laptop);
    const pad = await join({ role: "pad", pairToken });
    laptop.send("status", { calibrated: true }); // laptops can't calibrate
    pad.send("status", { assetsLoaded: true }); // pads don't load the 3D assets
    await sleep(100);
    const p = room.state.players.get(playerId)!;
    expect(p.calibrated).toBe(false);
    expect(p.assetsLoaded).toBe(false);
  });

  test("bots: host adds them in the lobby, they're always ready, only bots can be removed", async () => {
    const host = await join({ role: "host" });
    const { laptop, playerId } = await readyLaptopPlayer();
    laptop.send("addBot"); // not the host
    host.send("addBot");
    host.send("addBot");
    await sleep(100);
    const bots = [...room.state.players.entries()].filter(([, p]) => p.bot);
    expect(bots).toHaveLength(2);
    expect(bots.every(([, p]) => p.ready && p.name.startsWith("Bot"))).toBe(
      true,
    );

    host.send("removeBot", { id: playerId }); // a human: ignored
    host.send("removeBot", { id: bots[0][0] });
    await sleep(100);
    expect(room.state.players.has(playerId)).toBe(true);
    expect(room.state.players.has(bots[0][0])).toBe(false);
  });

  test("bots drive once the race starts", async () => {
    const host = await join({ role: "host" });
    host.send("addBot");
    await sleep(100);
    const [botId] = [...room.state.players.keys()];
    const snaps: { balls: { id: string; p: number[] }[] }[] = [];
    host.onMessage("snap", (s) => snaps.push(s));
    host.send("start", { laps: 1 });
    await sleep(COUNTDOWN_MS + 200);
    const a = snaps.at(-1)!.balls.find((b) => b.id === botId)!.p;
    await sleep(1000);
    const b = snaps.at(-1)!.balls.find((b) => b.id === botId)!.p;
    expect(Math.hypot(b[0] - a[0], b[2] - a[2])).toBeGreaterThan(1);
  });

  test("rematch goes back to the lobby; humans tap Ready again, bots stay ready", async () => {
    const host = await join({ role: "host" });
    const { playerId } = await readyLaptopPlayer();
    host.send("addBot");
    await sleep(50);
    host.send("rematch"); // nothing to rematch in the lobby
    host.send("start", { laps: 1 });
    await sleep(200);
    expect(room.state.phase).toBe("countdown");

    host.send("rematch");
    await sleep(500);
    expect(room.state.phase).toBe("lobby");
    const players = [...room.state.players.values()];
    expect(players).toHaveLength(2);
    expect(room.state.players.get(playerId)!.ready).toBe(false);
    expect(players.find((p) => p.bot)!.ready).toBe(true);
    expect(room.state.players.get(playerId)!.calibrated).toBe(true); // no need to recalibrate
  });
});

describe("profiles and planets", () => {
  const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

  test("every player gets a different planet; a taken or missing one gets the first free", async () => {
    await join({ role: "viewer", ball: "mars" });
    await join({ role: "viewer", ball: "mars" }); // taken
    await join({ role: "viewer" }); // none asked
    await join({ role: "viewer", ball: "pluto" }); // not a planet here
    const balls = [...room.state.players.values()].map((p) => p.ball);
    expect(balls[0]).toBe("mars");
    expect(new Set(balls).size).toBe(4);
    expect(balls.slice(1)).toEqual(["mercury", "venus", "earth"]);
  });

  test("setProfile changes your own name and planet, but not to a taken one", async () => {
    const a = await join({ role: "pad" });
    const { playerId: aId } = await welcome(a);
    const b = await join({ role: "pad", ball: "saturn" });
    const { playerId: bId } = await welcome(b);
    a.send("setProfile", { name: "  Nuris  ", ball: "jupiter" });
    await sleep(100);
    expect(room.state.players.get(aId)!.name).toBe("Nuris");
    expect(room.state.players.get(aId)!.ball).toBe("jupiter");

    a.send("setProfile", { ball: "saturn" }); // b has it
    await sleep(100);
    expect(room.state.players.get(aId)!.ball).toBe("jupiter");
    expect(room.state.players.get(bId)!.ball).toBe("saturn");
  });

  test("profiles are locked once the race starts", async () => {
    const host = await join({ role: "host" });
    const pad = await join({ role: "pad", name: "Before" });
    const { playerId } = await welcome(pad);
    pad.send("status", { calibrated: true, ready: true });
    await sleep(50);
    host.send("start", { laps: 1 });
    await sleep(100);
    pad.send("setProfile", { name: "After" });
    await sleep(100);
    expect(room.state.players.get(playerId)!.name).toBe("Before");
  });
});

describe("reconnection", () => {
  const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
  type SdkRoom = Awaited<ReturnType<typeof join>> & {
    reconnectionToken: string;
    connection: { close(code?: number): void };
    reconnection: { enabled: boolean };
  };

  test("a dropped phone keeps its slot and comes back into it", async () => {
    await join({ role: "host" }); // keeps the room alive
    const laptop = await join({ role: "viewer" });
    const { playerId, pairToken } = await welcome(laptop);
    const pad = (await join({ role: "pad", pairToken })) as SdkRoom;
    pad.reconnection.enabled = false; // we reconnect by hand below, like a reloaded page would
    const token = pad.reconnectionToken;

    pad.connection.close(4999); // not a goodbye: like a locked phone
    await sleep(300);
    const player = room.state.players.get(playerId)!;
    expect(player.connected).toBe(false);
    expect(player.paired).toBe(true); // slot held

    const back = await colyseus.sdk.reconnect(token);
    await sleep(200);
    expect(player.connected).toBe(true);
    expect(player.paired).toBe(true);
    expect(room.state.players.size).toBe(1);

    // and it can still drive: input from the reconnected pad is accepted
    back.send("input", {
      seq: 99,
      steer: 0,
      gas: 1,
      brake: false,
      item: false,
    });
    await sleep(100);
    expect(room.latestInput(playerId)?.msg.seq).toBe(99);
  });

  test("the SDK reconnects a dropped pad by itself", async () => {
    await join({ role: "host" });
    const pad = (await join({ role: "pad", name: "Auto" })) as SdkRoom;
    const { playerId } = await welcome(pad);
    await sleep(5100); // the SDK only auto-reconnects rooms it has been in for 5 s
    pad.connection.close(4010); // MAY_TRY_RECONNECT, like a network drop (1006) on a real phone
    await sleep(50);
    expect(room.state.players.get(playerId)!.connected).toBe(false);
    for (let i = 0; i < 40 && !room.state.players.get(playerId)!.connected; i++)
      await sleep(100);
    expect(room.state.players.get(playerId)!.connected).toBe(true);
  });

  test("a phone-only player who drops keeps their name and planet on return", async () => {
    await join({ role: "host" });
    const pad = (await join({
      role: "pad",
      name: "Ana",
      ball: "neptune",
    })) as SdkRoom;
    pad.reconnection.enabled = false;
    const { playerId } = await welcome(pad);
    const token = pad.reconnectionToken;
    pad.connection.close(4999);
    await sleep(300);
    expect(room.state.players.get(playerId)!.connected).toBe(false);
    await colyseus.sdk.reconnect(token);
    await sleep(200);
    const p = room.state.players.get(playerId)!;
    expect([p.connected, p.name, p.ball]).toEqual([true, "Ana", "neptune"]);
  });
});
