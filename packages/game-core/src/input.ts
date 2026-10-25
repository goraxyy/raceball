import type { InputMsg } from "@raceball/shared";
import { tuning, type Tuning } from "./tuning";

/** No gas, no steer. The server feeds this to a pad whose input went stale. */
export const NEUTRAL_INPUT: Readonly<InputMsg> = {
  seq: 0,
  steer: 0,
  gas: 0,
  brake: false,
  item: false,
};

/** Which keys are held. The browser side (apps/web local mode) fills this from keydown/keyup. */
export interface KeyState {
  up: boolean; // W / ArrowUp: gas
  down: boolean; // S / ArrowDown: brake
  left: boolean; // A / ArrowLeft
  right: boolean; // D / ArrowRight
  item: boolean; // Space
}

/**
 * Turns held keys into the same InputMsg a phone sends, so nothing downstream can tell them apart.
 * Steering ramps toward -1 / +1 while A/D is held, so it feels like a wheel, not a switch.
 */
export class KeyboardInput {
  private readonly t: Tuning;
  private steer = 0;
  private seq = 0;
  private itemHeld = false;

  constructor(t: Tuning = tuning) {
    this.t = t;
  }

  next(keys: KeyState, dt: number): InputMsg {
    const target = (keys.right ? 1 : 0) - (keys.left ? 1 : 0);
    // ramp up while turning into the target, return faster when released or reversed
    const rate =
      target !== 0 && Math.sign(this.steer) !== -target
        ? this.t.keySteerRate
        : this.t.keyReturnRate;
    const step = rate * dt;
    this.steer =
      Math.abs(target - this.steer) <= step
        ? target
        : this.steer + Math.sign(target - this.steer) * step;

    const item = keys.item && !this.itemHeld; // true in exactly one message per press
    this.itemHeld = keys.item;

    return {
      seq: ++this.seq,
      steer: this.steer,
      gas: keys.up ? 1 : 0,
      brake: keys.down,
      item,
    };
  }
}
