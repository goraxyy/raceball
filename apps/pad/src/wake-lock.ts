let sentinel: WakeLockSentinel | null = null;
let wanted = false;

async function acquire() {
  try {
    sentinel = (await navigator.wakeLock?.request("screen")) ?? null;
  } catch {
    sentinel = null; // denied, or Low Power Mode
  }
}

/** Keep the screen on. Must first be called inside a tap. Re-acquired when the page comes back. */
export async function keepScreenOn() {
  wanted = true;
  await acquire();
}

// The browser drops the lock whenever the page is hidden (lock screen, app switch)
document.addEventListener("visibilitychange", () => {
  if (wanted && document.visibilityState === "visible") void acquire();
});

export const wakeLockActive = () => sentinel !== null && !sentinel.released;
