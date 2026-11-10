/**
 * RLRCVehicleLoadoutCatalog.ts
 * Resolves external .replay vehicle body product IDs and resting rigid-body
 * suspension kinematics into canonical RocketCompanion hitbox and visual presets.
 */

import type {
  RLRCHitboxId,
  RLRCQuat,
  RLRCRigidBodySample,
  RLRCVehicleLoadoutResolution,
  RLRCVisualId,
} from '../RLRCReplayTypes.ts';

import {
  BODY_PRODUCT_ID_MAP,
  DEFAULT_HITBOX_ID,
  DEFAULT_VISUAL_ID,
  HITBOX_DEFAULT_VISUAL_MAP,
  type RLRCVehicleCatalogEntry,
} from './RLRCVehicleProductCatalogTable.ts';

export type { RLRCVehicleCatalogEntry };

export interface RLRCRestingKinematicsStats {
  readonly sampleCount: number;
  readonly medianRestZ: number;
  readonly medianSignedForwardZ: number;
}

export interface RLRCRestingSampleInput {
  readonly z: number;
  readonly signedForwardZ?: number;
  readonly rotation?: RLRCQuat;
}

/**
 * Computes the signed forward pitch Z component `f_z = 2 * (qx * qz - qw * qy)`
 * from a unit quaternion in RocketCompanion/UE3 vehicle coordinates.
 * Note: Merc has positive `f_z` (~ +0.00485), while other hitboxes tilt slightly nose-down (`f_z < 0`).
 */
export function computeSignedForwardZFromQuat(rotation: RLRCQuat): number {
  return 2 * (rotation.x * rotation.z - rotation.w * rotation.y);
}

function computeMedian(values: readonly number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = sorted.length >>> 1;
  return (sorted.length & 1) === 1 ? sorted[mid] : 0.5 * (sorted[mid - 1] + sorted[mid]);
}

/**
 * Extracts flat-ground resting suspension samples from a sequence of rigid-body states
 * and computes `(medianRestZ, medianSignedForwardZ)`.
 */
export function extractRestingKinematicsStats(
  samples: readonly (RLRCRigidBodySample | RLRCRestingSampleInput)[]
): RLRCRestingKinematicsStats | null {
  const zValues: number[] = [];
  const fzValues: number[] = [];

  for (let i = 0; i < samples.length; i++) {
    const sample = samples[i];
    if ('position' in sample) {
      const z = sample.position.z;
      if (z < 15.5 || z > 20.5) continue;
      const vz = Math.abs(sample.linearVelocity.z);
      if (vz > 5.0) continue;
      const upZ =
        1 - 2 * (sample.rotation.x * sample.rotation.x + sample.rotation.y * sample.rotation.y);
      if (upZ < 0.98) continue;
      zValues.push(z);
      fzValues.push(computeSignedForwardZFromQuat(sample.rotation));
    } else {
      const z = sample.z;
      if (!Number.isFinite(z) || z < 15.5 || z > 20.5) continue;
      const fz =
        typeof sample.signedForwardZ === 'number'
          ? sample.signedForwardZ
          : sample.rotation
            ? computeSignedForwardZFromQuat(sample.rotation)
            : -0.00954;
      zValues.push(z);
      fzValues.push(fz);
    }
  }

  if (zValues.length === 0) {
    return null;
  }

  return {
    sampleCount: zValues.length,
    medianRestZ: computeMedian(zValues),
    medianSignedForwardZ: computeMedian(fzValues),
  };
}

/**
 * Classifies unknown DLC vehicle bodies into the 5 distinct resting suspension buckets
 * using flat-ground `(median_rest_Z, signed_fwd_z)` measurements:
 * - Merc: `signed_fwd_z > +0.002` (unique nose-up pitch ~ +0.00485, rest_Z ~ 18.79 uu)
 * - Plank: `median_rest_Z > 18.50` (rest_Z ~ 18.65 uu, signed_fwd_z ~ -0.00602)
 * - Breakout: `median_rest_Z > 18.00` (rest_Z ~ 18.34 uu, signed_fwd_z ~ -0.01701)
 * - Dominus: `|signed_fwd_z| > 0.013` (rest_Z ~ 17.01..17.06 uu, steep pitch ~ -0.01672)
 * - Octane: default standard bucket (rest_Z ~ 17.01 uu, mild pitch ~ -0.00954)
 */
export function classifyHitboxByRestingKinematics(
  samplesOrStats:
    | readonly (RLRCRigidBodySample | RLRCRestingSampleInput)[]
    | RLRCRestingKinematicsStats
    | null
    | undefined
): { readonly hitboxId: RLRCHitboxId; readonly visualId: RLRCVisualId } {
  const stats =
    samplesOrStats === null || samplesOrStats === undefined
      ? null
      : Array.isArray(samplesOrStats)
        ? extractRestingKinematicsStats(
            samplesOrStats as readonly (RLRCRigidBodySample | RLRCRestingSampleInput)[]
          )
        : (samplesOrStats as RLRCRestingKinematicsStats);

  if (!stats || stats.sampleCount <= 0) {
    return { hitboxId: DEFAULT_HITBOX_ID, visualId: DEFAULT_VISUAL_ID };
  }

  const { medianRestZ, medianSignedForwardZ } = stats;

  if (medianSignedForwardZ > 0.002) {
    return { hitboxId: 'hitbox-merc', visualId: HITBOX_DEFAULT_VISUAL_MAP['hitbox-merc'] };
  }
  if (medianRestZ > 18.5) {
    return { hitboxId: 'hitbox-plank', visualId: HITBOX_DEFAULT_VISUAL_MAP['hitbox-plank'] };
  }
  if (medianRestZ > 18.0) {
    return { hitboxId: 'hitbox-breakout', visualId: HITBOX_DEFAULT_VISUAL_MAP['hitbox-breakout'] };
  }
  if (Math.abs(medianSignedForwardZ) > 0.013) {
    return { hitboxId: 'hitbox-dominus', visualId: HITBOX_DEFAULT_VISUAL_MAP['hitbox-dominus'] };
  }
  return { hitboxId: 'hitbox-octane', visualId: HITBOX_DEFAULT_VISUAL_MAP['hitbox-octane'] };
}

/**
 * Resolves a `.replay` vehicle body Product ID and optional resting rigid-body samples
 * into a canonical `{ bodyProductId, hitboxId, visualId, resolvedBy }` descriptor.
 */
export function resolveRLRCVehicleLoadout(
  bodyProductId: number | null | undefined,
  restingSamplesOrStats?:
    readonly (RLRCRigidBodySample | RLRCRestingSampleInput)[] | RLRCRestingKinematicsStats | null,
  customVisualHint?: string | null
): RLRCVehicleLoadoutResolution {
  const safeProductId =
    typeof bodyProductId === 'number' && Number.isFinite(bodyProductId)
      ? Math.trunc(bodyProductId)
      : 0;

  if (typeof customVisualHint === 'string' && customVisualHint.trim().toLowerCase() === 'ryza') {
    return {
      bodyProductId: safeProductId,
      hitboxId: 'hitbox-octane',
      visualId: 'ryza',
      resolvedBy: 'catalog',
    };
  }

  const catalogHit = BODY_PRODUCT_ID_MAP.get(safeProductId);
  if (catalogHit) {
    return {
      bodyProductId: safeProductId,
      hitboxId: catalogHit.hitboxId,
      visualId: catalogHit.visualId,
      resolvedBy: 'catalog',
    };
  }

  if (restingSamplesOrStats) {
    const stats = Array.isArray(restingSamplesOrStats)
      ? extractRestingKinematicsStats(
          restingSamplesOrStats as readonly (RLRCRigidBodySample | RLRCRestingSampleInput)[]
        )
      : (restingSamplesOrStats as RLRCRestingKinematicsStats);

    if (stats && stats.sampleCount > 0) {
      const fallback = classifyHitboxByRestingKinematics(stats);
      return {
        bodyProductId: safeProductId,
        hitboxId: fallback.hitboxId,
        visualId: fallback.visualId,
        resolvedBy: 'kinematics-fallback',
      };
    }
  }

  return {
    bodyProductId: safeProductId,
    hitboxId: DEFAULT_HITBOX_ID,
    visualId: DEFAULT_VISUAL_ID,
    resolvedBy: 'default',
  };
}

export function getDefaultVisualForHitbox(hitboxId: RLRCHitboxId): RLRCVisualId {
  return HITBOX_DEFAULT_VISUAL_MAP[hitboxId] ?? DEFAULT_VISUAL_ID;
}
