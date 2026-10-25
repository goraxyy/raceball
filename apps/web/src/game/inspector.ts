import type { Scene } from "@babylonjs/core";
import type { InspectorToken } from "@babylonjs/inspector";

/** Dev only: Shift+I opens and closes the Babylon Inspector. Returns a cleanup function. */
export function installInspectorToggle(scene: Scene): () => void {
  if (!import.meta.env.DEV) return () => {};
  let token: InspectorToken | undefined;

  const onKey = async (e: KeyboardEvent) => {
    if (!(e.shiftKey && e.code === "KeyI")) return;
    if (token && !token.isDisposed) {
      await token.dispose();
      return;
    }
    const { ShowInspector } = await import("@babylonjs/inspector"); // loaded on first use, never in production
    token = ShowInspector(scene, { layoutMode: "overlay" });
  };
  addEventListener("keydown", onKey);
  return () => {
    removeEventListener("keydown", onKey);
    void token?.dispose();
  };
}
