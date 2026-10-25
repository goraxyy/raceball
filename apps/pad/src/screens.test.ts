import { describe, expect, it } from "vitest";
import type { ItemId } from "@raceball/shared";
import { ITEM_NAMES, itemButtonHtml } from "./screens";

const ITEMS: ItemId[] = ["boost", "roar", "spill", "snowday"];

describe("the item on the pad", () => {
  it("names every item in the pickup banner and on the button", () => {
    for (const item of ITEMS) {
      expect(ITEM_NAMES[item].full.length).toBeGreaterThan(0);
      expect(itemButtonHtml(item)).toContain(ITEM_NAMES[item].short);
      expect(itemButtonHtml(item)).toContain("shake!");
    }
  });

  it("says No item when the hands are empty", () => {
    expect(itemButtonHtml("")).toContain("No item");
  });
});
