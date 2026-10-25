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

## Kickoff: the first session, in order

1. **Everyone (15 min):** accept the GitHub invite, clone the repo, and do sections 1–3 of [ONBOARDING.md](docs/ONBOARDING.md) (read, accounts, tools).
2. **Ali (5 min):** protect `main` with a ruleset ([steps](docs/WORKFLOW.md#protecting-main)).
3. **Rasim:** open the **bootstrap PR** ([M0 steps 1–2](docs/team/rasim-platform.md#m0-setup)): monorepo, tooling, empty apps, `pnpm dev` working. Nobody can write app code until it's merged. While you wait:
   - **Nuris:** start the art bible and download the particle and audio packs (no code needed).
   - **Ali:** sketch the route on paper from [MAP.md](docs/MAP.md), download the Kenney Marble and Racing kits, and start the greybox in Blender (no code needed).
4. **Everyone reviews and merges the bootstrap PR,** then runs `pnpm install && pnpm dev` (ONBOARDING section 4).
5. **Everyone, together (30 min): the protocol meeting.**
   - Walk through the [protocol draft](docs/ARCHITECTURE.md#protocol-v1-draft-lives-in-packagessharedsrcprotocolts) and change what's needed.
   - Rasim commits `packages/shared/src/protocol.ts`.
   - Ali commits the `Race` interface (types only) in `game-core`.
6. **Ali:** create and configure the Railway project and deploy the hello-world server ([steps](docs/team/ali-game.md#6-deploying-the-server-to-railway)). Import `apps/web` and `apps/pad` into Vercel with the settings from Rasim ([steps](docs/team/rasim-platform.md#4-deploying-web-and-pad-to-vercel)).
7. **Rasim:** get the pad sensor page working on an iPhone (Android untested: no Android phone on the team).
8. **Everyone:** make your first small PR (your row in "Test devices") to practise the [workflow](docs/WORKFLOW.md).
9. **Work through your M0 checklist in parallel.** When every M0 box is ticked, hold the **M0 check-in**: run the "Done when" line together on real devices, then start M1.

---

## Decisions

- [x] **Phone-only players:** yes. They join from the big screen's QR code and get a follow-cam tile
- [x] **Engine:** Babylon.js. Blender is the level editor ([workflow](docs/ASSETS.md#importing-assets-and-editing-the-scene))
- [x] **Gas:** hold the right thumb (auto-gas remains an accessibility option)
- [x] **Pairing:** the laptop shows a QR code, and the phone scans it
- [x] **Theme:** Penn State, the *Happy Valley Grand Prix* ([docs/MAP.md](docs/MAP.md))
- [x] **Server hosting:** Railway, US East (Virginia), with Fly.io as the fallback ([why and costs](docs/ARCHITECTURE.md#hosting-and-costs))
- [x] **Max players:** 8 per race
- [x] **Race length:** 3 laps. **Demo races are 1 lap**, set with a lap selector in the host lobby
- [x] **Feedback on phones:** sound + visuals only. **No vibration**, and no native iPhone app
- [x] **Demo format:** table presentation with **2 laptops + 4 phones** ([docs/DEMO.md](docs/DEMO.md))
- [x] **Accounts:** Ali owns Railway end to end (project, service settings, deploys, logs). Ali also imports the Vercel projects (he owns the repo), using the settings from Rasim
- [x] **Schedule:** none. Milestones in order

## Still open

Nothing right now. Add new questions here.

## Test devices

| Person | Phone | OS / browser | Laptop |
|---|---|---|---|
| Ali | | | |
| Rasim | iPhone 18 Pro | iOS, Safari | Windows 11 laptop |
| Nuris | | | |

---

## M0: Setup
**Done when:** everyone runs `pnpm dev`; a phone over HTTPS shows live sensor values; a test `.glb` loads in the web app.

**All**
- [ ] Complete [ONBOARDING.md](docs/ONBOARDING.md), including the first PR (your row in "Test devices")
- [x] Agree on protocol v1 together and commit it as `packages/shared/src/protocol.ts`

**Ali**
- [x] Invite Rasim and Nuris as collaborators (Settings > Collaborators)
- [x] Protect `main` with a ruleset ([steps](docs/WORKFLOW.md#protecting-main))
- [x] Create and configure the Railway service (Dockerfile, US East, 1 replica, no sleeping, watch paths, domain) and deploy the hello-world Colyseus server; `/health` returns `ok` ([steps](docs/team/ali-game.md#6-deploying-the-server-to-railway))
  - Deployed: project `raceball`, service `raceball-server` deploys `main` with the `railway.json` settings, `PORT=2567`, and `https://raceball-server-production.up.railway.app/health` returns `ok`
  - Still on the Free plan: it puts the server in `sfo` and makes it sleep when idle; both need Hobby, before the M1 latency measurement and the event
- [x] Import `apps/web` and `apps/pad` into Vercel with Rasim's settings ([steps](docs/team/rasim-platform.md#4-deploying-web-and-pad-to-vercel)). As repo owner, only you can grant them GitHub access
  - `raceball-web` (root `apps/web`) and `raceball-pad` (builds `@raceball/pad` from the repo root) deploy `main`, with Vercel Authentication off for phone testing. Both have `VITE_SERVER_URL`; web also has `VITE_PAD_URL`
- [x] `game-core`: Rapier world, ground plane, one ball, `step(dt, inputs)`, a keyboard input adapter
- [x] `apps/web/src/game`: Babylon canvas mounted in React (right-handed scene); local mode `/play?local=1`; chase camera v0
- [x] Dev-only Inspector toggle (`Shift+I`)
- [x] Review the Kenney Marble Kit and Racing Kit; add track pieces and props to the shortlist ([shortlist](docs/ASSETS.md#kenney-shortlist-marble-kit-20--racing-kit-reviewed-by-ali))
- [ ] Take 1 ball + 1 track piece through the pipeline; verify in the Sandbox; commit to `apps/web/public/assets/`
- [ ] Create the shared Drive folder `RaceBall/assets-src`, with `happy_valley.blend` inside
  - `happy_valley.blend` is built (`assets-src/`, regenerated by `tools/track/build_happy_valley.py`); left: create the Drive folder and upload it

**Rasim**
- [x] Bootstrap the monorepo (README > Bootstrap, then the rest of the [M0 steps](docs/team/rasim-platform.md#m0-setup)); `pnpm dev` starts web, pad and server
- [x] ESLint + Prettier, `tsconfig.base.json`, root scripts, `.env.example` files
- [x] Give Ali the Vercel settings for web + pad
- [x] Pad: "Tap to start", then motion permission, then a debug overlay with live gravity, on an iPhone (iPhone 18 Pro). **Android untested:** nobody on the team has one

**Nuris**
- [x] Art bible in `docs/ASSETS.md`: style, palettes, the 8 player colors + shapes, the planet balls
- [x] Mood board in `docs/moodboard/`: 5–10 campus and style references, each credited (9 Wikimedia Commons photos, style searches listed)
- [x] Review the Kenney Particle Pack and audio packs; add particle textures and sounds to the shortlist ([ASSETS.md](docs/ASSETS.md#kenney-shortlist-particle-pack--audio-packs-reviewed-by-nuris))

---

## M1: Vertical slice
**Done when:** one phone steers one ball on one laptop through the **Railway** server, and the p95 delay is measured and written here: `p95 = ____ ms`.

**Ali**
- [x] Ball control: heading + turn rate from `steer`, force from `gas`, grip, damping from `brake`, max speed, ground check, a little air control
- [x] **Greybox of the full Happy Valley route** in Blender (Kenney pieces + boxes for landmarks), with gameplay markers ([marker table](docs/ASSETS.md#blender-is-our-level-editor))
  - Generated by `tools/track/build_happy_valley.py`: 1,096 m loop, all 8 sections, 9 checkpoints. Autopilot lap ≈ 63 s with no falls; still needs a human playtest on a phone
- [x] `game-core` `loadTrack()`: trimesh colliders + markers from `packages/game-core/tracks/happy_valley_col.glb`, with a Vitest test
  - Tested on a synthetic track, and on the real greybox export (`checkTrack` plus grid, surface and landing checks)
- [ ] Respawn at the right `respawn_*` marker when the ball falls below y = -10 or gets stuck
- [x] Commit the `game-core` API types first (the `Race` interface), so Rasim can build against them
- [ ] Player view renders **server snapshots** (via Rasim's net library); the chase camera follows the heading smoothly
- [x] All feel constants in `game-core/src/tuning.ts`, with `lil-gui` sliders in local mode
- [ ] 4 planet balls (Earth, Mars, Jupiter, Saturn), each with the player-color orbit ring ([art bible](docs/ASSETS.md#balls-the-eight-planets))
- [ ] Track dressing kit on one shared palette texture: barriers, fall trees, lamp posts, start/finish arch; HDRI as `.env`

**Rasim**
- [x] `RaceRoom`: roles host/viewer/pad, short room code, join/leave, `PROTOCOL_VERSION` check
- [ ] 60 Hz simulation loop calling `game-core`; `snap` sent to host + viewers (30 Hz first, then 60 Hz)
- [x] Pairing: viewer gets a `pairToken`, its QR opens the pad with the token, and the pad is bound to that player
- [x] `apps/web/src/net`: client, clock sync, snapshot buffer, interpolation, own-ball extrapolation, `useRaceState` / `usePairing` hooks
- [x] Pad steering: device-frame gravity, One Euro filter, dead zone + curve, `steer` from -1 to 1
- [ ] Pad 2-step calibration (+ Flip button); hold-to-gas on the right half, brake on the left; input sent at 60 Hz and on change
- [ ] Rotation fix v1: Android lock; iPhone Portrait Lock onboarding + self-rotated UI; counter-rotation fallback
- [x] Wake Lock; block zoom, scroll and selection
- [x] Net HUD (`~`) on web + pad debug overlay with Eruda (`?debug=1`)

**Nuris**
- [x] Lobby components with fake data: `HostLobby` (with the lap selector and bot buttons), `ViewerJoin`, `PairingQR`, `PlayerList`, `LoadingScreen` (in `apps/web/src/ui`, preview at `/ui`)
- [x] Pad screens in `apps/pad/screens.html`; agree the markup contract with Rasim; write `apps/pad/src/style.css` (Rasim builds the screens from this markup in `apps/pad/src/screens.ts`)
- [x] First sound set: rolling loop, bump, countdown, UI click

---

## M2: Full race
**Done when:** 4+ players (laptop **and** phone-only, real or bots) finish a 3-lap race from lobby to results in the correct order, and reconnecting works.

**Ali**
- [ ] Checkpoints from markers (sensor events), 3 laps, live ranking (laps, then checkpoint, then distance), finish order
- [ ] Race phases in `game-core`: lobby, countdown (inputs ignored), racing, results; `start(countdownMs, laps)` takes the lap count
- [ ] Ball-to-ball collisions that feel good; emit `bump` (with strength) and `overtake` (with section) events
- [ ] `botInput()` for Rasim's bots
- [ ] Own-ball extrapolation in the player view (with Rasim)
- [ ] Big screen: overview camera + **up to 4 follow-cam tiles** for phone-only players, with an automatic fallback to name tags below 50 fps
- [ ] Expose the track outline (`path`) and positions (about 10 Hz) for Nuris's `TrackMap`

**Rasim**
- [ ] Lobby flow end to end: create, join, pair, calibrate, assets loaded, ready, host starts. `/host` and `/play` use Nuris's components from `apps/web/src/ui` (`HostLobby`, `ViewerJoin`, `PairingQR`, `LoadingScreen`)
- [ ] Host controls: lap selector (1 or 3, default 3), add/remove bots, start, rematch (`start`, `addBot`, `removeBot`, `rematch` messages)
- [ ] **Phone-only join:** pad joins from the big-screen QR with no token; `setProfile` with name/ball; `phoneOnly` in the schema
- [ ] **One planet per player:** each of the 8 `PLANETS` at most once per room; a missing or taken `ball` gets the first free planet; send the taken list so the pad and laptop pickers can grey them out
- [ ] Phases synced in the schema: lobby, countdown, racing, results, back to lobby
- [ ] Reconnection for pad + viewer into the same slot (`allowReconnection`); stale input becomes neutral after 200 ms
- [ ] Fill-up bots (server-side, using `botInput`) and a load-test bot script (8 pads against Railway)
- [ ] Route `evt` messages to the right pads; pad sound + visual cues for each event
- [ ] Shake detection for firing items

**Nuris**
- [x] Big-screen overlay: `TrackMap` (SVG, color + shape markers), `Standings`, `Countdown`, `FollowTile` frames (in `apps/web/src/ui`, live preview at `/ui` > race)
- [x] Player HUD: `RaceHud` (position, lap, item slot, speed, wrong-way warning) (in `apps/web/src/ui`, preview at `/ui` > hud)
- [x] VFX v1 as JSON: rolling dust, bump sparks, respawn poof (in `apps/web/public/assets/fx/`, preview at `/ui` > fx; how to fire them: [ASSETS.md](docs/ASSETS.md#vfx-v1-files))
- [x] `Results` screen + podium layout (with Ali) (in `apps/web/src/ui`, preview at `/ui` > results; Ali's 3D podium can replace the drawn one via `children`)
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
- [ ] Railway: check the health check, logs and resource graphs under load
- [ ] **Landmark art pass** in this order: Old Main, Lion Shrine, Creamery + cone, Beaver Stadium, Pattee Library, Mount Nittany backdrop (budgets in [your guide](docs/team/ali-game.md#m3-landmark-order-and-budgets)); Nuris reviews each against the art bible
- [ ] Planet balls 5–8: Mercury, Venus, Uranus, Neptune
- [ ] Animated props: item boxes, flags, arch, crowd cards

**Rasim**
- [ ] Snapshot compression (quantized arrays); confirm 60 Hz on Railway
- [ ] Rematch flow; session stats (wins, best lap)
- [ ] Error screens: room not found or full, version mismatch, permission denied, unsupported browser
- [ ] Self-host Babylon's Meshopt/KTX2 decoders
- [ ] Pad accessibility settings: auto-gas, sensitivity, dead zone

**Nuris**
- [ ] VFX v2: boost flames, roar ring, ice-cream splat, snowfall, confetti, speed lines (GPU particles for the heavy ones)
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
- [ ] Rehearse the [demo script](docs/DEMO.md#script-about-3-minutes-per-judge-group) twice on the real table setup: 2 laptops, 4 phones, a 1-lap race
- [ ] A judge's own phone can join from Laptop A's QR as a 5th player
- [ ] Backup gameplay video
- [ ] Devpost: description, screenshots, video, stack, team
- [ ] Run through the [DEMO.md](docs/DEMO.md) checklists
- [ ] After the event: Ali deletes the Railway project (or keeps it on Hobby)

---

## Stretch backlog
- [ ] Client-side prediction for your own ball ([Tier 2](docs/ARCHITECTURE.md#how-to-cut-delay))
- [ ] LAN server mode ([Tier 3](docs/ARCHITECTURE.md#how-to-cut-delay))
- [ ] Snow Day item
- [ ] Second map (e.g. downtown State College at night)
