// The pairing QR and the big screen's phone-only QR both open the pad with these query params.

export interface PadParams {
  /** Room code, e.g. "ABCD" */
  room?: string;
  /** From a laptop's pairing QR. Absent = phone-only player */
  pairToken?: string;
}

/** URL the QR code encodes. padBase is VITE_PAD_URL, e.g. https://raceball-pad.vercel.app */
export function padUrl(
  padBase: string,
  room: string,
  pairToken?: string,
): string {
  const url = new URL(padBase);
  url.searchParams.set("room", room);
  if (pairToken) url.searchParams.set("t", pairToken);
  return url.toString();
}

/** Read the params back on the pad, from location.search */
export function readPadParams(search: string): PadParams {
  const q = new URLSearchParams(search);
  const room = q.get("room")?.trim().toUpperCase() || undefined;
  const pairToken = q.get("t")?.trim() || undefined;
  return { room, pairToken };
}
