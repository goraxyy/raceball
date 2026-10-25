import { describe, expect, test } from "vitest";
import { splitGrid } from "./split-layout";

describe("splitGrid", () => {
  test.each([
    [1, { cols: 1, rows: 1, lastSpan: 1 }],
    [2, { cols: 2, rows: 1, lastSpan: 1 }],
    [3, { cols: 2, rows: 2, lastSpan: 2 }],
    [4, { cols: 2, rows: 2, lastSpan: 1 }],
    [5, { cols: 3, rows: 2, lastSpan: 2 }],
    [6, { cols: 3, rows: 2, lastSpan: 1 }],
    [7, { cols: 4, rows: 2, lastSpan: 2 }],
    [8, { cols: 4, rows: 2, lastSpan: 1 }],
  ])("%i players", (n, grid) => {
    expect(splitGrid(n)).toEqual(grid);
  });

  test("every player gets a cell and none is left empty", () => {
    for (let n = 1; n <= 8; n++) {
      const { cols, rows, lastSpan } = splitGrid(n);
      expect(n - 1 + lastSpan).toBe(cols * rows);
    }
  });

  test("zero players still lays out one cell", () => {
    expect(splitGrid(0)).toEqual({ cols: 1, rows: 1, lastSpan: 1 });
  });
});
