/**
 * RocketSimVehicleAndArenaSpecs.ts
 * Vehicle hitbox preset dimensions, wheel suspension constants, arena geometry extents,
 * and standard mutator configuration specifications for RocketSim physics simulation.
 */

export const WHEEL_COUNT = 4;
export const WHEEL_STATE_STRIDE = 3;
export const WHEEL_OFFSETS = Object.freeze({
  CONTACT: 0,
  SUS_LENGTH: 1,
  WHEEL_SPEED: 2,
});

export const WASM_WHEEL_OFFSETS = Object.freeze({
  SUS_LENGTH: 0,
  STEER_ANGLE: 1,
  HAS_CONTACT: 2,
});

export const CAR_MAX_SPEED = 2300;
export const SUPERSONIC_SPEED_THRESHOLD = 2200;

export const ARENA_EXTENTS = Object.freeze({
  X: 4096,
  Y: 5120,
  Z: 2048,
  WIDTH: 8192,
  LENGTH: 10240,
  HEIGHT: 2048,
});

export const GOAL_EXTENTS = Object.freeze({
  WIDTH: 1785.51,
  DEPTH: 880,
  HEIGHT: 642.775,
});

export const TEAMS = Object.freeze({
  BLUE: 0,
  ORANGE: 1,
});

export const HITBOX_PRESETS = Object.freeze({
  OCTANE: {
    name: 'Octane',
    size: [120.507, 86.6994, 38.6591],
    offset: [13.8757, 0, 20.755],
    frontWheels: { radius: 12.5, susRest: 38.755, offset: [51.25, 25.9, 20.755] },
    backWheels: { radius: 15.0, susRest: 37.055, offset: [-33.75, 29.5, 20.755] },
  },
  DOMINUS: {
    name: 'Dominus',
    size: [130.427, 85.7799, 33.8],
    offset: [9.0, 0, 15.75],
    frontWheels: { radius: 12.0, susRest: 33.95, offset: [50.3, 31.1, 15.75] },
    backWheels: { radius: 13.5, susRest: 33.85, offset: [-34.75, 33.0, 15.75] },
  },
  PLANK: {
    name: 'Plank',
    size: [131.32, 87.1704, 31.8944],
    offset: [9.00857, 0, 12.0942],
    frontWheels: { radius: 12.5, susRest: 31.9242, offset: [49.97, 27.8, 12.0942] },
    backWheels: { radius: 17.0, susRest: 27.9242, offset: [-35.43, 20.28, 12.0942] },
  },
  BREAKOUT: {
    name: 'Breakout',
    size: [133.992, 83.021, 32.8],
    offset: [12.5, 0, 11.75],
    frontWheels: { radius: 13.5, susRest: 29.7, offset: [51.5, 26.67, 11.75] },
    backWheels: { radius: 15.0, susRest: 29.666, offset: [-35.75, 35.0, 11.75] },
  },
  HYBRID: {
    name: 'Hybrid',
    size: [129.519, 84.6879, 36.6591],
    offset: [13.8757, 0, 20.755],
    frontWheels: { radius: 12.5, susRest: 38.755, offset: [51.25, 25.9, 20.755] },
    backWheels: { radius: 15.0, susRest: 37.055, offset: [-34.0, 29.5, 20.755] },
  },
  MERC: {
    name: 'Merc',
    size: [123.22, 79.2103, 44.1591],
    offset: [11.3757, 0, 21.505],
    frontWheels: { radius: 15.0, susRest: 39.505, offset: [51.25, 25.9, 21.505] },
    backWheels: { radius: 15.0, susRest: 39.105, offset: [-33.75, 29.5, 21.505] },
  },
  PSYCLOPS: {
    name: 'Psyclops (Three-Wheeler)',
    size: [120.641, 86.8334, 38.7931],
    offset: [13.8757, 0, 15.0],
    threeWheels: true,
    frontWheels: { radius: 12.5, susRest: 33.0, offset: [51.25, 5.0, 15.0] },
    backWheels: { radius: 15.0, susRest: 31.3, offset: [-33.75, 29.5, 15.0] },
  },
});

export const MUTATOR_CONFIG_FLOAT_COUNT = 36;
export const MUTATOR_OFFSETS = Object.freeze({
  GRAVITY_X: 0,
  GRAVITY_Y: 1,
  GRAVITY_Z: 2,
  CAR_MASS: 3,
  CAR_WORLD_FRICTION: 4,
  CAR_WORLD_RESTITUTION: 5,
  BALL_MASS: 6,
  BALL_MAX_SPEED: 7,
  BALL_DRAG: 8,
  BALL_WORLD_FRICTION: 9,
  BALL_WORLD_RESTITUTION: 10,
  JUMP_ACCEL: 11,
  JUMP_IMMEDIATE_FORCE: 12,
  BOOST_ACCEL_GROUND: 13,
  BOOST_ACCEL_AIR: 14,
  BOOST_USED_PER_SECOND: 15,
  RESPAWN_DELAY: 16,
  BUMP_COOLDOWN_TIME: 17,
  BOOST_PAD_COOLDOWN_BIG: 18,
  BOOST_PAD_COOLDOWN_SMALL: 19,
  CAR_SPAWN_BOOST_AMOUNT: 20,
  BALL_HIT_EXTRA_FORCE_SCALE: 21,
  BUMP_FORCE_SCALE: 22,
  BALL_RADIUS: 23,
  UNLIMITED_FLIPS: 24,
  UNLIMITED_DOUBLE_JUMPS: 25,
  RECHARGE_BOOST_ENABLED: 26,
  RECHARGE_BOOST_PER_SECOND: 27,
  RECHARGE_BOOST_DELAY: 28,
  DEMO_MODE: 29,
  ENABLE_TEAM_DEMOS: 30,
  GOAL_BASE_THRESHOLD_Y: 31,
  USE_THROWBACK_GOAL_VOLUME: 32,
  GOAL_VOLUME_HALF_WIDTH_X: 33,
  GOAL_VOLUME_MIN_Y: 34,
  GOAL_VOLUME_MAX_Y: 35,
});

export const DEFAULT_STANDARD_MUTATOR_CONFIG = Object.freeze({
  gravityX: 0.0,
  gravityY: 0.0,
  gravityZ: -650.0,
  carMass: 180.0,
  carWorldFriction: 0.3,
  carWorldRestitution: 0.3,
  ballMass: 30.0,
  ballMaxSpeed: 6000.0,
  ballDrag: 0.03,
  ballWorldFriction: 0.35,
  ballWorldRestitution: 0.6,
  jumpAccel: 1458.3333,
  jumpImmediateForce: 291.667,
  boostAccelGround: 991.666,
  boostAccelAir: 1058.333,
  boostUsedPerSecond: 33.333,
  respawnDelay: 3.0,
  bumpCooldownTime: 0.25,
  boostPadCooldownBig: 10.0,
  boostPadCooldownSmall: 4.0,
  carSpawnBoostAmount: 33.333,
  ballHitExtraForceScale: 1.0,
  bumpForceScale: 1.0,
  ballRadius: 91.25,
  unlimitedFlips: false,
  unlimitedDoubleJumps: false,
  rechargeBoostEnabled: false,
  rechargeBoostPerSecond: 10.0,
  rechargeBoostDelay: 0.25,
  demoMode: 0,
  enableTeamDemos: false,
  goalBaseThresholdY: 5120.25,
  useThrowbackGoalVolume: false,
  goalVolumeHalfWidthX: 940.0,
  goalVolumeMinY: 4922.0,
  goalVolumeMaxY: 5460.0,
});
