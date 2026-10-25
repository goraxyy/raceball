import "./style.css";
import { ERROR_COPY, type ErrorKind } from "@raceball/shared";
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
import { flip, keepUpright } from "./orientation";
import {
  CALIBRATE_TEXT,
  calibrateHtml,
  lookOf,
  errorHtml,
  racingHtml,
  readyHtml,
  startHtml,
} from "./screens";
import { startFromTap } from "./start";
import { steering } from "./steering";
import { bindZones } from "./touch";

const app = document.querySelector<HTMLDivElement>("#app")!;

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
  showError("permission");
}

// ---------------------------------------------------------------- errors

/** An error screen. Its one button retries: back to start, copy the link, or reload. */
function showError(kind: ErrorKind, room?: string, code?: number) {
  const screen = show(errorHtml(kind, room, code));
  const button = screen.querySelector("button")!;
  button.addEventListener("click", async () => {
    if (kind === "permission") return showStart();
    if (kind === "unsupported") {
      await navigator.clipboard?.writeText(location.href).catch(() => {});
      button.textContent = "Copied";
      return;
    }
    location.reload();
  });
}

// ---------------------------------------------------------------- calibrate

function showCalibrate() {
  steering.calib = null;
  const screen = show(calibrateHtml());
  const [step1, step2] = screen.querySelectorAll<HTMLElement>(".step");
  const title = screen.querySelector("h1")!;
  const hint = screen.querySelector("p")!;
  const meter = screen.querySelector<HTMLElement>(".meter-fill")!;
  screen.querySelector(".flip-btn")!.addEventListener("click", flip);

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
    }
    if (cal.step === 2) {
      const text = cal.wrongWay
        ? CALIBRATE_TEXT[2].wrongWay
        : CALIBRATE_TEXT[2].hint;
      if (hint.textContent !== text) hint.textContent = text;
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
      return ERROR_COPY[s.kind].title;
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
  if (s.state === "error") return showError(s.kind, s.room, s.code);
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
  const screen = show(racingHtml(lookOf(myPlayer()), laps()));
  const unbindZones = bindZones(screen);
  const steerEl = screen.querySelector<HTMLElement>(".steer")!;
  everyFrame(() =>
    steerEl.style.setProperty("--steer", steering.read().toFixed(3)),
  );
  const stopFrames = stopScreen;
  stopScreen = () => {
    stopFrames();
    unbindZones();
  };
}

// ---------------------------------------------------------------- boot

lockDownGestures();
keepUpright(app);
// no motion API at all (an in-app browser, or a desktop): say so before asking for anything
if (typeof DeviceMotionEvent === "undefined") showError("unsupported");
else showStart();
if (debugEnabled) {
  mountDebugOverlay();
  void loadEruda();
}
