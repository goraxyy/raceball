// Dev-only: the VFX v1 particle files on a 1 m ball circling a patch of track, for /ui.
// Loads apps/web/public/assets/fx/*.json the way the game should (see docs/ASSETS.md).
import { useEffect, useRef, useState } from "react";
import {
  ArcRotateCamera,
  Color3,
  Color4,
  DirectionalLight,
  Engine,
  HemisphericLight,
  MeshBuilder,
  ParticleSystem,
  Scene,
  StandardMaterial,
  Vector3,
} from "@babylonjs/core";
import { PLAYER_COLORS } from "@raceball/shared";

const FX_URL = "/assets/fx/";
const FILES = [
  "fx_dust",
  "fx_bump_sparks",
  "fx_respawn_poof",
  "fx_respawn_stars",
] as const;
type FxName = (typeof FILES)[number];
const TOP_SPEED = 12; // m/s, a lap-pace ball
const ORBIT = 6;

interface FxControls {
  bump(strength: number): void;
  respawn(): void;
  setSpeed(fraction: number): void;
  setSnow(snow: boolean): void;
  setFollow(follow: boolean): void;
  setSlot(slot: number): void;
}

async function loadFx(scene: Scene, name: FxName) {
  const json: unknown = await (await fetch(`${FX_URL}${name}.json`)).json();
  const ps = ParticleSystem.Parse(json, scene, FX_URL, true);
  ps.emitter = Vector3.Zero(); // moved by the caller; never the rolling mesh
  return ps;
}

/** Sets a white-texture system's tint: color1/color2 to the color, colorDead to it at alpha 0. */
function tint(ps: ParticleSystem, hex: string, alpha = 1) {
  const c = Color3.FromHexString(hex);
  ps.color1 = new Color4(c.r, c.g, c.b, alpha);
  ps.color2 = new Color4(c.r, c.g, c.b, alpha);
  ps.colorDead = new Color4(c.r, c.g, c.b, 0);
}

function startScene(canvas: HTMLCanvasElement) {
  const engine = new Engine(canvas, true);
  const scene = new Scene(engine);
  scene.useRightHandedSystem = true;
  scene.clearColor = Color4.FromHexString("#9CCBE6FF");
  new HemisphericLight("sky", new Vector3(0, 1, 0), scene).intensity = 0.7;
  new DirectionalLight("sun", new Vector3(-0.4, -1, 0.35), scene).intensity =
    0.8;
  const camera = new ArcRotateCamera(
    "cam",
    -Math.PI / 2,
    1.05,
    17,
    Vector3.Zero(),
    scene,
  );
  camera.lowerRadiusLimit = 4;
  camera.upperRadiusLimit = 40;
  camera.attachControl(true);

  const paint = (name: string, hex: string) => {
    const m = new StandardMaterial(name, scene);
    m.diffuseColor = Color3.FromHexString(hex);
    m.specularColor = Color3.Black();
    return m;
  };
  const lawn = MeshBuilder.CreateGround(
    "lawn",
    { width: 40, height: 40 },
    scene,
  );
  lawn.material = paint("lawn", "#7FA34A");
  const track = MeshBuilder.CreateDisc(
    "track",
    { radius: ORBIT + 2.5, tessellation: 64 },
    scene,
  );
  track.rotation.x = Math.PI / 2;
  track.position.y = 0.01;
  track.material = paint("asphalt", "#3A3944");
  const ball = MeshBuilder.CreateSphere("ball", { diameter: 1 }, scene);
  ball.material = paint("ball", "#2E6FB7");
  const ring = MeshBuilder.CreateTorus(
    "ring",
    { diameter: 1.5, thickness: 0.09, tessellation: 48 },
    scene,
  );
  ring.parent = ball;
  ring.rotation.x = 0.25;
  const ringPaint = paint("ring", PLAYER_COLORS[0]);
  ring.material = ringPaint;

  const pos = new Vector3(ORBIT, 0.5, 0);
  let angle = 0;
  let speed = TOP_SPEED;
  let fx: Partial<Record<FxName, ParticleSystem>> = {};
  let dustColors: Color4[] = [];
  let slot = 0;
  let snow = false;
  let follow = true;
  let disposed = false;

  const applyLooks = () => {
    ringPaint.diffuseColor = Color3.FromHexString(PLAYER_COLORS[slot]);
    if (fx.fx_respawn_stars) tint(fx.fx_respawn_stars, PLAYER_COLORS[slot]);
    const d = fx.fx_dust;
    if (!d) return;
    if (snow) tint(d, "#F4F6F8", 0.7);
    else [d.color1, d.color2, d.colorDead] = dustColors.map((c) => c.clone());
  };

  void Promise.all(FILES.map((f) => loadFx(scene, f))).then((systems) => {
    if (disposed) return systems.forEach((s) => s.dispose());
    fx = Object.fromEntries(FILES.map((f, i) => [f, systems[i]]));
    const dust = fx.fx_dust!;
    dust.emitter = pos; // the same Vector3 the ball moves, so dust follows it
    dustColors = [dust.color1, dust.color2, dust.colorDead].map((c) =>
      c.clone(),
    );
    applyLooks();
    for (const s of systems) s.start(); // bursts start idle (manualEmitCount 0)
  });

  engine.runRenderLoop(() => {
    const dt = engine.getDeltaTime() / 1000;
    angle += (speed / ORBIT) * dt;
    pos.set(Math.cos(angle) * ORBIT, 0.5, Math.sin(angle) * ORBIT);
    ball.position.copyFrom(pos);
    ball.rotation.y = -angle; // roll with the direction of travel
    ball.rotation.z -= (speed / 0.5) * dt;
    ring.rotation.z = -ball.rotation.z; // the ring stays level, like in the game
    if (follow) {
      // about where the chase camera sits: behind the ball, a little to the side
      camera.target.copyFrom(pos);
      camera.alpha = angle - Math.PI / 2 + 0.5;
    }
    if (fx.fx_dust) fx.fx_dust.emitRate = 24 * Math.min(1, speed / TOP_SPEED);
    scene.render();
  });
  const onResize = () => engine.resize();
  addEventListener("resize", onResize);

  const controls: FxControls = {
    bump(strength) {
      const s = fx.fx_bump_sparks;
      if (!s) return;
      // the contact point is on the outside of the turn, half a ball out
      (s.emitter as Vector3)
        .copyFrom(pos)
        .addInPlace(pos.normalizeToNew().scale(0.5));
      s.manualEmitCount = Math.round(6 + 12 * strength);
    },
    respawn() {
      const poof = fx.fx_respawn_poof;
      const stars = fx.fx_respawn_stars;
      if (!poof || !stars) return;
      (poof.emitter as Vector3).copyFrom(pos);
      (stars.emitter as Vector3).copyFrom(pos);
      poof.manualEmitCount = 10;
      stars.manualEmitCount = 7;
    },
    setSpeed(fraction) {
      speed = TOP_SPEED * fraction;
    },
    setSnow(on) {
      snow = on;
      applyLooks();
    },
    setFollow(on) {
      follow = on;
      camera.radius = on ? 7 : 17;
      camera.beta = on ? 1.2 : 1.05;
      if (!on) {
        camera.target.setAll(0);
        camera.alpha = -Math.PI / 2;
      }
    },
    setSlot(next) {
      slot = next;
      applyLooks();
    },
  };
  const dispose = () => {
    disposed = true;
    removeEventListener("resize", onResize);
    engine.dispose();
  };
  return { controls, dispose };
}

export function FxPreview() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const controls = useRef<FxControls | null>(null);
  const [slot, setSlot] = useState(0);
  const [fast, setFast] = useState(true);
  const [snow, setSnow] = useState(false);
  const [follow, setFollow] = useState(true);

  useEffect(() => {
    const { controls: c, dispose } = startScene(canvasRef.current!);
    controls.current = c;
    return () => {
      controls.current = null;
      dispose();
    };
  }, []);

  useEffect(() => controls.current?.setSlot(slot), [slot]);
  useEffect(() => controls.current?.setSpeed(fast ? 1 : 0.25), [fast]);
  useEffect(() => controls.current?.setSnow(snow), [snow]);
  useEffect(() => controls.current?.setFollow(follow), [follow]);

  return (
    <section className="race-preview">
      <canvas ref={canvasRef} className="fx-canvas" />
      <div className="hud-controls">
        <button type="button" onClick={() => controls.current?.bump(0.3)}>
          Light bump
        </button>
        <button type="button" onClick={() => controls.current?.bump(1)}>
          Hard bump
        </button>
        <button type="button" onClick={() => controls.current?.respawn()}>
          Respawn
        </button>
        <button
          type="button"
          onClick={() => setSlot((s) => (s + 1) % PLAYER_COLORS.length)}
        >
          Player color{" "}
          <span
            className="fx-swatch"
            style={{ background: PLAYER_COLORS[slot] }}
          />
        </button>
        <button type="button" onClick={() => setFast((f) => !f)}>
          {fast ? "Slow down" : "Top speed"}
        </button>
        <button type="button" onClick={() => setSnow((s) => !s)}>
          {snow ? "Normal dust" : "Snow dust"}
        </button>
        <button type="button" onClick={() => setFollow((f) => !f)}>
          {follow ? "Overview" : "Follow ball"}
        </button>
      </div>
    </section>
  );
}
