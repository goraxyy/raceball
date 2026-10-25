// Builds the VFX v1 and v2 particle systems and writes them to apps/web/public/assets/fx/ as
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
  flame: 8,
  splat: 9,
  snowflake: 10,
  streak: 11,
  // 12-15: confetti already painted in the livery colors (use a white tint)
  paintedFirst: 12,
  paintedLast: 15,
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
const BRAKE_BLUE = "#7CC3E8";
const BRAKE_DEEP = "#2F7FB3";
const VANILLA = "#F7E6C4";
const STRAWBERRY = "#F2B8C6";

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
  if (cells.length > 2 || cells[cells.length - 1] < cells[0])
    throw new Error(
      `${name}: cells must be one ID or an ascending pair (a range)`,
    );
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

// ------------------------------------------------------------------ VFX v2

/**
 * Blue & White Boost flames, while the boost lasts. Directions point backward along +Z: give the
 * system a TransformNode that follows the ball's position and heading but not its roll, and set
 * isLocal = true (the same kind of node the orbit ring uses), or rotate direction1/direction2
 * each frame to match the heading.
 */
function boostFlames() {
  const ps = system("fx_boost_flames", 80, [C.flame]);
  ps.emitRate = 70;
  ps.createPointEmitter(
    new Vector3(-0.35, 0.5, 1.6),
    new Vector3(0.35, 1.1, 2.4),
  );
  ps.minEmitPower = 2;
  ps.maxEmitPower = 3.5;
  ps.minLifeTime = 0.16;
  ps.maxLifeTime = 0.28;
  ps.addSizeGradient(0, 0.45, 0.6);
  ps.addSizeGradient(0.35, 0.8, 1.0);
  ps.addSizeGradient(1, 0.2, 0.3);
  // flames stay upright-ish: a little wobble, no spin
  ps.minInitialRotation = -0.35;
  ps.maxInitialRotation = 0.35;
  ps.minAngularSpeed = 0;
  ps.maxAngularSpeed = 0;
  ps.color1 = hex(BRAKE_BLUE);
  ps.color2 = hex("#FFFFFF");
  ps.colorDead = hex(BRAKE_BLUE, 0);
  return ps;
}

/** The boost trail: streaks stretched along their motion, fading from white to deep blue. */
function boostTrail() {
  const ps = system("fx_boost_trail", 60, [C.streak]);
  ps.emitRate = 40;
  ps.billboardMode = ParticleSystem.BILLBOARDMODE_STRETCHED;
  ps.createPointEmitter(
    new Vector3(-0.15, 0.1, 0.8),
    new Vector3(0.15, 0.3, 1.2),
  );
  ps.minEmitPower = 3;
  ps.maxEmitPower = 5;
  ps.minLifeTime = 0.35;
  ps.maxLifeTime = 0.5;
  ps.addSizeGradient(0, 0.5, 0.7);
  ps.addSizeGradient(1, 0.1, 0.15);
  ps.minInitialRotation = 0;
  ps.maxInitialRotation = 0;
  ps.color1 = hex("#FFFFFF", 0.9);
  ps.color2 = hex(BRAKE_BLUE, 0.9);
  ps.colorDead = hex(BRAKE_DEEP, 0);
  return ps;
}

/** Lion Roar shockwave: rings that blast outward from the roaring ball (fire 2, a beat apart). */
function roarRing() {
  const ps = burst(system("fx_roar_ring", 4, [C.ring]));
  ps.worldOffset = new Vector3(0, 0.6, 0);
  ps.createPointEmitter(Vector3.Zero(), Vector3.Zero());
  ps.minEmitPower = 0;
  ps.maxEmitPower = 0;
  ps.minLifeTime = 0.32;
  ps.maxLifeTime = 0.38;
  // pops out fast, then eases: like a sound wave in a cartoon
  ps.addSizeGradient(0, 1.2, 1.2);
  ps.addSizeGradient(0.35, 5.5, 5.5);
  ps.addSizeGradient(1, 8, 8);
  ps.minAngularSpeed = 0;
  ps.maxAngularSpeed = 0;
  ps.color1 = hex(FLAG_YELLOW, 0.95);
  ps.color2 = hex(FLAG_YELLOW, 0.95);
  ps.colorDead = hex(FLAG_YELLOW, 0);
  return ps;
}

/** Lion Roar debris: limestone dust kicked out flat along the ground, in a full circle. */
function roarDebris() {
  const ps = burst(system("fx_roar_debris", 40, [C.blob, C.cloud]));
  ps.createCylinderEmitter(0.6, 0.2, 1, 0.12); // directions point out from the axis
  ps.worldOffset = new Vector3(0, -0.3, 0); // hug the ground
  ps.minEmitPower = 8;
  ps.maxEmitPower = 12;
  ps.minLifeTime = 0.35;
  ps.maxLifeTime = 0.5;
  ps.gravity = new Vector3(0, 0.4, 0);
  ps.addLimitVelocityGradient(0, 12);
  ps.addLimitVelocityGradient(1, 1);
  ps.limitVelocityDamping = 0.85;
  ps.addSizeGradient(0, 0.4, 0.55);
  ps.addSizeGradient(1, 0.95, 1.25);
  ps.minAngularSpeed = -2;
  ps.maxAngularSpeed = 2;
  ps.color1 = hex(LIMESTONE, 0.75);
  ps.color2 = hex(PAPER, 0.7);
  ps.colorDead = hex(LIMESTONE, 0);
  return ps;
}

/** Creamery Spill: blobs of vanilla and strawberry thrown up when the puddle is dropped. */
function spillSplat() {
  const ps = burst(system("fx_spill_splat", 20, [C.splat]));
  ps.createHemisphericEmitter(0.3, 1);
  ps.minEmitPower = 3;
  ps.maxEmitPower = 5;
  ps.minLifeTime = 0.45;
  ps.maxLifeTime = 0.7;
  ps.gravity = new Vector3(0, -14, 0);
  ps.addSizeGradient(0, 0.35, 0.5);
  ps.addSizeGradient(0.5, 0.7, 0.9);
  ps.addSizeGradient(1, 0.6, 0.8);
  ps.minAngularSpeed = -3;
  ps.maxAngularSpeed = 3;
  ps.color1 = hex(VANILLA);
  ps.color2 = hex(STRAWBERRY);
  ps.colorDead = hex(VANILLA, 0);
  return ps;
}

/** Sprinkles with the spill: small painted confetti, spinning fast. */
function spillSprinkles() {
  const ps = burst(
    system("fx_spill_sprinkles", 30, [C.paintedFirst, C.paintedLast]),
  );
  ps.createHemisphericEmitter(0.3, 1);
  ps.minEmitPower = 4;
  ps.maxEmitPower = 7;
  ps.minLifeTime = 0.5;
  ps.maxLifeTime = 0.75;
  ps.gravity = new Vector3(0, -16, 0);
  ps.addSizeGradient(0, 0.14, 0.2);
  ps.addSizeGradient(1, 0.12, 0.18);
  ps.minAngularSpeed = -12;
  ps.maxAngularSpeed = 12;
  ps.color1 = hex("#FFFFFF");
  ps.color2 = hex("#FFFFFF");
  ps.colorDead = hex("#FFFFFF", 0);
  return ps;
}

/**
 * Snowfall over the Arboretum: chunky flakes drifting down in a 60 m box. Keep the emitter on
 * the camera target. Heavy, so load it as a GPUParticleSystem where GPUParticleSystem.IsSupported.
 */
function snowfall() {
  const ps = system("fx_snowfall", 1500, [C.snowflake]);
  ps.emitRate = 140;
  ps.createBoxEmitter(
    new Vector3(-0.35, -1, -0.2),
    new Vector3(0.35, -1, 0.2),
    new Vector3(-30, 12, -30),
    new Vector3(30, 16, 30),
  );
  ps.minEmitPower = 1.4;
  ps.maxEmitPower = 2.4;
  ps.minLifeTime = 7;
  ps.maxLifeTime = 9;
  ps.minSize = 0.16;
  ps.maxSize = 0.34;
  ps.minAngularSpeed = -1.2;
  ps.maxAngularSpeed = 1.2;
  ps.color1 = hex(SNOW, 0.95);
  ps.color2 = hex("#FFFFFF", 0.9);
  ps.colorDead = hex(SNOW, 0);
  ps.preWarmCycles = 120; // the sky is already full when the section loads
  ps.preWarmStepOffset = 5;
  return ps;
}

/** Snow puffs: a burst of powder when a ball lands or bumps in the snow. */
function snowPuff() {
  const ps = burst(system("fx_snow_puff", 20, [C.cloud, C.puffRing]));
  ps.createHemisphericEmitter(0.4, 1);
  ps.minEmitPower = 2;
  ps.maxEmitPower = 4;
  ps.minLifeTime = 0.35;
  ps.maxLifeTime = 0.6;
  ps.gravity = new Vector3(0, -3, 0);
  ps.addSizeGradient(0, 0.35, 0.5);
  ps.addSizeGradient(1, 0.9, 1.2);
  ps.minAngularSpeed = -2;
  ps.maxAngularSpeed = 2;
  ps.color1 = hex(SNOW);
  ps.color2 = hex("#FFFFFF");
  ps.colorDead = hex(SNOW, 0);
  return ps;
}

/**
 * Finish confetti: painted pieces burst from the top of the arch, then flutter down slowly.
 * Put the emitter on the arch top. Heavy, so GPUParticleSystem where supported.
 */
function confetti() {
  const ps = burst(system("fx_confetti", 400, [C.paintedFirst, C.paintedLast]));
  ps.createBoxEmitter(
    new Vector3(-0.6, 1, -0.4),
    new Vector3(0.6, 1.6, 0.4),
    new Vector3(-5, 0, -0.3),
    new Vector3(5, 0.4, 0.3),
  );
  ps.minEmitPower = 6;
  ps.maxEmitPower = 11;
  ps.minLifeTime = 2.6;
  ps.maxLifeTime = 3.6;
  ps.gravity = new Vector3(0, -6, 0);
  // air drag: a fast launch, then a slow paper flutter down
  ps.addLimitVelocityGradient(0, 14);
  ps.addLimitVelocityGradient(0.25, 2.2);
  ps.addLimitVelocityGradient(1, 1.8);
  ps.limitVelocityDamping = 0.9;
  ps.minSize = 0.22;
  ps.maxSize = 0.36;
  ps.minAngularSpeed = -7;
  ps.maxAngularSpeed = 7;
  ps.color1 = hex("#FFFFFF");
  ps.color2 = hex("#FFFFFF");
  ps.colorDead = hex("#FFFFFF", 0);
  return ps;
}

const V1 = [dust(), bumpSparks(), respawnPoof(), respawnStars()];
const V2 = [
  boostFlames(),
  boostTrail(),
  roarRing(),
  roarDebris(),
  spillSplat(),
  spillSprinkles(),
  snowfall(),
  snowPuff(),
  confetti(),
];

for (const ps of [...V1, ...V2]) {
  const file = new URL(`${ps.name}.json`, OUT);
  writeFileSync(file, `${JSON.stringify(ps.serialize(false), null, 2)}\n`);
  console.log(`wrote ${fileURLToPath(file).slice(fileURLToPath(root).length)}`);
}
engine.dispose();
