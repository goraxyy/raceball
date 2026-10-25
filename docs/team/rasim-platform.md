# Rasim: Platform and controller guide

You own **everything between the players' hands and the game state**: the monorepo, the server, hosting, rooms and pairing, netcode, and the phone controller.

| Area | Where |
|---|---|
| Monorepo, tooling, CI scripts | repo root |
| Game server (Colyseus rooms, 60 Hz loop) | `apps/server` |
| Protocol, the contract (everyone reviews changes) | `packages/shared` |
| Connection, snapshot buffer, interpolation, React hooks | `apps/web/src/net` |
| Phone controller logic (Nuris owns `style.css` and the visual markup) | `apps/pad` |
| Vercel: the web + pad projects (in your account; Railway is Ali's) | `apps/web/vercel.json`, `apps/pad/vercel.json`, the Vercel dashboard |

## How your work connects to the others

- **Ali** gives you `game-core` (the `Race` API in [his guide](ali-game.md#5-agree-the-game-core-api-with-rasim)). You run it inside the room, feed it inputs, and broadcast its snapshots and events.
- **Ali's renderer** reads interpolated balls from your net library each frame.
- **Nuris's UI** reads lobby and race state from your React hooks, and styles the pad.
- **You decide:** what goes in the schema (lobby/race state) vs the `snap` message (ball transforms), and what each role is allowed to send.

## Golden rules

1. **The server is the only simulation.** It runs exactly **one instance**, because rooms live in memory.
2. **Pads send input. Screens only render.** Nobody else changes the game state.
3. **Stale input = neutral.** No input for 200 ms means no gas.
4. **HTTPS/WSS everywhere,** including in dev (tunnels).
5. **Test every pad change on a real iPhone and a real Android phone** before merging.

---

## M0: Setup

### 1. Bootstrap the monorepo
1. Follow [README > Bootstrap](../../README.md#bootstrap-milestone-m0-done-once-by-rasim).
2. Add a root `tsconfig.base.json` that every package extends:

   ```json
   {
     "compilerOptions": {
       "target": "ES2022",
       "module": "ESNext",
       "moduleResolution": "Bundler",
       "strict": true,
       "skipLibCheck": true,
       "isolatedModules": true,
       "resolveJsonModule": true
     }
   }
   ```

3. **Workspace packages export TypeScript source directly**, so no build step is needed in dev:

   ```json
   // packages/shared/package.json
   { "name": "@raceball/shared", "type": "module", "main": "src/index.ts", "types": "src/index.ts" }
   ```

4. **The server runs TS with `tsx` in dev, and is bundled with `tsup` for production.** Bundle the workspace packages in, and keep the npm dependencies external:

   ```json
   // apps/server/package.json (scripts)
   { "dev": "tsx watch src/index.ts", "build": "tsup src/index.ts --format esm --target node24 --no-external @raceball/shared --no-external @raceball/game-core", "start": "node dist/index.js" }
   ```

   (If your tsup version doesn't take that flag, use `noExternal: [/^@raceball\//]` in `tsup.config.ts`.)

5. **Root scripts:**

   ```json
   {
     "dev": "pnpm -r --parallel --filter \"./apps/*\" dev",
     "build": "pnpm -r build",
     "typecheck": "pnpm -r exec tsc --noEmit",
     "lint": "eslint .",
     "test": "pnpm -r test"
   }
   ```

6. **Lint and format:** ESLint (flat config, with `typescript-eslint`) and Prettier with default settings. Add a `.prettierrc` and `eslint.config.js` at the root.
7. **Ports:** web 5173, pad 5174 (`server: { port: 5174 }` in `apps/pad/vite.config.ts`), server 2567.
8. **Env files:** add an `.env.example` to each app ([variables](../WORKFLOW.md#environment-variables)).

### 2. Colyseus server skeleton

The Colyseus template gives you `app.config.ts`. Register the room and a health check there:

```ts
import config from "@colyseus/tools";
import { RaceRoom } from "./rooms/RaceRoom";

export default config({
  initializeGameServer: (gameServer) => { gameServer.define("race", RaceRoom); },
  initializeExpress: (app) => { app.get("/health", (_req, res) => { res.send("ok"); }); },
});
```

**Listen on `process.env.PORT`** (Railway sets it), falling back to 2567 locally. If your version of `@colyseus/tools` doesn't read `PORT` on its own, pass `Number(process.env.PORT) || 2567` to `listen()`.

Keep `experimentalDecorators: true` and `useDefineForClassFields: false` in the **server** tsconfig. Colyseus schema decorators break without them. Schema classes live only in `apps/server`. Clients read state without importing them.

### 3. Railway hosting (Ali)

**Ali owns Railway end to end:** the project, the service settings, deploys and logs, plus `apps/server/Dockerfile`, `.dockerignore` and `railway.json` ([his guide](ali-game.md#6-deploying-the-server-to-railway)). Your part is the server code it relies on: listen on `process.env.PORT` and answer `/health` (section 2). Tell Ali when the server needs a new environment variable or a new workspace package.

### 4. Deploying web and pad to Vercel

Both projects live in **Nuris's** Vercel account (moved from yours after it hit the free plan's 100 deploys a day), connected to the `raceball` GitHub org (Vercel's GitHub app is installed on the org). The live sites are the pad, https://raceball-omega.vercel.app, and the web app, https://raceball-hw9w.vercel.app. Ask Nuris for dashboard changes. To recreate them:

1. In Vercel, choose New Project > Import `raceball/raceball`.
2. **Root Directory:** `apps/web`. Framework: Vite. Make sure "Include files outside the root directory in the build step" is enabled, because the app imports `packages/shared`.
3. **Env:** `VITE_SERVER_URL = wss://raceball-server-production.up.railway.app`, and `VITE_PAD_URL = https://raceball-omega.vercel.app`.
4. Repeat for the pad with Root Directory `apps/pad`. It only needs `VITE_SERVER_URL`.
5. **SPA routing** for `/host` and `/play`: add `apps/web/vercel.json`:

   ```json
   { "rewrites": [{ "source": "/(.*)", "destination": "/index.html" }] }
   ```

6. Only `main` deploys: both `vercel.json` files turn off branch and PR previews (`git.deploymentEnabled`), because the free plan allows 100 deploys a day. To test a branch on a phone, run it locally (see WORKFLOW.md) or merge it.

### 5. Pad: start screen and debug overlay

- Build the "Tap to start" flow from [CONTROLLER.md](../CONTROLLER.md#startup-flow), with a debug overlay (`?debug=1`) showing live gravity.
- Load Eruda only when `?debug=1` is set, so there's an in-page console.
- Open it on an iPhone and an Android phone through the Vercel preview, or a tunnel.

**Done when:** `pnpm dev` runs all three apps and both phones show live gravity values.

---

## M1: Vertical slice

### 1. The room (`apps/server/src/rooms/RaceRoom.ts`)

```ts
import { Room, Client } from "colyseus";
import { NodeIO } from "@gltf-transform/core";
import { readFile } from "node:fs/promises";
import { initPhysics, createRace, type Race } from "@raceball/game-core";
import { PROTOCOL_VERSION, type JoinOptions, type InputMsg } from "@raceball/shared";
import { RaceState, PlayerState } from "./schema";

const TICK_MS = 1000 / 60;

export class RaceRoom extends Room<RaceState> {
  maxClients = 20;                                   // host + 8 viewers + 8 pads + spare
  private race!: Race;
  private acc = 0;
  private tickCount = 0;
  private roles = new Map<string, { role: string; playerId?: string }>();  // by sessionId
  private pairTokens = new Map<string, string>();    // token → playerId
  private lastInputAt = new Map<string, number>();   // playerId → ms

  async onCreate() {
    this.roomId = makeRoomCode();                    // 4 letters. Check your Colyseus version's docs for custom room ids
    this.setState(new RaceState());                  // newer Colyseus: declare `state = new RaceState()` instead
    await initPhysics();
    // dev: relative to apps/server (where `pnpm dev` runs it). Docker sets TRACK_PATH to an absolute path
    const glb = await readFile(process.env.TRACK_PATH ?? "../../packages/game-core/tracks/happy_valley_col.glb");
    this.race = await createRace(new Uint8Array(glb), new NodeIO(), { laps: 3 });

    this.onMessage("input", (client, msg: InputMsg) => {
      const r = this.roles.get(client.sessionId);
      if (r?.role !== "pad" || !r.playerId) return;  // only a bound pad may drive
      this.race.setInput(r.playerId, msg);
      this.lastInputAt.set(r.playerId, Date.now());
    });
    this.onMessage("ping", (client, c: number) => client.send("pong", { c, s: Date.now() }));
    this.setSimulationInterval((dt) => this.tick(dt), TICK_MS);
  }

  onJoin(client: Client, opts: JoinOptions) {
    if (opts.protocol !== PROTOCOL_VERSION) throw new Error("version mismatch, please refresh");
    // host: one per room
    // viewer: create a player, make a pairToken, reply with { playerId, pairToken }
    // pad with pairToken: bind to that player and set paired = true
    // pad without a token: a phone-only player (phoneOnly = true)
  }

  async onLeave(client: Client, consented: boolean) {
    // mark the player disconnected; unless they left on purpose, keep the slot for 20 s
    if (!consented) {
      try { await this.allowReconnection(client, 20); return; } catch { /* timed out */ }
    }
    // remove the player (or just the pad/viewer binding)
  }

  private tick(dtMs: number) {
    this.acc += dtMs;
    while (this.acc >= TICK_MS) {
      this.applyStaleInputRule();
      this.race.step(1 / 60);
      this.acc -= TICK_MS;
      this.tickCount++;
    }
    for (const e of this.race.drainEvents()) this.routeEvent(e);
    this.syncSchemaFromRace();                       // laps, places, phase (cheap, changes are patched ~20 Hz)
    if (this.tickCount % SNAP_EVERY === 0) {         // SNAP_EVERY = 2 → 30 Hz, 1 → 60 Hz
      const snap = this.race.snapshot(this.tickCount, Date.now());
      for (const c of this.clients) {
        const role = this.roles.get(c.sessionId)?.role;
        if (role === "host" || role === "viewer") c.send("snap", snap);
      }
    }
  }
}
```

The schema (`schema.ts`) follows [ARCHITECTURE.md](../ARCHITECTURE.md#protocol-v1-draft-lives-in-packagessharedsrcprotocolts). Small example:

```ts
import { Schema, MapSchema, type } from "@colyseus/schema";

export class PlayerState extends Schema {
  @type("string") name = "";
  @type("string") ball = "lion";
  @type("boolean") phoneOnly = false;
  @type("boolean") paired = false;
  @type("boolean") calibrated = false;
  @type("boolean") assetsLoaded = false;
  @type("boolean") ready = false;
  @type("boolean") connected = true;
  @type("uint8") lap = 0;
  @type("uint8") place = 0;
  @type("number") finishedAt = 0;
}

export class RaceState extends Schema {
  @type("string") phase = "lobby";
  @type("number") countdownEndsAt = 0;
  @type({ map: PlayerState }) players = new MapSchema<PlayerState>();
}
```

### 2. Pairing
- **Viewer joins:**
  1. create a player
  2. `pairToken = crypto.randomUUID()`, then `pairTokens.set(token, playerId)`
  3. reply with `client.send("joined", { playerId, pairToken })`
- **The viewer's QR URL** is `${VITE_PAD_URL}/?room=${code}&t=${pairToken}`. Nuris's `PairingQR` component renders it with the `qrcode` package.
- **Pad joins with `t`:** look up the player, bind the pad, set `paired = true`. The viewer sees that through the schema.
- **The big screen's QR** is `${VITE_PAD_URL}/?room=${code}`, with no token. That path makes a phone-only player.

### 3. Net library for screens (`apps/web/src/net`)

```ts
import { Client, Room } from "colyseus.js";   // the client package for your server's Colyseus version

export const client = new Client(import.meta.env.VITE_SERVER_URL);
export const createAsHost = () => client.create("race", { role: "host", protocol: PROTOCOL_VERSION });
export const joinAsViewer = (code: string, name: string, ball: string) =>
  client.joinById(code, { role: "viewer", protocol: PROTOCOL_VERSION, name, ball });
```

**Clock sync.** Ping once a second:

```ts
setInterval(() => room.send("ping", performance.now()), 1000);
room.onMessage("pong", ({ c, s }: { c: number; s: number }) => {
  const now = performance.now();
  const rtt = now - c;
  const offset = s - (c + rtt / 2);                     // server clock minus local clock
  clock.offset = clock.offset === undefined ? offset : clock.offset * 0.9 + offset * 0.1;
  clock.rtt = rtt;
});
export const serverNow = () => performance.now() + (clock.offset ?? 0);
```

**Snapshot buffer.** Keep about the last 30 snapshots. For a render time `T = serverNow() - interpDelay`:
1. Find the two snapshots around `T`.
2. Lerp the positions, slerp the quaternions, and lerp the heading (wrapped).
3. For the player's **own** ball, extrapolate from the newest snapshot instead: `p + v * min(serverNow() - t, 150 ms)`. Smooth corrections in ([details](ali-game.md#own-ball-extrapolation-with-rasim)).
4. Start `interpDelay` at about 1.5 snapshot intervals. Later, size it from the measured jitter.

**Expose a small API to Ali:** `sample(now)` returns `Map<id, { p, q, h }>` plus `ownId`.

**React hooks for Nuris:**

```ts
export function useRaceState(room: Room) {
  const [state, setState] = useState(() => room.state.toJSON());
  useEffect(() => {
    const update = () => setState(room.state.toJSON());
    room.onStateChange(update);
    return () => room.onStateChange.remove(update);
  }, [room]);
  return state;   // { phase, countdownEndsAt, players: { [id]: PlayerState } }
}
```

Also add `useRoomCode()`, `usePairing()` (playerId, pairToken, paired) and `useNetStats()` (rtt, jitter, snapshot rate) for the net HUD.

### 4. Pad controller (`apps/pad`)

Suggested files:

```
apps/pad/src/
  main.ts          start screen + flow (start → join → name/ball if phone-only → calibrate → ready → racing → results)
  sensors.ts       devicemotion, One Euro filter, steer, shake detection
  calibrate.ts     2-step calibration + Flip
  orientation.ts   Android lock + layoutUI() counter-rotation
  touch.ts         gas/brake zones
  net.ts           join with room/token from the URL, 60 Hz input loop, reconnect
  feedback.ts      sounds + visual cues (no vibration)
  debug.ts         overlay + Eruda
  style.css        Nuris
```

Most of the code is in [CONTROLLER.md](../CONTROLLER.md). The extra pieces:

**One Euro filter** (`sensors.ts`):

```ts
export class OneEuro {
  private x?: number; private dx = 0; private t?: number;
  constructor(private minCutoff = 1.0, private beta = 0.02, private dCutoff = 1.0) {}
  private alpha(cutoff: number, dt: number) { const tau = 1 / (2 * Math.PI * cutoff); return 1 / (1 + tau / dt); }
  filter(value: number, tSec: number) {
    if (this.x === undefined || this.t === undefined) { this.x = value; this.t = tSec; return value; }
    const dt = Math.max(tSec - this.t, 1e-3); this.t = tSec;
    const aD = this.alpha(this.dCutoff, dt);
    this.dx = aD * ((value - this.x) / dt) + (1 - aD) * this.dx;
    const a = this.alpha(this.minCutoff + this.beta * Math.abs(this.dx), dt);
    return (this.x = a * value + (1 - a) * this.x);
  }
}
```

Lower `minCutoff` means less jitter but more lag. Higher `beta` means less lag during fast turns. Tune both on real phones.

**Touch zones** (`touch.ts`):
- Put two full-height `div`s (left = brake, right = gas) **inside the rotated `#ui` container**. Browser hit-testing follows CSS transforms, so "right half" stays under the right thumb whatever the rotation.
- Use pointer events: `pointerdown` sets the button, and `pointerup`/`pointercancel`/`pointerleave` clear it.

**Input loop** (`net.ts`):
- Every 16 ms, and right away when gas, brake or item changes, send `{ seq: ++seq, steer, gas, brake, item }`.
- `item` is true in exactly one message.
- On `visibilitychange` to hidden: send a neutral input and stop the loop. Restart it when the page is visible again.

**Reconnect:** save `roomId`, `playerId` and the reconnection token in `localStorage`. On a drop, try `client.reconnect(token)` with backoff (0.5 s, 1 s, 2 s, then 4 s). Show the "connection lost" screen while retrying.

### 5. Net HUD
On the web (`~` key) and the pad (`?debug=1`), show:
- round-trip time
- jitter
- snapshot rate
- input age at the server (have the server echo it every second)
- fps

**Done when:** a phone steers Ali's ball on a laptop through Railway, and the p95 round trip is written in TASKS.md.

---

## M2: Full race

### Lobby flow
- **Host-only messages:** `start { laps }` (1 for the demo, 3 by default), `addBot`, `removeBot { id }` and `rematch`. Ignore them from any other role. Store `laps` in the schema so every screen shows "Lap 1/1" or "Lap 2/3".
- `lobby` → host presses Start (only when every connected player is paired, calibrated, assets-loaded and ready) → `countdown` (3 s) → `racing` → `results` (15 s or rematch) → `lobby`.
- `race.start()` drives the phase changes. Copy `race.phase` into the schema every tick.

### Phone-only join
- **Pad without a token:** create the player with `phoneOnly = true`. The pad sends `setProfile { name, ball }` before calibrating.
- **The host** shows follow-cam tiles (Ali) for `phoneOnly` players.

### Reconnection and stale input
- `allowReconnection(client, 20)` for pads and viewers. Show `connected = false` in the lobby and HUD.
- **Stale rule:** before each step, if `Date.now() - lastInputAt > 200`, call `race.setInput(id, NEUTRAL)`.

### Bots
- **Fill-up bots (server-side):** a lobby button on the host adds a bot player. Each tick, `race.setInput(botId, race.botInput(botId))`.
- **Load-test bots (client-side):** `apps/server/scripts/bots.ts` joins N pads to a room code from Node, and sends sinusoidal steering with full gas at 60 Hz. Run it against the Railway server with 8 bots, and watch the CPU and memory graphs in the Railway dashboard.

### Events to phones
For each `GameEvent`, send `evt` to the pads (and viewers) of the players involved:
- `bump` goes to both balls
- `item`, `lap`, `finish` and `respawn` go to that player

The pad plays the [sound and visual cue](../CONTROLLER.md#sound-and-visual-feedback).

### Shake to fire an item
See [CONTROLLER.md](../CONTROLLER.md#steering-math-use-gravity-in-the-device-frame). Start the threshold at 18 m/s² with a 600 ms cooldown, and tune it on both phones.

**Done when:** a mixed group (laptop players, phone-only players, bots) finishes 3 laps, and a phone that locks mid-race rejoins its slot.

---

## M3: Hardening

- **Snapshot compression:** send arrays instead of objects, with positions as centimeter integers and quaternions as `Int16` (× 32767). Then try 60 Hz on Railway.
- **Rematch:** results → lobby with the same players, who stay paired.
- **Session stats:** wins and best lap, kept in room memory for the event.
- **Error screens:** room not found, room full, version mismatch, motion permission denied, unsupported browser (no `DeviceMotionEvent`).
  - **Built (Nuris):** each error is a trackside road sign with a code plate, a headline and one button. The copy, the sign art and `errorKindFor(code)` (join error or close code → screen) are in `packages/shared/src/errors.ts`, and the styles are `.error-screen` in `theme.css`, so the pad and the laptop match. See them all at `/ui` > errors and in the pad's `screens.html`.
  - **Pad: wired.** A failed join or a dropped connection shows `errorHtml(kind, room, code)`. Motion denied shows `permission`, and a browser with no `DeviceMotionEvent` shows `unsupported` before the start screen. The button retries (reloads), goes back to start, or copies the link to open in Safari or Chrome.
  - **Web: left for you.** In `/host` and `/play`, catch the join error and render `<ErrorScreen kind={errorKindFor(err.code)} room={code} code={err.code} />`. For `unsupported` on a laptop, check for WebGL 2 before loading Babylon. Unknown paths already show the `lost` screen ("Wrong turn").
- **Self-host Babylon's Meshopt and KTX2 decoders** under `apps/web/public/decoders/`, and point Babylon at them. That removes the CDN dependency on demo day.
- **Pad accessibility settings:** auto-gas, sensitivity (`MAX_STEER` from 30° to 60°), dead zone. Save them in `localStorage`.

---

## Testing matrix (run before merging any pad change, and in full at M4)

| Device | Cases |
|---|---|
| iPhone, Safari | Portrait Lock on and off; landscape left and right; permission allowed, and denied then retried; Low Power Mode; lock the phone mid-race; app switch |
| Android, Chrome | Fullscreen + lock works; sounds play; lock the phone mid-race |
| Both | Venue Wi-Fi and a hotspot; join from the laptop QR and the big-screen QR; 8 players with bots |

## Pitfalls

- **Rooms in memory:** two replicas means two separate sets of rooms, and players can't find each other. Ali keeps Railway at exactly 1 replica.
- **Not listening on `PORT`:** Railway sets `PORT` itself. If the server ignores it, the deploy goes green but the domain never answers.
- **Mixed content:** an HTTPS page can't connect to `ws://`. Always use `wss://`.
- **Missing schema settings:** without `useDefineForClassFields: false` in the server tsconfig, schema fields silently never sync.
- **CORS errors on joining** (the HTTP matchmaking call): allow the Vercel origins in the server's CORS settings.
- **Pad never asks for motion permission:** the request must come from a tap handler, on HTTPS.

## Who to ask

- **Ali:** `game-core` API, events, tuning, which inputs he needs.
- **Nuris:** pad screen designs, `style.css`, which data the UI components need from your hooks.
