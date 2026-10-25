import { Client, type Room } from "@colyseus/sdk";
import { startInputLoop } from "./input-loop";
import {
  Clock,
  errorKindFor,
  type ErrorKind,
  PROTOCOL_VERSION,
  SERVER_PORT,
  readPadParams,
  DEFAULT_LAPS,
  type GameEvent,
  type JoinOptions,
  type PlayerView,
  type RaceStateView,
  type NetStatMsg,
  type Phase,
  type PongMsg,
  type SetProfileMsg,
  type StatusMsg,
  takenPlanets,
  type WelcomeMsg,
} from "@raceball/shared";

export type ConnectionStatus =
  | { state: "offline" } // no room in the URL: sensor testing only
  | { state: "connecting"; room: string }
  | { state: "joined"; room: string; playerId: string; phoneOnly: boolean }
  | { state: "reconnecting"; room: string } // dropped; the SDK is trying to get us back
  | { state: "error"; kind: ErrorKind; room?: string; code?: number };

export let status: ConnectionStatus = { state: "offline" };
export let room: Room | undefined;

const raceState = () => room?.state?.toJSON() as RaceStateView | undefined;

/** This phone's player in the synced state, once joined */
export const myPlayer = (): PlayerView | undefined =>
  status.state === "joined" ? raceState()?.players[status.playerId] : undefined;

/** Everyone in the room, by player id (the results board reads it) */
export const players = () => raceState()?.players ?? {};

/** Race length set by the host */
export const laps = () => raceState()?.laps ?? DEFAULT_LAPS;

/** Round trip and server clock, from pings */
export const clock = new Clock();
/** How old our latest input was at the server, ms (from the server's netstat) */
export let inputAge: number | undefined;

const PING_MS = 1000;

/** Lobby flags waiting to go to the server (sent once we're welcomed into a player slot) */
const pendingStatus: StatusMsg = {};

function flushStatus() {
  if (status.state !== "joined" || !room) return;
  if (Object.keys(pendingStatus).length === 0) return;
  room.send("status", { ...pendingStatus });
  for (const key of Object.keys(pendingStatus))
    delete pendingStatus[key as keyof StatusMsg];
}

/** Tell the server this phone calibrated or is ready. Safe to call before we've joined */
export function sendStatus(msg: StatusMsg) {
  Object.assign(pendingStatus, msg);
  flushStatus();
}

/** Name and planet for our player (phone-only players pick them on the pad) */
export function sendProfile(msg: SetProfileMsg) {
  room?.send("setProfile", msg);
}

/** Planets other players have, so the picker can grey them out */
export function planetsTaken(): Set<string> {
  const s = raceState();
  return s && status.state === "joined"
    ? takenPlanets(s, status.playerId)
    : new Set();
}

/** The room's phase, once joined */
export const phase = (): Phase | undefined => raceState()?.phase;

const serverUrl = () =>
  import.meta.env.VITE_SERVER_URL ?? `ws://${location.hostname}:${SERVER_PORT}`;

const SESSION_KEY = "raceball:session";

/** What a reloaded page needs to get back into the same slot */
interface SavedSession {
  room: string;
  token: string;
  phoneOnly: boolean;
}

function loadSession(code: string): SavedSession | undefined {
  try {
    const saved = JSON.parse(localStorage.getItem(SESSION_KEY) ?? "null");
    return saved?.room === code && typeof saved.token === "string"
      ? saved
      : undefined;
  } catch {
    return undefined;
  }
}

function saveSession(saved: SavedSession | null) {
  try {
    if (saved) localStorage.setItem(SESSION_KEY, JSON.stringify(saved));
    else localStorage.removeItem(SESSION_KEY);
  } catch {
    // not saved: a reload joins as a new player instead
  }
}

/**
 * Join the room from the QR URL (phone-only when the URL has no pair token).
 * A reloaded page first tries to reconnect into its old slot. Dropped connections
 * (a locked phone, a Wi-Fi blip) are reconnected by the SDK; we show "reconnecting" meanwhile.
 */
export async function connect(
  onChange: (s: ConnectionStatus) => void,
  onPhase: (p: Phase) => void = () => {},
  onEvent: (evt: GameEvent, me: string) => void = () => {},
) {
  const set = (s: ConnectionStatus) => onChange((status = s));
  const { room: code, pairToken } = readPadParams(location.search);
  if (!code) return set({ state: "offline" });

  set({ state: "connecting", room: code });
  const client = new Client(serverUrl());
  const saved = loadSession(code);
  let phoneOnly = !pairToken;
  try {
    room = saved
      ? await client.reconnect(saved.token).catch(() => undefined)
      : undefined;
    if (room && saved) phoneOnly = saved.phoneOnly;
    room ??= await client.joinById(code, {
      role: "pad",
      protocol: PROTOCOL_VERSION,
      pairToken,
    } satisfies JoinOptions);
  } catch (e) {
    const err = e as { code?: number };
    return set({
      state: "error",
      kind: errorKindFor(err.code),
      room: code,
      code: err.code,
    });
  }

  const joined = room;
  const remember = () =>
    saveSession({ room: code, token: joined.reconnectionToken, phoneOnly });
  remember();

  let playerId = "";
  joined.onMessage("welcome", (msg: WelcomeMsg) => {
    playerId = msg.playerId;
    set({ state: "joined", room: code, playerId, phoneOnly });
    flushStatus();
  });
  joined.onMessage("evt", (evt: GameEvent) => onEvent(evt, playerId));
  joined.onDrop(() => set({ state: "reconnecting", room: code }));
  joined.onReconnect(() => {
    remember(); // the token changes on every reconnect
    set({ state: "joined", room: code, playerId, phoneOnly });
    flushStatus();
  });
  let lastPhase: Phase | undefined;
  joined.onStateChange(() => {
    const p = phase();
    if (p && p !== lastPhase) onPhase((lastPhase = p));
  });
  joined.onLeave((closeCode) => {
    saveSession(null);
    set({ state: "error", kind: "disconnected", room: code, code: closeCode });
  });
  joined.onMessage("pong", (msg: PongMsg) =>
    clock.onPong(msg, performance.now()),
  );
  joined.onMessage("netstat", (msg: NetStatMsg) => (inputAge = msg.inputAge));
  const ping = () => joined.send("ping", performance.now());
  ping();
  const pinger = setInterval(ping, PING_MS);
  joined.onLeave(() => clearInterval(pinger));

  joined.send("hello"); // handlers are registered, so ask which player we are
  startInputLoop(joined);
}
