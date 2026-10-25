import { useEffect, useState } from "react";
import { useNetStats } from "./hooks";
import type { NetSession } from "./session";

const startsOpen = () =>
  new URLSearchParams(location.search).get("debug") === "1";

/** Frames per second, measured over each second */
function useFps() {
  const [fps, setFps] = useState(0);
  useEffect(() => {
    let frames = 0;
    let since = performance.now();
    let id = requestAnimationFrame(function tick(now) {
      frames++;
      if (now - since >= 1000) {
        setFps(Math.round((frames * 1000) / (now - since)));
        frames = 0;
        since = now;
      }
      id = requestAnimationFrame(tick);
    });
    return () => cancelAnimationFrame(id);
  }, []);
  return fps;
}

/**
 * Network debug panel for /host and /play. Toggle with the ~ key; open by default with ?debug=1.
 * Mount it once next to the game canvas: <NetHud session={session} />
 */
export function NetHud({ session }: { session: NetSession }) {
  const [open, setOpen] = useState(startsOpen);
  const stats = useNetStats(session);
  const fps = useFps();

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.code === "Backquote") setOpen((o) => !o);
    };
    addEventListener("keydown", onKey);
    return () => removeEventListener("keydown", onKey);
  }, []);

  if (!open) return null;
  const ms = (n: number) => `${Math.round(n)} ms`;
  const lines = [
    `room      ${session.code}`,
    `rtt       ${ms(stats.rtt)}  p50 ${ms(stats.p50)}  p95 ${ms(stats.p95)}`,
    `jitter    ${ms(stats.jitter)}`,
    `snapshots ${stats.snapRate ? `${Math.round(stats.snapRate)} Hz, delay ${ms(session.buffer.interpDelay)}` : "— (none yet)"}`,
    `input age ${stats.inputAge === undefined ? "—" : ms(stats.inputAge)}`,
    `fps       ${fps}`,
  ];
  return (
    <pre
      style={{
        position: "fixed",
        top: 0,
        right: 0,
        margin: 0,
        padding: "0.5rem",
        font: "12px/1.3 ui-monospace, Consolas, monospace",
        color: "#0f0",
        background: "rgb(0 0 0 / 0.7)",
        pointerEvents: "none",
        zIndex: 1000,
      }}
    >
      {lines.join("\n")}
    </pre>
  );
}
