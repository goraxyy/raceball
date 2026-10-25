import { controls, sendNow } from "./input-loop";

/**
 * Hold-to-gas on the right half, brake on the left (the .zone-right / .zone-left divs).
 * Each zone tracks its own pointers, so both thumbs work at once. The zones sit inside the
 * rotated UI, so "right half" follows the phone as the player holds it.
 * Returns a function that unbinds and releases both.
 */
export function bindZones(screen: HTMLElement): () => void {
  const gasZone = screen.querySelector<HTMLElement>(".zone-right")!;
  const brakeZone = screen.querySelector<HTMLElement>(".zone-left")!;
  const unbinders = [
    bindZone(gasZone, (down) => (controls.gas = down ? 1 : 0)),
    bindZone(brakeZone, (down) => (controls.brake = down)),
  ];
  return () => {
    unbinders.forEach((unbind) => unbind());
    controls.gas = 0;
    controls.brake = false;
  };
}

function bindZone(zone: HTMLElement, set: (down: boolean) => void) {
  const pointers = new Set<number>();
  const update = () => {
    const down = pointers.size > 0;
    if (zone.classList.contains("is-down") === down) return;
    zone.classList.toggle("is-down", down);
    set(down);
    sendNow(); // don't wait up to 16 ms for the next tick
  };
  const press = (e: PointerEvent) => {
    pointers.add(e.pointerId);
    update();
  };
  const release = (e: PointerEvent) => {
    pointers.delete(e.pointerId);
    update();
  };
  zone.addEventListener("pointerdown", press);
  for (const type of ["pointerup", "pointercancel", "pointerleave"] as const) {
    zone.addEventListener(type, release);
  }
  return () => {
    zone.removeEventListener("pointerdown", press);
    for (const type of [
      "pointerup",
      "pointercancel",
      "pointerleave",
    ] as const) {
      zone.removeEventListener(type, release);
    }
    pointers.clear();
    update();
  };
}
