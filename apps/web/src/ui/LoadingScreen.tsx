import type { CSSProperties } from "react";

/** Assets loading in the lobby: a planet rolls along a striped track as progress goes 0 to 1 */
export function LoadingScreen({
  progress,
  label,
}: {
  progress: number;
  label: string;
}) {
  const p = Math.min(1, Math.max(0, progress));
  return (
    <section className="ui-screen loading-screen">
      <div className="logo">
        Race<span>Ball</span>
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
    </section>
  );
}
