"""Places Happy Valley's interactables on the route and writes packages/game-core/tracks/happy_valley_interactables.json.

Plain Python (no Blender): python tools/track/build_interactables.py. It runs the route maths from
build_happy_valley.py (knots, spline, heights, banking), so everything sits on the road as the map builds it.

  - Creamery Scoops, Mario Kart's coins: lines of them on the straights, some on the racing line and some off it to
    tempt you wide. Each one you hold adds a little top speed; hard bumps, Lion Roars and respawns knock them off
  - Lion Paw bumpers: pinball posts near the road's edges in the Lion Shrine section and on the stadium approach,
    where cutting the corner tight gets you kicked back out. Never on the centerline, so the bots run clean

game-core reads the file (interactables.ts) and so does the web (the views stand on the same spots).
"""

import bisect
import json
import math
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / "packages" / "game-core" / "tracks" / "happy_valley_interactables.json"

_src = (ROOT / "tools" / "track" / "build_happy_valley.py").read_text()
_route = {"math": math, "bisect": bisect}
exec(_src[_src.index("SECTIONS = ["):_src.index("def blender(p):")], _route)
xyz, starts, length = _route["xyz"], _route["starts"], _route["length"]
SECTIONS = _route["SECTIONS"]
S = dict(zip(SECTIONS, starts))

SCOOP_UP = 0.9  # m over the road: the middle of a rolling ball
# lines of scoops: (s of the first, its side, the last one's side, how many, m apart along the road). Side is m
# from the centerline, + to the left; a line whose sides differ sweeps across the road
SCOOP_LINES = [
    (S["start"] + 62, 0.0, 0.0, 5, 4.0),  # down the start straight, after the boost pads
    (S["pollock"] + 72, -3.5, -3.5, 3, 4.0),  # past the item boxes, on the right
    (S["creamery"] + 20, -4.0, 4.0, 5, 3.5),  # a sweep across the Creamery climb
    (S["stadium"] + 140, 3.0, 3.0, 4, 4.0),  # the stadium straight, high side
    (S["arboretum"] + 150, -3.0, -3.0, 3, 4.5),  # the Arboretum's run out
    (S["collegeave"] + 10, 2.5, 2.5, 3, 4.0),  # College Ave, before the last boost pads
]
PAWS = [  # (s, side): a slalom into the Lion Shrine hairpin, and a pair on the stadium approach
    (S["lionshrine"] + 12, 4.0),
    (S["lionshrine"] + 22, -4.0),
    (S["lionshrine"] + 32, 4.0),
    (S["stadium"] + 48, -4.2),
    (S["stadium"] + 60, 4.2),
]


def r(p):
    return [round(v, 2) for v in p]


def build():
    scoops = []
    for s0, side0, side1, count, spacing in SCOOP_LINES:
        for i in range(count):
            side = side0 + (side1 - side0) * i / max(1, count - 1)
            scoops.append(r(xyz(s0 + i * spacing, side, SCOOP_UP)))
    paws = [r(xyz(s, side, 0)) for s, side in PAWS]
    data = {
        "note": "Written by tools/track/build_interactables.py from the route maths. Positions in map meters: "
                "scoops are centers, paws are base centers on the road.",
        "scoops": scoops,
        "paws": paws,
    }
    points = lambda key: ",\n".join(f"    {json.dumps(p)}" for p in data[key])
    OUT.write_text(f'{{\n  "note": {json.dumps(data["note"])},\n  "scoops": [\n{points("scoops")}\n  ],\n'
                   f'  "paws": [\n{points("paws")}\n  ]\n}}\n')
    print({"scoops": len(scoops), "paws": len(paws), "out": str(OUT)})


build()
