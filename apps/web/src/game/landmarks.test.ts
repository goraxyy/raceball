import { readFileSync } from "node:fs";
import { NodeIO } from "@gltf-transform/core";
import { describe, expect, it } from "vitest";
import {
  GREYBOX_BOXES,
  GREYBOX_SOLIDS,
  LANDMARKS_FILE,
  REPLACED,
  carve,
} from "./landmarks";

const MAP = new URL(
  "../../public/assets/maps/happy_valley.glb",
  import.meta.url,
);

/** Node names in a .glb, from its JSON chunk (header 12 bytes, then chunk length, type and the JSON) */
function nodeNames(file: string): string[] {
  const glb = readFileSync(new URL(`../../public/${file}`, import.meta.url));
  const length = glb.readUInt32LE(12);
  const json = JSON.parse(glb.subarray(20, 20 + length).toString("utf8")) as {
    nodes?: { name?: string }[];
  };
  return (json.nodes ?? []).map((node) => node.name ?? "");
}

/** The map's batches (where the greybox merged its boxes): positions in map coordinates and indices */
async function batches() {
  const doc = await new NodeIO().readBinary(new Uint8Array(readFileSync(MAP)));
  return doc
    .getRoot()
    .listNodes()
    .filter((node) => node.getName().startsWith("trk_batch_"))
    .flatMap((node) =>
      node
        .getMesh()!
        .listPrimitives()
        .map((primitive) => {
          const local = primitive.getAttribute("POSITION")!.getArray()!;
          const m = node.getWorldMatrix();
          const positions = new Float32Array(local.length);
          for (let i = 0; i < local.length; i += 3)
            for (let k = 0; k < 3; k++)
              positions[i + k] =
                m[k] * local[i] +
                m[4 + k] * local[i + 1] +
                m[8 + k] * local[i + 2] +
                m[12 + k];
          return {
            name: node.getName(),
            positions,
            indices: Array.from(primitive.getIndices()!.getArray()!),
          };
        }),
    );
}

describe("landmarks", () => {
  it("only hides greybox pieces that are in the map", () => {
    // if Ali renames them, the stadium would draw over the old stands instead of replacing them
    const names = nodeNames("assets/maps/happy_valley.glb");
    for (const prefix of REPLACED)
      expect(
        names.some((name) => name.startsWith(prefix)),
        prefix,
      ).toBe(true);
  });

  it("ships every landmark", () => {
    const names = nodeNames(LANDMARKS_FILE);
    for (const root of [
      "lm_beaver_stadium",
      "lm_mount_nittany",
      "lm_old_main",
      "lm_pattee_library",
      "lm_lion_shrine",
      "lm_creamery",
    ])
      expect(names).toContain(root);
  });

  it("finds every greybox box it cuts out, where the greybox put it", async () => {
    // if Ali moves or resizes a box, it would show through its landmark: update GREYBOX_BOXES to match
    const all = await batches();
    for (const box of GREYBOX_BOXES) {
      const cut = all.reduce(
        (sum, { positions, indices }) =>
          sum +
          (indices.length - carve(positions, indices, [box], []).length) / 3,
        0,
      );
      expect(
        cut,
        `box at ${box.slice(0, 3).join(", ")}`,
      ).toBeGreaterThanOrEqual(10);
    }
    for (const solid of GREYBOX_SOLIDS) {
      const cut = all.reduce(
        (sum, { positions, indices }) =>
          sum +
          (indices.length - carve(positions, indices, [], [solid]).length) / 3,
        0,
      );
      expect(cut, `solid at ${solid.slice(0, 3).join(", ")}`).toBeGreaterThan(
        0,
      );
    }
  });

  it("keeps the rest of the map: rails, dashes, boost pads, puddles and the trees outside the landmarks", async () => {
    for (const { name, positions, indices } of await batches()) {
      const lost = (indices.length - carve(positions, indices).length) / 3;
      if (name.includes("colormap"))
        expect(lost, name).toBeLessThanOrEqual(80); // the one Kenney tree standing inside Pattee Library
      else if (name.includes("icecream"))
        expect(indices.length / 3 - lost, name).toBeGreaterThanOrEqual(24); // the two puddles on the road
      else if (/boost|red|lawn|fall|mat_ice$/.test(name))
        expect(lost, name).toBe(0);
    }
  });
});
