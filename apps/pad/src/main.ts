import "./style.css";
import { Calibrator, loadCalibration, saveCalibration } from "./calibrate";
import {
  connect,
  laps,
  myPlayer,
  status,
  type ConnectionStatus,
} from "./connection";
import { debugEnabled, loadEruda, mountDebugOverlay } from "./debug";
import { lockDownGestures } from "./lockdown";
import {
  CALIBRATE_TEXT,
  calibrateHtml,
  lookOf,
  permissionHelpHtml,
  racingHtml,
  readyHtml,
  startHtml,
} from "./screens";
import { startFromTap } from "./start";
import { steering } from "./steering";

const app = document.querySelector<HTMLDivElement>("#app")!;
const FLIP_KEY = "raceball:flipped";

/** Cancels the current screen's animation loop when the next screen shows */
let stopScreen = () => {};

function show(html: string): HTMLElement {
  stopScreen();
  stopScreen = () => {};
  app.innerHTML = html;
  return app.querySelector<HTMLElement>(".screen")!;
}

/** Run `fn` every frame until the screen changes */
function everyFrame(fn: () => void) {
  let id = requestAnimationFrame(function tick() {
    fn();
    id = requestAnimationFrame(tick);
  });
  stopScreen = () => cancelAnimationFrame(id);
}

// ---------------------------------------------------------------- start

function showStart() {
  const screen = show(startHtml());
  screen.querySelector("button")!.addEventListener("click", async () => {
    if (!(await startFromTap())) return showPermissionHelp();
    void connect(onStatus);
    const saved = loadCalibration();
    if (saved) {
      steering.calib = saved;
      showReady();
    } else {
      showCalibrate();
    }
  });
}

function showPermissionHelp() {
  const screen = show(permissionHelpHtml());
  screen.querySelector("button")!.addEventListener("click", showStart);
}

// ---------------------------------------------------------------- calibrate

/** Turns the whole UI 180° when the text came out upside down */
function applyFlip(flipped: boolean) {
  app.style.transform = flipped ? "translate(-50%, -50%) rotate(180deg)" : "";
  try {
    localStorage.setItem(FLIP_KEY, flipped ? "1" : "");
  } catch {
    // not saved
  }
}

function savedFlip() {
  try {
    return localStorage.getItem(FLIP_KEY) === "1";
  } catch {
    return false;
  }
}

function showCalibrate() {
  steering.calib = null;
  const screen = show(calibrateHtml());
  const [step1, step2] = screen.querySelectorAll<HTMLElement>(".step");
  const title = screen.querySelector("h1")!;
  const hint = screen.querySelector("p")!;
  const meter = screen.querySelector<HTMLElement>(".meter-fill")!;
  screen.querySelector(".flip-btn")!.addEventListener("click", () => {
    applyFlip(!app.style.transform);
  });

  const cal = new Calibrator();
  everyFrame(() => {
    const done = cal.feed(
      steering.angle,
      Math.hypot(steering.gx, steering.gy),
      performance.now(),
    );
    if (done) {
      steering.calib = done;
      saveCalibration(done);
      return showReady();
    }
    if (screen.dataset.step !== String(cal.step)) {
      screen.dataset.step = String(cal.step);
      step1.className = "step is-done";
      step2.className = "step is-active";
      title.textContent = CALIBRATE_TEXT[2].title;
      hint.textContent = CALIBRATE_TEXT[2].hint;
    }
    meter.style.setProperty("--progress", cal.progress.toFixed(3));
  });
}

// ---------------------------------------------------------------- ready

const STATUS_TEXT = (s: ConnectionStatus) => {
  switch (s.state) {
    case "offline":
      return "No race yet: scan the QR code on the big screen or your laptop.";
    case "connecting":
      return `Joining race ${s.room}…`;
    case "joined":
      return s.phoneOnly
        ? `In race ${s.room}. Watch the big screen!`
        : `Paired with your laptop in race ${s.room}.`;
    case "error":
      return s.message;
  }
};

function showReady() {
  const screen = show(readyHtml(lookOf(myPlayer())));
  const [readyBtn, recalibrateBtn] =
    screen.querySelectorAll<HTMLButtonElement>("button");
  // Ready is sent to the server with the lobby flow (M2); for now it goes straight to racing
  readyBtn.addEventListener("click", showRacing);
  recalibrateBtn.addEventListener("click", showCalibrate);
  onStatus(status);
}

/** Connection changes: refresh the ready screen's text and the player's look */
function onStatus(s: ConnectionStatus) {
  const screen = app.querySelector<HTMLElement>(".screen.ready");
  if (!screen) return;
  const look = lookOf(myPlayer());
  screen.style.setProperty("--player", look.color);
  screen.querySelector(".player-name")!.textContent = look.name;
  screen.querySelector(".ball")!.setAttribute("data-planet", look.planet);
  screen.querySelector(".ready-status")!.textContent = STATUS_TEXT(s);
}

// ---------------------------------------------------------------- racing

function showRacing() {
  show(racingHtml(lookOf(myPlayer()), laps()));
}

// ---------------------------------------------------------------- boot

lockDownGestures();
applyFlip(savedFlip());
showStart();
if (debugEnabled) {
  mountDebugOverlay();
  void loadEruda();
}
