// Accessibility settings (docs/team/rasim-platform.md#m3-hardening), saved on the phone.

export interface PadSettings {
  /** Gas is always on; holding brake stops it */
  autoGas: boolean;
  /** Phone rotation for full lock, degrees: 30 = twitchy, 60 = relaxed */
  sensitivityDeg: number;
  /** Share of full lock ignored around center, 0–0.2 */
  deadZone: number;
}

export const SENSITIVITY_RANGE = { min: 30, max: 60 } as const;
export const DEAD_ZONE_RANGE = { min: 0, max: 0.2 } as const;

export const DEFAULT_SETTINGS: Readonly<PadSettings> = {
  autoGas: false,
  sensitivityDeg: 45,
  deadZone: 0.05,
};

const KEY = "raceball:settings";

const clamp = (x: number, lo: number, hi: number) =>
  Math.min(hi, Math.max(lo, x));

/** Keep whatever is valid from a saved (or hand-edited) value, defaults for the rest */
export function sanitize(raw: unknown): PadSettings {
  const s = (typeof raw === "object" && raw ? raw : {}) as Partial<PadSettings>;
  const num = (v: unknown, fallback: number) =>
    typeof v === "number" && Number.isFinite(v) ? v : fallback;
  return {
    autoGas:
      typeof s.autoGas === "boolean" ? s.autoGas : DEFAULT_SETTINGS.autoGas,
    sensitivityDeg: clamp(
      num(s.sensitivityDeg, DEFAULT_SETTINGS.sensitivityDeg),
      SENSITIVITY_RANGE.min,
      SENSITIVITY_RANGE.max,
    ),
    deadZone: clamp(
      num(s.deadZone, DEFAULT_SETTINGS.deadZone),
      DEAD_ZONE_RANGE.min,
      DEAD_ZONE_RANGE.max,
    ),
  };
}

export function loadSettings(): PadSettings {
  try {
    return sanitize(JSON.parse(localStorage.getItem(KEY) ?? "null"));
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

export function saveSettings(s: PadSettings) {
  try {
    localStorage.setItem(KEY, JSON.stringify(s));
  } catch {
    // not saved: the settings still apply until the page closes
  }
}

/** The live settings; steering and the input loop read these */
export const settings: PadSettings = loadSettings();

/** Change and save settings */
export function updateSettings(patch: Partial<PadSettings>) {
  Object.assign(settings, sanitize({ ...settings, ...patch }));
  saveSettings(settings);
}
