import { lazy, Suspense } from "react";
import { GameView } from "./game/GameView";
import { HostPage } from "./lobby/HostPage";
import { PlayPage } from "./lobby/PlayPage";
import { ErrorScreen, TitleScreen } from "./ui";

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
  // The M2 lobby flow (replaces the M1 slice screens in game/Online.tsx)
  if (location.pathname === "/host") return <HostPage />;
  if (location.pathname === "/play") return <PlayPage />;
  if (location.pathname !== "/") return <ErrorScreen kind="lost" />;
  return (
    <TitleScreen
      hostHref="/host"
      joinHref="/play"
      practiceHref="/play?local=1"
    />
  );
}
