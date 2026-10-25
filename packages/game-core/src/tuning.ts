/**
 * Every feel number in the game. In local mode (/play?local=1) a lil-gui panel edits this object
 * live; when it feels right, copy the values back here and commit.
 */
export const tuning = {
  // Ball control (starting values from docs/team/ali-game.md)
  maxSpeed: 18, // m/s, top speed on flat ground
  engineForce: 25, // m/s² of push along the heading at full gas (scaled by mass, like grip and brake)
  turnRate: 2.4, // rad/s of heading change at full steer
  turnFalloff: 0.4, // the turn rate drops by this share at top speed
  grip: 6, // how quickly sideways sliding is removed (0 = pure marble)
  brakeStrength: 3, // how quickly the brake stops you
  airControl: 0.2, // share of control while airborne
  groundProbe: 0.15, // m below the ball that still counts as touching the ground

  // Respawn
  fallY: -10, // below this height a ball respawns

  // Keyboard adapter (local mode only)
  keySteerRate: 4, // steer units per second while A/D is held
  keyReturnRate: 6, // steer units per second back toward 0 when released or reversed

  // Chase camera
  camDistance: 6, // m behind the ball
  camHeight: 3, // m above the ball
  camStiffness: 8, // higher = the camera catches up faster
  camLookAhead: 2, // m ahead of the ball the camera looks at
};

export type Tuning = typeof tuning;
