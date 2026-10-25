import type { CSSProperties } from "react";
import { PLANETS } from "@raceball/shared";
import { Logo, PlanetBall } from "./pieces";

export interface TitleScreenProps {
  /** Where "Host a race" goes (the big screen) */
  hostHref: string;
  /** Where "Join from a laptop" goes */
  joinHref: string;
  /** Optional "Practice solo" link (local mode) */
  practiceHref?: string;
}

/**
 * The first thing a judge sees on the big screen: the logo, the eight planets racing along a
 * striped kerb, and two big ways in. Phones don't need it; they join from the lobby QR.
 */
export function TitleScreen({
  hostHref,
  joinHref,
  practiceHref,
}: TitleScreenProps) {
  return (
    <section className="ui-screen title-screen">
      <div className="title-hero">
        <span className="eyebrow">The Happy Valley Grand Prix</span>
        <h1 className="title-logo">
          <Logo />
        </h1>
        <p className="title-tag">
          Tilt your phone to steer a planet around campus.{" "}
          <b>Bump your friends off the podium.</b>
        </p>
      </div>

      <div className="title-parade" aria-hidden>
        {PLANETS.map((planet, i) => (
          <span
            key={planet}
            className="title-runner"
            style={{ "--i": i } as CSSProperties}
          >
            <PlanetBall planet={planet} slot={i} size={72} rolling />
          </span>
        ))}
      </div>

      <nav className="title-actions" aria-label="Start">
        <a className="btn" href={hostHref}>
          Host a race
        </a>
        <a className="btn btn-ghost" href={joinHref}>
          Join from a laptop
        </a>
      </nav>

      <footer className="title-foot">
        <span className="title-fact">Up to 8 players</span>
        <span className="title-fact">Phones join by QR</span>
        <span className="title-fact">No app to install</span>
        {practiceHref && (
          <a className="title-practice" href={practiceHref}>
            Practice solo
          </a>
        )}
      </footer>
    </section>
  );
}
