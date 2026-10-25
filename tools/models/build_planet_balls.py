"""Builds the planet balls in Blender: Earth, Mars, Jupiter and Saturn (M1), Mercury, Venus, Uranus and Neptune (M3).

Run it in Blender (Scripting tab, or the MCP execute tool with RACEBALL_ROOT set),
or headless: blender -b -P tools/models/build_planet_balls.py
(or plain python with the bpy module from PyPI).

Each planet is a 1 m UV sphere with one material and a painted 1024x512 texture,
in the colors of packages/shared/theme/theme.css. Every file also holds the orbit
ring ("ring", material mat_player_color): white with ink edges as vertex colors,
so code tints it to the player color. Works in a dedicated scene and writes only
that scene to assets-src/models/planet_balls.blend, so an open file is left alone.

Raw GLBs go to assets-src/models/. Optimize them into the game with:
  gltf-transform optimize assets-src/models/ball_earth.glb \
    apps/web/public/assets/models/ball_earth.glb \
    --compress meshopt --texture-compress webp --simplify false
"""

import math
import os
from pathlib import Path

import bpy
import numpy as np

ROOT = Path(globals().get("RACEBALL_ROOT") or os.environ.get("RACEBALL_ROOT") or Path(__file__).resolve().parents[2])
OUT = ROOT / "assets-src" / "models"
SEGMENTS, RINGS = 48, 32  # about 3k triangles; the budget is 5k per ball
TEX_W, TEX_H, SUPERSAMPLE = 1024, 512, 2
RING_INNER, RING_OUTER, RING_HEIGHT, RING_EDGE = 0.66, 0.86, 0.05, 0.02
INK = "#17151F"


def srgb(hex_color):
    return np.array([int(hex_color[i:i + 2], 16) / 255 for i in (1, 3, 5)])


def direction(lat, lon):
    lat, lon = math.radians(lat), math.radians(lon)
    return np.array([math.cos(lat) * math.cos(lon), math.cos(lat) * math.sin(lon), math.sin(lat)])


# Painted details, evaluated on the sphere so nothing stretches at the poles.
# blob: an ellipse (angular radii in degrees) around a point, turned by `turn` degrees
# band: everything between two latitudes
# cap: everything above a latitude
# streak: a band between two longitudes, with round ends
# wave: a band whose edges ripple with longitude, for soft cloud bands
def blob(lat, lon, a, b, turn=0):
    return ("blob", lat, lon, a, b, turn)


def crater(lat, lon, r, pit, rim):
    """A painted crater: a pale rim showing on its upper-left side, then the dark pit over it."""
    return [(rim, blob(lat + r * 0.18, lon - r * 0.18, r * 1.12, r * 1.12)), (pit, blob(lat, lon, r, r))]


PLANETS = {
    "earth": ("#2F7FC1", [
        ("#5FA347", blob(14, 20, 30, 19, 25)), ("#5FA347", blob(32, 42, 16, 11, -10)), ("#5FA347", blob(-6, 4, 14, 9, 40)),
        ("#5FA347", blob(-26, 170, 19, 13, -20)), ("#5FA347", blob(-12, 186, 10, 8)),
        ("#FFFFFF", ("streak", 54, 3.5, 210, 320)),
    ]),
    "mars": ("#C8502E", [
        ("#8E3320", blob(-10, 40, 30, 15, 10)), ("#8E3320", blob(-22, 72, 14, 9, -15)),
        ("#FFFFFF", ("cap", 62)),
    ]),
    "jupiter": ("#E3C9A0", [
        ("#C98F5A", ("band", 15.1, 28.7)), ("#F1E3C8", ("band", -1.1, 5.7)), ("#C98F5A", ("band", -16.3, -6.9)),
        ("#B5452C", blob(-23.5, 60, 13, 7.5)),
    ]),
    "saturn": ("#E6C88A", [
        ("#CFA75F", ("band", 5.7, 18.7)), ("#F3E2B8", ("band", -17.5, -9.2)),
    ]),
    # M3: the same colors as the lobby's CSS planets (packages/shared/theme/theme.css)
    "mercury": ("#A9A4A0", [
        # three big craters, plus two small ones round the back, so it reads as Mercury from any side
        *crater(18, 40, 21, "#7E7874", "#C4BFBA"), *crater(-26, 150, 15, "#7E7874", "#C4BFBA"),
        *crater(36, 255, 11, "#8F8984", "#C4BFBA"), *crater(-12, 300, 6, "#8F8984", "#C4BFBA"),
        *crater(-48, 60, 7, "#8F8984", "#C4BFBA"),
    ]),
    # details sit above the orbit ring: from the chase camera and in the lobby you mostly see the top half
    "venus": ("#E9C77B", [
        ("#D9A24E", ("wave", 4, 17, 4, 3, 0)), ("#F3DDA6", ("wave", 30, 37, 3, 4, 40)),
    ]),
    "uranus": ("#8FD3D6", [
        ("#6DBCC2", ("band", 14, 24)), ("#A9E0E2", ("cap", 64)),
    ]),
    "neptune": ("#3557B8", [
        ("#7FA2EA", ("streak", 14, 3.4, 40, 200)), ("#233C88", blob(38, 120, 13, 8, -8)),
    ]),
}


def paint(base, details):
    """An equirectangular texture: u = longitude / 360, v = (latitude + 90) / 180."""
    w, h = TEX_W * SUPERSAMPLE, TEX_H * SUPERSAMPLE
    lon = (np.arange(w) + 0.5) / w * 2 * np.pi
    lat = ((np.arange(h) + 0.5) / h - 0.5) * np.pi
    lon, lat = np.meshgrid(lon, lat)  # rows from the bottom (v = 0), like Blender's pixel order
    d = np.stack([np.cos(lat) * np.cos(lon), np.cos(lat) * np.sin(lon), np.sin(lat)], -1)
    img = np.broadcast_to(srgb(base), (h, w, 3)).copy()
    lat_deg, lon_deg = np.degrees(lat), np.degrees(lon)
    for color, (kind, *p) in details:
        if kind == "band":
            mask = (lat_deg >= p[0]) & (lat_deg <= p[1])
        elif kind == "cap":
            mask = lat_deg >= p[0]
        elif kind == "wave":
            lo, hi, amp, waves, phase = p
            ripple = amp * np.sin(np.radians(lon_deg * waves + phase))
            mask = (lat_deg >= lo + ripple) & (lat_deg <= hi + ripple * 0.7)
        elif kind == "streak":
            mid, half, lon0, lon1 = p
            east = np.clip(lon_deg, lon0, lon1)  # nearest point on the streak's center line
            dlon = (lon_deg - east) * np.cos(np.radians(mid))
            mask = np.hypot(dlon, lat_deg - mid) <= half
        else:  # blob
            c_lat, c_lon, a, b, turn = p
            c = direction(c_lat, c_lon)
            east = np.cross([0, 0, 1], c)
            east /= np.linalg.norm(east)
            north = np.cross(c, east)
            x, y = d @ east, d @ north
            t = math.radians(turn)
            x, y = x * math.cos(t) + y * math.sin(t), -x * math.sin(t) + y * math.cos(t)
            mask = (d @ c > 0) & ((x / math.sin(math.radians(a))) ** 2 + (y / math.sin(math.radians(b))) ** 2 <= 1)
        img[mask] = srgb(color)
    img = img.reshape(TEX_H, SUPERSAMPLE, TEX_W, SUPERSAMPLE, 3).mean((1, 3))  # antialiased edges
    return np.concatenate([img, np.ones((TEX_H, TEX_W, 1))], -1)


def sphere_mesh(name):
    """A UV sphere with 1 m diameter whose UVs match paint(); vertices are shared for smooth normals."""
    verts, faces, uvs = [], [], []
    for r in range(1, RINGS):
        lat = -math.pi / 2 + math.pi * r / RINGS
        for s in range(SEGMENTS):
            lon = 2 * math.pi * s / SEGMENTS
            verts.append((0.5 * math.cos(lat) * math.cos(lon), 0.5 * math.cos(lat) * math.sin(lon), 0.5 * math.sin(lat)))
    south, north = len(verts), len(verts) + 1
    verts += [(0, 0, -0.5), (0, 0, 0.5)]

    def ring_vert(r, s):  # r = 1..RINGS-1, s wraps
        return (r - 1) * SEGMENTS + s % SEGMENTS

    for s in range(SEGMENTS):
        u0, u1 = s / SEGMENTS, (s + 1) / SEGMENTS
        faces.append((south, ring_vert(1, s + 1), ring_vert(1, s)))
        uvs.append([((u0 + u1) / 2, 0), (u1, 1 / RINGS), (u0, 1 / RINGS)])
        for r in range(1, RINGS - 1):
            v0, v1 = r / RINGS, (r + 1) / RINGS
            faces.append((ring_vert(r, s), ring_vert(r, s + 1), ring_vert(r + 1, s + 1), ring_vert(r + 1, s)))
            uvs.append([(u0, v0), (u1, v0), (u1, v1), (u0, v1)])
        faces.append((north, ring_vert(RINGS - 1, s), ring_vert(RINGS - 1, s + 1)))
        uvs.append([((u0 + u1) / 2, 1), (u0, (RINGS - 1) / RINGS), (u1, (RINGS - 1) / RINGS)])
    data = bpy.data.meshes.new(name)
    data.from_pydata(verts, [], faces)
    layer = data.uv_layers.new(name="UVMap")
    for poly, face_uvs in zip(data.polygons, uvs):
        for loop, uv in zip(poly.loop_indices, face_uvs):
            layer.data[loop].uv = uv
    data.polygons.foreach_set("use_smooth", [True] * len(data.polygons))
    data.update()
    return data


def ring_mesh(name):
    """A flat band around the ball: white top and bottom, ink inner and outer edges."""
    r0, r1, e, z = RING_INNER, RING_OUTER, RING_EDGE, RING_HEIGHT / 2
    ink, white = (*srgb(INK), 1), (1, 1, 1, 1)
    # the cross-section, one (start, end, color) per strip, going round the profile
    strips = [((r0, -z), (r0, z), ink), ((r0, z), (r0 + e, z), ink), ((r0 + e, z), (r1 - e, z), white), ((r1 - e, z), (r1, z), ink),
              ((r1, z), (r1, -z), ink), ((r1, -z), (r1 - e, -z), ink), ((r1 - e, -z), (r0 + e, -z), white), ((r0 + e, -z), (r0, -z), ink)]
    n = SEGMENTS * 2
    verts, faces, colors = [], [], []
    for (a, b, color) in strips:  # each strip gets its own vertices, so its corners stay crisp
        base = len(verts)
        for i in range(n):
            t = 2 * math.pi * i / n
            verts += [(a[0] * math.cos(t), a[0] * math.sin(t), a[1]), (b[0] * math.cos(t), b[0] * math.sin(t), b[1])]
        for i in range(n):
            j = (i + 1) % n
            faces.append((base + 2 * i, base + 2 * j, base + 2 * j + 1, base + 2 * i + 1))
            colors.append(color)
    data = bpy.data.meshes.new(name)
    data.from_pydata(verts, [], faces)
    data.update()
    data.polygons.foreach_set("use_smooth", [True] * len(data.polygons))
    attr = data.color_attributes.new("Color", "BYTE_COLOR", "CORNER")
    for poly, color in zip(data.polygons, colors):
        for loop in poly.loop_indices:
            attr.data[loop].color_srgb = color
    data.color_attributes.active_color = attr
    data.color_attributes.render_color_index = 0
    data.update()
    return data


def principled(name, roughness):
    mat = bpy.data.materials.get(name) or bpy.data.materials.new(name)
    mat.use_nodes = True
    mat.use_backface_culling = True  # closed meshes: exported single-sided
    nodes = mat.node_tree.nodes
    shader = nodes.get("Principled BSDF")
    shader.inputs["Roughness"].default_value = roughness
    shader.inputs["Metallic"].default_value = 0
    return mat, shader


def planet_material(planet, pixels):
    mat, shader = principled(f"mat_ball_{planet}", 0.6)
    image = bpy.data.images.get(f"tex_ball_{planet}") or bpy.data.images.new(f"tex_ball_{planet}", TEX_W, TEX_H, alpha=False)
    image.colorspace_settings.name = "sRGB"
    image.pixels.foreach_set(pixels.astype(np.float32).ravel())
    image.pack()
    tex = mat.node_tree.nodes.get("Image Texture") or mat.node_tree.nodes.new("ShaderNodeTexImage")
    tex.image = image
    mat.node_tree.links.new(tex.outputs["Color"], shader.inputs["Base Color"])
    return mat


def ring_material():
    mat, shader = principled("mat_player_color", 0.5)
    attr = mat.node_tree.nodes.get("Color Attribute") or mat.node_tree.nodes.new("ShaderNodeVertexColor")
    attr.layer_name = "Color"
    mat.node_tree.links.new(attr.outputs["Color"], shader.inputs["Base Color"])
    return mat


# a dedicated scene, rebuilt from scratch on every run
scene = bpy.data.scenes.get("Planet balls") or bpy.data.scenes.new("Planet balls")
for obj in list(scene.collection.all_objects):
    bpy.data.objects.remove(obj)
for name in [f"{kind}_{planet}" for planet in PLANETS for kind in ("ball", "ring")] + ["ring"]:
    if name in bpy.data.meshes:
        bpy.data.meshes.remove(bpy.data.meshes[name])
OUT.mkdir(parents=True, exist_ok=True)
ring_mat = ring_material()
built = {}
for i, (planet, (base, details)) in enumerate(PLANETS.items()):
    collection = bpy.data.collections.get(f"ball_{planet}") or bpy.data.collections.new(f"ball_{planet}")
    if collection.name not in scene.collection.children:
        scene.collection.children.link(collection)
    body = bpy.data.objects.new(f"ball_{planet}", sphere_mesh(f"ball_{planet}"))
    body.data.materials.append(planet_material(planet, paint(base, details)))
    ring = bpy.data.objects.new(f"ring_{planet}", ring_mesh(f"ring_{planet}"))
    ring.data.materials.append(ring_mat)
    for obj in (body, ring):
        collection.objects.link(obj)
        obj.location.x = i * 2.5  # side by side in the .blend; each export is centered again below
    built[planet] = (collection, body, ring)

# one GLB per planet, holding "ball_<planet>" and "ring" (the name the game looks for)
with bpy.context.temp_override(scene=scene, view_layer=scene.view_layers[0]):
    for planet, (collection, body, ring) in built.items():
        x = body.location.x
        body.location.x = ring.location.x = 0
        ring.name = ring.data.name = "ring"
        bpy.ops.export_scene.gltf(filepath=str(OUT / f"ball_{planet}.glb"), export_format="GLB", collection=collection.name,
                                  export_yup=True, export_extras=True, export_animations=False, export_cameras=False,
                                  export_lights=False, export_vertex_color="ACTIVE")
        ring.name = ring.data.name = f"ring_{planet}"
        body.location.x = ring.location.x = x

blocks = {scene, *scene.collection.children_recursive, *scene.collection.all_objects}
blocks |= {obj.data for obj in scene.collection.all_objects} | {m for obj in scene.collection.all_objects for m in obj.data.materials}
blocks |= {img for img in bpy.data.images if img.name.startswith("tex_ball_")}
bpy.data.libraries.write(str(OUT / "planet_balls.blend"), blocks, compress=True)
print({"triangles": {p: sum(len(f.vertices) - 2 for o in (b, r) for f in o.data.polygons) for p, (_, b, r) in built.items()}, "out": str(OUT)})
