import "./style.css";
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
    if (await startFromTap()) showReady();
    else showPermissionHelp();
  });
}

function showReady() {
  app.innerHTML = `
    <section class="screen ready">
      <h1>Motion is on</h1>
      <p>Calibration and pairing come next.</p>
    </section>
  `;
}

function showPermissionHelp() {
  app.innerHTML = `
    <section class="screen permission-help">
      <h1>Motion access is off</h1>
      <p>RaceBall needs motion to steer. Close Safari completely, reopen this page, and tap Allow.</p>
      <button class="start-button" type="button">Try again</button>
    </section>
  `;
  app.querySelector("button")!.addEventListener("click", showStart);
}

showStart();
