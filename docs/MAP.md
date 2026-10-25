# Map: Happy Valley Grand Prix

**A toy-sized, stylized Penn State campus.** It's *inspired by* real landmarks, not a to-scale replica: exaggerated shapes, chunky low-poly models, fall colors and a snowy finale.

- **Owners:** Ali designs the route (greybox + gameplay markers) and models the landmarks and props. Nuris sets the art direction and does the VFX and sound.
- **Target lap:** 60–75 seconds. 3 laps a race.

## Route

| # | Section | Landmark(s) | Gameplay | Feature / hazard |
|---|---|---|---|---|
| 1 | **Start / finish** | Old Main bell tower behind the start arch | Wide straight, 8-ball starting grid | Boost pads after the line |
| 2 | **Pollock Road** | HUB-Robeson Center | Gentle S-curves | A row of item boxes. A narrow, risky shortcut across the HUB lawn |
| 3 | **Library steps** | Pattee Library facade | Staircase ramps that bounce the balls | Book-stack barriers that topple when bumped |
| 4 | **Lion Shrine hairpin** | The Nittany Lion Shrine (original low-poly lion statue) | Banked hairpin around the shrine | Optional jump ramp over the hedges (shortcut) |
| 5 | **Creamery run** | Berkey Creamery + a giant ice-cream cone | Ramp *up the cone* and drop off the scoop | Melted ice-cream puddles (slippery), sprinkle bumpers |
| 6 | **Beaver Stadium** | Stadium bowl, tunnel, scoreboard prop | Through the tunnel, half a lap of the field, ramp out | The crowd cheers when someone overtakes |
| 7 | **Snowy Arboretum** | Mount Nittany on the horizon | Fast downhill with snow | Snow patches slow you down. Ice patches have low grip |
| 8 | **College Avenue** | Downtown storefronts (generic, no real brands) | Final straight back to Old Main | Boost pads, then the finish |

> Keep each section readable from the big screen: one strong silhouette per landmark, and a clear path color.

## Themed items

| Item | Effect | Look |
|---|---|---|
| **Blue & White Boost** | Short burst of speed | Blue/white flame trail |
| **Lion Roar** | Shockwave that knocks nearby balls away | A roar sound + ring of dust |
| **Creamery Spill** | Drops a slippery melted-ice-cream puddle behind you | Vanilla/chocolate puddle with sprinkles |
| **Snow Day** *(stretch)* | A short snowstorm on everyone **ahead** of you (the comeback item) | Snow particles + a frosted screen edge |

Item odds depend on race position: players at the back get stronger items, which keeps races friendly and close.

## Ball skins (pick 8)

Lion (an original cartoon lion, **not** the official logo) · Creamery scoop (vanilla, chocolate) · Football · Snowball · Old Main bell · Blue-white beach ball · Library book · Campus squirrel

## Asset list

| Priority | Asset | Notes |
|---|---|---|
| **P0** (needed to play) | Track pieces | Kenney Marble Kit (CC0) as the base |
| **P0** | Start/finish arch, barriers, ground tiles, trees (fall colors) | Reuse heavily with instancing |
| **P0** | 4 ball skins | One material each |
| **P1** (the Penn State look) | Old Main | Simplified low-poly bell tower + facade |
| **P1** | Lion Shrine | Low-poly lion on a rock |
| **P1** | Creamery + giant cone | The cone doubles as a ramp |
| **P1** | Beaver Stadium bowl + tunnel + scoreboard | Stands made of repeated, instanced segments |
| **P1** | Pattee Library facade | Facade card + stairs |
| **P2** (polish) | Mount Nittany backdrop | Skybox layer or terrain card |
| **P2** | Crowd cutouts, banners, lamp posts, benches, bike racks | Animated crowd = 2-frame sprite cards |
| **P2** | Snow + ice materials, snowfall FX | |

Use photos for reference and model everything ourselves. Don't extract meshes from Google Earth or other map services, because their licenses forbid it.

## Build order

1. **Greybox (Ali):** lay out the whole route in Blender with Kenney pieces and plain boxes for the landmarks. Add the gameplay markers ([how](ASSETS.md#importing-assets-and-editing-the-scene)), export, and playtest until a lap feels good.
2. **Art pass, one section at a time (Ali, reviewed by Nuris):** replace the boxes with real landmark models. Start with the **start/finish (Old Main)**, because the judges see it first. The collision mesh and markers stay unchanged, so gameplay doesn't break.
3. **Dress + light:** props, HDRI, sound for each section, VFX for the hazards.

## Trademark note

"Penn State," the Nittany Lion logo, the athletics marks and the official wordmarks are **trademarks of Penn State**.

- Use only **original art** inspired by campus landmarks. Don't use official logos, wordmarks or athletics marks in the game or the repo.
- Before showing anything that looks official, check with HackPSU.
- Keep the README disclaimer: the project is not affiliated with or endorsed by Penn State.
