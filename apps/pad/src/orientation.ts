// Keeps the pad UI upright and fixed to the phone, whatever the browser did (docs/CONTROLLER.md):
// - Android: the start tap already locked landscape (start.ts).
// - iPhone with Portrait Lock on: the page never rotates, so we turn the UI 90° ourselves.
// - iPhone with Portrait Lock off: the browser rotates; we turn by whatever it didn't.

/** Which way up the player holds the phone: the UI rotation (deg) relative to the phone. null = upright portrait */
export type HoldSide = 90 | -90 | null;

/** Gravity along an axis above this (m/s²) means the phone is clearly turned that way */
const CLEAR = 7;
/** Sideways gravity below this (m/s², about 9°) counts as held upright in portrait */
const UPRIGHT = 1.5;
/** iOS reports accelerationIncludingGravity pointing down, Android pointing up */
const PLATFORM_SIGN = /iPhone|iPad|iPod/.test(navigator.userAgent) ? -1 : 1;
const SIGN_KEY = "raceball:sensorFlipped";

/**
 * Next hold side from "up" in the device frame (+x = right edge, +y = top edge).
 * Only switches when the phone is clearly turned, so steering hard never flips the UI.
 */
export function nextSide(prev: HoldSide, upX: number, upY: number): HoldSide {
  if (Math.abs(upX) > CLEAR) return upX > 0 ? 90 : -90;
  if (upY > CLEAR && Math.abs(upX) < UPRIGHT) return null; // held upright, like on the start screen
  return prev;
}

/** Normalize to -180 < a <= 180 */
const norm = (a: number) => {
  const r = ((a % 360) + 360) % 360;
  return r > 180 ? r - 360 : r;
};

/** The rotation (deg) still needed after the browser's own rotation (screenAngle) */
export function uiRotation(side: HoldSide, screenAngle: number): number {
  return side === null ? 0 : norm(side - screenAngle);
}

/**
 * When the browser auto-rotated to landscape and we computed the exact opposite side, our
 * sensor sign is wrong for this phone. Returns true if the sign should be flipped.
 */
export function signLooksWrong(side: HoldSide, screenAngle: number): boolean {
  const browser = norm(screenAngle);
  return (
    side !== null && Math.abs(browser) === 90 && norm(side - browser) === 180
  );
}

function screenAngle(): number {
  // window.orientation is the legacy iOS fallback, missing from the DOM typings
  return (
    screen.orientation?.angle ??
    Number((window as unknown as { orientation?: number }).orientation ?? 0)
  );
}

function loadFlipped(): boolean {
  try {
    return localStorage.getItem(SIGN_KEY) === "1";
  } catch {
    return false;
  }
}

function saveFlipped(flipped: boolean) {
  try {
    localStorage.setItem(SIGN_KEY, flipped ? "1" : "");
  } catch {
    // not saved
  }
}

/** Live state, also shown on the debug overlay */
export const orientation = {
  side: null as HoldSide,
  /** Sensor sign corrected by Flip, or automatically when the browser shows we guessed wrong */
  flipped: loadFlipped(),
  rotation: 0,
};

let ui: HTMLElement | undefined;

function layout() {
  if (!ui) return;
  const rot = uiRotation(orientation.side, screenAngle());
  orientation.rotation = rot;
  const sideways = Math.abs(rot) === 90;
  ui.style.width = sideways ? `${innerHeight}px` : "";
  ui.style.height = sideways ? `${innerWidth}px` : "";
  ui.style.transform = rot ? `translate(-50%, -50%) rotate(${rot}deg)` : "";
}

/** Feed filtered gravity (device frame). Cheap: only re-lays out when something changed */
export function updateOrientation(gx: number, gy: number) {
  const sign = PLATFORM_SIGN * (orientation.flipped ? -1 : 1);
  const side = nextSide(orientation.side, sign * gx, sign * gy);
  if (signLooksWrong(side, screenAngle())) {
    // The browser rotated the page itself, so it knows which way is up: trust it
    orientation.flipped = !orientation.flipped;
    saveFlipped(orientation.flipped);
    orientation.side = side === null ? null : side === 90 ? -90 : 90;
    return layout();
  }
  if (side !== orientation.side) {
    orientation.side = side;
    layout();
  }
}

/** The Flip button: the text came out upside down, so our sensor sign is wrong */
export function flip() {
  orientation.flipped = !orientation.flipped;
  saveFlipped(orientation.flipped);
  if (orientation.side !== null)
    orientation.side = orientation.side === 90 ? -90 : 90;
  layout();
}

/** Start keeping `el` (#app) upright. Re-lays out whenever the browser rotates or resizes */
export function keepUpright(el: HTMLElement) {
  ui = el;
  addEventListener("resize", layout);
  screen.orientation?.addEventListener?.("change", layout);
  layout();
}
