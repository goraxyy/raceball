import type { GameEvent } from "@raceball/shared";
import { play } from "./audio";

// Sound + visual cue on the pad for each race event (no vibration: docs/CONTROLLER.md).
// The visuals are Nuris's: data-cue on .racing, and a .cue-text banner (apps/pad/screens.html).

const ordinal = (n: number) => {
  const teen = n % 100 >= 11 && n % 100 <= 13;
  return `${n}${teen ? "th" : ({ 1: "st", 2: "nd", 3: "rd" }[n % 10] ?? "th")}`;
};

/** Replay a cue (removing and re-adding data-cue restarts its CSS animation), with optional banner text */
function cue(racing: HTMLElement, name: string, text?: string) {
  racing.removeAttribute("data-cue");
  void racing.offsetWidth; // reflow, so the same cue can play twice in a row
  racing.dataset.cue = name;
  if (!text) return;
  const el = document.createElement("div");
  el.className = "cue-text";
  el.textContent = text;
  el.addEventListener("animationend", () => el.remove());
  racing.append(el);
}

/** Flash the place badge up or down after an overtake */
function placeChange(racing: HTMLElement, dir: "up" | "down") {
  const status = racing.querySelector<HTMLElement>(".status");
  if (!status) return;
  status.removeAttribute("data-change");
  void status.offsetWidth;
  status.dataset.change = dir;
}

/** The item button shows the held item (styled per item in style.css) and is live only while holding one */
function setItemButton(racing: HTMLElement, item: string) {
  const btn = racing.querySelector<HTMLButtonElement>(".item-btn");
  if (!btn) return;
  btn.dataset.item = item;
  btn.disabled = !item;
}

/** React to an event about our player (the server only sends us those) */
export function showEvent(evt: GameEvent, me: string, laps: number) {
  const racing = document.querySelector<HTMLElement>(".screen.racing");
  switch (evt.type) {
    case "bump":
      play("bump", 0.4 + 0.6 * evt.strength, 0.05);
      if (racing) cue(racing, "bump");
      break;
    case "item":
      play("itemPickup");
      if (racing) {
        cue(racing, "item");
        setItemButton(racing, evt.item);
      }
      break;
    case "fire":
      if (racing) setItemButton(racing, "");
      break;
    case "lap": {
      const final = evt.lap >= laps;
      play(final ? "finalLap" : "lap");
      if (!racing) break;
      cue(
        racing,
        final ? "finallap" : "lap",
        final ? "Final lap!" : `Lap ${evt.lap}/${laps}`,
      );
      racing.classList.toggle("final-lap", final);
      const lapEl = racing.querySelector(".status-lap");
      if (lapEl) lapEl.textContent = `Lap ${evt.lap}/${laps}`;
      break;
    }
    case "finish":
      play("finish");
      if (racing) cue(racing, "finish", ordinal(evt.place));
      break;
    case "respawn":
      play("fall");
      play("respawn", 1, 0, 0.35);
      break;
    case "overtake":
      if (racing) placeChange(racing, evt.player === me ? "up" : "down");
      break;
  }
}
