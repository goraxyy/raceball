import { describe, expect, it } from "vitest";
import { EVENT_SOUNDS } from "../audio/sounds";
import {
  FX_TABLE,
  HARD_BUMP,
  caption,
  cueFor,
  cueLevel,
  ordinal,
  type FxWorld,
} from "./fx";

const PLACES: Record<string, number> = { ali: 1, nuris: 2, rasim: 3 };

const world = (
  screen: "big" | "laptop",
  own: string | null = null,
): FxWorld => ({
  screen,
  ownId: () => own,
  laps: () => 3,
  name: (id) => id[0].toUpperCase() + id.slice(1),
  color: () => 0,
  place: (id) => PLACES[id] ?? 0,
});

describe("cueFor", () => {
  it("turns a hard bump into a crash, and puts your own ball first on a laptop", () => {
    const soft = cueFor(
      { type: "bump", a: "ali", b: "nuris", strength: 0.3 },
      world("big"),
    );
    expect(soft).toMatchObject({ name: "bump", player: "ali", other: "nuris" });
    const hard = cueFor(
      { type: "bump", a: "ali", b: "nuris", strength: HARD_BUMP },
      world("laptop", "nuris"),
    );
    expect(hard).toMatchObject({
      name: "bumpHard",
      player: "nuris",
      other: "ali",
    });
  });

  it("only makes news of an overtake for the lead", () => {
    const lead = cueFor(
      { type: "overtake", player: "nuris", passed: "ali", section: "college" },
      world("big"),
    );
    expect(lead?.name).toBe("takeLead");
    expect(lead && caption(FX_TABLE.takeLead.caption!, lead.vars)).toBe(
      "Nuris takes the lead!",
    );
    expect(
      cueFor(
        { type: "overtake", player: "rasim", passed: "nuris", section: "x" },
        world("big"),
      ),
    ).toBeNull();
  });

  it("announces the leader's laps on the big screen, and the final lap as its own cue", () => {
    expect(
      cueFor({ type: "lap", player: "nuris", lap: 2 }, world("big")),
    ).toBeNull();
    const lap = cueFor({ type: "lap", player: "ali", lap: 2 }, world("big"));
    expect(lap && caption(FX_TABLE.lap.caption!, lap.vars)).toBe("Lap 2/3");
    expect(
      cueFor({ type: "lap", player: "ali", lap: 3 }, world("big"))?.name,
    ).toBe("finalLap");
    // a laptop gets every lap event, and plays only its own (see cueLevel)
    expect(
      cueFor({ type: "lap", player: "rasim", lap: 2 }, world("laptop", "rasim"))
        ?.name,
    ).toBe("lap");
  });

  it("crowns the winner and names the place of everyone after", () => {
    const win = cueFor(
      { type: "finish", player: "ali", place: 1 },
      world("big"),
    );
    expect(win && caption(FX_TABLE.win.caption!, win.vars)).toBe("Ali wins!");
    const second = cueFor(
      { type: "finish", player: "nuris", place: 2 },
      world("big"),
    );
    expect(second && caption(FX_TABLE.finish.caption!, second.vars)).toBe(
      "Nuris · 2nd",
    );
  });

  it("treats the protocol's item as a pickup and fire as the item's own effect, where it happens", () => {
    expect(
      cueFor({ type: "item", player: "ali", item: "roar" }, world("big"))?.name,
    ).toBe("pickup");
    expect(
      cueFor(
        { type: "fire", player: "ali", item: "roar", pos: [0, 0, 0] },
        world("big"),
      )?.name,
    ).toBe("roar");
    expect(
      cueFor(
        { type: "fire", player: "ali", item: "spill", pos: [4, 1, 2] },
        world("big"),
      ),
    ).toMatchObject({ name: "spill", pos: [4, 1, 2] }); // the splat goes where the puddle is
  });

  it("plays the interactables where they are, a scoop's pop climbing with every one held", () => {
    const at: [number, number, number] = [5, 1, 9];
    expect(
      cueFor({ type: "pad", player: "ali", pos: at }, world("big")),
    ).toMatchObject({ name: "pad", pos: at });
    const first = cueFor(
      { type: "scoop", player: "ali", count: 1, pos: at },
      world("big"),
    );
    const tenth = cueFor(
      { type: "scoop", player: "ali", count: 10, pos: at },
      world("big"),
    );
    expect(first).toMatchObject({ name: "scoop", pos: at, rate: 1 });
    expect(tenth!.rate!).toBeGreaterThan(first!.rate!);
    expect(
      cueFor({ type: "drop", player: "ali", lost: 3, pos: at }, world("big")),
    ).toMatchObject({ name: "scoopDrop", strength: 3 }); // more scoops, more blobs
    expect(
      cueFor({ type: "bounce", player: "ali", pos: at }, world("big")),
    ).toMatchObject({ name: "bounce", pos: at });
  });

  it("keeps someone else's scoops off your laptop's speakers", () => {
    const scoop = cueFor(
      { type: "scoop", player: "ali", count: 2, pos: [0, 0, 0] },
      world("laptop", "nuris"),
    )!;
    expect(cueLevel(scoop, world("laptop", "nuris"), () => 1)).toBe(0);
  });
});

describe("cueLevel", () => {
  const near = (d: number) => () => d;
  const respawn = cueFor(
    { type: "respawn", player: "ali" },
    world("laptop", "nuris"),
  )!;

  it("plays everything at full level on the big screen and for your own ball", () => {
    expect(cueLevel(respawn, world("big"), near(500))).toBe(1);
    const own = cueFor(
      { type: "respawn", player: "nuris" },
      world("laptop", "nuris"),
    )!;
    expect(cueLevel(own, world("laptop", "nuris"), near(500))).toBe(1);
  });

  it("fades other balls out with distance on a laptop, and skips cues that are only yours", () => {
    const laptop = world("laptop", "nuris");
    const close = cueLevel(respawn, laptop, near(5));
    const far = cueLevel(respawn, laptop, near(30));
    expect(close).toBeGreaterThan(far);
    expect(far).toBeGreaterThan(0);
    expect(cueLevel(respawn, laptop, near(200))).toBe(0);
    const lap = cueFor({ type: "lap", player: "ali", lap: 2 }, laptop)!;
    expect(cueLevel(lap, laptop, near(0))).toBe(0);
  });
});

describe("the table", () => {
  it("only names sound lines that exist in the sound bank", () => {
    for (const [name, row] of Object.entries(FX_TABLE))
      if (row.sound) expect(EVENT_SOUNDS, name).toHaveProperty(row.sound);
  });

  it("writes places the way race programs do", () => {
    expect([1, 2, 3, 4, 11, 12, 13, 21, 22].map(ordinal)).toEqual([
      "1st",
      "2nd",
      "3rd",
      "4th",
      "11th",
      "12th",
      "13th",
      "21st",
      "22nd",
    ]);
  });
});
