import {
  type AbstractMesh,
  type AssetContainer,
  Color3,
  DynamicTexture,
  LoadAssetContainerAsync,
  type Material,
  MeshBuilder,
  PBRMaterial,
  Quaternion,
  Scene,
  ShadowGenerator,
  StandardMaterial,
  TransformNode,
} from "@babylonjs/core";
import { BALL_RADIUS } from "@raceball/game-core";
import { PLAYER_COLORS, type GameEvent } from "@raceball/shared";

/** One ball's rendered transform. The same shape comes from local mode and (later) from Rasim's net library. */
export interface BallPose {
  p: [number, number, number];
  q: [number, number, number, number];
  h: number;
}

/** What a ball wears: its planet (`PLANETS` id) and its player color slot (index into `PLAYER_COLORS`). */
export interface BallLook {
  ball: string;
  color: number;
}

/** Where ball transforms come from each frame: local mode, or interpolated server snapshots. */
export interface BallFeed {
  readonly ownId: string | null;
  sample(now: number): Map<string, BallPose>;
  /** Without a look, balls get a planet and a color in the order they appear. */
  look?(id: string): BallLook | undefined;
  /** Game events since the last call, for the effects (fx.ts) */
  drainEvents?(): GameEvent[];
}

/** Planets with a model in `assets/models/ball_<planet>.glb`. Mercury, Venus, Uranus and Neptune come in M3. */
export const PLANET_MODELS: readonly string[] = [
  "earth",
  "mars",
  "jupiter",
  "saturn",
];

export type LoadBallModel = (
  planet: string,
  scene: Scene,
) => Promise<AssetContainer>;

const loadFromAssets: LoadBallModel = (planet, scene) =>
  LoadAssetContainerAsync(
    `${import.meta.env.BASE_URL}assets/models/ball_${planet}.glb`,
    scene,
  );

interface BallView {
  key: string;
  /** Follows the ball's position only, so the orbit ring floats level */
  root: TransformNode;
  /** Rolls with the ball */
  body: TransformNode;
  /** The tinted copy of `mat_player_color`, owned by this ball */
  ringMaterial?: Material;
  disposed: boolean;
}

/**
 * Ball meshes, created for new ids and disposed for ids that left.
 * Each ball is its planet model rolling inside a node that only follows the position, which holds the orbit ring
 * in the player color. A plain striped ball stands in while the model loads, and for planets without a model yet,
 * which still wear the ring.
 */
export class BallViews {
  private readonly scene: Scene;
  private readonly shadows?: ShadowGenerator;
  private readonly load: LoadBallModel;
  private views = new Map<string, BallView>();
  private models = new Map<string, Promise<AssetContainer>>();
  private created = 0;

  constructor(
    scene: Scene,
    shadows?: ShadowGenerator,
    load: LoadBallModel = loadFromAssets,
  ) {
    this.scene = scene;
    this.shadows = shadows;
    this.load = load;
  }

  sync(
    poses: Map<string, BallPose>,
    lookOf?: (id: string) => BallLook | undefined,
  ): void {
    for (const [id, view] of this.views) {
      if (!poses.has(id)) this.remove(id, view);
    }
    for (const [id, pose] of poses) {
      let view = this.views.get(id);
      const look = lookOf?.(id);
      if (view && look && view.key !== lookKey(look)) {
        this.remove(id, view);
        view = undefined;
      }
      if (!view) {
        const index = this.created++;
        view = this.create(
          id,
          look ?? {
            ball: PLANET_MODELS[index % PLANET_MODELS.length],
            color: index % PLAYER_COLORS.length,
          },
        );
        this.views.set(id, view);
      }
      view.root.position.set(...pose.p);
      view.body.rotationQuaternion!.set(...pose.q);
    }
  }

  dispose(): void {
    this.sync(new Map());
    for (const model of this.models.values())
      void model.then((container) => container.dispose()).catch(() => {});
    this.models.clear();
  }

  private create(id: string, look: BallLook): BallView {
    const color = PLAYER_COLORS[look.color] ?? PLAYER_COLORS[0];
    const root = new TransformNode(`ball-${id}`, this.scene);
    const body = new TransformNode(`ball-${id}-body`, this.scene);
    body.parent = root;
    body.rotationQuaternion = new Quaternion();
    const view: BallView = { key: lookKey(look), root, body, disposed: false };
    const placeholder = this.placeholder(id, color);
    placeholder.parent = body;

    const hasModel = PLANET_MODELS.includes(look.ball);
    // planets without a model yet borrow the ring from the first model file
    this.model(hasModel ? look.ball : PLANET_MODELS[0])
      .then((container) => {
        if (view.disposed) return;
        // clones, not instances: each ring needs its own tinted material
        const entries = container.instantiateModelsToScene(
          (name) => `${name}-${id}`,
          false,
          { doNotInstantiate: true },
        );
        for (const node of entries.rootNodes) {
          for (const mesh of node.getChildMeshes()) {
            const isRing = mesh.name === `ring-${id}`;
            if (!isRing && !hasModel) continue;
            mesh.parent = isRing ? root : body;
            if (isRing) this.tint(view, mesh, color);
            this.shadows?.addShadowCaster(mesh);
          }
          node.dispose(); // the glTF root, now empty (or holding an unused planet)
        }
        if (hasModel) this.disposeMesh(placeholder);
      })
      .catch((error: unknown) => {
        console.warn(`Ball model for ${look.ball} failed to load`, error);
      });
    return view;
  }

  private model(planet: string): Promise<AssetContainer> {
    let model = this.models.get(planet);
    if (!model) {
      model = this.load(planet, this.scene);
      this.models.set(planet, model);
      model.catch(() => this.models.delete(planet)); // a later ball retries
    }
    return model;
  }

  private tint(view: BallView, ring: AbstractMesh, color: string): void {
    const source = ring.material;
    if (!(source instanceof PBRMaterial)) return;
    const material = source.clone(`${source.name}-${view.root.name}`);
    material.albedoColor = Color3.FromHexString(color).toLinearSpace();
    ring.material = view.ringMaterial = material;
  }

  private remove(id: string, view: BallView): void {
    view.disposed = true;
    for (const mesh of view.root.getChildMeshes()) this.disposeMesh(mesh);
    view.ringMaterial?.dispose();
    view.root.dispose();
    this.views.delete(id);
  }

  private disposeMesh(mesh: AbstractMesh): void {
    this.shadows?.removeShadowCaster(mesh);
    if (mesh.name.startsWith("placeholder-"))
      mesh.material?.dispose(true, true);
    mesh.dispose();
  }

  private placeholder(id: string, color: string): AbstractMesh {
    const mesh = MeshBuilder.CreateSphere(
      `placeholder-${id}`,
      { diameter: BALL_RADIUS * 2, segments: 24 },
      this.scene,
    );
    const mat = new StandardMaterial(`placeholder-${id}`, this.scene);
    mat.diffuseTexture = stripedTexture(this.scene, color);
    mat.specularColor = new Color3(0.3, 0.3, 0.3);
    mesh.material = mat;
    this.shadows?.addShadowCaster(mesh);
    return mesh;
  }
}

function lookKey(look: BallLook): string {
  return `${look.ball}:${look.color}`;
}

/** A colored ball with a white equator and meridian, so you can see it roll. */
function stripedTexture(scene: Scene, color: string): DynamicTexture {
  const tex = new DynamicTexture(
    "ball-stripes",
    { width: 256, height: 128 },
    scene,
    true,
  );
  const ctx = tex.getContext();
  ctx.fillStyle = color;
  ctx.fillRect(0, 0, 256, 128);
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 56, 256, 16); // equator
  ctx.fillRect(0, 0, 12, 128); // meridian
  ctx.fillRect(122, 0, 12, 128); // the opposite meridian
  tex.update();
  return tex;
}
