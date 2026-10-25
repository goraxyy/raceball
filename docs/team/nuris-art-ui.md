# Nuris: Art direction, audio and UI guide

You own **how RaceBall looks, sounds and feels**:
- the art bible: the style every model, effect and screen follows
- every particle effect and sound
- every screen of UI: lobby, HUD, big-screen overlay, results, and the look of the phone controller
- branding

**Ali builds** the first four planets, the track dressing kit and the landmarks a ball touches, and runs the model pipeline. **You build** planets 5–8, the animated props, Beaver Stadium, the Mount Nittany backdrop and the event-to-effect table ([M3 below](#m3-models-and-effects-taken-over-from-ali)). You review Ali's models against the art bible.

| Area | Where |
|---|---|
| Art bible, budgets, credits | [docs/ASSETS.md](../ASSETS.md) |
| Map art direction, landmark list | [docs/MAP.md](../MAP.md) |
| Raw sources (`.psd`, `.wav`, references) | Drive: `RaceBall/assets-src/` |
| Optimized runtime assets | `apps/web/public/assets/` (`fx/`, `sfx/`, `mus/`, `ui/`). Ali owns `maps/`, `tex/` and `mat/`. `models/` is shared: your planets and animated props go there next to Ali's models |
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
`RaceHud` props: `place`, `lap`, `laps`, `item` (an `ItemId` or `null`), `speed` (km/h: the ball's speed in m/s × 3.6), `wrongWay`, the player's `color` and `shape` slots, and optional `total` (players in the race) and `maxSpeed` (top of the gauge, default 40). Keep it in the corners, and leave the middle clear for the race.

Built in `apps/web/src/ui/RaceHud.tsx`: the place plate and lap top left (the lap turns yellow on the final lap), the item badge top right (it wiggles with "Shake!"), a segmented toy speedometer bottom right, and the wrong-way banner top center. `/ui` > hud previews it with controls.

### VFX v1 (rolling dust, bump sparks, respawn poof)
1. In the Babylon Playground, create a `ParticleSystem` on a sphere, open the Inspector, and tweak it until it looks right.
2. Export it to JSON from the browser console: `copy(JSON.stringify(ps.serialize()))`. Paste that into `apps/web/public/assets/fx/fx_dust.json`.
3. Put the textures in `fx/`, and make the texture names in the JSON match the files.
4. Tell Ali the file name and which event it belongs to (e.g. `fx_bump_sparks.json` → `bump`). He adds it to his effects table.

Built: `fx_dust`, `fx_bump_sparks`, `fx_respawn_poof` and `fx_respawn_stars` share one drawn atlas, `fx_atlas.png`. Instead of hand-copying from the Playground, `tools/fx/build_fx.mjs` builds them with the same Babylon API and writes the JSON, and `tools/fx/gen_fx_textures.py` draws the atlas. `/ui` > fx previews them. The event table for Ali is in [ASSETS.md > VFX v1](../ASSETS.md#vfx-v1-files).

### Results screen + podium
`Results` props: `rows[]` (everyone in finishing order: id, place, name, color, shape, ball, time, bestLap, bumps, optional title), `laps`, optional `onRematch`, `lobbyAt` + `now` (server time, for "Back to the lobby in 12") and `children`. The top three rows stand on the podium, so there's no separate `podium[]`. Times are ms; `null` shows "DNF".

Built in `apps/web/src/ui/Results.tsx`: a drawn toy podium on the left (gold, silver and bronze blocks rise 3rd, 2nd, 1st, and each planet drops onto its block), the "Final classification" sheet on the right (gaps to the winner, "Fastest lap" and "Bumper car" stickers, brag titles), a one-time confetti burst, and Rematch. **Ali's 3D podium:** pass it as `children` and it replaces the drawn podium; the header and the sheet stay. `/ui` > results previews it, and Replay reruns the ceremony.

### Music
A lobby loop and a race loop. Use CC0 or royalty-free music only, and list every track in the credits.

Done as original tracks: `tools/audio/gen_music.py` composes and renders `mus_lobby_loop.wav` (100 BPM, swung, F major) and `mus_race_loop.wav` (148 BPM, G major) into `apps/web/public/assets/mus/`. Change a part or the mix in the script and rerun it (about 10 s). `/ui` > music plays them looped, with the final-lap speed-up and the laptop mix. How the game should play them is in [ASSETS.md](../ASSETS.md#audio).

---

## M3: VFX, sound and branding

### VFX v2
Boost flames + trail, Lion Roar shockwave ring, Creamery spill splat, snowfall + snow puffs, finish confetti, speed lines. Use **GPU particles** (`GPUParticleSystem`) for the big ones, like snowfall and confetti.

Done: nine effects built by `tools/fx/build_fx.mjs` from the atlas in `tools/fx/gen_fx_textures.py` (now 16 cells: flame, splat, snowflake, streak and painted confetti added), plus the `SpeedLines` overlay. Snowfall and confetti run on the GPU where supported. How code fires each one: [ASSETS.md > VFX v2 files](../ASSETS.md#vfx-v2-files).

### Full sound pass
- **Every event gets a sound:** boost, roar, spill, pickup, lap, final lap, finish, respawn, crowd cheer, crowd "oooh".
- **Mix:** the big screen is louder and has the music. Laptops play quieter, and mostly their own ball.
- **Captions:** every sound that carries information gets a short on-screen caption on the big screen ("Final lap!", "Lion Roar!"). Keep the list in ASSETS.md.

Done: one sound bank (`apps/web/src/audio/sounds.ts`) and a mixer (`mixer.ts`) with buses, a big-screen and a laptop mix, music ducking, the lobby → race crossfade and the final-lap lift. The Kenney shortlist is processed by `tools/audio/build_sfx.py`, and the crowd cheer, the "oooh" and the Lion Roar are our own (`tools/audio/gen_sfx.py`). `<Captions>` puts the key cues on the big screen as stickers. Try it all at `/ui` > sound. How code plays it: [ASSETS.md > Sound pass](../ASSETS.md#sound-pass-the-bank-the-mix-and-captions).

### Branding
- **Logo:** RaceBall wordmark + ball mark, original art in the palette colors.
- **Title screen, loading screen (with a progress bar), brag card:** a results card per player with best lap, top speed and bumps.
- **Favicons** for web and pad.

Built:
- **Logo:** a planet ball with its orbit ring crossing in front, rolling right, plus the wordmark in Barlow Condensed Black Italic, in the UI's sticker style. `tools/brand/gen_brand.py` draws it with the text turned into outlines, so the files look right anywhere: `apps/web/public/assets/ui/ui_logo.svg` (light backgrounds), `ui_logo_dark.svg` (dark backgrounds) and `ui_logo_mark.svg` (the ball alone, e.g. for Devpost). In React, use `<Logo />` from `pieces.tsx`.
- **Favicons:** the mark on a paper tile for web and on a gas orange tile for the pad, so the two tabs are easy to tell apart. `tools/brand/render_icons.mjs` renders the 180 px `apple-touch-icon.png` for both apps (for iPhone "Add to Home Screen").
- **Title screen:** `TitleScreen` (props `hostHref`, `joinHref`, optional `practiceHref`) is the web app's `/`: the logo, the eight planets racing along a kerb, and "Host a race" / "Join from a laptop".
- **Loading screen:** `LoadingScreen` now shows the logo and a race tip that changes every 4 s.
- **Brag card:** `BragCard` (props `row` (a `ResultRow`), `total`, `laps`, optional `topSpeed` in km/h and `date`) is one player's race as a phone-sized card: place, planet, time, best lap, top speed, bumps and their brag title. The winner's card is flag yellow. Show each laptop player their own card after the results. It's sized for a phone screenshot; a pad version can follow the same layout.
- **Rerun after a change:** `pip install fonttools brotli`, then `python3 tools/brand/gen_brand.py && node tools/brand/render_icons.mjs`.

### Error screens (with Rasim)
Each error is a trackside road sign on a post, so even a failure looks like part of race day. Room not found is a yellow "?" diamond, the full grid is a board with all 8 player colors lit, an update is a blue refresh disc, motion off is a prohibition sign over a phone, the dropped connection is a struck-out Wi-Fi diamond, and a wrong address is a green U-turn board. Each one has a code plate (room + code, for whoever's debugging), a plain headline and one button that fixes it. The sign drops in on its post and wobbles to a stop.

One source for both apps: `packages/shared/src/errors.ts` (copy, signs, `errorKindFor`) and `.error-screen` in `theme.css`. The laptop uses `<ErrorScreen>`, and the pad uses `errorHtml`. It sits side by side when there's room and stacks on a phone held upright. Preview: `/ui` > errors and the pad's `screens.html`. Wiring `/host` and `/play` is Rasim's ([Rasim's guide](rasim-platform.md#m3-hardening)).

### M3: Models and effects taken over from Ali

These four used to be Ali's. Ali's guide has the [model pipeline](ali-game.md#m0-run-one-asset-through-the-whole-pipeline) and the [checklist](ali-game.md#before-you-commit-a-model); his model scripts in `tools/models/` already do most of the work.

#### Event-to-effect table (`fx.ts`)
One table in `apps/web/src/game/fx.ts`: for every `GameEvent` (`bump`, `item`, `overtake`, `lap`, `finish`, `respawn`, in `packages/shared/src/protocol.ts`), which particle files from `fx/` play, where (on the ball, or the big screen only), which sound from your sound bank, and which caption. Export a small `playFx(event, ...)` that does it with `ParticleSystem.Parse` and your mixer. Ali calls it from the event stream in `game.ts` and adds the camera shake. Agree the function signature with him first.

Done: `FX_TABLE` in `fx.ts` is the table, and `GameFx` runs it. It's already wired: `NetSession.onEvent` passes the server's `evt` messages on, `NetFeed` and local mode call `onEvent`, and `game.ts` hands each event to Ali's camera shake and to `fx.play(event)`. `GameView` owns the mixer (sound starts on the first tap; `?mute` silences it) and shows `<Captions>` on the big screen. What it does, and the camera-shake hook for Ali: [ASSETS.md > Event-to-effect table](../ASSETS.md#event-to-effect-table-fxts).

#### Planet balls 5–8
Mercury, Venus, Uranus, Neptune, with the same rules as the first four (art bible, one material, 1024² at most, the `ring` mesh). `tools/models/build_planet_balls.py` builds them: give each a base color and details in `PLANETS`, run it in Blender, optimize with `gltf-transform` as in Ali's guide, then add the planet to `PLANET_MODELS` in `apps/web/src/game/balls.ts`.

Done: all four are in `PLANETS` in the script (Mercury's craters have a pale rim, Venus's cloud bands are wavy, and every detail sits above the orbit ring, where the camera sees it) and in `PLANET_MODELS`. A test checks that every planet has a model file. No Blender install needed: `pip install bpy` gives a headless Blender that runs the script (`python tools/models/build_planet_balls.py`). Review them at `/ui` > models.

#### Animated props
Item boxes (spin + bob), flags, the arch, crowd cards (2-frame sprite cards). Animate in Blender, export with Animation on, and give every animation a clear name (`anim_itembox_spin`), because the game plays them by name. Put them on the dressing kit's palette texture where you can (`tools/models/build_dressing_kit.py`).

Done: `tools/models/build_animated_props.py` builds them all on the kit's palette into `models/kit_animated.glb`: the item box, a checkered and a blue-and-white flag, the finish arch with a swinging banner and flags on top, and three crowd cards. It imports the dressing kit script for its palette and helpers (that script's build now runs in `build()`, unchanged). The prop list and every animation name for Ali are in [ASSETS.md > Animated props](../ASSETS.md#animated-props-modelskit_animatedglb).

#### Beaver Stadium and Mount Nittany
Model over the greybox boxes in `assets-src/happy_valley.blend`, in the `visual` collection, and don't touch `collision` or `markers` (Ali's guide: [how to model over the greybox](ali-game.md#m3-how-to-model-over-the-greybox)). The stadium tunnel walls are collision, so the bowl must leave the tunnel clear. Budgets: 40k triangles for the stadium (instance one stand segment around the bowl), a card or texture for Mount Nittany. The map visuals are rebuilt by `tools/track/build_happy_valley.py`, so agree with Ali how your models get placed (imported by the script, or a separate `maps/` file) before you start.

Done as a separate `maps/` file, so Ali's map script stays as it is: `tools/models/build_landmarks.py` builds both in map coordinates into `maps/happy_valley_landmarks.glb`, and `apps/web/src/game/landmarks.ts` loads it over the map and hides the greybox pieces it replaces. What's in it, the clearances and what Ali can drop from the greybox: [ASSETS.md > Landmarks](../ASSETS.md#landmarks-beaver-stadium-and-mount-nittany).

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
