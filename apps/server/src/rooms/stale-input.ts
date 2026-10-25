import { NEUTRAL_INPUT } from "@raceball/game-core";
import type { InputMsg } from "@raceball/shared";

/** A pad's input older than this counts as neutral, so a locked phone can't drive off a cliff */
export const STALE_MS = 200;

/** A pad's latest input, when it arrived, and an item press no simulation tick has used yet */
export interface PadInput {
  msg: InputMsg;
  at: number;
  item?: boolean;
}

/**
 * A new message from a pad replaces the last one, but an item press waits for a tick: the pad sends item: true in
 * exactly one message, and the next one (16 ms later) often lands before the simulation steps
 */
export function nextInput(
  last: PadInput | undefined,
  msg: InputMsg,
  at: number,
): PadInput {
  return { msg, at, item: msg.item || !!last?.item };
}

/** What the simulation should use for a player this tick. A waiting item press goes in once, then it's spent */
export function inputForStep(
  latest: PadInput | undefined,
  now: number,
): InputMsg {
  if (!latest || now - latest.at > STALE_MS) return NEUTRAL_INPUT;
  const item = !!latest.item;
  latest.item = false;
  return item === latest.msg.item ? latest.msg : { ...latest.msg, item };
}
