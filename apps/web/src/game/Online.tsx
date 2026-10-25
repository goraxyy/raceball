import { useEffect, useState } from "react";
import {
  NetHud,
  createAsHost,
  joinAsViewer,
  usePairing,
  type NetSession,
} from "../net";
import { PairingQR, ViewerJoin } from "../ui";
import { QrCode } from "../ui/QrCode";
import { GameView } from "./GameView";
import "./online.css";

// M1 vertical slice: join or host a room and drive. Rasim's M2 lobby flow (HostLobby, LoadingScreen, ready, start)
// replaces these screens; the game side stays <GameView mode session />.

/** How long the "phone paired" sticker stays up before it gets out of the way, ms */
const PAIRED_STICKER_MS = 4000;

/** /play: a laptop player joins with a room code (or ?room=), pairs a phone and sees their own ball */
export function PlayerScreen() {
  const [session, setSession] = useState<NetSession | null>(null);
  const [joining, setJoining] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(
    () => () => {
      void session?.leave();
    },
    [session],
  );

  if (!session) {
    const room = new URLSearchParams(location.search).get("room") ?? "";
    return (
      <>
        <ViewerJoin
          initialCode={room.toUpperCase()}
          onJoin={(code, name, ball) => {
            if (joining) return;
            setJoining(true);
            setError(null);
            joinAsViewer(code, name, ball)
              .then(setSession, (reason: unknown) => setError(message(reason)))
              .finally(() => setJoining(false));
          }}
        />
        {error && (
          <p role="alert" className="online-error">
            Couldn't join: {error}
          </p>
        )}
      </>
    );
  }
  return (
    <>
      <GameView mode="viewer" session={session} />
      <Pairing session={session} />
      <p className="online-room" aria-label="Room code">
        Room <b>{session.code}</b>
      </p>
      <NetHud session={session} />
    </>
  );
}

/** /host: the big screen opens a room and watches the race from above */
export function HostScreen() {
  const [session, setSession] = useState<NetSession | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    // in dev React mounts twice, so a room created after this mount is gone is left right away
    let live = true;
    let created: NetSession | undefined;
    createAsHost().then(
      (next) => {
        if (!live) return void next.leave();
        created = next;
        setSession(next);
      },
      (reason: unknown) => live && setError(message(reason)),
    );
    return () => {
      live = false;
      void created?.leave();
    };
  }, []);

  if (!session) {
    return (
      <main className="online-wait">
        <h1>RaceBall</h1>
        <p role={error ? "alert" : "status"}>
          {error ? `Couldn't open a room: ${error}` : "Opening a room…"}
        </p>
      </main>
    );
  }
  const joinUrl = `${location.origin}/play?room=${session.code}`;
  return (
    <>
      <GameView mode="host" session={session} />
      <aside className="online-host" aria-label="Join this race">
        <p className="online-eyebrow">ROOM</p>
        <p className="online-code">{session.code}</p>
        <p>
          Laptops: <b>{joinUrl.replace(/^https?:\/\//, "")}</b>
        </p>
        <QrCode url={session.padUrl()} label="Phone-only join QR code" />
        <p>No laptop? Scan to race on your phone.</p>
      </aside>
      <NetHud session={session} />
    </>
  );
}

/** The laptop's pairing QR in a corner, until a phone pairs and the sticker has been seen */
function Pairing({ session }: { session: NetSession }) {
  const { padUrl, paired } = usePairing(session);
  const [seen, setSeen] = useState(false);
  useEffect(() => {
    if (!paired) return;
    const id = setTimeout(() => setSeen(true), PAIRED_STICKER_MS);
    return () => clearTimeout(id);
  }, [paired]);
  if (paired && seen) return null; // a phone that drops shows the QR again
  return (
    <div className="online-pairing">
      <PairingQR url={padUrl} paired={paired} />
    </div>
  );
}

const message = (reason: unknown) =>
  reason instanceof Error ? reason.message : String(reason);
