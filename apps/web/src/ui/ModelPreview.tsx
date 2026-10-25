// Dev-only: every model Nuris builds, in the game's engine and light, for review against the art bible.
// Planets wear their orbit ring in a player color; props play their animations by name. For /ui.
import { useEffect, useRef, useState } from "react";
import {
  ArcRotateCamera,
  type AssetContainer,
  Color3,
  Color4,
  CubeTexture,
  DirectionalLight,
  Engine,
  HemisphericLight,
  LoadAssetContainerAsync,
  MeshBuilder,
  type Node,
  PBRMaterial,
  PointerEventTypes,
  Scene,
  ShadowGenerator,
  StandardMaterial,
  TransformNode,
  Vector3,
} from "@babylonjs/core";
import "@babylonjs/loaders/glTF";
import { PLANETS, PLAYER_COLORS } from "@raceball/shared";
import { REPLACED } from "../game/landmarks";

interface Shelf {
  label: string;
  /** Files under public/assets, each placed along a row */
  files: string[];
  /** Spacing between them, m */
  gap: number;
  /** Where the camera starts: radius, m */
  radius: number;
  /** Planets: tint each `ring` mesh in the next player color */
  rings?: boolean;
  /** Camera radius when you click a model to look closer */
  close: number;
  /** A kit file holds every prop at the origin: place its root nodes by name, [x, z, turn] */
  place?: Record<string, [number, number, number?]>;
  /** Where the camera looks, m */
  target?: [number, number, number];
  /** Meshes to hide, by name prefix (greybox pieces a layer replaces) */
  hide?: string[];
  /** Which way the camera starts looking (ArcRotateCamera alpha); default from the south-west */
  alpha?: number;
  /** A whole map: no shadow casting, as in the game (only balls cast), or a 400 m shadow map draws it all dark */
  map?: boolean;
}

const SHELVES: Shelf[] = [
  {
    label: "Planets",
    files: PLANETS.map((p) => `models/ball_${p}.glb`),
    gap: 1.6,
    radius: 9,
    rings: true,
    close: 2.6,
  },
  {
    label: "Props",
    files: ["models/kit_animated.glb"],
    gap: 0,
    radius: 21,
    close: 5,
    target: [0, 2.5, 3],
    // a little race-day scene: the arch, flags either side, an item box on the line, fans watching
    place: {
      prop_finish_arch_animated: [0, 8],
      prop_flag_checker: [-9.5, 6],
      prop_flag_bluewhite: [9.5, 6],
      prop_item_box: [0, 2],
      prop_crowd_card_a: [-5.2, -1.5, Math.PI],
      prop_crowd_card_b: [-4.2, -1.8, Math.PI],
      prop_crowd_card_c: [-3.2, -1.5, Math.PI],
    },
  },
  {
    // the landmarks layer over Ali's map, as the game shows it (game/landmarks.ts)
    label: "Landmarks",
    files: ["maps/happy_valley.glb", "maps/happy_valley_landmarks.glb"],
    gap: 0,
    radius: 150,
    close: 60,
    target: [195, 8, 50],
    hide: REPLACED,
    alpha: Math.PI / 2 + 0.5, // from the south, as the race comes in: the scoreboard faces you
    map: true,
  },
];

const ASSETS = `${import.meta.env.BASE_URL}assets/`;

function startScene(canvas: HTMLCanvasElement, shelf: Shelf) {
  const engine = new Engine(canvas, true);
  const scene = new Scene(engine);
  scene.useRightHandedSystem = true;
  scene.clearColor = Color4.FromHexString("#9CCBE6FF");
  const sky = new HemisphericLight("sky", new Vector3(0, 1, 0), scene);
  sky.intensity = 0.3;
  const sun = new DirectionalLight("sun", new Vector3(-0.4, -1, 0.35), scene);
  sun.position = new Vector3(20, 40, -20);
  sun.intensity = 0.9;
  const shadows = new ShadowGenerator(1024, sun);
  shadows.usePercentageCloserFiltering = true;
  // the game's sky HDRI, so the PBR models are lit as on the track. Fetched with an abort signal as in
  // game.ts: in dev React mounts twice, and a load that lands on a disposed engine turns the next one black
  const abort = new AbortController();
  void fetch(`${ASSETS}tex/env_happy_valley.env`, { signal: abort.signal })
    .then((res) => res.blob())
    .then((blob) => {
      const url = URL.createObjectURL(blob);
      const env = CubeTexture.CreateFromPrefilteredData(url, scene, ".env");
      env.onLoadObservable.addOnce(() => URL.revokeObjectURL(url));
      scene.environmentTexture = env;
      scene.environmentIntensity = 0.6;
    })
    .catch(() => {}); // aborted, or no sky: the lights still show the models

  const width = (shelf.files.length - 1) * shelf.gap;
  const ground = MeshBuilder.CreateGround(
    "lawn",
    { width: width + 80, height: 80 },
    scene,
  );
  const lawn = new StandardMaterial("lawn", scene);
  lawn.diffuseColor = Color3.FromHexString("#7FA34A");
  lawn.specularColor = Color3.Black();
  ground.material = lawn;
  ground.receiveShadows = true;

  const camera = new ArcRotateCamera(
    "cam",
    shelf.alpha ?? -Math.PI / 2,
    1.15,
    shelf.radius,
    shelf.target ? Vector3.FromArray(shelf.target) : new Vector3(0, 0.6, 0),
    scene,
  );
  camera.lowerRadiusLimit = 1.5;
  camera.upperRadiusLimit = 400;
  camera.minZ = 0.05;
  camera.maxZ = 3000;
  camera.wheelDeltaPercentage = 0.01;
  camera.attachControl(true);

  let disposed = false;
  const containers: AssetContainer[] = [];
  const spinners: TransformNode[] = [];
  const roots: TransformNode[] = [];
  shelf.files.forEach((file, i) => {
    void LoadAssetContainerAsync(`${ASSETS}${file}`, scene).then(
      (container) => {
        if (disposed) return container.dispose();
        containers.push(container);
        container.addAllToScene();
        const root = new TransformNode(file, scene);
        root.position.x = i * shelf.gap - width / 2;
        roots.push(root);
        for (const node of container.rootNodes) node.parent = root;
        for (const [name, [x, z, turn]] of Object.entries(shelf.place ?? {})) {
          const prop = scene.getTransformNodeByName(name);
          if (!prop) continue;
          prop.position.set(x, 0, z);
          prop.rotationQuaternion = null;
          prop.rotation.y = turn ?? 0;
          roots.push(prop); // click a prop to look closer
        }
        for (const mesh of container.meshes) {
          if (!shelf.map) shadows.addShadowCaster(mesh);
          mesh.receiveShadows = !shelf.map;
          if (!shelf.rings || mesh.name !== "ring") continue;
          const tinted = (mesh.material as PBRMaterial).clone(`ring-${i}`);
          tinted.albedoColor = Color3.FromHexString(
            PLAYER_COLORS[i % PLAYER_COLORS.length],
          ).toLinearSpace();
          mesh.material = tinted;
        }
        if (shelf.rings) {
          root.position.y = 0.5; // a 1 m ball resting on the lawn
          spinners.push(root);
        }
        for (const group of container.animationGroups) group.play(true);
        for (const mesh of container.meshes)
          if (shelf.hide?.some((prefix) => mesh.name.startsWith(prefix)))
            mesh.setEnabled(false);
      },
      (error: unknown) => console.warn(`${file} failed to load`, error),
    );
  });

  // click a model to glide in on it; click the lawn to go back to the whole shelf
  const home = camera.target.clone();
  let goal = { target: home, radius: shelf.radius };
  let gliding = false;
  scene.onPointerObservable.add((info) => {
    if (info.type !== PointerEventTypes.POINTERTAP) return;
    let node = info.pickInfo?.pickedMesh as Node | null | undefined;
    while (node && !roots.includes(node as TransformNode)) node = node.parent;
    const root = node as TransformNode | undefined;
    goal = root
      ? {
          target: root
            .getAbsolutePosition()
            .add(new Vector3(0, shelf.rings ? 0 : 1, 0)),
          radius: shelf.close,
        }
      : { target: home, radius: shelf.radius };
    gliding = true;
  });

  engine.runRenderLoop(() => {
    const dt = engine.getDeltaTime() / 1000;
    if (gliding) {
      const k = 1 - Math.exp(-6 * dt);
      camera.target = Vector3.Lerp(camera.target, goal.target, k);
      camera.radius += (goal.radius - camera.radius) * k;
      if (Math.abs(goal.radius - camera.radius) < 0.01) gliding = false;
    }
    // planets turn slowly, so every painted detail comes round
    for (const s of spinners) {
      const ball = s.getChildMeshes().find((m) => m.name !== "ring");
      ball?.addRotation(0, dt * 0.5, 0);
    }
    scene.render();
  });
  const onResize = () => engine.resize();
  addEventListener("resize", onResize);
  return () => {
    disposed = true;
    abort.abort();
    removeEventListener("resize", onResize);
    engine.dispose();
  };
}

export function ModelPreview() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [shelf, setShelf] = useState(0);

  useEffect(() => startScene(canvasRef.current!, SHELVES[shelf]), [shelf]);

  return (
    <section className="race-preview">
      <canvas ref={canvasRef} className="fx-canvas" />
      <div className="hud-controls">
        {SHELVES.map((s, i) => (
          <button
            key={s.label}
            type="button"
            aria-pressed={i === shelf}
            onClick={() => setShelf(i)}
          >
            {s.label}
          </button>
        ))}
      </div>
    </section>
  );
}
