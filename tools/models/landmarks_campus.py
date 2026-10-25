"""The campus landmarks a ball races past (M3 art pass): Old Main, Pattee Library, the Lion Shrine and the Creamery.

build_landmarks.py loads this file (handing it the dressing kit module as `kit`) and builds these into the same layer as
Beaver Stadium and Mount Nittany, maps/happy_valley_landmarks.glb, on the same palette. Each one stands where its
greybox boxes were in tools/track/build_happy_valley.py. Those boxes are merged into Ali's batches, so they can't be
hidden by name: the game cuts them out of the map when this layer loads (CARVED in apps/web/src/game/landmarks.ts).

Visual only: the collision map doesn't change. A check at the end fails the build if anything here intersects the road,
a rail, the jump or the tunnel, or comes within CLEAR m of them. The one exception is the Creamery's waffle skirt, which
fills the gap under the raised road on purpose and only has to stay out of it.

  - Old Main faces the grid and College Ave: six columns under a blank attic, three floors of deep window insets, a
    slate hip roof with dormers, and the bell tower in the dead center: clock stage (the clocks read 4:00, the art
    bible's hour), open belfry with a brass bell, dome, lantern and spike. On its lawn, with a path down the middle.
  - Pattee Library faces the library steps: a wide limestone base, a tall center block with five tall windows, four
    giant piers where the greybox columns stood, and gold-leaf doors and spandrels. Stepped cheek walls flank the road
    steps (each riser in gold, in step with the road's), with book-stack sculptures at the ends.
  - The Lion Shrine: an original mountain lion (no mane: the Nittany Lion is a cougar), stalking along a slanted rock
    slab, a paw raised, head turned to the hairpin, golden eyes, white muzzle and ink nose; sandy against dark pines.
  - The Creamery: brick with limestone trim, a striped awning, a raised patio with blue and white umbrellas, and the
    giant waffle cone (two scoops, sprinkles, a cherry) in its stand. The raised road over the cone run gets a waffle
    skirt with melting vanilla along the top.
  - The greybox trees that float over the ground near these get something to stand on: rock outcrops at the shrine, a
    planter at the library, waffle-cone planters on the Creamery run.
"""

import math
import random

import bpy  # first: the bpy module from PyPI only provides bmesh once bpy is loaded
import bmesh
from mathutils import Matrix, Vector
from mathutils.bvhtree import BVHTree

kit = globals()["kit"]  # the dressing kit module, handed over by build_landmarks.py (palette, helpers)

ROOT = kit.ROOT
COLLISION = ROOT / "packages" / "game-core" / "tracks" / "happy_valley_col.glb"
GREYBOX = kit.GREYBOX

kit.PALETTE.update({  # after the kit's own colors and the stadium's, so their swatches don't move
    "slate": "#5B6272",  # Old Main's and the library's roofs (mood board: grey slate)
    "rock": "#A99F8A", "rock_dark": "#857B68",  # the Lion Shrine's slab and outcrops
    "waffle": "#D9A05B", "waffle_dark": "#A9733A",  # the giant cone and the cone run
    "strawberry": "#F4A3B8",
})

CLEAR = 0.25  # m: the least room between anything here and the road, rails, jump or tunnel
BUDGETS = {"lm_old_main": 25000, "lm_lion_shrine": 8000, "lm_creamery": 15000, "lm_pattee_library": 12000}
UP = Vector((0, 1, 0))


def G(x, y, z):
    """Game coordinates (y up, z south) to Blender's (z up). Works for points and directions."""
    return Vector((x, -z, y))


def from_blender(p):
    return Vector((p.x, p.z, -p.y))


def frame(origin, u, w, keep="u"):
    """Blender matrix taking local x to the game direction u, local z to w and local y to w x u, at origin. The axis
    named by keep stays exact; the other is squared to it."""
    u, w = Vector(u).normalized(), Vector(w).normalized()
    if keep == "u":
        w = (w - w.project(u)).normalized()
    else:
        u = (u - u.project(w)).normalized()
    v = w.cross(u)
    gu, gv, gw, o = G(*u), G(*v), G(*w), G(*origin)
    return Matrix(((gu.x, gv.x, gw.x, o.x), (gu.y, gv.y, gw.y, o.y), (gu.z, gv.z, gw.z, o.z), (0, 0, 0, 1)))


def join_rings(bm, a, b):
    """Faces between two rings of verts (a ring of one vert is a point)."""
    if len(a) == 1:
        return [bm.faces.new((a[0], b[(i + 1) % len(b)], b[i])) for i in range(len(b))]
    if len(b) == 1:
        return [bm.faces.new((a[i], a[(i + 1) % len(a)], b[0])) for i in range(len(a))]
    n = len(a)
    return [bm.faces.new((a[i], a[(i + 1) % n], b[(i + 1) % n], b[i])) for i in range(n)]


def superellipse(center, u, v, ru, rv_top, rv_bottom, n=12, power=2.6):
    """A ring of points round center in the plane of the game directions u and v: a rounded box (power > 2), with its
    own half-height above and below."""
    pts = []
    for i in range(n):
        a = 2 * math.pi * i / n
        c, s = math.cos(a), math.sin(a)
        x = math.copysign(abs(c) ** (2 / power), c) * ru
        y = math.copysign(abs(s) ** (2 / power), s) * (rv_top if s > 0 else rv_bottom)
        pts.append(Vector(center) + Vector(u) * x + Vector(v) * y)
    return pts


class Model:
    """One landmark's mesh, built in game coordinates. Every piece gets a palette color, or a function of the face that
    runs once the normals are final; they're painted on in finish()."""

    def __init__(self, name):
        self.name = name
        self.bm = bmesh.new()
        self.colors = {}

    def tint(self, faces, color):
        for f in faces:
            self.colors[f] = color
        return faces

    def place(self, faces, matrix):
        bmesh.ops.transform(self.bm, matrix=matrix, verts=list({v for f in faces for v in f.verts}))
        return faces

    def box(self, center, size, color, bevel=0.04, segments=2):
        """An axis-aligned box: center and size as game (x, y, z)."""
        faces = kit.bevelled_box(self.bm, G(*center), (size[0], size[2], size[1]), bevel=bevel, segments=segments)
        return self.tint(faces, color)

    def obox(self, center, u, w, size, color, bevel=0.04, segments=2):
        """A box turned to the game directions u (its length, size[0]) and w (its height, size[2])."""
        faces = kit.bevelled_box(self.bm, (0, 0, 0), size, bevel=bevel, segments=segments)
        return self.tint(self.place(faces, frame(center, u, w)), color)

    def cyl(self, base, radius, height, color, segments=12, top=None, bevel=0.03, axis=(0, 1, 0), turn=0.0):
        """A cylinder standing on base along a game direction; a cone frustum with a top radius."""
        before = set(self.bm.faces)
        top = radius if top is None else top
        verts = bmesh.ops.create_cone(self.bm, cap_ends=True, segments=segments, radius1=radius, radius2=top,
                                      depth=height)["verts"]
        bmesh.ops.transform(self.bm, matrix=Matrix.Translation((0, 0, height / 2)) @ Matrix.Rotation(turn, 4, "Z"),
                            verts=verts)
        if bevel and top > 0.05:
            ends = {e for v in verts for e in v.link_edges
                    if all(abs(w.co.z) < 1e-4 or abs(w.co.z - height) < 1e-4 for w in e.verts)
                    and abs(e.verts[0].co.z - e.verts[1].co.z) < 1e-4}
            bmesh.ops.bevel(self.bm, geom=list(ends), offset=bevel, segments=1, affect="EDGES", profile=0.5)
        faces = [f for f in self.bm.faces if f not in before]
        axis = Vector(axis)
        hint = Vector((1, 0, 0)) if abs(axis.x) < 0.9 else Vector((0, 0, 1))
        return self.tint(self.place(faces, frame(base, hint, axis, keep="w")), color)

    def ellipsoid(self, center, radii, color, subdivisions=2):
        before = set(self.bm.faces)
        verts = bmesh.ops.create_icosphere(self.bm, subdivisions=subdivisions, radius=1.0)["verts"]
        bmesh.ops.scale(self.bm, vec=Vector((radii[0], radii[2], radii[1])), verts=verts)
        bmesh.ops.translate(self.bm, vec=G(*center), verts=verts)
        return self.tint([f for f in self.bm.faces if f not in before], color)

    def lathe(self, base, profile, color, segments=16, turn=0.0):
        """A solid of revolution round the vertical through base: profile [(radius, height)] from the bottom up. A
        radius of 0 closes that end to a point; otherwise the end is capped flat."""
        rings = []
        for r, y in profile:
            if r < 1e-6:
                rings.append([self.bm.verts.new(G(base[0], base[1] + y, base[2]))])
                continue
            rings.append([self.bm.verts.new(G(base[0] + r * math.cos(turn + 2 * math.pi * i / segments), base[1] + y,
                                               base[2] + r * math.sin(turn + 2 * math.pi * i / segments)))
                          for i in range(segments)])
        faces = [f for a, b in zip(rings, rings[1:]) for f in join_rings(self.bm, a, b)]
        faces += [self.bm.faces.new(ring) for ring in (rings[0], rings[-1]) if len(ring) > 2]
        return self.tint(faces, color)

    def loft(self, rings, color):
        """A tube through rings of game points (all the same count), capped at both ends."""
        verts = [[self.bm.verts.new(G(*p)) for p in ring] for ring in rings]
        faces = [f for a, b in zip(verts, verts[1:]) for f in join_rings(self.bm, a, b)]
        faces += [self.bm.faces.new(verts[0]), self.bm.faces.new(verts[-1])]
        return self.tint(faces, color)

    def prism(self, outline, origin, u, v, depth, color):
        """A 2D outline [(a, b)] drawn on the plane origin + a u + b v, pushed depth along u x v."""
        o, u, v = Vector(origin), Vector(u), Vector(v)
        n = u.cross(v).normalized() * depth
        front = [self.bm.verts.new(G(*(o + u * a + v * b))) for a, b in outline]
        back = [self.bm.verts.new(G(*(o + u * a + v * b + n))) for a, b in outline]
        k = len(outline)
        faces = [self.bm.faces.new(front), self.bm.faces.new(back[::-1])]
        faces += [self.bm.faces.new((front[i], front[(i + 1) % k], back[(i + 1) % k], back[i])) for i in range(k)]
        return self.tint(faces, color)

    def merge(self, other, matrix):
        """Adds a painted kit prop (its own UVs), moved by a Blender matrix."""
        bmesh.ops.transform(other, matrix=matrix, verts=other.verts)
        me = bpy.data.meshes.new("tmp")
        other.to_mesh(me)
        other.free()
        self.bm.from_mesh(me)
        bpy.data.meshes.remove(me)

    def triangles(self):
        return sum(len(f.verts) - 2 for f in self.bm.faces)

    def finish(self, mat, collection, parent):
        bmesh.ops.recalc_face_normals(self.bm, faces=self.bm.faces)
        uv = self.bm.loops.layers.uv.verify()
        for f, color in self.colors.items():
            if not f.is_valid:
                continue
            u, v = kit.swatch_uv(color(f) if callable(color) else color)
            for loop in f.loops:
                loop[uv].uv = (u, v)
        ob = kit.new_object(self.name, self.bm, mat)
        ob.parent = parent
        collection.objects.link(ob)
        return ob


def up(f):
    """How much a face points up (game y)"""
    return f.normal.z


def by_normal(top, side, under=None):
    """A color function: top faces one color, the rest another (and the undersides a third)."""
    return lambda f: top if up(f) > 0.6 else (under if under and up(f) < -0.6 else side)


# ------------------------------------------------------------------ shared pieces

def wall(m, plane, side, span, rise, openings, color, glass="navy", sill="paper", depth=0.4, thick=0.7):
    """A flat wall with deep window insets (the art bible: insets catch the shadow, so no window textures).
    plane: ("x", x) for a wall facing +x or -x, ("z", z) for one facing +z or -z; side: +1 or -1, the way it faces.
    span: (u0, u1) along the wall (z for an x wall, x for a z wall); rise: (y0, y1). openings: (u0, u1, y0, y1) or
    (u0, u1, y0, y1, pane color). The wall is cut into the cells of a grid through the openings' edges; each opening
    gets a pane `depth` behind the face and a sill under it."""
    axis, at = plane

    def slab(u0, u1, y0, y1, d0, d1, color, bevel=0.0):
        n0, n1 = at - side * d0, at - side * d1
        lo, hi = min(n0, n1), max(n0, n1)
        if axis == "x":
            return m.box(((lo + hi) / 2, (y0 + y1) / 2, (u0 + u1) / 2), (hi - lo, y1 - y0, u1 - u0), color, bevel, 1)
        return m.box(((u0 + u1) / 2, (y0 + y1) / 2, (lo + hi) / 2), (u1 - u0, y1 - y0, hi - lo), color, bevel, 1)

    us = sorted({span[0], span[1], *[o[0] for o in openings], *[o[1] for o in openings]})
    ys = sorted({rise[0], rise[1], *[o[2] for o in openings], *[o[3] for o in openings]})
    for ua, ub in zip(us, us[1:]):
        run = None
        for ya, yb in zip(ys, ys[1:]):
            hole = any(o[0] <= ua and ub <= o[1] and o[2] <= ya and yb <= o[3] for o in openings)
            if hole:
                if run:
                    slab(ua, ub, run[0], run[1], 0, thick, color)
                run = None
            else:
                run = (run[0], yb) if run else (ya, yb)
        if run:
            slab(ua, ub, run[0], run[1], 0, thick, color)
    for o in openings:
        slab(o[0], o[1], o[2], o[3], depth, depth + 0.12, o[4] if len(o) > 4 else glass)
        if sill:
            slab(o[0] - 0.15, o[1] + 0.15, o[2] - 0.22, o[2], -0.16, 0.3, sill)


def hip_roof(m, x0, x1, z0, z1, y0, y1, color="slate"):
    """A hip roof over the rectangle, its ridge along x."""
    h = (z1 - z0) / 2
    zc = (z0 + z1) / 2
    bm = m.bm
    b = [bm.verts.new(G(x, y0, z)) for x, z in ((x0, z0), (x1, z0), (x1, z1), (x0, z1))]
    r0, r1 = bm.verts.new(G(x0 + h, y1, zc)), bm.verts.new(G(x1 - h, y1, zc))
    faces = [bm.faces.new((b[0], b[1], r1, r0)), bm.faces.new((b[1], b[2], r1)), bm.faces.new((b[2], b[3], r0, r1)),
             bm.faces.new((b[3], b[0], r0)), bm.faces.new((b[3], b[2], b[1], b[0]))]
    return m.tint(faces, color)


def rounded_rect(x0, x1, z0, z1, r, steps=4):
    pts = []
    for cx, cz, a0 in ((x1 - r, z0 + r, -90), (x1 - r, z1 - r, 0), (x0 + r, z1 - r, 90), (x0 + r, z0 + r, 180)):
        for i in range(steps + 1):
            a = math.radians(a0 + 90 * i / steps)
            pts.append((cx + r * math.cos(a), cz + r * math.sin(a)))
    return pts


def lawn(m, outline, top, thickness=0.9, bevel=0.35):
    """A turf base board under a landmark (the map has no ground: everything stands on its own toy board), with a
    rounded top edge. outline: [(x, z)], convex, counter-clockwise or not."""
    faces = m.prism(outline, (0, top, 0), (1, 0, 0), (0, 0, 1), thickness, by_normal("lawn", "lawn_dark"))
    top_face = faces[0]
    bmesh.ops.bevel(m.bm, geom=list(top_face.edges), offset=bevel, segments=2, affect="EDGES", profile=0.5)
    for f in m.bm.faces:  # the bevel's new faces
        if f not in m.colors:
            m.colors[f] = by_normal("lawn", "lawn_dark")


def tree(m, x, y, z, crown, shade, height, lean, seed):
    rng = random.Random(seed)
    bm = kit.lollipop_tree(crown, shade, height=height, lean=lean)
    m.merge(bm, Matrix.Translation(G(x, y, z)) @ Matrix.Rotation(rng.uniform(0, 2 * math.pi), 4, "Z"))


def pine(m, x, y, z, height, seed):
    """A chunky low-poly pine: a bark trunk under three stacked cones, the undersides darker."""
    rng = random.Random(seed)
    turn = rng.uniform(0, math.pi)
    m.cyl((x, y, z), 0.32 * height / 9, height * 0.3, "bark", segments=7, bevel=0)
    for i in range(3):
        base = y + height * (0.2 + 0.24 * i)
        r = height * (0.34 - 0.08 * i)
        m.cyl((x, base, z), r, height * (0.42 - 0.04 * i), by_normal("pine", "pine", "pine_dark"), segments=7, top=0,
              bevel=0, turn=turn + i * 0.4)


def waffle_cone(m, x, z, y0, r0, y1, r1, segments=16, bands=None, bump=0.12):
    """A waffle cone between two heights: a diamond lattice of pillow cells, each lit like an embossed square (the
    upper half waffle, the lower half a shade darker). The zigzag top and bottom edges want a rim or a holder over
    them."""
    bands = bands or max(4, round((y1 - y0) / ((math.pi * (r0 + r1) / segments) * 0.5)))
    rings = []
    for i in range(bands + 1):
        t = i / bands
        y, r = y0 + (y1 - y0) * t, r0 + (r1 - r0) * t
        off = 0.5 * (i % 2)
        rings.append([Vector((x + r * math.cos(2 * math.pi * (j + off) / segments), y,
                              z + r * math.sin(2 * math.pi * (j + off) / segments))) for j in range(segments)])
    bm = m.bm
    for i in range(bands - 1):
        for j in range(segments):
            # a diamond: bottom (i, j), right (i+1, j + 1/2), top (i+2, j), left (i+1, j - 1/2)
            right = rings[i + 1][j] if i % 2 == 0 else rings[i + 1][(j + 1) % segments]
            left = rings[i + 1][(j - 1) % segments] if i % 2 == 0 else rings[i + 1][j]
            bottom, top = rings[i][j], rings[i + 2][j]
            c = (bottom + top + left + right) / 4
            out = Vector((c.x - x, 0, c.z - z)).normalized()
            c = c + out * bump
            vs = [bm.verts.new(G(*p)) for p in (bottom, right, top, left, c)]
            b_, r_, t_, l_, c_ = vs
            m.tint([bm.faces.new((r_, t_, c_)), bm.faces.new((t_, l_, c_))], "waffle")
            m.tint([bm.faces.new((b_, r_, c_)), bm.faces.new((l_, b_, c_))], "waffle_dark")
            m.tint([bm.faces.new((b_, l_, t_, r_))], "waffle_dark")  # closes the cell


def books(m, x, y, z, seed, count=5):
    """A stack of chunky books, each a little turned: two covers and a spine in a palette color round a block of
    paper pages set back from their edges, so every side reads as a book."""
    rng = random.Random(seed)
    colors = ["navy", "maple", "go", "stop", "brake", "gold", "gas", "pine"]
    rng.shuffle(colors)
    for i in range(count):
        L, W, H = rng.uniform(2.2, 2.6), rng.uniform(1.6, 1.85), rng.uniform(0.48, 0.62)
        yaw = rng.uniform(-0.35, 0.35) + (0.5 if i % 2 else 0)
        u = Vector((math.cos(yaw), 0, math.sin(yaw)))
        v = UP.cross(u)
        c = Vector((x, y + H / 2, z))
        color = colors[i % len(colors)]
        for dy in (-1, 1):
            m.obox(c + UP * dy * (H / 2 - 0.06), u, UP, (L, W, 0.12), color, bevel=0.04, segments=1)
        m.obox(c - v * (W / 2 - 0.06), u, UP, (L, 0.12, H), color, bevel=0.04, segments=1)
        m.obox(c + v * 0.02, u, UP, (L - 0.14, W - 0.16, H - 0.22), "paper", bevel=0)
        y += H


# ------------------------------------------------------------------ the world they're fitted to

class World:
    """Read from Ali's exports: the route (game x, z every ~4 m), the road (for heights), every collider (for the
    clearance check) and the greybox trees (Kenney tree-large copies merged into one batch)."""

    def __init__(self):
        objects = kit.import_glb(COLLISION)
        route = next(o for o in objects if o.get("rb") == "route")
        p = list(route["points"])
        self.route = [(p[i], p[i + 1]) for i in range(0, len(p), 2)]
        colliders = [o for o in objects if o.type == "MESH" and o.name.endswith("_col")]
        self.colliders = self._bvh(colliders)
        self.road = self._bvh([o for o in colliders if o.name.endswith("_road_col")])
        for o in objects:
            bpy.data.objects.remove(o)
        self.trees = []
        for o in kit.import_glb(GREYBOX):
            if o.type == "MESH" and o.name.startswith("trk_batch_colormap"):
                bm = bmesh.new()
                bm.from_mesh(o.data)
                bm.transform(o.matrix_world)
                bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=1e-4)  # the export splits verts per face
                for part in self._parts(bm):
                    lo = Vector([min(v.co[i] for v in part) for i in range(3)])
                    hi = Vector([max(v.co[i] for v in part) for i in range(3)])
                    if hi.x - lo.x < 1.2 and hi.z - lo.z < 1.6:  # a trunk
                        self.trees.append(((lo.x + hi.x) / 2, lo.z, -(lo.y + hi.y) / 2))
                bm.free()
            bpy.data.objects.remove(o)
        for me in list(bpy.data.meshes):
            if me.users == 0:
                bpy.data.meshes.remove(me)

    @staticmethod
    def _bvh(objects):
        bm = bmesh.new()
        for o in objects:
            me = o.data.copy()
            me.transform(o.matrix_world)
            bm.from_mesh(me)
            bpy.data.meshes.remove(me)
        tree = BVHTree.FromBMesh(bm)
        bm.free()
        return tree

    @staticmethod
    def _parts(bm):
        """Loose parts of a mesh, as lists of verts"""
        seen, parts = set(), []
        for v in bm.verts:
            if v in seen:
                continue
            stack, part = [v], []
            seen.add(v)
            while stack:
                a = stack.pop()
                part.append(a)
                for e in a.link_edges:
                    b = e.other_vert(a)
                    if b not in seen:
                        seen.add(b)
                        stack.append(b)
            parts.append(part)
        return parts

    def distance(self, x, z):
        """From (x, z) to the route's centerline"""
        best = 1e9
        n = len(self.route)
        for i in range(n):
            (ax, az), (bx, bz) = self.route[i], self.route[(i + 1) % n]
            dx, dz = bx - ax, bz - az
            t = max(0.0, min(1.0, ((x - ax) * dx + (z - az) * dz) / (dx * dx + dz * dz)))
            best = min(best, math.hypot(ax + t * dx - x, az + t * dz - z))
        return best

    def height(self, x, z):
        """The road's top at (x, z), or None off the road"""
        hit = self.road.ray_cast(G(x, 60, z), Vector((0, 0, -1)))[0]
        return hit.z if hit else None

    def samples(self, x0, x1, z0, z1, step=2.0):
        """The route through a window, resampled every `step` m: (point, unit tangent, unit right), all game x, z"""
        n = len(self.route)
        out = []
        for i in range(n):
            a, b = Vector(self.route[i]), Vector(self.route[(i + 1) % n])
            d = b - a
            k = max(1, round(d.length / step))
            for j in range(k):
                p = a + d * (j / k)
                if x0 <= p.x <= x1 and z0 <= p.y <= z1:
                    t = d.normalized()
                    out.append((p, t, Vector((-t.y, t.x))))
        return out

    def floating_trees(self, x0, x1, z0, z1, ground=0.0):
        return [t for t in self.trees if x0 <= t[0] <= x1 and z0 <= t[2] <= z1 and t[1] > ground + 0.2]


def limb(path, n=10):
    """Rings for a tube along [(point, radius)]: each ring square to the path, its first axis across (z)."""
    across = Vector((0, 0, 1))
    rings = []
    for i, (c, r) in enumerate(path):
        d = (path[min(i + 1, len(path) - 1)][0] - path[max(i - 1, 0)][0]).normalized()
        rings.append(superellipse(c, across, across.cross(d).normalized(), r, r, r, n=n, power=2.2))
    return rings


def outcrop(m, x, z, top, seed):
    """A faceted rock under a greybox tree that floats, its flat top at the tree's base."""
    rng = random.Random(seed)
    ry = top * 0.55 + 0.4
    faces = m.ellipsoid((x, top - ry, z), (2.2 + rng.uniform(0, 0.5), ry, 2.0 + rng.uniform(0, 0.4)), None, 1)
    for v in {v for f in faces for v in f.verts}:
        if v.co.z > top - 0.15:
            v.co.z = top
        v.co.x += rng.uniform(-0.15, 0.15)
        v.co.y += rng.uniform(-0.15, 0.15)
    m.tint(faces, by_normal("rock", "rock_dark"))


# ------------------------------------------------------------------ Old Main

OLD_MAIN = (-26.45, 18.4)  # the greybox bell tower's center; the building is symmetric about its x


def old_main(world):
    m, brass = Model("old_main"), Model("old_main_brass")
    x0, tz = OLD_MAIN
    W = 16.4  # half width: the east end stays 2.5 m clear of the start straight's rail
    xa, xb = x0 - W, x0 + W
    zf, zb = 9.0, 27.8  # the front faces the grid and College Ave (-z)
    PLINTH, EAVE, CORNICE, RIDGE = 0.9, 10.2, 11.0, 14.2
    floors = [(1.7, 3.6), (4.8, 6.7), (7.9, 9.5)]

    lawn(m, rounded_rect(-51.0, -8.4, -21.0, 36.0, 4.0), 0.06)
    m.box((x0, 0.09, -9.0), (4.2, 0.07, 24.4), "paper", bevel=0.02, segments=1)  # the path to the portico
    m.box((x0, EAVE / 2, (zf + zb) / 2), (2 * W - 1.2, EAVE, zb - zf - 1.2), "limestone", bevel=0)  # core
    m.box((x0, PLINTH / 2, (zf + zb) / 2), (2 * W + 0.4, PLINTH, zb - zf + 0.4), "rock", bevel=0.08, segments=1)

    # walls: three floors of deep insets; behind the portico, three doors between the middle columns
    wing = [x0 + s * d for s in (-1, 1) for d in (9.7, 12.3, 14.9)]
    porch = [x0 + d for d in (-5.2, -2.6, 0, 2.6, 5.2)]
    front = [(x - 0.65, x + 0.65, a, b) for x in wing for a, b in floors]
    front += [(x - 0.65, x + 0.65, a, b) for x in porch for a, b in floors[1:]]
    front += [(x - 0.8, x + 0.8, 1.2, 3.95, "navy") for x in porch[1:4]]
    front += [(x - 0.65, x + 0.65, *floors[0]) for x in (porch[0], porch[4])]
    wall(m, ("z", zf), -1, (xa, xb), (PLINTH, EAVE), front, "limestone")
    back = [(x0 + s * d - 0.65, x0 + s * d + 0.65, a, b) for s in (-1, 1) for d in (1.3, 3.9, 6.5, 9.7, 12.3, 14.9)
            for a, b in floors]
    wall(m, ("z", zb), 1, (xa, xb), (PLINTH, EAVE), back, "limestone")
    sides = [(z - 0.65, z + 0.65, a, b) for z in (10.9, 14.65, 18.4, 22.15, 25.9) for a, b in floors]
    wall(m, ("x", xb), 1, (zf, zb), (PLINTH, EAVE), sides, "limestone")
    wall(m, ("x", xa), -1, (zf, zb), (PLINTH, EAVE), sides, "limestone")
    for x, z in ((xa, zf), (xb, zf), (xa, zb), (xb, zb)):  # corner pilasters
        m.box((x + 0.3 * (1 if x == xa else -1), (PLINTH + EAVE) / 2, z + 0.3 * (1 if z == zf else -1)),
              (1.0, EAVE - PLINTH, 1.0), "paper", bevel=0.06)
    m.box((x0, 4.2, (zf + zb) / 2), (2 * W + 0.24, 0.3, zb - zf + 0.24), "paper", bevel=0.04, segments=1)  # belt
    m.box((x0, EAVE - 0.18, (zf + zb) / 2), (2 * W + 0.3, 0.36, zb - zf + 0.3), "paper", bevel=0.03, segments=1)
    m.box((x0, (EAVE + CORNICE) / 2, (zf + zb) / 2), (2 * W + 0.9, CORNICE - EAVE, zb - zf + 0.9), "navy", bevel=0.1)
    hip_roof(m, xa - 0.15, xb + 0.15, zf - 0.15, zb + 0.15, CORNICE, RIDGE)

    # dormers: chunky blocks on both slopes, and the chimney on the right
    for side, zface in ((-1, zf + 1.4), (1, zb - 1.4)):
        for d in (-13.8, -10.4, 10.4, 13.8):
            xd = x0 + d
            zc = zface - side * 1.2
            m.box((xd, 12.3, zc), (1.9, 2.2, 2.4), "limestone", bevel=0.06)
            wall(m, ("z", zface), side, (xd - 0.95, xd + 0.95), (11.25, 13.4), [(xd - 0.48, xd + 0.48, 11.85, 12.95)],
                 "limestone", thick=0.4, depth=0.25)
            m.prism([(-1.25, 0), (1.25, 0), (0, 0.95)], (xd, 13.4, zface + side * 0.25), (1, 0, 0), (0, 1, 0),
                    -side * 2.9, "slate")
    m.box((x0 + 12.6, 13.0, 22.6), (1.4, 5.0, 1.4), "brick", bevel=0.05)
    m.box((x0 + 12.6, 15.65, 22.6), (1.8, 0.35, 1.8), "paper", bevel=0.05)

    # the portico: three steps, six columns, the entablature, the cornice and a blank attic with two roundels
    for k in range(3):
        zs = 3.2 + 0.6 * k
        m.box((x0, 0.2 + 0.4 * k, (zs + zf + 0.2) / 2), (17.6, 0.4, zf + 0.2 - zs), "paper", bevel=0.05, segments=1)
    for d in (-6.5, -3.9, -1.3, 1.3, 3.9, 6.5):
        x = x0 + d
        m.box((x, 1.4, 5.6), (1.55, 0.4, 1.55), "paper", bevel=0.05)
        m.cyl((x, 1.6, 5.6), 0.66, 7.2, "paper", segments=14, top=0.58)
        m.box((x, 8.975, 5.6), (1.4, 0.35, 1.4), "paper", bevel=0.05)
        m.box((x, 9.3, 5.6), (1.65, 0.3, 1.65), "paper", bevel=0.05)
    m.box((x0, 9.825, 6.875), (16.4, 0.75, 4.25), "limestone", bevel=0.05)
    m.box((x0, 10.6, 6.8), (17.2, 0.8, 5.0), "navy", bevel=0.1)
    m.box((x0, 11.9, 5.95), (16.4, 1.8, 2.4), "limestone", bevel=0.08)
    m.box((x0, 12.95, 5.95), (16.8, 0.3, 2.8), "paper", bevel=0.05)
    for d in (-6.6, 6.6):
        m.cyl((x0 + d, 11.9, 4.75), 0.62, 0.18, "paper", segments=14, axis=(0, 0, -1))
        m.cyl((x0 + d, 11.9, 4.6), 0.34, 0.12, "navy", segments=12, axis=(0, 0, -1))

    # the bell tower: a stack of four parts (mood board): clock stage, open belfry, dome, spike
    h = 4.2
    m.box((x0, 15.0, tz), (8.4, 9.0, 8.4), "limestone", bevel=0.1)
    m.box((x0, 14.6, tz), (8.9, 0.4, 8.9), "navy", bevel=0.05)
    for sx in (-1, 1):
        for sz in (-1, 1):
            m.box((x0 + sx * (h - 0.35), 17.15, tz + sz * (h - 0.35)), (1.0, 4.7, 1.0), "paper", bevel=0.05)
    for n in (Vector((0, 0, -1)), Vector((1, 0, 0)), Vector((0, 0, 1)), Vector((-1, 0, 0))):
        c = Vector((x0, 16.75, tz)) + n * h
        right = (-n).cross(UP)
        m.cyl(c, 1.6, 0.25, "navy", segments=20, axis=n)
        m.cyl(c, 1.35, 0.36, "paper", segments=20, axis=n)
        for angle, length, width in ((120, 0.95, 0.28), (0, 1.2, 0.2)):  # 4:00, the art bible's hour
            d = UP * math.cos(math.radians(angle)) + right * math.sin(math.radians(angle))
            m.obox(c + n * 0.42 + d * (length / 2 - 0.1), d, n, (length, width, 0.1), "navy", bevel=0.03, segments=1)
        m.cyl(c + n * 0.36, 0.17, 0.14, "navy", segments=10, axis=n)
        ledge = c + Vector((0, 1.75, 0))
        m.prism([(-1.95, 0), (1.95, 0), (0, 0.9)], ledge + n * -0.05, UP.cross(n), UP, 0.45, "paper")
        if abs(n.z) > 0.5:
            m.box(ledge + n * 0.2 - UP * 0.1, (4.1, 0.2, 0.5), "navy", bevel=0.03, segments=1)
        else:
            m.box(ledge + n * 0.2 - UP * 0.1, (0.5, 0.2, 4.1), "navy", bevel=0.03, segments=1)
    m.box((x0, 19.8, tz), (9.5, 0.6, 9.5), "navy", bevel=0.08)
    m.box((x0, 20.25, tz), (9.0, 0.3, 9.0), "paper", bevel=0.05)
    for sx in (-1, 1):
        for sz in (-1, 1):
            m.box((x0 + sx * 3.3, 22.525, tz + sz * 3.3), (1.8, 4.25, 1.8), "limestone", bevel=0.08)
            for cx, cz in ((x0 + sx * 3.3, tz + sz * (h + 0.4)), (x0 + sx * (h + 0.4), tz + sz * 3.3)):
                m.box((cx, 20.525, cz), (0.9, 0.25, 0.9), "paper", bevel=0.04, segments=1)
                m.cyl((cx, 20.65, cz), 0.36, 3.7, "paper", segments=10, top=0.32)
                m.box((cx, 24.5, cz), (0.95, 0.3, 0.95), "paper", bevel=0.04, segments=1)
    arch = [(-2.4, 24.65), (-2.4, 22.0)]
    arch += [(2.4 * math.cos(a), 22.0 + 2.4 * math.sin(a)) for a in [math.pi * (1 - i / 12) for i in range(1, 12)]]
    arch += [(2.4, 22.0), (2.4, 24.65)]
    for n in (Vector((0, 0, -1)), Vector((1, 0, 0)), Vector((0, 0, 1)), Vector((-1, 0, 0))):
        m.prism(arch, Vector((x0, 0, tz)) + n * (h - 0.8), UP.cross(n), UP, 0.8, "limestone")
        rail = Vector((x0, 20.85, tz)) + n * (h - 0.25)
        m.box(rail, (4.8, 0.9, 0.5) if abs(n.z) > 0.5 else (0.5, 0.9, 4.8), "paper", bevel=0.05)
    m.box((x0, 24.02, tz), (6.6, 0.45, 0.5), "navy", bevel=0.04)  # the yoke
    m.box((x0, 23.62, tz), (0.35, 0.4, 0.35), "navy", bevel=0.03, segments=1)
    brass.lathe((x0, 21.15, tz), [(1.55, 0), (1.45, 0.25), (1.17, 0.62), (1.03, 1.2), (0.96, 1.7), (0.74, 2.08),
                                  (0.42, 2.27), (0, 2.33)], "gold", segments=18)
    m.box((x0, 24.95, tz), (10.4, 0.6, 10.4), "navy", bevel=0.08)
    m.box((x0, 25.45, tz), (11.0, 0.4, 11.0), "paper", bevel=0.08)
    m.cyl((x0, 25.65, tz), 3.55, 0.7, "paper", segments=8, turn=math.pi / 8)
    m.lathe((x0, 26.35, tz), [(3.25, 0), (3.15, 0.55), (2.85, 1.2), (2.25, 1.85), (1.4, 2.35), (0.6, 2.6), (0, 2.65)],
            "limestone", segments=16)
    m.cyl((x0, 28.85, tz), 0.85, 1.35, "paper", segments=8)
    m.cyl((x0, 29.6, tz), 0.95, 0.25, "navy", segments=8, bevel=0.02)
    m.lathe((x0, 30.2, tz), [(1.05, 0), (0.95, 0.3), (0.6, 0.55), (0, 0.65)], "limestone", segments=10)
    brass.cyl((x0, 30.75, tz), 0.3, 2.2, "gold", segments=8, top=0, bevel=0)
    brass.ellipsoid((x0, 31.3, tz), (0.38, 0.38, 0.38), "gold", 1)

    # fall trees at the lawn's corners (mood board: the first maple and gold trees at the edges)
    for i, (x, z, crown, shade, height, lean) in enumerate((
            (-47.5, -16.5, "maple", "maple_dark", 4.8, -0.1), (-47.5, 31.5, "gold", "gold_dark", 5.6, 0.07),
            (-12.6, 32.5, "maple", "maple_dark", 5.0, 0.08), (-13.0, -16.5, "gold", "gold_dark", 5.4, -0.06))):
        tree(m, x, 0.06, z, crown, shade, height, lean, seed=10 + i)
    return m, brass


# ------------------------------------------------------------------ Pattee Library

PATTEE_PIERS = [232.3, 241.5, 250.7, 259.9]  # where the greybox columns stood (x = -9.2)


def risers(world):
    """Where the road's library steps are: the z of each riser, from the road's own heights"""
    out, last = [], None
    z = 205.0
    while z < 245.0:
        x = min(world.samples(-20, 20, z - 2, z + 2), key=lambda s: abs(s[0].y - z))[0].x
        h = world.height(x, z)
        if last is not None and h is not None and h - last > 0.05:
            out.append(z - 0.025)
        last = h if h is not None else last
        z += 0.05
    return out


def pattee(world):
    m = Model("pattee_library")
    FRONT, BACK, Z0, Z1 = -11.9, -42.4, 222.0, 272.0
    TOP = 11.2
    lawn(m, rounded_rect(-48.5, -7.9, 212.5, 280.0, 4.0), 0.06)
    m.box(((FRONT + BACK) / 2, 6.1, (Z0 + Z1) / 2), (FRONT - BACK - 1.2, 12.2, Z1 - Z0 - 1.2),
          by_normal("slate", "limestone"), bevel=0)  # core, its top the flat roof
    m.box(((FRONT + BACK) / 2, 0.45, (Z0 + Z1) / 2), (FRONT - BACK + 0.4, 0.9, Z1 - Z0 + 0.4), "rock", bevel=0.08,
          segments=1)

    def tall(u, y0=1.6, y1=9.0, w=1.0):
        return (u - w, u + w, y0, y1)

    bays = [236.9, 246.1, 255.3]  # between the piers
    front = [(z - 1.1, z + 1.1, 1.0, 3.9, "gold") for z in bays] + [(z - 1.1, z + 1.1, 4.6, 8.8) for z in bays]
    wings = [224.9, 228.3, 265.0, 268.7]
    front += [tall(z) for z in wings]
    wall(m, ("x", FRONT), 1, (Z0, Z1), (0.9, TOP), front, "limestone")
    side = [tall(x) for x in (-15.6, -20.0, -24.4, -28.8, -33.2, -37.6)]
    wall(m, ("z", Z0), -1, (BACK, FRONT), (0.9, TOP), side, "limestone")
    wall(m, ("z", Z1), 1, (BACK, FRONT), (0.9, TOP), side, "limestone")
    wall(m, ("x", BACK), -1, (Z0, Z1), (0.9, TOP), [tall(z) for z in range(226, 270, 6)], "limestone")
    # gold-leaf spandrels across the tall windows, as in Pattee's metal panels
    for z in wings:
        m.box((FRONT - 0.3, 5.2, z), (0.12, 0.65, 2.0), "gold", bevel=0, segments=1)
    for x in (-15.6, -20.0, -24.4, -28.8, -33.2, -37.6):
        for zf, s in ((Z0, 1), (Z1, -1)):
            m.box((x, 5.2, zf + s * 0.3), (2.0, 0.65, 0.12), "gold", bevel=0, segments=1)
    for z in (222.45, 226.6, 229.95, 263.45, 266.85, 271.55):  # tall flat pilasters on the wings
        m.box((FRONT + 0.12, (0.9 + TOP) / 2, z), (0.25, TOP - 0.9, 0.9), "paper", bevel=0.04)
    m.box(((FRONT + BACK) / 2, 11.6, (Z0 + Z1) / 2), (FRONT - BACK + 0.8, 0.8, Z1 - Z0 + 0.8), "paper", bevel=0.08)
    mid_x, mid_z = (FRONT + BACK) / 2, (Z0 + Z1) / 2
    copings = [(mid_x, Z0 - 0.1, FRONT - BACK + 0.6, 0.6), (mid_x, Z1 + 0.1, FRONT - BACK + 0.6, 0.6),
               (BACK - 0.1, mid_z, 0.6, Z1 - Z0 + 0.6), (FRONT + 0.1, mid_z, 0.6, Z1 - Z0 + 0.6)]
    for x, z, sx, sz in copings:  # the parapet's cap round the roof
        m.box((x, 12.25, z), (sx, 0.5, sz), "limestone", bevel=0.05)

    # the tall center block: five tall windows between flat pilasters, wide blank ends (as on the real one)
    CX0, CX1, CZ0, CZ1 = -37.4, -16.4, 233.0, 261.5
    m.box(((CX0 + CX1) / 2, 15.8, (CZ0 + CZ1) / 2), (CX1 - CX0 - 1.2, 7.6, CZ1 - CZ0 - 1.2),
          by_normal("slate", "limestone"), bevel=0)
    windows = [239.05, 243.15, 247.25, 251.35, 255.45]
    wall(m, ("x", CX1), 1, (CZ0, CZ1), (12.2, 19.0), [(z - 1.1, z + 1.1, 13.0, 18.2) for z in windows], "limestone")
    for zf, s in ((CZ0, -1), (CZ1, 1)):
        m.box(((CX0 + CX1) / 2, 15.6, zf - s * 0.35), (CX1 - CX0, 6.8, 0.7), "limestone", bevel=0.05, segments=1)
    m.box((CX0 + 0.35, 15.6, (CZ0 + CZ1) / 2), (0.7, 6.8, CZ1 - CZ0), "limestone", bevel=0.05, segments=1)
    for z in (233.4, 237.0, 241.1, 245.2, 249.3, 253.4, 257.5, 261.1):
        m.box((CX1 + 0.1, 15.6, z), (0.22, 6.8, 0.8), "paper", bevel=0.04)
    m.box(((CX0 + CX1) / 2, 19.3, (CZ0 + CZ1) / 2), (CX1 - CX0 + 0.6, 0.6, CZ1 - CZ0 + 0.6), "paper", bevel=0.08)
    m.box(((CX0 + CX1) / 2, 19.75, (CZ0 + CZ1) / 2), (CX1 - CX0, 0.35, CZ1 - CZ0), "limestone", bevel=0.05)

    # the podium with steps at both ends, four giant piers, and the beam and cornice over them
    m.box((-9.85, 0.5, 246.25), (4.2, 1.0, 33.3), by_normal("paper", "limestone"), bevel=0.05)
    for s, z in ((-1, 229.6), (1, 262.9)):
        m.box((-9.85, 0.33, z + s * 0.35), (4.2, 0.66, 0.7), by_normal("paper", "limestone"), bevel=0.04, segments=1)
        m.box((-9.85, 0.165, z + s * 1.05), (4.2, 0.33, 0.7), by_normal("paper", "limestone"), bevel=0.04, segments=1)
    for z in PATTEE_PIERS:
        m.box((-9.2, 5.7, z), (2.5, 9.4, 2.5), "limestone", bevel=0.08)
        m.box((-9.2, 1.225, z), (2.9, 0.45, 2.9), "paper", bevel=0.05)
        m.box((-9.2, 10.15, z), (2.9, 0.5, 2.9), "paper", bevel=0.05)
    m.box((-9.875, 10.8, 246.1), (4.15, 0.8, 31.1), "limestone", bevel=0.05)
    m.box((-9.8, 11.6, 246.1), (4.4, 0.8, 31.6), "paper", bevel=0.08)
    m.box((-10.0, 12.225, 246.1), (4.0, 0.45, 31.2), "limestone", bevel=0.05)

    # the steps: cheek walls along the road step up in time with its risers, each riser in gold leaf
    zs = risers(world)
    assert len(zs) == 8, f"expected the greybox's 8 library steps, found {len(zs)}"
    edges = [zs[0] - 3.0] + zs + [zs[-1] + 3.0]
    for side in (1, -1):
        for i, (za, zb) in enumerate(zip(edges, edges[1:])):
            if side < 0 and zb > 228.0:  # the west side meets the podium's steps
                break
            top = 0.75 + 0.2 * i
            m.box((side * 8.5, top / 2, (za + zb) / 2), (1.8, top, zb - za),
                  lambda f: "gold" if f.normal.y > 0.6 else ("paper" if up(f) > 0.6 else "limestone"),
                  bevel=0.05, segments=1)
        m.box((side * 9.3, 0.6, edges[0] - 1.6), (2.2, 1.2, 2.2), "limestone", bevel=0.06)
        books(m, side * 9.3, 1.2, edges[0] - 1.6, seed=20 + side)
    m.box((9.3, 2.6 / 2, edges[-1] + 1.6), (2.2, 2.6, 2.2), "limestone", bevel=0.06)
    books(m, 9.3, 2.6, edges[-1] + 1.6, seed=23, count=4)
    lawn(m, rounded_rect(7.65, 12.6, edges[0] - 3.0, edges[-1] + 3.4, 1.5), 0.06, bevel=0.25)
    books(m, -14.6, 0.06, 214.8, seed=24, count=6)

    for i, (x, z) in enumerate(((-45.5, 216.0), (-45.5, 276.5), (-15.5, 276.5))):
        tree(m, x, 0.06, z, "gold", "gold_dark", 5.4 + 0.3 * i, 0.06 * (-1) ** i, seed=30 + i)
    for x, base, z in world.floating_trees(-12, 20, 205, 280, ground=0.06):  # (west of -12 is inside the library)
        m.box((x, base / 2, z), (2.4, base, 2.4), "limestone", bevel=0.06)  # a planter under it
        m.box((x, base - 0.05, z), (2.0, 0.12, 2.0), "lawn", bevel=0.02, segments=1)
    return m


# ------------------------------------------------------------------ the Lion Shrine

LION = (34.5, 284.05)  # the greybox plinth's center


def lion_shrine(world):
    m = Model("lion_shrine")
    x0, z0 = LION
    PAD = 0.35

    # the lawn fills the hairpin: the inner edge of the road, 7.9 m in from the centerline, closed along the bottom
    inner = []
    for p, t, right in world.samples(-15, 85, 262, 330, step=4.0):
        to_shrine = Vector((x0 - p.x, z0 + 6 - p.y))
        n = right if right.dot(to_shrine) > 0 else -right
        q = p + n * 7.9
        if q.y >= 263 and world.distance(q.x, q.y) >= 7.85:
            inner.append((q.x, q.y))
    inner.sort(key=lambda q: math.atan2(q[1] - (z0 + 2), q[0] - x0))
    lawn(m, inner, PAD)

    # the slab: slanted, higher at the head end, a faceted rock with chipped edges and stones at its foot
    def rock_top(x):
        return 2.3 + (x - 26.5) * 0.05

    rng = random.Random(5)
    bm = bmesh.new()
    bmesh.ops.create_cube(bm, size=1.0)
    bmesh.ops.subdivide_edges(bm, edges=bm.edges[:], cuts=3, use_grid_fill=True)
    for v in bm.verts:
        ux, uz, uy = v.co.x * 2, v.co.y * 2, v.co.z * 2  # each -1..1
        x, z = 35.0 + ux * 8.5, z0 + uz * 4.6
        y = PAD - 0.1 + (rock_top(x) - PAD + 0.1) * (uy + 1) / 2
        if uy > 0.99 and max(abs(ux), abs(uz)) > 0.99:
            y -= rng.uniform(0.25, 0.55)  # chipped along the top edge
        if uy > -0.99:
            x, y, z = x + rng.uniform(-0.25, 0.25), y + rng.uniform(-0.1, 0.1), z + rng.uniform(-0.2, 0.2)
        v.co = G(x, y, z)
    me = bpy.data.meshes.new("tmp")
    bm.to_mesh(me)
    bm.free()
    before = set(m.bm.faces)
    m.bm.from_mesh(me)
    bpy.data.meshes.remove(me)
    m.tint([f for f in m.bm.faces if f not in before],
           lambda f: "rock" if up(f) > 0.55 or f.normal.x - f.normal.y > 0.35 else "rock_dark")
    for x, z, r in ((25.2, z0 - 3.4, 1.2), (44.4, z0 + 3.6, 1.0), (43.6, z0 - 4.4, 0.8), (27.5, z0 + 5.2, 0.75)):
        m.ellipsoid((x, PAD + r * 0.45, z), (r * 1.3, r, r * rng.uniform(0.9, 1.2)),
                    lambda f: "rock" if up(f) > 0.3 else "rock_dark", 1)

    # the lion: an original mountain lion (no mane), stalking along +x, its belly clear of the slab
    across = Vector((0, 0, 1))
    body = [  # x, top and bottom above the slab, half width
        (28.0, 2.7, 0.95, 0.95), (28.8, 3.45, 0.65, 1.5), (30.0, 3.7, 0.6, 1.7), (31.6, 3.45, 0.85, 1.55),
        (33.2, 3.4, 0.9, 1.5), (34.8, 3.6, 0.8, 1.6), (36.4, 4.0, 0.7, 1.75), (37.6, 3.95, 0.62, 1.75),
        (38.8, 3.5, 0.7, 1.55), (39.7, 2.85, 0.95, 1.1)]
    rings = []
    for x, top, bottom, hw in body:
        c = Vector((x, rock_top(x) + (top + bottom) / 2, z0))
        rings.append(superellipse(c, across, UP, hw, (top - bottom) / 2, (top - bottom) / 2))
    m.loft(rings, "vanilla")

    # the head: round, a short broad muzzle in white, held low and forward, turned toward the hairpin (+z)
    turn = math.radians(24)
    f = Vector((math.cos(turn), 0, math.sin(turn)))
    s = UP.cross(f).normalized()
    H = Vector((41.0, rock_top(41.0) + 3.3, z0 + 0.35))
    head = [(-1.15, 0.8, 0.8, 0.8, 0.05), (-0.55, 1.15, 1.0, 0.95, 0.05), (0.15, 1.25, 0.98, 0.98, 0.0),
            (0.75, 1.05, 0.72, 0.9, -0.12), (1.2, 0.78, 0.5, 0.68, -0.3), (1.55, 0.58, 0.36, 0.5, -0.36),
            (1.75, 0.38, 0.24, 0.34, -0.38)]

    def muzzle(face):
        d = from_blender(face.calc_center_median()) - H
        return "white" if d.dot(f) > 0.85 and d.dot(UP) < -0.05 else "vanilla"
    m.loft([superellipse(H + f * t + UP * dy, s, UP, hw, top, bottom, n=12, power=2.4)
            for t, hw, top, bottom, dy in head], muzzle)
    neck = [(Vector((38.4, rock_top(38.4) + 2.55, z0)), 1.25, 1.05),
            (Vector((39.6, rock_top(39.6) + 3.0, z0 + 0.15)), 1.1, 0.95), (H - f * 0.7, 1.0, 0.95)]
    m.loft([superellipse(c, s, UP, hw, r, r) for c, hw, r in neck], "vanilla")
    m.obox(H + f * 1.68 - UP * 0.17, f, UP, (0.32, 0.56, 0.3), "ink", bevel=0.1, segments=2)  # nose
    for side in (-1, 1):
        out = (f * 0.8 + s * side * 0.6).normalized()
        eye = H + f * 0.92 + UP * 0.18 + s * side * 0.58
        m.obox(eye, out, UP, (0.2, 0.54, 0.38), "ink", bevel=0.06, segments=1)  # golden eyes, wide awake
        m.obox(eye + out * 0.04, out, UP, (0.16, 0.42, 0.28), "gold", bevel=0.04, segments=1)
        m.obox(eye + out * 0.07 + s * side * 0.02, out, UP, (0.12, 0.16, 0.26), "ink", bevel=0.03, segments=1)
        m.obox(eye + UP * 0.3 - f * 0.12, out, UP, (0.34, 0.68, 0.2), "vanilla", bevel=0.08, segments=1)  # brow
        ear = H - f * 0.45 + UP * 0.8 + s * side * 0.72
        half_disc = [(0.5 * math.cos(math.pi * i / 8), 0.58 * math.sin(math.pi * i / 8)) for i in range(9)]
        m.prism(half_disc, ear - f * 0.28, s, UP, 0.28, "vanilla")  # round ears: a cougar's, not a dog's
        m.prism([(x * 0.6, y * 0.6 + 0.04) for x, y in half_disc], ear, s, UP, 0.05, "bark")

    # legs: forelegs reaching forward, the near one stepping (stalking); hind legs folded under the haunches
    for side in (-1, 1):
        lift, reach = (0.45, 0.6) if side > 0 else (0.0, 0.0)
        zs = z0 + side * 1.1
        m.loft(limb([(Vector((37.4, rock_top(37.4) + 2.3, zs)), 0.82),
                     (Vector((38.2, rock_top(38.2) + 1.0, zs + side * 0.15)), 0.62),
                     (Vector((40.3 + reach, rock_top(40.3) + 0.45 + lift, zs)), 0.5)]), "vanilla")
        paw = Vector((41.0 + reach, rock_top(41.0) + 0.32 + lift, zs))
        m.obox(paw, Vector((1, 0, 0)), UP, (1.25, 1.0, 0.62), "vanilla", bevel=0.22, segments=2)
        for k in (-1, 0, 1):
            m.ellipsoid(paw + Vector((0.6, -0.08, k * 0.3)), (0.24, 0.24, 0.17), "vanilla", 1)
        m.ellipsoid((30.1, rock_top(30.1) + 2.0, z0 + side * 1.25), (1.6, 1.3, 0.75), "vanilla", 2)  # haunch
        m.loft(limb([(Vector((29.8, rock_top(29.8) + 1.6, z0 + side * 1.45)), 0.6),
                     (Vector((28.9, rock_top(28.9) + 0.48, z0 + side * 1.5)), 0.42)]), "vanilla")
        m.loft(limb([(Vector((28.9, rock_top(28.9) + 0.45, z0 + side * 1.5)), 0.42),
                     (Vector((30.8, rock_top(30.8) + 0.32, z0 + side * 1.5)), 0.38)]), "vanilla")
        m.obox((31.25, rock_top(31.25) + 0.3, z0 + side * 1.5), Vector((1, 0, 0)), UP, (1.1, 0.85, 0.55), "vanilla",
               bevel=0.2, segments=2)
    # the long tail, over the back of the slab and curling on the lawn
    tail = [(28.1, rock_top(28.1) + 2.3, z0 + 0.3), (26.9, rock_top(26.9) + 1.6, z0 + 0.9),
            (26.0, rock_top(26.0) + 0.4, z0 + 1.6), (25.5, PAD + 1.2, z0 + 2.3), (25.3, PAD + 0.5, z0 + 3.1),
            (25.0, PAD + 0.45, z0 + 4.1), (25.6, PAD + 0.7, z0 + 4.9)]
    radii = [0.62, 0.56, 0.52, 0.5, 0.48, 0.47, 0.46]
    rings = []
    for i, (p, r) in enumerate(zip(tail, radii)):
        d = (Vector(tail[min(i + 1, len(tail) - 1)]) - Vector(tail[max(i - 1, 0)])).normalized()
        a = d.cross(UP)
        a = a.normalized() if a.length > 1e-3 else Vector((1, 0, 0))
        rings.append(superellipse(p, a, d.cross(a).normalized(), r, r, r, n=8, power=2.0))
    m.loft(rings, "vanilla")

    # dark evergreens behind (mood board: sandy limestone against pine makes the lion pop), a low hedge in front
    for i, (x, z, height) in enumerate(((16.5, 279.5, 9.5), (19.0, 289.0, 11.0), (17.0, 297.0, 8.5),
                                        (24.0, 299.0, 7.5), (25.5, 271.0, 8.0), (33.5, 269.0, 10.5),
                                        (42.5, 270.0, 8.5), (12.0, 288.5, 7.0))):
        if world.distance(x, z) > 7.9 + height * 0.34 + 0.3:
            pine(m, x, PAD, z, height, seed=40 + i)
    for a in range(-48, 49, 12):
        ang = math.radians(a)
        c = Vector((x0 + 13.0 * math.cos(ang), PAD + 0.5, z0 + 13.0 * math.sin(ang)))
        tangent = Vector((-math.sin(ang), 0, math.cos(ang)))
        m.obox(c, tangent, UP, (2.9, 1.4, 1.15), by_normal("pine", "pine_dark"), bevel=0.35, segments=2)
    for i, (x, z, crown, shade) in enumerate(((13.5, 271.0, "maple", "maple_dark"),
                                              (50.0, 298.0, "gold", "gold_dark"))):
        if world.distance(x, z) > 10.0:
            tree(m, x, PAD, z, crown, shade, 5.0, 0.07 * (-1) ** i, seed=50 + i)

    for i, (x, base, z) in enumerate(world.floating_trees(-15, 85, 262, 330, ground=PAD)):
        outcrop(m, x, z, base, seed=60 + i)
    return m


# ------------------------------------------------------------------ the Creamery

CONE = (132.0, 229.5)  # the giant cone, beside the greybox cone (127.65, 228.85), clear of the building


def creamery(world):
    m = Model("creamery")
    skirt = Model("creamery_waffle_skirt")
    X0, X1, Z0, Z1 = 104.0, 126.0, 224.2, 239.6
    TOP, DECK = 13.2, 4.0
    lawn(m, rounded_rect(100.5, 141.0, 217.3, 248.0, 4.0), 0.06)

    # the building: brick, limestone trim, a pale stone stair tower at the west end (as in the photo)
    m.box(((X0 + X1) / 2, TOP / 2, (Z0 + Z1) / 2), (X1 - X0 - 1.2, TOP, Z1 - Z0 - 1.2), by_normal("rock", "brick"),
          bevel=0)
    m.box(((X0 + X1) / 2, 0.45, (Z0 + Z1) / 2), (X1 - X0 + 0.4, 0.9, Z1 - Z0 + 0.4), "limestone", bevel=0.06,
          segments=1)
    upper = [(9.0, 10.7), (11.4, 12.7)]
    cols = [110.4, 113.6, 116.8, 120.0, 123.2]
    store = [(110.0, 113.3), (114.1, 117.4), (118.2, 121.5), (122.3, 125.2)]
    front = [(a, b, 4.45, 7.4) for a, b in store] + [(x - 0.7, x + 0.7, a, b) for x in cols for a, b in upper]
    wall(m, ("z", Z0), -1, (108.6, X1), (0.9, TOP), front, "brick")
    back = [(x - 0.7, x + 0.7, a, b) for x in (106.4,) + tuple(cols) for a, b in [(1.6, 3.6), (5.0, 7.4)] + upper]
    wall(m, ("z", Z1), 1, (X0, X1), (0.9, TOP), back, "brick")
    east = [(z - 0.7, z + 0.7, a, b) for z in (227.0, 230.6, 234.2, 237.4) for a, b in [(5.0, 7.4)] + upper]
    wall(m, ("x", X1), 1, (Z0, Z1), (0.9, TOP), east, "brick")
    wall(m, ("x", X0), -1, (231.6, Z1), (0.9, TOP), [(z - 0.7, z + 0.7, a, b) for z in (234.2, 237.4)
                                                       for a, b in [(5.0, 7.4)] + upper], "brick")
    m.box(((X0 + X1) / 2, 8.3, (Z0 + Z1) / 2), (X1 - X0 + 0.24, 0.3, Z1 - Z0 + 0.24), "limestone", bevel=0.04,
          segments=1)
    m.box(((X0 + X1) / 2, TOP + 0.35, (Z0 + Z1) / 2), (X1 - X0 + 0.6, 0.7, Z1 - Z0 + 0.6), "limestone", bevel=0.08)
    m.box(((X0 + X1) / 2, TOP + 0.85, (Z0 + Z1) / 2), (X1 - X0, 0.3, Z1 - Z0), "limestone", bevel=0.05)
    m.box((105.95, 8.2, 227.6), (5.3, 16.4, 8.0), "limestone", bevel=0.12)  # the stair tower
    for z in (225.2, 230.0):
        m.box((103.25, 9.0, z), (0.12, 11.5, 0.9), "navy", bevel=0, segments=1)
    m.box((105.95, 16.55, 227.6), (5.7, 0.3, 8.4), "paper", bevel=0.05)
    # the striped awning over the shop front, navy and white
    tilt = math.radians(28)
    u = Vector((0, -math.sin(tilt), -math.cos(tilt)))
    w = Vector((0, math.cos(tilt), -math.sin(tilt)))
    n = 22
    for i in range(n):
        x = 109.6 + (125.6 - 109.6) * (i + 0.5) / n
        m.obox(Vector((x, 8.75, Z0)) + u * 1.0, u, w, (2.1, (125.6 - 109.6) / n + 0.01, 0.12),
               "navy" if i % 2 == 0 else "white", bevel=0.02, segments=1)

    # the raised patio along the road, at the cone run's height: vanilla paving, blue and white umbrellas
    DZ = 216.2
    m.box(((X0 + 126.4) / 2, DECK / 2, (DZ + Z0 + 0.1) / 2), (126.4 - X0, DECK, Z0 + 0.1 - DZ),
          by_normal("vanilla", "brick"), bevel=0.08)
    m.box(((X0 + 126.4) / 2, DECK + 0.25, DZ + 0.3), (126.4 - X0, 0.5, 0.6), "limestone", bevel=0.06)
    for k in range(8):  # steps down at the west end
        m.box((X0 - 0.225 * (k + 1), (DECK - 0.5 * k) / 2, (DZ + 0.6 + Z0) / 2), (0.45 * (k + 1), DECK - 0.5 * k,
              Z0 - DZ - 0.6), by_normal("vanilla", "brick"), bevel=0.03, segments=1)
    for x, z in ((111.8, 219.6), (117.4, 219.8), (123.0, 219.6), (114.6, 222.6)):
        m.cyl((x, DECK, z), 0.75, 0.08, "paper", segments=12, bevel=0)
        m.cyl((x, DECK + 0.08, z), 0.2, 0.7, "navy", segments=8, bevel=0)
        m.cyl((x, DECK, z), 0.12, 3.1, "navy", segments=6, bevel=0)
        m.box((x, DECK + 0.83, z), (1.5, 0.08, 1.5), "paper", bevel=0.02, segments=1)  # table top
        apex = m.bm.verts.new(G(x, DECK + 3.85, z))
        hub = m.bm.verts.new(G(x, DECK + 3.25, z))
        ring = [m.bm.verts.new(G(x + 2.2 * math.cos(math.pi * i / 4), DECK + 2.95, z + 2.2 * math.sin(math.pi * i / 4)))
                for i in range(8)]
        for i in range(8):
            color = "navy" if i % 2 == 0 else "white"
            nxt = ring[(i + 1) % 8]
            m.tint([m.bm.faces.new((ring[i], nxt, apex)), m.bm.faces.new((nxt, ring[i], hub))], color)
        m.ellipsoid((x, DECK + 3.95, z), (0.18, 0.18, 0.18), "navy", 1)

    # the giant cone in its stand: a waffle cone, a vanilla scoop melting over the rim, strawberry, sprinkles, a cherry
    cx, cz = CONE
    m.cyl((cx, 0.06, cz), 3.7, 0.5, "limestone", segments=20, bevel=0.08)
    m.cyl((cx, 0.56, cz), 2.9, 2.1, "navy", segments=20, top=3.3, bevel=0.08)
    waffle_cone(m, cx, cz, 1.6, 1.25, 13.4, 4.6, segments=16)
    m.cyl((cx, 13.05, cz), 4.85, 0.8, "waffle_dark", segments=24, bevel=0.12)
    m.ellipsoid((cx, 16.5, cz), (5.0, 4.4, 5.0), "vanilla", 3)
    rng = random.Random(7)
    for i in range(8):
        a = 2 * math.pi * (i + rng.uniform(-0.2, 0.2)) / 8
        length = rng.uniform(1.4, 2.6)  # melting over the rim, hanging down the waffle
        m.ellipsoid((cx + 4.5 * math.cos(a), 13.5 - length * 0.5, cz + 4.5 * math.sin(a)), (0.72, length * 0.75, 0.72),
                    "vanilla", 2)
    m.ellipsoid((cx, 22.4, cz), (3.8, 3.4, 3.8), "strawberry", 2)
    sprinkle = ["gas", "brake", "flag", "go", "white", "stop"]
    for i in range(20):
        theta = rng.uniform(0, 2 * math.pi)
        phi = rng.uniform(0.15, 1.2)  # from the top
        on_vanilla = i % 3 == 0
        c, rx, ry = (Vector((cx, 16.5, cz)), 5.0, 4.4) if on_vanilla else (Vector((cx, 22.4, cz)), 3.8, 3.4)
        if on_vanilla:
            phi = rng.uniform(1.15, 1.45)
        nrm = Vector((math.sin(phi) * math.cos(theta), math.cos(phi), math.sin(phi) * math.sin(theta)))
        p = c + Vector((nrm.x * rx, nrm.y * ry, nrm.z * rx)) * 0.99
        tangent = nrm.cross(Vector((math.cos(theta + 1.3), 0.4, math.sin(theta + 1.3)))).normalized()
        m.obox(p, tangent, nrm, (0.95, 0.3, 0.3), sprinkle[i % len(sprinkle)], bevel=0)
    m.ellipsoid((cx, 26.55, cz), (0.95, 0.9, 0.95), "stop", 2)
    m.obox((cx + 0.25, 27.7, cz), Vector((0.25, 1, 0)), Vector((0, 0, 1)), (1.1, 0.16, 0.16), "bark", bevel=0.04,
           segments=1)

    # the raised road over the cone run: a waffle skirt under it, vanilla melting along its top
    pts = []
    for p, t, right in world.samples(60, 161, 183, 252, step=2.0):  # the stadium section starts at x 162
        h = world.height(p.x, p.y)
        if h is not None and h > 1.3:
            pts.append((p, t, right, h))
    pts.sort(key=lambda q: q[0].x)
    rng = random.Random(9)
    verts = []
    for p, t, right, h in pts:
        top = h - 1.0  # the road and rails go 0.85 m below its top
        verts.append([skirt.bm.verts.new(G(p.x + right.x * side, y, p.y + right.y * side))
                      for side, y in ((-6.4, 0.0), (6.4, 0.0), (6.4, top), (-6.4, top))])
    faces = [f for a, b in zip(verts, verts[1:]) for f in join_rings(skirt.bm, a, b)]
    faces += [skirt.bm.faces.new(verts[0]), skirt.bm.faces.new(verts[-1][::-1])]
    skirt.tint(faces, "waffle_dark")
    for (pa, _, ra, ha), (pb, _, rb, hb) in zip(pts, pts[1:]):
        for side in (-1, 1):
            a = Vector((pa.x, 0, pa.y)) + Vector((ra.x, 0, ra.y)) * 6.4 * side
            b = Vector((pb.x, 0, pb.y)) + Vector((rb.x, 0, rb.y)) * 6.4 * side
            out = Vector((ra.x, 0, ra.y)) * side
            ta, tb = ha - 1.0, hb - 1.0
            rows = max(1, round(min(ta, tb) / 1.3))
            for r in range(rows):  # one pillow cell per sample and row, about 2 x 1.3 m
                corners = [a + UP * (ta * r / rows), b + UP * (tb * r / rows),
                           b + UP * (tb * (r + 1) / rows), a + UP * (ta * (r + 1) / rows)]
                c = sum(corners, Vector()) / 4 + out * 0.14
                q0, q1, q2, q3, cc = [skirt.bm.verts.new(G(*q)) for q in corners + [c]]
                skirt.tint([skirt.bm.faces.new((q2, q3, cc)), skirt.bm.faces.new((q1, q2, cc))], "waffle")
                skirt.tint([skirt.bm.faces.new((q0, q1, cc)), skirt.bm.faces.new((q3, q0, cc)),
                            skirt.bm.faces.new((q0, q3, q2, q1))], "waffle_dark")
            # melting vanilla along the top: a band with a drip hanging from it
            seg = b - a
            L = seg.length
            u_dir = seg.normalized()
            drip = rng.uniform(0.4, 1.3)
            mid = rng.uniform(0.35, 0.65)

            def top_at(s):
                return ta + (tb - ta) * s / L

            outline = [(0, top_at(0) + 0.02), (L, top_at(L) + 0.02), (L, top_at(L) - 0.5),
                       (L * (mid + 0.14), top_at(L * (mid + 0.14)) - 0.5),
                       (L * (mid + 0.1), top_at(L * mid) - 0.5 - drip),
                       (L * mid, top_at(L * mid) - 0.65 - drip),
                       (L * (mid - 0.1), top_at(L * mid) - 0.5 - drip),
                       (L * (mid - 0.14), top_at(L * (mid - 0.14)) - 0.5), (0, top_at(0) - 0.5)]
            depth = 0.18 if u_dir.cross(UP).dot(out) > 0 else -0.18
            skirt.prism(outline, a, u_dir, UP, depth, "vanilla")

    # waffle-cone planters under the greybox trees that float beside the cone run
    for x, base, z in world.floating_trees(60, 170, 183, 252):
        if X0 - 1 <= x <= 126.4 + 1 and DZ - 1 <= z <= Z0 + 1:
            continue  # on the patio
        r1 = 1.2 + 0.12 * base
        waffle_cone(m, x, z, -0.2, 0.35, base - 0.25, r1, segments=8, bump=0.08)
        m.cyl((x, base - 0.45, z), r1 + 0.18, 0.45, "waffle_dark", segments=12, bevel=0.05)
        m.cyl((x, base - 0.1, z), r1 + 0.02, 0.12, "lawn", segments=12, bevel=0)
    return m, skirt


# ------------------------------------------------------------------ build and check

def brass_material():
    mat = bpy.data.materials.get("mat_brass") or bpy.data.materials.new("mat_brass")
    mat.use_nodes = True
    shader = mat.node_tree.nodes.get("Principled BSDF")
    # Blender's color input is linear, like glTF's, so the sRGB hex is converted
    shader.inputs["Base Color"].default_value = [c ** 2.2 for c in kit.srgb("#E7B04A")] + [1]
    shader.inputs["Metallic"].default_value = 0.8  # the art bible: only real metal toys (the Old Main bell)
    shader.inputs["Roughness"].default_value = 0.35
    return mat


def build_campus(mat, collection):
    """Builds the four landmarks into the collection and checks them; returns stats for the build log."""
    world = World()
    brass = brass_material()
    stats, checks = {}, []
    groups = {
        "lm_old_main": old_main(world),
        "lm_pattee_library": (pattee(world),),
        "lm_lion_shrine": (lion_shrine(world),),
        "lm_creamery": creamery(world),
    }
    for root_name, models in groups.items():
        root = bpy.data.objects.new(root_name, None)
        collection.objects.link(root)
        tris = sum(mo.triangles() for mo in models)
        assert tris <= BUDGETS[root_name], f"{root_name}: {tris} triangles, budget {BUDGETS[root_name]}"
        stats[root_name] = tris
        for mo in models:
            ob = mo.finish(brass if mo.name.endswith("_brass") else mat, collection, root)
            checks.append((ob, mo.name == "creamery_waffle_skirt"))
    bpy.context.view_layer.update()
    for ob, underneath in checks:
        bm = bmesh.new()
        bm.from_mesh(ob.data)
        bm.transform(ob.matrix_world)
        tree = BVHTree.FromBMesh(bm)
        hits = tree.overlap(world.colliders)
        assert not hits, f"{ob.name} intersects the track ({len(hits)} triangle pairs)"
        if not underneath:
            near = min((world.colliders.find_nearest(v.co)[3] for v in bm.verts), default=99)
            assert near >= CLEAR, f"{ob.name} comes {near:.2f} m from the track (needs {CLEAR})"
        bm.free()
    return stats
