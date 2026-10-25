"""Builds the things on the road you drive into (M3 polish): Creamery Scoops, the Lion Paw bumper and the boost pad.

Run it headless with the bpy module from PyPI (pip install bpy): python tools/models/build_interactables.py
or in Blender (blender -b -P tools/models/build_interactables.py).

Each prop's root sits where the game places it, facing map +z (Blender -Y), and the game animates them itself:
  prop_scoop_vanilla, _strawberry, _chocolate
      a scoop on a waffle-cone tip, a ruffled rim, a drip, sprinkles and a cherry. Origin: the pickup's center
      (game-core's scoop sensor). The ice cream is glossy (mat_scoop: the palette, lacquered); the cone is not
  prop_paw_bumper
      a pinball bumper the size of game-core's paw post (1.1 m radius, 1.4 m tall): a navy body on a white rubber
      ring, a gold light band (mat_paw_light, which the game flashes on every kick) and a lion's paw print on top
  prop_boost_pad
      8 x 4 m like the track's boost markers: a navy frame round a panel of chevrons (mat_boost_chevrons, emissive;
      the game scrolls them forward) with cyan light bars down its sides (mat_boost_light)
Writes assets-src/models/kit_interactables.glb and interactables.blend. Optimize into the game with:
  gltf-transform optimize assets-src/models/kit_interactables.glb apps/web/public/assets/models/kit_interactables.glb \
    --compress meshopt --texture-compress webp --simplify false --join false --instance false --flatten false
"""

import importlib.util
import math
import os
import random
from pathlib import Path

import bpy  # first: the bpy module from PyPI only provides bmesh once bpy is loaded
import bmesh
import numpy as np
from mathutils import Matrix, Vector

ROOT = Path(globals().get("RACEBALL_ROOT") or os.environ.get("RACEBALL_ROOT") or Path(__file__).resolve().parents[2])
OUT = ROOT / "assets-src" / "models"

_spec = importlib.util.spec_from_file_location("dressing_kit_lib", ROOT / "tools" / "models" / "build_dressing_kit.py")
kit = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(kit)

FLAVOURS = {"vanilla": "vanilla", "strawberry": "strawberry", "chocolate": "chocolate"}
SPRINKLES = ["flag", "sky", "go", "stop", "white", "brake", "gas"]
PAW_RADIUS, PAW_HEIGHT = 1.1, 1.4  # game-core's tuning.pawRadius / pawHeight
PAD = (8.0, 4.0)  # across, along: the boost marker's sensor (half-extents 4 x 2)


# ------------------------------------------------------------------ materials

def lacquered(name, roughness=0.28, coat=0.6):
    """The palette under a clear coat: candy-shiny"""
    mat = kit.palette_material().copy()
    mat.name = name
    shader = mat.node_tree.nodes.get("Principled BSDF")
    shader.inputs["Roughness"].default_value = roughness
    shader.inputs["Coat Weight"].default_value = coat
    shader.inputs["Coat Roughness"].default_value = 0.08
    return mat


def glowing(name, color, strength=1.0):
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    shader = mat.node_tree.nodes.get("Principled BSDF")
    rgb = (*kit.srgb(color), 1.0)
    shader.inputs["Base Color"].default_value = rgb
    shader.inputs["Emission Color"].default_value = rgb
    shader.inputs["Emission Strength"].default_value = strength
    shader.inputs["Roughness"].default_value = 0.4
    return mat


def chevron_pixels(n=256):
    """One chevron per tile, pointing up the image (forward along the pad): a bright core with a cyan edge on a
    deep blue that lightens toward the middle. Rows from the top."""
    v = 1 - (np.arange(n) + 0.5) / n
    u = (np.arange(n) + 0.5) / n
    uu, vv = np.meshgrid(u, v)
    center = 0.85 - 1.4 * np.abs(uu - 0.5)  # the chevron's spine
    d = np.abs(vv - center)
    core = np.clip((0.12 - d) / 0.02, 0, 1)[..., None]  # fat enough to read from a chase camera's low angle
    edge = np.clip((0.19 - d) / 0.035, 0, 1)[..., None]
    across = np.abs(uu - 0.5)[..., None]
    base = kit.srgb("#1A56C4") * (1 - across) + kit.srgb("#0C2F7A") * across  # a bright blue zone on the asphalt
    img = base * (1 - edge) + kit.srgb("#3FC4FF") * edge
    img = img * (1 - core) + kit.srgb("#EFFCFF") * core
    return img


def chevron_material():
    n = 256
    img = bpy.data.images.new("tex_boost_chevrons", n, n, alpha=False)
    px = chevron_pixels(n)[::-1]  # Blender's rows start at the bottom
    img.pixels.foreach_set(np.concatenate([px, np.ones((n, n, 1))], -1).astype(np.float32).ravel())
    img.pack()
    mat = bpy.data.materials.new("mat_boost_chevrons")
    mat.use_nodes = True
    nt = mat.node_tree
    shader = nt.nodes.get("Principled BSDF")
    tex = nt.nodes.new("ShaderNodeTexImage")
    tex.image = img
    nt.links.new(tex.outputs["Color"], shader.inputs["Base Color"])
    nt.links.new(tex.outputs["Color"], shader.inputs["Emission Color"])
    shader.inputs["Emission Strength"].default_value = 1.0
    shader.inputs["Roughness"].default_value = 0.3
    return mat


# ------------------------------------------------------------------ helpers

def paint(faces, color, colors):
    for f in faces:
        colors[f] = color


def finish(name, bm, colors, mat, col, parent=None):
    kit.paint(bm, lambda f: colors.get(f, "pit"))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    ob = kit.new_object(name, bm, mat)
    ob.parent = parent
    col.objects.link(ob)
    return ob


def smooth(ob):
    for poly in ob.data.polygons:
        poly.use_smooth = True


def root(name, col):
    ob = bpy.data.objects.new(name, None)
    ob.empty_display_size = 0.5
    col.objects.link(ob)
    return ob


# ------------------------------------------------------------------ the props

def scoop(flavour, palette, gloss, col, seed):
    """About 1.3 m tall round the pickup's center: a waffle-cone tip below, the scoop above, a cherry on top."""
    rng = random.Random(seed)
    top = root(f"prop_scoop_{flavour}", col)
    color = FLAVOURS[flavour]
    shade = {"vanilla": "gold", "strawberry": "stop", "chocolate": "bark"}[flavour]
    # the cone: ten faces round, alternately light and dark like the waffle's squares
    cone = bmesh.new()
    colors = {}
    geom = bmesh.ops.create_cone(cone, cap_ends=True, segments=10, radius1=0.04, radius2=0.33, depth=0.62)
    bmesh.ops.translate(cone, vec=Vector((0, 0, -0.36)), verts=geom["verts"])
    for i, f in enumerate(sorted({f for v in geom["verts"] for f in v.link_faces}, key=lambda f: f.calc_center_median().z)):
        colors[f] = "gold" if (i // 2) % 2 == 0 else "gold_dark"
    paint(kit.cylinder(cone, (0, 0, -0.05), 0.35, 0.08, segments=16, bevel=0.025), "gold_dark", colors)
    finish(f"scoop_cone_{flavour}", cone, colors, palette, col, top)
    # the ice cream
    bm = bmesh.new()
    colors = {}
    paint(kit.blob(bm, (0, 0, 0.2), 0.42, squash=0.88, subdivisions=2), color, colors)
    for i in range(11):  # the ruffled rim where the scoop sits in the cone
        a = 2 * math.pi * i / 11
        paint(kit.blob(bm, (0.36 * math.cos(a), 0.36 * math.sin(a), 0.02), 0.12, squash=0.8, subdivisions=1), color,
              colors)
    for a, length in ((0.6, 0.2), (2.9, 0.13)):  # drips down the cone
        paint(kit.blob(bm, (0.3 * math.cos(a), 0.3 * math.sin(a), -0.08 - length / 2), 0.07, squash=length / 0.07 / 1.6,
                       subdivisions=1), color, colors)
    shadow = [f for f in colors if f.calc_center_median().z < 0.0 and f.normal.z < -0.4]
    paint(shadow, shade, colors)  # a touch of the darker tone under the rim
    for i in range(18):  # sprinkles over the top half
        theta = math.radians(rng.uniform(12, 68))
        phi = rng.uniform(0, 2 * math.pi)
        n = Vector((math.sin(theta) * math.cos(phi), math.sin(theta) * math.sin(phi), math.cos(theta) * 0.88))
        p = Vector((0, 0, 0.2)) + n * 0.42
        faces = kit.bevelled_box(bm, (0, 0, 0), (0.1, 0.028, 0.028), bevel=0.0)
        verts = list({v for f in faces for v in f.verts})
        spin = Matrix.Rotation(rng.uniform(0, math.pi), 4, n.normalized())
        tilt = n.normalized().to_track_quat("Z", "Y").to_matrix().to_4x4()
        bmesh.ops.transform(bm, matrix=Matrix.Translation(p) @ spin @ tilt, verts=verts)
        paint(faces, rng.choice(SPRINKLES if flavour != "strawberry" else SPRINKLES[:2] + ["white", "brake"]), colors)
    paint(kit.blob(bm, (0.03, 0.02, 0.66), 0.1, squash=0.95, subdivisions=2), "stop", colors)  # the cherry
    stalk = kit.cylinder(bm, (0, 0, 0), 0.014, 0.16, segments=5, bevel=0)
    verts = list({v for f in stalk for v in f.verts})
    bmesh.ops.transform(bm, matrix=Matrix.Translation((0.06, 0.03, 0.8)) @ Matrix.Rotation(0.45, 4, "Y"), verts=verts)
    paint(stalk, "bark", colors)
    smooth(finish(f"scoop_cream_{flavour}", bm, colors, gloss, col, top))
    return top


def paw_bumper(palette, gloss, light, col):
    """A pinball bumper, base on the road: a white rubber ring, a white body round a broad gold light band, and a
    navy cap with the Nittany Lion's paw print in white."""
    top = root("prop_paw_bumper", col)
    bm = bmesh.new()
    colors = {}
    r = PAW_RADIUS
    paint(kit.cylinder(bm, (0, 0, 0.12), r + 0.05, 0.24, segments=20, bevel=0.05), "navy", colors)
    paint(kit.cylinder(bm, (0, 0, 0.36), r + 0.02, 0.2, segments=20, bevel=0.08), "white", colors)  # the rubber
    paint(kit.cylinder(bm, (0, 0, 0.76), r - 0.18, 0.62, segments=20, bevel=0.03), "white", colors)
    paint(kit.cylinder(bm, (0, 0, 1.12), r - 0.04, 0.16, segments=20, bevel=0.05), "navy", colors)
    paint(kit.blob(bm, (0, 0, 1.2), r - 0.14, squash=0.18, subdivisions=2), "navy", colors)
    # the paw print, toes forward (map +z, Blender -Y): a main pad and four beans
    pad = kit.blob(bm, (0, 0.14, 1.35), 0.3, squash=0.3, subdivisions=2)
    verts = list({v for f in pad for v in f.verts})
    bmesh.ops.scale(bm, vec=Vector((1.25, 1, 1)), verts=verts, space=Matrix.Translation((0, -0.14, -1.35)))
    paint(pad, "white", colors)
    for x, y in ((-0.38, -0.2), (-0.14, -0.38), (0.14, -0.38), (0.38, -0.2)):
        paint(kit.blob(bm, (x, y, 1.34), 0.125, squash=0.5, subdivisions=2), "white", colors)
    body = finish("paw_body", bm, colors, gloss, col, top)
    smooth(body)
    band = bmesh.new()
    kit.cylinder(band, (0, 0, 0.74), r - 0.14, 0.3, segments=20, bevel=0.03)
    band_ob = finish("paw_light", band, {}, light, col, top)
    smooth(band_ob)
    return top


def boost_pad(palette, chevrons, light, col):
    """8 x 4 m, flat on the road: a navy frame, the chevron panel and two light bars."""
    top = root("prop_boost_pad", col)
    w, d = PAD
    bm = bmesh.new()
    colors = {}
    paint(kit.bevelled_box(bm, (0, 0, 0.035), (w + 0.3, d + 0.3, 0.07), bevel=0.03, segments=1), "navy", colors)
    finish("boost_frame", bm, colors, palette, col, top)
    panel = bmesh.new()
    uv = panel.loops.layers.uv.new()
    x0, x1, y0, y1 = -(w / 2 - 0.2), w / 2 - 0.2, -(d / 2 - 0.1), d / 2 - 0.1
    verts = [panel.verts.new(p) for p in ((x0, y1, 0.075), (x1, y1, 0.075), (x1, y0, 0.075), (x0, y0, 0.075))]
    f = panel.faces.new(verts)  # counter-clockwise from above
    tiles = 2  # chevrons along the pad, and side by side across it
    for loop in f.loops:
        co = loop.vert.co
        loop[uv].uv = ((co.x - x0) / (x1 - x0) * tiles, (y1 - co.y) / (y1 - y0) * tiles)  # v grows forward (-Y)
    ob = kit.new_object("boost_chevrons", panel, chevrons)
    ob.parent = top
    col.objects.link(ob)
    bars = bmesh.new()
    for side in (-1, 1):
        kit.bevelled_box(bars, (side * (w / 2 - 0.08), 0, 0.08), (0.14, d - 0.3, 0.035), bevel=0.012, segments=1)
    ob = kit.new_object("boost_lights", bars, light)
    ob.parent = top
    col.objects.link(ob)
    return top


def build():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    scene = bpy.context.scene
    scene.name = "Interactables"
    col = bpy.data.collections.new("kit_interactables")
    scene.collection.children.link(col)
    palette = kit.palette_material()
    gloss = lacquered("mat_scoop")
    paw_gloss = lacquered("mat_paw", roughness=0.35, coat=0.5)
    paw_light = glowing("mat_paw_light", "#FFC81E")
    pad_light = glowing("mat_boost_light", "#59D6FF")
    for i, flavour in enumerate(FLAVOURS):
        scoop(flavour, palette, gloss, col, 40 + i)
    paw_bumper(palette, paw_gloss, paw_light, col)
    boost_pad(palette, chevron_material(), pad_light, col)
    OUT.mkdir(parents=True, exist_ok=True)
    bpy.ops.export_scene.gltf(filepath=str(OUT / "kit_interactables.glb"), export_format="GLB", collection=col.name,
                              export_yup=True, export_extras=False, export_animations=False, export_cameras=False,
                              export_lights=False, export_apply=False)
    bpy.ops.wm.save_as_mainfile(filepath=str(OUT / "interactables.blend"), compress=True)
    tri = lambda ob: sum(len(p.vertices) - 2 for p in ob.data.polygons)
    meshes = [o for o in col.objects if o.type == "MESH"]
    print({"triangles": {o.name: tri(o) for o in meshes}, "total": sum(tri(o) for o in meshes), "out": str(OUT)})


build()
