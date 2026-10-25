"""Draws the RaceBall particle atlas: apps/web/public/assets/fx/fx_atlas.png.

Original art (MIT with the code), drawn in place of the Kenney Particle Pack picks
so the effects match the art bible: chunky cartoon shapes with clean edges.

The atlas is 512x256: 4 x 2 cells of 128 px, read left to right, top to bottom.
Cells are grayscale on transparent. The particle color multiplies them, so the
light middle takes the tint and the darker rim reads as a painted edge.

    0 blob      1 cloud     2 puff ring  3 sparkle (4-point star)
    4 star      5 leaf      6 confetti   7 ring

Particle systems pick cells by ID (startSpriteCellID / endSpriteCellID), so
keep the order. Run: python3 tools/fx/gen_fx_textures.py
"""

import math
from pathlib import Path

from PIL import Image, ImageChops, ImageDraw, ImageFilter

CELL = 128
COLS, ROWS = 4, 2
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
    m = canvas()
    d = ImageDraw.Draw(m)
    circles(d, [(64, 64, 56)])
    d.ellipse([(64 - 42) * SS] * 2 + [(64 + 42) * SS] * 2, fill=0)
    return shade(m, rim=False)


CELLS = [blob, cloud, puff_ring, sparkle, star, leaf, confetti, ring]


def main():
    atlas = Image.new("LA", (CELL * COLS, CELL * ROWS), (0, 0))
    for i, make in enumerate(CELLS):
        gray, alpha = make()
        cell = Image.merge("LA", (gray, alpha))
        atlas.paste(cell, ((i % COLS) * CELL, (i // COLS) * CELL))
    OUT.parent.mkdir(parents=True, exist_ok=True)
    atlas.convert("RGBA").save(OUT, optimize=True)
    print(f"wrote {OUT.relative_to(OUT.parents[5])} ({OUT.stat().st_size // 1024} KB)")


if __name__ == "__main__":
    main()
