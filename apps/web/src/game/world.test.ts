import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { ROAD_SURFACE, WORLD_FILE } from "./world";

/** Node names in a .glb, from its JSON chunk (header 12 bytes, then chunk length, type and the JSON) */
function nodeNames(file: string): string[] {
  const glb = readFileSync(new URL(`../../public/${file}`, import.meta.url));
  const length = glb.readUInt32LE(12);
  const json = JSON.parse(glb.subarray(20, 20 + length).toString("utf8")) as {
    nodes?: { name?: string }[];
  };
  return (json.nodes ?? []).map((node) => node.name ?? "");
}

describe("the world layer", () => {
  const names = nodeNames(WORLD_FILE);

  it("ships the board, its cut edges, the causeways and the hills", () => {
    for (const name of ["ground_board", "ground_edges", "causeways", "hills"])
      expect(names).toContain(name);
  });

  it("surfaces every section of the road, with kerbs and a start line", () => {
    for (const section of [
      "start",
      "pollock",
      "library",
      "lionshrine",
      "creamery",
      "stadium",
      "arboretum",
      "collegeave",
    ])
      expect(names).toContain(`road_${section}`);
    expect(names).toContain("kerbs");
    expect(names).toContain("start_line");
    // world.ts pulls exactly these toward the camera
    for (const name of names.filter((n) => /^(road_|kerbs|start_line)/.test(n)))
      expect(ROAD_SURFACE.some((p) => name.startsWith(p))).toBe(true);
  });
});
