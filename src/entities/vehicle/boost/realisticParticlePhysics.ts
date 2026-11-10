import * as THREE from 'three';
import { boostParticleRuntimeConfig } from '../../../ui-core/config/vehicleTunerConfig.ts';
import {
  REALISTIC_DRIVE_COUNT,
  REALISTIC_DRIVE_LIFE,
  REALISTIC_DRIVE_RATE,
  REALISTIC_TRAIL_COUNT,
  REALISTIC_TRAIL_LIFE,
  REALISTIC_TRAIL_INTERVAL,
  REALISTIC_MAX_PARTICLES_PER_FRAME,
  CURVE_SCALE,
  CURVE_OPACITY,
  CURVE_VELOCITY,
  CURVE_DRIVE_SIZE,
  CURVE_DRIVE_COLOR,
  CURVE_DRIVE_OPACITY,
  CURVE_DYNAMIC_X,
  CURVE_DYNAMIC_Y,
  CURVE_DYNAMIC_Z,
  CURVE_DYNAMIC_W,
  evalCurveLut,
} from './boostCurves.ts';
import {
  stepDriveParticleSpawning,
  stepTrailSpawningByDistance,
  type DriveSpawnBufferState,
  type TrailDistanceSpawnState,
} from './boostTrailSpawnPipeline.ts';

import type { RealisticBoostParticleMesh } from './RealisticBoostParticleMesh.ts';

/**
 * Gold Rush Boost particle state machine, distance-based spawning, and physics updates.
 */
export class RealisticParticlePhysics implements DriveSpawnBufferState, TrailDistanceSpawnState {
  public readonly driveCount = REALISTIC_DRIVE_COUNT;
  public readonly driveSpawnRate = REALISTIC_DRIVE_RATE;
  public readonly maxParticlesPerFrame = REALISTIC_MAX_PARTICLES_PER_FRAME;
  public readonly baseSizeMin = 6.5;
  public readonly baseSizeSpan = 6;
  public readonly baseInterval = REALISTIC_TRAIL_INTERVAL;
  public readonly defaultTrailLife = REALISTIC_TRAIL_LIFE;
  public readonly randomizeStepInterval = true;

  public _scratchB = new THREE.Vector3();
  public _scratchC = new THREE.Vector3();
  public _scratchD = new THREE.Vector3();
  public currentNozzle = new THREE.Vector3();
  public drive: RealisticBoostParticleMesh;
  public driveAge = new Float32Array(REALISTIC_DRIVE_COUNT).fill(Infinity);
  public driveBaseSize = new Float32Array(REALISTIC_DRIVE_COUNT * 2);
  public driveHead = 0;
  public driveParticlesActive = false;
  public driveSpawnAccumulator = 0;
  public driveVelocity = new Float32Array(REALISTIC_DRIVE_COUNT * 3);
  public hasPreviousNozzle = false;
  public longSpawnRemainder = 0;
  public nozzleLocal: THREE.Vector3;
  public previousNozzle = new THREE.Vector3();
  public shortSpawnRemainder = 0;
  public spawnRemainder = 0;
  public trail: RealisticBoostParticleMesh;
  public trailAcceleration = new Float32Array(REALISTIC_TRAIL_COUNT);
  public trailAge = new Float32Array(REALISTIC_TRAIL_COUNT).fill(Infinity);
  public trailBaseSize = new Float32Array(REALISTIC_TRAIL_COUNT * 2);
  public trailHead = 0;
  public trailMaxLife = new Float32Array(REALISTIC_TRAIL_COUNT).fill(REALISTIC_TRAIL_LIFE);
  public trailOpacityWeight = new Float32Array(REALISTIC_TRAIL_COUNT).fill(1.0);
  public trailParticlesActive = false;
  public trailScaleRefLife = new Float32Array(REALISTIC_TRAIL_COUNT).fill(0.6);
  public trailVelocity = new Float32Array(REALISTIC_TRAIL_COUNT * 3);

  constructor(
    driveMesh: RealisticBoostParticleMesh,
    trailMesh: RealisticBoostParticleMesh,
    nozzleLocal: THREE.Vector3
  ) {
    this.drive = driveMesh;
    this.trail = trailMesh;
    this.nozzleLocal = nozzleLocal;
  }

  public get driveOffsets(): Float32Array {
    return this.drive.offsets;
  }
  public get driveRotations(): Float32Array {
    return this.drive.rotations;
  }
  public get scratchPrev(): THREE.Vector3 {
    return this._scratchB;
  }
  public get scratchDelta(): THREE.Vector3 {
    return this._scratchC;
  }
  public get scratchPos(): THREE.Vector3 {
    return this._scratchD;
  }

  reset(): void {
    if (!this.driveParticlesActive && !this.trailParticlesActive) {
      this.hasPreviousNozzle = false;
      this.spawnRemainder = 0;
      this.shortSpawnRemainder = 0;
      this.longSpawnRemainder = 0;
      return;
    }
    this.driveAge.fill(Infinity);
    this.trailAge.fill(Infinity);
    this.trailMaxLife.fill(REALISTIC_TRAIL_LIFE);
    this.trailScaleRefLife.fill(0.6);
    this.trailOpacityWeight.fill(1.0);
    this.drive.resetParticles();
    this.trail.resetParticles();
    this.driveParticlesActive = false;
    this.trailParticlesActive = false;
    this.hasPreviousNozzle = false;
    this.spawnRemainder = 0;
    this.shortSpawnRemainder = 0;
    this.longSpawnRemainder = 0;
    this.driveSpawnAccumulator = 0;
  }

  spawnDrive(dt: number): void {
    stepDriveParticleSpawning(this, dt);
  }

  spawnTrailByDistance(pos: THREE.Vector3, _dt?: number): void {
    stepTrailSpawningByDistance(this, pos);
  }

  spawnTrailParticle(
    pos: THREE.Vector3,
    customLifetime: number | null = null,
    customScaleRefLife: number | null = null,
    opacityWeight = 1.0
  ): void {
    const head = this.trailHead;
    this.trailHead = (head + 1) % REALISTIC_TRAIL_COUNT;
    const pIdx = head * 3;
    const sIdx = head * 2;
    const trailMesh = this.trail;

    trailMesh.offsets[pIdx] = pos.x;
    trailMesh.offsets[pIdx + 1] = pos.y;
    trailMesh.offsets[pIdx + 2] = pos.z;

    this.trailVelocity[pIdx] = 0;
    this.trailVelocity[pIdx + 1] = 0;
    this.trailVelocity[pIdx + 2] = 0;

    this.trailAcceleration[head] = 15 + Math.random() * 15;
    const sz = 35 + Math.random() * 15;
    this.trailBaseSize[sIdx] = sz;
    this.trailBaseSize[sIdx + 1] = sz;

    trailMesh.rotations[head] = Math.random() * Math.PI * 2;
    this.trailAge[head] = 0;
    this.trailMaxLife[head] =
      customLifetime !== null
        ? customLifetime
        : Math.max(
            0.08,
            REALISTIC_TRAIL_LIFE * (boostParticleRuntimeConfig.trailLifeMultiplier ?? 1.0)
          );
    this.trailScaleRefLife[head] =
      customScaleRefLife !== null
        ? customScaleRefLife
        : Math.max(0.1, Number(boostParticleRuntimeConfig.shortTrailScaleRefLife) || 0.6);
    this.trailOpacityWeight[head] = opacityWeight;
    this.trailParticlesActive = true;
  }

  updateDrive(dt: number): boolean {
    let active = false;
    const driveMesh = this.drive;
    const offsets = driveMesh.offsets;
    const sizes = driveMesh.sizes;
    const opacity = driveMesh.opacity;
    const colorScale = driveMesh.colorScale;
    const dynamic = driveMesh.dynamic;

    for (let i = 0; i < REALISTIC_DRIVE_COUNT; i++) {
      this.driveAge[i] += dt;
      const progress = this.driveAge[i] / REALISTIC_DRIVE_LIFE;
      const pIdx = i * 3;
      const sIdx = i * 2;

      if (progress >= 1) {
        opacity[i] = 0;
        sizes[sIdx] = 0;
        sizes[sIdx + 1] = 0;
        continue;
      }

      active = true;
      offsets[pIdx] += this.driveVelocity[pIdx] * dt;
      offsets[pIdx + 1] += this.driveVelocity[pIdx + 1] * dt;
      offsets[pIdx + 2] += this.driveVelocity[pIdx + 2] * dt;

      const sizeScale = evalCurveLut(CURVE_DRIVE_SIZE, progress);
      sizes[sIdx] = this.driveBaseSize[sIdx] * sizeScale;
      sizes[sIdx + 1] = this.driveBaseSize[sIdx + 1] * sizeScale;

      opacity[i] = evalCurveLut(CURVE_DRIVE_OPACITY, progress);
      colorScale[i] = evalCurveLut(CURVE_DRIVE_COLOR, progress);

      const dIdx = i * 4;
      dynamic[dIdx] = evalCurveLut(CURVE_DYNAMIC_X, progress);
      dynamic[dIdx + 1] = evalCurveLut(CURVE_DYNAMIC_Y, progress);
      dynamic[dIdx + 2] = 1;
      dynamic[dIdx + 3] = evalCurveLut(CURVE_DYNAMIC_W, progress);
    }
    this.driveParticlesActive = active;
    return active;
  }

  updateTrail(dt: number): boolean {
    let active = false;
    const useDistDecay = Boolean(boostParticleRuntimeConfig.distanceDecayEnabled);
    const falloffDist = Math.max(
      100,
      Number(boostParticleRuntimeConfig.distanceDecayFalloff) || 1200
    );
    const nozX = this.currentNozzle.x;
    const nozY = this.currentNozzle.y;
    const nozZ = this.currentNozzle.z;

    const trailMesh = this.trail;
    const offsets = trailMesh.offsets;
    const sizes = trailMesh.sizes;
    const opacity = trailMesh.opacity;
    const colorScale = trailMesh.colorScale;
    const dynamic = trailMesh.dynamic;

    for (let i = 0; i < REALISTIC_TRAIL_COUNT; i++) {
      this.trailAge[i] += dt;
      const age = this.trailAge[i];
      const effectiveLife = Math.max(0.05, this.trailMaxLife[i] || REALISTIC_TRAIL_LIFE);
      const lifeProgress = age / effectiveLife;
      const pIdx = i * 3;
      const sIdx = i * 2;

      if (lifeProgress >= 1) {
        opacity[i] = 0;
        sizes[sIdx] = 0;
        sizes[sIdx + 1] = 0;
        continue;
      }

      active = true;
      const scaleRefLife = Math.max(0.1, this.trailScaleRefLife[i] || 0.6);
      const scaleProgress = Math.min(1.0, age / scaleRefLife);

      const velScale = evalCurveLut(CURVE_VELOCITY, scaleProgress);
      this.trailVelocity[pIdx + 2] += this.trailAcceleration[i] * dt;
      offsets[pIdx] += this.trailVelocity[pIdx] * velScale * dt;
      offsets[pIdx + 1] += this.trailVelocity[pIdx + 1] * velScale * dt;
      offsets[pIdx + 2] += this.trailVelocity[pIdx + 2] * velScale * dt;

      let distAttenuation = 1.0;
      if (useDistDecay) {
        const dx = offsets[pIdx] - nozX;
        const dy = offsets[pIdx + 1] - nozY;
        const dz = offsets[pIdx + 2] - nozZ;
        const distFromCar = Math.sqrt(dx * dx + dy * dy + dz * dz);
        distAttenuation =
          1.0 - THREE.MathUtils.smoothstep(distFromCar, falloffDist * 0.15, falloffDist);
      }

      sizes[sIdx] = this.trailBaseSize[sIdx] * evalCurveLut(CURVE_SCALE, scaleProgress);
      sizes[sIdx + 1] = this.trailBaseSize[sIdx + 1];

      const rampInProgress = Math.max(scaleProgress, Math.min(0.35, lifeProgress * 0.7));
      const baseOpacity = evalCurveLut(CURVE_OPACITY, rampInProgress);
      const cutoffFade = 1.0 - THREE.MathUtils.smoothstep(lifeProgress, 0.45, 1.0);
      const weight = this.trailOpacityWeight[i] ?? 1.0;
      opacity[i] = baseOpacity * cutoffFade * distAttenuation * weight;
      colorScale[i] = 1;

      const dIdx = i * 4;
      dynamic[dIdx] = evalCurveLut(CURVE_DYNAMIC_X, scaleProgress);
      dynamic[dIdx + 1] = evalCurveLut(CURVE_DYNAMIC_Y, scaleProgress);
      dynamic[dIdx + 2] = 1;
      dynamic[dIdx + 3] = evalCurveLut(CURVE_DYNAMIC_Z, lifeProgress);
    }
    this.trailParticlesActive = active;
    return active;
  }
}
