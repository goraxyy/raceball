/**
 * The big screen's split screen for N players: one view each, and a place for the race board (the live map and the
 * timing tower) that never covers anyone's view
 */
export interface SplitGrid {
  /** Columns and rows of player views */
  cols: number;
  rows: number;
  /**
   * Where the race board goes: "cell" = the grid's one empty cell (an odd count of players, after the last view);
   * "column" = a column of its own on the right, beside every row of views
   */
  board: "cell" | "column";
}

/**
 * 1 → one view, 2 → two wide views stacked, 3–4 → 2×2, 5–6 → 3×2, 7–8 → 4×2. Two rows at most on a 16:9 big
 * screen keeps each view wide enough to drive in. An odd count leaves one cell free, which the board takes;
 * otherwise the board gets a column on the right.
 */
export function splitGrid(n: number): SplitGrid {
  const count = Math.max(1, Math.floor(n));
  if (count === 2) return { cols: 1, rows: 2, board: "column" }; // side by side, beside a board, they'd be too narrow
  const rows = count === 1 ? 1 : 2;
  const cols = Math.ceil(count / rows);
  return { cols, rows, board: cols * rows > count ? "cell" : "column" };
}
