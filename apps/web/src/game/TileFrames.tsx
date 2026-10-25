import { useLayoutEffect, useRef } from "react";
import { useRaceState } from "../net";
import { FollowTile } from "../ui";
import type { TileRect } from "./big-screen";
import type { SnapshotSource } from "./net-feed";

/**
 * The big screen's follow-cam frames (Nuris's FollowTile) along the top. The inside of each frame is measured and
 * handed to the game, which draws that player's chase camera there on the canvas underneath.
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
  const { players } = useRaceState(session);
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

  return (
    <div className="race-overlay">
      <div className="follow-tiles">
        {ids.map((id) => {
          const player = players[id];
          return (
            <FollowTile
              key={id}
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
          );
        })}
      </div>
    </div>
  );
}
