// Pad screens, built with exactly the markup in apps/pad/screens.html (Nuris's markup contract).
// Behaviour lives in main.ts; these only return HTML.
import {
  ERROR_COPY,
  errorSignSvg,
  PLANETS,
  PLAYER_COLORS,
  PLAYER_SHAPES,
  type ErrorKind,
  type Planet,
  type PlayerShape,
  type PlayerView,
} from "@raceball/shared";
import {
  DEAD_ZONE_RANGE,
  SENSITIVITY_RANGE,
  type PadSettings,
} from "./settings";

/** How a player looks: their slot's color and shape, and their planet */
export interface Look {
  name: string;
  color: string;
  shape: PlayerShape;
  planet: Planet;
}

const escape = (s: string) =>
  s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

export function lookOf(player?: PlayerView): Look {
  const slot = player?.color ?? 0;
  const planet = PLANETS.find((p) => p === player?.ball) ?? PLANETS[slot];
  return {
    name: player?.name ?? "",
    color: PLAYER_COLORS[slot],
    shape: PLAYER_SHAPES[player?.shape ?? slot],
    planet,
  };
}

export const startHtml = () => `
  <section class="screen start">
    <div class="logo">Race<span>Ball</span></div>
    <div class="ball ball-roll" data-planet="saturn"></div>
    <button class="start-button" type="button">Tap to start</button>
    <ul class="hint-list">
      <li>Low Power Mode off</li>
      <li>Silent switch off</li>
      <li>iPhone: Portrait Lock on</li>
    </ul>
  </section>`;

/** An error as a road sign with one way out (copy and art: packages/shared/src/errors.ts) */
export const errorHtml = (kind: ErrorKind, room?: string, code?: number) => {
  const copy = ERROR_COPY[kind];
  const plate = [room && `Room ${escape(room)}`, code && `Code ${code}`]
    .filter(Boolean)
    .join(" · ");
  return `
  <section class="screen error-screen" data-kind="${kind}">
    <div class="error-body">
      ${errorSignSvg(kind)}
      <div class="error-text">
        ${plate ? `<span class="error-plate">${plate}</span>` : ""}
        <h1>${copy.title}</h1>
        <p>${copy.body.pad}</p>
        <div class="error-actions">
          <button class="btn" type="button">${copy.action.pad}</button>
        </div>
      </div>
    </div>
  </section>`;
};

export const CALIBRATE_TEXT = {
  1: { title: "Hold it like a wheel", hint: "Keep it level for a second." },
  2: {
    title: "Now turn right",
    hint: "Like steering into a corner, and hold it.",
    wrongWay: "That's left. Turn the other way.",
  },
} as const;

export const calibrateHtml = () => `
  <section class="screen calibrate" data-step="1">
    <div class="steps">
      <span class="step is-active">1</span><span class="step">2</span>
    </div>
    <div class="wheel"><div class="wheel-phone"></div></div>
    <h1>${CALIBRATE_TEXT[1].title}</h1>
    <p>${CALIBRATE_TEXT[1].hint}</p>
    <div class="meter">
      <div class="meter-fill" style="--progress: 0"></div>
    </div>
    <button class="btn btn-ghost flip-btn" type="button">
      Text upside down? Flip
    </button>
  </section>`;

/** Accessibility settings (built from Nuris's pieces: .field, .btn; no markup for it in screens.html yet) */
export const settingsHtml = (s: PadSettings) => `
  <section class="screen settings">
    <h1>Settings</h1>
    <label class="field">
      <span><input type="checkbox" name="autoGas"${s.autoGas ? " checked" : ""} /> Auto-gas: always on, hold left to brake</span>
    </label>
    <label class="field">
      Steering: full lock at <b class="value" data-for="sensitivityDeg">${s.sensitivityDeg}°</b>
      <input type="range" name="sensitivityDeg" min="${SENSITIVITY_RANGE.min}" max="${SENSITIVITY_RANGE.max}" step="5" value="${s.sensitivityDeg}" />
    </label>
    <label class="field">
      Dead zone: <b class="value" data-for="deadZone">${Math.round(s.deadZone * 100)}%</b>
      <input type="range" name="deadZone" min="${DEAD_ZONE_RANGE.min}" max="${DEAD_ZONE_RANGE.max}" step="0.01" value="${s.deadZone}" />
    </label>
    <button class="btn" type="button">Done</button>
  </section>`;

/** While the SDK reconnects a dropped connection */
export const connectionLostHtml = () => `
  <section class="screen connection-lost">
    <div class="spinner"></div>
    <h1>Reconnecting…</h1>
    <p>Hold on, you'll rejoin your spot in the race.</p>
  </section>`;

const titleCase = (s: string) => s[0].toUpperCase() + s.slice(1);

/** Phone-only players pick a name and planet. Taken planets are disabled */
export const pickerHtml = (
  room: string,
  look: Look,
  name: string,
  taken: Set<string>,
) => `
  <section class="screen picker" style="--player: ${look.color}">
    <span class="eyebrow">Room ${escape(room)}</span>
    <h1>Pick your planet</h1>
    <label class="field">
      Name
      <input type="text" maxlength="12" value="${escape(name)}" autocomplete="off" />
    </label>
    <div class="ball-grid" role="radiogroup">
      ${PLANETS.map(
        (p) => `<label class="ball-option">
        <input type="radio" name="ball" value="${p}"${p === look.planet ? " checked" : ""}${taken.has(p) ? " disabled" : ""} />
        <span class="ball" data-planet="${p}"></span>
        ${titleCase(p)}
      </label>`,
      ).join("")}
    </div>
    <button class="btn" type="button">Join race</button>
  </section>`;

export const readyHtml = (look: Look) => `
  <section class="screen ready" style="--player: ${look.color}">
    <div class="ball ball-roll" data-planet="${look.planet}"></div>
    <div class="ready-side">
      <span class="player-name">${escape(look.name)}</span>
      <button class="btn ready-btn" type="button">Ready</button>
      <button class="btn btn-ghost" type="button">Recalibrate</button>
      <button class="btn btn-ghost settings-btn" type="button">Settings</button>
      <p class="ready-status"></p>
    </div>
  </section>`;

export const racingHtml = (look: Look, laps: number) => `
  <section class="screen racing" style="--player: ${look.color}">
    <div class="zone zone-left">
      <span class="zone-label">Brake</span>
    </div>
    <div class="zone zone-right">
      <span class="zone-label">Gas</span>
    </div>
    <div class="hud">
      <header class="status">
        <span class="status-place"><b>–</b><small></small></span>
        <span class="shape" data-shape="${look.shape}"></span>
        <span class="status-lap">Lap 1/${laps}</span>
      </header>
      <div class="steer" style="--steer: 0">
        <span class="steer-dot"></span>
      </div>
      <button class="item-btn" type="button" data-item="" disabled>
        <span>No item</span>
      </button>
    </div>
    <div class="wrong-way" hidden>Wrong way</div>
    <div class="cue"></div>
  </section>`;
