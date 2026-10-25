import { useCallback, useEffect, useRef, useState } from "react";
import { Engine, Scene } from "@babylonjs/core";
import { PLANETS } from "@raceball/shared";
import "@babylonjs/loaders/glTF";
import { Mixer } from "../audio/mixer";
import { Captions } from "../ui/Captions";
import { createGame, type Game, type GameMode, type GameStatus } from "./game";
import { installInspectorToggle } from "./inspector";
import type { TileRect } from "./big-screen";
import type { SnapshotSource } from "./net-feed";
import { TileFrames } from "./TileFrames";
import "./local.css";

/**
 * Owns the Babylon engine for one canvas. React UI (HUD, lobby) sits on top of it as DOM.
 * Viewer and host modes draw the balls of `session`, a room from Rasim's net library.
 */
export function GameView({
  mode,
  session,
  onLoaded,
}: {
  mode: GameMode;
  session?: SnapshotSource;
  /** Once the map is in and the race can be drawn (a laptop tells the server its assets loaded) */
  onLoaded?: () => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const gameRef = useRef<Game | null>(null);
  const [status, setStatus] = useState<GameStatus | null>(null);
  const [mixer, setMixer] = useState<Mixer | null>(null);
  const onLoadedRef = useRef(onLoaded);
  useEffect(() => {
    onLoadedRef.current = onLoaded;
  });
  const onTileRects = useCallback(
    (rects: Map<string, TileRect>) => gameRef.current?.setTileRects(rects),
    [],
  );

  useEffect(() => {
    let active = true;
    let loaded = false;
    const engine = new Engine(canvasRef.current, true, { stencil: true });
    const scene = new Scene(engine);
    scene.useRightHandedSystem = true; // match glTF + Rapier, no conversions

    const params = new URLSearchParams(location.search);
    const ball = params.get("ball") ?? "";
    // the big screen gets the full mix with the crowd; a laptop hears mostly its own ball
    const mix = new Mixer(mode === "host" ? "big" : "laptop");
    if (params.has("mute")) mix.volume = 0;
    mix.load().then(
      () => active && setMixer(mix), // captions start once the cues can play
      (error: unknown) =>
        active && console.warn("Sounds failed to load", error),
    );
    // browsers start audio only after a tap or a key; the host page may not have had one yet
    const unlock = () => void mix.ctx.resume();
    addEventListener("pointerdown", unlock);
    addEventListener("keydown", unlock);
    const game = createGame(scene, mode, {
      map: params.get("map") === "flat" ? "flat" : "happy_valley",
      ball: (PLANETS as readonly string[]).includes(ball) ? ball : undefined,
      overview: params.has("view")
        ? params.get("view") === "overview"
        : undefined,
      session,
      mixer: mix,
      onStatus: (next) => {
        if (!active) return;
        setStatus(next);
        if (next.state === "ready" && !loaded) {
          loaded = true;
          onLoadedRef.current?.();
        }
      },
    });
    gameRef.current = game;
    const removeInspector = installInspectorToggle(scene);
    engine.runRenderLoop(() => {
      game.update(engine.getDeltaTime() / 1000);
      scene.render();
    });
    const onResize = () => engine.resize();
    addEventListener("resize", onResize);
    return () => {
      active = false;
      gameRef.current = null;
      removeEventListener("resize", onResize);
      removeInspector();
      removeEventListener("pointerdown", unlock);
      removeEventListener("keydown", unlock);
      game.dispose();
      void mix.ctx.close();
      scene.dispose();
      engine.dispose();
    };
  }, [mode, session]);

  // fixed to the viewport, so page styles (body padding) never shrink the 3D view
  return (
    <>
      <canvas
        ref={canvasRef}
        aria-label="RaceBall driving view"
        tabIndex={0}
        style={{
          position: "fixed",
          inset: 0,
          width: "100%",
          height: "100%",
          display: "block",
          outline: "none",
        }}
      />
      {mode === "host" && mixer && <Captions mixer={mixer} />}
      {mode === "host" && session && !!status?.tiles?.length && (
        <TileFrames
          ids={status.tiles}
          session={session}
          onRects={onTileRects}
        />
      )}
      {mode !== "local" && status && status.state !== "ready" && (
        <p
          className="game-status"
          role={status.state === "error" ? "alert" : "status"}
          data-state={status.state}
        >
          {status.state === "error"
            ? `The map could not load: ${status.message}. Reload to retry.`
            : status.message}
        </p>
      )}
      {mode === "local" && status && (
        <>
          <aside className="local-hud" aria-label="Local playtest">
            <p className="local-eyebrow">RACEBALL · LOCAL PLAYTEST</p>
            <h1>
              {status.map === "flat" ? "Flat test ground" : "Happy Valley"}
            </h1>
            <output
              className="local-status"
              data-state={status.state}
              data-position={status.stats?.position.join(",")}
              data-heading={status.stats?.heading}
              data-next-checkpoint={status.stats?.checkpoint}
              data-completed-laps={status.stats?.lap}
              data-elapsed={status.stats?.elapsed}
              data-last-lap={status.stats?.lastLap ?? ""}
            >
              {status.state === "ready"
                ? sectionLabel(status.stats?.section ?? "start")
                : status.message}
            </output>
            {status.state === "ready" && status.stats && (
              <>
                <div className="local-metrics">
                  <div>
                    <strong>{status.stats.speed.toFixed(1)}</strong>
                    <span>m/s</span>
                  </div>
                  <div>
                    <strong>{formatTime(status.stats.lapElapsed)}</strong>
                    <span>current lap</span>
                  </div>
                </div>
                <p className="local-item" data-item={status.stats.item ?? ""}>
                  {status.stats.item
                    ? `${ITEM_NAMES[status.stats.item]} · Space to fire`
                    : "No item: drive through a blue box"}
                </p>
                {status.map !== "flat" && (
                  <p className="local-lap-info">
                    {status.stats.lapElapsed === null
                      ? "Cross the start line to begin timing."
                      : `${status.stats.lap} timed ${status.stats.lap === 1 ? "lap" : "laps"} · next CP ${String(status.stats.checkpoint).padStart(2, "0")}`}
                    <br />
                    Last {formatTime(status.stats.lastLap)} · Best{" "}
                    {formatTime(status.stats.bestLap)}
                  </p>
                )}
                {status.stats.error && (
                  <p role="alert" className="local-error">
                    Reset failed: {status.stats.error}
                  </p>
                )}
                <div className="local-actions">
                  <button
                    type="button"
                    onClick={(event) => {
                      gameRef.current?.reset();
                      event.currentTarget.blur();
                    }}
                  >
                    Reset · R
                  </button>
                  <button
                    type="button"
                    onClick={(event) => {
                      gameRef.current?.toggleOverview();
                      event.currentTarget.blur();
                    }}
                  >
                    {status.overview ? "Follow" : "Overview"} · V
                  </button>
                </div>
              </>
            )}
            {status.state === "error" && (
              <p role="alert" className="local-error">
                The map could not load. Reload to retry, or open the flat test
                ground below.
              </p>
            )}
            <a
              className="local-map-link"
              href={
                status.map === "flat"
                  ? "/play?local=1"
                  : "/play?local=1&map=flat"
              }
            >
              {status.map === "flat"
                ? "Open Happy Valley"
                : "Open flat test ground"}
            </a>
          </aside>
          <p className="local-controls">
            W / ↑ accelerate <span>·</span> A D / ← → steer <span>·</span> S / ↓
            brake <span>·</span> Space item <span>·</span> R reset{" "}
            <span>·</span> V overview
          </p>
        </>
      )}
    </>
  );
}

const ITEM_NAMES: Record<string, string> = {
  boost: "Blue & White Boost",
  roar: "Lion Roar",
  spill: "Creamery Spill",
  snowday: "Snow Day",
};

function formatTime(seconds: number | null): string {
  if (seconds === null) return "—";
  const minutes = Math.floor(seconds / 60);
  return `${minutes}:${(seconds % 60).toFixed(2).padStart(5, "0")}`;
}

function sectionLabel(section: string): string {
  return (
    (
      {
        start: "Start / finish · Old Main",
        pollock: "Pollock Road",
        library: "Library steps",
        lionshrine: "Lion Shrine",
        creamery: "Creamery run",
        stadium: "Beaver Stadium",
        arboretum: "Snowy Arboretum",
        collegeave: "College Avenue",
      } as Record<string, string>
    )[section] ?? section
  );
}
