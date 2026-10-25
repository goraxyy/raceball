import { useEffect, useState, type CSSProperties } from "react";
import { Logo } from "./pieces";

/** Tips shown while the map loads, one every few seconds */
const TIPS = [
  "Hold the phone sideways, like a steering wheel",
  "Right thumb is gas, left thumb is brake",
  "Shake the phone to fire your item",
  "Bump other planets to knock them off the line",
  "Fell off? You roll back from the last checkpoint",
  "Ice in the Arboretum: steer gently",
];
const TIP_MS = 4000;

/** Assets loading in the lobby: a planet rolls along a striped track as progress goes 0 to 1 */
export function LoadingScreen({
  progress,
  label,
}: {
  progress: number;
  label: string;
}) {
  const p = Math.min(1, Math.max(0, progress));
  const [tip, setTip] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setTip((t) => (t + 1) % TIPS.length), TIP_MS);
    return () => clearInterval(id);
  }, []);
  return (
    <section className="ui-screen loading-screen">
      <div className="logo">
        <Logo />
      </div>
      <div
        className="load-track"
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(p * 100)}
        aria-label={label}
        style={{ "--progress": p } as CSSProperties}
      >
        <span className="load-fill" />
        <span className="load-ball ball" data-planet="saturn" />
      </div>
      <p className="load-label">
        {label} <b>{Math.round(p * 100)}%</b>
      </p>
      <p className="load-tip" key={tip}>
        <span className="eyebrow">Tip</span> {TIPS[tip]}
      </p>
    </section>
  );
}
