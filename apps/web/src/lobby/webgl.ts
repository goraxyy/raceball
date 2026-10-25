/**
 * True when this browser can run Babylon (WebGL 2). Checked before /host and /play load the 3D view,
 * so an old or locked-down browser gets Nuris's "unsupported" sign instead of a blank page.
 * makeCanvas is for tests.
 */
export function canDraw3D(
  makeCanvas: () => Pick<HTMLCanvasElement, "getContext"> = () =>
    document.createElement("canvas"),
): boolean {
  try {
    return !!makeCanvas().getContext("webgl2");
  } catch {
    return false; // some locked-down browsers throw instead of returning null
  }
}
