import {
  type AssetContainer,
  Color3,
  LoadAssetContainerAsync,
  type Mesh,
  MeshBuilder,
  Node,
  PBRMaterial,
  type Scene,
  StandardMaterial,
  TransformNode,
  VertexBuffer,
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

/** Nuris's animated props: the item box is prop_item_box, its center 0.75 m over its root */
const KIT_FILE = "assets/models/kit_animated.glb";
const KIT_BOX = "prop_item_box";
const KIT_BOX_CENTER = 0.75;

/**
 * Item boxes and Creamery Spill puddles. The boxes are the flag-yellow crate from the animated props kit
 * (tools/models/build_animated_props.py), spinning and bobbing, shrinking away while hidden; until the kit is in
 * (or if it fails) they're plain blue cubes. A puddle is a glossy splat of melted strawberry ice cream.
 */
export class ItemViews {
  private readonly scene: Scene;
  private readonly boxMat: StandardMaterial;
  private readonly puddleMat: PBRMaterial;
  private kit?: AssetContainer;
  private template?: TransformNode;
  private boxes = new Map<
    string,
    {
      node: TransformNode;
      /** What bobs and spins: the kit's bob node and spinning crate, or the cube */
      bob: TransformNode;
      spin: TransformNode;
      scale: number;
      active: boolean;
      kit: boolean;
    }
  >();
  private puddles = new Map<string, Mesh>();
  private time = 0;
  private disposed = false;

  constructor(scene: Scene) {
    this.scene = scene;
    this.boxMat = new StandardMaterial("mat_itembox", scene);
    this.boxMat.diffuseColor = Color3.FromHexString("#1f6fd6");
    this.boxMat.emissiveColor = Color3.FromHexString("#0b2f66");
    this.boxMat.alpha = 0.9;
    // melted strawberry ice cream: wet and shiny
    this.puddleMat = new PBRMaterial("mat_spill", scene);
    this.puddleMat.albedoColor = Color3.FromHexString("#EE8FAE");
    this.puddleMat.metallic = 0;
    this.puddleMat.roughness = 0.18;
    this.puddleMat.clearCoat.isEnabled = true;
    this.puddleMat.clearCoat.intensity = 0.8;
  }

  /** Loads the kit's item box; boxes already out swap over to it */
  async load(): Promise<void> {
    const kit = await LoadAssetContainerAsync(
      `${import.meta.env.BASE_URL}${KIT_FILE}`,
      this.scene,
    );
    if (this.disposed) {
      kit.dispose();
      return;
    }
    // only the item box joins the scene (landmarks.ts takes the arch and flags from its own copy)
    kit.addToScene((entity: unknown) =>
      entity instanceof Node ? isBoxNode(entity) : true,
    );
    const template = kit.transformNodes.find((n) => n.name === KIT_BOX);
    if (!template) {
      kit.dispose();
      return;
    }
    for (const mesh of template.getChildMeshes()) {
      mesh.isVisible = false; // the template stays at the origin: its instances draw it
      mesh.receiveShadows = true;
    }
    for (const group of kit.animationGroups) group.stop(); // the views animate each box themselves
    this.kit = kit;
    this.template = template;
    for (const [id, view] of this.boxes) {
      if (view.kit) continue;
      const pos = view.node.position;
      view.node.dispose();
      this.boxes.delete(id);
      this.addBox(id, [pos.x, pos.y, pos.z], view.active, view.scale);
    }
  }

  sync(boxes: ItemBoxLike[], puddles: PuddleLike[]): void {
    for (const b of boxes) {
      const view = this.boxes.get(b.id) ?? this.addBox(b.id, b.pos, b.active);
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
      const splat = splatMesh(`spill-${d.id}`, d.radius, this.scene, d.id);
      splat.material = this.puddleMat;
      splat.position.set(d.pos[0], d.pos[1] + 0.035, d.pos[2]); // just over the road's surface
      splat.receiveShadows = true;
      this.puddles.set(d.id, splat);
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
      view.spin.rotation.y = this.time * BOX_SPIN;
      view.bob.position.y =
        (view.kit ? KIT_BOX_CENTER : 0) + Math.sin(this.time * 2) * BOX_BOB;
    }
  }

  dispose(): void {
    this.disposed = true;
    for (const view of this.boxes.values()) view.node.dispose();
    for (const mesh of this.puddles.values()) mesh.dispose();
    this.boxes.clear();
    this.puddles.clear();
    this.boxMat.dispose();
    this.puddleMat.dispose();
    this.kit?.dispose();
  }

  /** pos: the box's center (the marker) */
  private addBox(
    id: string,
    pos: [number, number, number],
    active: boolean,
    scale = 1,
  ) {
    let view;
    const copy = this.template?.instantiateHierarchy(
      null,
      undefined,
      (source, clone) => (clone.name = `${source.name}-${id}`),
    );
    if (copy) {
      for (const mesh of copy.getChildMeshes()) mesh.isVisible = true;
      const bob = copy.getChildTransformNodes(true)[0] ?? copy;
      const spin = (bob.getChildren()[0] as TransformNode | undefined) ?? bob;
      spin.rotationQuaternion = null;
      copy.position.set(pos[0], pos[1] - KIT_BOX_CENTER, pos[2]);
      view = { node: copy, bob, spin, scale, active, kit: true };
    } else {
      const node = new TransformNode(`itembox-${id}`, this.scene);
      const cube = MeshBuilder.CreateBox(
        `itembox-cube-${id}`,
        { size: BOX_SIZE },
        this.scene,
      );
      cube.material = this.boxMat;
      cube.parent = node;
      node.position.set(...pos); // the marker is the box's center
      view = { node, bob: cube, spin: node, scale, active, kit: false };
    }
    this.boxes.set(id, view);
    return view;
  }
}

/** The item box, or a part of it, or the file's root that holds it */
function isBoxNode(node: Node): boolean {
  for (let n: Node | null = node; n; n = n.parent)
    if (n.name === KIT_BOX) return true;
  return node.name === "__root__";
}

/**
 * A splat of melted ice cream radius m across: a thin disc with a wobbly edge, a little domed, the same shape
 * for the same id on every screen
 */
function splatMesh(name: string, radius: number, scene: Scene, id: string) {
  const disc = MeshBuilder.CreateCylinder(
    name,
    {
      diameterTop: radius * 2,
      diameterBottom: radius * 2,
      height: 0.05,
      tessellation: 40,
      subdivisions: 1,
      updatable: true,
    },
    scene,
  );
  let seed = [...id].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7);
  const rand = () => (seed = (seed * 1664525 + 1013904223) >>> 0) / 2 ** 32;
  const lobes = [1, 2, 3].map(() => [rand() * 0.16, rand() * Math.PI * 2]);
  const positions = disc.getVerticesData(VertexBuffer.PositionKind)!;
  for (let i = 0; i < positions.length; i += 3) {
    const x = positions[i];
    const z = positions[i + 2];
    const r = Math.hypot(x, z);
    if (r < 1e-4) continue;
    const a = Math.atan2(z, x);
    const k =
      1 +
      lobes.reduce(
        (sum, [amp, phase], n) => sum + amp * Math.sin((n + 3) * a + phase),
        0,
      );
    positions[i] = x * k;
    positions[i + 2] = z * k;
    if (positions[i + 1] > 0) positions[i + 1] += 0.02 * (1 - r / radius); // a soft dome
  }
  disc.updateVerticesData(VertexBuffer.PositionKind, positions);
  disc.refreshBoundingInfo();
  return disc;
}
