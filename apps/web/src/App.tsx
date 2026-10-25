import { GameView } from "./game/GameView";

/** Routes: /play?local=1 runs game-core in the browser. /host and online /play wait for the net library (Rasim). */
export function App() {
  const params = new URLSearchParams(location.search);
  if (location.pathname === "/play" && params.get("local") === "1") {
    return <GameView mode="local" />;
  }
  return (
    <main style={{ padding: 24 }}>
      <h1>RaceBall</h1>
      <p>
        Local mode: <a href="/play?local=1" style={{ color: "#8ecae6" }}>/play?local=1</a> (drive with W A S D)
      </p>
      <p>Online /host and /play arrive with the net library and lobby UI.</p>
    </main>
  );
}
