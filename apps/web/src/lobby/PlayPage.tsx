import { type ReactNode, useCallback, useEffect, useState } from "react";
import { errorKindFor, type ErrorKind } from "@raceball/shared";
import { GameView } from "../game/GameView";
import {
  NetHud,
  joinAsViewer,
  usePairing,
  useRaceState,
  type NetSession,
} from "../net";
import {
  Countdown,
  ErrorScreen,
  LoadingScreen,
  PairingQR,
  Results,
  ViewerJoin,
} from "../ui";
import "./lobby.css";
import { useRaceResults } from "./results";

/** /play: a laptop player joins with the room code, pairs a phone, then sees their own race */
export function PlayPage() {
  const [session, setSession] = useState<NetSession>();
  const [error, setError] = useState<{
    kind: ErrorKind;
    room: string;
    code?: number;
  }>();
  const initialCode =
    new URLSearchParams(location.search).get("room")?.toUpperCase() ?? "";

  useEffect(() => () => void session?.leave(), [session]);

  if (error)
    return (
      <ErrorScreen
        kind={error.kind}
        room={error.room}
        code={error.code}
        onAction={() => setError(undefined)}
      />
    );
  if (!session)
    return (
      <ViewerJoin
        initialCode={initialCode}
        onJoin={(code, name, ball) =>
          joinAsViewer(code, name, ball).then(
            setSession,
            (e: { code?: number }) =>
              setError({
                kind: errorKindFor(e.code),
                room: code,
                code: e.code,
              }),
          )
        }
      />
    );
  return <PlayerRoom session={session} />;
}

/**
 * A laptop player's screen: their chase view and HUD. The host playing on their own laptop passes the host lobby
 * (lobby) and their race buttons (controls)
 */
export function PlayerRoom({
  session,
  lobby,
  controls,
  onRematch,
}: {
  session: NetSession;
  lobby?: ReactNode;
  controls?: ReactNode;
  /** The host's Rematch on the results */
  onRematch?: () => void;
}) {
  const state = useRaceState(session);
  const pairing = usePairing(session);
  const results = useRaceResults(session);
  const onLoaded = useCallback(
    () => session.setStatus({ assetsLoaded: true }),
    [session],
  );

  if (session.closed)
    return <ErrorScreen kind="disconnected" room={session.code} />;
  const me = pairing.playerId ? state.players?.[pairing.playerId] : undefined;
  return (
    <>
      {/* Ali's renderer: this player's chase camera. It loads the map behind the lobby, so Ready can count, and on a
          player's own laptop it tours the landmarks there (the playing host's lobby covers the view instead) */}
      <GameView
        mode="viewer"
        session={session}
        onLoaded={onLoaded}
        hostControls={controls}
        tour={!lobby}
      />
      {!state.phase && (
        <LoadingScreen progress={0.6} label="Joining the race" />
      )}
      {state.phase === "lobby" && lobby}
      {state.phase === "lobby" && !lobby && (
        <section className="ui-screen viewer-join over-map">
          <PairingQR url={pairing.padUrl} paired={pairing.paired} />
          {me?.ready && <p>Ready! Waiting for the host to start.</p>}
        </section>
      )}
      {results && (
        <div className="results-overlay">
          <Results
            rows={results.rows}
            laps={results.laps}
            lobbyAt={results.lobbyAt}
            now={results.now}
            onRematch={onRematch}
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
