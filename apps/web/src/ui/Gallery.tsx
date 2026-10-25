// Dev-only preview of every lobby component with fake data. Open /ui while `pnpm dev` runs.
import { useEffect, useState } from "react";
import { MAX_PLAYERS, PLANETS } from "@raceball/shared";
import {
  HostLobby,
  LoadingScreen,
  PairingQR,
  ViewerJoin,
  type LobbyPlayer,
} from ".";
import { RacePreview } from "./RacePreview";

const FAKE: LobbyPlayer[] = [
  {
    id: "a",
    name: "Nuris",
    ball: "earth",
    color: 0,
    shape: 0,
    phoneOnly: false,
    paired: true,
    calibrated: true,
    ready: true,
    connected: true,
  },
  {
    id: "b",
    name: "Ali",
    ball: "mars",
    color: 1,
    shape: 1,
    phoneOnly: false,
    paired: true,
    calibrated: false,
    ready: false,
    connected: true,
  },
  {
    id: "c",
    name: "Rasim",
    ball: "saturn",
    color: 2,
    shape: 2,
    phoneOnly: true,
    paired: false,
    calibrated: true,
    ready: true,
    connected: true,
  },
  {
    id: "d",
    name: "Judge",
    ball: "neptune",
    color: 3,
    shape: 3,
    phoneOnly: true,
    paired: false,
    calibrated: false,
    ready: false,
    connected: false,
  },
];
const PAD_URL = "https://raceball-pad.vercel.app/?room=ABCD";
const VIEWS = ["host", "join", "pairing", "paired", "loading", "race"] as const;
type View = (typeof VIEWS)[number];

export default function Gallery() {
  const [view, setView] = useState<View>("host");
  const [players, setPlayers] = useState(FAKE);
  const [laps, setLaps] = useState(3);
  const [progress, setProgress] = useState(0.35);

  useEffect(() => {
    if (view !== "loading") return;
    const id = setInterval(
      () => setProgress((p) => (p >= 1 ? 0 : p + 0.02)),
      80,
    );
    return () => clearInterval(id);
  }, [view]);

  const addBot = () =>
    setPlayers((ps) => {
      if (ps.length >= MAX_PLAYERS) return ps;
      const n = ps.length;
      const free =
        PLANETS.find((p) => !ps.some((q) => q.ball === p)) ?? PLANETS[0];
      const bot = {
        id: `bot${n}`,
        name: `Bot ${n - 3}`,
        ball: free,
        color: n,
        shape: n,
        phoneOnly: true,
        paired: false,
        calibrated: true,
        ready: true,
        connected: true,
      };
      return [...ps, bot];
    });

  return (
    <>
      <nav className="gallery-nav">
        {VIEWS.map((v) => (
          <button
            key={v}
            type="button"
            className={v === view ? "is-on" : ""}
            onClick={() => setView(v)}
          >
            {v}
          </button>
        ))}
        {view === "host" && (
          <button
            type="button"
            onClick={() =>
              setPlayers((ps) =>
                ps.map((p) => ({ ...p, ready: true, connected: true })),
              )
            }
          >
            everyone ready
          </button>
        )}
      </nav>
      {view === "host" && (
        <HostLobby
          code="ABCD"
          phoneJoinUrl={PAD_URL}
          players={players}
          laps={laps}
          onLapsChange={setLaps}
          onAddBot={addBot}
          canStart={
            players.length > 0 && players.every((p) => p.ready && p.connected)
          }
          onStart={() => alert(`Start a ${laps}-lap race`)}
        />
      )}
      {view === "join" && (
        <ViewerJoin
          initialCode="ABCD"
          taken={["mars", "saturn"]}
          onJoin={(c, n, b) => alert(`Join ${c} as ${n} on ${b}`)}
        />
      )}
      {(view === "pairing" || view === "paired") && (
        <section className="ui-screen viewer-join">
          <PairingQR
            url={`${PAD_URL}&t=demo-token`}
            paired={view === "paired"}
          />
        </section>
      )}
      {view === "race" && <RacePreview />}
      {view === "loading" && (
        <LoadingScreen progress={progress} label="Loading Happy Valley" />
      )}
    </>
  );
}
