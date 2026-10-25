import { useEffect, useState } from "react";
import { WebIO } from "@gltf-transform/core";
import {
  readBoostPads,
  readRoute,
  type BoostPadMark,
  type TrackPath,
} from "@raceball/game-core";
import collisionUrl from "../../../../packages/game-core/tracks/happy_valley_col.glb?url";

let track: Promise<Uint8Array> | undefined;
let route: Promise<TrackPath | null> | undefined;

/** Happy Valley's collision track (the same one the server races on). Fetched once */
function collisionTrack(): Promise<Uint8Array> {
  track ??= fetch(collisionUrl)
    .then((response) => {
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return response.arrayBuffer();
    })
    .then((bytes) => new Uint8Array(bytes))
    .catch((error: unknown) => {
      track = undefined; // let a later mount try again
      throw error;
    });
  return track;
}

/** Happy Valley's centerline from the collision track */
export function loadRoute(): Promise<TrackPath | null> {
  route ??= collisionTrack()
    .then((bytes) => readRoute(bytes, new WebIO()))
    .catch((error: unknown) => {
      route = undefined;
      throw error;
    });
  return route;
}

/** Happy Valley's boost pads from the collision track, for screens without a race of their own to draw them */
export async function loadBoostPads(): Promise<BoostPadMark[]> {
  return readBoostPads(await collisionTrack(), new WebIO());
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
