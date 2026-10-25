/** A split-screen grid for N players: one view each, as big as the screen allows */
export interface SplitGrid {
  cols: number;
  rows: number;
  /** Columns the last view spans, so an odd count leaves no empty hole (3 players: 2×2, the third full width) */
  lastSpan: number;
}

/**
 * 1 → full screen, 2 → side by side, 3–4 → 2×2, 5–6 → 3×2, 7–8 → 4×2.
 * Two rows at most on a 16:9 big screen keeps each view wide enough to drive in.
 */
export function splitGrid(n: number): SplitGrid {
  const count = Math.max(1, Math.floor(n));
  const rows = count <= 2 ? 1 : 2;
  const cols = Math.ceil(count / rows);
  return { cols, rows, lastSpan: cols * rows - count + 1 };
}
