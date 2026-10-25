import {
  type AbstractMesh,
  type AssetContainer,
  GlowLayer,
  LoadAssetContainerAsync,
  Mesh,
  ParticleSystem,
  PBRMaterial,
  type Scene,
  Texture,
  type TransformNode,
  Vector3,
} from "@babylonjs/core";
import type { BoostPadMark } from "@raceball/game-core";
import type { GameEvent } from "@raceball/shared";

/**
 * What you drive into, drawn (Nuris's M3 pass; models from tools/models/build_interactables.py): the boost pads
 * over the track's boost markers, the Lion Paw bumpers and the Creamery Scoops on game-core's spots. The pads'
 * chevrons always flow forward and glimmer; a pad flashes when a ball hits it, a paw flashes and squashes when it
 * kicks one, and a collected scoop shrinks away until it comes back. Bursts and sounds are fx.ts's.
 */
export const INTERACTABLES_FILE = "assets/models/kit_interactables.glb";
const GLIMMER_FILE = "assets/fx/fx_pad_glimmer.json";

/** Ali's boost markers float this far over the road (build_happy_valley.py: marker(..., up=.3)) */
const PAD_MARKER_UP = 0.3;
/** The pad sits this far up, so its panel clears the greybox pad's white stripes */
const PAD_LIFT = 0.012;
/** The pads' polygon offset: they lie on the road's surface, which world.ts pulls by -4 */
const PAD_PULL = -8;
/** The greybox's own boost pad (a flat blue box), hidden once the real ones are in */
export const GREYBOX_PADS = "trk_batch_mat_boost";
const CHEVRON_SPEED = 1.3; // tiles a second, the way the pad pushes
const SCOOP_SPIN = 1.7; // rad/s
const SCOOP_BOB = 0.12; // m
const SCOOP_HIDE = 7; // 1/s, how fast a collected scoop shrinks away (and grows back)
export const SCOOP_FLAVOURS = ["strawberry", "vanilla", "chocolate"] as const;
const FLASH_DECAY = 5; // 1/s
const GLOW_IDLE = 1; // emissive intensity of the lights at rest…
const GLOW_PULSE = 0.35; // …breathing this much…
const GLOW_FLASH = 4; // …and this much more on a hit
/** A hit counts for the pad or paw within this distance of the event's position, m */
const NEAR = 4;
/** Scoops and paws past this distance are a few pixels: they stop drawing, m (pads stay: they're on the road) */
const PROP_DRAW_DISTANCE = 160;

export interface ScoopLike {
  id: string;
  pos: [number, number, number];
  active: boolean;
}

interface Lit {
  root: TransformNode;
  /** Its own copy of the light material, to flash on its own */
  light?: PBRMaterial;
  pos: Vector3;
  flash: number;
}

interface ScoopView {
  root: TransformNode;
  scale: number;
  active: boolean;
  phase: number;
  y: number;
}

/** Which scoop flavour a scoop id gets: they take turns along the track */
export function flavourOf(id: string): (typeof SCOOP_FLAVOURS)[number] {
  const n = Number(id.replace(/\D/g, "")) || 0;
  return SCOOP_FLAVOURS[n % SCOOP_FLAVOURS.length];
}

export class InteractableViews {
  private readonly scene: Scene;
  private readonly useGlow: boolean;
  private kit?: AssetContainer;
  private readonly templates = new Map<string, TransformNode>();
  private pads: Lit[] = [];
  private paws: Lit[] = [];
  private readonly scoops = new Map<string, ScoopView>();
  private chevrons: Texture[] = [];
  private glimmers: ParticleSystem[] = [];
  private glow?: GlowLayer;
  private glowOn = true;
  private time = 0;
  private disposed = false;

  /** glow: a glow layer for the lights (one camera only: the big screen's tiles would each pay for it) */
  constructor(scene: Scene, options: { glow: boolean }) {
    this.scene = scene;
    this.useGlow = options.glow;
  }

  /** Loads the kit and sets out the pads and paws. Scoops follow sync(). Resolves false if disposed meanwhile */
  async load(
    pads: BoostPadMark[],
    paws: [number, number, number][],
  ): Promise<boolean> {
    const base = import.meta.env.BASE_URL;
    const [kit, glimmer] = await Promise.all([
      LoadAssetContainerAsync(`${base}${INTERACTABLES_FILE}`, this.scene),
      fetch(`${base}${GLIMMER_FILE}`)
        .then((r) => (r.ok ? (r.json() as Promise<unknown>) : null))
        .catch(() => null), // the pads still work without their glimmer
    ]);
    if (this.disposed) {
      kit.dispose();
      return false;
    }
    this.kit = kit;
    kit.addAllToScene();
    for (const node of kit.transformNodes) {
      if (!node.name.startsWith("prop_")) continue;
      this.templates.set(node.name, node);
      // the templates stay at the origin, unseen: their instances draw them (and take their shadows setting)
      for (const mesh of node.getChildMeshes()) {
        mesh.isVisible = false;
        mesh.receiveShadows = true;
        if (!node.name.startsWith("prop_boost_pad") && mesh instanceof Mesh)
          mesh.addLODLevel(PROP_DRAW_DISTANCE, null); // the instances follow it
      }
    }
    for (const mat of kit.materials) {
      if (!mat.name.startsWith("mat_boost")) continue;
      mat.zOffset = PAD_PULL;
      mat.zOffsetUnits = PAD_PULL;
      if (mat.name === "mat_boost_chevrons" && mat instanceof PBRMaterial)
        this.chevrons = [
          ...new Set([mat.albedoTexture, mat.emissiveTexture]),
        ].filter((t): t is Texture => t instanceof Texture);
    }
    if (this.useGlow) {
      this.glow = new GlowLayer("interactables-glow", this.scene, {
        mainTextureRatio: 0.5,
        blurKernelSize: 32,
      });
      this.glow.intensity = 1.1;
      this.glow.isEnabled = this.glowOn;
    }
    pads.forEach((mark, i) => {
      const pos = new Vector3(
        mark.pos[0],
        mark.pos[1] - PAD_MARKER_UP + PAD_LIFT,
        mark.pos[2],
      );
      const pad = this.place("prop_boost_pad", `pad${i}`, pos, mark.heading);
      if (!pad) return;
      this.pads.push(pad);
      const panel = pad.root
        .getChildMeshes()
        .find((m) => m.name.startsWith("boost_chevrons"));
      if (glimmer && panel) {
        const ps = ParticleSystem.Parse(
          glimmer,
          this.scene,
          `${base}assets/fx/`,
          true,
        );
        ps.emitter = panel; // its box turns with the pad
        ps.start();
        this.glimmers.push(ps);
      }
    });
    for (const [i, p] of paws.entries()) {
      const paw = this.place(
        "prop_paw_bumper",
        `paw${i}`,
        Vector3.FromArray(p),
        0,
      );
      if (paw) this.paws.push(paw);
    }
    return true;
  }

  /** Every frame: the scoops game-core (or the room) has, and which are out */
  syncScoops(scoops: ScoopLike[]): void {
    if (!this.kit) return;
    for (const s of scoops) {
      let view = this.scoops.get(s.id);
      if (!view) {
        const lit = this.place(
          `prop_scoop_${flavourOf(s.id)}`,
          s.id,
          Vector3.FromArray(s.pos),
          0,
        );
        if (!lit) continue;
        view = {
          root: lit.root,
          scale: s.active ? 1 : 0,
          active: s.active,
          phase: this.scoops.size * 0.9,
          y: s.pos[1],
        };
        this.scoops.set(s.id, view);
      }
      view.active = s.active;
    }
  }

  /** Switches the glow on or off (quality.ts drops it first when the frame rate can't keep up) */
  setGlow(on: boolean): void {
    this.glowOn = on;
    if (this.glow) this.glow.isEnabled = on;
  }

  /** A pad lights up when a ball goes over it; a paw flashes and squashes when it kicks one */
  onEvent(evt: GameEvent): void {
    if (evt.type !== "pad" && evt.type !== "bounce") return;
    const at = Vector3.FromArray(evt.pos);
    const list = evt.type === "pad" ? this.pads : this.paws;
    const hit = list.find((v) => Vector3.Distance(v.pos, at) < NEAR);
    if (hit) hit.flash = 1;
  }

  update(dt: number): void {
    if (!this.kit) return;
    this.time += dt;
    for (const tex of this.chevrons)
      tex.vOffset = (-this.time * CHEVRON_SPEED) % 1; // flows toward +v: forward
    const breathe = GLOW_IDLE + GLOW_PULSE * Math.sin(this.time * 4);
    const fade = Math.exp(-FLASH_DECAY * dt);
    for (const v of [...this.pads, ...this.paws]) {
      v.flash *= fade;
      if (v.light) v.light.emissiveIntensity = breathe + GLOW_FLASH * v.flash;
    }
    for (const paw of this.paws) {
      // a squash and a wobble back, like a rubber bumper
      const f = paw.flash;
      const wobble = Math.sin((1 - f) * 18) * f;
      paw.root.scaling.set(
        1 + 0.12 * wobble,
        1 - 0.2 * wobble,
        1 + 0.12 * wobble,
      );
    }
    const k = 1 - Math.exp(-SCOOP_HIDE * dt);
    for (const view of this.scoops.values()) {
      view.scale += ((view.active ? 1 : 0) - view.scale) * k;
      const s = Math.max(view.scale, 0.001);
      view.root.scaling.set(s, s, s);
      view.root.rotation.y = this.time * SCOOP_SPIN + view.phase;
      view.root.position.y =
        view.y + Math.sin(this.time * 2.2 + view.phase) * SCOOP_BOB;
    }
  }

  dispose(): void {
    this.disposed = true;
    for (const ps of this.glimmers) ps.dispose();
    this.glimmers = [];
    for (const v of [...this.pads, ...this.paws]) {
      v.root.dispose();
      v.light?.dispose();
    }
    for (const v of this.scoops.values()) v.root.dispose();
    this.pads = [];
    this.paws = [];
    this.scoops.clear();
    this.glow?.dispose();
    this.kit?.dispose();
    this.kit = undefined;
  }

  /**
   * A copy of a prop at pos, turned to heading: its meshes are instances of the template's, except the lights,
   * which are clones with their own material so each one can flash alone
   */
  private place(
    name: string,
    id: string,
    pos: Vector3,
    heading: number,
  ): Lit | undefined {
    const template = this.templates.get(name);
    if (!template) return undefined;
    const isLight = (node: TransformNode) =>
      node.name.startsWith("paw_light") || node.name.startsWith("boost_lights");
    const root = template.instantiateHierarchy(
      null,
      { doNotInstantiate: isLight },
      (source, clone) => (clone.name = `${source.name}-${id}`),
    );
    if (!root) return undefined;
    root.position.copyFrom(pos);
    root.rotationQuaternion = null;
    root.rotation.y = heading;
    let light: PBRMaterial | undefined;
    for (const mesh of root.getChildMeshes() as AbstractMesh[]) {
      mesh.isVisible = true;
      mesh.isPickable = false;
      if (!isLight(mesh) || !(mesh.material instanceof PBRMaterial)) continue;
      light = mesh.material.clone(`${mesh.material.name}-${id}`);
      mesh.material = light;
      this.glow?.addIncludedOnlyMesh(mesh as Mesh);
    }
    if (name === "prop_boost_pad")
      for (const mesh of root.getChildMeshes())
        if (mesh.name.startsWith("boost_chevrons"))
          this.glow?.addIncludedOnlyMesh(mesh as Mesh);
    return { root, light, pos: pos.clone(), flash: 0 };
  }
}
