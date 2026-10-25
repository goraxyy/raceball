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
  maxRouteAngle: 1.6, // rad (about 90°): the heading never turns further than this from the road's direction
  routeTangentSpan: 4, // m either side of the ball the road's direction is measured over, so polyline corners don't jerk it

  // Drifting: brake into a clear turn at speed and the ball slides round the corner instead of braking
  driftMinSpeed: 9, // m/s needed to start a drift (half of top speed)
  driftKeepSpeed: 5, // m/s; slower than this and the drift ends (no mini-turbo)
  driftSteerMin: 0.35, // |steer| needed to start one; its sign picks the drift's direction
  driftTurnMin: 0.4, // share of full turn while steering out of the drift (wide line)
  driftTurnMul: 1.35, // turn rate multiplier at full steer into the drift (tight line)
  driftGrip: 0.6, // grip multiplier while drifting: the ball slides out about 25° but its path still turns tighter
  driftDrag: 0.25, // how quickly a drift bleeds speed (the brake is 3)
  driftTurboTime: 0.7, // s of drift for a mini-turbo on release
  driftTurboSpeed: 3, // m/s it adds along the heading
  driftSuperTime: 1.6, // s of drift for the bigger one
  driftSuperSpeed: 5.5, // m/s

  // Respawn
  fallY: -10, // below this height a ball respawns
  offTrackSeconds: 0.8, // on the grass beside the road this long (over a rail, off a jump) respawns the ball
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

  // Section mechanics (boost pads and surfaces come from the track's markers)
  boostPadSpeed: 8, // m/s added along a boost pad's facing, times the pad's power
  boostMaxSpeedMul: 1.5, // top speed multiplier right after a boost
  boostSeconds: 1.5, // how long the raised top speed lasts
  snowDrag: 0.6, // extra slowing on snow, like a light brake (higher = slower)

  // Items (odds by place are ITEM_ODDS in items.ts)
  itemBoxSize: 0.8, // m, half the size of an item box's pickup volume
  itemBoxRespawn: 5, // s an item box stays hidden after a ball hits it
  itemBoostSpeed: 8, // m/s the Blue & White Boost adds along the heading (top speed rises as for a pad)
  roarRadius: 6, // m around the roarer that the Lion Roar reaches
  roarSpeed: 12, // m/s of push away from the roarer at point blank, fading to 0 at roarRadius
  roarLift: 2, // m/s of hop at point blank
  spillBehind: 2, // m behind the ball where the Creamery Spill lands
  spillRadius: 2, // m
  spillSeconds: 10, // how long a puddle stays
  spillGrip: 0.2, // grip inside a puddle (like the Creamery's own puddles)
  snowDaySpeedMul: 0.7, // top speed multiplier for everyone ahead of a Snow Day
  snowDaySeconds: 3,

  // Interactables (interactables.ts): no button, you drive into them
  scoopRadius: 1, // m, a Creamery Scoop's pickup volume
  scoopRespawn: 6, // s a collected scoop stays gone
  scoopMax: 10, // scoops a racer can hold
  scoopTopSpeed: 0.012, // top speed multiplier per scoop held: +12% with all 10
  scoopBumpStrength: 0.6, // a bump this hard (0 … 1) knocks scoops off both balls
  scoopBumpLoss: 2,
  scoopRoarLoss: 3, // scoops a Lion Roar knocks off everyone it reaches (a respawn loses half)
  pawRadius: 1.1, // m, a Lion Paw bumper
  pawHeight: 1.4, // m
  pawKick: 13, // m/s: a ball leaves a paw at least this fast, straight out from it
  pawLift: 1.5, // m/s of hop

  // Keyboard adapter (local mode only)
  keySteerRate: 4, // steer units per second while A/D is held
  keyReturnRate: 6, // steer units per second back toward 0 when released or reversed

  // Chase camera
  camDistance: 6, // m behind the ball
  camHeight: 3, // m above the ball
  camStiffness: 8, // higher = the camera catches up faster
  camLookAhead: 2, // m ahead of the ball the camera looks at
  camFovBase: 1, // rad of vertical field of view at a standstill
  camFovMax: 1.2, // rad at camFovSpeed and above
  camFovSpeed: 24, // m/s where the field of view stops widening (past top speed, so boosts still widen it)
  camShake: 0.35, // m the look point wobbles on a strength 1 bump
  camShakeSeconds: 0.45, // how long a shake takes to die out
};

export type Tuning = typeof tuning;
