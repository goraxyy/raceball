// Renders the home-screen icons from tools/brand/icons/*.svg with the Playwright Chromium
// (pre-installed in the cloud containers; locally: `npx playwright install chromium`).
//   apps/web/public/apple-touch-icon.png  180 px, iPhone "Add to Home Screen"
//   apps/pad/public/apple-touch-icon.png  180 px
// Run after gen_brand.py: node tools/brand/render_icons.mjs

import { readFileSync } from "node:fs";
import { createRequire } from "node:module";

const root = new URL("../../", import.meta.url);
const require = createRequire(import.meta.url);
const { chromium } = require("playwright");

const ICONS = [
  ["tools/brand/icons/touch_web.svg", "apps/web/public/apple-touch-icon.png"],
  ["tools/brand/icons/touch_pad.svg", "apps/pad/public/apple-touch-icon.png"],
];
const SIZE = 180;

const browser = await chromium.launch();
const page = await browser.newPage({
  viewport: { width: SIZE, height: SIZE },
});
for (const [src, out] of ICONS) {
  const svg = readFileSync(new URL(src, root)).toString("base64");
  await page.setContent(
    `<body style="margin:0"><img src="data:image/svg+xml;base64,${svg}" width="${SIZE}" height="${SIZE}" style="display:block"></body>`,
  );
  await page.screenshot({ path: new URL(out, root).pathname });
  console.log(`wrote ${out}`);
}
await browser.close();
