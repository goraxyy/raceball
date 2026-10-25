"""Builds the animated props in Blender (M3): the item box, two flags, the finish arch and three crowd cards.

Run it headless with the bpy module from PyPI (pip install bpy): python tools/models/build_animated_props.py
or in Blender (blender -b -P tools/models/build_animated_props.py).

Everything is on the dressing kit's palette (one material, mat_palette, from build_dressing_kit.py), so the
props cost almost nothing to draw. Each prop's root node never moves: whatever animates sits below it, so the
game can place a prop by its root and play its animations without the two fighting.

Animations, all made to loop (play them by name, e.g. scene.getAnimationGroupByName("anim_itembox_spin")):
  anim_itembox_spin, anim_itembox_bob        the item box turns and floats
  anim_flag_checker_wave, anim_flag_bluewhite_wave
                                             a traveling wave through the cloth (morph targets)
  anim_arch_banner, anim_arch_flags          the finish arch's banner swings; its two flags wave
  anim_crowd_cheer_a, _b, _c                 2-frame crowd cards: arms down, arms up, each to its own beat

Writes assets-src/models/kit_animated.glb and animated_props.blend. Optimize into the game with:
  gltf-transform optimize assets-src/models/kit_animated.glb apps/web/public/assets/models/kit_animated.glb \
    --compress meshopt --texture-compress webp --simplify false --join false --instance false --flatten false
"""

import importlib.util
import math
import os
from pathlib import Path

import bpy  # first: the bpy module from PyPI only provides bmesh once bpy is loaded
import bmesh
from mathutils import Matrix, Vector

ROOT = Path(globals().get("RACEBALL_ROOT") or os.environ.get("RACEBALL_ROOT") or Path(__file__).resolve().parents[2])
OUT = ROOT / "assets-src" / "models"

# the dressing kit's palette and helpers, without building the kit
_spec = importlib.util.spec_from_file_location("dressing_kit_lib", ROOT / "tools" / "models" / "build_dressing_kit.py")
kit = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(kit)

FPS = 30


# ------------------------------------------------------------------ geometry helpers

def outline_circle(cx, cz, r, n=20):
    return [(cx + r * math.cos(2 * math.pi * i / n), cz + r * math.sin(2 * math.pi * i / n)) for i in range(n)]


def outline_rect(x0, z0, x1, z1, r=0.0, n=4):
    """A rectangle in the x-z plane, with rounded corners of radius r."""
    if r <= 0:
        return [(x0, z0), (x1, z0), (x1, z1), (x0, z1)]
    pts = []
    for cx, cz, a0 in ((x1 - r, z0 + r, -90), (x1 - r, z1 - r, 0), (x0 + r, z1 - r, 90), (x0 + r, z0 + r, 180)):
        for i in range(n + 1):
            a = math.radians(a0 + 90 * i / n)
            pts.append((cx + r * math.cos(a), cz + r * math.sin(a)))
    return pts


def sparkle(cx, cz, r, n=32):
    """The four-point 'ting' star, the same shape as the sparkle particles."""
    pts = []
    for i in range(n):
        a = 2 * math.pi * i / n
        c, s = math.cos(a), math.sin(a)
        k = r / (abs(c) ** 0.5 + abs(s) ** 0.5) ** 2
        pts.append((cx + k * c, cz + k * s))
    return pts


def slab(bm, outline, y0, y1, color, side_color=None, frame=None):
    """Extrudes an x-z outline between y0 and y1 (a cardboard cutout, a raised emblem). Returns its vertices.
    frame: a 4x4 matrix placing the slab, e.g. onto a crate's side."""
    m = frame or Matrix.Identity(4)
    front = [bm.verts.new(m @ Vector((x, y0, z))) for x, z in outline]
    back = [bm.verts.new(m @ Vector((x, y1, z))) for x, z in outline]
    faces = {bm.faces.new(front): color, bm.faces.new(list(reversed(back))): color}
    for i in range(len(outline)):
        j = (i + 1) % len(outline)
        faces[bm.faces.new((front[j], front[i], back[i], back[j]))] = side_color or color
    return front + back, faces  # mesh_object() turns every normal outward


def paint_faces(bm, colors):
    uv = bm.loops.layers.uv.verify()
    for f, name in colors.items():
        u, v = kit.swatch_uv(name)
        for loop in f.loops:
            loop[uv].uv = (u, v)


def mesh_object(name, bm, mat, parent=None):
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    ob = kit.new_object(name, bm, mat)
    ob.parent = parent
    return ob


def empty(name, parent=None, location=(0, 0, 0)):
    ob = bpy.data.objects.new(name, None)
    ob.empty_display_size = 0.3
    ob.parent = parent
    ob.location = location
    return ob


# ------------------------------------------------------------------ animation helpers

def keyframes(owner, path, values, interpolation="LINEAR", index=-1, setter=None):
    """values: (frame, value) pairs. New keys take the given interpolation (LINEAR, BEZIER or CONSTANT)."""
    prefs = bpy.context.preferences.edit
    before = prefs.keyframe_new_interpolation_type
    prefs.keyframe_new_interpolation_type = interpolation
    for frame, value in values:
        setter(value) if setter else setattr(owner, path, value)
        owner.keyframe_insert(data_path=path, frame=frame, index=index)
    prefs.keyframe_new_interpolation_type = before


def name_action(datablock, name):
    datablock.animation_data.action.name = name


def wave_cloth(bm, verts_x, length, amplitude, wavelength):
    """Shape-key displacements for a traveling wave: offset = a(x)·sin(kx + t) = a(x)·[cos t·sin(kx) + sin t·cos(kx)],
    so two keys (sin, cos) driven by cos t and sin t give a smooth, seamless wave. Returns {vert index: (sin, cos)}."""
    k = 2 * math.pi / wavelength
    out = {}
    for v, x in verts_x.items():
        a = amplitude * (max(0.0, x) / length) ** 1.3  # still at the pole, free at the end
        out[v] = (a * math.sin(k * x), a * math.cos(k * x))
    return out


def add_wave_keys(ob, offsets, axis=1):
    """Adds the 'wave_sin' and 'wave_cos' shape keys from wave_cloth() offsets along one axis."""
    ob.shape_key_add(name="Basis")
    keys = []
    for which in (0, 1):
        key = ob.shape_key_add(name=("wave_sin", "wave_cos")[which])
        key.slider_min = -1
        for i, pair in offsets.items():
            key.data[i].co[axis] += pair[which]
        keys.append(key)
    return keys


def animate_wave(ob, keys, frames, action):
    """Drives the two wave keys with cos t and sin t over one cycle of `frames`."""
    steps = 16
    for which, key in enumerate(keys):
        values = []
        for i in range(steps + 1):
            t = 2 * math.pi * i / steps
            values.append((i * frames / steps, math.cos(t) if which == 0 else math.sin(t)))
        keyframes(key, "value", values)
    name_action(ob.data.shape_keys, action)


# ------------------------------------------------------------------ the props

def item_box(mat, col):
    """1.1 m, the size of the item sensor: a flag-yellow crate whose bevels are inked, like an outlined toy,
    with a raised white sparkle on every side and the top. Floats, turns, and sparkles."""
    root = empty("prop_item_box")
    bob = empty("itembox_bob", root, (0, 0, 0.75))
    bm = bmesh.new()
    s = 1.1
    faces = kit.bevelled_box(bm, (0, 0, 0), (s, s, s), bevel=0.09, segments=2)
    colors = {f: ("flag" if max(abs(c) for c in f.normal) > 0.98 else "ink") for f in faces}
    for frame in (Matrix.Rotation(a, 4, "Z") for a in (0, math.pi / 2, math.pi, -math.pi / 2)):
        place = frame @ Matrix.Translation((0, -s / 2, 0))
        _, f = slab(bm, sparkle(0, 0, 0.36), -0.05, 0.0, "paper", "ink", place)
        colors.update(f)
    top = Matrix.Translation((0, 0, s / 2)) @ Matrix.Rotation(-math.pi / 2, 4, "X")  # slab y -> up
    _, f = slab(bm, sparkle(0, 0, 0.36), -0.05, 0.0, "paper", "ink", top)
    colors.update(f)
    paint_faces(bm, colors)
    spin = mesh_object("itembox_spin", bm, mat, bob)
    for ob in (root, bob, spin):
        col.objects.link(ob)
    keyframes(spin, "rotation_euler", [(0, 0), (72, 2 * math.pi)], index=2,
              setter=lambda v: setattr(spin.rotation_euler, "z", v))
    name_action(spin, "anim_itembox_spin")
    keyframes(bob, "location", [(0, 0.75), (24, 0.97), (48, 0.75)], "BEZIER", index=2,
              setter=lambda v: setattr(bob.location, "z", v))
    name_action(bob, "anim_itembox_bob")
    return root


def flag(mat, col, name, cloth, action, at=(0, 0, 0), pole_height=3.2, size=(1.4, 0.9)):
    """A navy pole with a gold finial, and a cloth that waves. cloth: 'checker' or 'bluewhite'."""
    root = empty(name, location=at)
    bm = bmesh.new()
    colors = {f: "navy" for f in kit.cylinder(bm, (0, 0, pole_height / 2), 0.06, pole_height, segments=8, bevel=0.0)}
    colors.update({f: "gold" for f in kit.blob(bm, (0, 0, pole_height + 0.08), 0.11, squash=1, subdivisions=1)})
    colors.update({f: "navy" for f in kit.cylinder(bm, (0, 0, 0.06), 0.28, 0.12, segments=10, bevel=0.02)})
    paint_faces(bm, colors)
    pole = mesh_object(f"{name}_pole", bm, mat, root)
    cloth_ob, offsets = cloth_mesh(mat, f"{name}_cloth", cloth, size, z_top=pole_height - 0.05, parent=root)
    for ob in (root, pole, cloth_ob):
        col.objects.link(ob)
    keys = add_wave_keys(cloth_ob, offsets)
    animate_wave(cloth_ob, keys, 36, action)
    return root


def cloth_mesh(mat, name, look, size, z_top, parent=None, x0=0.06, cols=14, rows=4, thick=0.03):
    """A thin cloth slab hanging off a pole along +X, subdivided so it can wave. Returns it and its wave offsets."""
    w, h = size
    bm = bmesh.new()
    grid = {}
    for side, y in ((0, -thick / 2), (1, thick / 2)):
        for i in range(cols + 1):
            for j in range(rows + 1):
                grid[side, i, j] = bm.verts.new((x0 + w * i / cols, y, z_top - h + h * j / rows))
    faces = []
    for i in range(cols):
        for j in range(rows):
            a, b, c, d = (grid[0, i, j], grid[0, i + 1, j], grid[0, i + 1, j + 1], grid[0, i, j + 1])
            faces.append(bm.faces.new((a, b, c, d)))
            a, b, c, d = (grid[1, i, j], grid[1, i, j + 1], grid[1, i + 1, j + 1], grid[1, i + 1, j])
            faces.append(bm.faces.new((a, b, c, d)))
    rim = []  # the cloth's edges, so it has thickness from the side
    for i in range(cols):
        for j in (0, rows):
            rim.append(bm.faces.new((grid[0, i, j], grid[1, i, j], grid[1, i + 1, j], grid[0, i + 1, j])))
    for j in range(rows):
        for i in (0, cols):
            rim.append(bm.faces.new((grid[0, i, j], grid[0, i, j + 1], grid[1, i, j + 1], grid[1, i, j])))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    if look == "checker":
        kit.checker(bm, faces, axis_u=0, axis_v=2, cells_u=4, cells_v=2)
        paint_faces(bm, {f: "ink" for f in rim})
    else:  # Blue & White: navy over white
        mid = z_top - h / 2
        paint_faces(bm, {f: ("navy" if f.calc_center_median().z > mid else "white") for f in faces} | {f: "navy" for f in rim})
    bm.verts.index_update()
    xs = {v.index: v.co.x - x0 for v in bm.verts}
    ob = mesh_object(name, bm, mat, parent)
    for poly in ob.data.polygons:
        poly.use_smooth = True  # the folds shade softly
    return ob, wave_cloth(None, xs, w, amplitude=0.16, wavelength=1.1)


def finish_arch(mat, col, arch_bm):
    """The kit's finish arch (Kenney overhead, 16 m), with the checkered banner on a hinge and two flags on top."""
    root = empty("prop_finish_arch_animated")
    width = 16.0
    sx = width / (max(v.co.x for v in arch_bm.verts) - min(v.co.x for v in arch_bm.verts))
    bm = kit.scaled(arch_bm.copy(), sx)
    kit.paint(bm, lambda f: "navy")
    clearance = kit.BVHTree.FromBMesh(bm).ray_cast(Vector((0, 0, 0.1)), Vector((0, 0, 1)))[0].z
    top = max(v.co.z for v in bm.verts)
    frame = mesh_object("arch_frame", bm, mat, root)

    # the banner hangs from a hinge just under the top beam and swings a little
    hinge = empty("arch_banner_hinge", root, (0, 0, clearance - 0.05))
    inner = 0.82 * width / 2
    bm = bmesh.new()
    banner = kit.bevelled_box(bm, (0, 0, -0.75), (2 * inner, 0.35, 1.5), bevel=0.04)
    trim = kit.bevelled_box(bm, (0, 0, -1.57), (2 * inner, 0.42, 0.22), bevel=0.04)
    uv = bm.loops.layers.uv.verify()
    for f in trim:
        for loop in f.loops:
            loop[uv].uv = kit.swatch_uv("flag")
    fronts = [f for f in banner if abs(f.normal.y) > 0.9]
    for f in banner:
        if f not in fronts:
            for loop in f.loops:
                loop[uv].uv = kit.swatch_uv("ink")
    kit.checker(bm, fronts, axis_u=0, axis_v=2, cells_u=14, cells_v=2)
    banner_ob = mesh_object("arch_banner", bm, mat, hinge)
    swing = math.radians(4)
    keyframes(hinge, "rotation_euler", [(0, 0), (30, swing), (60, 0), (90, -swing * 0.7), (120, 0)], "BEZIER", index=0,
              setter=lambda v: setattr(hinge.rotation_euler, "x", v))
    name_action(hinge, "anim_arch_banner")

    # two small checkered flags on the ends of the top beam, waving as one mesh (one animation)
    bm_poles = bmesh.new()
    colors = {}
    for side in (-1, 1):
        x = side * (width / 2 - 0.6)
        colors.update({f: "navy" for f in kit.cylinder(bm_poles, (x, 0, top + 0.9), 0.05, 1.8, segments=8, bevel=0.0)})
        colors.update({f: "gold" for f in kit.blob(bm_poles, (x, 0, top + 1.86), 0.09, squash=1, subdivisions=1)})
    paint_faces(bm_poles, colors)
    poles = mesh_object("arch_flag_poles", bm_poles, mat, root)
    left, left_wave = cloth_mesh(mat, "arch_flag_l", "checker", (0.9, 0.6), z_top=top + 1.75, x0=0.05)
    right, right_wave = cloth_mesh(mat, "arch_flag_r", "checker", (0.9, 0.6), z_top=top + 1.75, x0=0.05)
    # both fly outward from the arch: one turned round, then each moved onto its pole
    left.matrix_world = Matrix.Translation((-(width / 2 - 0.6), 0, 0)) @ Matrix.Rotation(math.pi, 4, "Z")
    right.matrix_world = Matrix.Translation((width / 2 - 0.6, 0, 0))
    for ob in (left, right):
        ob.data.transform(ob.matrix_world)
        ob.matrix_world = Matrix.Identity(4)
    offsets = left_wave | {i + len(left.data.vertices): v for i, v in right_wave.items()}
    joined = bpy.data.meshes.new("arch_flags")
    bm = bmesh.new()
    bm.from_mesh(left.data)
    bm.from_mesh(right.data)
    bm.to_mesh(joined)
    bm.free()
    joined.materials.append(mat)
    for poly in joined.polygons:
        poly.use_smooth = True
    flags = bpy.data.objects.new("arch_flags", joined)
    flags.parent = root
    for ob in (left, right):
        bpy.data.meshes.remove(ob.data)
    for ob in (root, frame, hinge, banner_ob, poles, flags):
        col.objects.link(ob)
    keys = add_wave_keys(flags, offsets)
    animate_wave(flags, keys, 30, "anim_arch_flags")
    return root


def crowd_card(mat, col, variant, shirt, skin, pom, beat):
    """A cardboard fan with a white die-cut border: arms down holding pom-poms, then arms up (the 'cheer' key).
    beat: the frames where the arms are up, one 2 s loop."""
    name = f"prop_crowd_card_{variant}"
    root = empty(name)
    bm = bmesh.new()
    colors = {}
    arms = []  # (vertex list, shoulder x) to swing for the cheer key
    t, border = 0.04, 0.05

    def cut(outline, color, grow=None, arm_of=None, layer=0):
        """The printed shape in front, and the paper border behind it (the outline grown by `border`). Parts that
        overlap sit a few millimetres apart (layer), like the layers of a printed standee, so they never z-fight."""
        g = grow or outline
        lift = 0.004 * layer
        verts_b, f_b = slab(bm, g, t * 0.5, t, "paper")
        verts_f, f_f = slab(bm, outline, -0.005 - lift, t * 0.5, color)
        colors.update(f_b)
        colors.update(f_f)
        if arm_of is not None:
            arms.append((verts_b + verts_f, arm_of))

    # legs, body, head
    for x in (-0.13, 0.13):
        cut(outline_rect(x - 0.1, 0.06, x + 0.1, 0.8, 0.05), "navy", outline_rect(x - 0.15, 0.01, x + 0.15, 0.85, 0.08))
    cut(outline_rect(-0.3, 0.72, 0.3, 1.38, 0.1), shirt, outline_rect(-0.35, 0.67, 0.35, 1.43, 0.14), layer=1)
    cut(outline_circle(0, 1.6, 0.21, 22), skin, outline_circle(0, 1.6, 0.21 + border, 22), layer=2)
    for x in (-0.07, 0.07):  # eyes, and a round cheering mouth, printed on the face
        _, f = slab(bm, outline_circle(x, 1.64, 0.026, 8), -0.02, -0.012, "ink")
        colors.update(f)
    _, f = slab(bm, outline_circle(0, 1.52, 0.04, 10), -0.02, -0.012, "ink")
    colors.update(f)
    # arms hanging down, each with a pom-pom, so the cheer key can swing them up
    for side in (-1, 1):
        sx = side * 0.37  # just outside the body
        cut(outline_rect(sx - 0.065, 0.8, sx + 0.065, 1.36, 0.05), shirt,
            outline_rect(sx - 0.115, 0.75, sx + 0.115, 1.41, 0.08), arm_of=(sx, 1.3), layer=2)
        cut(outline_circle(sx, 0.76, 0.16, 16), pom, outline_circle(sx, 0.76, 0.16 + border, 16), arm_of=(sx, 1.3),
            layer=3)
    # a little cardboard foot behind, so it stands
    _, f = slab(bm, outline_rect(-0.25, 0.0, 0.25, 0.5), t, t + 0.35, "bark")
    colors.update(f)
    paint_faces(bm, colors)
    bm.verts.index_update()
    swing = [([v.index for v in verts], pivot) for verts, pivot in arms]
    card = mesh_object(f"crowd_card_{variant}", bm, mat, root)
    card.shape_key_add(name="Basis")
    cheer = card.shape_key_add(name="cheer")
    for indices, (px, pz) in swing:
        a = math.radians(150) * (1 if px > 0 else -1)  # up and out, like a V
        for i in indices:
            co = cheer.data[i].co
            dx, dz = co.x - px, co.z - pz
            co.x = px + dx * math.cos(a) - dz * math.sin(a)
            co.z = pz + dx * math.sin(a) + dz * math.cos(a)
    for ob in (root, card):
        col.objects.link(ob)
    values = [(0, 0)]
    for start, end in beat:
        values += [(start, 1), (end, 0)]
    values.append((60, 0))
    keyframes(cheer, "value", values, "CONSTANT")
    name_action(card.data.shape_keys, f"anim_crowd_cheer_{variant}")
    return root


# ------------------------------------------------------------------ build

def build():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    scene = bpy.context.scene
    scene.name = "Animated props"
    scene.render.fps = FPS
    scene.frame_start, scene.frame_end = 0, 120
    greybox = [] if (kit.PACKS / kit.KENNEY["arch"][0]).exists() else kit.import_glb(kit.GREYBOX)
    arch_bm = kit.kenney_piece("arch", greybox)
    for o in greybox:
        bpy.data.objects.remove(o)
    for mesh in list(bpy.data.meshes):
        if mesh.users == 0:
            bpy.data.meshes.remove(mesh)
    mat = kit.palette_material()
    col = bpy.data.collections.new("kit_animated")
    scene.collection.children.link(col)

    item_box(mat, col)
    flag(mat, col, "prop_flag_checker", "checker", "anim_flag_checker_wave")
    flag(mat, col, "prop_flag_bluewhite", "bluewhite", "anim_flag_bluewhite_wave")
    finish_arch(mat, col, arch_bm)
    # three fans, each with its own beat (arms-up frames in a 2 s loop), so a stand never cheers in lockstep
    crowd_card(mat, col, "a", "navy", "vanilla", "gold", [(0, 8), (16, 24), (40, 52)])
    crowd_card(mat, col, "b", "white", "chocolate", "navy", [(10, 22), (34, 40), (46, 54)])
    crowd_card(mat, col, "c", "brake", "bark", "gas", [(4, 12), (26, 38), (50, 56)])

    OUT.mkdir(parents=True, exist_ok=True)
    bpy.ops.export_scene.gltf(filepath=str(OUT / "kit_animated.glb"), export_format="GLB", collection=col.name,
                              export_yup=True, export_extras=False, export_animations=True,
                              export_animation_mode="ACTIONS", export_morph=True, export_morph_animation=True,
                              export_cameras=False, export_lights=False, export_apply=False)
    bpy.ops.wm.save_as_mainfile(filepath=str(OUT / "animated_props.blend"), compress=True)
    tri = lambda ob: sum(len(p.vertices) - 2 for p in ob.data.polygons)
    meshes = [o for o in col.objects if o.type == "MESH"]
    print({"triangles": {o.name: tri(o) for o in meshes}, "total": sum(tri(o) for o in meshes),
           "actions": sorted(a.name for a in bpy.data.actions), "out": str(OUT)})


build()
