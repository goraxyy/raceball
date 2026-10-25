"""Draws the RaceBall logo and icons as SVG.

Original art in the art bible's livery palette. The wordmark is our own Barlow Condensed
Black Italic (SIL OFL, packages/shared/theme/fonts/) turned into outlines, so the files
look right anywhere, even where the font isn't loaded (Devpost, the README, slides).

Writes:
    apps/web/public/assets/ui/ui_logo.svg       the lockup: ball mark + wordmark
    apps/web/public/assets/ui/ui_logo_dark.svg  the lockup for dark backgrounds (paper RACE)
    apps/web/public/assets/ui/ui_logo_mark.svg  the ball mark alone
    apps/web/public/favicon.svg                 mark on a paper tile
    apps/pad/public/favicon.svg                 mark on a gas orange tile (tells the tabs apart)

    tools/brand/icons/touch_*.svg               sources for the home-screen PNGs

Then run `node tools/brand/render_icons.mjs` for the PNG icons.
Needs: pip install fonttools brotli. Run: python3 tools/brand/gen_brand.py
"""

from pathlib import Path

from fontTools.pens.svgPathPen import SVGPathPen
from fontTools.pens.transformPen import TransformPen
from fontTools.ttLib import TTFont

ROOT = Path(__file__).resolve().parents[2]
FONT = ROOT / "packages/shared/theme/fonts/barlow-condensed-900-italic.woff2"

# livery palette (docs/ASSETS.md)
INK = "#17151F"
PAPER = "#F3EAD9"
GAS = "#F5702A"
BRAKE = "#7CC3E8"
BRAKE_DEEP = "#2F7FB3"
FLAG = "#FFC81E"

LINE = 5  # ink outline in the 128 px mark


def mark(x=0.0, y=0.0, s=1.0, lines=True, line_fill=INK):
    """The ball mark in a 128 x 128 box: a planet ball with its orbit ring, rolling right.

    The ring's back half sits behind the ball and its front half crosses in front, like the
    orbit ring on every player's ball in the game. Speed lines trail on the left.
    """
    cx, cy, r = 68, 62, 36
    ring = f'cx="{cx}" cy="{cy}" rx="48" ry="14" transform="rotate(-16 {cx} {cy})"'
    shadow = f'<circle cx="{cx + 6}" cy="{cy + 6}" r="{r}" fill="{INK}"/>'
    speed = ""
    if lines:
        speed = "".join(
            f'<rect x="{x0}" y="{y0}" width="{w}" height="9" rx="4.5" fill="{line_fill}"/>'
            for x0, y0, w in ((0, 40, 24), (-6, 58, 20), (4, 76, 16))
        )
    # clip for the front half of the ring: everything below the ring's tilted center line
    front = (
        f'<clipPath id="rb-front"><rect x="-20" y="{cy}" width="190" height="90" '
        f'transform="rotate(-16 {cx} {cy})"/></clipPath>'
    )
    ring_back = (
        f'<ellipse {ring} fill="none" stroke="{INK}" stroke-width="{10 + LINE * 2}"/>'
        f'<ellipse {ring} fill="none" stroke="{FLAG}" stroke-width="10"/>'
    )
    ball = (
        f'<circle cx="{cx}" cy="{cy}" r="{r}" fill="{BRAKE}" stroke="{INK}" stroke-width="{LINE}"/>'
        # a painted band and a highlight: toy-painted, not NASA
        f'<path d="M{cx - r + 4} {cy + 8} Q{cx} {cy + 20} {cx + r - 3} {cy + 2}" fill="none" '
        f'stroke="{BRAKE_DEEP}" stroke-width="8" stroke-linecap="round"/>'
        f'<ellipse cx="{cx - 13}" cy="{cy - 16}" rx="9" ry="6" fill="#fff" transform="rotate(-30 {cx - 13} {cy - 16})"/>'
    )
    ring_front = f'<g clip-path="url(#rb-front)">{ring_back}</g>'
    body = f"<defs>{front}</defs>{speed}{shadow}{ring_back}{ball}{ring_front}"
    return f'<g transform="translate({x} {y}) scale({s})">{body}</g>'


def word_paths(text, size, x, baseline, track=-0.01):
    """Outlines of `text` in Barlow Condensed Black Italic. Returns (svg path d, end x)."""
    font = TTFont(FONT)
    glyphs = font.getGlyphSet()
    cmap = font.getBestCmap()
    hmtx = font["hmtx"]
    scale = size / font["head"].unitsPerEm
    ds, pen_x = [], x
    for ch in text:
        name = cmap[ord(ch)]
        pen = SVGPathPen(glyphs)
        glyphs[name].draw(TransformPen(pen, (scale, 0, 0, -scale, pen_x, baseline)))
        ds.append(pen.getCommands())
        pen_x += hmtx[name][0] * scale + track * size
    return " ".join(ds), pen_x


def sticker_text(d, fill, stroke=None):
    """The UI's sticker look: a paper offset, an ink offset, then the letters."""
    out = f'<path d="{d}" fill="{INK}" transform="translate(6 6)"/>'
    out += f'<path d="{d}" fill="{PAPER}" stroke="{PAPER}" stroke-width="2" transform="translate(3 3)"/>'
    if stroke:
        out += f'<path d="{d}" fill="{fill}" stroke="{stroke}" stroke-width="5" stroke-linejoin="round" paint-order="stroke fill"/>'
    else:
        out += f'<path d="{d}" fill="{fill}"/>'
    return out


def svg(width, height, body, title):
    return (
        f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {width} {height}" '
        f'width="{width}" height="{height}" role="img" aria-label="{title}">'
        f"<title>{title}</title>{body}</svg>\n"
    )


def lockup(dark=False):
    """On dark backgrounds RACE turns paper and the sticker offsets swap, so it never sinks."""
    size, baseline = 120, 106
    race, x = word_paths("RACE", size, 136, baseline)
    ball, end = word_paths("BALL", size, x + 4, baseline)
    width = round(end + 14)
    race_svg = sticker_text(race, PAPER, INK) if dark else sticker_text(race, INK)
    body = mark(8, 4, line_fill=PAPER if dark else INK) + race_svg + sticker_text(ball, GAS, INK)
    return svg(width, 136, body, "RaceBall")


def tile(bg):
    """Favicon: the mark on a rounded tile with an ink edge. Speed lines are dropped so it
    still reads at 16 px."""
    body = (
        f'<rect x="3" y="3" width="122" height="122" rx="28" fill="{bg}" stroke="{INK}" stroke-width="6"/>'
        + mark(3, 6, 0.9, lines=False)
    )
    return svg(128, 128, body, "RaceBall")


def touch(bg):
    """Home-screen icon source: full bleed, no edge; iOS and Android round the corners."""
    body = f'<rect width="128" height="128" fill="{bg}"/>' + mark(10, 12, 0.8, lines=False)
    return svg(128, 128, body, "RaceBall")


def write(rel, text):
    path = ROOT / rel
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(text)
    print(f"wrote {rel} ({len(text) // 1024 or 1} KB)")


def main():
    write("apps/web/public/assets/ui/ui_logo.svg", lockup())
    write("apps/web/public/assets/ui/ui_logo_dark.svg", lockup(dark=True))
    write("apps/web/public/assets/ui/ui_logo_mark.svg", svg(134, 134, mark(8, 2), "RaceBall"))
    write("apps/web/public/favicon.svg", tile(PAPER))
    write("apps/pad/public/favicon.svg", tile(GAS))
    # sources for render_icons.mjs, not served
    write("tools/brand/icons/touch_web.svg", touch(PAPER))
    write("tools/brand/icons/touch_pad.svg", touch(GAS))


if __name__ == "__main__":
    main()
