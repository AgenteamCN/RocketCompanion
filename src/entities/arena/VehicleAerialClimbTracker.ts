/**
 * VehicleAerialClimbTracker.ts
 * Background state machine that tracks per-vehicle aerial climb intent and active ascent
 * across frames, completely independent of whether the vehicle is currently on-screen or off-screen.
 *
 * Intent Trigger Modes:
 * 1. `hold-jump-pitch`: Car performs a held single jump (`jumpTime >= aerialClimbHoldJumpMinMs / 1000`)
 *    and pitches nose up (`fwdZ >= aerialClimbMinPitchFwdZ`) at/during jump release to climb.
 * 2. `double-jump`: Car expends its second jump/dodge in mid-air (`!hasFlipOrJump && !isFlipping && airTimeSinceJump > 0`).
 * 3. `both`: Either held single-jump with pitch-up OR double-jump triggers climb intent.
 *
 * Latch & Extinguish Lifecycle:
 * - Intent latches in the background as soon as triggered while airborne.
 * - Alert is active (`isClimbing === true`) whenever intent is latched AND
 *   altitude `posZ >= aerialClimbMinAltitudeUu` AND upward velocity `velZ >= aerialClimbMinVelZUu`.
 * - As soon as upward velocity drops below `aerialClimbMinVelZUu` (after having been active) or `velZ <= 0`,
 *   or the car touches the ground / gets demoed, the latched climb intent extinguishes immediately.
 */

import {
  DEFAULT_NAME_TAG_CONFIG,
  type NameTagAerialClimbTriggerMode,
  type NameTagAerialClimbTriggerReason,
  type NameTagConfig,
} from '../../ui-core/config/nameTagConfig.ts';

export interface CarAerialPhysicsSample {
  isOnGround: boolean;
  isDemoed: boolean;
  isJumping: boolean;
  isFlipping: boolean;
  hasFlipOrJump: boolean;
  jumpTimeSec: number;
  airTimeSinceJumpSec: number;
  posZUu: number;
  velZUu: number;
  fwdZ: number;
}

export interface CarAerialClimbStatus {
  isClimbing: boolean;
  intentLatched: boolean;
  triggerReason: NameTagAerialClimbTriggerReason;
  altitudeUu: number;
  velZUu: number;
  pitchFwdZ: number;
  maxJumpHoldMs: number;
}

interface InternalCarClimbSlot {
  wasOnGround: boolean;
  wasJumping: boolean;
  maxJumpHoldSec: number;
  pitchFwdZAtJumpEnd: number;
  holdJumpIntentLatched: boolean;
  doubleJumpIntentLatched: boolean;
  activeTriggerReason: NameTagAerialClimbTriggerReason;
  hasReachedActiveClimb: boolean;
  isClimbing: boolean;
  lastAltitudeUu: number;
  lastVelZUu: number;
  lastPitchFwdZ: number;
}

function createInitialSlot(): InternalCarClimbSlot {
  return {
    wasOnGround: true,
    wasJumping: false,
    maxJumpHoldSec: 0,
    pitchFwdZAtJumpEnd: 0,
    holdJumpIntentLatched: false,
    doubleJumpIntentLatched: false,
    activeTriggerReason: 'none',
    hasReachedActiveClimb: false,
    isClimbing: false,
    lastAltitudeUu: 17,
    lastVelZUu: 0,
    lastPitchFwdZ: 0,
  };
}

export interface CarAerialViewLike {
  boost?: number;
  isOnGround?: boolean;
  isDemoed?: boolean;
  isJumping?: boolean;
  isFlipping?: boolean;
  hasFlipOrJump?: boolean;
  jumpTime?: number;
  airTimeSinceJump?: number;
  posZ?: number;
  velZ?: number;
  fwdZ?: number;
}

export class VehicleAerialClimbTracker {
  private readonly slots: InternalCarClimbSlot[];
  public readonly carBoostAmounts: Float32Array;
  public readonly carVerticalVelZUu: Float32Array;
  public readonly carAirborneFlipExhausted: Uint8Array;
  public readonly carAerialClimbStatuses: CarAerialClimbStatus[];

  constructor(maxCars = 8) {
    this.slots = Array.from({ length: maxCars }, () => createInitialSlot());
    this.carBoostAmounts = new Float32Array(maxCars);
    this.carVerticalVelZUu = new Float32Array(maxCars);
    this.carAirborneFlipExhausted = new Uint8Array(maxCars);
    this.carAerialClimbStatuses = Array.from({ length: maxCars }, (_, idx) => this.getStatus(idx));
  }

  public reset(): void {
    for (let i = 0; i < this.slots.length; i++) {
      this.slots[i] = createInitialSlot();
      this.carAerialClimbStatuses[i] = this.getStatus(i);
    }
    this.carBoostAmounts.fill(0);
    this.carVerticalVelZUu.fill(0);
    this.carAirborneFlipExhausted.fill(0);
  }

  public stepCarFromView(
    carIndex: number,
    currCar: CarAerialViewLike,
    config: Pick<
      NameTagConfig,
      | 'aerialClimbTriggerMode'
      | 'aerialClimbMinAltitudeUu'
      | 'aerialClimbMinVelZUu'
      | 'aerialClimbHoldJumpMinMs'
      | 'aerialClimbMinPitchFwdZ'
    >
  ): void {
    if (carIndex < 0 || carIndex >= this.slots.length) return;
    this.carBoostAmounts[carIndex] = Number(currCar.boost) || 0;
    this.carVerticalVelZUu[carIndex] = Number(currCar.velZ) || 0;
    this.carAirborneFlipExhausted[carIndex] =
      !currCar.isOnGround && !currCar.isDemoed && !currCar.hasFlipOrJump ? 1 : 0;
    this.carAerialClimbStatuses[carIndex] = this.stepCar(
      carIndex,
      {
        isOnGround: Boolean(currCar.isOnGround),
        isDemoed: Boolean(currCar.isDemoed),
        isJumping: Boolean(currCar.isJumping),
        isFlipping: Boolean(currCar.isFlipping),
        hasFlipOrJump: Boolean(currCar.hasFlipOrJump),
        jumpTimeSec: Number(currCar.jumpTime) || 0,
        airTimeSinceJumpSec: Number(currCar.airTimeSinceJump) || 0,
        posZUu: Number(currCar.posZ) || 0,
        velZUu: Number(currCar.velZ) || 0,
        fwdZ: Number(currCar.fwdZ) || 0,
      },
      config
    );
  }

  public stepCar(
    carIndex: number,
    sample: CarAerialPhysicsSample,
    config: Pick<
      NameTagConfig,
      | 'aerialClimbTriggerMode'
      | 'aerialClimbMinAltitudeUu'
      | 'aerialClimbMinVelZUu'
      | 'aerialClimbHoldJumpMinMs'
      | 'aerialClimbMinPitchFwdZ'
    >
  ): CarAerialClimbStatus {
    if (carIndex < 0 || carIndex >= this.slots.length) {
      return {
        isClimbing: false,
        intentLatched: false,
        triggerReason: 'none',
        altitudeUu: sample.posZUu,
        velZUu: sample.velZUu,
        pitchFwdZ: sample.fwdZ,
        maxJumpHoldMs: 0,
      };
    }

    const slot = this.slots[carIndex];
    slot.lastAltitudeUu = sample.posZUu;
    slot.lastVelZUu = sample.velZUu;
    slot.lastPitchFwdZ = sample.fwdZ;

    if (sample.isOnGround || sample.isDemoed) {
      slot.wasOnGround = true;
      slot.wasJumping = false;
      slot.maxJumpHoldSec = 0;
      slot.pitchFwdZAtJumpEnd = 0;
      slot.holdJumpIntentLatched = false;
      slot.doubleJumpIntentLatched = false;
      slot.activeTriggerReason = 'none';
      slot.hasReachedActiveClimb = false;
      slot.isClimbing = false;
      return this.getStatus(carIndex);
    }

    const holdMinSec =
      Math.max(
        25,
        Number(config.aerialClimbHoldJumpMinMs) || DEFAULT_NAME_TAG_CONFIG.aerialClimbHoldJumpMinMs
      ) / 1000;
    const minPitchFwdZ = Number.isFinite(Number(config.aerialClimbMinPitchFwdZ))
      ? Number(config.aerialClimbMinPitchFwdZ)
      : DEFAULT_NAME_TAG_CONFIG.aerialClimbMinPitchFwdZ;
    const minAltitudeUu = Number.isFinite(Number(config.aerialClimbMinAltitudeUu))
      ? Number(config.aerialClimbMinAltitudeUu)
      : DEFAULT_NAME_TAG_CONFIG.aerialClimbMinAltitudeUu;
    const minVelZUu = Number.isFinite(Number(config.aerialClimbMinVelZUu))
      ? Number(config.aerialClimbMinVelZUu)
      : DEFAULT_NAME_TAG_CONFIG.aerialClimbMinVelZUu;
    const triggerMode: NameTagAerialClimbTriggerMode =
      config.aerialClimbTriggerMode || DEFAULT_NAME_TAG_CONFIG.aerialClimbTriggerMode;

    // 1. Track single jump hold duration & pitch angle
    if (sample.isJumping && sample.jumpTimeSec > slot.maxJumpHoldSec) {
      slot.maxJumpHoldSec = sample.jumpTimeSec;
    } else if (sample.jumpTimeSec > slot.maxJumpHoldSec) {
      slot.maxJumpHoldSec = sample.jumpTimeSec;
    }

    const justEndedSingleJump = slot.wasJumping && !sample.isJumping;
    if (justEndedSingleJump) {
      slot.pitchFwdZAtJumpEnd = sample.fwdZ;
    }

    const isHoldDurationMet = slot.maxJumpHoldSec >= holdMinSec;
    const isPitchUpMet =
      sample.fwdZ >= minPitchFwdZ ||
      (justEndedSingleJump && slot.pitchFwdZAtJumpEnd >= minPitchFwdZ);

    if (isHoldDurationMet && isPitchUpMet && sample.velZUu > 0) {
      slot.holdJumpIntentLatched = true;
    }

    // 2. Track double-jump / second jump expenditure in mid-air
    const expendedSecondJump =
      !sample.hasFlipOrJump &&
      !sample.isFlipping &&
      (sample.airTimeSinceJumpSec > 0.001 || slot.maxJumpHoldSec > 0.001);
    if (expendedSecondJump && sample.velZUu > 0) {
      slot.doubleJumpIntentLatched = true;
    }

    // 3. Extinguish latched intent immediately when upward velocity disappears
    if (sample.velZUu <= 0 || (slot.hasReachedActiveClimb && sample.velZUu < minVelZUu)) {
      slot.holdJumpIntentLatched = false;
      slot.doubleJumpIntentLatched = false;
      slot.activeTriggerReason = 'none';
      slot.isClimbing = false;
      slot.wasOnGround = false;
      slot.wasJumping = sample.isJumping;
      return this.getStatus(carIndex);
    }

    // 4. Evaluate trigger mode & thresholds
    let modeIntentMatches = false;
    let reason: NameTagAerialClimbTriggerReason = 'none';

    if (triggerMode === 'hold-jump-pitch') {
      if (slot.holdJumpIntentLatched) {
        modeIntentMatches = true;
        reason = 'hold-jump-pitch';
      }
    } else if (triggerMode === 'double-jump') {
      if (slot.doubleJumpIntentLatched) {
        modeIntentMatches = true;
        reason = 'double-jump';
      }
    } else {
      if (slot.doubleJumpIntentLatched) {
        modeIntentMatches = true;
        reason = 'double-jump';
      } else if (slot.holdJumpIntentLatched) {
        modeIntentMatches = true;
        reason = 'hold-jump-pitch';
      }
    }

    const meetsKinematics = sample.posZUu >= minAltitudeUu && sample.velZUu >= minVelZUu;

    if (modeIntentMatches && meetsKinematics) {
      slot.isClimbing = true;
      slot.hasReachedActiveClimb = true;
      slot.activeTriggerReason = reason;
    } else {
      slot.isClimbing = false;
      slot.activeTriggerReason = modeIntentMatches ? reason : 'none';
    }

    slot.wasOnGround = false;
    slot.wasJumping = sample.isJumping;
    return this.getStatus(carIndex);
  }

  public getStatus(carIndex: number): CarAerialClimbStatus {
    const slot = this.slots[carIndex];
    if (!slot) {
      return {
        isClimbing: false,
        intentLatched: false,
        triggerReason: 'none',
        altitudeUu: 0,
        velZUu: 0,
        pitchFwdZ: 0,
        maxJumpHoldMs: 0,
      };
    }
    return {
      isClimbing: slot.isClimbing,
      intentLatched: slot.holdJumpIntentLatched || slot.doubleJumpIntentLatched,
      triggerReason: slot.activeTriggerReason,
      altitudeUu: slot.lastAltitudeUu,
      velZUu: slot.lastVelZUu,
      pitchFwdZ: slot.lastPitchFwdZ,
      maxJumpHoldMs: Math.round(slot.maxJumpHoldSec * 1000),
    };
  }
}
