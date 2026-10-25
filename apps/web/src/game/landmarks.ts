import {
  AnimationGroup,
  type AssetContainer,
  LoadAssetContainerAsync,
  Mesh,
  Node,
  type Scene,
  TransformNode,
  Vector3,
  VertexBuffer,
} from "@babylonjs/core";

/**
 * The landmarks over Ali's greybox map, built by tools/models/build_landmarks.py in map coordinates: Beaver Stadium
 * and the Mount Nittany backdrop, Old Main, Pattee Library, the Lion Shrine and the Creamery. Visual only: the
 * collision map doesn't change.
 */
export const LANDMARKS_FILE = "assets/maps/happy_valley_landmarks.glb";

/** Greybox pieces the layer replaces, by mesh name prefix in maps/happy_valley.glb */
export const REPLACED = [
  "prop_kenney_grandstand",
  "prop_stadium_field",
  "prop_kenney_finish_arch", // the animated arch from the kit takes its place
];

/**
 * The greybox's landmark boxes, which tools/track/build_happy_valley.py merges into its batches (so they can't be
 * hidden by name): center and size, [x, y, z, width, height, depth] in map coordinates. Their triangles are cut out
 * of the batches when the landmarks load: only triangles lying on one of these boxes' faces, so a tree or a road
 * that reaches into a box keeps every triangle.
 */
export const GREYBOX_BOXES: readonly (readonly number[])[] = [
  [-26.45, 3.5, 18.4, 24, 7, 14], // Old Main
  [-26.45, 9, 18.4, 6, 18, 6], // its tower
  [-26.45, 18.5, 18.4, 7, 1, 7], // the tower's roof
  [-26.45, 6, 247.25, 28, 12, 34], // Pattee Library
  ...[232.3, 241.5, 250.7, 259.9].map((z) => [-9.2, 5, z, 2, 10, 2]), // its columns
  [34.5, 1.5, 284.05, 13, 3, 9], // the Lion Shrine's plinth
  [34.5, 4.5, 284.05, 7, 3, 3], // the lion's body
  [39.1, 6, 284.05, 3, 4, 3], // and head
  [116.15, 4.5, 231.15, 23, 9, 14], // the Creamery
  [118.45, 2, 216.2, 15, 4, 10], // the cone's plinth
];

/**
 * Greybox pieces that aren't boxes: every batch triangle wholly inside one of these goes, [min x, y, z, max x, y, z].
 * Nothing else of the map is in them.
 */
export const GREYBOX_SOLIDS: readonly (readonly number[])[] = [
  [121.6, 2.95, 222.8, 133.7, 22.05, 234.9], // the cone and its scoop
  // the flat name labels over the four landmarks that now have models (they hung mirrored in front of Old Main's
  // tower in the chase view); the others stay
  [-41, 19.9, 4, -14, 20.1, 10], // OLD MAIN
  [-42, 13.9, 218, -15, 14.1, 224], // LIBRARY
  [14, 13.9, 261, 57, 14.1, 268], // LION SHRINE
  [100, 13.9, 244, 137, 14.1, 251], // CREAMERY
];

/**
 * Animated props from models/kit_animated.glb set out with the landmarks: where ([x, z], turn, scale) and the
 * prefix of the animation groups that move them
 */
export const RACE_DAY_PROPS: Record<
  string,
  { at: [number, number]; turn: number; scale: number; animations: string }
> = {
  // on the finish line
  prop_finish_arch_animated: {
    at: [0, 0],
    turn: 0,
    scale: 1,
    animations: "anim_arch_",
  },
  // the two flagpoles framing Old Main from its lawn
  prop_flag_checker: {
    at: [-37.45, -7],
    turn: 0,
    scale: 3.2,
    animations: "anim_flag_checker_",
  },
  prop_flag_bluewhite: {
    at: [-15.45, -7],
    turn: 0,
    scale: 3.2,
    animations: "anim_flag_bluewhite_",
  },
};
const KIT_FILE = "assets/models/kit_animated.glb";
const LAWN = 0.06; // the top of the landmarks' turf boards

const EPSILON = 0.02;

function onBoxFace(
  box: readonly number[],
  x: number,
  y: number,
  z: number,
): number {
  const [cx, cy, cz, w, h, d] = box;
  const lo = [cx - w / 2, cy - h / 2, cz - d / 2];
  const hi = [cx + w / 2, cy + h / 2, cz + d / 2];
  const p = [x, y, z];
  for (let k = 0; k < 3; k++)
    if (p[k] < lo[k] - EPSILON || p[k] > hi[k] + EPSILON) return 0;
  let faces = 0; // a bit per face the point lies on
  for (let k = 0; k < 3; k++) {
    if (Math.abs(p[k] - lo[k]) < EPSILON) faces |= 1 << (2 * k);
    if (Math.abs(p[k] - hi[k]) < EPSILON) faces |= 2 << (2 * k);
  }
  return faces;
}

function inside(solid: readonly number[], x: number, y: number, z: number) {
  const [x0, y0, z0, x1, y1, z1] = solid;
  return x >= x0 && x <= x1 && y >= y0 && y <= y1 && z >= z0 && z <= z1;
}

/**
 * The triangles of a mesh that survive the carving, as a new index list. positions: the mesh's vertices in map
 * coordinates (x, y, z each). A triangle goes when its three corners lie on the same face of a greybox box, or
 * all inside one of the greybox solids (both lists default to the greybox's).
 */
export function carve(
  positions: ArrayLike<number>,
  indices: ArrayLike<number>,
  boxes = GREYBOX_BOXES,
  solids = GREYBOX_SOLIDS,
): number[] {
  const kept: number[] = [];
  for (let t = 0; t < indices.length; t += 3) {
    const corners = [indices[t], indices[t + 1], indices[t + 2]].map((i) => [
      positions[3 * i],
      positions[3 * i + 1],
      positions[3 * i + 2],
    ]);
    const onBox = boxes.some(
      (box) =>
        corners.reduce(
          (shared, [x, y, z]) => shared & onBoxFace(box, x, y, z),
          0xfff,
        ) !== 0,
    );
    const inSolid = solids.some((solid) =>
      corners.every(([x, y, z]) => inside(solid, x, y, z)),
    );
    if (!onBox && !inSolid)
      kept.push(indices[t], indices[t + 1], indices[t + 2]);
  }
  return kept;
}

/** Cuts the greybox landmark boxes out of the map's batches. Returns how many triangles went */
export function carveGreybox(map: AssetContainer): number {
  let removed = 0;
  for (const mesh of map.meshes) {
    if (!(mesh instanceof Mesh) || !mesh.name.startsWith("trk_batch_"))
      continue;
    const local = mesh.getVerticesData(VertexBuffer.PositionKind);
    const indices = mesh.getIndices();
    if (!local || !indices) continue;
    const world = new Float32Array(local.length);
    const matrix = mesh.computeWorldMatrix(true);
    const p = new Vector3();
    for (let i = 0; i < local.length; i += 3) {
      Vector3.TransformCoordinatesFromFloatsToRef(
        local[i],
        local[i + 1],
        local[i + 2],
        matrix,
        p,
      );
      world[i] = p.x;
      world[i + 1] = p.y;
      world[i + 2] = p.z;
    }
    const kept = carve(world, indices);
    if (kept.length === indices.length) continue;
    removed += (indices.length - kept.length) / 3;
    mesh.setIndices(kept);
    mesh.refreshBoundingInfo();
  }
  return removed;
}

/** The meshes of `map` that the landmarks replace */
export function replacedBy(map: AssetContainer) {
  return map.meshes.filter((mesh) =>
    REPLACED.some((prefix) => mesh.name.startsWith(prefix)),
  );
}

/** Whether a node is one of the race-day props, or inside one (or the file's root, which holds them) */
function isRaceDayNode(node: Node): boolean {
  for (let n: Node | null = node; n; n = n.parent)
    if (n.name in RACE_DAY_PROPS) return true;
  return node.name === "__root__";
}

/** The arch and the flags, playing their animations; the kit's other props stay out of the scene */
async function loadRaceDayProps(scene: Scene): Promise<AssetContainer> {
  const kit = await LoadAssetContainerAsync(
    `${import.meta.env.BASE_URL}${KIT_FILE}`,
    scene,
  );
  const props = Object.values(RACE_DAY_PROPS);
  kit.addToScene((entity: unknown) => {
    if (entity instanceof Node) return isRaceDayNode(entity);
    if (entity instanceof AnimationGroup)
      return props.some((prop) => entity.name.startsWith(prop.animations));
    return true; // materials, textures, geometry
  });
  for (const [name, { at, turn, scale }] of Object.entries(RACE_DAY_PROPS)) {
    const node = kit.transformNodes.find((n) => n.name === name);
    if (!(node instanceof TransformNode)) continue;
    node.position.set(at[0], LAWN, at[1]);
    node.rotationQuaternion = null;
    node.rotation.y = turn;
    node.scaling.setAll(scale);
  }
  for (const group of kit.animationGroups)
    if (scene.animationGroups.includes(group)) group.play(true);
  return kit;
}

/**
 * Loads the landmarks into the scene, frozen like the map, hides the greybox pieces they replace and cuts the merged
 * greybox boxes out of the map. A load that fails leaves the greybox as it was: the race doesn't need the
 * landmarks.
 */
export async function loadLandmarks(
  scene: Scene,
  map: AssetContainer,
  isDisposed: () => boolean,
): Promise<{ dispose(): void } | undefined> {
  const [layer, kit] = await Promise.all([
    LoadAssetContainerAsync(
      `${import.meta.env.BASE_URL}${LANDMARKS_FILE}`,
      scene,
    ),
    loadRaceDayProps(scene).catch((error: unknown) => {
      console.warn("Race-day props failed to load", error);
      return undefined;
    }),
  ]);
  if (isDisposed()) {
    layer.dispose();
    kit?.dispose();
    return undefined;
  }
  layer.addAllToScene();
  for (const mesh of layer.meshes) {
    if (mesh.getTotalVertices() === 0) continue;
    mesh.receiveShadows = true;
    mesh.computeWorldMatrix(true);
    mesh.freezeWorldMatrix();
  }
  for (const mesh of replacedBy(map)) mesh.setEnabled(false);
  carveGreybox(map);
  return {
    dispose() {
      layer.dispose();
      kit?.dispose();
    },
  };
}
