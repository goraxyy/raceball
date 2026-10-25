import type { Ref } from "react";

/**
 * A small steering wheel that shows how far the player's phone is turned. It reads `--steer` (-1 … 1) and
 * `data-drift` (-1, 0, 1) off its own element, which the game sets every frame without a React render.
 */
export function SteerWheel({
  wheelRef,
  className,
}: {
  wheelRef?: Ref<HTMLSpanElement>;
  className?: string;
}) {
  return (
    <span
      ref={wheelRef}
      className={className ? `steer-wheel ${className}` : "steer-wheel"}
      data-drift="0"
      aria-hidden
    >
      <svg viewBox="-50 -50 100 100">
        <circle className="steer-rim" r="40" />
        <circle className="steer-hub" r="10" />
        <path className="steer-spokes" d="M-40 0H-10M10 0H40M0 10V40" />
        <rect
          className="steer-mark"
          x="-5"
          y="-48"
          width="10"
          height="16"
          rx="3"
        />
      </svg>
      <b className="steer-drift">Drift</b>
    </span>
  );
}
