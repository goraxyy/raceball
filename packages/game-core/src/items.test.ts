import { describe, expect, it } from "vitest";
import { ITEM_ODDS, oddsRow, rollItem } from "./items";

/** A repeatable 0 … 1 sequence (a small LCG), so the odds test is the same on every run */
function seeded(seed: number): () => number {
  let s = seed;
  return () => (s = (s * 1664525 + 1013904223) % 2 ** 32) / 2 ** 32;
}

describe("item odds", () => {
  it("add up to 100% in every row", () => {
    for (const row of Object.values(ITEM_ODDS))
      expect(Object.values(row).reduce((a, b) => a + b, 0)).toBe(100);
  });

  it("give the leader the first row, the last two the last row, and the rest the middle", () => {
    expect([1, 2, 3, 4, 5, 6, 7, 8].map((p) => oddsRow(p, 8))).toEqual([
      "first",
      "middle",
      "middle",
      "middle",
      "middle",
      "middle",
      "last",
      "last",
    ]);
    expect([1, 2].map((p) => oddsRow(p, 2))).toEqual(["first", "last"]);
    expect(oddsRow(1, 1)).toBe("first");
  });

  it("draw items at about the rates in the table", () => {
    const random = seeded(7);
    for (const [row, place] of [
      ["first", 1],
      ["middle", 4],
      ["last", 8],
    ] as const) {
      const counts: Record<string, number> = {};
      const draws = 20000;
      for (let i = 0; i < draws; i++) {
        const item = rollItem(place, 8, random);
        counts[item] = (counts[item] ?? 0) + 1;
      }
      for (const [item, pct] of Object.entries(ITEM_ODDS[row]))
        expect((100 * (counts[item] ?? 0)) / draws).toBeCloseTo(pct, -0.5); // within ±1.6%
      expect(Object.keys(counts).sort()).toEqual(
        Object.keys(ITEM_ODDS[row]).sort(),
      );
    }
  });

  it("never hand the leader a Snow Day or the last two a Spill", () => {
    expect(ITEM_ODDS.first.snowday ?? 0).toBe(0);
    expect(ITEM_ODDS.last.spill ?? 0).toBe(0);
  });
});
