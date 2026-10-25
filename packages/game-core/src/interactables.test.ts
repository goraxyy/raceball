import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { NodeIO } from "@gltf-transform/core";
import { afterEach, describe, expect, it } from "vitest";
import type { GameEvent, InputMsg } from "@raceball/shared";
import {
  createFlatRace,
  createRace,
  HAPPY_VALLEY_GROUND,
  HAPPY_VALLEY_INTERACTABLES,
  NEUTRAL_INPUT,
  readBoostPads,
  TICK_DT,
  tuning,
  type InteractablesDef,
  type Race,
} from "./index";

const GAS: InputMsg = { ...NEUTRAL_INPUT, gas: 1 };

let race: Race | undefined;
afterEach(() => {
  race?.dispose();
  race = undefined;
});

/** Slot 1 on the flat grid starts at x = -1.5 facing +z: a line of scoops right ahead of it */
function scoopLine(count: number, from = 6, gap = 2): InteractablesDef {
  return {
    scoops: Array.from({ length: count }, (_, i) => [
      -1.5,
      0.5,
      from + i * gap,
    ]),
    paws: [],
  };
}

/** Full gas for `seconds`, collecting the events; stops early once `until` says so */
function drive(r: Race, seconds: number, until?: (e: GameEvent[]) => boolean) {
  const events: GameEvent[] = [];
  for (let i = 0; i < Math.round(seconds / TICK_DT); i++) {
    r.setInput("me", GAS);
    r.step(TICK_DT);
    events.push(...r.drainEvents());
    if (until?.(events)) break;
  }
  return events;
}

const speedOf = (r: Race) => {
  const [vx, , vz] = r.snapshot(0, 0).balls[0].v;
  return Math.hypot(vx, vz);
};

describe("Creamery Scoops", () => {
  it("collects a scoop by rolling through it, and it comes back", async () => {
    race = await createFlatRace({ laps: 3, interactables: scoopLine(1) });
    race.addPlayer("me", "earth");
    race.start(0, 3);
    const events = drive(race, 2, (e) => e.some((x) => x.type === "scoop"));
    expect(events.find((e) => e.type === "scoop")).toMatchObject({
      player: "me",
      count: 1,
      pos: [-1.5, 0.5, 6],
    });
    expect(race.scoops()[0].active).toBe(false);
    expect(race.standings()[0].scoops).toBe(1);
    for (let i = 0; i < Math.round((tuning.scoopRespawn + 0.1) / TICK_DT); i++)
      race.step(TICK_DT);
    expect(race.scoops()[0].active).toBe(true);
  });

  it("raises the top speed for every scoop held, up to scoopMax", async () => {
    race = await createFlatRace({ laps: 3 });
    race.addPlayer("me", "earth");
    race.start(0, 3);
    drive(race, 2.2);
    const plain = speedOf(race);
    race.dispose();

    race = await createFlatRace({
      laps: 3,
      interactables: scoopLine(12, 4, 1.2),
    });
    race.addPlayer("me", "earth");
    race.start(0, 3);
    const events = drive(race, 2.2);
    const counts = events.flatMap((e) => (e.type === "scoop" ? [e.count] : []));
    expect(counts.length).toBe(12); // all of them go…
    expect(counts.at(-1)).toBe(tuning.scoopMax); // …but only 10 count
    expect(speedOf(race)).toBeGreaterThan(
      plain * (1 + tuning.scoopTopSpeed * tuning.scoopMax * 0.7),
    );
  });

  it("drops half the scoops on a respawn", async () => {
    race = await createFlatRace({ laps: 3, interactables: scoopLine(3) });
    race.addPlayer("me", "earth");
    race.start(0, 3);
    const events = drive(race, 10, (e) => e.some((x) => x.type === "respawn"));
    const drop = events.find((e) => e.type === "drop");
    expect(drop).toMatchObject({ player: "me", lost: 2 }); // off the square's edge, with 3 held
    expect(events.indexOf(drop!)).toBeLessThan(
      events.findIndex((e) => e.type === "respawn"),
    );
    expect(race.standings()[0].scoops).toBe(1);
  });
});

describe("Lion Paw bumpers", () => {
  it("kicks a ball straight back out", async () => {
    race = await createFlatRace({
      laps: 3,
      interactables: { scoops: [], paws: [[-1.5, 0, 12]] },
    });
    race.addPlayer("me", "earth");
    race.start(0, 3);
    const events = drive(race, 3, (e) => e.some((x) => x.type === "bounce"));
    expect(events.find((e) => e.type === "bounce")).toMatchObject({
      player: "me",
      pos: [-1.5, 0, 12],
    });
    race.step(TICK_DT);
    const [, , vz] = race.snapshot(0, 0).balls[0].v;
    expect(vz).toBeLessThan(-tuning.pawKick * 0.8); // back toward the grid
  });
});

describe("Happy Valley's interactables", () => {
  it("lets a bot lap clean and collect scoops on the way", async () => {
    const glb = fileURLToPath(
      new URL("../tracks/happy_valley_col.glb", import.meta.url),
    );
    race = await createRace(new Uint8Array(readFileSync(glb)), new NodeIO(), {
      laps: 1,
      ground: HAPPY_VALLEY_GROUND,
      interactables: HAPPY_VALLEY_INTERACTABLES,
    });
    race.addPlayer("bot", "earth");
    race.start(0, 1);
    const seen: GameEvent[] = [];
    for (let t = 0; race.phase !== "results" && t < 120; t += TICK_DT) {
      race.setInput("bot", race.botInput("bot"));
      race.step(TICK_DT);
      seen.push(...race.drainEvents());
    }
    expect(race.phase).toBe("results");
    expect(seen.filter((e) => e.type === "respawn")).toEqual([]);
    expect(seen.filter((e) => e.type === "bounce")).toEqual([]); // the paws stand off the bots' line
    expect(seen.some((e) => e.type === "scoop")).toBe(true);
    expect(seen.filter((e) => e.type === "pad").length).toBeGreaterThan(0);
  }, 60_000);
});

describe("readBoostPads", () => {
  it("reads Happy Valley's four pads for the screens, 8 m across and 4 m along", async () => {
    const glb = new Uint8Array(
      readFileSync(
        fileURLToPath(
          new URL("../tracks/happy_valley_col.glb", import.meta.url),
        ),
      ),
    );
    const pads = await readBoostPads(glb, new NodeIO());
    expect(pads.length).toBe(4);
    for (const pad of pads) {
      expect(pad.size[0]).toBeCloseTo(8);
      expect(pad.size[1]).toBeCloseTo(4);
    }
    // the first one is 25 m up the start straight, pushing north (+z)
    expect(pads[0].pos[2]).toBeCloseTo(25, 0);
    expect(Math.abs(pads[0].heading)).toBeLessThan(0.05);
  });
});
