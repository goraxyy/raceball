"""Draws the RaceBall particle atlas: apps/web/public/assets/fx/fx_atlas.png.

Original art (MIT with the code), drawn in place of the Kenney Particle Pack picks
so the effects match the art bible: chunky cartoon shapes with clean edges.

The atlas is 512x512: 4 x 4 cells of 128 px, read left to right, top to bottom.
Cells 0-11 are grayscale on transparent. The particle color multiplies them, so the
light middle takes the tint and the darker rim reads as a painted edge. Cells 12-15
are confetti already painted in the livery colors with ink edges (use a white tint),
because one particle system can't pick between distinct colors.

    0 blob      1 cloud     2 puff ring  3 sparkle (4-point star)
    4 star      5 leaf      6 confetti   7 ring
    8 flame     9 splat    10 snowflake 11 streak
   12 orange   13 blue     14 yellow    15 green      (painted confetti)

Particle systems pick cells by ID (startSpriteCellID / endSpriteCellID), so
keep the order. Run: python3 tools/fx/gen_fx_textures.py
"""

import math
from pathlib import Path

from PIL import Image, ImageChops, ImageDraw, ImageFilter

CELL = 128
COLS, ROWS = 4, 4
SS = 4  # supersampling, for smooth edges
OUT = Path(__file__).resolve().parents[2] / "apps/web/public/assets/fx/fx_atlas.png"

BODY = 225  # light middle: takes the tint almost fully
RIM = 150  # painted edge, darker after tinting
SHINE = 255  # small highlight, top left
RIM_W = 5  # rim width in cell pixels


def canvas():
    return Image.new("L", (CELL * SS, CELL * SS), 0)


def circles(draw, items):
    for x, y, r in items:
        draw.ellipse([(x - r) * SS, (y - r) * SS, (x + r) * SS, (y + r) * SS], fill=255)


def polygon(points):
    mask = canvas()
    ImageDraw.Draw(mask).polygon([(x * SS, y * SS) for x, y in points], fill=255)
    return mask


def star_points(cx, cy, n, outer, inner, turn=-math.pi / 2):
    pts = []
    for i in range(n * 2):
        r = outer if i % 2 == 0 else inner
        a = turn + i * math.pi / n
        pts.append((cx + r * math.cos(a), cy + r * math.sin(a)))
    return pts


def shade(mask, rim=True, shine=None):
    """Turns a shape mask into a shaded (gray, alpha) cell."""
    gray = Image.new("L", mask.size, RIM if rim else BODY)
    if rim:
        # round erosion: blur the mask, keep only what stays nearly solid
        inner = mask.filter(ImageFilter.GaussianBlur(RIM_W * SS * 0.45)).point(lambda v: 255 if v > 250 else 0)
        gray.paste(BODY, mask=inner)
    if shine:
        x, y, r = shine
        dot = canvas()
        circles(ImageDraw.Draw(dot), [(x, y, r)])
        gray.paste(SHINE, mask=ImageChops.multiply(dot, mask))
    size = (CELL, CELL)
    return gray.resize(size, Image.LANCZOS), mask.resize(size, Image.LANCZOS)


def blob():
    m = canvas()
    circles(ImageDraw.Draw(m), [(64, 64, 52)])
    return shade(m, shine=(46, 44, 11))


def cloud():
    m = canvas()
    circles(ImageDraw.Draw(m), [(40, 74, 28), (64, 52, 32), (90, 70, 28), (64, 84, 30), (84, 46, 20)])
    return shade(m, shine=(56, 40, 9))


def puff_ring():
    m = canvas()
    d = ImageDraw.Draw(m)
    circles(d, [(64 + 38 * math.cos(a), 64 + 38 * math.sin(a), 21) for a in (i * math.tau / 7 for i in range(7))])
    hole = canvas()
    circles(ImageDraw.Draw(hole), [(64, 64, 15)])
    m = ImageChops.subtract(m, hole)
    return shade(m, shine=(36, 44, 7))


def sparkle():
    # four-point star with concave sides: the classic cartoon "ting"
    pts = []
    for i in range(64):
        a = i * math.tau / 64
        c, s = math.cos(a), math.sin(a)
        r = 58 / (abs(c) ** 0.5 + abs(s) ** 0.5) ** 2  # astroid-like curve
        pts.append((64 + r * c * 1.0, 64 + r * s * 1.0))
    return shade(polygon(pts), rim=False, shine=(64, 64, 9))


def star():
    return shade(polygon(star_points(64, 68, 5, 58, 26)), shine=(54, 52, 8))


def leaf():
    # a pointed leaf, tilted, with a short stem; the midrib is a rim-colored line
    pts = []
    for i in range(41):
        t = i / 40
        pts.append((14 + 100 * t, 64 - 34 * math.sin(math.pi * t) ** 0.8))
    for i in range(40, -1, -1):
        t = i / 40
        pts.append((14 + 100 * t, 64 + 34 * math.sin(math.pi * t) ** 0.8))
    m = polygon(pts)
    d = ImageDraw.Draw(m)
    d.line([(4 * SS, 64 * SS), (20 * SS, 64 * SS)], fill=255, width=6 * SS)
    gray, alpha = shade(m, shine=(46, 54, 6))
    rib = Image.new("L", (CELL * SS, CELL * SS), 0)
    ImageDraw.Draw(rib).line([(18 * SS, 64 * SS), (104 * SS, 64 * SS)], fill=255, width=4 * SS)
    rib = rib.resize((CELL, CELL), Image.LANCZOS)
    gray.paste(RIM, mask=rib)
    return gray.rotate(-35, Image.BICUBIC), alpha.rotate(-35, Image.BICUBIC)


def confetti():
    m = canvas()
    ImageDraw.Draw(m).rounded_rectangle([44 * SS, 30 * SS, 84 * SS, 98 * SS], radius=4 * SS, fill=255)
    return shade(m, rim=False)


def ring():
    # a shockwave ring with a painted edge inside and out, so it reads crisply over anything
    m = canvas()
    d = ImageDraw.Draw(m)
    circles(d, [(64, 64, 58)])
    d.ellipse([(64 - 44) * SS] * 2 + [(64 + 44) * SS] * 2, fill=0)
    return shade(m)


def teardrop(cx, cy, r, length, angle=-math.pi / 2, lean=0.0):
    """A drop: round end of radius r at (cx, cy), tapering to a point `length` away along angle."""
    pts = []
    for i in range(61):
        t = i / 60 * math.tau
        k = (1 - math.cos(t)) / 2  # 0 at the round end, 1 at the tip
        w = r * math.sin(t)
        along = r * (1 - k) * -1 + (length + r) * k ** 1.6 * (0.5 + 0.5 * math.cos(t) ** 2) * 0 + length * k ** 1.3
        sway = lean * length * k ** 2
        x = cx + along * math.cos(angle) - (w * (1 - k ** 2.2) + sway) * math.sin(angle)
        y = cy + along * math.sin(angle) + (w * (1 - k ** 2.2) + sway) * math.cos(angle)
        pts.append((x, y))
    return pts


def flame():
    """A cartoon flame pointing up (code turns it backward): a tall center tongue, two side licks."""
    m = polygon(teardrop(64, 84, 30, 74, lean=0.12))
    for cx, cy, r, length, lean in ((40, 90, 16, 46, -0.25), (88, 92, 15, 40, 0.3)):
        m = ImageChops.lighter(m, polygon(teardrop(cx, cy, r, length, lean=lean)))
    return shade(m, shine=(52, 86, 8))


def splat():
    """Melted ice cream hitting the road: a scalloped blob, round drips flung out, droplets."""
    m = canvas()
    d = ImageDraw.Draw(m)
    lobes = [(64 + 24 * math.cos(k * math.tau / 7 + 0.3), 64 + 24 * math.sin(k * math.tau / 7 + 0.3), 15 if k % 2 else 12) for k in range(7)]
    circles(d, [(64, 64, 27), *lobes])
    for a in (0.95, 3.4, 5.6):  # each drip: a round end out at r 46, tapering back into the blob
        x, y = 64 + 46 * math.cos(a), 64 + 46 * math.sin(a)
        m = ImageChops.lighter(m, polygon(teardrop(x, y, 8, 22, angle=a + math.pi)))
    circles(ImageDraw.Draw(m), [(64 + 57 * math.cos(a), 64 + 57 * math.sin(a), r) for a, r in ((0.2, 5), (2.2, 4.5), (4.4, 5.5))])
    return shade(m, shine=(52, 50, 9))


def snowflake():
    """Six chunky arms with a pair of branches each: readable even when tiny."""
    m = canvas()
    d = ImageDraw.Draw(m)
    w = 9 * SS
    for k in range(6):
        a = k * math.tau / 6 - math.pi / 2
        c, s = math.cos(a), math.sin(a)
        d.line([(64 * SS, 64 * SS), ((64 + 54 * c) * SS, (64 + 54 * s) * SS)], fill=255, width=w)
        for side in (-1, 1):
            b = a + side * 0.75
            bx, by = 64 + 32 * c, 64 + 32 * s
            d.line([(bx * SS, by * SS), ((bx + 20 * math.cos(b)) * SS, (by + 20 * math.sin(b)) * SS)], fill=255, width=w - 2 * SS)
    circles(d, [(64, 64, 13)])
    return shade(m, rim=False)


def streak():
    """A tapered streak for trails: thick and round at the head, thin at the tail."""
    pts = []
    for i in range(41):
        t = i / 40
        pts.append((14 + 100 * t, 64 - 4 - 14 * t ** 1.4))
    for i in range(40, -1, -1):
        t = i / 40
        pts.append((14 + 100 * t, 64 + 4 + 14 * t ** 1.4))
    m = polygon(pts)
    circles(ImageDraw.Draw(m), [(114, 64, 18)])
    return shade(m, rim=False, shine=(106, 56, 5))


# Painted confetti: livery colors (art bible) with an ink edge, so they read on any background
INK = (23, 21, 31)
CONFETTI = [
    ("#F5702A", "strip"),  # gas orange
    ("#7CC3E8", "square"),  # brake blue
    ("#FFC81E", "strip"),  # flag yellow
    ("#1F9E57", "dot"),  # go green
]


def painted_confetti(color, kind):
    m = canvas()
    d = ImageDraw.Draw(m)
    if kind == "strip":
        d.rounded_rectangle([46 * SS, 26 * SS, 82 * SS, 102 * SS], radius=4 * SS, fill=255)
    elif kind == "square":
        d.rounded_rectangle([36 * SS, 36 * SS, 92 * SS, 92 * SS], radius=5 * SS, fill=255)
    else:
        circles(d, [(64, 64, 30)])
    inner = m.filter(ImageFilter.GaussianBlur(4 * SS * 0.45)).point(lambda v: 255 if v > 250 else 0)
    rgb = Image.new("RGB", m.size, INK)
    rgb.paste(Image.new("RGB", m.size, color), mask=inner)
    size = (CELL, CELL)
    return rgb.resize(size, Image.LANCZOS), m.resize(size, Image.LANCZOS)


CELLS = [blob, cloud, puff_ring, sparkle, star, leaf, confetti, ring, flame, splat, snowflake, streak]


def main():
    atlas = Image.new("RGBA", (CELL * COLS, CELL * ROWS), (0, 0, 0, 0))
    cells = [Image.merge("LA", make()).convert("RGBA") for make in CELLS]
    for color, kind in CONFETTI:
        rgb, alpha = painted_confetti(color, kind)
        cells.append(Image.merge("RGBA", (*rgb.split(), alpha)))
    for i, cell in enumerate(cells):
        atlas.paste(cell, ((i % COLS) * CELL, (i // COLS) * CELL))
    OUT.parent.mkdir(parents=True, exist_ok=True)
    atlas.save(OUT, optimize=True)
    print(f"wrote {OUT.relative_to(OUT.parents[5])} ({OUT.stat().st_size // 1024} KB)")


if __name__ == "__main__":
    main()
