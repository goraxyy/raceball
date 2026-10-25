import { lazy, Suspense } from "react";
import { GameView } from "./game/GameView";
import { HostScreen, PlayerScreen } from "./game/Online";
import { TitleScreen } from "./ui";

// Dev-only preview of the lobby UI with fake data (Nuris)
const Gallery = lazy(() => import("./ui/Gallery"));

// / is the title screen. /play?local=1 runs game-core in the browser (Ali); /play and /host join a server room.
export default function App() {
  if (import.meta.env.DEV && location.pathname === "/ui") {
    return (
      <Suspense>
        <Gallery />
      </Suspense>
    );
  }
  const params = new URLSearchParams(location.search);
  if (location.pathname === "/play" && params.get("local") === "1") {
    return <GameView mode="local" />;
  }
  // M1 vertical slice; Rasim's M2 lobby flow (HostLobby, ready, start) replaces these screens
  if (location.pathname === "/play") return <PlayerScreen />;
  if (location.pathname === "/host") return <HostScreen />;
  return (
    <TitleScreen
      hostHref="/host"
      joinHref="/play"
      practiceHref="/play?local=1"
    />
  );
}
