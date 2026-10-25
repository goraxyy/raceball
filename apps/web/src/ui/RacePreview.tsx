// Dev-only: a fake race on the real Happy Valley loop, to preview the big-screen overlay in /ui.
// Positions update at 10 Hz, like the feed Ali will expose.
import { useEffect, useState } from "react";
import {
  Countdown,
  FollowTile,
  Standings,
  TrackMap,
  type StandingRow,
} from ".";
import {
  PREVIEW_LABELS,
  PREVIEW_LENGTH,
  PREVIEW_PATH,
  pointAt,
} from "./happyValleyPreview";

const LAPS = 3;
const RACERS = [
  { id: "a", name: "Nuris", slot: 0, speed: 21.0, phoneOnly: false },
  { id: "b", name: "Ali", slot: 1, speed: 21.4, phoneOnly: false },
  { id: "c", name: "Rasim", slot: 2, speed: 20.6, phoneOnly: true },
  { id: "d", name: "Judge 1", slot: 3, speed: 20.2, phoneOnly: true },
  { id: "e", name: "Judge 2", slot: 4, speed: 19.8, phoneOnly: false },
  { id: "f", name: "Bot", slot: 5, speed: 20.9, phoneOnly: false },
];

export function RacePreview() {
  const [run, setRun] = useState(0);
  const [startAt, setStartAt] = useState(() => Date.now() + 3200);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 100);
    return () => clearInterval(id);
  }, []);

  const t = Math.max(0, (now - startAt) / 1000);
  const racers = RACERS.map((r, i) => {
    // a little wobble per racer, so places swap during the race
    const wobble = Math.sin(t * 0.5 + i * 1.7) * 6 + Math.sin(t * 0.21 + i) * 9;
    const dist = Math.min(
      r.speed * t + wobble * Math.min(1, t / 4) - i * 4,
      LAPS * PREVIEW_LENGTH,
    );
    const [x, z] = pointAt(Math.max(0, dist));
    return { ...r, dist, x, z };
  });
  const order = [...racers].sort((a, b) => b.dist - a.dist);
  const lead = order[0];
  const rows: StandingRow[] = order.map((r, i) => {
    const finished = r.dist >= LAPS * PREVIEW_LENGTH;
    return {
      id: r.id,
      place: i + 1,
      name: r.name,
      color: r.slot,
      shape: r.slot,
      lap: Math.floor(Math.max(0, r.dist) / PREVIEW_LENGTH) + 1,
      finished,
      gap:
        i === 0 ? "Leader" : `+${((lead.dist - r.dist) / r.speed).toFixed(1)}`,
    };
  });
  const place = (id: string) => rows.find((r) => r.id === id)!.place;

  return (
    <section className="race-preview">
      <div className="fake-3d" aria-hidden>
        <span>Ali's 3D race view goes here</span>
      </div>
      <div className="race-overlay">
        <div className="follow-tiles">
          {racers
            .filter((r) => r.phoneOnly)
            .map((r) => (
              <FollowTile
                key={r.id}
                name={r.name}
                color={r.slot}
                shape={r.slot}
                place={place(r.id)}
              >
                <div className="fake-cam" />
              </FollowTile>
            ))}
        </div>
        <Standings rows={rows} laps={LAPS} />
        <div className="map-card">
          <TrackMap
            path={PREVIEW_PATH}
            labels={PREVIEW_LABELS}
            players={racers.map((r) => ({
              id: r.id,
              x: r.x,
              z: r.z,
              color: r.slot,
              shape: r.slot,
            }))}
          />
        </div>
      </div>
      <Countdown key={run} endsAt={startAt} />
      <button
        type="button"
        className="btn btn-ghost race-restart"
        onClick={() => {
          setStartAt(Date.now() + 3200);
          setRun((n) => n + 1);
        }}
      >
        Restart
      </button>
    </section>
  );
}
