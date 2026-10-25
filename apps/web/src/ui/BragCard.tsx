import { Logo, PlanetBall, PlayerShape, playerStyle } from "./pieces";
import { formatTime, type ResultRow } from "./Results";

export interface BragCardProps {
  /** This player's row from the results */
  row: ResultRow;
  /** Players in the race */
  total: number;
  laps: number;
  /** Top speed in km/h, if the game tracked it */
  topSpeed?: number;
  /** The race date shown on the card; defaults to today */
  date?: Date;
}

const suffix = (n: number) => ({ 1: "st", 2: "nd", 3: "rd" })[n] ?? "th";

/**
 * One player's race, as a collectible card: place, planet, the numbers worth bragging about and
 * their brag title. Sized like a phone screen so it is easy to screenshot and share.
 */
export function BragCard({
  row,
  total,
  laps,
  topSpeed,
  date = new Date(),
}: BragCardProps) {
  const finished = row.time != null;
  const stats: [string, string][] = [
    ["Time", formatTime(row.time)],
    ["Best lap", formatTime(row.bestLap)],
    ["Top speed", topSpeed != null ? `${Math.round(topSpeed)} km/h` : "–"],
    ["Bumps", String(row.bumps)],
  ];
  return (
    <article
      className={
        row.place === 1 && finished ? "brag-card is-winner" : "brag-card"
      }
      style={playerStyle(row.color)}
      aria-label={`${row.name}: ${finished ? `${row.place}${suffix(row.place)} of ${total}` : "did not finish"}`}
    >
      <header className="brag-head">
        <span className="brag-event">Happy Valley Grand Prix</span>
        <span className="brag-date">
          {date.toLocaleDateString("en-US", { month: "short", day: "numeric" })}{" "}
          · {laps} {laps === 1 ? "lap" : "laps"}
        </span>
      </header>

      <div className="brag-hero">
        <div className="brag-place">
          <span className={finished ? "brag-num" : "brag-num is-dnf"}>
            {finished ? (
              <>
                {row.place}
                <sup>{suffix(row.place)}</sup>
              </>
            ) : (
              "DNF"
            )}
          </span>
          <span className="brag-of">of {total}</span>
        </div>
        <PlanetBall planet={row.ball} slot={row.color} size={104} />
      </div>

      <h2 className="brag-name">
        <PlayerShape slot={row.shape} />
        {row.name}
      </h2>
      {row.title && <p className="brag-title">{row.title}</p>}

      <dl className="brag-stats">
        {stats.map(([k, v]) => (
          <div key={k}>
            <dt>{k}</dt>
            <dd>{v}</dd>
          </div>
        ))}
      </dl>

      <footer className="brag-foot">
        <Logo />
      </footer>
    </article>
  );
}
