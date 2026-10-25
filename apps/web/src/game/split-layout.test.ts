import { describe, expect, test } from "vitest";
import { splitGrid } from "./split-layout";

describe("splitGrid", () => {
  test.each([
    [1, { cols: 1, rows: 1, board: "column" }],
    [2, { cols: 1, rows: 2, board: "column" }],
    [3, { cols: 2, rows: 2, board: "cell" }],
    [4, { cols: 2, rows: 2, board: "column" }],
    [5, { cols: 3, rows: 2, board: "cell" }],
    [6, { cols: 3, rows: 2, board: "column" }],
    [7, { cols: 4, rows: 2, board: "cell" }],
    [8, { cols: 4, rows: 2, board: "column" }],
  ])("%i players", (n, grid) => {
    expect(splitGrid(n)).toEqual(grid);
  });

  test("every player gets a cell, and the board never shares one with a view", () => {
    for (let n = 1; n <= 8; n++) {
      const { cols, rows, board } = splitGrid(n);
      const cells = cols * rows;
      expect(cells).toBeGreaterThanOrEqual(n);
      // the board takes the one free cell, or has a column of its own
      expect(board === "cell" ? cells - n : 0).toBe(board === "cell" ? 1 : 0);
      if (board === "column") expect(cells).toBe(n);
    }
  });

  test("zero players still lays out one view", () => {
    expect(splitGrid(0)).toEqual({ cols: 1, rows: 1, board: "column" });
  });
});
