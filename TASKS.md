# RaceBall: tasks

**How to use this file**
- Tick a box in the same PR as the work: change `- [ ]` to `- [x]`. Edit on GitHub (the pencil button) or in your editor. Checkboxes in repo files can't be clicked on GitHub, only edited.
- Each task has one owner. Ask before taking someone else's.
- Blocked? Write `BLOCKED: <why>` next to the task and tell the team.
- **No fixed schedule:** work through the milestones **in order**. Don't polish M3 while M2 is broken. Hold an integration check-in at the end of each milestone: merge, play one full match, update this file.
- **Step-by-step instructions for every task are in your guide:**
  - [Ali](docs/team/ali-game.md)
  - [Rasim](docs/team/rasim-platform.md)
  - [Nuris](docs/team/nuris-art-ui.md)

| Milestone | Goal |
|---|---|
| M0 Setup | Everyone runs the project; a phone shows live sensor values; a test model loads |
| M1 Vertical slice | One phone steers one ball on one laptop, through the Railway server |
| M2 Full race | 4+ players (laptop or phone-only) race 3 laps from lobby to results |
| M3 Happy Valley + items | Penn State map art pass, themed items, sound, 60 fps |
| M4 Freeze + test | Bug fixes only, full test matrix, final deploy |
| M5 Demo | Script, video, Devpost |

---

## Decisions

- [x] **Phone-only players:** yes. They join from the big screen's QR code and get a follow-cam tile
- [x] **Engine:** Babylon.js. Blender is the level editor ([workflow](docs/ASSETS.md#importing-assets-and-editing-the-scene))
- [x] **Gas:** hold the right thumb (auto-gas remains an accessibility option)
- [x] **Pairing:** the laptop shows a QR code, and the phone scans it
- [x] **Theme:** Penn State, the *Happy Valley Grand Prix* ([docs/MAP.md](docs/MAP.md))
- [x] **Server hosting:** Railway, US East (Virginia), with Fly.io as the fallback ([why and costs](docs/ARCHITECTURE.md#hosting-and-costs))
- [x] **Max players:** 8 per race
- [x] **Schedule:** none. Milestones in order

## Still open
- [ ] Native iPhone app ([what it is](docs/CONTROLLER.md#native-iphone-app-stretch)): keep it as a stretch goal or drop it? Does anyone have a Mac?

## Test devices

| Person | Phone | OS / browser | Laptop |
|---|---|---|---|
| Ali | | | |
| Rasim | | | |
| Nuris | | | |

---

## M0: Setup
**Done when:** everyone runs `pnpm dev`; a phone over HTTPS shows live sensor values; a test `.glb` loads in the web app.

**All**
- [ ] Complete [ONBOARDING.md](docs/ONBOARDING.md), including the first PR (your row in "Test devices")
- [ ] Agree on protocol v1 together and commit it as `packages/shared/src/protocol.ts`

**Ali**
- [ ] Add Rasim and Nuris as collaborators (Settings > Collaborators)
- [ ] Protect `main` with a ruleset ([steps](docs/WORKFLOW.md#protecting-main))
- [ ] Create the Railway project from the repo and invite Rasim; import `apps/web` and `apps/pad` into Vercel ([steps](docs/team/rasim-platform.md#3-deploying-the-server-to-railway)). As repo owner, only you can grant them GitHub access
- [ ] `game-core`: Rapier world, ground plane, one ball, `step(dt, inputs)`, a keyboard input adapter
- [ ] `apps/web/src/game`: Babylon canvas mounted in React (right-handed scene); local mode `/play?local=1`; chase camera v0
- [ ] Dev-only Inspector toggle (`Shift+I`)

**Rasim**
- [ ] Bootstrap the monorepo (README > Bootstrap, then the rest of the [M0 steps](docs/team/rasim-platform.md#m0-setup)); `pnpm dev` starts web, pad and server
- [ ] ESLint + Prettier, `tsconfig.base.json`, root scripts, `.env.example` files
- [ ] Configure the Railway service (Dockerfile, US East, 1 replica, no sleeping, watch paths, domain) and deploy a hello-world Colyseus server with a `/health` check; give Ali the Vercel settings for web + pad
- [ ] Pad: "Tap to start", then motion permission, then a debug overlay with live gravity, on an iPhone **and** an Android phone

**Nuris**
- [ ] Art bible in `docs/ASSETS.md`: style, palette, the 8 player colors + shapes, Penn State mood board
- [ ] Review the Kenney Marble Kit, Racing Kit, Particle Pack and audio packs; write a shortlist
- [ ] Take 1 ball + 1 track piece through the pipeline; verify in the Sandbox; commit to `apps/web/public/assets/`
- [ ] Create the shared Drive folder `RaceBall/assets-src`, with `happy_valley.blend` inside

---

## M1: Vertical slice
**Done when:** one phone steers one ball on one laptop through the **Railway** server, and the p95 delay is measured and written here: `p95 = ____ ms`.

**Ali**
- [ ] Ball control: heading + turn rate from `steer`, force from `gas`, grip, damping from `brake`, max speed, ground check, a little air control
- [ ] **Greybox of the full Happy Valley route** in Blender (Kenney pieces + boxes for landmarks), with gameplay markers ([marker table](docs/ASSETS.md#blender-is-our-level-editor))
- [ ] `game-core` `loadTrack()`: trimesh colliders + markers from `packages/game-core/tracks/happy_valley_col.glb`, with a Vitest test
- [ ] Respawn at the right `respawn_*` marker when the ball falls below y = -10 or gets stuck
- [ ] Commit the `game-core` API types first (the `Race` interface), so Rasim can build against them
- [ ] Player view renders **server snapshots** (via Rasim's net library); the chase camera follows the heading smoothly
- [ ] All feel constants in `game-core/src/tuning.ts`, with `lil-gui` sliders in local mode

**Rasim**
- [ ] `RaceRoom`: roles host/viewer/pad, short room code, join/leave, `PROTOCOL_VERSION` check
- [ ] 60 Hz simulation loop calling `game-core`; `snap` sent to host + viewers (30 Hz first, then 60 Hz)
- [ ] Pairing: viewer gets a `pairToken`, its QR opens the pad with the token, and the pad is bound to that player
- [ ] `apps/web/src/net`: client, clock sync, snapshot buffer, interpolation, own-ball extrapolation, `useRaceState` / `usePairing` hooks
- [ ] Pad steering: device-frame gravity, One Euro filter, dead zone + curve, `steer` from -1 to 1
- [ ] Pad 2-step calibration (+ Flip button); hold-to-gas on the right half, brake on the left; input sent at 60 Hz and on change
- [ ] Rotation fix v1: Android lock; iPhone Portrait Lock onboarding + self-rotated UI; counter-rotation fallback
- [ ] Wake Lock; block zoom, scroll and selection
- [ ] Net HUD (`~`) on web + pad debug overlay with Eruda (`?debug=1`)

**Nuris**
- [ ] 4 ball skins (Lion, Creamery scoop, football, snowball), with a player-color ring
- [ ] Track dressing kit on one shared palette texture: barriers, fall trees, lamp posts, start/finish arch; HDRI as `.env`
- [ ] Lobby components with fake data: `HostLobby`, `ViewerJoin`, `PairingQR`, `PlayerList`, `LoadingScreen`
- [ ] Pad screens in Figma; agree the markup contract with Rasim; write `apps/pad/src/style.css`
- [ ] First sound set: rolling loop, bump, countdown, UI click

---

## M2: Full race
**Done when:** 4+ players (laptop **and** phone-only, real or bots) finish a 3-lap race from lobby to results in the correct order, and reconnecting works.

**Ali**
- [ ] Checkpoints from markers (sensor events), 3 laps, live ranking (laps, then checkpoint, then distance), finish order
- [ ] Race phases in `game-core`: lobby, countdown (inputs ignored), racing, results
- [ ] Ball-to-ball collisions that feel good; emit `bump` (with strength) and `overtake` (with section) events
- [ ] `botInput()` for Rasim's bots
- [ ] Own-ball extrapolation in the player view (with Rasim)
- [ ] Big screen: overview camera + **up to 4 follow-cam tiles** for phone-only players, with an automatic fallback to name tags below 50 fps
- [ ] Expose the track outline (`path`) and positions (about 10 Hz) for Nuris's `TrackMap`

**Rasim**
- [ ] Lobby flow end to end: create, join, pair, calibrate, assets loaded, ready, host starts
- [ ] **Phone-only join:** pad joins from the big-screen QR with no token; `setProfile` with name/ball; `phoneOnly` in the schema
- [ ] Phases synced in the schema: lobby, countdown, racing, results, back to lobby
- [ ] Reconnection for pad + viewer into the same slot (`allowReconnection`); stale input becomes neutral after 200 ms
- [ ] Fill-up bots (server-side, using `botInput`) and a load-test bot script (8 pads against Railway)
- [ ] Route `evt` messages to the right pads; Android haptic patterns; iPhone sound + flash fallback
- [ ] Shake detection for firing items

**Nuris**
- [ ] Big-screen overlay: `TrackMap` (SVG, color + shape markers), `Standings`, `Countdown`, `FollowTile` frames
- [ ] Player HUD: `RaceHud` (position, lap, item slot, speed, wrong-way warning)
- [ ] VFX v1 as JSON: rolling dust, bump sparks, respawn poof
- [ ] `Results` screen + podium layout (with Ali)
- [ ] Music: lobby loop + race loop

---

## M3: Happy Valley + items
**Done when:** the map looks like *our* Penn State, the items work, it sounds finished, there's no dev UI, and it runs at 60 fps on the demo laptops.

**Ali**
- [ ] Items: Blue & White Boost, Lion Roar (shockwave), Creamery Spill (puddle); item boxes; odds by place
- [ ] Section mechanics: library-step bounces, Lion Shrine bank + jump, Creamery cone ramp + puddles, stadium tunnel, snow/ice surfaces, College Ave boost pads
- [ ] Event-to-effect table (`fx.ts`): particles, sounds and camera shake for every event
- [ ] Performance pass: instancing/merging, one shadow light, LOD, freezing static meshes; under 150 draw calls
- [ ] Camera polish: wider FOV at speed, shake on bumps (off with reduced motion), grid swoop during the countdown

**Rasim**
- [ ] Snapshot compression (quantized arrays); confirm 60 Hz on Railway
- [ ] Rematch flow; session stats (wins, best lap)
- [ ] Error screens: room not found or full, version mismatch, permission denied, unsupported browser
- [ ] Self-host Babylon's Meshopt/KTX2 decoders; check the health check and logs
- [ ] Pad accessibility settings: auto-gas, sensitivity, dead zone

**Nuris**
- [ ] **Landmark art pass** in this order: Old Main, Lion Shrine, Creamery + cone, Beaver Stadium, Pattee Library, Mount Nittany backdrop (budgets in [your guide](docs/team/nuris-art-ui.md#m3-happy-valley-art-pass))
- [ ] Ball skins 5–8: Old Main bell, beach ball, library book, campus squirrel
- [ ] VFX v2: boost flames, roar ring, ice-cream splat, snowfall, confetti, speed lines (GPU particles for the heavy ones)
- [ ] Animated props: item boxes, flags, arch, crowd cards
- [ ] Full sound pass + mix (big screen vs laptops), crowd cheers; captions for key audio cues
- [ ] Logo, title screen, loading screen with progress, brag card, favicons

---

## M4: Freeze + test (everyone)
- [ ] **Feature freeze:** bug fixes only
- [ ] Test matrix ([details](docs/team/rasim-platform.md#testing-matrix-run-before-merging-any-pad-change-and-in-full-at-m4)): iPhone Safari (Portrait Lock on and off, landscape left and right), Android Chrome, Low Power Mode, locking the phone mid-race, Wi-Fi drop and rejoin, mixed laptop + phone-only players, 8 players
- [ ] Measure delay on the demo network: `p50 = ____ ms, p95 = ____ ms`
- [ ] Asset budget check on the **actual demo laptops**: download size `____ MB`, fps `____`
- [ ] Final deploy, Railway service running, git tag `v1.0`

## M5: Demo + submission (everyone)
- [ ] Rehearse the [demo script](docs/DEMO.md#script-about-3-minutes) twice, with roles
- [ ] Judges join with **just their phones** from the big-screen QR
- [ ] Backup gameplay video
- [ ] Devpost: description, screenshots, video, stack, team
- [ ] Run through the [DEMO.md](docs/DEMO.md) checklists
- [ ] After the event: delete the Railway project (or keep it on Hobby)

---

## Stretch backlog
- [ ] Client-side prediction for your own ball ([Tier 2](docs/ARCHITECTURE.md#how-to-cut-delay))
- [ ] LAN server mode ([Tier 3](docs/ARCHITECTURE.md#how-to-cut-delay))
- [ ] Snow Day item
- [ ] Second map (e.g. downtown State College at night)
- [ ] Native iPhone app for team phones ([details](docs/CONTROLLER.md#native-iphone-app-stretch))
