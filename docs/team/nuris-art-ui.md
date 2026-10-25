# Nuris: Art direction, audio and UI guide

You own **how RaceBall looks, sounds and feels**:
- the art bible: the style every model, effect and screen follows
- every particle effect and sound
- every screen of UI: lobby, HUD, big-screen overlay, results, and the look of the phone controller
- branding

**Ali builds the 3D models** (balls, landmarks, props, the track dressing kit) and runs the model pipeline. You review them against the art bible.

| Area | Where |
|---|---|
| Art bible, budgets, credits | [docs/ASSETS.md](../ASSETS.md) |
| Map art direction, landmark list | [docs/MAP.md](../MAP.md) |
| Raw sources (`.psd`, `.wav`, references) | Drive: `RaceBall/assets-src/` |
| Optimized runtime assets | `apps/web/public/assets/` (`fx/`, `sfx/`, `mus/`, `ui/`). Ali owns `models/`, `maps/`, `tex/` and `mat/` |
| Shared theme: fonts, tokens, buttons, shapes, planet balls | `packages/shared/theme/theme.css` (imported by the pad and the web app) |
| React UI components | `apps/web/src/ui/` (styles in `ui.css`; preview them all at `/ui` in dev) |
| Phone controller look | `apps/pad/src/style.css` + the markup in `apps/pad/screens.html` |

## How your work connects to the others

- **Ali** builds the 3D models from your art bible, and fires your particles and sounds from gameplay events. Name files exactly as agreed, because his code refers to them by path. Review his models against the art bible before they're merged.
- **Rasim** gives you React hooks with live data (`useRaceState`, `usePairing`, `useNetStats`) and wires the pad logic to your markup. Agree class names and IDs with him before styling the pad.
- If an effect or texture is over budget, Ali's 60 fps target fails. Check the [budgets](../ASSETS.md#budgets-targets-for-60-fps-on-a-mid-range-laptop) before you start, not after.

## Golden rules

1. **One style, everywhere.** If an asset doesn't match the art bible, it doesn't ship.
2. **Every asset goes through the pipeline:** export, optimize, check in the Sandbox, commit, credit.
3. **Original art only.** No official Penn State logos or wordmarks ([trademark note](../MAP.md#trademark-note)).
4. **Raw sources never go in git.** They live in Drive.
5. **Color is never the only signal.** Every player has a color *and* a shape.

## Tools

| Tool | What for |
|---|---|
| Babylon Sandbox (https://sandbox.babylonjs.com) | Reviewing Ali's models against the art bible |
| Node Material Editor (https://nme.babylonjs.com) | Special materials |
| Babylon Playground + Inspector (https://playground.babylonjs.com) | Making particle effects |
| Audacity | Trimming, fades, loudness, MP3 export |
| `apps/pad/screens.html` (open `/screens.html` in dev) | Every pad screen and its markup, in the real style |
| Figma (free), optional | Mockups for the lobby, HUD and big screen before you build them |

---

## M0: Setup

### 1. Art bible (written: [ASSETS.md > Art bible](../ASSETS.md#art-bible))
The art bible is in ASSETS.md: style pillars, the environment and livery palettes, a color key for each route section, the planet balls, player colors and shapes, shape language, materials, lighting, VFX and type. Swatch sheets are in `docs/art/`. Keep it up to date when the style changes, and review every model and screen against it.

- **Player colors and shapes** are `PLAYER_COLORS` and `PLAYER_SHAPES` in `packages/shared/src/constants.ts`. The server stores a slot number (0–7), and every screen looks up the values there. They appear on the planet's orbit ring, the map markers, name tags, the HUD and the pad.
- **Planets** are `PLANETS` in the same file. No two players in a race share one.
- **Mood board:** [docs/moodboard/](../moodboard/README.md), with notes on what to keep from each landmark. Add new references there, each with its license in the credits.

### 2. Particle and audio packs
Download and look through the Kenney **Particle Pack** and the Kenney audio packs (all CC0). Add the particle textures and sounds you'd use to the shortlist in ASSETS.md. Put the downloads in `assets-src/packs/` in Drive. (Ali reviews the Marble Kit and Racing Kit.)

**Done when:** the art bible, the mood board and the particle and audio shortlist are in the repo (all done). The shortlist maps every effect and sound event to a Kenney file, and lists the gaps to fill from other sources.

---

## M1: Vertical slice

### Lobby UI (`apps/web/src/ui`)
Build React components that **only take props**. Rasim's hooks feed them data, so you can build them with fake data first. They're built in `apps/web/src/ui` (import them from `./ui`), and `/ui` in dev shows all of them with fake data. Players are `LobbyPlayer` objects: the lobby fields of `PlayerView` plus the player's `id`.

| Component | Props | Shown on |
|---|---|---|
| `HostLobby` | `code`, `phoneJoinUrl`, `players[]`, `laps`, `onLapsChange`, `onAddBot`, `canStart`, `onStart` | Big screen |
| `ViewerJoin` | `onJoin(code, name, ball)`, optional `taken` (planets already picked) and `initialCode` (from `?room=`) | Laptop |
| `PairingQR` | `url` (undefined until the token arrives), `paired` | Laptop |
| `PlayerList` | `players[]` (name, ball, color, shape, paired, calibrated, ready, connected) | Both |
| `LoadingScreen` | `progress` (0–1), `label` | Both |

For QR codes, use the `qrcode` package: `QRCode.toDataURL(url, { margin: 1, width: 512 })` into an `<img>`. Make the big-screen QR **large**, because people scan it from across the room.

### Pad UI
Every pad screen is built and styled in [`apps/pad/screens.html`](../../apps/pad/screens.html), with the real `style.css`: start, name + planet picker (phone-only players), calibrate (2 steps + Flip), ready, racing, countdown, results and connection lost. Under each screen is its exact markup, which is the contract for Rasim's pad code. Add new screens there first.

The racing screen must work **with the phone held sideways like a wheel**:
- left half = brake
- right half = gas
- the middle column: the status plate (place, shape, lap), the steering gauge (`--steer`) and the item badge

Keep it big, simple and high contrast. Players won't look at the phone while racing.

Agree any markup change with Rasim before you make it (classes such as `.zone-left`, `.zone-right`, `.is-down`, `.item-btn[data-item]`, `.steer`, `.status[data-change]`, `.racing[data-cue]`). Remember that `#ui` gets rotated by code, so sizes use container units (`cqh`, `cqw`), not `vw`/`vh`.

### First sound set
Rolling loop, bump, countdown beeps, UI click.

**Processing in Audacity:**
1. Trim and add short fades.
2. Normalize: Effect > Volume and Compression > Loudness Normalization. Aim for about -16 LUFS for music and loops, and peaks around -1 dB for one-shots.
3. Export as MP3. Mono for sound effects (96–128 kbps), stereo for music (128–160 kbps).
4. Name files `sfx_bump_01.mp3`, `sfx_roll_loop.mp3`, and so on.

**Loops** must loop seamlessly: cut at zero crossings and listen on repeat.

---

## M2: Full race

### Big-screen overlay

| Component | Props |
|---|---|
| `TrackMap` | `path` (the route outline as `[x, z]` points in meters, in driving order, from Ali), `players[]` (id, x, z, color, shape), optional `labels[]` (x, z, text) and `width` (road width, default 12 m) |
| `Standings` | `rows[]` (id, place, name, color, shape, lap, gap, optional finished), `laps`. The `id` lets rows slide to their new place on an overtake |
| `Countdown` | `endsAt` (server time), `now` (pass the net session's `clock.serverNow`, so every screen flips together) |
| `FollowTile` | `name`, `color`, `shape`, `place`, optional `children` (the frame around Ali's camera tiles; the middle is transparent) |

- `TrackMap` is an SVG viewed from above. Fit `path` into the box, and draw each player as their **shape** in their **color**.
- Ali exposes `path` and positions (throttled to about 10 Hz for the UI). The map smooths the 10 Hz jumps with a short transition.
- **Layout:** wrap them in `<div className="race-overlay">` over the Babylon canvas: follow tiles along the top, standings on the right, the map in a `.map-card` at the bottom left. It doesn't catch clicks, so the canvas stays usable. `/ui` > race shows the full layout with a fake race on the real Happy Valley loop.
- Everything must read from a couple of meters away on a laptop screen at a judging table: big type, thick outlines, no thin gray text.

### Player HUD (laptop)
`RaceHud` props: `place`, `lap`, `laps`, `item`, `speed`, `wrongWay`. Keep it in the corners, and leave the middle clear for the race.

### VFX v1 (rolling dust, bump sparks, respawn poof)
1. In the Babylon Playground, create a `ParticleSystem` on a sphere, open the Inspector, and tweak it until it looks right.
2. Export it to JSON from the browser console: `copy(JSON.stringify(ps.serialize()))`. Paste that into `apps/web/public/assets/fx/fx_dust.json`.
3. Put the textures in `fx/`, and make the texture names in the JSON match the files.
4. Tell Ali the file name and which event it belongs to (e.g. `fx_bump_sparks.json` → `bump`). He adds it to his effects table.

### Results screen + podium
`Results` props: `podium[]` (top 3), `rows[]` (everyone: time, best lap, bumps). The podium can be a 3D scene that Ali stages, with your UI on top. Coordinate the layout with him.

### Music
A lobby loop and a race loop. Use CC0 or royalty-free music only, and list every track in the credits.

---

## M3: VFX, sound and branding

### VFX v2
Boost flames + trail, Lion Roar shockwave ring, Creamery spill splat, snowfall + snow puffs, finish confetti, speed lines. Use **GPU particles** (`GPUParticleSystem`) for the big ones, like snowfall and confetti.

### Full sound pass
- **Every event gets a sound:** boost, roar, spill, pickup, lap, final lap, finish, respawn, crowd cheer, crowd "oooh".
- **Mix:** the big screen is louder and has the music. Laptops play quieter, and mostly their own ball.
- **Captions:** every sound that carries information gets a short on-screen caption on the big screen ("Final lap!", "Lion Roar!"). Keep the list in ASSETS.md.

### Branding
- **Logo:** RaceBall wordmark + ball mark, original art in the palette colors.
- **Title screen, loading screen (with a progress bar), brag card:** a results card per player with best lap, top speed and bumps.
- **Favicons** for web and pad.

---

## Before you commit an asset

- [ ] Named by the convention (`trk_`, `prop_`, `ball_`, `fx_`, `mat_`, `sfx_`, `mus_`, `ui_`)
- [ ] Real-world scale (1 unit = 1 m) and the origin in the right place
- [ ] Within its triangle and texture budget (`gltf-transform inspect`)
- [ ] Optimized (Meshopt + WebP/KTX2)
- [ ] Checked in the Sandbox (scale, normals, materials, animations)
- [ ] In the right folder under `apps/web/public/assets/`
- [ ] Credits line in ASSETS.md
- [ ] Task ticked in TASKS.md

## Pitfalls

- **4K textures:** they blow the download and memory budget. 2048² is the maximum, and most props need far less.
- **Official Penn State logos:** don't use them, even on small props.

## Who to ask

- **Ali:** effect names, model and animation names, and how his models follow the art bible.
- **Rasim:** hooks and data for the UI, the pad markup, QR URLs.
