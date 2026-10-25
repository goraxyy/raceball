import { useEffect, useState } from "react";
import { WebIO } from "@gltf-transform/core";
import { readRoute, type TrackPath } from "@raceball/game-core";
import collisionUrl from "../../../../packages/game-core/tracks/happy_valley_col.glb?url";

let route: Promise<TrackPath | null> | undefined;

/** Happy Valley's centerline from the collision track (the same one the server races on). Fetched once */
export function loadRoute(): Promise<TrackPath | null> {
  route ??= fetch(collisionUrl)
    .then((response) => {
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return response.arrayBuffer();
    })
    .then((bytes) => readRoute(new Uint8Array(bytes), new WebIO()))
    .catch((error: unknown) => {
      route = undefined; // let a later mount try again
      throw error;
    });
  return route;
}

/** The route for the big screen's live map; null while it loads (or if it couldn't) */
export function useRoute(enabled = true): TrackPath | null {
  const [path, setPath] = useState<TrackPath | null>(null);
  useEffect(() => {
    if (!enabled) return;
    let live = true;
    loadRoute().then(
      (next) => live && setPath(next),
      (error: unknown) => console.warn("Track route failed to load", error),
    );
    return () => {
      live = false;
    };
  }, [enabled]);
  return path;
}
