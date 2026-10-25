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
  type JoinOptions,
  type PlayerView,
  type RaceStateView,
  type NetStatMsg,
  type Phase,
  type PongMsg,
  type StatusMsg,
  type WelcomeMsg,
} from "@raceball/shared";

export type ConnectionStatus =
  | { state: "offline" } // no room in the URL: sensor testing only
  | { state: "connecting"; room: string }
  | { state: "joined"; room: string; playerId: string; phoneOnly: boolean }
  | { state: "error"; kind: ErrorKind; room?: string; code?: number };

export let status: ConnectionStatus = { state: "offline" };
export let room: Room | undefined;

const raceState = () => room?.state?.toJSON() as RaceStateView | undefined;

/** This phone's player in the synced state, once joined */
export const myPlayer = (): PlayerView | undefined =>
  status.state === "joined" ? raceState()?.players[status.playerId] : undefined;

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

/** The room's phase, once joined */
export const phase = (): Phase | undefined => raceState()?.phase;

const serverUrl = () =>
  import.meta.env.VITE_SERVER_URL ?? `ws://${location.hostname}:${SERVER_PORT}`;

/** Join the room from the QR URL. Phone-only when the URL has no pair token. */
export async function connect(
  onChange: (s: ConnectionStatus) => void,
  onPhase: (p: Phase) => void = () => {},
) {
  const set = (s: ConnectionStatus) => onChange((status = s));
  const { room: code, pairToken } = readPadParams(location.search);
  if (!code) return set({ state: "offline" });

  set({ state: "connecting", room: code });
  const opts: JoinOptions = {
    role: "pad",
    protocol: PROTOCOL_VERSION,
    pairToken,
  };
  try {
    room = await new Client(serverUrl()).joinById(code, opts);
  } catch (e) {
    const err = e as { code?: number };
    return set({
      state: "error",
      kind: errorKindFor(err.code),
      room: code,
      code: err.code,
    });
  }

  room.onMessage("welcome", (msg: WelcomeMsg) => {
    set({
      state: "joined",
      room: code,
      playerId: msg.playerId,
      phoneOnly: !pairToken,
    });
    flushStatus();
  });
  let lastPhase: Phase | undefined;
  room.onStateChange(() => {
    const p = phase();
    if (p && p !== lastPhase) onPhase((lastPhase = p));
  });
  room.onLeave((closeCode) =>
    set({ state: "error", kind: "disconnected", room: code, code: closeCode }),
  );
  room.onMessage("pong", (msg: PongMsg) =>
    clock.onPong(msg, performance.now()),
  );
  room.onMessage("netstat", (msg: NetStatMsg) => (inputAge = msg.inputAge));
  const joined = room;
  const ping = () => joined.send("ping", performance.now());
  ping();
  const pinger = setInterval(ping, PING_MS);
  room.onLeave(() => clearInterval(pinger));

  room.send("hello"); // handlers are registered, so ask which player we are
  startInputLoop(room);
}
