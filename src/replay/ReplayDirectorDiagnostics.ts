/**
 * ReplayDirectorDiagnostics.ts
 * Pure narrow-input pipeline for Director Camera diagnostic snapshot generation
 * and deterministic 120Hz full-window camera trajectory simulation.
 */

import { REPLAY_TICK_RATE } from './ReplayRingBuffer.ts';
import { SIM_OFFSETS } from '../physics/RocketSimConstants.ts';
import { computeGoalReplayCameraPose, type DirectorCameraPose } from './ReplayDirectorCamera.ts';
import { decodeReplayDirectorTelemetryFromState } from './ReplayFrameInterpolator.ts';
import {
  REPLAY_DIRECTOR_CONFIG,
  DEFAULT_REPLAY_DIRECTOR_CONFIG,
} from '../ui-core/config/replayDirectorConfig.ts';
import {
  round3,
  round4,
  vec3Round3,
  computeCameraAnglesFromPose,
  extractFrameEntities,
  resolveEmbeddedLookahead,
  computeViewAngleToPointDeg,
  type CameraAnglesFromPose,
} from './ReplayDirectorSceneAnalysis.ts';
import { wrapAngleDeltaDeg } from './replayDirectorElevationPipeline.ts';
import type { ReplayTouchEvent } from './ReplayDirectorGazeSolver.ts';
import {
  buildCurrentFrameDiagnosticSnapshot,
  buildDiagnosticFrameEntry,
  syncLookaheadState,
  type CurrentFrameDiagnosticSnapshot,
  type DirectorDiagnosticPatternPayload,
  type DirectorDiagnosticPatternEvaluationResult,
} from './replayDirectorSingleFramePipeline.ts';
import type {
  DirectorCameraState,
  DirectorSmoothnessSummary,
  DirectorAnomalyPeaks,
  ReplayCarRosterEntry,
  ReplayDirectorDiagnosticInput,
  DirectorDiagnosticPatternOptions,
  DirectorDiagnosticFrameLookahead,
  DirectorDiagnosticFrameCameraPose,
  DirectorDiagnosticFrameEntry,
  DirectorDiagnosticTouchTimelineEntry,
} from './replayDirectorStateTypes.ts';

export type {
  CurrentFrameDiagnosticSnapshot,
  DirectorDiagnosticPatternPayload,
  DirectorDiagnosticPatternEvaluationResult,
  ReplayDirectorDiagnosticInput,
  DirectorDiagnosticPatternOptions,
  DirectorDiagnosticFrameLookahead,
  DirectorDiagnosticFrameCameraPose,
  DirectorDiagnosticFrameEntry,
  DirectorDiagnosticTouchTimelineEntry,
  DirectorSmoothnessSummary,
  DirectorAnomalyPeaks,
  ReplayCarRosterEntry,
};

export function evaluateDirectorDiagnosticPatternPayload(
  input: ReplayDirectorDiagnosticInput,
  options: DirectorDiagnosticPatternOptions = {}
): DirectorDiagnosticPatternEvaluationResult | null {
  const total = input.activeWindowCount > 0 ? input.activeWindowCount : input.totalFrames;
  if (total <= 0) return null;

  const firstEntry = input.getFrameEntryByIndex(0),
    lastEntry = input.getFrameEntryByIndex(total - 1);
  const firstSnap = input.getFrameBufferByIndex(0),
    lastSnap = input.getFrameBufferByIndex(total - 1);
  const startFrameId = firstEntry?.tick ?? Math.round(firstSnap?.[SIM_OFFSETS.TICK] || 0);
  const endFrameId =
    lastEntry?.tick ?? Math.round(lastSnap?.[SIM_OFFSETS.TICK] || startFrameId + total - 1);
  const suffixPlan = input.ensureSuffixCameraPlan() || null;
  const dState = input.directorCameraState;

  const simState: DirectorCameraState = {
    initialized: false,
    eyeX: 0,
    eyeY: 0,
    eyeZ: 0,
    targetX: 0,
    targetY: 0,
    targetZ: 0,
    lateralBias: suffixPlan?.lateralBias ?? dState.lateralBias ?? 1.0,
    hasResolvedInitialLateralBias: Boolean(dState.hasResolvedInitialLateralBias),
    activeTouchCarIndex: dState.activeTouchCarIndex ?? input.scorerCarIndex ?? 0,
    scorerCarIndex: dState.scorerCarIndex ?? input.scorerCarIndex ?? 0,
    nextTouchCarIndex: -1,
    nextTouchBlend: 0,
    nextTouchBallPos: null,
    interceptorCarIndex: -1,
    interceptorBlend: 0,
    suffixCameraPlan: suffixPlan,
    postGoalElapsedSec: 0,
    initialSettledCarPos: dState.initialSettledCarPos ? { ...dState.initialSettledCarPos } : null,
    touchEvents: Array.isArray(dState.touchEvents)
      ? dState.touchEvents.map((t: ReplayTouchEvent) => ({ ...t }))
      : [],
    lastScoringTouchFrameIdx: dState.lastScoringTouchFrameIdx ?? -1,
    goalLineFrameIdx: dState.goalLineFrameIdx ?? -1,
  };

  const frames: DirectorDiagnosticFrameEntry[] = [];
  let prevPose: DirectorCameraPose | null = null,
    prevRawPose: DirectorCameraPose | null = null;
  let prevAngles: CameraAnglesFromPose | null = null;
  let prevEyeVel: [number, number, number] | null = null,
    prevTargetVel: [number, number, number] | null = null;

  let maxEyeStepUu = 0,
    maxTargetStepUu = 0,
    maxRawEyeStepUu = 0,
    maxRawTargetStepUu = 0;
  let maxEyeAccelUu = 0,
    maxTargetAccelUu = 0,
    maxYawStepDeg = 0;
  let totalYawPathDeg = 0,
    minYawAccumDeg = 0,
    maxYawAccumDeg = 0,
    yawAccumDeg = 0;
  let maxPreGoalCarViewAngleDeg = 0,
    maxPreGoalBallViewAngleDeg = 0;
  let maxInterceptorViewAngleDeg = 0,
    maxPostGoalCarViewAngleDeg = 0;

  const peakZero = () => ({ replayFrameIndex: 0, frameId: startFrameId, timestampSec: 0 });
  const anomalyPeaks = {
    maxEyeStep: { valueUu: 0, ...peakZero() },
    maxYawStep: { valueDeg: 0, ...peakZero() },
    maxEyeAccel: { valueUu: 0, ...peakZero() },
    maxPreGoalCarViewAngle: { valueDeg: 0, ...peakZero() },
    maxPreGoalBallViewAngle: { valueDeg: 0, ...peakZero() },
  };

  const effectiveCarEntries =
    Array.isArray(options.carEntries) && options.carEntries.length > 0
      ? options.carEntries
      : Array.isArray(input.carEntries) && input.carEntries.length > 0
        ? [...input.carEntries]
        : null;

  for (let idx = 0; idx < total; idx++) {
    const entry = input.getFrameEntryByIndex(idx);
    const snap = input.getFrameBufferByIndex(idx);
    if (!snap) continue;

    const entities = extractFrameEntities(
      snap,
      input.carTeamResolver ?? undefined,
      effectiveCarEntries
    );
    const frameId = entry?.tick ?? entities.tick ?? startFrameId + idx;
    const embedded = !suffixPlan ? decodeReplayDirectorTelemetryFromState(snap) : null;
    const progress = total > 1 ? idx / (total - 1) : (embedded?.progress ?? 0);

    if (embedded && typeof embedded.lateralBias === 'number' && embedded.lateralBias !== 0) {
      simState.lateralBias = embedded.lateralBias;
      simState.hasResolvedInitialLateralBias = true;
    }
    if (embedded && typeof embedded.scorerCarIndex === 'number' && embedded.scorerCarIndex >= 0) {
      simState.scorerCarIndex = embedded.scorerCarIndex;
    }

    const lookahead = embedded
      ? resolveEmbeddedLookahead(embedded, simState.scorerCarIndex ?? input.scorerCarIndex ?? 0)
      : input.resolveTouchLookaheadForFrame(
          idx,
          simState.activeTouchCarIndex ?? input.scorerCarIndex ?? 0
        );
    syncLookaheadState(simState, lookahead, idx);

    const slowMoFactor = input.computeDramaticSlowMoFactor(idx, { ignoreScrubState: true });
    const dampedPose = computeGoalReplayCameraPose(snap, input.scoringTeam, {
      scorerCarIndex: simState.scorerCarIndex ?? input.scorerCarIndex,
      progress,
      frameIndex: idx,
      suffixCameraPlan: suffixPlan,
      directorState: simState,
      dt: 1 / REPLAY_TICK_RATE,
      exactDt: true,
    });
    const rawPose: DirectorCameraPose = {
      eyeX: dampedPose.rawEyeX ?? dampedPose.eyeX,
      eyeY: dampedPose.rawEyeY ?? dampedPose.eyeY,
      eyeZ: dampedPose.rawEyeZ ?? dampedPose.eyeZ,
      targetX: dampedPose.rawTargetX ?? dampedPose.targetX,
      targetY: dampedPose.rawTargetY ?? dampedPose.targetY,
      targetZ: dampedPose.rawTargetZ ?? dampedPose.targetZ,
    };

    const dampedAngles = computeCameraAnglesFromPose(dampedPose);
    const rawAngles = computeCameraAnglesFromPose(rawPose);
    const focusCar =
      entities.cars.find((c) => c.carIndex === lookahead.primaryCarIndex) ||
      entities.cars[0] ||
      null;
    const interceptorCar =
      (lookahead.interceptorCarIndex ?? -1) >= 0
        ? entities.cars.find((c) => c.carIndex === lookahead.interceptorCarIndex) || null
        : null;
    const effectiveCarPos =
      idx === 0 && simState.initialSettledCarPos
        ? [
            simState.initialSettledCarPos.x,
            simState.initialSettledCarPos.y,
            simState.initialSettledCarPos.z,
          ]
        : focusCar
          ? focusCar.pos
          : null;
    const carViewAngleDeg = effectiveCarPos
      ? computeViewAngleToPointDeg(dampedPose, effectiveCarPos)
      : 0;
    const interceptorViewAngleDeg = interceptorCar
      ? computeViewAngleToPointDeg(dampedPose, interceptorCar.pos)
      : 0;
    const ballViewAngleDeg = computeViewAngleToPointDeg(dampedPose, entities.ball.pos);

    const timestampSec = round3(idx / REPLAY_TICK_RATE);
    const goalIdx = simState.goalLineFrameIdx;
    if (goalIdx < 0 || idx <= goalIdx) {
      if (carViewAngleDeg > maxPreGoalCarViewAngleDeg) {
        maxPreGoalCarViewAngleDeg = carViewAngleDeg;
        anomalyPeaks.maxPreGoalCarViewAngle = {
          valueDeg: round3(carViewAngleDeg),
          replayFrameIndex: idx,
          frameId,
          timestampSec,
        };
      }
      if (ballViewAngleDeg > maxPreGoalBallViewAngleDeg) {
        maxPreGoalBallViewAngleDeg = ballViewAngleDeg;
        anomalyPeaks.maxPreGoalBallViewAngle = {
          valueDeg: round3(ballViewAngleDeg),
          replayFrameIndex: idx,
          frameId,
          timestampSec,
        };
      }
      if (
        (lookahead.interceptorBlend ?? 0) > 0.25 &&
        interceptorViewAngleDeg > maxInterceptorViewAngleDeg
      ) {
        maxInterceptorViewAngleDeg = interceptorViewAngleDeg;
      }
    } else if (idx >= goalIdx + 45 && carViewAngleDeg > maxPostGoalCarViewAngleDeg) {
      maxPostGoalCarViewAngleDeg = carViewAngleDeg;
    }

    let eyeStepUu = 0,
      targetStepUu = 0,
      rawEyeStepUu = 0,
      rawTargetStepUu = 0;
    let yawStepDeg = 0,
      pitchStepDeg = 0,
      eyeAccelUu = 0,
      targetAccelUu = 0;

    if (prevPose && prevRawPose && prevAngles) {
      const evX = dampedPose.eyeX - prevPose.eyeX,
        evY = dampedPose.eyeY - prevPose.eyeY,
        evZ = dampedPose.eyeZ - prevPose.eyeZ;
      const tvX = dampedPose.targetX - prevPose.targetX,
        tvY = dampedPose.targetY - prevPose.targetY,
        tvZ = dampedPose.targetZ - prevPose.targetZ;

      eyeStepUu = Math.hypot(evX, evY, evZ);
      targetStepUu = Math.hypot(tvX, tvY, tvZ);
      rawEyeStepUu = Math.hypot(
        rawPose.eyeX - prevRawPose.eyeX,
        rawPose.eyeY - prevRawPose.eyeY,
        rawPose.eyeZ - prevRawPose.eyeZ
      );
      rawTargetStepUu = Math.hypot(
        rawPose.targetX - prevRawPose.targetX,
        rawPose.targetY - prevRawPose.targetY,
        rawPose.targetZ - prevRawPose.targetZ
      );
      yawStepDeg = wrapAngleDeltaDeg(dampedAngles.yawDeg, prevAngles.yawDeg);
      pitchStepDeg = dampedAngles.pitchDeg - prevAngles.pitchDeg;
      totalYawPathDeg += Math.abs(yawStepDeg);
      yawAccumDeg += yawStepDeg;
      if (yawAccumDeg < minYawAccumDeg) minYawAccumDeg = yawAccumDeg;
      if (yawAccumDeg > maxYawAccumDeg) maxYawAccumDeg = yawAccumDeg;

      if (prevEyeVel && prevTargetVel) {
        eyeAccelUu = Math.hypot(evX - prevEyeVel[0], evY - prevEyeVel[1], evZ - prevEyeVel[2]);
        targetAccelUu = Math.hypot(
          tvX - prevTargetVel[0],
          tvY - prevTargetVel[1],
          tvZ - prevTargetVel[2]
        );
      }
      prevEyeVel = [evX, evY, evZ];
      prevTargetVel = [tvX, tvY, tvZ];

      if (eyeStepUu > maxEyeStepUu) {
        maxEyeStepUu = eyeStepUu;
        anomalyPeaks.maxEyeStep = {
          valueUu: round3(eyeStepUu),
          replayFrameIndex: idx,
          frameId,
          timestampSec,
        };
      }
      if (targetStepUu > maxTargetStepUu) maxTargetStepUu = targetStepUu;
      if (rawEyeStepUu > maxRawEyeStepUu) maxRawEyeStepUu = rawEyeStepUu;
      if (rawTargetStepUu > maxRawTargetStepUu) maxRawTargetStepUu = rawTargetStepUu;
      if (eyeAccelUu > maxEyeAccelUu) {
        maxEyeAccelUu = eyeAccelUu;
        anomalyPeaks.maxEyeAccel = {
          valueUu: round3(eyeAccelUu),
          replayFrameIndex: idx,
          frameId,
          timestampSec,
        };
      }
      if (targetAccelUu > maxTargetAccelUu) maxTargetAccelUu = targetAccelUu;
      if (Math.abs(yawStepDeg) > maxYawStepDeg) {
        maxYawStepDeg = Math.abs(yawStepDeg);
        anomalyPeaks.maxYawStep = {
          valueDeg: round4(Math.abs(yawStepDeg)),
          replayFrameIndex: idx,
          frameId,
          timestampSec,
        };
      }
    }

    prevPose = { ...dampedPose };
    prevRawPose = { ...rawPose };
    prevAngles = { ...dampedAngles };

    frames.push(
      buildDiagnosticFrameEntry({
        frameId,
        idx,
        timestampSec,
        progress,
        slowMoFactor,
        isSelectedCursorFrame: idx === input.currentFrameIndex,
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
        incidents: entry?.incidents,
      })
    );
  }

  const touchEventsWithFrameIds: DirectorDiagnosticTouchTimelineEntry[] = (
    dState.touchEvents || []
  ).map((t: ReplayTouchEvent) => {
    const fEntry = input.getFrameEntryByIndex(t.frameIndex);
    return {
      replayFrameIndex: t.frameIndex,
      frameId: fEntry?.tick ?? t.tick ?? startFrameId + t.frameIndex,
      timestampSec: round3(t.frameIndex / REPLAY_TICK_RATE),
      carIndex: t.carIndex,
      team: t.team,
      ballPos: vec3Round3(t.ballX, t.ballY, t.ballZ),
    };
  });

  const lastTouchIdx = dState.lastScoringTouchFrameIdx ?? -1;
  const goalLineIdx = dState.goalLineFrameIdx ?? -1;
  const trajectorySmoothnessSummary = {
    totalFrames: total,
    durationSec: round3(total / REPLAY_TICK_RATE),
    startFrameId,
    endFrameId,
    maxEyeStepUu: round3(maxEyeStepUu),
    maxTargetStepUu: round3(maxTargetStepUu),
    maxRawEyeStepUu: round3(maxRawEyeStepUu),
    maxRawTargetStepUu: round3(maxRawTargetStepUu),
    maxEyeAccelUu: round3(maxEyeAccelUu),
    maxTargetAccelUu: round3(maxTargetAccelUu),
    maxYawStepDeg: round4(maxYawStepDeg),
    totalYawPathDeg: round3(totalYawPathDeg),
    netYawSpanDeg: round3(maxYawAccumDeg - minYawAccumDeg),
    maxPreGoalCarViewAngleDeg: round3(maxPreGoalCarViewAngleDeg),
    maxPreGoalBallViewAngleDeg: round3(maxPreGoalBallViewAngleDeg),
    maxInterceptorViewAngleDeg: round3(maxInterceptorViewAngleDeg),
    maxPostGoalCarViewAngleDeg: round3(maxPostGoalCarViewAngleDeg),
  };

  const currentSnapshot = buildCurrentFrameDiagnosticSnapshot({
    ...input,
    cachedSmoothnessSummary: trajectorySmoothnessSummary,
    cachedAnomalyPeaks: anomalyPeaks,
  });

  const payload = {
    schema: 'RocketCompanion.ReplayDirectorDiagnosticPattern.v1',
    exportedAt: new Date().toISOString(),
    coordinateConventions: {
      unreal: 'X right, Y forward (toward Orange goal +5120), Z up (Unreal Units)',
      threeJs: 'X right, Y up, Z forward',
    },
    replayMetadata: {
      tickRate: REPLAY_TICK_RATE,
      totalReplayFrames: total,
      durationSeconds: round3(total / REPLAY_TICK_RATE),
      startFrameId,
      endFrameId,
      scoringTeam: input.scoringTeam,
      scoringTeamName: input.scoringTeam === 0 ? 'BLUE' : 'ORANGE',
      scorerCarIndex: input.scorerCarIndex,
      lastScoringTouchReplayFrameIndex: lastTouchIdx,
      lastScoringTouchFrameId:
        lastTouchIdx >= 0
          ? (input.getFrameEntryByIndex(lastTouchIdx)?.tick ?? startFrameId + lastTouchIdx)
          : -1,
      goalLineReplayFrameIndex: goalLineIdx,
      goalLineFrameId:
        goalLineIdx >= 0
          ? (input.getFrameEntryByIndex(goalLineIdx)?.tick ?? startFrameId + goalLineIdx)
          : -1,
      trajectorySmoothnessSummary,
      anomalyPeaks,
      playbackStateAtExport: {
        selectedReplayFrameIndex: input.currentFrameIndex,
        selectedFrameId: currentSnapshot?.frameId ?? startFrameId,
        cursorFloat: round3(input.cursorFloat),
        progress: round4(input.progress),
        isPaused: input.isPaused,
        isPersistent: input.isPersistent,
        isScrubbing: input.isScrubbing,
        playbackSpeed: input.playbackSpeed,
      },
      ...(effectiveCarEntries ? { carEntries: effectiveCarEntries } : {}),
      ...(options.extraMetadata || {}),
    },
    directorConfig: { ...REPLAY_DIRECTOR_CONFIG },
    defaultDirectorConfig: { ...DEFAULT_REPLAY_DIRECTOR_CONFIG },
    touchTimeline: touchEventsWithFrameIds,
    selectedFrameDiagnostic: currentSnapshot,
    frames,
  };

  return { payload, trajectorySmoothnessSummary, anomalyPeaks };
}
