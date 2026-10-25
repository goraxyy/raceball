"""Builds the track dressing kit and the first road piece in Blender (M1, M0 pipeline).

Run it in Blender (Scripting tab, or the MCP execute tool with RACEBALL_ROOT set),
or headless: blender -b -P tools/models/build_dressing_kit.py
(or plain python with the bpy module from PyPI).

Every prop shares ONE material (mat_palette) on ONE 256x256 palette texture of the
art bible colors, so hundreds of props cost a handful of draw calls:
- Kenney (CC0): barriers, the pine and cone trees, and the start/finish arch frame.
  Taken from assets-src/packs when the kits are there, otherwise cut out of the
  greybox map (apps/web/public/assets/maps/happy_valley.glb), which holds them
- modeled here: lollipop trees, lamp posts, the arch's checkered banner, and the
  road piece trk_road_straight

Writes assets-src/models/dressing_kit.blend, assets-src/textures/palette.png and the
raw GLBs in assets-src/models/. Optimize them into the game with:
  gltf-transform optimize assets-src/models/kit_dressing.glb \
    apps/web/public/assets/models/kit_dressing.glb \
    --compress meshopt --texture-compress webp --simplify false --join false --instance false --flatten false
"""

import math
import os
from pathlib import Path

import bpy  # first: the bpy module from PyPI only provides bmesh once bpy is loaded
import bmesh
import numpy as np
from mathutils import Matrix, Vector
from mathutils.bvhtree import BVHTree

ROOT = Path(globals().get("RACEBALL_ROOT") or os.environ.get("RACEBALL_ROOT") or Path(__file__).resolve().parents[2])
OUT = ROOT / "assets-src" / "models"
PACKS = ROOT / "assets-src" / "packs"
GREYBOX = ROOT / "apps" / "web" / "public" / "assets" / "maps" / "happy_valley.glb"

# The palette: an 8x8 grid of 32 px swatches, plus a checkered strip in the last two rows
SWATCH, GRID = 32, 8
PALETTE = {
    # environment palette (docs/ASSETS.md)
    "brick": "#A8452F", "maple": "#E8742B", "gold": "#F2B33D", "pine": "#2F5D3A",
    "limestone": "#D9CBB0", "navy": "#1E2F5C", "lawn": "#7FA34A", "asphalt": "#3A3944",
    "sky": "#9CCBE6", "snow": "#F4F6F8", "ice": "#BFE3F2", "vanilla": "#F7E6C4",
    # livery palette
    "ink": "#17151F", "paper": "#F3EAD9", "gas": "#F5702A", "brake": "#7CC3E8",
    "flag": "#FFC81E", "go": "#1F9E57", "stop": "#D7263D", "pit": "#1C1B24",
    # supporting colors for props
    "bark": "#6B4429", "chocolate": "#5B3A29", "lamp": "#FFE6A8", "white": "#FFFFFF",
    "chalk": "#E9ECEA", "maple_dark": "#C85A1E", "gold_dark": "#D9962A", "pine_dark": "#244A2E",
    # added for the world (tools/models/build_world.py): the Creamery's kerbs
    "strawberry": "#EE8FAE",
}
CHECKER_ROWS = 2  # the bottom two rows of the grid hold a black and white checkerboard


def srgb(hex_color):
    return [int(hex_color[i:i + 2], 16) / 255 for i in (1, 3, 5)]


def swatch_uv(name):
    """UV of the center of a swatch. Row 0 is the top of the image."""
    i = list(PALETTE).index(name)
    col, row = i % GRID, i // GRID
    return ((col + 0.5) / GRID, 1 - (row + 0.5) / GRID)




def palette_pixels():
    size = SWATCH * GRID
    img = np.ones((size, size, 4))
    for i, color in enumerate(PALETTE.values()):
        col, row = i % GRID, i // GRID
        y0 = size - (row + 1) * SWATCH  # Blender pixel rows start at the bottom
        img[y0:y0 + SWATCH, col * SWATCH:(col + 1) * SWATCH, :3] = srgb(color)
    for y in range(CHECKER_ROWS * SWATCH):
        for x in range(size):
            img[y, x, :3] = srgb(PALETTE["ink"] if (x // CHECK_PX + y // CHECK_PX) % 2 else PALETTE["white"])
    return img


def palette_material():
    mat = bpy.data.materials.get("mat_palette") or bpy.data.materials.new("mat_palette")
    mat.use_nodes = True
    mat.use_backface_culling = True
    shader = mat.node_tree.nodes.get("Principled BSDF")
    shader.inputs["Roughness"].default_value = 0.7
    shader.inputs["Metallic"].default_value = 0
    size = SWATCH * GRID
    image = bpy.data.images.get("tex_palette") or bpy.data.images.new("tex_palette", size, size, alpha=False)
    image.pixels.foreach_set(palette_pixels().astype(np.float32).ravel())
    image.filepath_raw = str(ROOT / "assets-src" / "textures" / "palette.png")
    image.file_format = "PNG"
    image.save()
    image.pack()
    tex = mat.node_tree.nodes.get("Image Texture") or mat.node_tree.nodes.new("ShaderNodeTexImage")
    tex.image = image
    tex.interpolation = "Closest"
    mat.node_tree.links.new(tex.outputs["Color"], shader.inputs["Base Color"])
    return mat


# ------------------------------------------------------------------ mesh helpers

def paint(bm, color_of):
    """Points every face's UVs at one swatch: color_of(face) returns a palette name."""
    uv = bm.loops.layers.uv.verify()
    for f in bm.faces:
        u, v = swatch_uv(color_of(f))
        for loop in f.loops:
            loop[uv].uv = (u, v)


CHECK_PX = 16  # one checker cell; the strip is 16 cells wide and 4 tall


def checker(bm, faces, axis_u=0, axis_v=2, cells_u=14, cells_v=2):
    """Maps faces onto cells_u x cells_v cells of the checkerboard by planar projection (axes index x, y, z).
    Starts one cell in from the strip's corner, so mipmaps never blend in the swatches across the edge."""
    uv = bm.loops.layers.uv.verify()
    pts = [v.co for f in faces for v in f.verts]
    lo = [min(p[a] for p in pts) for a in (axis_u, axis_v)]
    hi = [max(p[a] for p in pts) for a in (axis_u, axis_v)]
    size = SWATCH * GRID
    for f in faces:
        for loop in f.loops:
            p = loop.vert.co
            s = (p[axis_u] - lo[0]) / max(hi[0] - lo[0], 1e-6)
            t = (p[axis_v] - lo[1]) / max(hi[1] - lo[1], 1e-6)
            loop[uv].uv = ((1 + s * cells_u) * CHECK_PX / size, (1 + t * cells_v) * CHECK_PX / size)


def new_object(name, bm, mat):
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    me.materials.append(mat)
    for poly in me.polygons:
        poly.use_smooth = False
    ob = bpy.data.objects.new(name, me)
    return ob


def bevelled_box(bm, center, size, bevel=0.03, segments=2):
    """Adds a box with rounded edges (the art bible's 2-3 cm toy bevel) and returns its faces."""
    before = set(bm.faces)
    geom = bmesh.ops.create_cube(bm, size=1.0)["verts"]
    bmesh.ops.scale(bm, vec=Vector(size), verts=geom)
    bmesh.ops.translate(bm, vec=Vector(center), verts=geom)
    if bevel:
        edges = list({e for v in geom for e in v.link_edges})
        bmesh.ops.bevel(bm, geom=edges, offset=bevel, segments=segments, affect="EDGES", profile=0.5)
    return [f for f in bm.faces if f not in before]


def cylinder(bm, center, radius, depth, segments=10, bevel=0.02):
    before = set(bm.faces)
    geom = bmesh.ops.create_cone(bm, cap_ends=True, segments=segments, radius1=radius, radius2=radius, depth=depth)["verts"]
    bmesh.ops.translate(bm, vec=Vector(center), verts=geom)
    caps = [e for v in geom for e in v.link_edges if all(abs(abs(w.co.z - center[2]) - depth / 2) < 1e-4 for w in e.verts)]
    if bevel:
        bmesh.ops.bevel(bm, geom=list(set(caps)), offset=bevel, segments=2, affect="EDGES", profile=0.5)
    return [f for f in bm.faces if f not in before]


def blob(bm, center, radius, squash=0.85, subdivisions=2):
    """A chunky low-poly ball for tree crowns."""
    before = set(bm.faces)
    geom = bmesh.ops.create_icosphere(bm, subdivisions=subdivisions, radius=radius)["verts"]
    bmesh.ops.scale(bm, vec=Vector((1, 1, squash)), verts=geom)
    bmesh.ops.translate(bm, vec=Vector(center), verts=geom)
    return [f for f in bm.faces if f not in before]


# ------------------------------------------------------------------ Kenney pieces

KENNEY = {  # name: (file in assets-src/packs, mesh name in the greybox, instance scale there; the arch has one copy)
    "tree": ("kenney-marble-kit/Models/GLB format/tree-large.glb", "tree-large", (3, 3, 3.5)),
    "arch": ("kenney-racing-kit/Models/GLTF format/overhead.glb", "overhead", (12, 12, 12)),
    "barrier": ("kenney-racing-kit/Models/GLTF format/barrierRed.glb", "noExport", (7, 7, 7)),
}


def import_glb(path):
    before = set(bpy.data.objects)
    bpy.ops.import_scene.gltf(filepath=str(path))
    return [o for o in bpy.data.objects if o not in before]


def kenney_piece(key, greybox_objects):
    """A Kenney piece at its native size, base center at the origin, as a BMesh in Blender Z-up."""
    pack_file, mesh_name, scale = KENNEY[key]
    bm = bmesh.new()
    if (PACKS / pack_file).exists():
        objects = import_glb(PACKS / pack_file)
        for o in objects:
            if o.type == "MESH":
                part = o.data.copy()
                part.transform(o.matrix_world)
                bm.from_mesh(part)
                bpy.data.meshes.remove(part)
        for o in objects:
            bpy.data.objects.remove(o)
        scale = (1, 1, 1)
    else:  # cut one copy out of the greybox; every copy there is unrotated and at least 10 m from the next
        o = next(o for o in greybox_objects if o.type == "MESH" and mesh_name in o.data.name)
        bm.from_mesh(o.data)
        bm.transform(o.matrix_world)
        if key != "arch":
            seed = min(bm.faces, key=lambda f: (f.calc_center_median().y, f.calc_center_median().x)).calc_center_median()
            far = [f for f in bm.faces if (f.calc_center_median().xy - seed.xy).length > 4.0]
            bmesh.ops.delete(bm, geom=far, context="FACES")
    for layer in list(bm.loops.layers.uv):
        bm.loops.layers.uv.remove(layer)
    bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=1e-5)
    lo = Vector([min(v.co[i] for v in bm.verts) for i in range(3)])
    hi = Vector([max(v.co[i] for v in bm.verts) for i in range(3)])
    base = Vector(((lo.x + hi.x) / 2, (lo.y + hi.y) / 2, lo.z))
    for v in bm.verts:
        v.co = Vector([(v.co[i] - base[i]) / scale[i] for i in range(3)])
    return bm


def scaled(bm, factor):
    bmesh.ops.scale(bm, vec=Vector((factor,) * 3) if isinstance(factor, (int, float)) else Vector(factor), verts=bm.verts)
    return bm


# ------------------------------------------------------------------ props

def barrier(kit_bm, color):
    """Kenney barrierRed, 2 m long, in one livery color. Alternate red and white along the track."""
    bm = scaled(kit_bm.copy(), 8)
    paint(bm, lambda f: color)
    return bm


def kenney_tree(kit_bm, crown, shade):
    """Kenney tree-large, 6.5 m tall: a bark trunk under stacked cones, the undersides a shade darker."""
    bm = scaled(kit_bm.copy(), (3.2, 3.2, 3.4))
    top = max(v.co.z for v in bm.verts)
    def color(f):
        c = f.calc_center_median()
        if c.z < 0.12 * top and c.xy.length < 0.9:
            return "bark"
        return shade if f.normal.z < -0.2 else crown
    paint(bm, color)
    return bm


def lollipop_tree(crown, shade, height=5.2, lean=0.08):
    """A chunky round tree: a bark trunk and one squashed ball, leaning a little."""
    bm = bmesh.new()
    cylinder(bm, (0, 0, height * 0.3), 0.28, height * 0.6, segments=8, bevel=0.03)
    r = height * 0.36
    blob(bm, (0, 0, height - r * 0.8), r)
    bmesh.ops.transform(bm, matrix=Matrix.Rotation(lean, 4, "X"), verts=bm.verts, space=Matrix.Identity(4))
    lowest = min(v.co.z for v in bm.verts)  # keep the base on the ground after leaning
    for v in bm.verts:
        v.co.z -= lowest
    paint(bm, lambda f: "bark" if f.calc_center_median().z < height * 0.45 and f.calc_center_median().xy.length < 0.5
          else (shade if f.normal.z < -0.3 else crown))
    return bm


def lamp_post(double):
    """A chunky navy lamp post, 5 m tall: one lamp, or two on a crossbar."""
    bm = bmesh.new()
    cylinder(bm, (0, 0, 0.18), 0.4, 0.36, segments=10)  # base
    cylinder(bm, (0, 0, 2.55), 0.19, 4.5, segments=8, bevel=0.0)  # pole: chunky, never thin
    if double:
        bevelled_box(bm, (0, 0, 4.85), (1.9, 0.28, 0.26))  # crossbar
        heads = [(-0.85, 0, 4.55), (0.85, 0, 4.55)]
    else:
        bevelled_box(bm, (0.45, 0, 4.85), (1.0, 0.28, 0.26))  # arm
        heads = [(0.85, 0, 4.55)]
    for x, y, z in heads:
        bevelled_box(bm, (x, y, z + 0.06), (0.62, 0.62, 0.22), bevel=0.05)  # hood
        bevelled_box(bm, (x, y, z - 0.18), (0.42, 0.42, 0.3), bevel=0.04)  # glass
    def color(f):
        c = f.calc_center_median()
        if c.z > 4.15 and c.z < 4.5 and abs(c.x) > 0.5:
            return "lamp"
        return "navy"
    paint(bm, color)
    return bm


def finish_arch(kit_bm):
    """Kenney overhead, 16 m wide and 8.5 m tall, navy, with a checkered banner under the top beam."""
    width = 16.0
    sx = width / (max(v.co.x for v in kit_bm.verts) - min(v.co.x for v in kit_bm.verts))
    bm = scaled(kit_bm.copy(), sx)
    paint(bm, lambda f: "navy")
    clearance = BVHTree.FromBMesh(bm).ray_cast(Vector((0, 0, 0.1)), Vector((0, 0, 1)))[0].z  # underside of the top beam
    inner = 0.82 * width / 2
    banner = bevelled_box(bm, (0, 0, clearance - 0.8), (2 * inner, 0.35, 1.5), bevel=0.04)  # hangs just below the beam
    trim = bevelled_box(bm, (0, 0, clearance - 1.62), (2 * inner, 0.42, 0.22), bevel=0.04)
    uv = bm.loops.layers.uv.verify()
    for f in trim:
        for loop in f.loops:
            loop[uv].uv = swatch_uv("flag")
    fronts = [f for f in banner if abs(f.normal.y) > 0.9]
    rest = [f for f in banner if f not in fronts]
    for f in rest:
        for loop in f.loops:
            loop[uv].uv = swatch_uv("ink")
    checker(bm, fronts, axis_u=0, axis_v=2, cells_u=14, cells_v=2)
    return bm


def road_straight(length=10.0, width=12.0):
    """The road as a kit piece: asphalt, chalk edge lines, red and white curbs. Origin at the base center of its start."""
    bm = bmesh.new()
    slab = bevelled_box(bm, (0, -length / 2, -0.15), (width, length, 0.3), bevel=0.04, segments=1)
    paint_faces = {f: "asphalt" for f in slab}
    lines = []
    for side in (-1, 1):
        lines += bevelled_box(bm, (side * (width / 2 - 0.9), -length / 2, 0.01), (0.3, length - 0.02, 0.03), bevel=0)
    for f in lines:
        paint_faces[f] = "chalk"
    blocks = 10
    for side in (-1, 1):
        for i in range(blocks):
            faces = bevelled_box(bm, (side * (width / 2 + 0.45), -(i + 0.5) * length / blocks, 0.06),
                                 (0.9, length / blocks - 0.02, 0.42), bevel=0.04, segments=1)
            for f in faces:
                paint_faces[f] = "stop" if i % 2 == 0 else "white"
    paint(bm, lambda f: paint_faces[f])
    return bm


# ------------------------------------------------------------------ build

def build():
    """Builds the kit and the road piece, and writes the .blend and the raw GLBs."""

    bpy.ops.wm.read_factory_settings(use_empty=True)
    greybox = [] if all((PACKS / v[0]).exists() for v in KENNEY.values()) else import_glb(GREYBOX)
    pieces = {key: kenney_piece(key, greybox) for key in KENNEY}
    for o in greybox:
        bpy.data.objects.remove(o)
    for mesh in list(bpy.data.meshes):
        if mesh.users == 0:
            bpy.data.meshes.remove(mesh)

    scene = bpy.context.scene
    scene.name = "Dressing kit"
    mat = palette_material()
    kit = bpy.data.collections.new("kit_dressing")
    road = bpy.data.collections.new("trk_road_straight")
    for col in (kit, road):
        scene.collection.children.link(col)

    PROPS = {
        "prop_barrier_red": barrier(pieces["barrier"], "stop"),
        "prop_barrier_white": barrier(pieces["barrier"], "paper"),
        "prop_tree_pine": kenney_tree(pieces["tree"], "pine", "pine_dark"),
        "prop_tree_maple": kenney_tree(pieces["tree"], "maple", "maple_dark"),
        "prop_tree_round_gold": lollipop_tree("gold", "gold_dark", height=5.6, lean=0.07),
        "prop_tree_round_maple": lollipop_tree("maple", "maple_dark", height=4.8, lean=-0.1),
        "prop_lamp_single": lamp_post(False),
        "prop_lamp_double": lamp_post(True),
        "prop_finish_arch": finish_arch(pieces["arch"]),
    }
    stats = {}
    for i, (name, bm) in enumerate(PROPS.items()):
        stats[name] = len(bm.faces)
        ob = new_object(name, bm, mat)
        kit.objects.link(ob)
    road_ob = new_object("trk_road_straight", road_straight(), mat)
    road.objects.link(road_ob)

    OUT.mkdir(parents=True, exist_ok=True)
    for col, file in ((kit, "kit_dressing.glb"), (road, "trk_road_straight.glb")):
        bpy.ops.export_scene.gltf(filepath=str(OUT / file), export_format="GLB", collection=col.name, export_yup=True,
                                  export_extras=True, export_animations=False, export_cameras=False, export_lights=False,
                                  export_apply=True)
    bpy.ops.wm.save_as_mainfile(filepath=str(OUT / "dressing_kit.blend"), compress=True)
    tri = lambda ob: sum(len(p.vertices) - 2 for p in ob.data.polygons)
    print({"triangles": {o.name: tri(o) for o in kit.objects} | {"trk_road_straight": tri(road_ob)}, "out": str(OUT)})


# tools/models/build_animated_props.py imports this file for its palette and helpers, without building the kit
if __name__ != "dressing_kit_lib":
    build()
