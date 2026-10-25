"""Builds the ground of Happy Valley in Blender (M3 polish): the board, its chasms, the causeways and the hills.

Run it headless with the bpy module from PyPI (pip install bpy): python tools/models/build_world.py
or in Blender (blender -b -P tools/models/build_world.py).

Reads packages/game-core/tracks/happy_valley_world.json, the same file game-core builds the ground's colliders from,
so the grass you see is the grass you land on (and leaving the road onto it respawns you). Writes
assets-src/models/happy_valley_world.glb and world.blend:
  - the board: grass on top (mowing stripes and tufts), and wherever it ends, at its edges and round the voids, a
    cut face of layered soil and rock, like a diorama board
  - causeways: wherever the road runs above the grass, limestone walls with pilasters under the rails, so the road
    never floats (the route maths come from tools/track/build_happy_valley.py)
  - hills with fall trees in the outer band, away from the road, the landmarks and Mount Nittany. Visual only:
    nobody gets that far before the grass respawns them
  - buildings over Ali's greybox blocks that have no landmark yet (the HUB, three College Ave storefronts) and
    snow drifts over the Arboretum's snowbank blocks, each a little bigger than the block it hides; and clumps
    of trees on the open lawns between the road and the hills
  - the road's surface over the greybox road, on the greybox's own chords: asphalt with chalk edge lines and the
    center dashes, a tint and a shine per section (the Arboretum's is icy), kerbs in each section's color and a
    checkered start line. It sits ROAD_LIFT above the colliders' top; the web pulls it forward (world.ts) so it
    never flickers against the greybox far away
Optimize into the game with:
  gltf-transform optimize assets-src/models/happy_valley_world.glb apps/web/public/assets/maps/happy_valley_world.glb \
    --compress meshopt --texture-compress webp --simplify false --join false --flatten false
"""

import bisect
import importlib.util
import json
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
WORLD = json.loads((ROOT / "packages" / "game-core" / "tracks" / "happy_valley_world.json").read_text())

_spec = importlib.util.spec_from_file_location("dressing_kit_lib", ROOT / "tools" / "models" / "build_dressing_kit.py")
kit = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(kit)

# The route, exactly as the map script builds it: its knots, spline, heights and banking, without Blender
_src = (ROOT / "tools" / "track" / "build_happy_valley.py").read_text()
_route = {"math": math, "bisect": bisect}
exec(_src[_src.index("SECTIONS = ["):_src.index("def blender(p):")], _route)
xyz, center, length = _route["xyz"], _route["center"], _route["length"]
tangent, height, bank = _route["tangent"], _route["height"], _route["bank"]
SECTIONS, starts, ends, steps = _route["SECTIONS"], _route["starts"], _route["ends"], _route["steps"]

GROUND_Y = WORLD["groundY"]
CELL = WORLD["cell"]
X0, Z0, X1, Z1 = WORLD["board"]
DEPTH = 7.0  # how thick the board looks at its cut edges, m
WIDTH_HALF = 6.0  # the road's half width (build_happy_valley.py: WIDTH / 2): the rails start here
RAIL_OUT = 6.5  # the rails' outer face, from the road's centerline (build_happy_valley.py: WIDTH / 2 + 0.5)
SLAB = 0.85  # how deep the road and rails reach below their top
# landmarks the hills keep away from: center and radius, m
LANDMARKS = [((201.25, 75.9), 105), ((-26.45, 18.4), 42), ((-26.45, 247.25), 42), ((34.5, 284.05), 34),
             ((116.15, 231.15), 34), ((0, 0), 30)]
NITTANY = (100, -150, 232, -66)  # [min x, min z, max x, max z]
# Ali's greybox blocks without a landmark yet (build_happy_valley.py: landmark()), dressed over: center x, z, then
# width (x), height, depth (z), map meters. Snowbanks are 15 x 3 x 10, from y -1
HUB = (35.65, 156.4, 24, 10, 17)
STOREFRONTS = [(-25.3, -32.2, 10, 10, 11, "brick"), (-26.45, -49.45, 10, 8, 11, "vanilla"),
               (-41.4, -46.0, 10, 13, 11, "maple")]
SNOWBANKS = [(80.5, -11.5), (51.75, -23.0), (28.75, -11.5)]
ROAD_LIFT = 0.025  # the surface over the greybox road's top, m
ASPHALT = 5.4  # half the asphalt's width: the kerbs fill the last 0.6 m to the rails
TILE = 12.0  # m of road per asphalt tile: the greybox's center dashes are 12 m apart, on multiples of 12
KERB_BLOCK = 1.5  # m
# per section: the kerbs' color (kit palette), the asphalt's tint (linear multiply) and its roughness
ROAD_LOOK = {
    "start": ("stop", (1.0, 1.0, 1.0), 0.82),
    "pollock": ("brick", (1.0, 0.93, 0.88), 0.85),
    "library": ("navy", (0.98, 0.95, 0.88), 0.85),
    "lionshrine": ("pine", (0.92, 0.98, 0.9), 0.85),
    "creamery": ("strawberry", (1.0, 0.86, 0.9), 0.75),
    "stadium": ("navy", (0.88, 0.92, 1.0), 0.8),
    "arboretum": ("ice", (0.86, 0.95, 1.0), 0.32),  # frost: the snow falls here
    "collegeave": ("maple", (0.93, 0.93, 0.98), 0.85),
}


def G(x, y, z):
    """Map coordinates (y up, z south) to Blender's (z up)."""
    return Vector((x, -z, y))


def inside_poly(poly, x, z):
    c = False
    j = len(poly) - 1
    for i in range(len(poly)):
        xi, zi = poly[i]
        xj, zj = poly[j]
        if (zi > z) != (zj > z) and x < (xj - xi) * (z - zi) / (zj - zi) + xi:
            c = not c
        j = i
    return c


def solid(c, r):
    """The cell at column c, row r has grass (game-core's solidAt, judged at the cell's center)."""
    if c < 0 or r < 0 or c >= COLS or r >= ROWS:
        return False
    x, z = X0 + (c + 0.5) * CELL, Z0 + (r + 0.5) * CELL
    return not any(inside_poly(v["poly"], x, z) for v in WORLD["voids"])


COLS = round((X1 - X0) / CELL)
ROWS = round((Z1 - Z0) / CELL)
SOLID = [[solid(c, r) for c in range(COLS)] for r in range(ROWS)]


# ------------------------------------------------------------------ textures (drawn with numpy, packed in the file)

def srgb(hex_color):
    return np.array([int(hex_color[i:i + 2], 16) / 255 for i in (1, 3, 5)])


def image(name, pixels):
    """pixels: rows from the top, (h, w, 3) in 0..1"""
    h, w, _ = pixels.shape
    img = bpy.data.images.new(name, w, h, alpha=False)
    rgba = np.concatenate([pixels[::-1], np.ones((h, w, 1))], -1)  # Blender's rows start at the bottom
    img.pixels.foreach_set(rgba.astype(np.float32).ravel())
    img.pack()
    return img


def blobs(img, rng, count, radius, color, strength=1.0):
    """Soft round dabs, wrapping at the edges so the texture tiles."""
    h, w, _ = img.shape
    yy, xx = np.mgrid[0:h, 0:w]
    for _ in range(count):
        cx, cy, r = rng.uniform(0, w), rng.uniform(0, h), rng.uniform(*radius)
        dx = np.minimum(abs(xx - cx), w - abs(xx - cx))
        dy = np.minimum(abs(yy - cy), h - abs(yy - cy))
        a = np.clip(1.4 - np.hypot(dx, dy) / r, 0, 1)[..., None] * strength
        img[:] = img * (1 - a) + srgb(color) * a


def grass_texture():
    """One tile is 16 m: two mowing stripes, tufts darker and lighter, a few daisies. Painted, not photographed."""
    rng = np.random.default_rng(4)
    n = 512
    img = np.zeros((n, n, 3))
    stripe = (np.arange(n) // (n // 2)) % 2
    img[:] = np.where(stripe[None, :, None] == 0, srgb("#7FA34A"), srgb("#76994A"))
    blobs(img, rng, 70, (10, 26), "#6E9140", 0.55)
    blobs(img, rng, 60, (8, 20), "#8DB257", 0.5)
    blobs(img, rng, 22, (2.2, 3.2), "#F4F6F8", 0.9)  # daisies
    blobs(img, rng, 10, (2.0, 2.8), "#FFC81E", 0.9)
    return image("tex_grass", img)


def soil_texture():
    """A cut face, top to bottom: a lip of turf, brown topsoil with pebbles, darker clay, then rock."""
    rng = np.random.default_rng(9)
    w, h = 512, 512
    img = np.zeros((h, w, 3))
    x = np.arange(w)
    wave = lambda base, amp, f, p: (base + amp * np.sin(x / w * 2 * np.pi * f + p)).astype(int)
    turf, clay, rock = wave(30, 4, 3, 0), wave(250, 14, 2, 1.3), wave(400, 18, 3, 2.1)
    rows = np.arange(h)[:, None]
    img[:] = srgb("#6B4429")
    img[rows < turf[None, :]] = srgb("#6E9140")
    img[(rows >= clay[None, :]) & (rows < rock[None, :])] = srgb("#5B3A29")
    img[rows >= rock[None, :]] = srgb("#4A4452")
    blobs(img, rng, 120, (2.5, 6), "#D9CBB0", 0.85)  # pebbles
    blobs(img, rng, 40, (8, 16), "#3A3944", 0.5)  # stones in the rock band
    img[(rows >= turf[None, :]) & (rows < turf[None, :] + 4)] = srgb("#4F6B2E")  # the turf's shadow line
    return image("tex_soil", img)


def stone_texture():
    """Limestone blocks in courses, two blocks per row of the tile, mortar lines, a highlight on each top edge."""
    rng = np.random.default_rng(2)
    n = 256
    img = np.zeros((n, n, 3))
    course = n // 4
    for r in range(4):
        offset = (n // 4) * (r % 2)
        for b in range(3):
            x0 = (offset + b * n // 2) % n
            tone = srgb("#D9CBB0") * rng.uniform(0.92, 1.04)
            cols = (np.arange(n // 2) + x0) % n
            img[r * course:(r + 1) * course, cols] = tone
            img[r * course:r * course + 3, cols] = np.minimum(tone * 1.1, 1)
            img[r * course:(r + 1) * course, x0:x0 + 3] = srgb("#B9AA8E")
        img[(r + 1) * course - 3:(r + 1) * course] = srgb("#B9AA8E")
    return image("tex_stone", img)


def asphalt_texture():
    """One tile: 10.8 m of asphalt across (u) by 12 m along (v), from the left kerb. Grain and patches, polished bands
    where the wheels go, chalk edge lines and the center dash on the tile's ends (where the greybox's dashes are)."""
    rng = np.random.default_rng(7)
    n = 512
    img = np.zeros((n, n, 3))
    img[:] = srgb("#4A4956")
    blobs(img, rng, 26, (30, 70), "#43424E", 0.45)  # old patches
    blobs(img, rng, 18, (20, 50), "#52515D", 0.35)
    u = (np.arange(n) + 0.5) / n
    for c in (0.3, 0.7):  # where the balls roll most: darker, smoother
        band = np.exp(-((u - c) / 0.07) ** 2)[None, :, None]
        img[:] = img * (1 - 0.18 * band) + srgb("#3A3944") * 0.18 * band
    img *= 1 + rng.normal(0, 0.045, (n, n, 1))  # aggregate grain
    speck = rng.random((n, n)) < 0.006
    img[speck] = img[speck] * 0.5 + srgb("#77757F") * 0.5
    # a few sealed cracks, wandering along the road
    for _ in range(3):
        x, y = rng.uniform(0.1, 0.9) * n, rng.uniform(0, n)
        for _ in range(200):
            img[int(y) % n, int(x) % n] = img[int(y) % n, int(x) % n] * 0.4 + srgb("#2F2E38") * 0.6
            x += rng.normal(0, 0.7)
            y += 1
    line = lambda a, b: (u >= a) & (u < b)
    img[:, line(0.024, 0.044)] = srgb("#E9ECEA")
    img[:, line(0.956, 0.976)] = srgb("#E9ECEA")
    v = (np.arange(n) + 0.5) / n
    dash = (v < 0.125) | (v >= 0.875)  # 3 m, centered on the tile's ends
    img[np.ix_(dash, line(0.4945, 0.5055))] = srgb("#E9ECEA")
    return image("tex_asphalt", np.clip(img, 0, 1)[::-1])  # rows from the top: v = 1 is the first row


def tinted(name, img, tint, roughness):
    """A material whose texture is multiplied by a color: the glTF exporter writes the color as baseColorFactor"""
    mat = material(name, img, roughness)
    nt = mat.node_tree
    shader = nt.nodes.get("Principled BSDF")
    tex = next(n for n in nt.nodes if n.type == "TEX_IMAGE")
    mix = nt.nodes.new("ShaderNodeMix")
    mix.data_type = "RGBA"
    mix.blend_type = "MULTIPLY"
    mix.inputs["Factor"].default_value = 1.0
    nt.links.new(tex.outputs["Color"], mix.inputs[6])
    mix.inputs[7].default_value = (*tint, 1.0)
    nt.links.new(mix.outputs[2], shader.inputs["Base Color"])
    return mat


def material(name, img, roughness):
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    mat.use_backface_culling = True
    shader = mat.node_tree.nodes.get("Principled BSDF")
    shader.inputs["Roughness"].default_value = roughness
    tex = mat.node_tree.nodes.new("ShaderNodeTexImage")
    tex.image = img
    mat.node_tree.links.new(tex.outputs["Color"], shader.inputs["Base Color"])
    return mat


# ------------------------------------------------------------------ geometry

def quad(bm, uv, corners, uvs):
    f = bm.faces.new([bm.verts.new(c) for c in corners])
    for loop, t in zip(f.loops, uvs):
        loop[uv].uv = t
    return f


def board():
    """The grass top as strips (as game-core's colliders), and a cut face wherever grass meets void or the edge."""
    bm = bmesh.new()
    uv = bm.loops.layers.uv.new()
    tile = 16.0
    top = lambda x, z: (x / tile, -z / tile)
    for r in range(ROWS):
        za, zb = Z0 + r * CELL, Z0 + (r + 1) * CELL
        c = 0
        while c < COLS:
            if not SOLID[r][c]:
                c += 1
                continue
            start = c
            while c < COLS and SOLID[r][c]:
                c += 1
            xa, xb = X0 + start * CELL, X0 + c * CELL
            corners = [(xa, za), (xa, zb), (xb, zb), (xb, za)]  # counter-clockwise from above: facing up
            quad(bm, uv, [G(x, GROUND_Y, z) for x, z in corners], [top(x, z) for x, z in corners])
    edges = bmesh.new()
    euv = edges.loops.layers.uv.new()
    lo = GROUND_Y - DEPTH

    def face(a, b):
        """A cut face from a to b (map x, z) along the board's edge. It faces (dz, -dx): walking from a to b, the grass
        is on your right"""
        d = math.dist(a, b)
        quad(edges, euv, [G(a[0], GROUND_Y, a[1]), G(b[0], GROUND_Y, b[1]), G(b[0], lo, b[1]), G(a[0], lo, a[1])],
             [(0, 1), (d / DEPTH, 1), (d / DEPTH, 0), (0, 0)])

    # horizontal edges (between rows), merged along a row
    for r in range(ROWS + 1):
        z = Z0 + r * CELL
        for above, below, flip in ((True, False, True), (False, True, False)):
            c = 0
            while c < COLS:
                here = (r - 1 >= 0 and SOLID[r - 1][c]) if above else (r < ROWS and SOLID[r][c])
                other = (r < ROWS and SOLID[r][c]) if above else (r - 1 >= 0 and SOLID[r - 1][c])
                if not (here and not other):
                    c += 1
                    continue
                start = c
                while c < COLS:
                    h = (r - 1 >= 0 and SOLID[r - 1][c]) if above else (r < ROWS and SOLID[r][c])
                    o = (r < ROWS and SOLID[r][c]) if above else (r - 1 >= 0 and SOLID[r - 1][c])
                    if not (h and not o):
                        break
                    c += 1
                a, b = (X0 + start * CELL, z), (X0 + c * CELL, z)
                face(b, a) if flip else face(a, b)
    # vertical edges (between columns), merged down a column
    for c in range(COLS + 1):
        x = X0 + c * CELL
        for left, flip in ((True, True), (False, False)):
            r = 0
            while r < ROWS:
                def edge(rr):
                    l = c - 1 >= 0 and SOLID[rr][c - 1]
                    rgt = c < COLS and SOLID[rr][c]
                    return (l and not rgt) if left else (rgt and not l)
                if not edge(r):
                    r += 1
                    continue
                start = r
                while r < ROWS and edge(r):
                    r += 1
                a, b = (x, Z0 + start * CELL), (x, Z0 + r * CELL)
                face(a, b) if flip else face(b, a)
    return bm, edges


def causeways():
    """Limestone walls from the rails' outer foot down to the grass wherever the road runs above it, and a pilaster
    every 10 m where a wall stands taller than 1.5 m."""
    bm = bmesh.new()
    uv = bm.loops.layers.uv.new()
    step = 2.5
    samples = [s * step for s in range(int(length / step) + 1)]
    for side in (-1, 1):
        run = []
        for s in samples + [None]:
            if s is not None:
                x, y, z = xyz(s, side * RAIL_OUT)
                foot = y - SLAB
                if foot > GROUND_Y + 0.02:
                    cx, cz = center(s)
                    out = math.hypot(x - cx, z - cz)
                    run.append((s, x, foot + 0.1, z, (x - cx) / out, (z - cz) / out))
                    continue
            # end of a run: build it, every quad facing away from the road
            bottom = GROUND_Y - 0.3
            for (s0, xa, ya, za, ox, oz), (s1, xb, yb, zb, _, _) in zip(run, run[1:]):
                corners = [G(xa, ya, za), G(xb, yb, zb), G(xb, bottom, zb), G(xa, bottom, za)]
                uvs = [(s0 / 4, ya / 2), (s1 / 4, yb / 2), (s1 / 4, bottom / 2), (s0 / 4, bottom / 2)]
                if (zb - za) * ox - (xb - xa) * oz < 0:  # it faces (dz, -dx), as the board's cut faces
                    corners, uvs = corners[::-1], uvs[::-1]
                quad(bm, uv, corners, uvs)
            for s0, xa, ya, za, ox, oz in run:
                if round(s0 / step) % 4 == 0 and ya - GROUND_Y > 1.5:
                    cx, cz = xa + ox * 0.18, za + oz * 0.18
                    faces = kit.bevelled_box(bm, (0, 0, 0), (0.8, 0.36, ya - GROUND_Y + 0.3), bevel=0.04, segments=1)
                    verts = list({v for f in faces for v in f.verts})
                    heading = math.atan2(ox, oz)
                    bmesh.ops.transform(bm, matrix=Matrix.Translation(G(cx, (ya + GROUND_Y - 0.3) / 2, cz))
                                        @ Matrix.Rotation(heading, 4, "Z"), verts=verts)
                    bmesh.ops.recalc_face_normals(bm, faces=faces)  # a closed box: outward is plain
                    for f in faces:
                        for loop in f.loops:
                            co = loop.vert.co
                            loop[uv].uv = ((co.x + co.y) / 4, co.z / 2)
            run = []
    return bm


def section_samples(section):
    """The greybox's samples of one section's road, as build_happy_valley.py takes them: about every 5 m, and twice
    at each of the Library's steps (the height just before and at it)."""
    a, b = starts[section], ends[section]
    n = math.ceil((b - a) / 5)
    sample_s = sorted(set([a, b] + [a + (b - a) * i / n for i in range(1, n)] + [q for q in steps if a < q < b]))
    samples = []
    for s in sample_s:
        if s in steps:
            samples.append((s, height(s - .001)))
        samples.append((s, height(s)))
    return samples


def ribbon_point(s, h, side, up):
    """A point of the greybox's road ribbon (its xyz, with the sample's own height), map coordinates"""
    x, z = center(s)
    tx, tz = tangent(s)
    return (x + tz * side, h + bank(s) * side + up, z - tx * side)


def along(samples, s, side, up):
    """A point at s on the greybox's chords between its samples (not on the true curve, which the chords cut)"""
    for (sa, ha), (sb, hb) in zip(samples, samples[1:]):
        if sa <= s <= sb and sb > sa:
            t = (s - sa) / (sb - sa)
            pa, pb = ribbon_point(sa, ha, side, up), ribbon_point(sb, hb, side, up)
            return tuple(pa[k] + (pb[k] - pa[k]) * t for k in range(3))
    sa, ha = samples[-1] if s >= samples[-1][0] else samples[0]
    return ribbon_point(sa, ha, side, up)


def road():
    """The road's surface, one mesh per section, kerbs and the start line. Returns {name: (bmesh, kind)}."""
    out = {}
    kerbs = bmesh.new()
    kuv = kerbs.loops.layers.uv.new()
    for section, name in enumerate(SECTIONS):
        samples = section_samples(section)
        bm = bmesh.new()
        uv = bm.loops.layers.uv.new()
        for (sa, ha), (sb, hb) in zip(samples, samples[1:]):
            l0, l1 = ribbon_point(sa, ha, -ASPHALT, ROAD_LIFT), ribbon_point(sb, hb, -ASPHALT, ROAD_LIFT)
            r0, r1 = ribbon_point(sa, ha, ASPHALT, ROAD_LIFT), ribbon_point(sb, hb, ASPHALT, ROAD_LIFT)
            # +side is the road's left (x + tz * side): l0, l1, r1, r0 winds counter-clockwise from above
            quad(bm, uv, [G(*l0), G(*l1), G(*r1), G(*r0)], [(0, sa / TILE), (0, sb / TILE), (1, sb / TILE), (1, sa / TILE)])
        out[f"road_{name}"] = (bm, name)
        # kerbs: blocks of KERB_BLOCK m, the section's color and white, sloping up to the rail
        color = ROAD_LOOK[name][0]
        a, b = starts[section], ends[section]
        blocks = max(1, round((b - a) / KERB_BLOCK))
        cuts = sorted(set([a + (b - a) * i / blocks for i in range(blocks + 1)] + [s for s, _ in samples]))
        for sa, sb in zip(cuts, cuts[1:]):
            if sb - sa < 1e-4:
                continue
            block = min(int(((sa + sb) / 2 - a) / ((b - a) / blocks)), blocks - 1)
            swatch = kit.swatch_uv(color if block % 2 == 0 else "white")
            for side in (-1, 1):
                inner, outer = side * ASPHALT, side * (WIDTH_HALF - 0.01)
                pts = [along(samples, sa, inner, ROAD_LIFT + 0.005), along(samples, sb, inner, ROAD_LIFT + 0.005),
                       along(samples, sb, outer, ROAD_LIFT + 0.07), along(samples, sa, outer, ROAD_LIFT + 0.07)]
                if side < 0:
                    pts = pts[::-1]
                quad(kerbs, kuv, [G(*p) for p in pts], [swatch] * 4)
    out["kerbs"] = (kerbs, "palette")
    # the start line: a checkered band across the asphalt at s = 0
    line = bmesh.new()
    luv = line.loops.layers.uv.new()
    samples = section_samples(0)
    pts = [along(samples, 0.0, -ASPHALT, ROAD_LIFT + 0.006), along(samples, 1.2, -ASPHALT, ROAD_LIFT + 0.006),
           along(samples, 1.2, ASPHALT, ROAD_LIFT + 0.006), along(samples, 0.0, ASPHALT, ROAD_LIFT + 0.006)]
    face = quad(line, luv, [G(*p) for p in pts], [(0, 0)] * 4)
    kit.checker(line, [face], axis_u=0, axis_v=1, cells_u=14, cells_v=2)
    out["start_line"] = (line, "palette")
    return out


def route_points():
    return np.array([center(s) for s in np.arange(0, length, 2.0)])


def hills(rng):
    """Rolling hills in the outer band: rising from nothing 55 m from the road to 6-16 m, never over a landmark,
    Mount Nittany or a void. Returns the mesh and spots for trees (x, y, z)."""
    pts = route_points()
    step = 8.0
    xs = np.arange(X0, X1 + 0.1, step)
    zs = np.arange(Z0, Z1 + 0.1, step)
    gx, gz = np.meshgrid(xs, zs)
    d = np.full(gx.shape, np.inf)
    for px, pz in pts:
        d = np.minimum(d, np.hypot(gx - px, gz - pz))
    rise = np.clip((d - 55) / 45, 0, 1)
    rise = rise * rise * (3 - 2 * rise)
    for (cx, cz), r in LANDMARKS:
        near = np.clip((np.hypot(gx - cx, gz - cz) - r) / 30, 0, 1)
        rise = np.minimum(rise, near)
    nx0, nz0, nx1, nz1 = NITTANY
    inside_n = (gx > nx0) & (gx < nx1) & (gz > nz0) & (gz < nz1)
    rise[inside_n] = 0
    edge = np.minimum.reduce([gx - X0, X1 - gx, gz - Z0, Z1 - gz])
    rise = rise * np.clip(edge / 24, 0, 1)  # back down to the board's edge, so the cut face stays straight
    wave = (np.sin(gx / 37 + 1.1) * np.cos(gz / 29) + 0.6 * np.sin(gx / 17 - gz / 23 + 2.2) + 1.6) / 3.2
    height = rise * (6 + 10 * wave)
    for i in range(height.shape[0]):
        for j in range(height.shape[1]):
            if not (0 <= int((gz[i, j] - Z0) // CELL) < ROWS and 0 <= int((gx[i, j] - X0) // CELL) < COLS):
                continue
            r, c = int((gz[i, j] - Z0) // CELL), int((gx[i, j] - X0) // CELL)
            near_void = any(not SOLID[rr][cc] for rr in range(max(0, r - 3), min(ROWS, r + 4))
                            for cc in range(max(0, c - 3), min(COLS, c + 4)))
            if near_void:
                height[i, j] = 0
    bm = bmesh.new()
    uv = bm.loops.layers.uv.new()
    tile = 16.0
    verts = {}
    trees = []
    for i in range(len(zs) - 1):
        for j in range(len(xs) - 1):
            hs = [height[i, j], height[i, j + 1], height[i + 1, j + 1], height[i + 1, j]]
            if min(hs) < 0.05:
                continue
            # counter-clockwise from above, so the faces look up
            corners = [(xs[j], zs[i]), (xs[j], zs[i + 1]), (xs[j + 1], zs[i + 1]), (xs[j + 1], zs[i])]
            vs = []
            for (x, z), h in zip(corners, [hs[0], hs[3], hs[2], hs[1]]):
                key = (round(x, 2), round(z, 2))
                if key not in verts:
                    verts[key] = bm.verts.new(G(x, GROUND_Y + 0.04 + h, z))
                vs.append(verts[key])
            f = bm.faces.new(vs)
            for loop in f.loops:
                co = loop.vert.co
                loop[uv].uv = (co.x / tile, co.y / tile)
            if min(hs) > 1.5 and rng.random() < 0.28:
                x = xs[j] + rng.uniform(1, 7)
                z = zs[i] + rng.uniform(1, 7)
                trees.append((x, GROUND_Y + min(hs) + 0.02, z))
    bm.normal_update()
    return bm, trees


def facade_box(bm, colors, x, y, z, along_x, size, depth, color):
    """A box set into a wall: along_x means the wall runs along map x (it faces ±z). size: (width, height)"""
    w, h = size
    dims = (w, depth, h) if along_x else (depth, w, h)
    for f in kit.bevelled_box(bm, G(x, y, z), dims, bevel=0):  # too small to show a bevel: keep them cheap
        colors[f] = color


def windows(bm, colors, block, y0, y1, glass="sky", frame="white", size=(1.4, 1.7), step=3.0, rows=3.2):
    """Rows of framed windows on all four walls of a block (cx, cz, w, h, d), from y0 up to y1"""
    cx, cz, w, _, d = block
    for wall in range(4):
        along_x = wall >= 2
        length = w if along_x else d
        n = max(1, int(length // step))
        y = y0 + size[1] / 2
        while y + size[1] / 2 < y1:
            for i in range(n):
                t = (i + 0.5) / n * length - length / 2
                out = (d / 2 if along_x else w / 2) + 0.15
                sign = 1 if wall % 2 == 0 else -1
                x, z = (cx + t, cz + sign * out) if along_x else (cx + sign * out, cz + t)
                facade_box(bm, colors, x, y, z, along_x, (size[0] + 0.2, size[1] + 0.2), 0.1, frame)
                gx, gz = (x, z + sign * 0.05) if along_x else (x + sign * 0.05, z)
                facade_box(bm, colors, gx, y, gz, along_x, size, 0.08, glass)
            y += rows


def block(bm, colors, cx, cz, w, h, d, wall, roof="limestone"):
    """A building body a little bigger than the greybox block it hides, with a parapet on top"""
    for f in kit.bevelled_box(bm, G(cx, (GROUND_Y + h) / 2 + 0.06, cz), (w + 0.3, d + 0.3, h - GROUND_Y + 0.12),
                              bevel=0.06, segments=1):
        colors[f] = wall
    for f in kit.bevelled_box(bm, G(cx, h + 0.25, cz), (w + 0.6, d + 0.6, 0.35), bevel=0.05, segments=1):
        colors[f] = roof


def buildings():
    """The HUB (limestone and a glass band under a navy roof) and the College Ave storefronts (brick, cream and
    maple, with striped awnings over shop windows). One mesh, on the kit's palette."""
    bm = bmesh.new()
    colors = {}
    cx, cz, w, h, d = HUB
    block(bm, colors, cx, cz, w, h, d, "limestone", "navy")
    windows(bm, colors, HUB, 0.6, 3.4, glass="ink", frame="navy", size=(2.0, 2.4), step=3.4)  # the lobby
    windows(bm, colors, HUB, 4.2, h, glass="sky", frame="white", size=(2.4, 2.2), step=3.0, rows=2.9)
    for i, (sx, sz, sw, sh, sd, wall) in enumerate(STOREFRONTS):
        block(bm, colors, sx, sz, sw, sh, sd, wall, "white" if wall != "vanilla" else "brick")
        windows(bm, colors, (sx, sz, sw, sh, sd), 0.4, 2.9, glass="ink", frame="white", size=(2.6, 2.2), step=3.6)
        windows(bm, colors, (sx, sz, sw, sh, sd), 4.0, sh - 0.4, size=(1.2, 1.6), step=2.6)
        stripe = ("navy", "gold", "stop")[i]
        for wall_i in range(4):  # awnings: stripes 0.5 m wide, sticking out over the shop windows
            along_x = wall_i >= 2
            length = sw if along_x else sd
            sign = 1 if wall_i % 2 == 0 else -1
            out = (sd / 2 if along_x else sw / 2) + 0.75
            for k in range(int(length / 0.5) - 2):
                t = (k + 1.5) * 0.5 - length / 2
                x, z = (sx + t, sz + sign * out) if along_x else (sx + sign * out, sz + t)
                facade_box(bm, colors, x, 3.15, z, along_x, (0.5, 0.14), 1.3, stripe if k % 2 == 0 else "white")
    return bm, colors


def snow_drifts():
    """Rounded drifts over the Arboretum's snowbank blocks: six squashed puffs each, big enough to bury the block"""
    bm = bmesh.new()
    colors = {}
    rng = random.Random(5)
    for cx, cz in SNOWBANKS:
        for ox in (-5, 0, 5):
            for oz in (-2.5, 2.5):
                r = 5.2 + rng.uniform(0, 0.4)
                for f in kit.blob(bm, G(cx + ox + rng.uniform(-0.4, 0.4), 0, cz + oz), r, squash=0.55, subdivisions=2):
                    colors[f] = "ice" if f.normal.z < -0.2 else "snow"
    return bm, colors


def infield_trees(rng):
    """Clumps of trees on the open lawns: between 16 m from the road and the hills' band, off the landmarks, the
    buildings, Mount Nittany and the voids. (x, y, z) of each."""
    pts = route_points()
    keep_off = [((x, z), 16) for x, z, *_ in [HUB, *STOREFRONTS]] + [((x, z), 12) for x, z in SNOWBANKS]
    spots = []
    for x in np.arange(X0 + 10, X1 - 10, 7.0):
        for z in np.arange(Z0 + 10, Z1 - 10, 7.0):
            x1, z1 = x + rng.uniform(-3, 3), z + rng.uniform(-3, 3)
            clump = math.sin(x1 / 23 + 0.7) * math.cos(z1 / 19 - 1.3) + 0.5 * math.sin((x1 + z1) / 11)
            if clump < 0.7:
                continue
            d = np.min(np.hypot(pts[:, 0] - x1, pts[:, 1] - z1))
            if not 16 < d < 58:
                continue
            if any(math.hypot(x1 - cx, z1 - cz) < r for (cx, cz), r in LANDMARKS + keep_off):
                continue
            nx0, nz0, nx1, nz1 = NITTANY
            if nx0 - 10 < x1 < nx1 + 10 and nz0 - 10 < z1 < nz1 + 10:
                continue
            c, r = int((x1 - X0) // CELL), int((z1 - Z0) // CELL)
            if any(not SOLID[rr][cc] for rr in range(max(0, r - 2), min(ROWS, r + 3))
                   for cc in range(max(0, c - 2), min(COLS, c + 3))):
                continue
            spots.append((x1, GROUND_Y, z1))
    return spots


def pine(dark):
    """A chunky cone tree: a bark trunk and three stacked cones, the undersides darker."""
    bm = bmesh.new()
    colors = {f: "bark" for f in kit.cylinder(bm, (0, 0, 0.6), 0.3, 1.2, segments=6, bevel=0.0)}
    for i, (z, r, h) in enumerate(((1.6, 2.0, 2.6), (3.0, 1.6, 2.2), (4.2, 1.1, 1.8))):
        geom = bmesh.ops.create_cone(bm, cap_ends=True, segments=8, radius1=r, radius2=0.05, depth=h)
        bmesh.ops.translate(bm, vec=Vector((0, 0, z + h / 2)), verts=geom["verts"])
        for f in {f for v in geom["verts"] for f in v.link_faces}:
            colors[f] = (dark if f.normal.z < -0.3 else "pine") if f.normal.z < 0.95 else "pine"
    kit.paint(bm, lambda f: colors.get(f, "pine"))
    return bm


def build():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    scene = bpy.context.scene
    scene.name = "World"
    col = bpy.data.collections.new("world")
    scene.collection.children.link(col)
    grass = material("mat_grass", grass_texture(), 0.95)
    soil = material("mat_soil", soil_texture(), 0.95)
    stone = material("mat_stone", stone_texture(), 0.85)
    palette = kit.palette_material()
    asphalt = asphalt_texture()
    rng = random.Random(11)

    top, cut = board()
    for name, bm, mat in (("ground_board", top, grass), ("ground_edges", cut, soil), ("causeways", causeways(), stone)):
        me = bpy.data.meshes.new(name)
        bm.to_mesh(me)
        bm.free()
        me.materials.append(mat)
        col.objects.link(bpy.data.objects.new(name, me))
    for name, (bm, kind) in road().items():
        me = bpy.data.meshes.new(name)
        bm.to_mesh(me)
        bm.free()
        if kind == "palette":
            me.materials.append(palette)
        else:
            _, tint, roughness = ROAD_LOOK[kind]
            me.materials.append(tinted(f"mat_road_{kind}", asphalt, tint, roughness))
        col.objects.link(bpy.data.objects.new(name, me))
    for name, (bm, colors) in (("buildings", buildings()), ("snow_drifts", snow_drifts())):
        kit.paint(bm, lambda f: colors.get(f, "white"))
        bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
        ob = kit.new_object(name, bm, palette)
        if name == "snow_drifts":
            for poly in ob.data.polygons:
                poly.use_smooth = True
        col.objects.link(ob)
    hill_bm, spots = hills(rng)
    spots += infield_trees(rng)
    me = bpy.data.meshes.new("hills")
    hill_bm.to_mesh(me)
    hill_bm.free()
    me.materials.append(grass)
    for poly in me.polygons:
        poly.use_smooth = True
    col.objects.link(bpy.data.objects.new("hills", me))

    # trees on the hills: a few kinds, instanced, turned and scaled a little so they don't look copied
    kinds = []
    for i, bm in enumerate([pine("pine_dark"), kit.lollipop_tree("gold", "gold_dark", 5.6, 0.07),
                            kit.lollipop_tree("maple", "maple_dark", 4.8, -0.1), pine("pine_dark")]):
        me = bpy.data.meshes.new(f"tree_{i}")
        bm.to_mesh(me)
        bm.free()
        me.materials.append(palette)
        kinds.append(me)
    for n, (x, y, z) in enumerate(spots):
        ob = bpy.data.objects.new(f"tree_{n:03d}", kinds[n % len(kinds)])
        s = rng.uniform(0.85, 1.35)
        ob.matrix_world = Matrix.Translation(G(x, y, z)) @ Matrix.Rotation(rng.uniform(0, 6.28), 4, "Z") @ Matrix.Scale(s, 4)
        col.objects.link(ob)

    OUT.mkdir(parents=True, exist_ok=True)
    bpy.ops.export_scene.gltf(filepath=str(OUT / "happy_valley_world.glb"), export_format="GLB", collection=col.name,
                              export_yup=True, export_extras=False, export_animations=False, export_cameras=False,
                              export_lights=False, export_apply=True)
    bpy.ops.wm.save_as_mainfile(filepath=str(OUT / "world.blend"), compress=True)
    tri = lambda me: sum(len(p.vertices) - 2 for p in me.polygons)
    print({"cells": [COLS, ROWS], "trees": len(spots),
           "triangles": {me.name: tri(me) for me in bpy.data.meshes if me.users}, "out": str(OUT)})


build()
