import { requestMotionPermission, startMotion } from "./motion";
import { unlockAudio } from "./audio";
import { keepScreenOn } from "./wake-lock";

/** Everything browsers only allow inside a tap. Returns false if motion was denied. */
export async function startFromTap(): Promise<boolean> {
  unlockAudio(); // first, while we're still inside the tap
  if ((await requestMotionPermission()) === "denied") return false;
  startMotion();

  // Android Chrome: real landscape lock (needs fullscreen first).
  // iPhone Safari has neither API; the self-rotated UI handles it in M1.
  try {
    await document.documentElement.requestFullscreen?.();
    // lock() is missing from the DOM typings
    await (
      screen.orientation as unknown as { lock?: (o: string) => Promise<void> }
    ).lock?.("landscape");
  } catch {
    // not supported here
  }
  await keepScreenOn();
  return true;
}
