"""Builds the landmarks over the Happy Valley greybox (M3): Beaver Stadium and the Mount Nittany backdrop here, and
Old Main, Pattee Library, the Lion Shrine and the Creamery from tools/models/landmarks_campus.py.

Run it headless with the bpy module from PyPI (pip install bpy): python tools/models/build_landmarks.py
or in Blender (blender -b -P tools/models/build_landmarks.py).

The models sit in map coordinates in their own layer, maps/happy_valley_landmarks.glb, which the game loads over
Ali's map (apps/web/src/game/landmarks.ts). Nothing here is collision, and nothing reaches a road or a rail:
  - Beaver Stadium: a bowl of stands round the field, from 60 m out (the road circles the field at 37-51 m, its
    rails at up to 55 m), with gates where the road comes in from the tunnel and leaves up the ramp. One stand
    segment is built twice (a white-out and a navy section) and instanced round the ring. The scoreboard sits
    on a base that swallows the greybox scoreboard box, with the RACEBALL wordmark (tools/brand) in lights.
    The field gets mowing stripes, yard lines and end zones. The layer replaces the greybox field and the six
    Kenney grandstands, which the game hides by name.
  - Mount Nittany: a long, faceted ridge behind the Arboretum, fall forest and the first snow on the crest.
    The greybox mountain and snowcap boxes are merged into Ali's batches, so the ridge's surface encloses them.
  - Old Main, Pattee Library, the Lion Shrine and the Creamery: see landmarks_campus.py.

Everything is on the dressing kit's palette (one material), except Old Main's brass bell and spike (mat_brass). Writes assets-src/models/happy_valley_landmarks.glb and
landmarks.blend. Optimize into the game with:
  gltf-transform optimize assets-src/models/happy_valley_landmarks.glb \
    apps/web/public/assets/maps/happy_valley_landmarks.glb --compress meshopt --texture-compress webp --simplify false \
    --flatten false
(--flatten false keeps the lm_* root nodes, which apps/web/src/game/landmarks.test.ts looks for)
"""

import importlib.util
import json
import math
import os
import random
from pathlib import Path

import bpy  # first: the bpy module from PyPI only provides bmesh once bpy is loaded
import bmesh
from mathutils import Matrix, Vector

ROOT = Path(globals().get("RACEBALL_ROOT") or os.environ.get("RACEBALL_ROOT") or Path(__file__).resolve().parents[2])
OUT = ROOT / "assets-src" / "models"
WORDMARK = ROOT / "tools" / "brand" / "wordmark_outline.json"

_spec = importlib.util.spec_from_file_location("dressing_kit_lib", ROOT / "tools" / "models" / "build_dressing_kit.py")
kit = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(kit)
kit.PALETTE["lawn_dark"] = "#6E9140"  # mowing stripes; a free swatch after the kit's own colors

_spec = importlib.util.spec_from_file_location("landmarks_campus", ROOT / "tools" / "models" / "landmarks_campus.py")
campus = importlib.util.module_from_spec(_spec)
campus.kit = kit  # its palette and helpers, with the swatches above
_spec.loader.exec_module(campus)

# The greybox, in game meters (tools/track/build_happy_valley.py): the field's center and the stadium road
FIELD = (201.25, 75.9)  # center of prop_stadium_field, 42 x 52 m
FIELD_SIZE = (42.0, 52.0)
SCOREBOARD = (202.4, 5.75)  # center of the greybox scoreboard box, 21 x 12 x 3 m
# Bowl angles, in degrees round the field (0 = +x, east; 90 = +z, south): no stands where the road crosses the ring
GATES = [(86, 116), (-162, -126)]  # the road in from the tunnel, the ramp out to the Arboretum
SCOREBOARD_GAP = (-104, -76)
R_IN, R_OUT = 60.0, 77.0
TIERS, FRONT_H, RISE = 6, 2.2, 2.3
SEG_DEG, ARC_STEPS = 6.0, 6  # 1 degree per crowd block: about a meter at the front row
LIGHT_TOWERS = [35, 145, -35, -118]  # degrees, behind the stands


def G(x, y, z):
    """Game coordinates (y up, z south) to Blender's (z up)."""
    return Vector((x, -z, y))


def paint(bm, colors):
    uv = bm.loops.layers.uv.verify()
    for f, name in colors.items():
        u, v = kit.swatch_uv(name)
        for loop in f.loops:
            loop[uv].uv = (u, v)


def finish(name, bm, mat, collection, parent=None, matrix=None):
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    ob = kit.new_object(name, bm, mat)
    ob.parent = parent
    if matrix is not None:
        ob.matrix_world = matrix
    collection.objects.link(ob)
    return ob


# ------------------------------------------------------------------ Beaver Stadium

def stand_profile():
    """The stand's cross-section from the front foot to the back foot, as (r, y) points and the kind of each edge:
    a navy front wall with a white pad, six tiers of fans (on the seats and up each step), a navy parapet and cap,
    a limestone back."""
    pts, kinds = [(R_IN, 0.0)], []
    pts.append((R_IN, FRONT_H)); kinds.append("front")
    r0 = R_IN + 0.6
    pts.append((r0, FRONT_H)); kinds.append("pad")
    depth = (R_OUT - 1.5 - r0) / TIERS
    for k in range(TIERS):
        y = FRONT_H + k * RISE
        # two rows of seats per tier, so the crowd reads as people, not tiles
        pts.append((r0 + (k + 0.5) * depth, y)); kinds.append("seats")
        pts.append((r0 + (k + 1) * depth, y)); kinds.append("seats")
        if k < TIERS - 1:  # from the track you see the seated fans in front of each step, two rows of them
            pts.append((r0 + (k + 1) * depth, y + RISE / 2)); kinds.append("fans")
            pts.append((r0 + (k + 1) * depth, y + RISE)); kinds.append("fans")
    top = FRONT_H + (TIERS - 1) * RISE + 1.6
    pts.append((R_OUT - 1.5, top)); kinds.append("top")
    pts.append((R_OUT, top)); kinds.append("top")
    pts.append((R_OUT, 0.0)); kinds.append("back")
    return pts, kinds, top


def stand_segment(section, seed):
    """One 6-degree slice of the bowl, in polar coordinates round the origin (Blender angle 0..SEG_DEG).
    section 'white' or 'navy': the crowd's colors, a mosaic per seat block."""
    # mostly the section's color, with the odd fan in something else (weights out of 100)
    crowd = {
        "white": {"white": 46, "paper": 26, "chalk": 16, "navy": 6, "brake": 3, "gas": 2, "flag": 1},
        "navy": {"navy": 50, "pit": 18, "white": 18, "brake": 8, "paper": 4, "flag": 2},
    }[section]
    rng = random.Random(seed)
    pts, kinds, top = stand_profile()
    bm = bmesh.new()
    phi = math.radians(SEG_DEG)
    rings = []
    for a in range(ARC_STEPS + 1):
        t = phi * a / ARC_STEPS
        rings.append([bm.verts.new((r * math.cos(t), r * math.sin(t), y)) for r, y in pts])
    colors = {}
    for a in range(ARC_STEPS):
        for e, kind in enumerate(kinds):
            f = bm.faces.new((rings[a][e], rings[a][e + 1], rings[a + 1][e + 1], rings[a + 1][e]))
            colors[f] = {"front": "navy", "pad": "white", "top": "navy", "back": "limestone"}.get(
                kind) or rng.choices(list(crowd), weights=list(crowd.values()))[0]
    for ring in (rings[0], rings[-1]):  # the ends show at the gates
        colors[bm.faces.new(ring)] = "limestone"
    # a steel rib down the back at the segment's edge, and a strip of navy trim under the cap
    rib = kit.bevelled_box(bm, (R_OUT + 0.45, 0, top / 2), (0.9, 0.9, top), bevel=0.05, segments=1)
    colors.update({f: "navy" for f in rib})
    paint(bm, colors)
    return bm


def light_tower():
    """A chunky navy pole with a bank of lamps on a frame, tilted toward the field (local -X)."""
    bm = bmesh.new()
    colors = {}
    colors.update({f: "limestone" for f in kit.bevelled_box(bm, (0, 0, 0.8), (3.2, 3.2, 1.6), bevel=0.08)})
    colors.update({f: "navy" for f in kit.bevelled_box(bm, (0, 0, 18), (1.3, 1.3, 34), bevel=0.06, segments=1)})
    head = bmesh.new()
    hc = {f: "navy" for f in kit.bevelled_box(head, (0, 0, 0), (0.8, 9, 5.2), bevel=0.08)}
    for i in range(3):
        for j in range(2):
            lamp = kit.bevelled_box(head, (-0.55, -3 + 3 * i, -1.3 + 2.6 * j), (0.4, 2.4, 2.0), bevel=0.06)
            hc.update({f: ("lamp" if f.normal.x < -0.9 else "navy") for f in lamp})
    paint(head, hc)
    bmesh.ops.transform(head, matrix=Matrix.Translation((0, 0, 36)) @ Matrix.Rotation(math.radians(-25), 4, "Y"),
                        verts=head.verts)
    paint(bm, colors)
    me = bpy.data.meshes.new("tmp")
    head.to_mesh(me)
    head.free()
    bm.from_mesh(me)
    bpy.data.meshes.remove(me)
    return bm


def field_mesh():
    """The football field over the greybox lawn: mowing stripes, white yard lines and sidelines, navy end zones."""
    cx, cz = FIELD
    w, d = FIELD_SIZE
    y = 0.27  # just over the greybox field's top (0.25), which the game hides anyway
    bm = bmesh.new()
    colors = {}
    end = 5.0
    stripes = 10
    step = (d - 2 * end) / stripes
    for i in range(stripes):
        z0 = cz - d / 2 + end + i * step
        f = kit.bevelled_box(bm, G(cx, y - 0.05, z0 + step / 2), (w, step, 0.1), bevel=0)
        colors.update({x: ("lawn" if i % 2 else "lawn_dark") for x in f})
    for side in (-1, 1):
        f = kit.bevelled_box(bm, G(cx, y - 0.05, cz + side * (d / 2 - end / 2)), (w, end, 0.1), bevel=0)
        colors.update({x: "navy" for x in f})
    for i in range(stripes + 1):  # yard lines
        z = cz - d / 2 + end + i * step
        colors.update({x: "white" for x in kit.bevelled_box(bm, G(cx, y + 0.01, z), (w - 2, 0.3, 0.02), bevel=0)})
    for side in (-1, 1):  # sidelines
        colors.update({x: "white" for x in kit.bevelled_box(bm, G(cx + side * (w / 2 - 0.6), y + 0.01, cz),
                                                            (0.3, d, 0.02), bevel=0)})
    paint(bm, colors)
    return bm


def wordmark(mat, collection, parent, origin, height, depth):
    """RACE in paper and BALL in gas orange, our own wordmark (tools/brand/wordmark_outline.json), standing up,
    facing the field (+z in game). origin: the baseline's left end, in game coordinates. Returns its width."""
    data = json.loads(WORDMARK.read_text())
    scale = height / data["cap"]
    width = data["width"] * scale
    for part, glyphs, color in (("race", range(0, 4), "paper"), ("ball", range(4, 8), "gas")):
        cu = bpy.data.curves.new(f"wordmark_{part}", "CURVE")
        cu.dimensions = "2D"
        cu.fill_mode = "BOTH"
        cu.extrude = depth / 2
        for g, pts in data["contours"]:
            if g not in glyphs:
                continue
            sp = cu.splines.new("POLY")
            sp.points.add(len(pts) - 1)
            for i, (u, v) in enumerate(pts):
                sp.points[i].co = (u * scale, v * scale, 0, 1)
            sp.use_cyclic_u = True
        ob = bpy.data.objects.new(f"scoreboard_wordmark_{part}", cu)
        collection.objects.link(ob)
        bpy.context.view_layer.objects.active = ob
        for o in bpy.context.view_layer.objects:
            o.select_set(o == ob)
        bpy.ops.object.convert(target="MESH")
        ob = bpy.context.view_layer.objects.active
        bm = bmesh.new()
        bm.from_mesh(ob.data)
        paint(bm, {f: (color if abs(f.normal.z) > 0.9 else "ink") for f in bm.faces})
        bm.to_mesh(ob.data)
        bm.free()
        ob.data.materials.clear()
        ob.data.materials.append(mat)
        # stand it up facing the field: the letters' +Z becomes game +z (Blender -Y)
        ob.matrix_world = Matrix.Translation(G(*origin)) @ Matrix.Rotation(math.radians(90), 4, "X")
        ob.parent = parent
    return width


def scoreboard(mat, collection, parent):
    """On a limestone base that swallows the greybox box: a big ink board in a navy frame, the wordmark in lights,
    and a row of colored bulbs. It faces the field (game +z)."""
    sx, sz = SCOREBOARD
    bm = bmesh.new()
    colors = {}
    base = kit.bevelled_box(bm, G(sx, 6.75, sz + 0.25), (30, 6.5, 13.5), bevel=0.12)  # x 187-217, z 3-9.5, y 0-13.5
    colors.update({f: "limestone" for f in base})
    colors.update({f: "navy" for f in kit.bevelled_box(bm, G(sx, 12.6, sz + 0.25), (30.4, 6.9, 1.2), bevel=0.08)})
    board_y, board_h = 13.5 + 6.6, 13.2
    colors.update({f: "navy" for f in kit.bevelled_box(bm, G(sx, board_y, sz + 0.5), (34, 3.2, board_h), bevel=0.15)})
    colors.update({f: "ink" for f in kit.bevelled_box(bm, G(sx, board_y, sz + 1.95), (31.6, 0.4, board_h - 2.4),
                                                       bevel=0.05)})
    bulbs = ["gas", "brake", "flag", "go", "stop", "paper", "gold", "brake"]
    for i, c in enumerate(bulbs):
        x = sx - 10.5 + 3 * i
        f = kit.cylinder(bm, (0, 0, 0), 0.75, 0.5, segments=12, bevel=0.05)
        bmesh.ops.transform(bm, matrix=Matrix.Translation(G(x, board_y - 4.1, sz + 2.35)) @ Matrix.Rotation(
            math.radians(90), 4, "X"), verts=list({v for face in f for v in face.verts}))
        colors.update({x_: c for x_ in f})
    paint(bm, colors)
    board = finish("scoreboard", bm, mat, collection, parent)
    width = 24.0
    data_w = json.loads(WORDMARK.read_text())["width"]
    height = width / data_w * 0.7
    wordmark(mat, collection, parent, (sx - width / 2, board_y - 1.6, sz + 2.35), height, 0.5)
    return board


def stadium(mat, collection):
    root = bpy.data.objects.new("lm_beaver_stadium", None)
    collection.objects.link(root)
    meshes = {}
    for section in ("white", "navy"):
        bm = stand_segment(section, seed=7 if section == "white" else 11)
        bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
        me = bpy.data.meshes.new(f"stand_segment_{section}")
        bm.to_mesh(me)
        bm.free()
        me.materials.append(mat)
        meshes[section] = me
    blocked = GATES + [SCOREBOARD_GAP]
    count = 0
    a = -180.0
    while a < 180.0 - 1e-6:
        if not any(lo - 1e-6 < a + SEG_DEG and a < hi + 1e-6 for lo, hi in blocked):
            section = "white" if (count // 3) % 2 == 0 else "navy"
            ob = bpy.data.objects.new(f"stand_{count:02d}", meshes[section])  # linked: one mesh, many segments
            # game angle a (from +x toward +z) is Blender angle -a; the slice runs from 0 to SEG_DEG
            ob.matrix_world = Matrix.Translation(G(FIELD[0], 0, FIELD[1])) @ Matrix.Rotation(
                math.radians(-(a + SEG_DEG)), 4, "Z")
            ob.parent = root
            collection.objects.link(ob)
            count += 1
        a += SEG_DEG
    tower = light_tower()
    bmesh.ops.recalc_face_normals(tower, faces=tower.faces)
    tower_me = bpy.data.meshes.new("light_tower")
    tower.to_mesh(tower_me)
    tower.free()
    tower_me.materials.append(mat)
    for i, deg in enumerate(LIGHT_TOWERS):
        r = R_OUT + 8
        x, z = FIELD[0] + r * math.cos(math.radians(deg)), FIELD[1] + r * math.sin(math.radians(deg))
        ob = bpy.data.objects.new(f"light_tower_{i}", tower_me)
        # local -X faces the field: game angle deg is Blender angle -deg, and the field lies the other way from it
        ob.matrix_world = Matrix.Translation(G(x, 0, z)) @ Matrix.Rotation(math.radians(-deg), 4, "Z")
        ob.parent = root
        collection.objects.link(ob)
    finish("stadium_field", field_mesh(), mat, collection, root)
    scoreboard(mat, collection, root)
    return count


# ------------------------------------------------------------------ Mount Nittany

def nittany(mat, collection):
    """A long ridge with a hump at its east end, faceted: pine forest with maple and gold patches (a late fall
    afternoon), snow along the crest. Its surface encloses the greybox mountain (x 128-194, z -111.5..-95.5,
    up to 24 m) and snowcap (up to 31 m), which can't be hidden: they're merged into Ali's batches."""
    # as compact as the greybox allows: the big screen's overview camera looks across it from the south
    x0, x1 = 108.0, 222.0
    z_front, z_crest, z_back = -72.0, -103.0, -140.0
    nx, nz = 30, 14
    rng = random.Random(3)

    def smooth(t):
        t = max(0.0, min(1.0, t))
        return t * t * (3 - 2 * t)

    def crest(x):
        taper = min(smooth((x - x0) / 22), smooth((x1 - x) / 24))
        return (46 + 6 * math.exp(-((x - 196) / 12) ** 2) + 2 * math.sin(x / 9.0)) * taper

    zs = [z_front + (z_crest - z_front) * (i / 7) for i in range(8)] + \
         [z_crest + (z_back - z_crest) * (i / (nz - 7)) for i in range(1, nz - 6)]
    grid = []
    for i in range(nx + 1):
        x = x0 + (x1 - x0) * i / nx
        row = []
        for z in zs:
            t = (z - z_front) / (z_crest - z_front) if z >= z_crest else 1 - (z - z_crest) / (z_back - z_crest)
            h = crest(x) * smooth(t) - 3
            if 0 < i < nx and z_back < z < z_front:
                h += rng.uniform(-1.6, 1.6)  # facets catch the low sun differently
            row.append(G(x, h, z))
        grid.append(row)
    bm = bmesh.new()
    verts = [[bm.verts.new(p) for p in row] for row in grid]
    colors = {}

    def forest(x, z):
        """Fall color in organic blotches: a smooth field of a few sines at odd angles, not a grid."""
        n = (math.sin(x / 11.3 + z / 17.1) + math.sin(x / 7.1 - z / 9.7 + 1.3) * 0.7
             + math.sin(-x / 19.7 + z / 5.9 + 2.1) * 0.5)
        if n > 1.25:
            return "maple"
        if n > 0.95:
            return "gold"
        if n < -1.35:
            return "maple_dark"
        return "pine_dark" if math.sin(x / 5.3 + z / 4.1) > 0.45 else "pine"

    for i in range(nx):
        for j in range(len(zs) - 1):
            quad = (verts[i][j], verts[i + 1][j], verts[i + 1][j + 1], verts[i][j + 1])
            for tri in ((quad[0], quad[1], quad[2]), (quad[0], quad[2], quad[3])):
                f = bm.faces.new(tri)
                height = sum(v.co.z for v in tri) / 3
                top = crest(sum(v.co.x for v in tri) / 3)
                if height > 33 or (top > 24 and height > top - 7):  # snow on the crest, not on the low ends
                    colors[f] = "snow"
                else:
                    cx = sum(v.co.x for v in tri) / 3
                    cz = -sum(v.co.y for v in tri) / 3
                    colors[f] = forest(cx, cz) if height > 2 else "pine_dark"
    paint(bm, colors)
    root = bpy.data.objects.new("lm_mount_nittany", None)
    collection.objects.link(root)
    finish("mount_nittany", bm, mat, collection, root)
    # the greybox must stay inside: the ridge's lowest point (worst-case facet) over each box's footprint, with margin
    def lowest(xa, xb):
        return min(crest(x) * smooth((z - z_front) / (z_crest - z_front) if z >= z_crest
                                     else 1 - (z - z_crest) / (z_back - z_crest)) - 3 - 1.6
                   for x in range(xa, xb + 1) for z in (-95.5, -99.5, -103.5, -107.5, -111.5))
    clearance = {"mountain box (24 m)": lowest(128, 194) - 24, "snowcap (31 m)": lowest(140, 182) - 31}
    assert all(c > 0.5 for c in clearance.values()), f"the greybox pokes through Mount Nittany: {clearance}"
    return {k: round(v, 1) for k, v in clearance.items()}


def build():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    scene = bpy.context.scene
    scene.name = "Landmarks"
    mat = kit.palette_material()
    col = bpy.data.collections.new("landmarks")
    scene.collection.children.link(col)
    segments = stadium(mat, col)
    clearance = nittany(mat, col)
    campus_triangles = campus.build_campus(mat, col)
    OUT.mkdir(parents=True, exist_ok=True)
    bpy.ops.export_scene.gltf(filepath=str(OUT / "happy_valley_landmarks.glb"), export_format="GLB",
                              collection=col.name, export_yup=True, export_extras=False, export_animations=False,
                              export_cameras=False, export_lights=False, export_apply=True)
    bpy.ops.wm.save_as_mainfile(filepath=str(OUT / "landmarks.blend"), compress=True)
    tri = lambda me: sum(len(p.vertices) - 2 for p in me.polygons)
    drawn = sum(tri(o.data) for o in col.objects if o.type == "MESH")
    print({"stand_segments": segments, "triangles_drawn": drawn,
           "unique_meshes": {me.name: tri(me) for me in bpy.data.meshes if me.users},
           "nittany_clearance_over_greybox_m": clearance, "campus_triangles": campus_triangles, "out": str(OUT)})


build()
