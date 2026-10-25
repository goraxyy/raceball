import { useEffect, useRef } from "react";
import { Engine, Scene } from "@babylonjs/core";
import "@babylonjs/loaders/glTF";
import { createGame, type GameMode } from "./game";
import { installInspectorToggle } from "./inspector";

/** Owns the Babylon engine for one canvas. React UI (HUD, lobby) sits on top of it as DOM. */
export function GameView({ mode }: { mode: GameMode }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const engine = new Engine(canvasRef.current, true, { stencil: true });
    const scene = new Scene(engine);
    scene.useRightHandedSystem = true;       // match glTF + Rapier, no conversions

    const game = createGame(scene, mode);
    const removeInspector = installInspectorToggle(scene);
    engine.runRenderLoop(() => {
      game.update(engine.getDeltaTime() / 1000);
      scene.render();
    });
    const onResize = () => engine.resize();
    addEventListener("resize", onResize);
    return () => {
      removeEventListener("resize", onResize);
      removeInspector();
      game.dispose();
      engine.dispose();
    };
  }, [mode]);

  return <canvas ref={canvasRef} style={{ width: "100%", height: "100%", display: "block", outline: "none" }} />;
}
