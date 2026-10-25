import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { EVENT_SOUNDS, SOUNDS, type Sound } from "./sounds";

const publicDir = fileURLToPath(new URL("../../public", import.meta.url));
const all = Object.entries(SOUNDS) as [string, Sound][];

describe("sound bank", () => {
  it("points only at files that exist", () => {
    const missing = all
      .flatMap(([, s]) => s.files)
      .filter((f) => !existsSync(publicDir + f));
    expect(missing).toEqual([]);
  });

  it("only loops WAVs (MP3 leaves a gap on every repeat)", () => {
    const bad = all.filter(
      ([, s]) => s.loop && s.files.some((f) => !f.endsWith(".wav")),
    );
    expect(bad.map(([id]) => id)).toEqual([]);
  });

  it("keeps levels between 0 and 1 and the crowd off laptops", () => {
    for (const [id, s] of all) {
      for (const v of Object.values(s.gain))
        expect(v, id).toBeGreaterThanOrEqual(0);
      for (const v of Object.values(s.gain))
        expect(v, id).toBeLessThanOrEqual(1);
      if (s.bus === "crowd") expect(s.gain.laptop, id).toBe(0);
    }
  });

  it("keeps captions short enough to read from across the room", () => {
    for (const [id, s] of all)
      if (s.caption) expect(s.caption.length, id).toBeLessThanOrEqual(16);
  });

  it("maps game events to sounds that exist", () => {
    for (const ids of Object.values(EVENT_SOUNDS))
      for (const id of ids) expect(SOUNDS).toHaveProperty(id);
  });
});
