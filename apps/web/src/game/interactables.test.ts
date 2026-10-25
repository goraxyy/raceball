import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { HAPPY_VALLEY_INTERACTABLES } from "@raceball/game-core";
import { INTERACTABLES_FILE, SCOOP_FLAVOURS, flavourOf } from "./interactables";

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
    for (const root of [
      "prop_boost_pad",
      "prop_paw_bumper",
      ...SCOOP_FLAVOURS.map((f) => `prop_scoop_${f}`),
    ])
      expect(names).toContain(root);
    expect(names).toContain("paw_light");
    expect(names).toContain("boost_lights");
    expect(names).toContain("boost_chevrons");
  });

  it("takes the flavours in turn along the track", () => {
    const flavours = HAPPY_VALLEY_INTERACTABLES.scoops.map((_, i) =>
      flavourOf(`scoop${i}`),
    );
    expect(new Set(flavours).size).toBe(SCOOP_FLAVOURS.length);
    expect(flavours[0]).not.toBe(flavours[1]);
  });
});
