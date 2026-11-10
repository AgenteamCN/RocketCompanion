/**
 * IncidentSpatialModulator.ts
 * Pure acoustic modulation, distance radius scaling, pitch variation, and priority/cooldown
 * calibration pipeline for discrete physics incidents and vehicle actions.
 *
 * Calibrates physical kinetic intensity (impulse, relative speed, normal velocity, pad size,
 * and self-vs-remote vehicle ownership) into:
 * - Dynamic volume modulation (preserving full config volume while differentiating light vs heavy hits)
 * - Dynamic distance radius scaling (`distanceRadiusScale`, expanding or tightening effective propagation range)
 * - Subtle pitch / playbackRate variation for organic transient snap
 * - Deterministic voice slot priority & anti-spam cooldown hierarchy (ensuring Goal=10 and Demolish=9
 *   are never preempted by surface or pad noise)
 */

import { type AudioAttenuationCategory } from '../ui-core/config/spatialAttenuationProfiles.ts';
import { SURFACE_SUBTYPES } from '../physics/RocketSimConstants.ts';
import { type SpatialPositionInput } from './spatialAudioMath.ts';

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

export const INCIDENT_SLOT_PRIORITY = Object.freeze({
  GOAL_EXPLOSION: 10,
  DEMOLISH: 9,
  SIGNAL_BROADCAST: 8,
  GOALPOST_PING_LARGE: 8,
  GOALPOST_PING_SMALL: 7,
  CAR_BALL_HIT_HEAVY: 7,
  CAR_BALL_HIT_BASE: 6,
  CAR_CAR_BUMP_HEAVY: 6,
  CAR_CAR_BUMP_BASE: 5,
  BOOST_PICKUP_SELF_BIG: 5,
  BOOST_PICKUP_SELF_SMALL: 4,
  WORLD_NET_BACKBOARD_HIT: 4,
  WORLD_RAMP_HIT: 3,
  WORLD_FLOOR_HIT: 2,
  BOOST_PICKUP_OTHER: 2,
});

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

export interface IncidentSpatialModulationResult {
  category: AudioAttenuationCategory;
  volumeGainMultiplier: number;
  distanceRadiusScale: number;
  playbackRate: number;
  priority: number;
  normalizedIntensity: number;
}

function clamp(val: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, val));
}

function smoothstep01(t: number): number {
  const x = clamp(t, 0, 1);
  return x * x * (3 - 2 * x);
}

/**
 * Extracts normalized kinetic intensity [0..1] from a Car-Ball impact event.
 * RocketSim car-ball impulses/relative speeds typically span ~120 UU/s (soft touch/dribble)
 * up to ~2800+ UU/s (boomer/pinch).
 */
export function computeCarBallImpactIntensity(
  event: PhysicsImpactAudioEvent,
  threshold = 80
): number {
  const rawImpulse =
    Number.isFinite(event.impulse) && (event.impulse as number) > 0 ? (event.impulse as number) : 0;
  const rawSpeed =
    Number.isFinite(event.relSpeed) && (event.relSpeed as number) > 0
      ? (event.relSpeed as number)
      : Number.isFinite(event.speed)
        ? Math.abs(event.speed as number)
        : 0;
  const metric = Math.max(rawImpulse, rawSpeed);
  const floor = Math.max(0, Number.isFinite(threshold) ? threshold : 80);
  const span = Math.max(400, 2400 - floor);
  const normalized = clamp((metric - floor) / span, 0, 1);
  const supersonicBonus = event.isSupersonic ? 0.12 : 0;
  return clamp(smoothstep01(normalized) + supersonicBonus, 0, 1);
}

/**
 * Calibrates Car-Ball Hit spatial audio parameters from impact kinetics and active car ownership.
 * Heavy boomers propagate farther across the pitch (up to 1.28x radius) and claim higher slot priority,
 * while soft dribble touches stay tighter (0.78x radius) with gentle transient dynamics.
 */
export function calibrateCarBallHitModulation(
  event: PhysicsImpactAudioEvent,
  activeCarIndex = 0,
  impulseThreshold = 80
): IncidentSpatialModulationResult {
  const intensity = computeCarBallImpactIntensity(event, impulseThreshold);
  const hitCarIdx = event.carIndex ?? event.primaryId ?? -1;
  const isSelfTouch = hitCarIdx === activeCarIndex;

  // Volume multiplier: soft touches ~0.62x, medium hits ~0.92x, power clears ~1.18x (self gets slight tactile presence)
  const baseVolMult = 0.62 + 0.56 * Math.pow(intensity, 0.75);
  const selfPresence = isSelfTouch ? 1.06 : 1.0;
  const volumeGainMultiplier = clamp(baseVolMult * selfPresence, 0.45, 1.3);

  // Propagation radius scale: soft touches attenuate faster (0.78x), power shots carry across field (1.28x)
  const distanceRadiusScale = clamp(0.78 + 0.5 * intensity, 0.75, 1.35);

  // Subtle pitch contour: heavier hits have slightly deeper body, crisp fast snaps slightly brighter
  const playbackRate = clamp(0.96 + 0.08 * intensity, 0.92, 1.08);

  const priority =
    intensity >= 0.65 || isSelfTouch
      ? INCIDENT_SLOT_PRIORITY.CAR_BALL_HIT_HEAVY
      : INCIDENT_SLOT_PRIORITY.CAR_BALL_HIT_BASE;

  return {
    category: 'car_ball_hit',
    volumeGainMultiplier,
    distanceRadiusScale,
    playbackRate,
    priority,
    normalizedIntensity: intensity,
  };
}

/**
 * Calibrates Car-Car Bump (non-demolish collision) spatial parameters.
 * Distinguishes light wheel-to-wheel rubs from high-speed tactical bumps and checks if local car is involved.
 */
export function calibrateCarBumpModulation(
  event: PhysicsImpactAudioEvent,
  activeCarIndex = 0
): IncidentSpatialModulationResult {
  const relSpeed = Math.abs(event.relSpeed ?? event.speed ?? event.impulse ?? 600);
  const intensity = smoothstep01((relSpeed - 180) / 1900);

  const car1 = event.car1Index ?? event.carIndex ?? event.primaryId ?? -1;
  const car2 = event.car2Index ?? event.secondaryId ?? -1;
  const involvesSelf = car1 === activeCarIndex || car2 === activeCarIndex;

  const volumeGainMultiplier = clamp(
    (0.6 + 0.52 * intensity) * (involvesSelf ? 1.12 : 1.0),
    0.45,
    1.3
  );
  const distanceRadiusScale = clamp(
    (0.75 + 0.45 * intensity) * (involvesSelf ? 1.15 : 1.0),
    0.7,
    1.3
  );
  const playbackRate = clamp(0.95 + 0.1 * intensity, 0.9, 1.1);
  const priority =
    involvesSelf || intensity >= 0.6
      ? INCIDENT_SLOT_PRIORITY.CAR_CAR_BUMP_HEAVY
      : INCIDENT_SLOT_PRIORITY.CAR_CAR_BUMP_BASE;

  return {
    category: 'car_bump',
    volumeGainMultiplier,
    distanceRadiusScale,
    playbackRate,
    priority,
    normalizedIntensity: intensity,
  };
}

/**
 * Calibrates Ball-World surface impact (Floor, Sidewall/Ceiling/Backboard Net, or Ramp)
 * using normal relative velocity (`normalRelVel`) and total speed.
 */
export function calibrateWorldSurfaceModulation(
  event: PhysicsImpactAudioEvent,
  surfaceKind: 'floor' | 'net' | 'ramp',
  threshold = 140
): IncidentSpatialModulationResult {
  const normalVel = Math.abs(
    typeof event.normalRelVel === 'number' && Number.isFinite(event.normalRelVel)
      ? event.normalRelVel
      : (event.speed ?? event.relSpeed ?? threshold)
  );
  const floor = Math.max(0, Number.isFinite(threshold) ? threshold : 140);
  const intensity = smoothstep01((normalVel - floor) / 1650);

  const isBackboard = event.surfaceTag === SURFACE_SUBTYPES.BACKBOARD || event.surfaceTag === 4;
  const backboardBoost = isBackboard ? 1.12 : 1.0;

  const volumeGainMultiplier = clamp((0.52 + 0.58 * intensity) * backboardBoost, 0.4, 1.25);
  const distanceRadiusScale = clamp(
    (0.72 + 0.48 * intensity) * (isBackboard ? 1.15 : 1.0),
    0.65,
    1.35
  );
  const playbackRate = clamp(0.95 + 0.1 * intensity, 0.9, 1.08);

  let priority: number = INCIDENT_SLOT_PRIORITY.WORLD_FLOOR_HIT;
  if (surfaceKind === 'net') {
    priority = INCIDENT_SLOT_PRIORITY.WORLD_NET_BACKBOARD_HIT;
  } else if (surfaceKind === 'ramp') {
    priority = INCIDENT_SLOT_PRIORITY.WORLD_RAMP_HIT;
  }

  return {
    category: 'world_surface',
    volumeGainMultiplier,
    distanceRadiusScale,
    playbackRate,
    priority,
    normalizedIntensity: intensity,
  };
}

/**
 * Calibrates Crossbar / Goalpost Ping impact parameters.
 * High-velocity shots (>= 1400 UU/s) route to 'goalpost_ping_large' (Tactical Global archetype),
 * while softer post grazes route to 'goalpost_ping_small' (Primary Gameplay archetype) with scaled radius.
 */
export function calibrateGoalpostPingModulation(
  event: PhysicsImpactAudioEvent,
  threshold = 160
): IncidentSpatialModulationResult & { isPingLarge: boolean } {
  const impactVal = Math.abs(event.normalRelVel || event.impulse || event.speed || 0);
  const ballSpeed = Math.abs(event.speed || event.relSpeed || event.normalRelVel || impactVal);
  const isPingLarge = ballSpeed >= 1400;
  const floor = Math.max(0, Number.isFinite(threshold) ? threshold : 160);

  const intensity = isPingLarge
    ? smoothstep01((ballSpeed - 1400) / 1400)
    : smoothstep01((ballSpeed - floor) / Math.max(200, 1400 - floor));

  const category: AudioAttenuationCategory = isPingLarge
    ? 'goalpost_ping_large'
    : 'goalpost_ping_small';

  const volumeGainMultiplier = isPingLarge
    ? clamp(0.85 + 0.3 * intensity, 0.8, 1.2)
    : clamp(0.6 + 0.4 * intensity, 0.5, 1.05);

  const distanceRadiusScale = isPingLarge
    ? clamp(0.92 + 0.23 * intensity, 0.9, 1.2)
    : clamp(0.75 + 0.3 * intensity, 0.7, 1.1);

  const playbackRate = isPingLarge
    ? clamp(0.98 + 0.05 * intensity, 0.96, 1.04)
    : clamp(0.97 + 0.06 * intensity, 0.95, 1.05);

  const priority = isPingLarge
    ? INCIDENT_SLOT_PRIORITY.GOALPOST_PING_LARGE
    : INCIDENT_SLOT_PRIORITY.GOALPOST_PING_SMALL;

  return {
    category,
    isPingLarge,
    volumeGainMultiplier,
    distanceRadiusScale,
    playbackRate,
    priority,
    normalizedIntensity: intensity,
  };
}

/**
 * Calibrates Boost Pad Pickup parameters with explicit Self vs Remote Car and Big Orb (100) vs Small Pad (12)
 * differentiation:
 * - Self pickup: plays as crisp 2D / non-attenuated tactile feedback (full volume, high priority).
 * - Remote car pickup: plays as 3D world-positioned cue under 'boost_pickup' (hard-culled beyond R_max),
 *   with big corner/mid orbs carrying farther (1.0x radius, 0.85x gain) and small pads staying local
 *   (0.68x radius, 0.62x gain, low priority 2 so they never steal combat slots).
 */
export function calibrateBoostPickupModulation(
  event: PhysicsImpactAudioEvent,
  activeCarIndex = 0
): IncidentSpatialModulationResult & { isSelfPickup: boolean; isBigPad: boolean } {
  const rawCarIdx = event.carIndex ?? event.primaryId ?? -1;
  const resolvedCarIdx = rawCarIdx === 65535 ? -1 : rawCarIdx;
  const isSelfPickup = resolvedCarIdx >= 0 && resolvedCarIdx === activeCarIndex;

  const padIdx = event.padIndex !== undefined ? event.padIndex : (event.secondaryId ?? -1);
  const isBigPad = Boolean(event.isBig || event.subType === 1 || (padIdx >= 0 && padIdx < 6));

  if (isSelfPickup) {
    return {
      category: 'boost_pickup',
      isSelfPickup: true,
      isBigPad,
      volumeGainMultiplier: isBigPad ? 1.05 : 0.92,
      distanceRadiusScale: 1.0,
      playbackRate: isBigPad ? 0.98 : 1.04,
      priority: isBigPad
        ? INCIDENT_SLOT_PRIORITY.BOOST_PICKUP_SELF_BIG
        : INCIDENT_SLOT_PRIORITY.BOOST_PICKUP_SELF_SMALL,
      normalizedIntensity: isBigPad ? 1.0 : 0.65,
    };
  }

  return {
    category: 'boost_pickup',
    isSelfPickup: false,
    isBigPad,
    volumeGainMultiplier: isBigPad ? 0.85 : 0.62,
    distanceRadiusScale: isBigPad ? 1.05 : 0.68,
    playbackRate: isBigPad ? 0.97 : 1.05,
    priority: INCIDENT_SLOT_PRIORITY.BOOST_PICKUP_OTHER,
    normalizedIntensity: isBigPad ? 0.85 : 0.45,
  };
}

/**
 * Calibrates Wheel Landing impact modulation from downward vertical speed / impact impulse.
 */
export function calibrateWheelLandingModulation(
  downwardSpeedUU: number,
  isSelf: boolean
): IncidentSpatialModulationResult {
  const speed = Math.max(0, Math.abs(downwardSpeedUU));
  const intensity = smoothstep01((speed - 180) / 1350);
  const volumeGainMultiplier = clamp((0.45 + 0.6 * intensity) * (isSelf ? 1.0 : 0.88), 0.35, 1.15);
  const distanceRadiusScale = clamp(0.7 + 0.45 * intensity, 0.65, 1.2);
  const playbackRate = clamp(0.94 + 0.12 * (1.0 - 0.5 * intensity), 0.92, 1.08);

  return {
    category: 'wheel_landing',
    volumeGainMultiplier,
    distanceRadiusScale,
    playbackRate,
    priority: isSelf ? 4 : 2,
    normalizedIntensity: intensity,
  };
}
