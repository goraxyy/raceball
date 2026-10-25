import { Client, type Room } from "@colyseus/sdk";
import { startInputLoop } from "./input-loop";
import {
  Clock,
  JoinError,
  PROTOCOL_VERSION,
  SERVER_PORT,
  readPadParams,
  DEFAULT_LAPS,
  type JoinOptions,
  type PlayerView,
  type RaceStateView,
  type NetStatMsg,
  type PongMsg,
  type WelcomeMsg,
} from "@raceball/shared";

export type ConnectionStatus =
  | { state: "offline" } // no room in the URL: sensor testing only
  | { state: "connecting"; room: string }
  | { state: "joined"; room: string; playerId: string; phoneOnly: boolean }
  | { state: "error"; message: string };

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

const ERRORS: Record<number, string> = {
  [JoinError.VersionMismatch]: "RaceBall was updated. Refresh this page.",
  [JoinError.RoomFull]: "This race is full.",
  [JoinError.BadPairToken]:
    "That pairing code has expired. Scan the QR on your laptop again.",
  [JoinError.AlreadyPaired]: "Another phone is already paired to this player.",
};

const serverUrl = () =>
  import.meta.env.VITE_SERVER_URL ?? `ws://${location.hostname}:${SERVER_PORT}`;

/** Join the room from the QR URL. Phone-only when the URL has no pair token. */
export async function connect(onChange: (s: ConnectionStatus) => void) {
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
    const err = e as { code?: number; message?: string };
    const message =
      ERRORS[err.code ?? -1] ??
      `Couldn't join room ${code}: ${err.message ?? "unknown error"}`;
    return set({ state: "error", message });
  }

  room.onMessage("welcome", (msg: WelcomeMsg) =>
    set({
      state: "joined",
      room: code,
      playerId: msg.playerId,
      phoneOnly: !pairToken,
    }),
  );
  room.onLeave((closeCode) =>
    set({
      state: "error",
      message: `Disconnected (${closeCode}). Scan the QR code again.`,
    }),
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
