import {
  Color3,
  DynamicTexture,
  Mesh,
  MeshBuilder,
  Quaternion,
  Scene,
  ShadowGenerator,
  StandardMaterial,
} from "@babylonjs/core";
import { BALL_RADIUS } from "@raceball/game-core";

/** One ball's rendered transform. The same shape comes from local mode and (later) from Rasim's net library. */
export interface BallPose {
  p: [number, number, number];
  q: [number, number, number, number];
  h: number;
}

/** Where ball transforms come from each frame: local mode, or interpolated server snapshots. */
export interface BallFeed {
  readonly ownId: string | null;
  sample(now: number): Map<string, BallPose>;
}

// Placeholder colors until Nuris's art bible picks the 8 player colors and skins
const PLACEHOLDER_COLORS = [
  "#1e5aa8",
  "#e63946",
  "#f4a261",
  "#2a9d8f",
  "#9b5de5",
  "#f15bb5",
  "#00bbf9",
  "#80b918",
];

/** Ball meshes, created for new ids and disposed for ids that left. */
export class BallViews {
  private readonly scene: Scene;
  private readonly shadows?: ShadowGenerator;
  private meshes = new Map<string, Mesh>();
  private created = 0;

  constructor(scene: Scene, shadows?: ShadowGenerator) {
    this.scene = scene;
    this.shadows = shadows;
  }

  sync(poses: Map<string, BallPose>): void {
    for (const [id, mesh] of this.meshes) {
      if (!poses.has(id)) {
        this.shadows?.removeShadowCaster(mesh);
        mesh.material?.dispose(true, true);
        mesh.dispose();
        this.meshes.delete(id);
      }
    }
    for (const [id, pose] of poses) {
      let mesh = this.meshes.get(id);
      if (!mesh) {
        mesh = this.createBall(
          id,
          PLACEHOLDER_COLORS[this.created++ % PLACEHOLDER_COLORS.length],
        );
        this.meshes.set(id, mesh);
      }
      mesh.position.set(...pose.p);
      mesh.rotationQuaternion ??= new Quaternion();
      mesh.rotationQuaternion.set(...pose.q);
    }
  }

  dispose(): void {
    this.sync(new Map());
  }

  private createBall(id: string, color: string): Mesh {
    const mesh = MeshBuilder.CreateSphere(
      `ball-${id}`,
      { diameter: BALL_RADIUS * 2, segments: 24 },
      this.scene,
    );
    const mat = new StandardMaterial(`ball-${id}`, this.scene);
    mat.diffuseTexture = stripedTexture(this.scene, color);
    mat.specularColor = new Color3(0.3, 0.3, 0.3);
    mesh.material = mat;
    this.shadows?.addShadowCaster(mesh);
    return mesh;
  }
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
