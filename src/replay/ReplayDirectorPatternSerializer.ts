/**
 * ReplayDirectorPatternSerializer.ts
 * Serializes Goal Replay Director Camera diagnostic payloads into flat CSV tables,
 * local frame-window slices, and V2 RCREPLAY binary containers (.rcgr / .rcgr.gz).
 */

import { REPLAY_TICK_RATE } from './ReplayRingBuffer.ts';
import { serializeRCReplayBinaryContainer } from './container/RCReplayBinaryEncoder.ts';
import {
  normalizeReplayDirectorCarEntry,
  type RawReplayCarEntryLike,
} from './replayDirectorCarRosterPipeline.ts';
import type {
  DirectorDiagnosticPatternPayload,
  DirectorDiagnosticFrameEntry,
} from './ReplayDirectorDiagnostics.ts';
import type { ExtractedCarEntity } from './ReplayDirectorSceneAnalysis.ts';
import type {
  DirectorCameraState,
  ReplayActiveFrameEntry,
  ReplayCarRosterEntry,
} from './replayDirectorStateTypes.ts';

export interface DirectorPatternSerializerOptions {
  carEntries?: ReplayCarRosterEntry[];
  extraMetadata?: Record<string, unknown>;
}

export interface DirectorSerializerControllerPort {
  currentFrameIndex: number;
  sessionState?: {
    importedFileName?: string | null;
    scoringTeam?: number;
    scorerCarIndex?: number;
    activeFrames?: ReplayActiveFrameEntry[];
    carEntries?: ReplayCarRosterEntry[] | null;
    importedCarEntries?: ReplayCarRosterEntry[] | null;
  };
  directorCameraState?: Partial<DirectorCameraState>;
  buildDirectorDiagnosticPatternPayload?: (
    options?: DirectorPatternSerializerOptions
  ) => DirectorDiagnosticPatternPayload | null;
}

function encodeCarsPoseCompact(cars: ExtractedCarEntity[] | undefined): string {
  if (!Array.isArray(cars) || cars.length === 0) return '';
  return cars
    .map((c: ExtractedCarEntity) => {
      const idx = c.carIndex ?? 0;
      const team = c.team ?? idx % 2;
      const vis = String(c.visualId || 'octane').replace(/[,:;]/g, '');
      const hb = String(c.hitboxId || vis || 'octane').replace(/[,:;]/g, '');
      const px = c.pos?.[0] ?? 0;
      const py = c.pos?.[1] ?? 0;
      const pz = c.pos?.[2] ?? 17;
      const vx = c.vel?.[0] ?? 0;
      const vy = c.vel?.[1] ?? 0;
      const vz = c.vel?.[2] ?? 0;
      const fx = c.fwd?.[0] ?? 0;
      const fy = c.fwd?.[1] ?? 1;
      const fz = c.fwd?.[2] ?? 0;
      const ux = c.up?.[0] ?? 0;
      const uy = c.up?.[1] ?? 0;
      const uz = c.up?.[2] ?? 1;
      const boostPct = c.boostPct ?? 50;
      const onGround = c.onGround ? 1 : 0;
      return `${idx}:${team}:${vis}:${hb}:${px}:${py}:${pz}:${vx}:${vy}:${vz}:${fx}:${fy}:${fz}:${ux}:${uy}:${uz}:${boostPct}:${onGround}`;
    })
    .join(';');
}

export function buildDirectorDiagnosticPatternCsv(
  serializerPort: DirectorSerializerControllerPort | null | undefined,
  options: DirectorPatternSerializerOptions = {}
): string {
  const payload = serializerPort?.buildDirectorDiagnosticPatternPayload?.(options);
  if (!payload || !Array.isArray(payload.frames)) return '';

  const columns = [
    'frame_id',
    'replay_frame_index',
    'timestamp_sec',
    'progress',
    'is_selected_cursor',
    'slow_mo_factor',
    'active_touch_car_idx',
    'next_touch_car_idx',
    'next_touch_blend',
    'lateral_bias',
    'cam_eye_x',
    'cam_eye_y',
    'cam_eye_z',
    'cam_target_x',
    'cam_target_y',
    'cam_target_z',
    'cam_dist_to_target',
    'cam_yaw_deg',
    'cam_pitch_deg',
    'raw_eye_x',
    'raw_eye_y',
    'raw_eye_z',
    'raw_target_x',
    'raw_target_y',
    'raw_target_z',
    'ball_x',
    'ball_y',
    'ball_z',
    'ball_vx',
    'ball_vy',
    'ball_vz',
    'ball_speed_kph',
    'focus_car_x',
    'focus_car_y',
    'focus_car_z',
    'focus_car_vx',
    'focus_car_vy',
    'focus_car_vz',
    'focus_car_dist_to_ball',
    'eye_step_uu',
    'target_step_uu',
    'yaw_step_deg',
    'pitch_step_deg',
    'raw_eye_step_uu',
    'raw_target_step_uu',
    'eye_accel_uu',
    'target_accel_uu',
    'car_view_angle_deg',
    'ball_view_angle_deg',
    'focus_car_fx',
    'focus_car_fy',
    'focus_car_fz',
    'focus_car_ux',
    'focus_car_uy',
    'focus_car_uz',
    'focus_car_visual_id',
    'focus_car_hitbox_id',
    'cars_pose_compact',
  ];

  const lines = [columns.join(',')];
  for (const f of payload.frames) {
    const fc =
      f.cars.find((c: ExtractedCarEntity) => c.carIndex === f.lookahead.activeTouchCarIndex) ||
      f.cars[0] ||
      null;
    const cp = f.cameraPose;
    const row = [
      f.frameId,
      f.replayFrameIndex,
      f.timestampSec,
      f.progress,
      f.isSelectedCursorFrame ? 1 : 0,
      f.slowMoFactor,
      f.lookahead.activeTouchCarIndex,
      f.lookahead.nextTouchCarIndex,
      f.lookahead.nextTouchBlend,
      f.lookahead.lateralBias,
      cp.eyeUnreal[0],
      cp.eyeUnreal[1],
      cp.eyeUnreal[2],
      cp.targetUnreal[0],
      cp.targetUnreal[1],
      cp.targetUnreal[2],
      cp.distanceToTarget,
      cp.yawDeg,
      cp.pitchDeg,
      cp.rawUndampedEyeUnreal[0],
      cp.rawUndampedEyeUnreal[1],
      cp.rawUndampedEyeUnreal[2],
      cp.rawUndampedTargetUnreal[0],
      cp.rawUndampedTargetUnreal[1],
      cp.rawUndampedTargetUnreal[2],
      f.ball.pos[0],
      f.ball.pos[1],
      f.ball.pos[2],
      f.ball.vel[0],
      f.ball.vel[1],
      f.ball.vel[2],
      f.ball.speedKph,
      fc ? fc.pos[0] : 0,
      fc ? fc.pos[1] : 0,
      fc ? fc.pos[2] : 0,
      fc ? fc.vel[0] : 0,
      fc ? fc.vel[1] : 0,
      fc ? fc.vel[2] : 0,
      fc ? fc.distToBall : 0,
      cp.eyeStepUu ?? 0,
      cp.targetStepUu ?? 0,
      cp.yawStepDeg ?? 0,
      cp.pitchStepDeg ?? 0,
      cp.rawEyeStepUu ?? 0,
      cp.rawTargetStepUu ?? 0,
      cp.eyeAccelUu ?? 0,
      cp.targetAccelUu ?? 0,
      cp.carViewAngleDeg ?? 0,
      cp.ballViewAngleDeg ?? 0,
      fc ? (fc.fwd?.[0] ?? 0) : 0,
      fc ? (fc.fwd?.[1] ?? 1) : 1,
      fc ? (fc.fwd?.[2] ?? 0) : 0,
      fc ? (fc.up?.[0] ?? 0) : 0,
      fc ? (fc.up?.[1] ?? 0) : 0,
      fc ? (fc.up?.[2] ?? 1) : 1,
      fc ? String(fc.visualId || 'octane') : 'octane',
      fc ? String(fc.hitboxId || fc.visualId || 'octane') : 'octane',
      encodeCarsPoseCompact(f.cars),
    ];
    lines.push(row.join(','));
  }
  return lines.join('\n');
}

export function buildDirectorFrameWindowDiagnostic(
  serializerPort: DirectorSerializerControllerPort | null | undefined,
  windowRadius: number = 15
) {
  if (!serializerPort) return null;
  const payload = serializerPort.buildDirectorDiagnosticPatternPayload?.();
  if (!payload || !Array.isArray(payload.frames) || payload.frames.length === 0) return null;

  const total = payload.frames.length;
  const centerIdx = Math.max(0, Math.min(total - 1, serializerPort.currentFrameIndex));
  const radius = Math.max(1, Math.min(120, Math.round(windowRadius) || 15));
  const winStart = Math.max(0, centerIdx - radius);
  const winEnd = Math.min(total - 1, centerIdx + radius);
  const slice = payload.frames.slice(winStart, winEnd + 1);
  const centerFrame = payload.frames[centerIdx] || slice[0];

  return {
    schema: 'RocketCompanion.ReplayDirectorFrameWindowDiagnostic.v1',
    exportedAt: new Date().toISOString(),
    fileName: serializerPort.sessionState?.importedFileName || null,
    selectedFrameId: centerFrame?.frameId ?? 0,
    selectedReplayFrameIndex: centerIdx,
    windowRadius: radius,
    windowBounds: {
      startReplayFrameIndex: winStart,
      endReplayFrameIndex: winEnd,
      startFrameId: slice[0]?.frameId ?? 0,
      endFrameId: slice[slice.length - 1]?.frameId ?? 0,
      frameCount: slice.length,
    },
    replayMetadata: payload.replayMetadata,
    directorConfig: payload.directorConfig,
    anomalyPeaks: payload.replayMetadata.anomalyPeaks,
    touchTimeline: payload.touchTimeline,
    selectedFrameDiagnostic: payload.selectedFrameDiagnostic,
    windowFrames: slice.map((f: DirectorDiagnosticFrameEntry) => ({
      frameId: f.frameId,
      replayFrameIndex: f.replayFrameIndex,
      offsetFromSelected: f.replayFrameIndex - centerIdx,
      timestampSec: f.timestampSec,
      slowMoFactor: f.slowMoFactor,
      activeTouchCarIndex: f.lookahead.activeTouchCarIndex,
      nextTouchCarIndex: f.lookahead.nextTouchCarIndex,
      nextTouchBlend: f.lookahead.nextTouchBlend,
      carSwitchBlend: f.lookahead.carSwitchBlend,
      lateralBias: f.lookahead.lateralBias,
      dampedEye: f.cameraPose.eyeUnreal,
      dampedTarget: f.cameraPose.targetUnreal,
      rawEye: f.cameraPose.rawUndampedEyeUnreal,
      rawTarget: f.cameraPose.rawUndampedTargetUnreal,
      yawDeg: f.cameraPose.yawDeg,
      pitchDeg: f.cameraPose.pitchDeg,
      distanceToTarget: f.cameraPose.distanceToTarget,
      eyeStepUu: f.cameraPose.eyeStepUu,
      targetStepUu: f.cameraPose.targetStepUu,
      yawStepDeg: f.cameraPose.yawStepDeg,
      pitchStepDeg: f.cameraPose.pitchStepDeg,
      eyeAccelUu: f.cameraPose.eyeAccelUu,
      carViewAngleDeg: f.cameraPose.carViewAngleDeg,
      ballViewAngleDeg: f.cameraPose.ballViewAngleDeg,
      ball: f.ball,
      cars: f.cars,
    })),
  };
}

/**
 * Builds a V2 RCREPLAY binary container (`Uint8Array`) for the Goal Replay window,
 * embedding full 448-float physics snapshots for all 8 cars, 64-byte controls, incidents,
 * signals, plus `directorReplayMeta` (`directorConfig`, `carEntries`, `touchTimeline`,
 * `anomalyPeaks`, and `recordedDirectorFrames`).
 */
export function buildDirectorReplayContainerPayload(
  serializerPort: DirectorSerializerControllerPort | null | undefined,
  options: DirectorPatternSerializerOptions = {}
) {
  const payload = serializerPort?.buildDirectorDiagnosticPatternPayload?.(options);
  if (!serializerPort || !payload || !Array.isArray(payload.frames) || payload.frames.length === 0)
    return null;

  const recordedDirectorFrames = payload.frames.map((f: DirectorDiagnosticFrameEntry) => {
    const focusCar =
      f.cars.find((c: ExtractedCarEntity) => c.carIndex === f.lookahead.activeTouchCarIndex) ||
      f.cars[0] ||
      null;
    return {
      frame_id: f.frameId,
      replay_frame_index: f.replayFrameIndex,
      timestamp_sec: f.timestampSec,
      progress: f.progress,
      is_selected_cursor: f.isSelectedCursorFrame ? 1 : 0,
      slow_mo_factor: f.slowMoFactor,
      active_touch_car_idx: f.lookahead.activeTouchCarIndex,
      next_touch_car_idx: f.lookahead.nextTouchCarIndex,
      next_touch_blend: f.lookahead.nextTouchBlend,
      lateral_bias: f.lookahead.lateralBias,
      cam_eye_x: f.cameraPose.eyeUnreal[0],
      cam_eye_y: f.cameraPose.eyeUnreal[1],
      cam_eye_z: f.cameraPose.eyeUnreal[2],
      cam_target_x: f.cameraPose.targetUnreal[0],
      cam_target_y: f.cameraPose.targetUnreal[1],
      cam_target_z: f.cameraPose.targetUnreal[2],
      cam_dist_to_target: f.cameraPose.distanceToTarget,
      cam_yaw_deg: f.cameraPose.yawDeg,
      cam_pitch_deg: f.cameraPose.pitchDeg,
      raw_eye_x: f.cameraPose.rawUndampedEyeUnreal[0],
      raw_eye_y: f.cameraPose.rawUndampedEyeUnreal[1],
      raw_eye_z: f.cameraPose.rawUndampedEyeUnreal[2],
      raw_target_x: f.cameraPose.rawUndampedTargetUnreal[0],
      raw_target_y: f.cameraPose.rawUndampedTargetUnreal[1],
      raw_target_z: f.cameraPose.rawUndampedTargetUnreal[2],
      ball_x: f.ball.pos[0],
      ball_y: f.ball.pos[1],
      ball_z: f.ball.pos[2],
      ball_vx: f.ball.vel[0],
      ball_vy: f.ball.vel[1],
      ball_vz: f.ball.vel[2],
      ball_speed_kph: f.ball.speedKph,
      focus_car_x: focusCar ? focusCar.pos[0] : 0,
      focus_car_y: focusCar ? focusCar.pos[1] : 0,
      focus_car_z: focusCar ? focusCar.pos[2] : 17,
      focus_car_vx: focusCar ? focusCar.vel[0] : 0,
      focus_car_vy: focusCar ? focusCar.vel[1] : 0,
      focus_car_vz: focusCar ? focusCar.vel[2] : 0,
      focus_car_dist_to_ball: focusCar ? focusCar.distToBall : 0,
      eye_step_uu: f.cameraPose.eyeStepUu ?? 0,
      target_step_uu: f.cameraPose.targetStepUu ?? 0,
      yaw_step_deg: f.cameraPose.yawStepDeg ?? 0,
      pitch_step_deg: f.cameraPose.pitchStepDeg ?? 0,
      raw_eye_step_uu: f.cameraPose.rawEyeStepUu ?? 0,
      raw_target_step_uu: f.cameraPose.rawTargetStepUu ?? 0,
      eye_accel_uu: f.cameraPose.eyeAccelUu ?? 0,
      target_accel_uu: f.cameraPose.targetAccelUu ?? 0,
      car_view_angle_deg: f.cameraPose.carViewAngleDeg ?? 0,
      ball_view_angle_deg: f.cameraPose.ballViewAngleDeg ?? 0,
      focus_car_fx: focusCar ? (focusCar.fwd?.[0] ?? 0) : 0,
      focus_car_fy: focusCar ? (focusCar.fwd?.[1] ?? 1) : 1,
      focus_car_fz: focusCar ? (focusCar.fwd?.[2] ?? 0) : 0,
      focus_car_ux: focusCar ? (focusCar.up?.[0] ?? 0) : 0,
      focus_car_uy: focusCar ? (focusCar.up?.[1] ?? 0) : 0,
      focus_car_uz: focusCar ? (focusCar.up?.[2] ?? 1) : 1,
      focus_car_visual_id: focusCar ? String(focusCar.visualId || 'octane') : 'octane',
      focus_car_hitbox_id: focusCar
        ? String(focusCar.hitboxId || focusCar.visualId || 'octane')
        : 'octane',
    };
  });

  const rawCarEntries: RawReplayCarEntryLike[] =
    options.carEntries ||
    serializerPort.sessionState?.carEntries ||
    serializerPort.sessionState?.importedCarEntries ||
    payload.replayMetadata?.carEntries ||
    [];
  const carEntries: ReplayCarRosterEntry[] =
    Array.isArray(rawCarEntries) && rawCarEntries.length > 0
      ? rawCarEntries.map((c: RawReplayCarEntryLike, idx: number) =>
          normalizeReplayDirectorCarEntry(c, c?.carIndex ?? idx, c?.team ?? idx % 2)
        )
      : Array.isArray(payload.frames[0]?.cars)
        ? payload.frames[0].cars.map((c: ExtractedCarEntity, idx: number) =>
            normalizeReplayDirectorCarEntry(c, c?.carIndex ?? idx, c?.team ?? idx % 2)
          )
        : [];

  const directorReplayMeta = {
    schema: 'RocketCompanion.GoalReplayDirectorContainer.v1',
    scoringTeam: serializerPort.sessionState?.scoringTeam ?? 0,
    scorerCarIndex: serializerPort.sessionState?.scorerCarIndex ?? 0,
    selectedReplayFrameIndex: serializerPort.currentFrameIndex ?? 0,
    selectedFrameId: payload.selectedFrameDiagnostic?.frameId ?? 0,
    lateralBias: serializerPort.directorCameraState?.lateralBias || 1.0,
    lastScoringTouchFrameIdx: serializerPort.directorCameraState?.lastScoringTouchFrameIdx ?? -1,
    goalLineFrameIdx: serializerPort.directorCameraState?.goalLineFrameIdx ?? -1,
    initialSettledCarPos: serializerPort.directorCameraState?.initialSettledCarPos
      ? { ...serializerPort.directorCameraState.initialSettledCarPos }
      : null,
    directorConfig: payload.directorConfig,
    carEntries,
    touchTimeline: payload.touchTimeline,
    trajectorySmoothnessSummary: payload.replayMetadata.trajectorySmoothnessSummary,
    anomalyPeaks: payload.replayMetadata.anomalyPeaks,
    recordedDirectorFrames,
  };

  return {
    mode: 'goal-replay',
    tickRate: REPLAY_TICK_RATE,
    winner: (serializerPort.sessionState?.scoringTeam ?? 0) === 0 ? 'blue' : 'orange',
    slots: serializerPort.sessionState?.activeFrames,
    roster: carEntries,
    directorReplayMeta,
    diagnosticPayload: payload,
  };
}

export function buildDirectorReplayContainerBytes(
  serializerPort: DirectorSerializerControllerPort | null | undefined,
  options: DirectorPatternSerializerOptions = {}
) {
  const containerPayload = buildDirectorReplayContainerPayload(serializerPort, options);
  if (!containerPayload) return null;
  const containerBytes = serializeRCReplayBinaryContainer(containerPayload);
  return {
    containerBytes,
    directorReplayMeta: containerPayload.directorReplayMeta,
    diagnosticPayload: containerPayload.diagnosticPayload,
  };
}
