/**
 * vehicleAudioContracts.ts
 * Shared types, cooldown budgets, and small helpers for the vehicle one-shot/loop audio path.
 */

import type { SpatialPositionInput } from './SpatialAudioSource.ts';

export interface PhysicsImpactAudioEvent extends SpatialPositionInput {
  type?: number | string;
  subType?: number | string;
  actionSubType?: number;
  surfaceTag?: number | string;
  isCrossbar?: boolean;
  normalRelVel?: number;
  impulse?: number;
  speed?: number;
  relSpeed?: number;
  carIndex?: number;
  car1Index?: number;
  car2Index?: number;
  primaryId?: number;
  secondaryId?: number;
  padIndex?: number;
  isBig?: boolean;
  isSupersonic?: boolean;
  carPosX?: number;
  carPosY?: number;
  carPosZ?: number;
}

export const INCIDENT_COOLDOWN_MS = Object.freeze({
  GOAL_SCORED: 2500,
  CAR_CAR_DEMO: 90,
  CAR_CAR_BUMP_PAIR: 65,
  CAR_CAR_BUMP_GLOBAL: 35,
  BOOST_PICKUP_PER_PAD: 150,
  WHEEL_LANDING_PER_CAR: 140,
  BOOST_EDGE_PER_CAR: 45,
  JUMP_ACTION_PER_CAR: 45,
  SUPERSONIC_ENTER_PER_CAR: 250,
  FLIP_RESET_PER_CAR: 500,
});

export function calibrateWheelLandingModulation(downwardSpeedUU: number, isSelf: boolean) {
  const x = Math.max(0, Math.min(1, (Math.max(0, Math.abs(downwardSpeedUU)) - 180) / 1350));
  const intensity = x * x * (3 - 2 * x);
  return {
    category: 'wheel_landing' as const,
    volumeGainMultiplier: Math.max(
      0.35,
      Math.min(1.15, (0.45 + 0.6 * intensity) * (isSelf ? 1.0 : 0.88))
    ),
    distanceRadiusScale: Math.max(0.65, Math.min(1.2, 0.7 + 0.45 * intensity)),
    playbackRate: Math.max(0.92, Math.min(1.08, 0.94 + 0.12 * (1.0 - 0.5 * intensity))),
    priority: isSelf ? 4 : 2,
    normalizedIntensity: intensity,
  };
}

export interface VehicleAudioBuffers {
  jump: Array<AudioBuffer | null>;
  doubleJump: Array<AudioBuffer | null>;
  dodge: Array<AudioBuffer | null>;
  boostStart: AudioBuffer | null;
  boostLoop: AudioBuffer | null;
  boostRelease: AudioBuffer | null;
  supersonicEnter: Array<AudioBuffer | null>;
  supersonicLoop: AudioBuffer | null;
  reset: AudioBuffer | null;
  wheelImpact: Array<AudioBuffer | null>;
  carCollision: AudioBuffer | null;
  vehicleDetail: Array<AudioBuffer | null>;
}

export interface VehicleCarStateSnapshot {
  isBoosting?: boolean;
  isSupersonic?: boolean;
  isDemoed?: boolean;
  isOnGround?: boolean;
  velZ?: number;
  airTime?: number;
  getWheelContact?: (wheelIndex: number) => boolean;
}

export interface VehicleLandingTrackingState {
  wasGrounded: boolean;
  peakDownwardSpeedUU: number;
  airborneTicks: number;
}

export interface VehicleAudioUpdateContext {
  activeCarIndex?: number;
  numCars?: number;
  getCarPos?: ((carIndex: number) => SpatialPositionInput | null | undefined) | null;
  getCarState?: ((carIndex: number) => VehicleCarStateSnapshot | null | undefined) | null;
  isMatchActive?: boolean;
  hasBlockingOverlay?: boolean;
  continueOnBlur?: boolean;
  isHidden?: boolean;
}

export function stopSrc(src: AudioBufferSourceNode | null): void {
  if (!src) return;
  try {
    src.onended = null;
    src.stop();
    src.disconnect();
  } catch {
    /* ignore */
  }
}
