import { lazy, Suspense } from "react";
import { GameView } from "./game/GameView";
import { ErrorScreen, TitleScreen } from "./ui";

// Dev-only preview of the lobby UI with fake data (Nuris)
const Gallery = lazy(() => import("./ui/Gallery"));

// / is the title screen. /play?local=1 runs game-core in the browser (Ali).
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
  if (location.pathname === "/host" || location.pathname === "/play") {
    // Rasim wires these to HostLobby / ViewerJoin with the net hooks (M2)
    return (
      <main>
        <h1>RaceBall</h1>
        <p>
          {location.pathname} isn't wired up yet.{" "}
          <a href="/play?local=1">Practice solo</a> (drive with W A S D)
          {import.meta.env.DEV && (
            <>
              {" "}
              or preview the UI at <a href="/ui">/ui</a>
            </>
          )}
          .
        </p>
      </main>
    );
  }
  if (location.pathname !== "/") return <ErrorScreen kind="lost" />;
  return (
    <TitleScreen
      hostHref="/host"
      joinHref="/play"
      practiceHref="/play?local=1"
    />
  );
}
