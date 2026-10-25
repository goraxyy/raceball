import { useLayoutEffect, useRef, type ReactNode } from "react";
import { useRaceState } from "../net";
import { FollowTile, SteerWheel } from "../ui";
import type { TileRect } from "./big-screen";
import type { SnapshotSource } from "./net-feed";
import { splitGrid } from "./split-layout";
import "./split.css";

/**
 * The big screen's split screen: one frame (Nuris's FollowTile) per player, filling the screen in a grid. The inside
 * of each frame is measured and handed to the game, which draws that player's first-person view there on the canvas.
 * Each frame has a small wheel showing how far that player's phone is turned. The race board gets a place of its own
 * in the grid (splitGrid), so it never covers a view.
 */
export function TileFrames({
  ids,
  session,
  onRects,
  wheel,
  board,
}: {
  ids: string[];
  session: SnapshotSource;
  onRects: (rects: Map<string, TileRect>) => void;
  /** Registers a player's wheel indicator, so the game can turn it every frame (null when it unmounts) */
  wheel: (id: string, el: HTMLElement | null) => void;
  /** The race board (live map, standings, the host's buttons), drawn in its own cell or column */
  board?: ReactNode;
}) {
  const players = useRaceState(session).players ?? {}; // none before the room's first state
  const views = useRef(new Map<string, HTMLElement>());
  const key = ids.join();

  useLayoutEffect(() => {
    const measure = () => {
      const rects = new Map<string, TileRect>();
      for (const [id, el] of views.current) {
        const { left, top, width, height } = el.getBoundingClientRect();
        rects.set(id, { left, top, width, height });
      }
      onRects(rects);
    };
    measure();
    const observer = new ResizeObserver(measure);
    for (const el of views.current.values()) observer.observe(el);
    addEventListener("resize", measure);
    return () => {
      observer.disconnect();
      removeEventListener("resize", measure);
      onRects(new Map());
    };
  }, [key, onRects]);

  const grid = splitGrid(ids.length);
  const column = grid.board === "column";
  return (
    <div
      className="split-screen"
      data-board={grid.board}
      style={{
        gridTemplateColumns: `repeat(${grid.cols}, 1fr)${column ? " var(--board-width)" : ""}`,
        gridTemplateRows: `repeat(${grid.rows}, 1fr)`,
      }}
    >
      {ids.map((id, i) => {
        const player = players[id];
        // views fill the grid row by row, leaving the board's column alone
        const col = (i % grid.cols) + 1;
        const row = Math.floor(i / grid.cols) + 1;
        return (
          <div
            key={id}
            style={{ display: "grid", gridColumn: col, gridRow: row }}
          >
            <FollowTile
              name={player?.name ?? ""}
              color={player?.color ?? 0}
              shape={player?.shape ?? 0}
              place={player?.place ?? 0}
            >
              <span
                className="follow-camera"
                ref={(el) => {
                  if (el) views.current.set(id, el);
                  else views.current.delete(id);
                }}
              />
              <SteerWheel wheelRef={(el) => wheel(id, el)} />
            </FollowTile>
          </div>
        );
      })}
      <div
        className="board-slot"
        style={
          column
            ? { gridColumn: grid.cols + 1, gridRow: `1 / span ${grid.rows}` }
            : { gridColumn: grid.cols, gridRow: grid.rows }
        }
      >
        {board}
      </div>
    </div>
  );
}
