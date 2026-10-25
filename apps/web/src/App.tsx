import { GameView } from "./game/GameView";

// Placeholder until the lobby (Nuris) lands. /play?local=1 runs game-core in the browser (Ali).
export default function App() {
  const params = new URLSearchParams(location.search);
  if (location.pathname === "/play" && params.get("local") === "1") {
    return <GameView mode="local" />;
  }
  return (
    <main>
      <h1>RaceBall</h1>
      <p>Web app is running. Routes /host and /play come in M1.</p>
      <p>
        Local mode: <a href="/play?local=1">/play?local=1</a> (drive with W A S
        D)
      </p>
    </main>
  );
}
