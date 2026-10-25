import {
  Color3,
  type Mesh,
  MeshBuilder,
  type Scene,
  StandardMaterial,
  TransformNode,
} from "@babylonjs/core";

/** What the views need: game-core's states in local mode, the synced state online */
export interface ItemBoxLike {
  id: string;
  pos: [number, number, number];
  active: boolean;
}
export interface PuddleLike {
  id: string;
  pos: [number, number, number];
  radius: number;
}

const BOX_SIZE = 1.1; // m, the item box prop in the art bible
const BOX_SPIN = 1.2; // rad/s
const BOX_BOB = 0.15; // m up and down
const BOX_HIDE = 6; // 1/s, how fast a hit box shrinks away (and grows back)

/**
 * Item boxes and Creamery Spill puddles. Placeholders until Nuris's animated item box lands:
 * a spinning, bobbing blue cube that shrinks away while the box is hidden, and a flat pink disc.
 */
export class ItemViews {
  private readonly scene: Scene;
  private readonly boxMat: StandardMaterial;
  private readonly puddleMat: StandardMaterial;
  private boxes = new Map<
    string,
    { node: TransformNode; scale: number; active: boolean }
  >();
  private puddles = new Map<string, Mesh>();
  private time = 0;

  constructor(scene: Scene) {
    this.scene = scene;
    this.boxMat = new StandardMaterial("mat_itembox", scene);
    this.boxMat.diffuseColor = Color3.FromHexString("#1f6fd6");
    this.boxMat.emissiveColor = Color3.FromHexString("#0b2f66");
    this.boxMat.alpha = 0.9;
    this.puddleMat = new StandardMaterial("mat_spill", scene);
    this.puddleMat.diffuseColor = Color3.FromHexString("#f2a7bd");
    this.puddleMat.specularColor = new Color3(0.4, 0.4, 0.4);
  }

  sync(boxes: ItemBoxLike[], puddles: PuddleLike[]): void {
    for (const b of boxes) {
      let view = this.boxes.get(b.id);
      if (!view) {
        const node = new TransformNode(`itembox-${b.id}`, this.scene);
        const cube = MeshBuilder.CreateBox(
          `itembox-cube-${b.id}`,
          { size: BOX_SIZE },
          this.scene,
        );
        cube.material = this.boxMat;
        cube.parent = node;
        node.position.set(...b.pos); // the marker is the box's center
        view = { node, scale: 1, active: b.active };
        this.boxes.set(b.id, view);
      }
      view.active = b.active;
    }
    const live = new Set(puddles.map((d) => d.id));
    for (const [id, mesh] of this.puddles)
      if (!live.has(id)) {
        mesh.dispose();
        this.puddles.delete(id);
      }
    for (const d of puddles) {
      if (this.puddles.has(d.id)) continue;
      const disc = MeshBuilder.CreateCylinder(
        `spill-${d.id}`,
        { diameter: d.radius * 2, height: 0.04, tessellation: 24 },
        this.scene,
      );
      disc.material = this.puddleMat;
      disc.position.set(d.pos[0], d.pos[1] + 0.03, d.pos[2]); // just above the road
      disc.receiveShadows = true;
      this.puddles.set(d.id, disc);
    }
  }

  /** Spin and bob every box; hidden boxes shrink to nothing and grow back when they return */
  update(dt: number): void {
    this.time += dt;
    const k = 1 - Math.exp(-BOX_HIDE * dt);
    for (const view of this.boxes.values()) {
      view.scale += ((view.active ? 1 : 0) - view.scale) * k;
      const s = Math.max(view.scale, 0.001);
      view.node.scaling.set(s, s, s);
      view.node.rotation.y = this.time * BOX_SPIN;
      view.node.getChildMeshes()[0].position.y =
        Math.sin(this.time * 2) * BOX_BOB;
    }
  }

  dispose(): void {
    for (const view of this.boxes.values()) view.node.dispose();
    for (const mesh of this.puddles.values()) mesh.dispose();
    this.boxes.clear();
    this.puddles.clear();
    this.boxMat.dispose();
    this.puddleMat.dispose();
  }
}
