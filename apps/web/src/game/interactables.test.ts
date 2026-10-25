import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { tuning } from "@raceball/game-core";
import { INTERACTABLES_FILE, starVertices } from "./interactables";

/** Node names in a .glb, from its JSON chunk (header 12 bytes, then chunk length, type and the JSON) */
function nodeNames(file: string): string[] {
  const glb = readFileSync(new URL(`../../public/${file}`, import.meta.url));
  const length = glb.readUInt32LE(12);
  const json = JSON.parse(glb.subarray(20, 20 + length).toString("utf8")) as {
    nodes?: { name?: string }[];
  };
  return (json.nodes ?? []).map((node) => node.name ?? "");
}

describe("interactables", () => {
  it("ships every prop the views place, with the lights they flash", () => {
    const names = nodeNames(INTERACTABLES_FILE);
    for (const root of ["prop_boost_pad", "prop_paw_bumper"])
      expect(names).toContain(root);
    expect(names).toContain("paw_light");
    expect(names).toContain("boost_lights");
    expect(names).toContain("boost_chevrons");
  });

  it("draws each scoop as a five-pointed star that fits its pickup", () => {
    const star = starVertices();
    const p = star.positions ?? [];
    const rim = Array.from({ length: 10 }, (_, i) =>
      Math.hypot(p[6 + i * 3], p[7 + i * 3]),
    );
    expect(p.length / 3).toBe(12); // a middle on each face, then the rim
    expect(star.indices).toHaveLength(60); // 10 triangles a face
    // points and dips take turns
    for (let i = 0; i < 10; i += 2) expect(rim[i]).toBeGreaterThan(rim[i + 1]);
    expect(Math.max(...rim)).toBeLessThanOrEqual(tuning.scoopRadius);
  });
});
