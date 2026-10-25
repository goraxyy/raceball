import { useCallback, useEffect, useState } from "react";
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
  ViewerJoin,
} from "../ui";

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

function PlayerRoom({ session }: { session: NetSession }) {
  const state = useRaceState(session);
  const pairing = usePairing(session);
  const onLoaded = useCallback(
    () => session.setStatus({ assetsLoaded: true }),
    [session],
  );

  if (session.closed)
    return <ErrorScreen kind="disconnected" room={session.code} />;
  const me = pairing.playerId ? state.players?.[pairing.playerId] : undefined;
  return (
    <>
      {/* Ali's renderer: this player's chase camera. It loads the map behind the lobby, so Ready can count */}
      <GameView mode="viewer" session={session} onLoaded={onLoaded} />
      {!state.phase && (
        <LoadingScreen progress={0.6} label="Joining the race" />
      )}
      {state.phase === "lobby" && (
        <section className="ui-screen viewer-join">
          <PairingQR url={pairing.padUrl} paired={pairing.paired} />
          {me?.ready && <p>Ready! Waiting for the host to start.</p>}
        </section>
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
