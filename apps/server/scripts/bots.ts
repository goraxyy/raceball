// Load test: N phone-only pads join a room and drive like real players.
//   pnpm --filter @raceball/server bots <ROOM> [count=8] [server=Railway]
// Each pad marks itself calibrated + ready, then sends sinusoidal steering with full gas at 60 Hz.
// Start the race from the big screen (or add these to a room whose host starts it), and watch
// CPU and memory in the Railway dashboard. Prints round-trip stats once a second. Ctrl+C to stop.
import { Client, type Room } from "@colyseus/sdk";
import { PROTOCOL_VERSION, type PongMsg } from "@raceball/shared";

const [
  room,
  count = "8",
  server = "wss://raceball-server-production.up.railway.app",
] = process.argv.slice(2);
if (!room) {
  console.error("usage: bots <ROOM> [count] [server]");
  process.exit(1);
}

const SEND_MS = 16;
const rtts: number[] = [];

async function bot(i: number): Promise<Room> {
  const pad = await new Client(server).joinById(room.toUpperCase(), {
    role: "pad",
    protocol: PROTOCOL_VERSION,
    name: `Load ${i}`,
  });
  for (const type of ["welcome", "netstat", "evt"])
    pad.onMessage(type, () => {});
  pad.onMessage("pong", (m: PongMsg) => rtts.push(performance.now() - m.c));
  pad.send("hello");
  pad.send("status", { calibrated: true, ready: true });
  let seq = 0;
  const phase = Math.random() * Math.PI * 2;
  const drive = setInterval(() => {
    const t = performance.now() / 1000;
    pad.send("input", {
      seq: ++seq,
      steer: Math.sin(t * 1.5 + phase) * 0.6,
      gas: 1,
      brake: false,
      item: false,
    });
  }, SEND_MS);
  const ping = setInterval(() => pad.send("ping", performance.now()), 1000);
  pad.onLeave(() => {
    clearInterval(drive);
    clearInterval(ping);
  });
  return pad;
}

const pads = await Promise.all(
  Array.from({ length: Number(count) }, (_, i) => bot(i + 1)),
);
console.log(
  `${pads.length} bots driving in room ${room.toUpperCase()} on ${server}`,
);

setInterval(() => {
  if (!rtts.length) return;
  const sorted = rtts.splice(0).sort((a, b) => a - b);
  const pct = (p: number) =>
    Math.round(sorted[Math.floor((p / 100) * (sorted.length - 1))]);
  console.log(
    `rtt p50 ${pct(50)} ms, p95 ${pct(95)} ms (${sorted.length} pings)`,
  );
}, 1000);

process.on("SIGINT", async () => {
  await Promise.all(pads.map((p) => p.leave()));
  process.exit(0);
});
