import { describe, expect, it } from "vitest";
import { QUALITY_LADDER, QualityGovernor, ladderFor } from "./quality";

/** `seconds` of frames at `fps`; true if the rung changed on any of them */
const run = (g: QualityGovernor, fps: number, seconds: number) => {
  let changed = false;
  for (let t = 0; t < seconds; t += 1 / fps)
    changed = g.update(1 / fps) || changed;
  return changed;
};

describe("ladderFor", () => {
  it("draws sharper than the page's pixels only where the screen has them", () => {
    expect(ladderFor(1)[0].scale).toBe(1); // a plain screen starts at one pixel per page pixel
    expect(ladderFor(1.25)[0].scale).toBe(1.25); // Windows at 125%: no stretching
    expect(ladderFor(2)[0].scale).toBe(1.5); // retina: 1.5 is plenty
  });

  it("gives up effects before sharpness, and shadows last", () => {
    const flat = QUALITY_LADDER.filter((q) => q.scale === 1);
    expect(flat[0].glow).toBe(true);
    expect(flat.at(-1)!.glow).toBe(false);
    expect(QUALITY_LADDER.findIndex((q) => !q.shadows)).toBe(
      QUALITY_LADDER.length - 1,
    );
  });
});

describe("QualityGovernor", () => {
  it("steps down a rung after a while under the target, not before", () => {
    const g = new QualityGovernor(ladderFor(2), 55);
    expect(run(g, 30, 3)).toBe(false); // the grace after a change: shaders compiling
    expect(run(g, 30, 2)).toBe(false);
    expect(run(g, 30, 0.8)).toBe(true);
    expect(g.level).toBe(1);
  });

  it("climbs back with room to spare, but never onto a rung that was too slow", () => {
    const g = new QualityGovernor(ladderFor(2), 55);
    run(g, 30, 6); // too slow at the top: one down
    expect(g.level).toBe(1);
    expect(run(g, 120, 30)).toBe(false); // plenty of room, but the top already failed
    expect(g.level).toBe(1);
    run(g, 30, 6); // too slow again: down again
    expect(g.level).toBe(2);
    run(g, 120, 30); // it failed at 1 too: it stays
    expect(g.level).toBe(2);
  });

  it("climbs when a rung below the start has room again", () => {
    const g = new QualityGovernor(ladderFor(1), 55, 2); // started low by hand
    expect(run(g, 120, 12)).toBe(true);
    expect(g.level).toBe(1);
  });

  it("ignores one-off stalls and a hidden page", () => {
    const g = new QualityGovernor(ladderFor(1), 55);
    run(g, 60, 4);
    for (let i = 0; i < 30; i++) {
      expect(g.update(0.6)).toBe(false); // a model loading, now and then…
      run(g, 60, 0.5); // …between smooth frames
    }
    for (let i = 0; i < 30; i++) expect(g.update(1, true)).toBe(false); // a hidden tab
    expect(g.level).toBe(0);
  });

  it("counts long frames that keep coming: that screen really is slow", () => {
    const g = new QualityGovernor(ladderFor(1), 55);
    run(g, 2, 20); // half a second a frame, every frame
    expect(g.level).toBeGreaterThan(0);
  });

  it("never goes below the bottom rung", () => {
    const g = new QualityGovernor(ladderFor(1), 55);
    run(g, 5, 300);
    expect(g.level).toBe(ladderFor(1).length - 1);
  });
});
