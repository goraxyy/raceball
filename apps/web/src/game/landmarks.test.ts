import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { LANDMARKS_FILE, REPLACED } from "./landmarks";

/** Node names in a .glb, from its JSON chunk (header 12 bytes, then chunk length, type and the JSON) */
function nodeNames(file: string): string[] {
  const glb = readFileSync(new URL(`../../public/${file}`, import.meta.url));
  const length = glb.readUInt32LE(12);
  const json = JSON.parse(glb.subarray(20, 20 + length).toString("utf8")) as {
    nodes?: { name?: string }[];
  };
  return (json.nodes ?? []).map((node) => node.name ?? "");
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

  it("ships the stadium and Mount Nittany", () => {
    const names = nodeNames(LANDMARKS_FILE);
    expect(names).toContain("lm_beaver_stadium");
    expect(names).toContain("lm_mount_nittany");
  });
});
