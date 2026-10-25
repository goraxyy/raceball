import "./style.css";
import { connect, type ConnectionStatus } from "./connection";
import { debugEnabled, loadEruda, mountDebugOverlay } from "./debug";
import { lockDownGestures } from "./lockdown";
import { startFromTap } from "./start";

const app = document.querySelector<HTMLDivElement>("#app")!;

function showStart() {
  app.innerHTML = `
    <section class="screen start">
      <h1>RaceBall</h1>
      <button class="start-button" type="button">Tap to start</button>
    </section>
  `;
  app.querySelector("button")!.addEventListener("click", async () => {
    if (!(await startFromTap())) return showPermissionHelp();
    showReady();
    void connect(showStatus);
  });
}

function showReady() {
  app.innerHTML = `
    <section class="screen ready">
      <h1>Motion is on</h1>
      <p class="status"></p>
    </section>
  `;
}

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

function showStatus(s: ConnectionStatus) {
  const el = app.querySelector<HTMLParagraphElement>(".status");
  if (el) el.textContent = STATUS_TEXT(s);
}

function showPermissionHelp() {
  app.innerHTML = `
    <section class="screen permission-help">
      <h1>Motion access is off</h1>
      <p>RaceBall needs motion to steer. On iPhone, close Safari completely, reopen this page and tap Allow.
      On Android, allow "Motion sensors" in the site settings.</p>
      <button class="start-button" type="button">Try again</button>
    </section>
  `;
  app.querySelector("button")!.addEventListener("click", showStart);
}

lockDownGestures();
showStart();
if (debugEnabled) {
  mountDebugOverlay();
  void loadEruda();
}
