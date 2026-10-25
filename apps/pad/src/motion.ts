import { updateOrientation } from "./orientation";
import { fireItem } from "./input-loop";
import { ShakeDetector } from "./shake";
import { steering } from "./steering";

const shake = new ShakeDetector();

export type MotionPermission =
  "unknown" | "granted" | "denied" | "not-required";

/** Latest gravity in the device's own frame (m/s²). Steering reads this. */
export const gravity = { x: 0, y: 0, z: 0, at: 0, events: 0 };

export let permission: MotionPermission = "unknown";

/** iOS 13+ only grants motion inside a tap, on HTTPS. Android needs no prompt. */
export async function requestMotionPermission(): Promise<MotionPermission> {
  // requestPermission is iOS-only and missing from the DOM typings
  const DME = DeviceMotionEvent as unknown as {
    requestPermission?: () => Promise<"granted" | "denied">;
  };
  if (!DME.requestPermission) {
    permission = "not-required";
  } else {
    try {
      permission = await DME.requestPermission();
    } catch {
      permission = "denied";
    }
  }
  return permission;
}

export function startMotion() {
  addEventListener("devicemotion", (e) => {
    const g = e.accelerationIncludingGravity;
    if (g?.x == null || g.y == null || g.z == null) return;
    gravity.x = g.x;
    gravity.y = g.y;
    gravity.z = g.z;
    gravity.at = performance.now();
    gravity.events++;
    steering.update(g.x, g.y, e.timeStamp / 1000);
    updateOrientation(steering.gx, steering.gy);
    const a = e.acceleration;
    const linear =
      a?.x == null || a.y == null || a.z == null
        ? null
        : { x: a.x, y: a.y, z: a.z };
    if (shake.feed(linear, { x: g.x, y: g.y, z: g.z }, performance.now()))
      fireItem();
  });
}
