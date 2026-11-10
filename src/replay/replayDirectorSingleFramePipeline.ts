/**
 * replayDirectorSingleFramePipeline.ts
 * Pure narrow-input pipeline for current-frame Director Camera diagnostic snapshot evaluation
 * and per-frame diagnostic entry construction.
 */

import { REPLAY_TICK_RATE } from './ReplayRingBuffer.ts';
import { computeGoalReplayCameraPose, type DirectorCameraPose } from './ReplayDirectorCamera.ts';
import {
  decodeReplayDirectorTelemetryFromState,
  type EmbeddedReplayDirectorTelemetry,
} from './ReplayFrameInterpolator.ts';
import {
  round3,
  round4,
  vec3Round3,
  computeCameraAnglesFromPose,
  extractFrameEntities,
  resolveEmbeddedLookahead,
  computeViewAngleToPointDeg,
  type CameraAnglesFromPose,
  type ExtractedFrameEntities,
} from './ReplayDirectorSceneAnalysis.ts';
import type {
  DirectorCameraState,
  DirectorSmoothnessSummary,
  DirectorAnomalyPeaks,
  ReplayCarRosterEntry,
  ReplayDirectorDiagnosticInput,
  DirectorDiagnosticFrameEntry,
  DirectorDiagnosticTouchTimelineEntry,
} from './replayDirectorStateTypes.ts';
import type { ResolvedTouchLookahead } from './ReplayTouchTimelineAnalyzer.ts';

export type { ReplayDirectorDiagnosticInput, EmbeddedReplayDirectorTelemetry };

export function syncLookaheadState(
  state: DirectorCameraState,
  la: Partial<ResolvedTouchLookahead> & {
    primaryCarIndex: number;
    nextCarIndex: number;
    nextTouchBlend: number;
  },
  frameIdx?: number
): void {
  Object.assign(state, {
    activeTouchCarIndex: la.primaryCarIndex,
    nextTouchCarIndex: la.nextCarIndex,
    nextTouchBlend: la.nextTouchBlend,
    nextTouchBallPos: la.nextTouchBallPos ?? null,
    interceptorCarIndex: la.interceptorCarIndex ?? -1,
    interceptorBlend: la.interceptorBlend ?? 0,
    postGoalElapsedSec: la.postGoalElapsedSec ?? 0,
    ...(typeof frameIdx === 'number' ? { currentFrameIndex: frameIdx } : {}),
  });
}

export function buildDiagnosticFrameEntry(params: {
  frameId: number;
  idx: number;
  timestampSec: number;
  progress: number;
  slowMoFactor: number;
  isSelectedCursorFrame: boolean;
  lookahead: ResolvedTouchLookahead;
  simState: DirectorCameraState;
  dampedPose: DirectorCameraPose;
  rawPose: DirectorCameraPose;
  dampedAngles: CameraAnglesFromPose;
  rawAngles: CameraAnglesFromPose;
  carViewAngleDeg: number;
  interceptorViewAngleDeg: number;
  ballViewAngleDeg: number;
  eyeStepUu: number;
  targetStepUu: number;
  yawStepDeg: number;
  pitchStepDeg: number;
  rawEyeStepUu: number;
  rawTargetStepUu: number;
  eyeAccelUu: number;
  targetAccelUu: number;
  entities: ExtractedFrameEntities;
  incidents?: Array<Record<string, unknown>>;
}): DirectorDiagnosticFrameEntry {
  const {
    frameId,
    idx,
    timestampSec,
    progress,
    slowMoFactor,
    isSelectedCursorFrame,
    lookahead,
    simState,
    dampedPose,
    rawPose,
    dampedAngles,
    rawAngles,
    carViewAngleDeg,
    interceptorViewAngleDeg,
    ballViewAngleDeg,
    eyeStepUu,
    targetStepUu,
    yawStepDeg,
    pitchStepDeg,
    rawEyeStepUu,
    rawTargetStepUu,
    eyeAccelUu,
    targetAccelUu,
    entities,
    incidents,
  } = params;

  return {
    frameId,
    replayFrameIndex: idx,
    timestampSec,
    progress: round4(progress),
    slowMoFactor: round3(slowMoFactor),
    isSelectedCursorFrame,
    lookahead: {
      activeTouchCarIndex: lookahead.primaryCarIndex,
      nextTouchCarIndex: lookahead.nextCarIndex,
      nextTouchBlend: round4(lookahead.nextTouchBlend),
      nextTouchBallPos: lookahead.nextTouchBallPos
        ? vec3Round3(
            lookahead.nextTouchBallPos.x,
            lookahead.nextTouchBallPos.y,
            lookahead.nextTouchBallPos.z
          )
        : null,
      interceptorCarIndex: lookahead.interceptorCarIndex ?? -1,
      interceptorBlend: round4(lookahead.interceptorBlend ?? 0),
      postGoalElapsedSec: round3(lookahead.postGoalElapsedSec ?? 0),
      smoothedStrikerPos: vec3Round3(
        simState.smoothedCarX ?? 0,
        simState.smoothedCarY ?? 0,
        simState.smoothedCarZ ?? 0
      ),
      carSwitchBlend: round4(simState.carSwitchBlend ?? 1.0),
      lateralBias: simState.lateralBias || 1.0,
    },
    cameraPose: {
      eyeUnreal: vec3Round3(dampedPose.eyeX, dampedPose.eyeY, dampedPose.eyeZ),
      targetUnreal: vec3Round3(dampedPose.targetX, dampedPose.targetY, dampedPose.targetZ),
      eyeThreeJs: vec3Round3(dampedPose.eyeX, dampedPose.eyeZ, dampedPose.eyeY),
      targetThreeJs: vec3Round3(dampedPose.targetX, dampedPose.targetZ, dampedPose.targetY),
      forwardUnreal: dampedAngles.forwardUnreal,
      distanceToTarget: dampedAngles.distanceToTarget,
      yawDeg: dampedAngles.yawDeg,
      pitchDeg: dampedAngles.pitchDeg,
      carViewAngleDeg,
      interceptorViewAngleDeg,
      ballViewAngleDeg,
      rawUndampedEyeUnreal: vec3Round3(rawPose.eyeX, rawPose.eyeY, rawPose.eyeZ),
      rawUndampedTargetUnreal: vec3Round3(rawPose.targetX, rawPose.targetY, rawPose.targetZ),
      rawDistanceToTarget: rawAngles.distanceToTarget,
      rawYawDeg: rawAngles.yawDeg,
      rawPitchDeg: rawAngles.pitchDeg,
      eyeStepUu: round3(eyeStepUu),
      targetStepUu: round3(targetStepUu),
      yawStepDeg: round4(yawStepDeg),
      pitchStepDeg: round4(pitchStepDeg),
      rawEyeStepUu: round3(rawEyeStepUu),
      rawTargetStepUu: round3(rawTargetStepUu),
      eyeAccelUu: round3(eyeAccelUu),
      targetAccelUu: round3(targetAccelUu),
    },
    ball: entities.ball,
    cars: entities.cars,
    incidents: Array.isArray(incidents) && incidents.length > 0 ? incidents : undefined,
  };
}

export function buildCurrentFrameDiagnosticSnapshot(input: ReplayDirectorDiagnosticInput) {
  const total = input.activeWindowCount > 0 ? input.activeWindowCount : input.totalFrames;
  if (total <= 0) return null;
  const idx = Math.max(0, Math.min(total - 1, input.currentFrameIndex));
  const entry = input.getFrameEntryByIndex(idx);
  const snap = input.getFrameBufferByIndex(idx);
  if (!snap) return null;

  const entities = extractFrameEntities(snap, input.carTeamResolver ?? undefined, input.carEntries);
  const frameId = entry?.tick ?? entities.tick ?? idx;
  const csvRow = entry?.recordedCsvRow || null;
  const useCsvCam = Boolean(input.isImportedPreview && input.useRecordedCsvCamera && csvRow);
  const suffixPlan = !useCsvCam ? input.ensureSuffixCameraPlan() || null : null;
  const embedded = !suffixPlan ? decodeReplayDirectorTelemetryFromState(snap) : null;
  const progress =
    embedded && typeof embedded.progress === 'number' && total <= 1
      ? embedded.progress
      : total > 1
        ? idx / (total - 1)
        : 0;

  const lookahead =
    useCsvCam && csvRow
      ? {
          primaryCarIndex: csvRow.active_touch_car_idx ?? input.scorerCarIndex ?? 0,
          nextCarIndex: csvRow.next_touch_car_idx ?? -1,
          nextTouchBlend: csvRow.next_touch_blend ?? 0,
          nextTouchBallPos: null,
          interceptorCarIndex: -1,
          interceptorBlend: 0,
          postGoalElapsedSec: 0,
        }
      : embedded
        ? resolveEmbeddedLookahead(embedded, input.scorerCarIndex ?? 0)
        : input.resolveTouchLookaheadForFrame(
            idx,
            input.directorCameraState.activeTouchCarIndex ?? input.scorerCarIndex ?? 0
          );
  const slowMoFactor =
    useCsvCam && csvRow
      ? (csvRow.slow_mo_factor ?? 1.0)
      : input.computeDramaticSlowMoFactor(idx, { ignoreScrubState: true });

  const effectiveLateralBias =
    useCsvCam && csvRow
      ? (csvRow.lateral_bias ?? 1.0)
      : suffixPlan && typeof suffixPlan.lateralBias === 'number'
        ? suffixPlan.lateralBias
        : embedded && typeof embedded.lateralBias === 'number' && embedded.lateralBias !== 0
          ? embedded.lateralBias
          : input.directorCameraState.lateralBias || 1.0;

  const rawState: DirectorCameraState = {
    ...input.directorCameraState,
    suffixCameraPlan: suffixPlan,
    lateralBias: effectiveLateralBias,
  };
  syncLookaheadState(rawState, lookahead);

  const rawPose: DirectorCameraPose =
    useCsvCam && csvRow
      ? {
          eyeX: csvRow.raw_eye_x ?? csvRow.cam_eye_x ?? 0,
          eyeY: csvRow.raw_eye_y ?? csvRow.cam_eye_y ?? 0,
          eyeZ: csvRow.raw_eye_z ?? csvRow.cam_eye_z ?? 0,
          targetX: csvRow.raw_target_x ?? csvRow.cam_target_x ?? 0,
          targetY: csvRow.raw_target_y ?? csvRow.cam_target_y ?? 0,
          targetZ: csvRow.raw_target_z ?? csvRow.cam_target_z ?? 0,
        }
      : computeGoalReplayCameraPose(snap, input.scoringTeam, {
          scorerCarIndex: input.scorerCarIndex,
          progress,
          frameIndex: idx,
          suffixCameraPlan: suffixPlan,
          directorState: rawState,
          dt: 1 / REPLAY_TICK_RATE,
          exactDt: true,
          skipDamping: true,
        });

  let dampedPose: DirectorCameraPose = rawPose;
  if (useCsvCam && csvRow) {
    dampedPose = {
      eyeX: csvRow.cam_eye_x ?? 0,
      eyeY: csvRow.cam_eye_y ?? 0,
      eyeZ: csvRow.cam_eye_z ?? 0,
      targetX: csvRow.cam_target_x ?? 0,
      targetY: csvRow.cam_target_y ?? 0,
      targetZ: csvRow.cam_target_z ?? 0,
    };
  } else if (suffixPlan && Array.isArray(suffixPlan.poses) && suffixPlan.poses[idx]) {
    dampedPose = computeGoalReplayCameraPose(snap, input.scoringTeam, {
      scorerCarIndex: input.scorerCarIndex,
      progress,
      frameIndex: idx,
      suffixCameraPlan: suffixPlan,
      dt: 1 / REPLAY_TICK_RATE,
      exactDt: true,
    });
  } else if (input.directorCameraState.initialized) {
    const d = input.directorCameraState;
    dampedPose = {
      eyeX: d.eyeX,
      eyeY: d.eyeY,
      eyeZ: d.eyeZ,
      targetX: d.targetX,
      targetY: d.targetY,
      targetZ: d.targetZ,
    };
  } else {
    const tempState: DirectorCameraState = {
      ...input.directorCameraState,
      initialized: false,
      lateralBias: effectiveLateralBias,
    };
    for (let i = Math.max(0, idx - 90); i <= idx; i++) {
      const s = input.getFrameBufferByIndex(i);
      if (!s) continue;
      const emb = decodeReplayDirectorTelemetryFromState(s);
      const la = emb
        ? resolveEmbeddedLookahead(emb, input.scorerCarIndex ?? 0)
        : input.resolveTouchLookaheadForFrame(
            i,
            tempState.activeTouchCarIndex ?? input.scorerCarIndex ?? 0
          );
      syncLookaheadState(tempState, la);
      dampedPose = computeGoalReplayCameraPose(s, input.scoringTeam, {
        scorerCarIndex: input.scorerCarIndex,
        progress: total > 1 ? i / (total - 1) : 0,
        frameIndex: i,
        directorState: tempState,
        dt: 1 / REPLAY_TICK_RATE,
        exactDt: true,
      });
    }
  }

  const dampedAngles = computeCameraAnglesFromPose(dampedPose);
  const rawAngles = computeCameraAnglesFromPose(rawPose);
  const focusCar =
    entities.cars.find((c) => c.carIndex === lookahead.primaryCarIndex) || entities.cars[0] || null;
  const interceptorCar =
    (lookahead.interceptorCarIndex ?? -1) >= 0
      ? entities.cars.find((c) => c.carIndex === lookahead.interceptorCarIndex) || null
      : null;
  const carViewAngleDeg =
    useCsvCam && csvRow && typeof csvRow.car_view_angle_deg === 'number'
      ? round3(csvRow.car_view_angle_deg)
      : focusCar
        ? computeViewAngleToPointDeg(dampedPose, focusCar.pos)
        : 0;
  const interceptorViewAngleDeg = interceptorCar
    ? computeViewAngleToPointDeg(dampedPose, interceptorCar.pos)
    : 0;
  const ballViewAngleDeg =
    useCsvCam && csvRow && typeof csvRow.ball_view_angle_deg === 'number'
      ? round3(csvRow.ball_view_angle_deg)
      : computeViewAngleToPointDeg(dampedPose, entities.ball.pos);

  return {
    frameId,
    replayFrameIndex: idx,
    totalReplayFrames: total,
    cursorFloat: round3(input.cursorFloat),
    progress: round4(progress),
    timestampInReplaySec: round3(idx / REPLAY_TICK_RATE),
    slowMoFactor: round3(slowMoFactor),
    playbackSpeed: input.playbackSpeed,
    isPaused: input.isPaused,
    isPersistent: input.isPersistent,
    isScrubbing: input.isScrubbing,
    isActiveReplay: Boolean(input.isActive),
    isRetainedLastReplay: !input.isActive && input.activeWindowCount > 0,
    isImportedPreview: Boolean(input.isImportedPreview),
    importedFileName: input.importedFileName || null,
    useRecordedCsvCamera: Boolean(input.useRecordedCsvCamera),
    hasRecordedCsvCamera: Boolean(entry?.recordedCsvRow),
    importedSummary: input.cachedSmoothnessSummary || input.importedSummary || null,
    anomalyPeaks: input.cachedAnomalyPeaks || input.importedAnomalyPeaks || null,
    scoringTeam: input.scoringTeam,
    scorerCarIndex: input.scorerCarIndex,
    lookahead: {
      activeTouchCarIndex: lookahead.primaryCarIndex,
      nextTouchCarIndex: lookahead.nextCarIndex,
      nextTouchBlend: round4(lookahead.nextTouchBlend),
      nextTouchBallPos: lookahead.nextTouchBallPos
        ? vec3Round3(
            lookahead.nextTouchBallPos.x,
            lookahead.nextTouchBallPos.y,
            lookahead.nextTouchBallPos.z
          )
        : null,
      interceptorCarIndex: lookahead.interceptorCarIndex ?? -1,
      interceptorBlend: round4(lookahead.interceptorBlend ?? 0),
      postGoalElapsedSec: round3(lookahead.postGoalElapsedSec ?? 0),
      lateralBias: effectiveLateralBias,
    },
    cameraPose: {
      dampedEyeUnreal: vec3Round3(dampedPose.eyeX, dampedPose.eyeY, dampedPose.eyeZ),
      dampedTargetUnreal: vec3Round3(dampedPose.targetX, dampedPose.targetY, dampedPose.targetZ),
      dampedEyeThreeJs: vec3Round3(dampedPose.eyeX, dampedPose.eyeZ, dampedPose.eyeY),
      dampedTargetThreeJs: vec3Round3(dampedPose.targetX, dampedPose.targetZ, dampedPose.targetY),
      ...dampedAngles,
      carViewAngleDeg,
      interceptorViewAngleDeg,
      ballViewAngleDeg,
      eyeStepUu: round3(csvRow?.eye_step_uu ?? 0),
      targetStepUu: round3(csvRow?.target_step_uu ?? 0),
      yawStepDeg: round4(csvRow?.yaw_step_deg ?? 0),
      pitchStepDeg: round4(csvRow?.pitch_step_deg ?? 0),
      rawUndampedEyeUnreal: vec3Round3(rawPose.eyeX, rawPose.eyeY, rawPose.eyeZ),
      rawUndampedTargetUnreal: vec3Round3(rawPose.targetX, rawPose.targetY, rawPose.targetZ),
      rawDistanceToTarget: rawAngles.distanceToTarget,
      rawYawDeg: rawAngles.yawDeg,
      rawPitchDeg: rawAngles.pitchDeg,
    },
    ball: entities.ball,
    cars: entities.cars,
    incidents: Array.isArray(entry?.incidents) ? entry.incidents : [],
    signals: Array.isArray(entry?.signals) ? entry.signals : [],
  };
}

export type CurrentFrameDiagnosticSnapshot = NonNullable<
  ReturnType<typeof buildCurrentFrameDiagnosticSnapshot>
>;

export interface DirectorDiagnosticPatternPayload {
  schema: string;
  exportedAt: string;
  coordinateConventions: { unreal: string; threeJs: string };
  replayMetadata: {
    tickRate: number;
    totalReplayFrames: number;
    durationSeconds: number;
    startFrameId: number;
    endFrameId: number;
    scoringTeam: number;
    scoringTeamName: string;
    scorerCarIndex: number;
    lastScoringTouchReplayFrameIndex: number;
    lastScoringTouchFrameId: number;
    goalLineReplayFrameIndex: number;
    goalLineFrameId: number;
    trajectorySmoothnessSummary: DirectorSmoothnessSummary;
    anomalyPeaks: DirectorAnomalyPeaks;
    carEntries?: ReplayCarRosterEntry[];
    playbackStateAtExport: {
      selectedReplayFrameIndex: number;
      selectedFrameId: number;
      cursorFloat: number;
      progress: number;
      isPaused: boolean;
      isPersistent: boolean;
      isScrubbing: boolean;
      playbackSpeed: number;
    };
    [key: string]: unknown;
  };
  directorConfig: Record<string, unknown>;
  defaultDirectorConfig: Record<string, unknown>;
  touchTimeline: DirectorDiagnosticTouchTimelineEntry[];
  selectedFrameDiagnostic: ReturnType<typeof buildCurrentFrameDiagnosticSnapshot>;
  frames: DirectorDiagnosticFrameEntry[];
  [key: string]: unknown;
}

export interface DirectorDiagnosticPatternEvaluationResult {
  payload: DirectorDiagnosticPatternPayload;
  trajectorySmoothnessSummary: DirectorSmoothnessSummary;
  anomalyPeaks: DirectorAnomalyPeaks;
}
