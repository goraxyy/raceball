import { useLayoutEffect, useRef } from "react";
import { PlayerShape, playerStyle } from "./pieces";

export interface StandingRow {
  id: string;
  place: number;
  name: string;
  color: number;
  shape: number;
  lap: number;
  /** Time behind the leader, e.g. "+1.4", or "Leader" for first place */
  gap: string;
  /** Finished players show a flag instead of the lap */
  finished?: boolean;
}

/**
 * The timing tower: one plate per player in race order. When places change, rows slide to their
 * new spot (FLIP), so overtakes are easy to follow from across the table.
 */
export function Standings({
  rows,
  laps,
}: {
  rows: StandingRow[];
  laps: number;
}) {
  const list = useRef<HTMLOListElement>(null);
  const tops = useRef(new Map<string, number>());

  useLayoutEffect(() => {
    const items =
      list.current?.querySelectorAll<HTMLLIElement>("[data-id]") ?? [];
    for (const li of items) {
      const id = li.dataset.id!;
      const top = li.offsetTop;
      const before = tops.current.get(id);
      tops.current.set(id, top);
      if (before === undefined || before === top) continue;
      li.animate(
        [{ transform: `translateY(${before - top}px)` }, { transform: "none" }],
        { duration: 450, easing: "cubic-bezier(.2,.8,.2,1)" },
      );
      if (before > top)
        li.animate([{ background: "#1f9e57" }, {}], { duration: 700 });
    }
  });

  const sorted = [...rows].sort((a, b) => a.place - b.place);
  return (
    <ol className="standings" ref={list}>
      {sorted.map((r) => (
        <li
          key={r.id}
          data-id={r.id}
          className="standing"
          style={playerStyle(r.color)}
        >
          <span className="standing-place">{r.place}</span>
          <span className="standing-plate">
            <PlayerShape slot={r.shape} />
          </span>
          <span className="standing-name">{r.name}</span>
          <span className="standing-lap">
            {r.finished ? "Finished" : `Lap ${Math.min(r.lap, laps)}/${laps}`}
          </span>
          <span className="standing-gap">{r.gap}</span>
        </li>
      ))}
    </ol>
  );
}
