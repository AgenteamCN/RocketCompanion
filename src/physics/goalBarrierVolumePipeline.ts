/**
 * goalBarrierVolumePipeline.ts
 * Pure goal volume configuration and goal barrier geometry evaluation pipeline.
 */

import { BALL_COLLISION_RADIUS } from './RocketSimConstants.ts';
import {
  fetchArenaCollisionMeshes,
  initWasmCollisionMeshes,
  type RocketSimCollisionWasmModule,
} from './RocketSimMeshLoader.ts';
import { isPointInGoalBarrier } from '../ui-core/config/goalBarrierConfig.ts';
import { getGoalVolumeBoxForPreset } from '../ui-core/config/goalVolumeTunerConfig.ts';

export interface GoalVolumeBoxConfig {
  enabled?: boolean;
  halfWidthX: number;
  minY: number;
  maxY: number;
  minZ?: number;
  maxZ: number;
}

export interface GoalVolumeResolvedConfig {
  isThrowback: boolean;
  enabled: boolean;
  halfWidthX: number;
  minY: number;
  maxY: number;
  minZ: number;
  maxZ: number;
  ballRadius: number;
}

export interface CarSpecEntry {
  team: number;
  hitboxIndex: number;
  threeWheels: boolean;
}

export interface GoalBarrierRect {
  u0: number;
  v0: number;
  u1: number;
  v1: number;
  xMin?: number;
  xMax?: number;
  zMin?: number;
  zMax?: number;
  [key: string]: unknown;
}

export interface GoalBarrierMetadata {
  enabled?: boolean;
  targetGoal?: 'both' | 'blue' | 'orange' | string;
  rects?: GoalBarrierRect[];
  decomposition?: {
    mergedRects?: GoalBarrierRect[];
  };
  [key: string]: unknown;
}

export interface GoalBarrierWasmModule extends RocketSimCollisionWasmModule {
  _physics_setGoalVolumeBox?(
    enabled: number,
    halfWidthX: number,
    minY: number,
    maxY: number,
    maxZ: number
  ): void;
  _physics_setArenaPreset?(preset: number): void;
  _physics_createArena(): number;
}

export function syncGoalVolumeBoxToWasm(
  wasmModule: Partial<GoalBarrierWasmModule> | null | undefined,
  arenaPreset: number,
  goalVolumeBox: GoalVolumeBoxConfig | null | undefined
): void {
  if (!wasmModule?._physics_setGoalVolumeBox) return;
  const box = goalVolumeBox || getGoalVolumeBoxForPreset(arenaPreset === 1);
  const enabled = arenaPreset === 1 || Boolean(box.enabled);
  wasmModule._physics_setGoalVolumeBox(
    enabled ? 1 : 0,
    box.halfWidthX,
    box.minY,
    box.maxY,
    box.maxZ
  );
}

export function resolveGoalVolumeConfig(
  preset: number,
  goalVolumeBox: GoalVolumeBoxConfig | null | undefined
): GoalVolumeResolvedConfig {
  const box = goalVolumeBox || getGoalVolumeBoxForPreset(preset === 1);
  return {
    isThrowback: preset === 1,
    enabled: preset === 1 || Boolean(box.enabled),
    halfWidthX: box.halfWidthX,
    minY: box.minY,
    maxY: box.maxY,
    minZ: box.minZ ?? 0.0,
    maxZ: box.maxZ,
    ballRadius: BALL_COLLISION_RADIUS,
  };
}

export function checkActiveGoalBarrier(
  goalBarrierMeta: GoalBarrierMetadata | null | undefined,
  yUu: number = 0
): boolean {
  if (!goalBarrierMeta || !goalBarrierMeta.enabled) return false;
  const rects = goalBarrierMeta.rects || goalBarrierMeta.decomposition?.mergedRects;
  if (!Array.isArray(rects) || rects.length === 0) return false;
  const tg = goalBarrierMeta.targetGoal || 'both';
  if (tg === 'orange' && yUu < 0) return false;
  if (tg === 'blue' && yUu > 0) return false;
  return true;
}

export function checkPointOnGoalBarrier(
  goalBarrierMeta: GoalBarrierMetadata | null | undefined,
  xUu: number,
  yUu: number,
  zUu: number
): boolean {
  if (!goalBarrierMeta || !goalBarrierMeta.enabled) return false;
  const rects = goalBarrierMeta.rects || goalBarrierMeta.decomposition?.mergedRects || [];
  return isPointInGoalBarrier(
    xUu,
    yUu,
    zUu,
    rects,
    (goalBarrierMeta.targetGoal as 'both' | 'blue' | 'orange' | undefined) || 'both',
    goalBarrierMeta.enabled
  );
}

export function evaluateBallScored(
  ballView: { posX: number; posY: number; posZ: number } | null | undefined,
  preset: number,
  goalVolumeBox: GoalVolumeBoxConfig | null | undefined,
  goalBarrierMeta: GoalBarrierMetadata | null | undefined
): boolean {
  if (!ballView) return false;
  const x = ballView.posX;
  const y = ballView.posY;
  const z = ballView.posZ;
  if (checkActiveGoalBarrier(goalBarrierMeta, y)) return false;

  const absY = Math.abs(y);
  const r = BALL_COLLISION_RADIUS;
  const cfg = resolveGoalVolumeConfig(preset, goalVolumeBox);

  if (cfg.enabled) {
    const margin = 0.25 * r;
    if (Math.abs(x) >= cfg.halfWidthX - margin) return false;
    if (z <= cfg.minZ || z >= cfg.maxZ - margin) return false;
    return absY > cfg.minY + r && absY < cfg.maxY;
  }

  return absY > cfg.minY + r;
}

export async function reloadArenaCollisionMeshes(
  wasmModule: GoalBarrierWasmModule | null | undefined,
  goalBarrierChunks: Uint8Array[],
  manifestPath = '/arenamesh/manifest.json'
): Promise<Uint8Array[] | null> {
  if (!wasmModule) return null;
  const baseDir = manifestPath.replace(/\/[^/]+$/, '') || '/arenamesh';
  const collisionData = await fetchArenaCollisionMeshes(null, { manifestPath, baseDir });
  const effectiveChunks =
    goalBarrierChunks.length > 0 ? [...collisionData, ...goalBarrierChunks] : collisionData;
  initWasmCollisionMeshes(wasmModule, effectiveChunks);
  return collisionData;
}

export function applyGoalBarrierChunksToWasmArena(
  wasmModule: GoalBarrierWasmModule | null | undefined,
  baseData: Uint8Array[] | null,
  goalBarrierChunks: Uint8Array[],
  savedPreset: number,
  goalVolumeBox: GoalVolumeBoxConfig
): boolean {
  if (!wasmModule || !baseData || baseData.length === 0) return false;
  const effectiveChunks =
    goalBarrierChunks.length > 0 ? [...baseData, ...goalBarrierChunks] : baseData;
  initWasmCollisionMeshes(wasmModule, effectiveChunks);
  wasmModule._physics_setArenaPreset?.(savedPreset);
  if (wasmModule._physics_createArena() !== 1) return false;
  syncGoalVolumeBoxToWasm(wasmModule, savedPreset, goalVolumeBox);
  return true;
}
