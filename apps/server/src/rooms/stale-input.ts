import { NEUTRAL_INPUT } from "@raceball/game-core";
import type { InputMsg } from "@raceball/shared";

/** A pad's input older than this counts as neutral, so a locked phone can't drive off a cliff */
export const STALE_MS = 200;

/** What the simulation should use for a player this tick */
export function inputForStep(
  latest: { msg: InputMsg; at: number } | undefined,
  now: number,
): InputMsg {
  if (!latest || now - latest.at > STALE_MS) return NEUTRAL_INPUT;
  return latest.msg;
}
