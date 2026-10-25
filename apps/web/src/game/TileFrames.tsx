import { useLayoutEffect, useRef } from "react";
import { useRaceState } from "../net";
import { FollowTile } from "../ui";
import type { TileRect } from "./big-screen";
import type { SnapshotSource } from "./net-feed";
import { splitGrid } from "./split-layout";
import "./split.css";

/**
 * The big screen's split screen: one frame (Nuris's FollowTile) per player, filling the screen in a grid. The inside
 * of each frame is measured and handed to the game, which draws that player's first-person view there on the canvas.
 */
export function TileFrames({
  ids,
  session,
  onRects,
}: {
  ids: string[];
  session: SnapshotSource;
  onRects: (rects: Map<string, TileRect>) => void;
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
  return (
    <div
      className="split-screen"
      style={{
        gridTemplateColumns: `repeat(${grid.cols}, 1fr)`,
        gridTemplateRows: `repeat(${grid.rows}, 1fr)`,
      }}
    >
      {ids.map((id, i) => {
        const player = players[id];
        const last = i === ids.length - 1;
        return (
          <div
            key={id}
            style={{
              display: "grid",
              gridColumn: last ? `span ${grid.lastSpan}` : undefined,
            }}
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
            </FollowTile>
          </div>
        );
      })}
    </div>
  );
}
