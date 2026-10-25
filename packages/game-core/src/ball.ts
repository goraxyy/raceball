import RAPIER from "@dimforge/rapier3d-compat";
import type { InputMsg } from "@raceball/shared";
import type { Tuning } from "./tuning";

export const BALL_RADIUS = 0.5; // 1 m diameter (see docs/ASSETS.md)

export interface PlayerSim {
  id: string;
  ball: string; // skin id
  slot: number; // spawn slot, 1..8
  body: RAPIER.RigidBody;
  heading: number; // rad around +Y. 0 faces +Z, steering right decreases it
  input: InputMsg;
  maxSpeedMul: number; // items scale the top speed (Blue & White Boost)
  surfaceGrip: number; // surfaces scale the grip (ice, Creamery Spill)
  routeHeading: number | null; // the road's direction where the ball is, set by the race each tick; null = no route
  drift: number; // 0 = not drifting, else the drift's direction: 1 = right, -1 = left
  driftTime: number; // s into the current drift, on the ground
}

/** forceThreshold: contact force (N) above which the ball reports contact-force events, for bumps */
export function addBall(
  world: RAPIER.World,
  x: number,
  y: number,
  z: number,
  forceThreshold = 0,
): RAPIER.RigidBody {
  const body = world.createRigidBody(
    RAPIER.RigidBodyDesc.dynamic()
      .setTranslation(x, y + BALL_RADIUS + 0.1, z)
      .setCcdEnabled(true) // fast balls must not tunnel through thin track pieces
      .setAngularDamping(0.4),
  );
  world.createCollider(
    RAPIER.ColliderDesc.ball(BALL_RADIUS)
      .setFriction(1.0)
      .setRestitution(0.3)
      .setActiveEvents(RAPIER.ActiveEvents.CONTACT_FORCE_EVENTS)
      .setContactForceEventThreshold(forceThreshold),
    body,
  );
  return body;
}

/** Turns one tick of input into impulses. Run it for each player before world.step(). */
export function applyControls(
  p: PlayerSim,
  input: InputMsg,
  dt: number,
  t: Tuning,
  world: RAPIER.World,
): void {
  const v = p.body.linvel();
  const speed = Math.hypot(v.x, v.z);
  const mass = p.body.mass();
  const maxSpeed = t.maxSpeed * p.maxSpeedMul;
  const grounded = isGrounded(p, world, t);
  const control = grounded ? 1 : t.airControl;

  // 1. Drift: brake into a clear turn at speed starts one, and it lasts while the brake is held.
  //    Letting go after a long enough drift fires a mini-turbo along the heading
  let turbo = 0;
  if (p.drift === 0) {
    if (
      input.brake &&
      grounded &&
      speed >= t.driftMinSpeed &&
      Math.abs(input.steer) >= t.driftSteerMin
    ) {
      p.drift = Math.sign(input.steer);
      p.driftTime = 0;
    }
  } else if (!input.brake || speed < t.driftKeepSpeed) {
    // still braking means it scrubbed off too much speed: no reward
    if (!input.brake && p.driftTime >= t.driftSuperTime)
      turbo = t.driftSuperSpeed;
    else if (!input.brake && p.driftTime >= t.driftTurboTime)
      turbo = t.driftTurboSpeed;
    p.drift = 0;
    p.driftTime = 0;
  } else if (grounded) {
    p.driftTime += dt;
  }

  // 2. Steering turns the heading, a bit less at high speed. steer > 0 = right = heading decreases.
  //    In a drift the ball always turns its way: steering into it tightens the line, out of it widens it
  let steer = input.steer;
  let turnMul = 1;
  if (p.drift !== 0) {
    const into = (Math.max(-1, Math.min(1, input.steer * p.drift)) + 1) / 2; // 0 = full out … 1 = full in
    steer = p.drift * (t.driftTurnMin + (1 - t.driftTurnMin) * into);
    turnMul = t.driftTurnMul;
  }
  const turnRate =
    t.turnRate * turnMul * (1 - t.turnFalloff * Math.min(speed / maxSpeed, 1));
  p.heading -= steer * turnRate * dt;
  // 3. No turning round: the heading stays within maxRouteAngle of the road's direction, like Mario Kart
  if (p.routeHeading !== null) {
    const off = wrapAngle(p.heading - p.routeHeading);
    if (Math.abs(off) > t.maxRouteAngle)
      p.heading = p.routeHeading + Math.sign(off) * t.maxRouteAngle;
  }
  const fwd = { x: Math.sin(p.heading), z: Math.cos(p.heading) };

  // 4. Gas pushes along the heading, with no push above max speed
  if (input.gas > 0 && speed < maxSpeed) {
    const j = t.engineForce * input.gas * control * dt * mass;
    p.body.applyImpulse({ x: fwd.x * j, y: 0, z: fwd.z * j }, true);
  }
  // the mini-turbo straightens the slide out: the ball leaves the drift the way it faces, faster
  if (turbo > 0 && grounded) {
    const along = (speed + turbo) * mass;
    p.body.applyImpulse(
      { x: fwd.x * along - v.x * mass, y: 0, z: fwd.z * along - v.z * mass },
      true,
    );
    return;
  }

  // 5. Grip removes part of the sideways speed, so the ball follows the heading. Less in a drift, so it slides
  const side = { x: fwd.z, z: -fwd.x };
  const lateral = v.x * side.x + v.z * side.z;
  const grip = t.grip * (p.drift !== 0 ? t.driftGrip : 1);
  const kGrip = 1 - Math.exp(-grip * p.surfaceGrip * control * dt);
  p.body.applyImpulse(
    {
      x: -side.x * lateral * kGrip * mass,
      y: 0,
      z: -side.z * lateral * kGrip * mass,
    },
    true,
  );

  // 6. Brake damps horizontal speed. In a drift it only bleeds a little
  if (input.brake) {
    const strength = p.drift !== 0 ? t.driftDrag : t.brakeStrength;
    const kBrake = 1 - Math.exp(-strength * dt);
    p.body.applyImpulse(
      { x: -v.x * kBrake * mass, y: 0, z: -v.z * kBrake * mass },
      true,
    );
  }
}

/** -π … π */
function wrapAngle(a: number): number {
  const r = (a + Math.PI) % (2 * Math.PI);
  return (r < 0 ? r + 2 * Math.PI : r) - Math.PI;
}

export function isGrounded(
  p: PlayerSim,
  world: RAPIER.World,
  t: Tuning,
): boolean {
  const ray = new RAPIER.Ray(p.body.translation(), { x: 0, y: -1, z: 0 });
  // Trigger volumes do not support a ball; exclude them and our own body.
  return (
    world.castRay(
      ray,
      BALL_RADIUS + t.groundProbe,
      true,
      RAPIER.QueryFilterFlags.EXCLUDE_SENSORS,
      undefined,
      undefined,
      p.body,
    ) !== null
  );
}
