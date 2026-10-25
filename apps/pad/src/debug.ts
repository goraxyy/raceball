import { status } from "./connection";
import { gravity, permission } from "./motion";
import { steering } from "./steering";
import { wakeLockActive } from "./wake-lock";

export const debugEnabled =
  new URLSearchParams(location.search).get("debug") === "1";

const fmt = (n: number) => n.toFixed(2).padStart(6);

function screenAngle(): number {
  // window.orientation is the legacy iOS fallback, missing from the DOM typings
  return (
    screen.orientation?.angle ??
    Number((window as unknown as { orientation?: number }).orientation ?? 0)
  );
}

/** Fixed overlay with live sensor values. Steer, RTT and calibration fill in during M1. */
export function mountDebugOverlay() {
  const el = document.createElement("pre");
  el.className = "debug-overlay";
  document.body.append(el);

  let lastEvents = 0;
  let lastRateAt = performance.now();
  let rate = 0;

  const render = (now: number) => {
    if (now - lastRateAt >= 1000) {
      rate = ((gravity.events - lastEvents) * 1000) / (now - lastRateAt);
      lastEvents = gravity.events;
      lastRateAt = now;
    }
    const age = gravity.at ? `${Math.round(now - gravity.at)} ms` : "no data";
    el.textContent = [
      `gravity x ${fmt(gravity.x)}`,
      `        y ${fmt(gravity.y)}`,
      `        z ${fmt(gravity.z)}`,
      `motion    ${Math.round(rate)} Hz, last ${age}`,
      `permission ${permission}`,
      `screen    ${screenAngle()}°`,
      `wake lock ${wakeLockActive() ? "on" : "off"}`,
      `angle     ${fmt((steering.angle * 180) / Math.PI)}°`,
      `steer     ${steering.calib ? fmt(steering.read()) : "— (not calibrated)"}`,
      `net       ${status.state}${"playerId" in status ? " " + status.playerId : ""}`,
      `rtt       —`,
      `hold side —`,
      `calib     —`,
    ].join("\n");
    requestAnimationFrame(render);
  };
  requestAnimationFrame(render);
}

/** In-page console for phones without a cable. Lazy-loaded so normal players never download it. */
export async function loadEruda() {
  const { default: eruda } = await import("eruda");
  eruda.init();
}
