import {
  type AssetContainer,
  LoadAssetContainerAsync,
  type Scene,
} from "@babylonjs/core";

/**
 * Nuris's landmarks over Ali's greybox map: Beaver Stadium (the bowl, light towers, field and scoreboard) and the
 * Mount Nittany backdrop, built by tools/models/build_landmarks.py in map coordinates. Visual only: the collision
 * map doesn't change.
 */
export const LANDMARKS_FILE = "assets/maps/happy_valley_landmarks.glb";

/** Greybox pieces the layer replaces, by mesh name prefix in maps/happy_valley.glb */
export const REPLACED = ["prop_kenney_grandstand", "prop_stadium_field"];

/** The meshes of `map` that the landmarks replace */
export function replacedBy(map: AssetContainer) {
  return map.meshes.filter((mesh) =>
    REPLACED.some((prefix) => mesh.name.startsWith(prefix)),
  );
}

/**
 * Loads the landmarks into the scene, frozen like the map, and hides the greybox pieces they replace. A load that
 * fails leaves the greybox as it was: the race doesn't need the landmarks.
 */
export async function loadLandmarks(
  scene: Scene,
  map: AssetContainer,
  isDisposed: () => boolean,
): Promise<AssetContainer | undefined> {
  const layer = await LoadAssetContainerAsync(
    `${import.meta.env.BASE_URL}${LANDMARKS_FILE}`,
    scene,
  );
  if (isDisposed()) {
    layer.dispose();
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
  return layer;
}
