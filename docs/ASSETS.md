# Assets: art bible and pipeline

Owner: **Nuris**. Ali integrates the assets into gameplay. RaceBall is **asset-heavy** (models, materials, audio, particles, animation), so budgets and a pipeline are decided in M0, not at the end.

## Art direction (decide in M0)

- **Theme:** a **toy-sized Penn State campus**: the Happy Valley Grand Prix ([docs/MAP.md](MAP.md)). Fall colors (orange/red trees, brick) for most of the lap, then a snowy finale. Navy and white serve as accent colors. Use **original art only**, with no official Penn State logos ([trademark note](MAP.md#trademark-note)).
- **Style:** stylized, chunky low-poly shapes with PBR materials (soft roughness, saturated colors), readable from a couple of meters away on a laptop screen at a judging table.
- **Landmarks:** one strong, simplified silhouette each (Old Main's bell tower, the Lion Shrine, the Creamery cone, the Beaver Stadium bowl). Exaggerate the proportions, and don't chase realism.
- **Palette:** a main palette of 5–6 colors, plus **8 player colors that are colorblind-safe**. Each player color also gets a **shape or pattern** (stripes, dots, star, ring, …), so players never have to be told apart by color alone.
- **Mood board:** 5–10 reference images (campus photos + target style) in `docs/moodboard/`.

## Units and conventions

- 1 unit = 1 meter · Y is up · ball diameter = 1 m · track width ≥ 6 m.
- Pivot at the base center of each object. Apply transforms in Blender before export (Ctrl+A → All Transforms).
- Use lowercase snake_case names with a prefix:
  - `trk_` track pieces · `prop_` props · `ball_` balls · `fx_` particles
  - `mat_` materials · `sfx_` sound effects · `mus_` music · `ui_` UI images
- **Collision meshes are separate:** model simple, material-free `*_col` objects and export them as `track_<name>_col.glb`. The server builds its physics from these. Never use the detailed visual mesh for physics.

## Importing assets and editing the scene

**Yes, we can import our own assets and edit the scene.** This is the workflow:

### Importing
- Babylon loads **`.glb` / `.gltf`** (our standard), plus `.obj`, `.stl` and `.babylon` through `@babylonjs/loaders`.
- Anything else (FBX, game-ready packs, sculpts): open it in Blender, then export to glTF.
- Load into **asset containers** (`LoadAssetContainerAsync`), so a whole section can be preloaded during the lobby and added to the scene in one go.

### Blender is our level editor
The whole map lives in **one Blender file** (`happy_valley.blend`, kept in the Drive folder): track pieces, landmarks and props. **Gameplay markers** are Empties with custom properties:

| Empty name | Custom properties | Used by |
|---|---|---|
| `spawn_1` … `spawn_8` | `rb = "spawn"`, `slot = 1…8` | Server: starting grid |
| `cp_00`, `cp_01`, … | `rb = "checkpoint"`, `index = 0…`. The Empty's scale = the gate size | Server: laps + ranking |
| `respawn_03`, … | `rb = "respawn"`, `checkpoint = 3` | Server: where fallen balls return |
| `item_*` | `rb = "item"` | Server: item box positions |
| `boost_*` | `rb = "boost"`, `power = 1.0` | Server: boost pads |
| `surface_*` (a mesh, not an Empty) | `rb = "surface"`, `grip = 0.2`, `kind = "icecream" / "snow" / "ice"` | Server: puddles, snow and ice change grip while the ball is inside |
| `cam_*` | `rb = "camera"`, `section = "creamery"` | Big screen: overview camera positions |

- Put custom properties in the **Object Properties** pane, *not* Object Data Properties. On export, tick **Include → Custom Properties**.
- Use three collections: `visual`, `collision` (simple meshes named `*_col`) and `markers`. Export twice with **Limit to: Visible Objects**:
  - `visual` only → `apps/web/public/assets/maps/happy_valley.glb`, for the screens
  - `collision` + `markers` → `packages/game-core/tracks/happy_valley_col.glb`, for the server
- Babylon reads custom properties into `node.metadata.gltf.extras` (register the loader extension with `import "@babylonjs/loaders/glTF/2.0/Extensions/ExtrasAsMetadata.js"`). Extras on Blender *objects* come through reliably. Check the exported `.gltf` JSON if one goes missing.

### Editing in Babylon
- **Inspector** (`Shift+I` in dev): select objects, move them with gizmos, and tweak materials, lights, shadows, post-processing and particles **live in the running game**. Inspector edits are *not saved*, so copy the final values back into Blender or into code.
- **Node Material Editor** (https://nme.babylonjs.com) for special materials. Save them as JSON.
- **Babylon Sandbox** (https://sandbox.babylonjs.com): drag in any `.glb` to check scale, materials and animations.
- **Babylon.js Editor** (free desktop app, imports `.glb` and `.blend`): optional, for composing lighting and materials. Its projects are Next.js-based, so don't build the game inside it. Blender + our repo stay the source of truth.

## Budgets (targets for 60 fps on a mid-range laptop)

| What | Budget |
|---|---|
| Total download for one race | **≤ 40 MB** compressed (about 15–20 s on 20 Mbps hackathon Wi-Fi) |
| Track, visual | ≤ 300k triangles, ≤ 150 draw calls (use instancing and merged meshes) |
| Each ball | ≤ 5k triangles, 1 material |
| Textures | ≤ 2048². KTX2 (ETC1S for color, UASTC for normal maps) or WebP |
| Unique materials on screen | ≤ 30. Reuse them aggressively |
| Animations | glTF, baked, 30 fps |
| Particles | Texture atlas ≤ 1024², ≤ 2,000 live particles total |
| Audio | SFX: mono .mp3, 96–128 kbps. Music: stereo, 128–160 kbps. Loudness normalized |

Check draw calls and frame time with the Babylon Inspector, on the **actual demo laptops**.

## Pipeline

1. **Source:** a Blender file or an asset pack, kept in `assets-src/`. This folder is git-ignored and synced through the shared Drive folder.
2. **Export:** glTF 2.0 binary (`.glb`) from Blender, with +Y up, modifiers applied, animations included and textures embedded.
3. **Optimize:**
   ```bash
   gltf-transform optimize in.glb out.glb --compress meshopt --texture-compress ktx2
   # KTX2 needs KTX-Software (toktx) installed; otherwise use: --texture-compress webp
   ```
4. **Check:** drop the file into the Babylon Sandbox (https://sandbox.babylonjs.com). Confirm the scale, materials and animations look right.
5. **Commit** the optimized file under `apps/web/public/assets/<type>/` and add a line to [Credits](#credits).

## Materials

- Most materials come from glTF as standard PBR (metallic/roughness).
- Special effects (glowing boost pads, melted ice cream, ice, a holographic finish line) are made in the **Node Material Editor** (https://nme.babylonjs.com). Save them as JSON in `apps/web/public/assets/mat/`.
- **Lighting:** one HDRI (Poly Haven, CC0) converted to Babylon's `.env` format for image-based lighting, plus one directional "sun" light for shadows.

## Particles and VFX

- Author effects in the **Babylon Inspector's particle tools**, or in the Playground. Save them as JSON in `apps/web/public/assets/fx/`.
- Use **GPU particles** for big effects, and CPU particles for small ones.
- **VFX list:**
  - rolling dust
  - boost flames + trail
  - bump sparks
  - item pickup burst
  - Creamery spill splat
  - Lion Roar shockwave ring
  - snowfall + snow puffs
  - respawn poof
  - finish confetti
  - speed lines on the player view

## Animation

- glTF animations from Blender, which Babylon plays as AnimationGroups:
  - item boxes spinning and bobbing
  - flags
  - the start/finish arch
  - crowd cutouts
  - podium
- *Optional:* the balls get "faces" (eyes as decals or morph targets) that react to bumps. This makes them feel like characters.

## Audio

| Category | Examples | Notes |
|---|---|---|
| Ball | Rolling loop (pitch follows speed), landing, edge scrape | Spatial on the player view |
| Gameplay | Bump, item pickup, boost, Lion Roar, spill, respawn | Spatial |
| Crowd | Stadium cheer (on overtakes), "oooh" (on big bumps) | Big screen |
| Race | Countdown beeps, lap, final lap, finish fanfare | Non-spatial, also captioned |
| UI | Click, join, ready, error | Short and quiet |
| Music | Lobby loop, race loop, results sting | The big screen plays music; laptops play quieter |

- **Generated sounds:** `tools/audio/gen_sfx.py` synthesizes the first set from scratch (rolling loop, 3 bumps, countdown beep + go, UI click). Run it again after changing a sound, then audition everything in `tools/audio/preview.html` (serve the repo root, e.g. `python -m http.server`, and open `/tools/audio/preview.html`).
- **Loops ship as WAV, not MP3.** MP3 adds a little silence at both ends, which leaves an audible gap every time a loop repeats. Loops are short mono 22 kHz WAVs instead (a 4 s loop is about 170 KB), and they repeat cleanly in every browser.
- **Rolling loop in code:** play `sfx_roll_loop.wav` with `loop = true`, and drive its playback rate (about 0.6 at a crawl to 1.6 at top speed) and volume from the ball's speed.
- **Bumps:** pick one of `sfx_bump_01–03` at random, set the volume from the event's `strength`, and vary the playback rate by ±5%, so repeated bumps don't sound identical.

## Where assets come from (check every license)

- **Kenney Marble Kit:** CC0, 150+ track pieces + marbles, includes glTF. A near-perfect base for a ball racer.
- **Penn State landmarks:** model them ourselves from photo references. Don't extract meshes from Google Earth or other map services, because their licenses forbid it.
- **Kenney Racing Kit**, **Particle Pack**, **audio packs** (CC0).
- **Quaternius:** CC0 low-poly models.
- **Poly Haven:** CC0 HDRIs and textures.
- **Poly Pizza:** filter to CC0 only.
- **freesound.org:** check each sound's license, and prefer CC0.

**Rule:** nothing is committed without a line in [Credits](#credits).

## Git and big files

- GitHub warns about files over 50 MB and **blocks files over 100 MB**. Commit only **optimized runtime assets**.
- Raw sources (`.blend`, `.psd`, `.wav`, `.fbx`, source textures) go in the shared Drive folder `RaceBall/assets-src`. Mirror it locally to `assets-src/`, which is git-ignored.
- If you really need to version big binaries, use Git LFS. Check your account's LFS storage and bandwidth quota first.

## Credits

| Asset | Author | License | Link | Used for |
|---|---|---|---|---|
| `sfx_roll_loop`, `sfx_bump_01–03`, `sfx_countdown_beep`, `sfx_countdown_go`, `sfx_ui_click` | RaceBall team (synthesized by `tools/audio/gen_sfx.py`) | Original, MIT with the code | This repo | Rolling, bumps, countdown, UI |
