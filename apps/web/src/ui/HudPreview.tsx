// Dev-only: the laptop player's HUD over a stand-in chase camera, with controls, for /ui.
import { useEffect, useState } from "react";
import type { ItemId } from "@raceball/shared";
import { RaceHud } from ".";

const ITEMS: (ItemId | null)[] = [null, "boost", "roar", "spill", "snowday"];

export function HudPreview() {
  const [t, setT] = useState(0);
  const [place, setPlace] = useState(2);
  const [lap, setLap] = useState(1);
  const [item, setItem] = useState(1);
  const [wrongWay, setWrongWay] = useState(false);

  useEffect(() => {
    const id = setInterval(() => setT((n) => n + 0.05), 50);
    return () => clearInterval(id);
  }, []);

  // speed swings between a crawl and top speed, so the gauge can be checked end to end
  const speed = 20 + Math.sin(t * 0.8) * 19;

  return (
    <section className="race-preview">
      <div className="fake-3d" aria-hidden>
        <span>Ali's chase camera goes here</span>
      </div>
      <RaceHud
        place={place}
        lap={lap}
        laps={3}
        item={ITEMS[item]}
        speed={speed}
        wrongWay={wrongWay}
        color={1}
        shape={1}
        total={6}
      />
      <div className="hud-controls">
        <button
          type="button"
          onClick={() => setPlace((p) => Math.max(1, p - 1))}
        >
          Gain place
        </button>
        <button
          type="button"
          onClick={() => setPlace((p) => Math.min(6, p + 1))}
        >
          Lose place
        </button>
        <button type="button" onClick={() => setLap((l) => (l % 3) + 1)}>
          Next lap
        </button>
        <button
          type="button"
          onClick={() => setItem((i) => (i + 1) % ITEMS.length)}
        >
          Cycle item
        </button>
        <button type="button" onClick={() => setWrongWay((w) => !w)}>
          Wrong way
        </button>
      </div>
    </section>
  );
}
