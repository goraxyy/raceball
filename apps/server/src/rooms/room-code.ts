import type { Presence } from "colyseus";

// No I, O, 0 or 1 lookalikes: codes are read off a big screen and typed on a laptop.
const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ";
const LENGTH = 4;
const PRESENCE_KEY = "raceball:roomCodes";

export function randomCode(random: () => number = Math.random): string {
  let code = "";
  for (let i = 0; i < LENGTH; i++)
    code += ALPHABET[Math.floor(random() * ALPHABET.length)];
  return code;
}

/** Reserve a code no other live room uses. Release it with releaseRoomCode() on dispose. */
export async function claimRoomCode(presence: Presence): Promise<string> {
  for (;;) {
    const code = randomCode();
    if (!(await presence.sismember(PRESENCE_KEY, code))) {
      await presence.sadd(PRESENCE_KEY, code);
      return code;
    }
  }
}

export async function releaseRoomCode(presence: Presence, code: string) {
  await presence.srem(PRESENCE_KEY, code);
}

/** Normalize what a player typed: "abcd " → "ABCD" */
export const normalizeCode = (typed: string) => typed.trim().toUpperCase();
