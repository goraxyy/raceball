import { useEffect, useState } from "react";
import {
  canStart,
  errorKindFor,
  type ErrorKind,
  type Laps,
} from "@raceball/shared";
import { GameView } from "../game/GameView";
import { NetHud, createAsHost, useRaceState, type NetSession } from "../net";
import {
  Countdown,
  ErrorScreen,
  HostLobby,
  LoadingScreen,
  Results,
} from "../ui";
import "./lobby.css";
import { lobbyPlayers } from "./players";
import { useRaceResults } from "./results";

/** /host: the big screen. Creates the room, runs the lobby, then shows the race */
export function HostPage() {
  const [session, setSession] = useState<NetSession>();
  const [error, setError] = useState<{ kind: ErrorKind; code?: number }>();

  useEffect(() => {
    let created: NetSession | undefined;
    let cancelled = false;
    createAsHost().then(
      (s) => {
        if (cancelled) return void s.leave();
        setSession((created = s));
      },
      (e: { code?: number }) =>
        setError({ kind: errorKindFor(e.code), code: e.code }),
    );
    return () => {
      cancelled = true;
      void created?.leave();
    };
  }, []);

  if (error) return <ErrorScreen kind={error.kind} code={error.code} />;
  if (!session) return <LoadingScreen progress={0.2} label="Opening a room" />;
  return <HostRoom session={session} />;
}

function HostRoom({ session }: { session: NetSession }) {
  const state = useRaceState(session);
  const [laps, setLaps] = useState<Laps>(3);
  const racing = !!state.phase && state.phase !== "lobby";
  const results = useRaceResults(session);

  if (session.closed)
    return <ErrorScreen kind="disconnected" room={session.code} />;
  return (
    <>
      {/* Split screen: a first-person view per player, for the whole race (never a global view). Mounted from the
          countdown on, so the views don't draw hidden behind the lobby. The rematch button sits on the race board,
          off every view */}
      {racing && (
        <GameView
          mode="host"
          session={session}
          hostControls={
            <button
              type="button"
              className="host-rematch"
              onClick={() => session.rematch()}
            >
              {state.phase === "results" ? "Rematch" : "Back to lobby"}
            </button>
          }
        />
      )}
      {!state.phase && <LoadingScreen progress={0.6} label="Opening a room" />}
      {state.phase === "lobby" && (
        <HostLobby
          code={session.code}
          phoneJoinUrl={session.padUrl()}
          players={lobbyPlayers(state)}
          laps={laps}
          onLapsChange={(n) => setLaps(n === 1 ? 1 : 3)}
          onAddBot={() => session.addBot()}
          canStart={canStart(state)}
          onStart={() => session.start(laps)}
        />
      )}
      {/* the race is over: the podium and the final classification, over the last of the race */}
      {results && (
        <div className="results-overlay">
          <Results
            rows={results.rows}
            laps={results.laps}
            lobbyAt={results.lobbyAt}
            now={results.now}
            onRematch={() => session.rematch()}
          />
        </div>
      )}
      {state.phase === "countdown" && (
        <Countdown
          endsAt={state.countdownEndsAt}
          now={() => session.clock.serverNow()}
        />
      )}
      <NetHud session={session} />
    </>
  );
}
