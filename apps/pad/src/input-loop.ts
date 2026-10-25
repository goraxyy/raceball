import type { Room } from "@colyseus/sdk";
import type { InputMsg } from "@raceball/shared";
import { steering } from "./steering";

/** Send rate: 60 Hz */
const SEND_MS = 16;

let seq = 0;
let timer: ReturnType<typeof setInterval> | undefined;
let target: Room | undefined;

/** Inputs sent so far (the debug overlay turns this into a rate) */
export let sentCount = 0;

// Gas, brake and item come with the touch zones and shake detection (M1 calibration task)
const current = (): InputMsg => ({
  seq: ++seq,
  steer: steering.read(),
  gas: 0,
  brake: false,
  item: false,
});

const neutral = (): InputMsg => ({
  seq: ++seq,
  steer: 0,
  gas: 0,
  brake: false,
  item: false,
});

function send(msg: InputMsg) {
  target?.send("input", msg);
  sentCount++;
}

function start() {
  stop();
  timer = setInterval(() => send(current()), SEND_MS);
}

function stop() {
  if (timer !== undefined) clearInterval(timer);
  timer = undefined;
}

/** Send input to the room every 16 ms, pausing (after a neutral input) while the page is hidden */
export function startInputLoop(room: Room) {
  target = room;
  start();
}

/** Call immediately when gas, brake or item changes, instead of waiting for the next tick */
export function sendNow() {
  if (timer !== undefined) send(current());
}

document.addEventListener("visibilitychange", () => {
  if (!target) return;
  if (document.visibilityState === "hidden") {
    send(neutral()); // a locked phone must not keep driving
    stop();
  } else {
    start();
  }
});
