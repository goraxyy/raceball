import { expect, test } from "vitest";
import { canDraw3D } from "./webgl";

const canvas = (ctx: unknown) => () =>
  ({ getContext: () => ctx }) as unknown as Pick<
    HTMLCanvasElement,
    "getContext"
  >;

test("WebGL 2 available", () => {
  expect(canDraw3D(canvas({}))).toBe(true);
});

test("no WebGL 2 context", () => {
  expect(canDraw3D(canvas(null))).toBe(false);
});

test("a browser that throws counts as unsupported", () => {
  expect(
    canDraw3D(() => ({
      getContext: () => {
        throw new Error("blocked");
      },
    })),
  ).toBe(false);
});
