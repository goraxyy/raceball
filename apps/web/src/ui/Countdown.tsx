import { useEffect, useState } from "react";

/** How long "Go!" stays up after the countdown ends, ms */
const GO_MS = 900;

export interface CountdownProps {
  /** Server time in ms when the race starts (countdownEndsAt in the race state) */
  endsAt: number;
  /** Current server time, ms. Pass the net session's clock.serverNow; defaults to Date.now */
  now?: () => number;
}

/**
 * The big 3, 2, 1, Go! over the big screen, matching the phone's countdown colors.
 * Driven by server time, so every screen flips at the same moment.
 */
export function Countdown({ endsAt, now = Date.now }: CountdownProps) {
  const [left, setLeft] = useState(() => endsAt - now());

  useEffect(() => {
    let frame = 0;
    const tick = () => {
      const ms = endsAt - now();
      setLeft(ms);
      if (ms > -GO_MS) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [endsAt, now]);

  if (left <= -GO_MS || left > 3000) return null;
  const count = left > 0 ? String(Math.ceil(left / 1000)) : "go";
  return (
    <div className="countdown-overlay" data-count={count} aria-live="assertive">
      {/* key restarts the pop animation on every new number */}
      <span key={count} className="countdown-number">
        {count === "go" ? "Go!" : count}
      </span>
    </div>
  );
}
