import type { RaceStateView } from "@raceball/shared";
import type { LobbyPlayer } from "../ui";

/** The synced players, in join order, as Nuris's lobby components want them */
export const lobbyPlayers = (state: RaceStateView): LobbyPlayer[] =>
  Object.entries(state.players ?? {}).map(([id, p]) => ({ id, ...p }));
