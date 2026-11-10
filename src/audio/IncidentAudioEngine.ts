import { audioConfig } from '../ui-core/config/audioConfig.ts';
import { getAudioSlotPool } from './audioContext.ts';
import { INCIDENT_EVENT_TYPES, PHYSICS_EVENT_TYPES } from '../physics/RocketSimConstants.ts';
import {
  WorldImpactAudioHandler,
  type PhysicsImpactAudioEvent,
} from './WorldImpactAudioHandler.ts';
import { type VehicleAudioManager } from './VehicleAudioManager.ts';
import { INCIDENT_COOLDOWN_MS } from './IncidentSpatialModulator.ts';
import {
  computeCarCollisionPairKey,
  createInitialIncidentAudioBuffers,
  evaluateBoostPickupPlayback,
  evaluateCarBallHitPlayback,
  evaluateCarCarCollisionPlayback,
  evaluateCarCarDemoPlayback,
  evaluateGoalScoredPlayback,
  isCarBallImpactAboveThreshold,
  isVehicleActionIncidentEvent,
  type IncidentAudioBuffers,
} from './incidentEventAcousticPipeline.ts';

export type { IncidentAudioBuffers };

export class IncidentAudioEngine {
  buffers: IncidentAudioBuffers;
  lastBallHitSoundIdx = -1;
  lastCarDemoSoundIdx = -1;
  lastBoostPickupByPad = new Map<number, number>();
  lastCarCollisionByPair = new Map<number, number>();
  lastCarDemoByVictim = new Map<number, number>();
  lastCarBallHitTimestamp = 0;
  lastCarCollisionTimestamp = 0;
  lastGoalScoredTimestamp = 0;
  vehicleManager: VehicleAudioManager | null;
  worldImpactHandler: WorldImpactAudioHandler;

  constructor(vehicleManager: VehicleAudioManager | null = null) {
    this.vehicleManager = vehicleManager;
    const initialBuffers = createInitialIncidentAudioBuffers();
    this.buffers = initialBuffers;
    this.worldImpactHandler = new WorldImpactAudioHandler(initialBuffers);
  }

  setBuffers(bufs: Partial<IncidentAudioBuffers>): void {
    this.buffers = { ...this.buffers, ...bufs };
    this.worldImpactHandler.setBuffers(this.buffers);
  }

  handleEvent(event: PhysicsImpactAudioEvent | null | undefined, camera: unknown = null): void {
    if (!event) return;
    const type = event.type;

    if (isVehicleActionIncidentEvent(type)) {
      this.vehicleManager?.handleCarEvent(event);
      return;
    }

    switch (type) {
      case INCIDENT_EVENT_TYPES.CAR_BALL_HIT:
      case PHYSICS_EVENT_TYPES.CAR_BALL_HIT:
        this.handleCarBallHit(event, camera);
        break;

      case INCIDENT_EVENT_TYPES.CAR_CAR_BUMP:
      case INCIDENT_EVENT_TYPES.CAR_CAR_COLLISION:
      case PHYSICS_EVENT_TYPES.CAR_CAR_COLLISION:
        this.handleCarCarCollision(event, camera);
        break;

      case INCIDENT_EVENT_TYPES.CAR_CAR_DEMO:
      case PHYSICS_EVENT_TYPES.CAR_DEMO:
        this.handleCarCarDemo(event, camera);
        break;

      case INCIDENT_EVENT_TYPES.BALL_WORLD_HIT:
      case PHYSICS_EVENT_TYPES.BALL_WORLD_HIT:
        this.worldImpactHandler.handleBallWorldHit(event, camera);
        break;

      case INCIDENT_EVENT_TYPES.BALL_GOALPOST_HIT:
      case PHYSICS_EVENT_TYPES.BALL_GOALPOST_HIT:
        this.worldImpactHandler.handleBallGoalpostHit(event, camera);
        break;

      case INCIDENT_EVENT_TYPES.BOOST_PICKUP:
      case PHYSICS_EVENT_TYPES.BOOST_PICKUP:
      case 0x0a:
        this.handleBoostPickup(event, camera);
        break;

      case INCIDENT_EVENT_TYPES.GOAL_SCORED:
      case 0x0e:
        this.handleGoalScored(event, camera);
        break;

      default:
        break;
    }
  }

  handleCarBallHit(event: PhysicsImpactAudioEvent, _camera: unknown = null): void {
    const now = performance.now();
    const cooldownMs = Number(audioConfig.get('carBallHitCooldownMs') ?? 0);
    if (now - this.lastCarBallHitTimestamp < cooldownMs) return;

    const { passes, threshold } = isCarBallImpactAboveThreshold(event);
    if (!passes) return;

    this.lastCarBallHitTimestamp = now;
    const pool = getAudioSlotPool();
    if (!pool) return;

    const activeCarIndex = this.vehicleManager?.activeCarIndex ?? 0;
    const resolved = evaluateCarBallHitPlayback(
      event,
      this.buffers,
      activeCarIndex,
      threshold,
      this.lastBallHitSoundIdx
    );
    if (!resolved) return;

    if (resolved.nextSoundIdx !== undefined) {
      this.lastBallHitSoundIdx = resolved.nextSoundIdx;
    }
    pool.playBuffer(resolved.buffer, resolved.options);
  }

  handleCarCarCollision(event: PhysicsImpactAudioEvent, _camera: unknown = null): void {
    const now = performance.now();
    if (now - this.lastCarCollisionTimestamp < INCIDENT_COOLDOWN_MS.CAR_CAR_BUMP_GLOBAL) return;

    const pairKey = computeCarCollisionPairKey(event);
    const lastPairMs = this.lastCarCollisionByPair.get(pairKey) || 0;
    if (now - lastPairMs < INCIDENT_COOLDOWN_MS.CAR_CAR_BUMP_PAIR) return;

    this.lastCarCollisionTimestamp = now;
    this.lastCarCollisionByPair.set(pairKey, now);

    const pool = getAudioSlotPool();
    if (!pool) return;

    const activeCarIndex = this.vehicleManager?.activeCarIndex ?? 0;
    const resolved = evaluateCarCarCollisionPlayback(event, this.buffers, activeCarIndex);
    if (!resolved) return;

    pool.playBuffer(resolved.buffer, resolved.options);
  }

  handleCarCarDemo(event: PhysicsImpactAudioEvent, _camera: unknown = null): void {
    const now = performance.now();
    const victimKey =
      event.car2Index ?? event.secondaryId ?? event.carIndex ?? event.primaryId ?? -1;
    if (victimKey >= 0) {
      const lastDemoMs = this.lastCarDemoByVictim.get(victimKey) || 0;
      if (now - lastDemoMs < INCIDENT_COOLDOWN_MS.CAR_CAR_DEMO) return;
      this.lastCarDemoByVictim.set(victimKey, now);
    }

    const pool = getAudioSlotPool();
    if (!pool) return;

    const resolved = evaluateCarCarDemoPlayback(event, this.buffers, this.lastCarDemoSoundIdx);
    if (!resolved) return;

    if (resolved.nextSoundIdx !== undefined) {
      this.lastCarDemoSoundIdx = resolved.nextSoundIdx;
    }
    pool.playBuffer(resolved.buffer, resolved.options);
  }

  handleBoostPickup(event: PhysicsImpactAudioEvent, _camera: unknown = null): void {
    const pool = getAudioSlotPool();
    if (!pool || !this.buffers.boostCollect) return;

    const now = performance.now();
    const padKey = event.padIndex !== undefined ? event.padIndex : (event.secondaryId ?? -1);
    if (padKey >= 0) {
      const lastPickup = this.lastBoostPickupByPad.get(padKey) || 0;
      if (now - lastPickup < INCIDENT_COOLDOWN_MS.BOOST_PICKUP_PER_PAD) return;
      this.lastBoostPickupByPad.set(padKey, now);
    }

    const activeCarIndex = this.vehicleManager?.activeCarIndex ?? 0;
    const resolved = evaluateBoostPickupPlayback(event, this.buffers, activeCarIndex);
    if (!resolved) return;

    pool.playBuffer(resolved.buffer, resolved.options);
  }

  handleGoalScored(event: PhysicsImpactAudioEvent, _camera: unknown = null): void {
    const now = performance.now();
    if (
      this.lastGoalScoredTimestamp &&
      now - this.lastGoalScoredTimestamp < INCIDENT_COOLDOWN_MS.GOAL_SCORED
    ) {
      return;
    }
    this.lastGoalScoredTimestamp = now;

    const pool = getAudioSlotPool();
    if (!pool) return;

    const resolved = evaluateGoalScoredPlayback(event, this.buffers);
    if (!resolved) return;

    pool.playBuffer(resolved.buffer, resolved.options);
  }
}
