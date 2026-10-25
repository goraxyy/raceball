// Pad screens, built with exactly the markup in apps/pad/screens.html (Nuris's markup contract).
// Behaviour lives in main.ts; these only return HTML.
import {
  ERROR_COPY,
  errorSignSvg,
  PLANETS,
  PLAYER_COLORS,
  PLAYER_SHAPES,
  type ErrorKind,
  type ItemId,
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

/** Each item's name: the full one for the pickup banner, a short one for the item button */
export const ITEM_NAMES: Record<ItemId, { full: string; short: string }> = {
  boost: { full: "Blue & White Boost!", short: "Boost" },
  roar: { full: "Lion Roar!", short: "Roar" },
  spill: { full: "Creamery Spill!", short: "Spill" },
  snowday: { full: "Snow Day!", short: "Snow day" },
};

/**
 * Each item's symbol, drawn like the rest of the pad: chunky shapes with an ink outline, filled in white so they
 * read on the item's own color. 48 x 48 viewBox
 */
const ITEM_ICONS: Record<ItemId, string> = {
  // a lightning bolt: the Blue & White Boost
  boost: `<path d="M27 3 9 27h12l-4 18 22-27H26l5-15z" fill="#fff"/>`,
  // a paw and the roar coming off it: the Lion Roar
  roar: `<ellipse cx="19" cy="31" rx="9" ry="7.5" fill="#fff"/>
    <circle cx="9" cy="19" r="3.6" fill="#fff"/><circle cx="15" cy="12" r="3.6" fill="#fff"/>
    <circle cx="23" cy="12" r="3.6" fill="#fff"/><circle cx="29" cy="19" r="3.6" fill="#fff"/>
    <path d="M36 14c4 3 4 12 0 16M41 9c7 6 7 20 0 26" fill="none" stroke-linecap="round"/>`,
  // a scoop melting off its cone: the Creamery Spill
  spill: `<path d="M14 25l10 20 10-20z" fill="#F2B33D"/>
    <path d="M11 24c-3-9 4-17 13-17s16 8 13 17c-1 3-4 2-4 6s-3 4-3 0-3-5-6-5-5 2-6 6-3 3-3-1-3-4-4-6z" fill="#fff"/>`,
  // a snowflake: the Snow Day
  snowday: `<g fill="none" stroke-linecap="round">
      <path d="M24 4v40M7 14l34 20M7 34l34-20"/>
      <path d="M18 7l6 5 6-5M18 41l6-5 6 5M5 21l8 1 1-8M43 27l-8-1-1 8M5 27l8-1 1 8M43 21l-8 1-1-8"/>
    </g>`,
};

/** An item's symbol as an inline SVG */
export const itemIcon = (item: ItemId) =>
  `<svg class="item-icon" viewBox="0 0 48 48" aria-hidden="true" fill="none" stroke="#17151f" stroke-width="3" stroke-linejoin="round">${ITEM_ICONS[item]}</svg>`;

/** The item button's label: the held item's symbol, its name and how to fire it, or "No item" */
export const itemButtonHtml = (item: ItemId | "") =>
  item
    ? `<span>${itemIcon(item)}${ITEM_NAMES[item].short}<span class="shake-hint">shake!</span></span>`
    : "<span>No item</span>";

/** A race time as race programs print it: 1:04.3, or DNF */
export function raceTime(ms: number): string {
  if (!(ms > 0)) return "DNF";
  const m = Math.floor(ms / 60000);
  return `${m}:${((ms % 60000) / 1000).toFixed(1).padStart(4, "0")}`;
}

const ordinalSuffix = (n: number) =>
  n % 100 >= 11 && n % 100 <= 13
    ? "th"
    : ({ 1: "st", 2: "nd", 3: "rd" }[n % 10] ?? "th");

/** One row of the results board: everyone's place, plate, name and time */
export interface BoardRow {
  id: string;
  place: number;
  name: string;
  color: string;
  shape: string;
  finishedAt: number;
}

/**
 * After the race: your place (a checkered flag behind it if you won), your time, best lap and bumps, and the whole
 * field's final order underneath, your row picked out
 */
export const resultsHtml = (
  look: Look,
  me: {
    id: string;
    place: number;
    finishedAt: number;
    bestLap: number;
    bumps: number;
  },
  board: BoardRow[],
) => `
  <section class="screen results" data-place="${me.place}" style="--player: ${look.color}">
    <div class="results-main">
      <div class="place">${me.place || "–"}<small>${me.place ? ordinalSuffix(me.place) : ""}</small></div>
    </div>
    <div class="results-side">
      <div class="stats">
        <div class="stat"><b>${raceTime(me.finishedAt)}</b><span>Time</span></div>
        <div class="stat"><b>${me.bestLap > 0 ? raceTime(me.bestLap) : "–"}</b><span>Best lap</span></div>
        <div class="stat"><b>${me.bumps}</b><span>Bumps</span></div>
      </div>
      <ol class="board">
        ${board
          .map(
            (
              r,
            ) => `<li class="board-row${r.id === me.id ? " is-me" : ""}" style="--player: ${r.color}">
          <b class="board-place">${r.place || "–"}</b>
          <span class="shape" data-shape="${r.shape}"></span>
          <span class="board-name">${escape(r.name)}</span>
          <span class="board-time">${raceTime(r.finishedAt)}</span>
        </li>`,
          )
          .join("")}
      </ol>
      <p class="ready-status">Back to the lobby in a moment</p>
    </div>
  </section>`;

/** Creamery Scoops a racer can hold (game-core's tuning.scoopMax): one pip each on the pad */
export const SCOOP_MAX = 10;

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
        ${itemButtonHtml("")}
      </button>
      <div class="scoops" data-count="0" aria-label="0 stars">
        ${"<i></i>".repeat(SCOOP_MAX)}
      </div>
    </div>
    <div class="wrong-way" hidden>Wrong way</div>
    <div class="cue"></div>
  </section>`;
