import type { PlayerView } from "@raceball/shared";

/** What the lobby shows for one player: their id plus the lobby fields of the synced state */
export type LobbyPlayer = { id: string } & Pick<
  PlayerView,
  | "name"
  | "ball"
  | "color"
  | "shape"
  | "phoneOnly"
  | "paired"
  | "calibrated"
  | "ready"
  | "connected"
> &
  Partial<Pick<PlayerView, "bot">>;
