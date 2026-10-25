// Fake map data for the /ui gallery: the Happy Valley route from tools/track/build_happy_valley.py
// (same knots, spline and scale), so the preview shows the real loop. The live game gets `path`
// from Ali instead.

const SCALE = 1.15;
// [x, z, section] in game meters
const KNOTS: [number, number, number][] = [
  [0, 0, 0],
  [0, 45, 0],
  [0, 85, 1],
  [14, 112, 1],
  [-8, 145, 1],
  [0, 180, 2],
  [0, 210, 2],
  [0, 240, 3],
  [8, 264, 3],
  [30, 274, 3],
  [52, 264, 3],
  [60, 240, 3],
  [60, 214, 4],
  [79, 185, 4],
  [112, 180, 4],
  [141, 166, 5],
  [155, 135, 5],
  [175, 113, 5],
  [202, 94, 5],
  [213, 65, 5],
  [199, 36, 5],
  [172, 27, 5],
  [144, 40, 6],
  [121, 25, 6],
  [113, -13, 6],
  [94, -47, 6],
  [55, -63, 6],
  [20, -55, 7],
  [0, -32, 7],
];
const SECTION_NAMES = [
  "Old Main",
  "Pollock Rd",
  "Pattee",
  "Lion Shrine",
  "Creamery",
  "Beaver Stadium",
  "Arboretum",
  "College Ave",
];

const catmull = (a: number, b: number, c: number, d: number, t: number) =>
  0.5 *
  (2 * b +
    (-a + c) * t +
    (2 * a - 5 * b + 4 * c - d) * t * t +
    (-a + 3 * b - 3 * c + d) * t * t * t) *
  SCALE;

export const PREVIEW_PATH: [number, number][] = [];
const firstOfSection: [number, number][] = [];
KNOTS.forEach((b, i) => {
  const n = KNOTS.length;
  const [a, c, d] = [
    KNOTS[(i - 1 + n) % n],
    KNOTS[(i + 1) % n],
    KNOTS[(i + 2) % n],
  ];
  for (let j = 0; j < 10; j++) {
    const t = j / 10;
    PREVIEW_PATH.push([
      catmull(a[0], b[0], c[0], d[0], t),
      catmull(a[1], b[1], c[1], d[1], t),
    ]);
  }
  if (!firstOfSection[b[2]])
    firstOfSection[b[2]] = PREVIEW_PATH[PREVIEW_PATH.length - 10];
});

export const PREVIEW_LABELS = firstOfSection.map(([x, z], i) => ({
  // nudge labels off the road toward the outside of the loop
  x: x + (x < 80 ? -30 : 16),
  z: z + 4,
  text: SECTION_NAMES[i],
}));

const seg = PREVIEW_PATH.map((p, i) => {
  const q = PREVIEW_PATH[(i + 1) % PREVIEW_PATH.length];
  return Math.hypot(q[0] - p[0], q[1] - p[1]);
});
export const PREVIEW_LENGTH = seg.reduce((s, l) => s + l, 0);

/** Position at a distance along the loop, meters */
export function pointAt(distance: number): [number, number] {
  let s = ((distance % PREVIEW_LENGTH) + PREVIEW_LENGTH) % PREVIEW_LENGTH;
  for (let i = 0; i < seg.length; i++) {
    if (s <= seg[i]) {
      const p = PREVIEW_PATH[i];
      const q = PREVIEW_PATH[(i + 1) % PREVIEW_PATH.length];
      const t = s / seg[i];
      return [p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t];
    }
    s -= seg[i];
  }
  return PREVIEW_PATH[0];
}
