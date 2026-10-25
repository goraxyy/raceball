import RAPIER from "@dimforge/rapier3d-compat";
import type { InputMsg } from "@raceball/shared";
import type { Tuning } from "./tuning";

export const BALL_RADIUS = 0.5; // 1 m diameter (see docs/ASSETS.md)

export interface PlayerSim {
  id: string;
  ball: string;          // skin id
  slot: number;          // spawn slot, 1..8
  body: RAPIER.RigidBody;
  heading: number;       // rad around +Y. 0 faces +Z, steering right decreases it
  input: InputMsg;
  maxSpeedMul: number;   // items scale the top speed (Blue & White Boost)
  surfaceGrip: number;   // surfaces scale the grip (ice, Creamery Spill)
}

export function addBall(world: RAPIER.World, x: number, y: number, z: number): RAPIER.RigidBody {
  const body = world.createRigidBody(
    RAPIER.RigidBodyDesc.dynamic()
      .setTranslation(x, y + BALL_RADIUS + 0.1, z)
      .setCcdEnabled(true)                   // fast balls must not tunnel through thin track pieces
      .setAngularDamping(0.4),
  );
  world.createCollider(
    RAPIER.ColliderDesc.ball(BALL_RADIUS)
      .setFriction(1.0)
      .setRestitution(0.3)
      .setActiveEvents(RAPIER.ActiveEvents.CONTACT_FORCE_EVENTS),
    body,
  );
  return body;
}

/** Turns one tick of input into impulses. Run it for each player before world.step(). */
export function applyControls(p: PlayerSim, input: InputMsg, dt: number, t: Tuning, world: RAPIER.World): void {
  const v = p.body.linvel();
  const speed = Math.hypot(v.x, v.z);
  const mass = p.body.mass();
  const maxSpeed = t.maxSpeed * p.maxSpeedMul;
  const control = isGrounded(p, world, t) ? 1 : t.airControl;

  // 1. Steering turns the heading, a bit less at high speed. steer > 0 = right = heading decreases
  const turnRate = t.turnRate * (1 - t.turnFalloff * Math.min(speed / maxSpeed, 1));
  p.heading -= input.steer * turnRate * dt;
  const fwd = { x: Math.sin(p.heading), z: Math.cos(p.heading) };

  // 2. Gas pushes along the heading, with no push above max speed
  if (input.gas > 0 && speed < maxSpeed) {
    const j = t.engineForce * input.gas * control * dt * mass;
    p.body.applyImpulse({ x: fwd.x * j, y: 0, z: fwd.z * j }, true);
  }

  // 3. Grip removes part of the sideways speed, so the ball follows the heading
  const side = { x: fwd.z, z: -fwd.x };
  const lateral = v.x * side.x + v.z * side.z;
  const kGrip = 1 - Math.exp(-t.grip * p.surfaceGrip * control * dt);
  p.body.applyImpulse({ x: -side.x * lateral * kGrip * mass, y: 0, z: -side.z * lateral * kGrip * mass }, true);

  // 4. Brake damps horizontal speed
  if (input.brake) {
    const kBrake = 1 - Math.exp(-t.brakeStrength * dt);
    p.body.applyImpulse({ x: -v.x * kBrake * mass, y: 0, z: -v.z * kBrake * mass }, true);
  }
}

export function isGrounded(p: PlayerSim, world: RAPIER.World, t: Tuning): boolean {
  const ray = new RAPIER.Ray(p.body.translation(), { x: 0, y: -1, z: 0 });
  // exclude our own body from the ray (last argument)
  return world.castRay(ray, BALL_RADIUS + t.groundProbe, true, undefined, undefined, undefined, p.body) !== null;
}
