// Builds the VFX v1 particle systems and writes them to apps/web/public/assets/fx/ as
// Babylon ParticleSystem JSON (the same format as `ps.serialize()` from the Inspector).
//
// Every effect draws from one atlas, fx_atlas.png (tools/fx/gen_fx_textures.py), and picks
// its cells by ID. Bursts are saved with manualEmitCount 0: game code sets the count when
// the event fires (see docs/ASSETS.md > Particles and VFX).
//
// Run: node tools/fx/build_fx.mjs   (needs `pnpm install` for @babylonjs/core)

import { writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = new URL("../../", import.meta.url);
const require = createRequire(new URL("apps/web/package.json", root));
const B = await import(pathToFileURL(require.resolve("@babylonjs/core")).href);
const { Color4, NullEngine, ParticleSystem, Scene, Texture, Vector3 } = B;

const OUT = new URL("apps/web/public/assets/fx/", root);
const ATLAS = "fx_atlas.png";
const CELL = 128;
// atlas cells, in the order gen_fx_textures.py draws them
const C = {
  blob: 0,
  cloud: 1,
  puffRing: 2,
  sparkle: 3,
  star: 4,
  leaf: 5,
  confetti: 6,
  ring: 7,
};

const hex = (h, a = 1) => {
  const n = parseInt(h.slice(1), 16);
  return new Color4(
    ((n >> 16) & 255) / 255,
    ((n >> 8) & 255) / 255,
    (n & 255) / 255,
    a,
  );
};
// art bible colors (docs/ASSETS.md)
const LIMESTONE = "#D9CBB0";
const PAPER = "#F3EAD9";
const SNOW = "#F4F6F8";
const FLAG_YELLOW = "#FFC81E";

const engine = new NullEngine();
const scene = new Scene(engine);

function system(name, capacity, cells) {
  const ps = new ParticleSystem(name, capacity, scene, null, true);
  // invertY false: sprite cell IDs then count from the top-left of the atlas, as drawn
  const tex = new Texture(ATLAS, scene, false, false);
  tex.hasAlpha = true;
  ps.particleTexture = tex;
  ps.spriteCellWidth = CELL;
  ps.spriteCellHeight = CELL;
  ps.startSpriteCellID = cells[0];
  ps.endSpriteCellID = cells[cells.length - 1];
  ps.spriteRandomStartCell = true;
  ps.spriteCellChangeSpeed = 0; // one shape per particle, no flipbook
  ps.blendMode = ParticleSystem.BLENDMODE_STANDARD;
  ps.emitter = Vector3.Zero(); // code moves it to the ball or the marker
  ps.minInitialRotation = 0;
  ps.maxInitialRotation = Math.PI * 2;
  return ps;
}

function burst(ps) {
  ps.emitRate = 0;
  ps.manualEmitCount = 0;
  return ps;
}

/** Rolling dust: soft blobs and clouds kicked up behind a rolling ball. */
function dust() {
  const ps = system("fx_dust", 60, [C.blob, C.cloud]);
  // 24 per second at top speed; code scales emitRate with speed (0 when airborne)
  ps.emitRate = 24;
  ps.createBoxEmitter(
    new Vector3(-0.6, 0.5, -0.6),
    new Vector3(0.6, 1.1, 0.6),
    new Vector3(-0.3, -0.3, -0.3), // just above the contact patch of a 1 m ball, so the
    new Vector3(0.3, -0.2, 0.3), // puffs don't sink into the ground
  );
  ps.minEmitPower = 0.4;
  ps.maxEmitPower = 1.0;
  ps.minLifeTime = 0.35;
  ps.maxLifeTime = 0.6;
  ps.gravity = new Vector3(0, 0.8, 0);
  ps.addSizeGradient(0, 0.4, 0.5);
  ps.addSizeGradient(1, 1.0, 1.3);
  ps.minAngularSpeed = -1;
  ps.maxAngularSpeed = 1;
  ps.color1 = hex(LIMESTONE, 0.6);
  ps.color2 = hex(PAPER, 0.5);
  ps.colorDead = hex(LIMESTONE, 0);
  return ps;
}

/** Bump sparks: four-point stars that pop out of the contact point and fall. */
function bumpSparks() {
  const ps = burst(system("fx_bump_sparks", 24, [C.sparkle]));
  ps.createSphereEmitter(0.25, 1);
  ps.minEmitPower = 4;
  ps.maxEmitPower = 8;
  ps.minLifeTime = 0.3;
  ps.maxLifeTime = 0.5;
  ps.gravity = new Vector3(0, -12, 0);
  ps.addSizeGradient(0, 0.5, 0.75);
  ps.addSizeGradient(0.6, 0.45, 0.65);
  ps.addSizeGradient(1, 0.1, 0.15);
  ps.minAngularSpeed = -8;
  ps.maxAngularSpeed = 8;
  ps.color1 = hex(FLAG_YELLOW);
  ps.color2 = hex("#FFFFFF");
  ps.colorDead = hex(FLAG_YELLOW, 0);
  return ps;
}

/** Respawn poof: a ring of fat cloud puffs that swell and drift up. */
function respawnPoof() {
  const ps = burst(system("fx_respawn_poof", 16, [C.cloud, C.puffRing]));
  ps.worldOffset = new Vector3(0, 0.6, 0); // lift the 2 m puffs clear of the ground
  ps.createSphereEmitter(0.5, 1);
  ps.minEmitPower = 1.2;
  ps.maxEmitPower = 2.4;
  ps.minLifeTime = 0.45;
  ps.maxLifeTime = 0.65;
  ps.gravity = new Vector3(0, 1, 0);
  ps.addSizeGradient(0, 0.7, 0.9);
  ps.addSizeGradient(0.3, 1.6, 2.0);
  ps.addSizeGradient(1, 2.0, 2.4);
  ps.minAngularSpeed = -1.5;
  ps.maxAngularSpeed = 1.5;
  ps.color1 = hex(PAPER);
  ps.color2 = hex(SNOW);
  ps.colorDead = hex(PAPER, 0);
  return ps;
}

/** Respawn stars: fired with the poof, tinted in the player color by code. */
function respawnStars() {
  const ps = burst(system("fx_respawn_stars", 12, [C.star]));
  ps.worldOffset = new Vector3(0, 0.3, 0);
  ps.createSphereEmitter(0.4, 1);
  ps.minEmitPower = 3;
  ps.maxEmitPower = 5;
  ps.minLifeTime = 0.4;
  ps.maxLifeTime = 0.6;
  ps.gravity = new Vector3(0, -6, 0);
  ps.addSizeGradient(0, 0.45, 0.6);
  ps.addSizeGradient(0.7, 0.45, 0.55);
  ps.addSizeGradient(1, 0.1, 0.15);
  ps.minAngularSpeed = -6;
  ps.maxAngularSpeed = 6;
  // white until code sets color1/color2 to the player color and colorDead to it at alpha 0
  ps.color1 = hex("#FFFFFF");
  ps.color2 = hex("#FFFFFF");
  ps.colorDead = hex("#FFFFFF", 0);
  return ps;
}

for (const ps of [dust(), bumpSparks(), respawnPoof(), respawnStars()]) {
  const file = new URL(`${ps.name}.json`, OUT);
  writeFileSync(file, `${JSON.stringify(ps.serialize(false), null, 2)}\n`);
  console.log(`wrote ${fileURLToPath(file).slice(fileURLToPath(root).length)}`);
}
engine.dispose();
