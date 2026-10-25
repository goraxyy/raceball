// Dev-only: the results ceremony with a believable fake race, for /ui. Replay reruns the animation.
import { useState } from "react";
import { Results, type ResultRow } from ".";

const ROWS: ResultRow[] = [
  {
    id: "b",
    place: 1,
    name: "Ali",
    color: 1,
    shape: 1,
    ball: "mars",
    time: 186_420,
    bestLap: 61_180,
    bumps: 4,
    title: "Shrine Jumper",
  },
  {
    id: "a",
    place: 2,
    name: "Nuris",
    color: 0,
    shape: 0,
    ball: "earth",
    time: 188_870,
    bestLap: 60_940,
    bumps: 7,
  },
  {
    id: "c",
    place: 3,
    name: "Rasim",
    color: 2,
    shape: 2,
    ball: "saturn",
    time: 190_150,
    bestLap: 62_310,
    bumps: 11,
    title: "Creamery Victim",
  },
  {
    id: "d",
    place: 4,
    name: "Judge 1",
    color: 3,
    shape: 3,
    ball: "neptune",
    time: 193_600,
    bestLap: 63_020,
    bumps: 3,
  },
  {
    id: "e",
    place: 5,
    name: "Judge 2",
    color: 4,
    shape: 4,
    ball: "jupiter",
    time: 197_240,
    bestLap: 64_480,
    bumps: 5,
  },
  {
    id: "f",
    place: 6,
    name: "Bot",
    color: 5,
    shape: 5,
    ball: "uranus",
    time: null,
    bestLap: 66_900,
    bumps: 2,
  },
];

export function ResultsPreview() {
  const [run, setRun] = useState(0);
  const [lobbyAt, setLobbyAt] = useState(() => Date.now() + 15_000);
  return (
    <>
      <Results
        key={run}
        rows={ROWS}
        laps={3}
        lobbyAt={lobbyAt}
        onRematch={() => alert("Rematch")}
      />
      <button
        type="button"
        className="btn btn-ghost results-replay"
        onClick={() => {
          setRun((n) => n + 1);
          setLobbyAt(Date.now() + 15_000);
        }}
      >
        Replay
      </button>
    </>
  );
}
