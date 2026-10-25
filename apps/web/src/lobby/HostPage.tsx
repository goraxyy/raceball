import { useEffect, useState } from "react";
import {
  canStart,
  errorKindFor,
  type ErrorKind,
  type Laps,
} from "@raceball/shared";
import { GameView } from "../game/GameView";
import { NetHud, createAsHost, useRaceState, type NetSession } from "../net";
import { Countdown, ErrorScreen, HostLobby, LoadingScreen } from "../ui";
import "./lobby.css";
import { lobbyPlayers } from "./players";

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

  if (session.closed)
    return <ErrorScreen kind="disconnected" room={session.code} />;
  return (
    <>
      {/* Split screen: a first-person view per player. Mounted from the countdown on, so the views don't draw
          hidden behind the lobby (and can't trip the fps fallback before the race) */}
      {state.phase && state.phase !== "lobby" && (
        <GameView mode="host" session={session} />
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
      {state.phase === "countdown" && (
        <Countdown
          endsAt={state.countdownEndsAt}
          now={() => session.clock.serverNow()}
        />
      )}
      {state.phase && state.phase !== "lobby" && (
        <button
          type="button"
          className="host-rematch"
          onClick={() => session.rematch()}
        >
          {state.phase === "results" ? "Rematch" : "Back to lobby"}
        </button>
      )}
      <NetHud session={session} />
    </>
  );
}
