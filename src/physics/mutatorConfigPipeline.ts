/**
 * mutatorConfigPipeline.ts
 * Zero-copy / marshaled TypeScript pipeline for reading, writing, and resetting the full 36-float
 * RocketSim MutatorConfig across the WebAssembly C-ABI boundary, plus time-indexed ball prediction queries.
 */

import type { RocketSimWasmModule } from './RocketSimWasm.ts';
import {
  DEFAULT_STANDARD_MUTATOR_CONFIG,
  MUTATOR_CONFIG_FLOAT_COUNT,
  MUTATOR_OFFSETS,
} from './RocketSimVehicleAndArenaSpecs.ts';

export interface ArenaMutatorConfig {
  gravityX: number;
  gravityY: number;
  gravityZ: number;
  carMass: number;
  carWorldFriction: number;
  carWorldRestitution: number;
  ballMass: number;
  ballMaxSpeed: number;
  ballDrag: number;
  ballWorldFriction: number;
  ballWorldRestitution: number;
  jumpAccel: number;
  jumpImmediateForce: number;
  boostAccelGround: number;
  boostAccelAir: number;
  boostUsedPerSecond: number;
  respawnDelay: number;
  bumpCooldownTime: number;
  boostPadCooldownBig: number;
  boostPadCooldownSmall: number;
  carSpawnBoostAmount: number;
  ballHitExtraForceScale: number;
  bumpForceScale: number;
  ballRadius: number;
  unlimitedFlips: boolean;
  unlimitedDoubleJumps: boolean;
  rechargeBoostEnabled: boolean;
  rechargeBoostPerSecond: number;
  rechargeBoostDelay: number;
  demoMode: number;
  enableTeamDemos: boolean;
  goalBaseThresholdY: number;
  useThrowbackGoalVolume: boolean;
  goalVolumeHalfWidthX: number;
  goalVolumeMinY: number;
  goalVolumeMaxY: number;
}

export function decodeMutatorConfigBuffer(buf: Float32Array): ArenaMutatorConfig {
  return {
    gravityX: buf[MUTATOR_OFFSETS.GRAVITY_X],
    gravityY: buf[MUTATOR_OFFSETS.GRAVITY_Y],
    gravityZ: buf[MUTATOR_OFFSETS.GRAVITY_Z],
    carMass: buf[MUTATOR_OFFSETS.CAR_MASS],
    carWorldFriction: buf[MUTATOR_OFFSETS.CAR_WORLD_FRICTION],
    carWorldRestitution: buf[MUTATOR_OFFSETS.CAR_WORLD_RESTITUTION],
    ballMass: buf[MUTATOR_OFFSETS.BALL_MASS],
    ballMaxSpeed: buf[MUTATOR_OFFSETS.BALL_MAX_SPEED],
    ballDrag: buf[MUTATOR_OFFSETS.BALL_DRAG],
    ballWorldFriction: buf[MUTATOR_OFFSETS.BALL_WORLD_FRICTION],
    ballWorldRestitution: buf[MUTATOR_OFFSETS.BALL_WORLD_RESTITUTION],
    jumpAccel: buf[MUTATOR_OFFSETS.JUMP_ACCEL],
    jumpImmediateForce: buf[MUTATOR_OFFSETS.JUMP_IMMEDIATE_FORCE],
    boostAccelGround: buf[MUTATOR_OFFSETS.BOOST_ACCEL_GROUND],
    boostAccelAir: buf[MUTATOR_OFFSETS.BOOST_ACCEL_AIR],
    boostUsedPerSecond: buf[MUTATOR_OFFSETS.BOOST_USED_PER_SECOND],
    respawnDelay: buf[MUTATOR_OFFSETS.RESPAWN_DELAY],
    bumpCooldownTime: buf[MUTATOR_OFFSETS.BUMP_COOLDOWN_TIME],
    boostPadCooldownBig: buf[MUTATOR_OFFSETS.BOOST_PAD_COOLDOWN_BIG],
    boostPadCooldownSmall: buf[MUTATOR_OFFSETS.BOOST_PAD_COOLDOWN_SMALL],
    carSpawnBoostAmount: buf[MUTATOR_OFFSETS.CAR_SPAWN_BOOST_AMOUNT],
    ballHitExtraForceScale: buf[MUTATOR_OFFSETS.BALL_HIT_EXTRA_FORCE_SCALE],
    bumpForceScale: buf[MUTATOR_OFFSETS.BUMP_FORCE_SCALE],
    ballRadius: buf[MUTATOR_OFFSETS.BALL_RADIUS],
    unlimitedFlips: buf[MUTATOR_OFFSETS.UNLIMITED_FLIPS] >= 0.5,
    unlimitedDoubleJumps: buf[MUTATOR_OFFSETS.UNLIMITED_DOUBLE_JUMPS] >= 0.5,
    rechargeBoostEnabled: buf[MUTATOR_OFFSETS.RECHARGE_BOOST_ENABLED] >= 0.5,
    rechargeBoostPerSecond: buf[MUTATOR_OFFSETS.RECHARGE_BOOST_PER_SECOND],
    rechargeBoostDelay: buf[MUTATOR_OFFSETS.RECHARGE_BOOST_DELAY],
    demoMode: Math.round(buf[MUTATOR_OFFSETS.DEMO_MODE]),
    enableTeamDemos: buf[MUTATOR_OFFSETS.ENABLE_TEAM_DEMOS] >= 0.5,
    goalBaseThresholdY: buf[MUTATOR_OFFSETS.GOAL_BASE_THRESHOLD_Y],
    useThrowbackGoalVolume: buf[MUTATOR_OFFSETS.USE_THROWBACK_GOAL_VOLUME] >= 0.5,
    goalVolumeHalfWidthX: buf[MUTATOR_OFFSETS.GOAL_VOLUME_HALF_WIDTH_X],
    goalVolumeMinY: buf[MUTATOR_OFFSETS.GOAL_VOLUME_MIN_Y],
    goalVolumeMaxY: buf[MUTATOR_OFFSETS.GOAL_VOLUME_MAX_Y],
  };
}

export function encodeMutatorConfigBuffer(
  cfg: ArenaMutatorConfig,
  out: Float32Array = new Float32Array(MUTATOR_CONFIG_FLOAT_COUNT)
): Float32Array {
  out[MUTATOR_OFFSETS.GRAVITY_X] = cfg.gravityX;
  out[MUTATOR_OFFSETS.GRAVITY_Y] = cfg.gravityY;
  out[MUTATOR_OFFSETS.GRAVITY_Z] = cfg.gravityZ;
  out[MUTATOR_OFFSETS.CAR_MASS] = cfg.carMass;
  out[MUTATOR_OFFSETS.CAR_WORLD_FRICTION] = cfg.carWorldFriction;
  out[MUTATOR_OFFSETS.CAR_WORLD_RESTITUTION] = cfg.carWorldRestitution;
  out[MUTATOR_OFFSETS.BALL_MASS] = cfg.ballMass;
  out[MUTATOR_OFFSETS.BALL_MAX_SPEED] = cfg.ballMaxSpeed;
  out[MUTATOR_OFFSETS.BALL_DRAG] = cfg.ballDrag;
  out[MUTATOR_OFFSETS.BALL_WORLD_FRICTION] = cfg.ballWorldFriction;
  out[MUTATOR_OFFSETS.BALL_WORLD_RESTITUTION] = cfg.ballWorldRestitution;
  out[MUTATOR_OFFSETS.JUMP_ACCEL] = cfg.jumpAccel;
  out[MUTATOR_OFFSETS.JUMP_IMMEDIATE_FORCE] = cfg.jumpImmediateForce;
  out[MUTATOR_OFFSETS.BOOST_ACCEL_GROUND] = cfg.boostAccelGround;
  out[MUTATOR_OFFSETS.BOOST_ACCEL_AIR] = cfg.boostAccelAir;
  out[MUTATOR_OFFSETS.BOOST_USED_PER_SECOND] = cfg.boostUsedPerSecond;
  out[MUTATOR_OFFSETS.RESPAWN_DELAY] = cfg.respawnDelay;
  out[MUTATOR_OFFSETS.BUMP_COOLDOWN_TIME] = cfg.bumpCooldownTime;
  out[MUTATOR_OFFSETS.BOOST_PAD_COOLDOWN_BIG] = cfg.boostPadCooldownBig;
  out[MUTATOR_OFFSETS.BOOST_PAD_COOLDOWN_SMALL] = cfg.boostPadCooldownSmall;
  out[MUTATOR_OFFSETS.CAR_SPAWN_BOOST_AMOUNT] = cfg.carSpawnBoostAmount;
  out[MUTATOR_OFFSETS.BALL_HIT_EXTRA_FORCE_SCALE] = cfg.ballHitExtraForceScale;
  out[MUTATOR_OFFSETS.BUMP_FORCE_SCALE] = cfg.bumpForceScale;
  out[MUTATOR_OFFSETS.BALL_RADIUS] = cfg.ballRadius;
  out[MUTATOR_OFFSETS.UNLIMITED_FLIPS] = cfg.unlimitedFlips ? 1.0 : 0.0;
  out[MUTATOR_OFFSETS.UNLIMITED_DOUBLE_JUMPS] = cfg.unlimitedDoubleJumps ? 1.0 : 0.0;
  out[MUTATOR_OFFSETS.RECHARGE_BOOST_ENABLED] = cfg.rechargeBoostEnabled ? 1.0 : 0.0;
  out[MUTATOR_OFFSETS.RECHARGE_BOOST_PER_SECOND] = cfg.rechargeBoostPerSecond;
  out[MUTATOR_OFFSETS.RECHARGE_BOOST_DELAY] = cfg.rechargeBoostDelay;
  out[MUTATOR_OFFSETS.DEMO_MODE] = cfg.demoMode;
  out[MUTATOR_OFFSETS.ENABLE_TEAM_DEMOS] = cfg.enableTeamDemos ? 1.0 : 0.0;
  out[MUTATOR_OFFSETS.GOAL_BASE_THRESHOLD_Y] = cfg.goalBaseThresholdY;
  out[MUTATOR_OFFSETS.USE_THROWBACK_GOAL_VOLUME] = cfg.useThrowbackGoalVolume ? 1.0 : 0.0;
  out[MUTATOR_OFFSETS.GOAL_VOLUME_HALF_WIDTH_X] = cfg.goalVolumeHalfWidthX;
  out[MUTATOR_OFFSETS.GOAL_VOLUME_MIN_Y] = cfg.goalVolumeMinY;
  out[MUTATOR_OFFSETS.GOAL_VOLUME_MAX_Y] = cfg.goalVolumeMaxY;
  return out;
}

export function readWasmMutatorConfig(wasmModule: RocketSimWasmModule | null): ArenaMutatorConfig {
  if (!wasmModule || typeof wasmModule._physics_getMutatorConfig !== 'function') {
    return { ...DEFAULT_STANDARD_MUTATOR_CONFIG };
  }
  const ptr = wasmModule._malloc(MUTATOR_CONFIG_FLOAT_COUNT * 4);
  if (!ptr) return { ...DEFAULT_STANDARD_MUTATOR_CONFIG };
  try {
    const ok = wasmModule._physics_getMutatorConfig(ptr) === 1;
    if (!ok) return { ...DEFAULT_STANDARD_MUTATOR_CONFIG };
    const view = new Float32Array(wasmModule.HEAPF32.buffer, ptr, MUTATOR_CONFIG_FLOAT_COUNT);
    return decodeMutatorConfigBuffer(view);
  } finally {
    wasmModule._free(ptr);
  }
}

export function writeWasmMutatorConfig(
  wasmModule: RocketSimWasmModule | null,
  partialOrBuffer: Partial<ArenaMutatorConfig> | Float32Array
): boolean {
  if (!wasmModule || typeof wasmModule._physics_setMutatorConfig !== 'function') {
    return false;
  }
  let encoded: Float32Array;
  if (
    partialOrBuffer instanceof Float32Array &&
    partialOrBuffer.length >= MUTATOR_CONFIG_FLOAT_COUNT
  ) {
    encoded = partialOrBuffer;
  } else {
    const base = readWasmMutatorConfig(wasmModule);
    const merged: ArenaMutatorConfig = {
      ...base,
      ...(partialOrBuffer as Partial<ArenaMutatorConfig>),
    };
    encoded = encodeMutatorConfigBuffer(merged);
  }
  const ptr = wasmModule._malloc(MUTATOR_CONFIG_FLOAT_COUNT * 4);
  if (!ptr) return false;
  try {
    const view = new Float32Array(wasmModule.HEAPF32.buffer, ptr, MUTATOR_CONFIG_FLOAT_COUNT);
    view.set(encoded.subarray(0, MUTATOR_CONFIG_FLOAT_COUNT));
    return wasmModule._physics_setMutatorConfig(ptr) === 1;
  } finally {
    wasmModule._free(ptr);
  }
}
