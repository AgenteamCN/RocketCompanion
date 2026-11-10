/**
 * RLRCIntervenePrerollHistoryInjector.ts
 * Environment and history restoration helpers for RLRC intervention takeover:
 * - Pre-roll countdown window bounds calculation ([t0 - downCounterSeconds * 120, t0])
 * - Kickoff and goal teleport boundary clamping
 * - Ball-touch impulse and car proximity incident detection
 * - 4-second (480 frames @ 120Hz) pre-roll history injection into ReplayRingBuffer
 *   and GoalAndTouchTracker state restoration
 */

import {
  SIM_OFFSETS,
  GAME_STATE_BUFFER_FLOATS,
  INCIDENT_EVENT_TYPES,
} from '../../../physics/RocketSimConstants.ts';
import type {
  ReplayAcknowledgedControlEntry,
  ReplayRecordedIncident,
} from '../../ReplayRingBuffer.ts';
import {
  RLRC_FIXED_DT,
  RLRC_MAX_PLAYER_SLOTS,
  RLRC_PREROLL_HISTORY_FRAMES,
  type RLRCBookmarkRecord,
  type RLRCFrame120Hz,
  type RLRCInterveneLaunchConfig,
  type RLRCNonPovInterventionMode,
  type RLRCPlayerSlotMeta,
  type RLRCTeamIndex,
} from '../RLRCReplayTypes.ts';
import {
  DEFAULT_NEUTRAL_CAR_CONTROLS,
  packRLRCFrameToGameStateBuffer,
  resolveCurrentUserInterveneLoadout,
  type RLRCGoalAndTouchTrackerPort,
  type RLRCPovFrameOverride,
  type RLRCPrerollRingBufferPort,
  type RLRCUserInterveneLoadout,
} from './RLRCInterveneFrameStateBuilder.ts';

export interface RLRCPrerollRingBufferInjectParams {
  readonly frames120Hz: readonly RLRCFrame120Hz[];
  readonly bookmarks?: readonly RLRCBookmarkRecord[];
  readonly targetFrame120Hz: number;
  readonly maxPrerollFrames?: number;
  readonly povOverride?: RLRCPovFrameOverride;
  readonly ringBuffer: RLRCPrerollRingBufferPort | null | undefined;
  readonly goalAndTouch?: RLRCGoalAndTouchTrackerPort | null;
}

export interface RLRCPrerollInjectionResult {
  readonly startFrame120Hz: number;
  readonly targetFrame120Hz: number;
  readonly recordedFrameCount: number;
  readonly baseTick: number;
  readonly finalPrerollTick: number;
  readonly nextLiveTick: number;
  readonly latestTouchTick: number;
}

export interface RLRCPrerollCountdownBounds {
  readonly targetFrame120Hz: number;
  readonly prerollStartFrame120Hz: number;
  readonly countdownTicks: number;
  readonly countdownSeconds: 0 | 1 | 2 | 3;
}

export function resolveValidIntervenePovSlotIndex(
  frame: RLRCFrame120Hz,
  roster: readonly RLRCPlayerSlotMeta[],
  preferredSlot: number
): number {
  const clamped = Math.max(0, Math.min(RLRC_MAX_PLAYER_SLOTS - 1, Math.round(preferredSlot)));
  if (frame.cars[clamped]?.entityActive) return clamped;
  for (let i = 0; i < frame.cars.length; i++) {
    if (frame.cars[i]?.entityActive) return i;
  }
  return roster[0]?.slotIndex ?? clamped;
}

export function buildInterveneLaunchConfig(params: {
  readonly targetFrame: RLRCFrame120Hz;
  readonly targetFrame120Hz: number;
  readonly roster: readonly RLRCPlayerSlotMeta[];
  readonly currentPovSlotIndex: number;
  readonly currentNonPovMode: RLRCNonPovInterventionMode;
  readonly downCounterSeconds: 0 | 1 | 2 | 3;
  readonly userLoadoutPreset?: Partial<RLRCUserInterveneLoadout> | null;
  readonly overrides?: Partial<RLRCInterveneLaunchConfig>;
}): RLRCInterveneLaunchConfig {
  const {
    targetFrame,
    targetFrame120Hz,
    roster,
    currentPovSlotIndex,
    currentNonPovMode,
    downCounterSeconds,
    userLoadoutPreset,
    overrides,
  } = params;
  const povSlotIndex = resolveValidIntervenePovSlotIndex(
    targetFrame,
    roster,
    overrides?.povSlotIndex ?? currentPovSlotIndex
  );
  const povMeta = roster.find((r) => r.slotIndex === povSlotIndex);
  const povTeam: RLRCTeamIndex = povMeta?.team ?? (povSlotIndex < 3 ? 0 : 1);
  const userLoadout = resolveCurrentUserInterveneLoadout(povTeam, {
    ...userLoadoutPreset,
    hitboxId: overrides?.playerHitboxId ?? userLoadoutPreset?.hitboxId,
    visualId: overrides?.playerVisualId ?? userLoadoutPreset?.visualId,
    colorHex: overrides?.playerColorHex ?? userLoadoutPreset?.colorHex,
  });
  return {
    targetFrame120Hz,
    povSlotIndex,
    playerHitboxId: userLoadout.hitboxId,
    playerVisualId: userLoadout.visualId,
    playerColorHex: userLoadout.colorHex,
    downCounterSeconds,
    nonPovMode: overrides?.nonPovMode ?? currentNonPovMode,
    prerollHistoryFrames: overrides?.prerollHistoryFrames ?? RLRC_PREROLL_HISTORY_FRAMES,
  };
}

export function computeRLRCPrerollCountdownBounds(
  totalFrames120Hz: number,
  t0FrameIndex: number,
  rawDownCounterSeconds: number
): RLRCPrerollCountdownBounds {
  const maxIdx = Math.max(0, totalFrames120Hz - 1);
  const targetFrame120Hz = Math.max(0, Math.min(maxIdx, Math.round(t0FrameIndex)));
  const countdownSeconds = (
    rawDownCounterSeconds === 1 || rawDownCounterSeconds === 2 || rawDownCounterSeconds === 3
      ? rawDownCounterSeconds
      : 0
  ) as 0 | 1 | 2 | 3;
  const countdownTicks = countdownSeconds * 120;
  const prerollStartFrame120Hz = Math.max(0, targetFrame120Hz - countdownTicks);
  return {
    targetFrame120Hz,
    prerollStartFrame120Hz,
    countdownTicks,
    countdownSeconds,
  };
}

export function computeNextPrerollCountdownTick(params: {
  readonly totalFrames120Hz: number;
  readonly targetFrame120Hz: number;
  readonly countdownRemainingTicks: number;
  readonly finalPrerollTick: number;
}): {
  readonly nextRemainingTicks: number;
  readonly nextCursorFrame: number;
  readonly nextCountdownSeconds: number;
  readonly currentPrerollTick: number;
} {
  const nextRemainingTicks = Math.max(0, params.countdownRemainingTicks - 1);
  const maxIdx = Math.max(0, params.totalFrames120Hz - 1);
  const nextCursorFrame = Math.max(
    0,
    Math.min(maxIdx, params.targetFrame120Hz - nextRemainingTicks)
  );
  const nextCountdownSeconds =
    nextRemainingTicks <= 0 ? 0 : Math.max(1, Math.ceil(nextRemainingTicks / 120));
  const currentPrerollTick = Math.max(1, params.finalPrerollTick - nextRemainingTicks);
  return {
    nextRemainingTicks,
    nextCursorFrame,
    nextCountdownSeconds,
    currentPrerollTick,
  };
}

export function buildFrameAcknowledgedControls(
  frame: RLRCFrame120Hz,
  nonPovMode?: RLRCNonPovInterventionMode,
  povSlotIndex = 0
): ReplayAcknowledgedControlEntry[] {
  const entries: ReplayAcknowledgedControlEntry[] = [];
  for (let slot = 0; slot < RLRC_MAX_PLAYER_SLOTS; slot++) {
    const car = frame.cars[slot];
    const useNeutral =
      !car ||
      !car.entityActive ||
      ((nonPovMode === 'disappear' || nonPovMode === 'no-input') && slot !== povSlotIndex);
    const ctrl = useNeutral ? DEFAULT_NEUTRAL_CAR_CONTROLS : car.controls;
    entries.push({ carIndex: slot, controls: { ...ctrl } });
  }
  return entries;
}

export function findKickoffClampStartFrame120Hz(
  frames120Hz: readonly RLRCFrame120Hz[],
  bookmarks: readonly RLRCBookmarkRecord[] | undefined,
  targetFrame120Hz: number
): number {
  const maxIdx = Math.max(0, frames120Hz.length - 1);
  const clampedTarget = Math.max(0, Math.min(maxIdx, Math.round(targetFrame120Hz)));
  let floorFrame = 0;

  if (Array.isArray(bookmarks)) {
    for (let i = 0; i < bookmarks.length; i++) {
      const bm = bookmarks[i];
      if (!bm || bm.frameIndex120Hz > clampedTarget) continue;
      if ((bm.kind === 'kickoff' || bm.kind === 'goal') && bm.frameIndex120Hz > floorFrame) {
        floorFrame = bm.frameIndex120Hz;
      }
    }
  }

  const searchMin = Math.max(floorFrame, clampedTarget - RLRC_PREROLL_HISTORY_FRAMES);
  for (let f = clampedTarget; f > searchMin; f--) {
    const cur = frames120Hz[f];
    const prev = frames120Hz[f - 1];
    if (!cur || !prev) continue;
    const dx = cur.ball.rigidBody.position.x - prev.ball.rigidBody.position.x;
    const dy = cur.ball.rigidBody.position.y - prev.ball.rigidBody.position.y;
    if (dx * dx + dy * dy > 1600 * 1600) return f;
  }
  return floorFrame;
}

export function detectBallTouchIncidentBetweenFrames(
  prevFrame: RLRCFrame120Hz | null | undefined,
  currFrame: RLRCFrame120Hz,
  tick: number
): ReplayRecordedIncident | null {
  if (!prevFrame) return null;
  const v0 = prevFrame.ball.rigidBody.linearVelocity;
  const v1 = currFrame.ball.rigidBody.linearVelocity;
  const impulse = Math.hypot(v1.x - v0.x, v1.y - v0.y, v1.z - v0.z + 650 * RLRC_FIXED_DT);
  if (impulse < 180) return null;

  const bPos = currFrame.ball.rigidBody.position;
  let bestSlot = -1;
  let bestDistSq = 285 * 285;
  for (let slot = 0; slot < currFrame.cars.length; slot++) {
    const car = currFrame.cars[slot];
    if (!car || !car.entityActive) continue;
    const cPos = car.rigidBody.position;
    const dSq = (cPos.x - bPos.x) ** 2 + (cPos.y - bPos.y) ** 2 + (cPos.z - bPos.z) ** 2;
    if (dSq < bestDistSq) {
      bestDistSq = dSq;
      bestSlot = slot;
    }
  }
  if (bestSlot < 0) return null;
  return {
    type: INCIDENT_EVENT_TYPES.CAR_BALL_HIT,
    tick,
    carIndex: bestSlot,
    posX: bPos.x,
    posY: bPos.y,
    posZ: bPos.z,
  };
}

export function syncGoalAndTouchTrackerAtTakeover(
  goalAndTouch: RLRCGoalAndTouchTrackerPort | null | undefined,
  targetFrame: RLRCFrame120Hz | undefined,
  baseTick: number,
  latestTouchTick: number
): void {
  if (!goalAndTouch || !targetFrame) return;
  const bVel = targetFrame.ball.rigidBody.linearVelocity;
  Object.assign(goalAndTouch, {
    goalIncidentTick: -1,
    goalResetTicks: 0,
    frozenGoalBallState: null,
    prevBallVelX: bVel.x,
    prevBallVelY: bVel.y,
    prevBallVelZ: bVel.z,
    lastKickoffStartTick: baseTick,
    lastTouchTick: latestTouchTick,
  });
}

export function injectPrerollHistoryIntoRingBuffer(
  params: RLRCPrerollRingBufferInjectParams
): RLRCPrerollInjectionResult {
  const {
    frames120Hz,
    bookmarks,
    targetFrame120Hz,
    maxPrerollFrames = RLRC_PREROLL_HISTORY_FRAMES,
    povOverride,
    ringBuffer,
    goalAndTouch,
  } = params;

  const maxIdx = Math.max(0, frames120Hz.length - 1);
  const clampedTarget = Math.max(0, Math.min(maxIdx, Math.round(targetFrame120Hz)));
  const kickoffFloor = findKickoffClampStartFrame120Hz(frames120Hz, bookmarks, clampedTarget);
  const startFrame120Hz = Math.max(kickoffFloor, clampedTarget - Math.max(0, maxPrerollFrames));
  const baseTick = 1;
  let latestTouchTick = baseTick;
  let recordedFrameCount = 0;

  ringBuffer?.clear?.();
  const scratchSnapshot = new Float32Array(GAME_STATE_BUFFER_FLOATS);

  for (let f = startFrame120Hz; f <= clampedTarget; f++) {
    const frame = frames120Hz[f];
    if (!frame) continue;
    const tick = baseTick + recordedFrameCount++;
    packRLRCFrameToGameStateBuffer(frame, tick, scratchSnapshot, povOverride);
    const slot = ringBuffer?.recordFrame?.(tick, scratchSnapshot, {
      acknowledgedControls: buildFrameAcknowledgedControls(frame),
    });
    if (slot?.snapshot) slot.snapshot[SIM_OFFSETS.TICK] = tick;

    const touchIncident = detectBallTouchIncidentBetweenFrames(
      f > startFrame120Hz ? frames120Hz[f - 1] : null,
      frame,
      tick
    );
    if (touchIncident) {
      ringBuffer?.appendIncident?.(tick, touchIncident);
      latestTouchTick = tick;
    }
  }

  const finalPrerollTick = Math.max(baseTick, baseTick + recordedFrameCount - 1);
  syncGoalAndTouchTrackerAtTakeover(
    goalAndTouch,
    frames120Hz[clampedTarget],
    baseTick,
    latestTouchTick
  );

  return {
    startFrame120Hz,
    targetFrame120Hz: clampedTarget,
    recordedFrameCount,
    baseTick,
    finalPrerollTick,
    nextLiveTick: finalPrerollTick + 1,
    latestTouchTick,
  };
}
