# Nuris: Art, audio and UI guide

You own **how RaceBall looks, sounds and feels**:
- the art bible
- every model, material, texture, animation, particle effect and sound
- every screen of UI: lobby, HUD, big-screen overlay, results, and the look of the phone controller
- branding

| Area | Where |
|---|---|
| Art bible, budgets, credits | [docs/ASSETS.md](../ASSETS.md) |
| Map art direction, landmark list | [docs/MAP.md](../MAP.md) |
| Raw sources (`.blend`, `.psd`, `.wav`, references) | Drive: `RaceBall/assets-src/` |
| Optimized runtime assets | `apps/web/public/assets/` (`models/`, `maps/`, `tex/`, `mat/`, `fx/`, `sfx/`, `mus/`, `ui/`) |
| React UI components | `apps/web/src/ui/` |
| Phone controller look | `apps/pad/src/style.css` + the markup in `apps/pad/index.html` |

## How your work connects to the others

- **Ali** loads your assets and fires your particles and sounds from gameplay events. Name files exactly as agreed, because his code refers to them by path. He gives you the greybox map: you model over it, and **never move the collision or markers**.
- **Rasim** gives you React hooks with live data (`useRaceState`, `usePairing`, `useNetStats`) and wires the pad logic to your markup. Agree class names and IDs with him before styling the pad.
- If an asset is over budget, Ali's 60 fps target fails. Check the [budgets](../ASSETS.md#budgets-targets-for-60-fps-on-a-mid-range-laptop) before you start a model, not after.

## Golden rules

1. **One style, everywhere.** If an asset doesn't match the art bible, it doesn't ship.
2. **Every asset goes through the pipeline:** export, optimize, check in the Sandbox, commit, credit.
3. **Original art only.** No official Penn State logos or wordmarks ([trademark note](../MAP.md#trademark-note)).
4. **Raw sources never go in git.** They live in Drive.
5. **Color is never the only signal.** Every player has a color *and* a shape.

## Tools

| Tool | What for |
|---|---|
| Blender 4.x | Modeling, UVs, materials, animation, glTF export |
| gltf-transform CLI | Optimizing every `.glb` |
| KTX-Software (`toktx`), optional | KTX2 texture compression (otherwise use WebP) |
| Babylon Sandbox (https://sandbox.babylonjs.com) | Checking every exported model |
| Node Material Editor (https://nme.babylonjs.com) | Special materials |
| Babylon Playground + Inspector (https://playground.babylonjs.com) | Making particle effects |
| Audacity | Trimming, fades, loudness, MP3 export |
| Figma (free) | UI mockups for the lobby, HUD, pad and results |

---

## M0: Setup

### 1. Art bible (fill in the Art direction section of ASSETS.md)
- **Mood board:** 5–10 images. Campus photos (Old Main, Lion Shrine, Creamery, Beaver Stadium, fall trees, snow), plus 3–4 games in the target style (chunky low-poly, soft PBR, saturated colors). Save them to `docs/moodboard/` as small JPGs, under 300 KB each.
- **Main palette:** 5–6 colors, with hex codes. Use fall brick and orange for the environment, navy and white as accents, and snow white for the finale.
- **Player colors (colorblind-safe, based on the Okabe-Ito palette, with white in place of black so it shows on the track):**

  | Slot | Color | Hex | Shape |
  |---|---|---|---|
  | 1 | Orange | `#E69F00` | Circle |
  | 2 | Sky blue | `#56B4E9` | Square |
  | 3 | Bluish green | `#009E73` | Triangle |
  | 4 | Yellow | `#F0E442` | Star |
  | 5 | Blue | `#0072B2` | Diamond |
  | 6 | Vermillion | `#D55E00` | Cross |
  | 7 | Reddish purple | `#CC79A7` | Pentagon |
  | 8 | White | `#FFFFFF` | Hexagon |

  These colors and shapes appear on the ball's ring or trim, the map markers, name tags, the HUD and the pad. Add them to `packages/shared/src/constants.ts` (through a PR that Rasim reviews), so everything uses the same values.

### 2. Asset packs
Download and look through the **Kenney Marble Kit**, Racing Kit, Particle Pack and the Kenney audio packs (all CC0). Write a shortlist in ASSETS.md: which track pieces, props, particle textures and sounds you'd use. Put the downloads in `assets-src/packs/` in Drive.

### 3. Run one asset through the whole pipeline
Do this with one ball and one track piece, so the pipeline is proven before real work starts.

1. **Blender:**
   - 1 unit = 1 m. The ball is a 1 m diameter UV sphere, 5k triangles or fewer.
   - Apply the transforms (Ctrl+A > All Transforms).
   - Origin at the base center for props. Origin at the center for balls.
2. **Export:** File > Export > glTF 2.0:

   | Setting | Value |
   |---|---|
   | Format | glTF Binary (`.glb`) |
   | Include | Limit to **Selected Objects** (or Visible), **Custom Properties** on |
   | Transform | **+Y Up** on |
   | Data > Mesh | Apply Modifiers on, UVs on, Normals on |
   | Data > Material | Export |
   | Animation | On, only if the asset is animated |
   | Compression | Off (we compress in the next step) |

3. **Optimize:**

   ```bash
   gltf-transform optimize ball_lion.glb ball_lion.opt.glb --compress meshopt --texture-compress webp
   # with toktx installed you can use --texture-compress ktx2 instead
   gltf-transform inspect ball_lion.opt.glb    # check triangles, textures, size
   ```

4. **Check:** drag the optimized file into the Babylon Sandbox. Look at the scale (compare it with a 1 m cube), the materials, normals (no black or inside-out faces) and any animations.
5. **Commit:** rename it to the final name, without `.opt`, and place it in the right folder (e.g. `apps/web/public/assets/models/ball_lion.glb`). Add a credits line in ASSETS.md, then open a PR with a Sandbox screenshot.

### 4. Drive folder
Create the folders:
- `RaceBall/assets-src/`, containing `models/`, `maps/` (`happy_valley.blend` lives here), `textures/`, `audio/`, `packs/` and `reference/`
- `RaceBall/exports/`, for files you want to share before they're optimized

Share the folder with Ali and Rasim.

**Done when:** one ball and one track piece are in the repo, load in the Sandbox at the right size, and the art bible plus the player colors are in ASSETS.md.

---

## M1: Vertical slice

### Ball skins (first 4: Lion, Creamery scoop, football, snowball)
- **One material per ball.** Textures are 1024² at most. The player-color ring or trim must be clearly visible, because it's how players spot themselves.
- **The Lion is an original cartoon lion.** Don't copy the official logo.
- **File names:** `models/ball_lion.glb`, `ball_scoop.glb`, `ball_football.glb`, `ball_snowball.glb`.
- **Player color:** either make the colored part a separate material named `mat_player_color` (Ali tints it in code), or deliver a mask texture. Agree which one with Ali.

### Track dressing kit
Barriers, fall trees (2–3 variants), lamp posts, benches, the start/finish arch, ground tiles.

**Use one shared palette texture:** a small image (e.g. 256×256) of color swatches. UV each prop onto the swatches it needs, and give **every prop the same material**. Hundreds of props then cost a handful of draw calls instead of hundreds. This is the most important performance trick for an asset-heavy scene.

**Lighting:** one HDRI from Poly Haven (CC0), converted to Babylon's `.env` format (the Babylon Sandbox or IBL tools can do this), saved as `tex/env_happy_valley.env`.

### Lobby UI (`apps/web/src/ui`)
Build React components that **only take props**. Rasim's hooks feed them data, so you can build them with fake data first.

| Component | Props | Shown on |
|---|---|---|
| `HostLobby` | `code`, `phoneJoinUrl`, `players[]`, `laps`, `onLapsChange`, `onAddBot`, `canStart`, `onStart` | Big screen |
| `ViewerJoin` | `onJoin(code, name, ball)` | Laptop |
| `PairingQR` | `url`, `paired` | Laptop |
| `PlayerList` | `players[]` (name, ball, color, shape, paired, calibrated, ready, connected) | Both |
| `LoadingScreen` | `progress` (0–1), `label` | Both |

For QR codes, use the `qrcode` package: `QRCode.toDataURL(url, { margin: 1, width: 512 })` into an `<img>`. Make the big-screen QR **large**, because people scan it from across the room.

### Pad UI
Design every screen in Figma first: start, name/ball picker (phone-only players), calibrate (2 steps + Flip), ready, racing, results, connection lost.

The racing screen must work **with the phone held sideways like a wheel**:
- left half = brake
- right half = gas
- item button at the top center
- a thin status strip (position, lap, item)

Keep it big, simple and high contrast. Players won't look at the phone while racing.

Then agree the markup contract with Rasim (IDs and classes such as `#ui`, `.zone-left`, `.zone-right`, `.item-btn`, `.screen-calibrate`) and write `style.css`. Remember that `#ui` gets rotated by code, so lay it out in landscape.

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
| `TrackMap` | `path` (the route outline as `[x, z]` points from Ali), `players[]` (id, x, z, color, shape) |
| `Standings` | `rows[]` (place, name, color, shape, lap, gap) |
| `Countdown` | `endsAt` (server time) |
| `FollowTile` | `name`, `color`, `shape`, `place` (the frame around Ali's camera tiles) |

- `TrackMap` is an SVG viewed from above. Fit `path` into the box, and draw each player as their **shape** in their **color**.
- Ali exposes `path` and positions (throttled to about 10 Hz for the UI).
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

## M3: Happy Valley art pass

### Landmark order and budgets (from [MAP.md](../MAP.md))

| Order | Landmark | Triangle budget | Notes |
|---|---|---|---|
| 1 | Old Main + start/finish arch | 25k | The judges see this first. Bell tower silhouette |
| 2 | Lion Shrine | 8k | Original low-poly lion on a rock |
| 3 | Creamery + giant cone | 15k | The cone is also a ramp. Match Ali's collision shape |
| 4 | Beaver Stadium bowl + tunnel + scoreboard prop | 40k total | Build one stand segment and instance it around the bowl |
| 5 | Pattee Library facade + steps | 12k | Steps must line up with the collision steps |
| 6 | Mount Nittany backdrop | Card or texture | A far-away silhouette layer, not real geometry |

### How to model over the greybox
1. Open `happy_valley.blend` in Drive. Ali's greybox boxes and collision meshes are there.
2. Model each landmark **in place over its box**, in the `visual` collection. Don't touch `collision` or `markers`.
3. Anything a ball can touch (ramps, steps, the cone) must match the collision shape. If you want a different shape, ask Ali to change the collision first.
4. Use the shared palette texture where you can. Only hero pieces (Old Main, the lion, the cone) get their own textures.
5. Export the `visual` collection to `apps/web/public/assets/maps/happy_valley.glb`, optimize it, check the size, commit. Ali reloads it.

### Remaining skins
Old Main bell, blue-white beach ball, library book, campus squirrel. Same rules as the first four.

### VFX v2
Boost flames + trail, Lion Roar shockwave ring, Creamery spill splat, snowfall + snow puffs, finish confetti, speed lines. Use **GPU particles** (`GPUParticleSystem`) for the big ones, like snowfall and confetti.

### Animated props
Item boxes (spin + bob), flags, the arch, crowd cards (2-frame sprite cards). Animate in Blender, then export with Animation on. Give every animation a clear name (`anim_itembox_spin`), because Ali plays them by name.

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

- **Unapplied scale:** Ali's physics and your visuals no longer match. Always apply transforms before export.
- **Too many materials:** every unique material costs draw calls. Use the palette texture.
- **4K textures:** they blow the download and memory budget. 2048² is the maximum, and most props need far less.
- **Custom properties not exported:** they go in Object Properties, and "Custom Properties" must be ticked on export.
- **Moving the collision or markers** while doing the art pass breaks Ali's gameplay. Ask him first.
- **Official Penn State logos:** don't use them, even on small props.

## Who to ask

- **Ali:** sizes, collision shapes, effect names, animation names, how big-screen cameras frame landmarks.
- **Rasim:** hooks and data for the UI, the pad markup, QR URLs.
