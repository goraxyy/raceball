import {
  ArcRotateCamera,
  type AssetContainer,
  Color3,
  Color4,
  DynamicTexture,
  ImageProcessingConfiguration,
  type InstancedMesh,
  LoadAssetContainerAsync,
  type Material,
  PBRMaterial,
  Mesh,
  MeshBuilder,
  Scene,
  StandardMaterial,
  Texture,
} from "@babylonjs/core";

/**
 * The world around the track: the grass board with its chasms, the causeways under the raised road and the hills
 * (tools/models/build_world.py, from the same JSON as game-core's ground colliders), and the sky over it.
 * Happy Valley is a diorama floating in a fall sky: through the gorge and past the board's edges you see the sky
 * and clouds underneath.
 */
export const WORLD_FILE = "assets/maps/happy_valley_world.glb";

/** A clear October afternoon: deep blue overhead, a pale warm haze on the horizon (art bible, docs/ASSETS.md) */
export const SKY_COLORS = {
  zenith: "#3E7FCB",
  high: "#77AEE3",
  horizon: "#E9EEE8",
  below: "#A9C6DF",
} as const;
const FOG_START = 220; // m: the far hills and Mount Nittany soften, the track never does
const FOG_END = 1400;
const DOME = 2600; // m across; it follows the camera
/** Where the clouds circle: the board's middle, and how far out (they never pass over the track) */
const BOARD_CENTER = { x: 120, z: 90 };
const RING = [380, 760];
const CLOUD_SPEED = 2.5; // m/s along the ring, a lazy drift

/** Deterministic, so every screen in the room sees the same sky */
function random(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** The dome's colors, top to bottom of its texture (v = 1 is straight up on Babylon's sphere) */
function skyTexture(scene: Scene): DynamicTexture {
  const tex = new DynamicTexture(
    "sky-gradient",
    { width: 4, height: 256 },
    scene,
    false,
  );
  const ctx = tex.getContext();
  const g = ctx.createLinearGradient(0, 0, 0, 256);
  g.addColorStop(0, SKY_COLORS.zenith);
  g.addColorStop(0.3, SKY_COLORS.high);
  g.addColorStop(0.49, SKY_COLORS.horizon);
  g.addColorStop(0.53, SKY_COLORS.horizon);
  g.addColorStop(0.75, SKY_COLORS.below);
  g.addColorStop(1, SKY_COLORS.high);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 4, 256);
  tex.update(false);
  tex.wrapU = tex.wrapV = Texture.CLAMP_ADDRESSMODE;
  return tex;
}

/**
 * A toy cloud: a flat-bottomed heap of faceted puffs, the middle one biggest. Built once per kind and instanced.
 * Flat shading and a cool emissive keep the undersides lilac-grey instead of dark.
 */
function cloudKind(
  scene: Scene,
  rand: () => number,
  index: number,
  mat: StandardMaterial,
): Mesh {
  const puffs: Mesh[] = [];
  const count = 4 + Math.floor(rand() * 4);
  for (let i = 0; i < count; i++) {
    const t = count === 1 ? 0 : i / (count - 1) - 0.5;
    const r = 7 + (1 - Math.abs(t) * 1.6) * 6 + rand() * 3;
    const puff = MeshBuilder.CreateIcoSphere(
      `cloud-puff-${index}-${i}`,
      { radius: r, subdivisions: 2, flat: true },
      scene,
    );
    puff.position.set(
      t * 34 + (rand() - 0.5) * 4,
      r * 0.35,
      (rand() - 0.5) * 10,
    );
    puff.scaling.y = 0.72;
    puffs.push(puff);
  }
  // a flat underside: a squashed puff along the base
  const base = MeshBuilder.CreateIcoSphere(
    `cloud-base-${index}`,
    { radius: 1, subdivisions: 2, flat: true },
    scene,
  );
  base.scaling.set(24, 3, 9);
  base.position.y = 1;
  puffs.push(base);
  const cloud = Mesh.MergeMeshes(puffs, true, true)!;
  cloud.name = `cloud-${index}`;
  cloud.material = mat;
  cloud.isPickable = false;
  cloud.setEnabled(false); // the kinds stay hidden; their instances fly
  return cloud;
}

export interface Sky {
  update(dt: number): void;
  dispose(): void;
}

/**
 * The sky: a gradient dome, haze in its horizon color, the tone of the light, and toy clouds circling the board,
 * high ones round the horizon and a deck of them below the board (seen through the gorge and over the edges).
 */
export function createSky(scene: Scene): Sky {
  const horizon = Color3.FromHexString(SKY_COLORS.horizon);
  scene.clearColor = new Color4(horizon.r, horizon.g, horizon.b, 1);
  scene.fogMode = Scene.FOGMODE_LINEAR;
  scene.fogColor = horizon;
  scene.fogStart = FOG_START;
  scene.fogEnd = FOG_END;
  // the neutral tone map keeps the palette's colors where the art bible puts them and rolls off the sun's highlights
  const ip = scene.imageProcessingConfiguration;
  ip.toneMappingEnabled = true;
  ip.toneMappingType = ImageProcessingConfiguration.TONEMAPPING_KHR_PBR_NEUTRAL;
  ip.exposure = 1.08;
  ip.contrast = 1.12;

  const dome = MeshBuilder.CreateSphere(
    "sky-dome",
    { diameter: DOME, segments: 24, sideOrientation: Mesh.BACKSIDE },
    scene,
  );
  const domeMat = new StandardMaterial("mat_sky", scene);
  domeMat.emissiveTexture = skyTexture(scene);
  domeMat.disableLighting = true;
  domeMat.backFaceCulling = false;
  dome.material = domeMat;
  dome.infiniteDistance = true;
  dome.applyFog = false;
  dome.isPickable = false;
  dome.renderingGroupId = 0;

  const cloudMat = new StandardMaterial("mat_cloud", scene);
  cloudMat.diffuseColor = new Color3(1, 1, 1);
  cloudMat.emissiveColor = Color3.FromHexString("#B9BFD6");
  cloudMat.specularColor = Color3.Black();
  const rand = random(1855); // the year Penn State was founded
  const kinds = [0, 1, 2, 3].map((i) => cloudKind(scene, rand, i, cloudMat));
  const clouds: {
    mesh: InstancedMesh;
    radius: number;
    angle: number;
    speed: number;
  }[] = [];
  const add = (
    n: number,
    height: [number, number],
    ring: number[],
    scale: [number, number],
  ) => {
    for (let i = 0; i < n; i++) {
      const kind = kinds[clouds.length % kinds.length];
      const mesh = kind.createInstance(`${kind.name}-${clouds.length}`);
      const s = scale[0] + rand() * (scale[1] - scale[0]);
      mesh.scaling.set(s, s * (0.8 + rand() * 0.4), s);
      mesh.position.y = height[0] + rand() * (height[1] - height[0]);
      mesh.rotation.y = rand() * Math.PI * 2;
      mesh.isPickable = false;
      const radius = ring[0] + rand() * (ring[1] - ring[0]);
      clouds.push({
        mesh,
        radius,
        angle: (i / n) * Math.PI * 2 + rand() * 0.4,
        speed: CLOUD_SPEED / radius,
      });
    }
  };
  add(22, [70, 170], RING, [1.4, 2.6]); // round the horizon
  add(12, [-190, -110], [60, 460], [1.8, 3.2]); // the deck under the board, seen through the gorge and past the edges
  const place = () => {
    for (const c of clouds) {
      c.mesh.position.x = BOARD_CENTER.x + Math.cos(c.angle) * c.radius;
      c.mesh.position.z = BOARD_CENTER.z + Math.sin(c.angle) * c.radius;
    }
  };
  place();
  // the haze starts past what the camera is looking at: the overview, hundreds of meters up, sees the board clear
  const haze = scene.onBeforeCameraRenderObservable.add((camera) => {
    const far = camera instanceof ArcRotateCamera ? camera.radius : 0;
    scene.fogStart = FOG_START + far;
    scene.fogEnd = FOG_END + far;
  });
  return {
    update(dt) {
      for (const c of clouds) c.angle += c.speed * dt;
      place();
    },
    dispose() {
      haze.remove();
      for (const c of clouds) c.mesh.dispose();
      for (const kind of kinds) kind.dispose();
      cloudMat.dispose();
      dome.dispose();
      domeMat.emissiveTexture?.dispose();
      domeMat.dispose();
      scene.fogMode = Scene.FOGMODE_NONE;
    },
  };
}

/**
 * A toy finish for Ali's flat greybox materials, by name: painted rails and blocks with a lacquer coat, Kenney
 * pieces like moulded plastic. [name pattern, roughness, clear coat (0 for none)]
 */
const GREYBOX_FINISH: [RegExp, number, number][] = [
  [/^mat_(chalk|navy)$/, 0.42, 0.55],
  [/^(grey|red|road|_defaultMat)/, 0.5, 0.3],
  [/^colormap/, 0.85, 0], // the Kenney trees share it: leaves aren't lacquered
  [/^mat_(pollock|library|lionshrine|icecream|cone|fall|boost)$/, 0.6, 0.25],
];

/** Gives the greybox map's materials their finish (see GREYBOX_FINISH) */
export function finishGreybox(map: AssetContainer): void {
  for (const mat of map.materials) {
    if (!(mat instanceof PBRMaterial)) continue;
    const finish = GREYBOX_FINISH.find(([pattern]) => pattern.test(mat.name));
    if (!finish) continue;
    const [, roughness, coat] = finish;
    mat.roughness = roughness;
    if (coat > 0) {
      mat.clearCoat.isEnabled = true;
      mat.clearCoat.intensity = coat;
      mat.clearCoat.roughness = 0.15;
    }
  }
}

/** The road's surface over the greybox road: its meshes, by name prefix in the world file */
export const ROAD_SURFACE = ["road_", "kerbs", "start_line"];
/**
 * How far the road's surface is pulled toward the camera (polygon offset): it lies 2.5 cm over the greybox road,
 * which the depth buffer can't tell apart from hundreds of meters up
 */
const ROAD_PULL = -4;

/**
 * Past this distance a tree is a few pixels, and there are hundreds of them: they stop drawing (the haze and the
 * hills behind fill in), m
 */
const TREE_DRAW_DISTANCE = 220;

/** Loads the ground board, causeways, hills and the road's surface into the scene, frozen (the world never moves) */
export async function loadWorld(
  scene: Scene,
  isDisposed: () => boolean,
): Promise<AssetContainer | undefined> {
  const world = await LoadAssetContainerAsync(
    `${import.meta.env.BASE_URL}${WORLD_FILE}`,
    scene,
  );
  if (isDisposed()) {
    world.dispose();
    return undefined;
  }
  world.addAllToScene();
  const pulled = new Map<Material, Material>();
  for (const mesh of world.meshes) {
    if (mesh.getTotalVertices() === 0) continue;
    if (mesh instanceof Mesh && /^tree_/.test(mesh.name))
      mesh.addLODLevel(TREE_DRAW_DISTANCE, null); // their instances follow the mesh they copy
    if (mesh.material && ROAD_SURFACE.some((p) => mesh.name.startsWith(p))) {
      // the kerbs share the trees' palette material: they get a copy of their own to pull
      let mat = pulled.get(mesh.material);
      if (!mat) {
        mat = mesh.material.name.startsWith("mat_road_")
          ? mesh.material
          : mesh.material.clone(`${mesh.material.name}_road`)!;
        mat.zOffset = ROAD_PULL;
        mat.zOffsetUnits = ROAD_PULL;
        pulled.set(mesh.material, mat);
        if (mat !== mesh.material) world.materials.push(mat); // so the container disposes the copy
      }
      mesh.material = mat;
    }
    mesh.receiveShadows = true;
    mesh.isPickable = false;
    mesh.computeWorldMatrix(true);
    mesh.freezeWorldMatrix();
  }
  return world;
}

/** The sun and sky lights in the afternoon's colors: a warm sun, a blue sky fill, grass-green bounce from below */
export function tintLights(
  sun: { diffuse: Color3; specular: Color3; intensity: number },
  sky: {
    diffuse: Color3;
    groundColor: Color3;
    intensity: number;
  },
): void {
  sun.diffuse = Color3.FromHexString("#FFF0D9");
  sun.specular = Color3.FromHexString("#FFF0D9");
  sun.intensity = 1.05;
  sky.diffuse = Color3.FromHexString("#D6E6FF");
  sky.groundColor = Color3.FromHexString("#7D8A55");
  sky.intensity = 0.4;
}
