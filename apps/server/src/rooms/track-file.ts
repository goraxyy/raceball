import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

/**
 * The collision track. Docker sets TRACK_PATH; otherwise it's relative to apps/server,
 * where pnpm runs every server script (dev, start, test).
 */
const TRACK_PATH = resolve(
  process.env.TRACK_PATH ??
    "../../packages/game-core/tracks/happy_valley_col.glb",
);

let bytes: Promise<Uint8Array> | undefined;

/** Read once, shared by every room */
export function trackBytes(): Promise<Uint8Array> {
  bytes ??= readFile(TRACK_PATH).then((b) => new Uint8Array(b));
  return bytes;
}
