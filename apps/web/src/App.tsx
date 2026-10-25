import { lazy, Suspense } from "react";

// Dev-only preview of the lobby UI with fake data (Nuris)
const Gallery = lazy(() => import("./ui/Gallery"));

// Placeholder until the lobby (Nuris) and the Babylon scene (Ali) land.
export default function App() {
  if (import.meta.env.DEV && location.pathname === "/ui") {
    return (
      <Suspense>
        <Gallery />
      </Suspense>
    );
  }
  return (
    <main>
      <h1>RaceBall</h1>
      <p>
        Web app is running. Routes /host and /play come in M1.
        {import.meta.env.DEV && " Lobby UI preview: /ui"}
      </p>
    </main>
  );
}
