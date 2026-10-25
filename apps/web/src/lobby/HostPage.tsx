import { useEffect, useState } from "react";
import {
  canStart,
  takenPlanets,
  errorKindFor,
  type ErrorKind,
  type Laps,
} from "@raceball/shared";
import { GameView } from "../game/GameView";
import {
  NetHud,
  createAsHost,
  joinAsViewer,
  usePairing,
  useRaceState,
  type NetSession,
} from "../net";
import {
  Countdown,
  ErrorScreen,
  HostLobby,
  LoadingScreen,
  PairingQR,
  Results,
  ViewerJoin,
} from "../ui";
import "./lobby.css";
import { lobbyPlayers } from "./players";
import { PlayerRoom } from "./PlayPage";
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
  // "Play here": the host also joins as a laptop player, and gets their own view instead of the split screen
  const [me, setMe] = useState<NetSession>();
  const [joining, setJoining] = useState(false);
  useEffect(() => () => void me?.leave(), [me]);
  const racing = !!state.phase && state.phase !== "lobby";
  const results = useRaceResults(session);

  if (session.closed)
    return <ErrorScreen kind="disconnected" room={session.code} />;
  const controls = (
    <button
      type="button"
      className="host-rematch"
      onClick={() => session.rematch()}
    >
      {state.phase === "results" ? "Rematch" : "Back to lobby"}
    </button>
  );
  // built only in the lobby: before the first state there are no players to list
  const lobby = state.phase === "lobby" && (
    <HostLobby
      code={session.code}
      phoneJoinUrl={session.padUrl()}
      players={lobbyPlayers(state)}
      laps={laps}
      onLapsChange={(n) => setLaps(n === 1 ? 1 : 3)}
      onAddBot={() => session.addBot()}
      onRemoveBot={(id) => session.removeBot(id)}
      onPlayHere={me ? undefined : () => setJoining(true)}
      canStart={canStart(state)}
      onStart={() => session.start(laps)}
    />
  );

  if (joining && !me)
    return (
      <ViewerJoin
        initialCode={session.code}
        taken={state.players ? [...takenPlanets(state)] : []}
        onCancel={() => setJoining(false)}
        onJoin={(code, name, ball) =>
          joinAsViewer(code, name, ball).then(
            (s) => {
              setMe(s);
              setJoining(false);
            },
            () => setJoining(false),
          )
        }
      />
    );
  if (me)
    return (
      <PlayerRoom
        session={me}
        controls={controls}
        onRematch={() => session.rematch()}
        lobby={
          <>
            {lobby}
            <HostPad session={me} onStop={() => setMe(undefined)} />
          </>
        }
      />
    );
  return (
    <>
      {/* Split screen: a first-person view per player, for the whole race (never a global view). Mounted from the
          countdown on, so the views don't draw hidden behind the lobby. The rematch button sits on the race board,
          off every view */}
      {racing && (
        <GameView mode="host" session={session} hostControls={controls} />
      )}
      {!state.phase && <LoadingScreen progress={0.6} label="Opening a room" />}
      {state.phase === "lobby" && lobby}
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

/** The playing host's own phone: its pairing QR over the lobby until they're ready, then a small pill */
function HostPad({
  session,
  onStop,
}: {
  session: NetSession;
  onStop: () => void;
}) {
  const state = useRaceState(session);
  const pairing = usePairing(session);
  const [hidden, setHidden] = useState(false);
  const me = pairing.playerId ? state.players?.[pairing.playerId] : undefined;
  if (hidden || me?.ready)
    return (
      <div className="host-pad-pill">
        <span>{me?.ready ? "You're ready" : "Your phone isn't paired"}</span>
        {!me?.ready && (
          <button type="button" onClick={() => setHidden(false)}>
            Pair
          </button>
        )}
        <button type="button" onClick={onStop}>
          Stop playing
        </button>
      </div>
    );
  return (
    <div className="ui-screen host-pad">
      <PairingQR url={pairing.padUrl} paired={pairing.paired} />
      <div className="host-pad-actions">
        <button type="button" className="btn btn-ghost" onClick={onStop}>
          Stop playing
        </button>
        <button type="button" className="btn" onClick={() => setHidden(true)}>
          Later
        </button>
      </div>
    </div>
  );
}
