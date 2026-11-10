import * as THREE from 'three';
import { boostParticleRuntimeConfig } from '../../../ui-core/config/vehicleTunerConfig.ts';

/**
 * boostTrailSpawnPipeline.ts
 * Pure distance-based dual-stream & single-stream trail particle spawning
 * and drive puff ring-buffer spawning for ArcadeParticlePhysics and RealisticParticlePhysics.
 */

export interface DriveSpawnBufferState {
  driveCount: number;
  driveSpawnRate: number;
  maxParticlesPerFrame: number;
  baseSizeMin: number;
  baseSizeSpan: number;
  driveHead: number;
  driveSpawnAccumulator: number;
  driveParticlesActive: boolean;
  driveAge: Float32Array;
  driveBaseSize: Float32Array;
  driveVelocity: Float32Array;
  driveOffsets: Float32Array;
  driveRotations: Float32Array;
  nozzleLocal: THREE.Vector3;
}

export interface TrailDistanceSpawnState {
  baseInterval: number;
  defaultTrailLife: number;
  maxParticlesPerFrame: number;
  randomizeStepInterval: boolean;
  currentNozzle: THREE.Vector3;
  previousNozzle: THREE.Vector3;
  hasPreviousNozzle: boolean;
  spawnRemainder: number;
  shortSpawnRemainder: number;
  longSpawnRemainder: number;
  scratchPrev: THREE.Vector3;
  scratchDelta: THREE.Vector3;
  scratchPos: THREE.Vector3;
  spawnTrailParticle(
    pos: THREE.Vector3,
    customLifetime: number | null,
    customScaleRefLife: number | null,
    opacityWeight: number
  ): void;
}

export function stepDriveParticleSpawning(state: DriveSpawnBufferState, dt: number): void {
  state.driveSpawnAccumulator += dt * state.driveSpawnRate;
  const prevIdx = (state.driveHead + state.driveCount - 1) % state.driveCount;
  if (!Number.isFinite(state.driveAge[prevIdx])) {
    state.driveSpawnAccumulator = Math.max(state.driveSpawnAccumulator, 1);
  }

  let spawned = 0;
  const offsets = state.driveOffsets;
  const vel = state.driveVelocity;
  const baseSize = state.driveBaseSize;
  const rotations = state.driveRotations;
  const age = state.driveAge;
  const nozX = state.nozzleLocal.x;
  const nozY = state.nozzleLocal.y;
  const nozZ = state.nozzleLocal.z;

  while (state.driveSpawnAccumulator >= 1 && spawned < state.maxParticlesPerFrame) {
    state.driveSpawnAccumulator -= 1;
    const head = state.driveHead;
    state.driveHead = (head + 1) % state.driveCount;
    const pIdx = head * 3;
    const sIdx = head * 2;

    offsets[pIdx] = nozX;
    offsets[pIdx + 1] = nozY;
    offsets[pIdx + 2] = nozZ;

    vel[pIdx] = -(50 + Math.random() * 50);
    vel[pIdx + 1] = -5 + Math.random() * 10;
    vel[pIdx + 2] = -5 + Math.random() * 10;

    const sz = state.baseSizeMin + Math.random() * state.baseSizeSpan;
    baseSize[sIdx] = sz;
    baseSize[sIdx + 1] = sz;

    rotations[head] = Math.random() * Math.PI * 2;
    age[head] = 0;
    state.driveParticlesActive = true;
    spawned++;
  }
}

function computeStreamStepRate(
  baseInterval: number,
  spawnMultiplier: number,
  randomizeStepInterval: boolean
): number {
  const factor = randomizeStepInterval ? Math.random() * 4 : 1;
  return (factor / baseInterval) * spawnMultiplier;
}

export function stepTrailSpawningByDistance(
  state: TrailDistanceSpawnState,
  pos: THREE.Vector3
): void {
  state.currentNozzle.copy(pos);

  const dualStream = Boolean(boostParticleRuntimeConfig.dualStreamEnabled);
  const baseSpawnMul = Math.max(
    0,
    boostParticleRuntimeConfig.trailSpawnMultiplier !== undefined
      ? boostParticleRuntimeConfig.trailSpawnMultiplier
      : 1.0
  );
  const shortMul = Math.max(
    0,
    boostParticleRuntimeConfig.shortTrailSpawnMultiplier !== undefined
      ? boostParticleRuntimeConfig.shortTrailSpawnMultiplier
      : 1.0
  );
  const longMul = Math.max(
    0,
    boostParticleRuntimeConfig.longTrailSpawnMultiplier !== undefined
      ? boostParticleRuntimeConfig.longTrailSpawnMultiplier
      : 0.1
  );

  if (dualStream ? shortMul <= 0.01 && longMul <= 0.01 : baseSpawnMul <= 0.01) {
    return;
  }

  if (!state.hasPreviousNozzle) {
    state.previousNozzle.copy(pos);
    state.hasPreviousNozzle = true;
    return;
  }

  state.scratchPrev.copy(state.previousNozzle);
  state.scratchDelta.subVectors(pos, state.scratchPrev);
  const dist = state.scratchDelta.length();
  if (dist < 1e-4) return;
  state.scratchDelta.divideScalar(dist);

  if (dist > 600) {
    state.previousNozzle.copy(pos);
    state.spawnRemainder = 0;
    state.shortSpawnRemainder = 0;
    state.longSpawnRemainder = 0;
    return;
  }

  const scaleRefLife = Math.max(
    0.1,
    Number(boostParticleRuntimeConfig.shortTrailScaleRefLife) || 0.6
  );

  if (dualStream) {
    const shortLife = Math.max(0.05, Number(boostParticleRuntimeConfig.shortTrailLifetime) || 0.1);
    const longLife = Math.max(
      shortLife + 0.05,
      Number(boostParticleRuntimeConfig.longTrailLifetime) || 2.0
    );
    const smoothBridge = boostParticleRuntimeConfig.smoothStreamTransition !== false;

    if (shortMul > 0.01) {
      const remS = state.shortSpawnRemainder;
      const stepS = computeStreamStepRate(
        state.baseInterval,
        shortMul,
        state.randomizeStepInterval
      );
      const progS = remS + dist * stepS;
      const countS = Math.floor(progS);
      const cappedS = Math.min(countS, state.maxParticlesPerFrame);
      state.shortSpawnRemainder = progS - countS;

      if (stepS > 0) {
        const bridgeSpan = Math.min(longLife, shortLife * 4.5);
        for (let i = 0; i < cappedS; i++) {
          const t = (i + 1 - remS) / stepS;
          state.scratchPos
            .copy(state.scratchPrev)
            .addScaledVector(state.scratchDelta, THREE.MathUtils.clamp(t, 0, dist));
          let particleLife = shortLife;
          let opacityWeight = 1.0;
          if (smoothBridge) {
            const u = Math.random();
            particleLife =
              shortLife * (0.85 + 0.3 * u) + (bridgeSpan - shortLife) * Math.pow(u, 2.8);
            const bridgeRatio = THREE.MathUtils.clamp(
              (particleLife - shortLife) / Math.max(0.05, bridgeSpan - shortLife),
              0,
              1
            );
            opacityWeight = 1.0 - 0.55 * Math.sqrt(bridgeRatio);
          }
          state.spawnTrailParticle(state.scratchPos, particleLife, scaleRefLife, opacityWeight);
        }
      }
    }

    if (longMul > 0.01) {
      const remL = state.longSpawnRemainder;
      const stepL = computeStreamStepRate(state.baseInterval, longMul, state.randomizeStepInterval);
      const progL = remL + dist * stepL;
      const countL = Math.floor(progL);
      const cappedL = Math.min(countL, state.maxParticlesPerFrame);
      state.longSpawnRemainder = progL - countL;

      if (stepL > 0) {
        for (let i = 0; i < cappedL; i++) {
          const t = (i + 1 - remL) / stepL;
          state.scratchPos
            .copy(state.scratchPrev)
            .addScaledVector(state.scratchDelta, THREE.MathUtils.clamp(t, 0, dist));
          const jitteredLongLife = smoothBridge
            ? longLife * (0.7 + 0.45 * Math.random())
            : longLife;
          const farRefLife = Math.max(scaleRefLife, jitteredLongLife * 0.65);
          state.spawnTrailParticle(
            state.scratchPos,
            jitteredLongLife,
            farRefLife,
            smoothBridge ? 0.78 : 1.0
          );
        }
      }
    }
  } else {
    const lifeMul =
      boostParticleRuntimeConfig.trailLifeMultiplier !== undefined
        ? boostParticleRuntimeConfig.trailLifeMultiplier
        : 1.0;
    const singleLife = Math.max(0.08, state.defaultTrailLife * lifeMul);
    const rem = state.spawnRemainder;
    const step = computeStreamStepRate(
      state.baseInterval,
      baseSpawnMul,
      state.randomizeStepInterval
    );
    const progress = rem + dist * step;
    const count = Math.floor(progress);
    const capped = Math.min(count, state.maxParticlesPerFrame);
    state.spawnRemainder = progress - count;

    if (step > 0) {
      for (let i = 0; i < capped; i++) {
        const t = (i + 1 - rem) / step;
        state.scratchPos
          .copy(state.scratchPrev)
          .addScaledVector(state.scratchDelta, THREE.MathUtils.clamp(t, 0, dist));
        state.spawnTrailParticle(state.scratchPos, singleLife, scaleRefLife, 1.0);
      }
    }
  }

  state.previousNozzle.copy(pos);
}
