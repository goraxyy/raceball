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
  stuckSeconds: 5, // holding gas this long while barely moving respawns the ball
  stuckSpeed: 1, // m/s; slower than this counts as barely moving

  // Race rules
  finishGraceSeconds: 30, // after the winner finishes, the race ends this long after (or when everyone is in)
  overtakeGap: 1, // m clearly ahead before a pass counts, so side-by-side balls don't flicker

  // Bumps between balls (measured: a 12 m/s rear-end hit is about 370 N; pushing contact stays under 20 N)
  bumpForceMin: 50, // N of contact force before a touch counts as a bump
  bumpBigHit: 600, // N for a bump of strength 1
  bumpCooldown: 0.25, // s before the same two balls can bump again

  // Bots (botInput): aim at a point ahead on the route, full gas, brake only into sharp turns
  botLookahead: 5, // m ahead on the route at a standstill
  botLookaheadPerSpeed: 0.5, // extra m of lookahead per m/s
  botLookaheadMax: 14, // m
  botSteerGain: 2.5, // steer per radian off the target
  botBrakeAngle: 0.7, // rad off the target before the bot brakes
  botBrakeSpeed: 8, // m/s; the bot only brakes above this

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
