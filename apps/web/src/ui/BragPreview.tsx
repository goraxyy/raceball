// Dev-only: brag cards for a winner, a mid-pack finisher and a DNF, for /ui.
import { BragCard, type ResultRow } from ".";

const CARDS: { row: ResultRow; topSpeed?: number }[] = [
  {
    row: {
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
    topSpeed: 41.6,
  },
  {
    row: {
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
    topSpeed: 38.2,
  },
  {
    row: {
      id: "d",
      place: 6,
      name: "Judge",
      color: 3,
      shape: 3,
      ball: "neptune",
      time: null,
      bestLap: null,
      bumps: 2,
    },
  },
];

export function BragPreview() {
  return (
    <section className="ui-screen brag-preview">
      {CARDS.map(({ row, topSpeed }) => (
        <BragCard
          key={row.id}
          row={row}
          total={6}
          laps={3}
          topSpeed={topSpeed}
        />
      ))}
    </section>
  );
}
