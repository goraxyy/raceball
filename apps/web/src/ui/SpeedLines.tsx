import { useState, type CSSProperties } from "react";

const LINES = 40;
/** Below this share of top speed there are no lines at all */
const FROM = 0.55;

/**
 * Comic-book speed lines over the laptop chase camera: white streaks rushing in from the screen
 * edges. They appear above 55% of top speed and thicken toward full speed (and during a boost).
 * The middle of the screen stays clear. Screen-space, so they cost nothing in the 3D scene.
 */
export function SpeedLines({ intensity }: { intensity: number }) {
  // fixed per mount: angle, length, timing and thickness of each streak
  const [lines] = useState(() =>
    Array.from({ length: LINES }, (_, i) => ({
      angle: (i / LINES) * 360 + ((i * 47) % 9) - 4,
      length: 9 + ((i * 31) % 10),
      delay: ((i * 53) % 100) / 100,
      width: 2 + ((i * 17) % 3),
      share: ((i * 61) % LINES) / LINES, // which lines join first as speed rises
    })),
  );
  const k = Math.max(0, Math.min(1, (intensity - FROM) / (1 - FROM)));
  if (k <= 0) return null;
  return (
    <div
      className="speed-lines"
      aria-hidden
      style={{ "--k": k } as CSSProperties}
    >
      {lines
        .filter((l) => l.share < 0.25 + 0.75 * k)
        .map((l, i) => (
          <span
            key={i}
            style={
              {
                "--a": `${l.angle}deg`,
                "--len": `${l.length}vmax`,
                "--w": `${l.width}px`,
                animationDelay: `${-l.delay * 0.45}s`,
              } as CSSProperties
            }
          />
        ))}
    </div>
  );
}
