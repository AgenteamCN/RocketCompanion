/**
 * ReplayDirectorLegacyFormatParser.ts
 * Parses legacy CSV and JSON Director Diagnostic Pattern files into replay frames and telemetry.
 */

import { REPLAY_TICK_RATE } from './ReplayRingBuffer.ts';
import {
  SIM_OFFSETS,
  CAR_STATE_STRIDE,
  MAX_CARS,
  GAME_STATE_BUFFER_FLOATS,
  NUM_BOOST_PADS,
  BOOST_PAD_STATES_OFFSET,
  BOOST_PAD_STATE_STRIDE,
} from '../physics/RocketSimConstants.ts';
import { encodeReplayDirectorTelemetryIntoState } from './ReplayFrameInterpolator.ts';
import { round3 } from './ReplayDirectorSceneAnalysis.ts';
import type { ReplayTouchEvent } from './ReplayDirectorGazeSolver.ts';
import {
  normalizeReplayDirectorCarEntry,
  type RawReplayCarEntryLike,
} from './replayDirectorCarRosterPipeline.ts';
import type {
  ReplayActiveFrameEntry,
  ReplayCarRosterEntry,
  DirectorAnomalyPeaks,
  DirectorSmoothnessSummary,
} from './replayDirectorStateTypes.ts';

export interface ParsedDirectorDiagnosticPattern {
  format: 'csv' | 'json' | 'rcgr';
  fileName: string;
  activeFrames: ReplayActiveFrameEntry[];
  scoringTeam: number;
  scorerCarIndex: number;
  selectedCursorIndex: number;
  lateralBias: number;
  touchEvents: ReplayTouchEvent[];
  lastScoringTouchFrameIdx?: number;
  goalLineFrameIdx: number;
  initialSettledCarPos?: { carIndex?: number; x: number; y: number; z: number } | null;
  hasRecordedCsvRows: boolean;
  directorConfig?: Record<string, unknown> | null;
  carEntries?: ReplayCarRosterEntry[];
  anomalyPeaks: DirectorAnomalyPeaks | null;
  summary: DirectorSmoothnessSummary;
}

export const BALL_FIELD_OFFSETS = Object.freeze({
  POS_X: 0,
  POS_Y: 1,
  POS_Z: 2,
  VEL_X: 12,
  VEL_Y: 13,
  VEL_Z: 14,
});

export const CAR_FIELD_OFFSETS = Object.freeze({
  POS_X: 0,
  POS_Y: 1,
  POS_Z: 2,
  FWD_X: 3,
  FWD_Y: 4,
  FWD_Z: 5,
  RIGHT_X: 6,
  RIGHT_Y: 7,
  RIGHT_Z: 8,
  UP_X: 9,
  UP_Y: 10,
  UP_Z: 11,
  VEL_X: 12,
  VEL_Y: 13,
  VEL_Z: 14,
  BOOST: 18,
  IS_ON_GROUND: 19,
  IS_SUPERSONIC: 20,
  IS_DEMOED: 21,
  HAS_FLIPPED_OR_DOUBLE_JUMPED: 22,
  IS_BOOSTING: 23,
});

export interface OrthonormalBasis {
  fx: number;
  fy: number;
  fz: number;
  rx: number;
  ry: number;
  rz: number;
  ux: number;
  uy: number;
  uz: number;
}

export function orthonormalizeFwdUpBasis(
  rawFx: number,
  rawFy: number,
  rawFz: number,
  rawUx: number,
  rawUy: number,
  rawUz: number
): OrthonormalBasis {
  let fx = Number.isFinite(rawFx) ? rawFx : 0;
  let fy = Number.isFinite(rawFy) ? rawFy : 1;
  let fz = Number.isFinite(rawFz) ? rawFz : 0;
  let fLen = Math.hypot(fx, fy, fz);
  if (fLen < 1e-4) {
    fx = 0;
    fy = 1;
    fz = 0;
    fLen = 1;
  }
  fx /= fLen;
  fy /= fLen;
  fz /= fLen;

  let ux = Number.isFinite(rawUx) ? rawUx : 0;
  let uy = Number.isFinite(rawUy) ? rawUy : 0;
  let uz = Number.isFinite(rawUz) ? rawUz : 1;
  const dotFU = ux * fx + uy * fy + uz * fz;
  ux -= dotFU * fx;
  uy -= dotFU * fy;
  uz -= dotFU * fz;
  let uLen = Math.hypot(ux, uy, uz);
  if (uLen < 1e-4) {
    if (Math.abs(fz) < 0.9) {
      ux = -fx * fz;
      uy = -fy * fz;
      uz = 1 - fz * fz;
    } else {
      ux = 1 - fx * fx;
      uy = -fx * fy;
      uz = -fx * fz;
    }
    uLen = Math.hypot(ux, uy, uz) || 1;
  }
  ux /= uLen;
  uy /= uLen;
  uz /= uLen;

  let rx = uy * fz - uz * fy;
  let ry = uz * fx - ux * fz;
  let rz = ux * fy - uy * fx;
  const rLen = Math.hypot(rx, ry, rz) || 1;
  rx /= rLen;
  ry /= rLen;
  rz /= rLen;
  return { fx, fy, fz, rx, ry, rz, ux, uy, uz };
}

export function initBlankSnapshotBuffer(tick: number, numCars: number): Float32Array {
  const buf = new Float32Array(GAME_STATE_BUFFER_FLOATS);
  buf[SIM_OFFSETS.TICK] = tick;
  buf[SIM_OFFSETS.GOAL] = 0;
  buf[SIM_OFFSETS.NUM_CARS] = numCars;
  buf[SIM_OFFSETS.NUM_PADS] = NUM_BOOST_PADS;

  const bBase = SIM_OFFSETS.BALL;
  buf[bBase + 3] = 1;
  buf[bBase + 7] = 1;
  buf[bBase + 11] = 1;

  for (let c = 0; c < MAX_CARS; c++) {
    const base = SIM_OFFSETS.CARS + c * CAR_STATE_STRIDE,
      O = CAR_FIELD_OFFSETS;
    buf[base + O.POS_X] = -9999;
    buf[base + O.POS_Y] = -9999;
    buf[base + O.POS_Z] = -500;
    buf[base + O.FWD_Y] = 1;
    buf[base + O.RIGHT_X] = -1;
    buf[base + O.UP_Z] = 1;
  }

  for (let p = 0; p < NUM_BOOST_PADS; p++) {
    const padBase = BOOST_PAD_STATES_OFFSET + p * BOOST_PAD_STATE_STRIDE;
    buf[padBase] = 1.0;
    buf[padBase + 1] = 0.0;
  }
  return buf;
}

export function writeBallStateToSnapshot(
  snap: Float32Array,
  bx: number,
  by: number,
  bz: number,
  bvx: number,
  bvy: number,
  bvz: number
): void {
  const bBase = SIM_OFFSETS.BALL;
  snap[bBase + BALL_FIELD_OFFSETS.POS_X] = bx;
  snap[bBase + BALL_FIELD_OFFSETS.POS_Y] = by;
  snap[bBase + BALL_FIELD_OFFSETS.POS_Z] = bz;
  snap[bBase + BALL_FIELD_OFFSETS.VEL_X] = bvx;
  snap[bBase + BALL_FIELD_OFFSETS.VEL_Y] = bvy;
  snap[bBase + BALL_FIELD_OFFSETS.VEL_Z] = bvz;
}

export function writeCarStateToSnapshot(
  snap: Float32Array,
  carIndex: number,
  pos: [number, number, number],
  vel: [number, number, number],
  b: OrthonormalBasis,
  boost: number,
  onGround: boolean,
  demoed: boolean,
  isBoosting: boolean,
  supersonic: boolean
): void {
  const c = SIM_OFFSETS.CARS + carIndex * CAR_STATE_STRIDE,
    O = CAR_FIELD_OFFSETS;
  snap[c + O.POS_X] = pos[0];
  snap[c + O.POS_Y] = pos[1];
  snap[c + O.POS_Z] = pos[2];
  snap[c + O.VEL_X] = vel[0];
  snap[c + O.VEL_Y] = vel[1];
  snap[c + O.VEL_Z] = vel[2];
  snap[c + O.FWD_X] = b.fx;
  snap[c + O.FWD_Y] = b.fy;
  snap[c + O.FWD_Z] = b.fz;
  snap[c + O.RIGHT_X] = b.rx;
  snap[c + O.RIGHT_Y] = b.ry;
  snap[c + O.RIGHT_Z] = b.rz;
  snap[c + O.UP_X] = b.ux;
  snap[c + O.UP_Y] = b.uy;
  snap[c + O.UP_Z] = b.uz;
  snap[c + O.BOOST] = boost;
  snap[c + O.IS_ON_GROUND] = onGround ? 1 : 0;
  snap[c + O.IS_DEMOED] = demoed ? 1 : 0;
  snap[c + O.IS_BOOSTING] = isBoosting ? 1 : 0;
  snap[c + O.IS_SUPERSONIC] = supersonic ? 1 : 0;
}

interface LegacyPatternCarJson {
  carIndex?: number;
  team?: number;
  visualId?: string;
  hitboxId?: string | null;
  pos?: number[];
  vel?: number[];
  fwd?: number[];
  up?: number[];
  boost?: number;
  boostPct?: number;
  onGround?: boolean;
  demoed?: boolean;
  isBoosting?: boolean;
  supersonic?: boolean;
  distToBall?: number;
}

interface LegacyPatternFrameJson {
  frameId?: number;
  timestampSec?: number;
  progress?: number;
  isSelectedCursorFrame?: boolean;
  slowMoFactor?: number;
  ball?: { pos?: number[]; vel?: number[]; speedKph?: number };
  cars?: LegacyPatternCarJson[];
  lookahead?: {
    activeTouchCarIndex?: number;
    nextTouchCarIndex?: number;
    nextTouchBlend?: number;
    nextTouchBallPos?: number[] | null;
    lateralBias?: number;
    postGoalElapsedSec?: number;
  };
  cameraPose?: {
    eyeUnreal?: number[];
    targetUnreal?: number[];
    distanceToTarget?: number;
    yawDeg?: number;
    pitchDeg?: number;
    rawUndampedEyeUnreal?: number[];
    rawUndampedTargetUnreal?: number[];
    eyeStepUu?: number;
    targetStepUu?: number;
    yawStepDeg?: number;
    pitchStepDeg?: number;
    rawEyeStepUu?: number;
    rawTargetStepUu?: number;
    eyeAccelUu?: number;
    targetAccelUu?: number;
    carViewAngleDeg?: number;
    ballViewAngleDeg?: number;
  };
  incidents?: Array<Record<string, unknown>>;
}

interface LegacyTouchTimelineItemJson {
  replayFrameIndex?: number;
  frameId?: number;
  carIndex?: number;
  team?: number;
  ballPos?: number[];
}

interface LegacyDirectorPatternPayloadJson {
  frames?: LegacyPatternFrameJson[];
  carEntries?: ReplayCarRosterEntry[];
  replayMetadata?: {
    carEntries?: ReplayCarRosterEntry[];
    roster?: ReplayCarRosterEntry[];
    scoringTeam?: number;
    scorerCarIndex?: number;
    goalLineReplayFrameIndex?: number;
    playbackStateAtExport?: { selectedReplayFrameIndex?: number };
    trajectorySmoothnessSummary?: Partial<DirectorSmoothnessSummary>;
    anomalyPeaks?: DirectorAnomalyPeaks | null;
  };
  touchTimeline?: LegacyTouchTimelineItemJson[];
  directorConfig?: Record<string, unknown> | null;
}

export function parseDirectorDiagnosticPatternJson(
  jsonText: string | Record<string, unknown>,
  fileName: string = 'imported-pattern.json'
): ParsedDirectorDiagnosticPattern | null {
  let payload: LegacyDirectorPatternPayloadJson | null = null;
  try {
    payload = (
      typeof jsonText === 'string' ? JSON.parse(jsonText) : jsonText
    ) as LegacyDirectorPatternPayloadJson;
  } catch {
    return null;
  }
  if (!payload || !Array.isArray(payload.frames) || payload.frames.length === 0) return null;

  const meta = payload.replayMetadata || {};
  const scoringTeam = meta.scoringTeam ?? 0;
  const scorerCarIndex = meta.scorerCarIndex ?? 0;
  const goalLineFrameIdx = meta.goalLineReplayFrameIndex ?? -1;

  let maxCars = 1;
  for (const f of payload.frames) {
    if (Array.isArray(f.cars)) {
      for (const car of f.cars) {
        const cIdx = (car?.carIndex ?? 0) + 1;
        if (cIdx > maxCars) maxCars = Math.min(MAX_CARS, cIdx);
      }
    }
  }

  const rawCarEntries: RawReplayCarEntryLike[] =
    Array.isArray(meta.carEntries) && meta.carEntries.length > 0
      ? meta.carEntries
      : Array.isArray(meta.roster) && meta.roster.length > 0
        ? meta.roster
        : Array.isArray(payload.carEntries) && payload.carEntries.length > 0
          ? payload.carEntries
          : Array.isArray(payload.frames[0]?.cars)
            ? payload.frames[0].cars
            : [];
  const carEntries = rawCarEntries.map((entry: RawReplayCarEntryLike, idx: number) => {
    const cIdx = typeof entry?.carIndex === 'number' ? entry.carIndex : idx;
    return normalizeReplayDirectorCarEntry(entry, cIdx, entry?.team ?? cIdx % 2);
  });

  let selectedCursorIndex = meta.playbackStateAtExport?.selectedReplayFrameIndex ?? 0;
  const activeFrames: ReplayActiveFrameEntry[] = [];

  for (let i = 0; i < payload.frames.length; i++) {
    const f = payload.frames[i];
    if (f.isSelectedCursorFrame) selectedCursorIndex = i;
    const tick = Math.round(f.frameId ?? i);
    const snap = initBlankSnapshotBuffer(tick, maxCars);

    const bPos = f.ball?.pos,
      bVel = f.ball?.vel;
    writeBallStateToSnapshot(
      snap,
      bPos?.[0] ?? 0,
      bPos?.[1] ?? 0,
      bPos?.[2] ?? 93,
      bVel?.[0] ?? 0,
      bVel?.[1] ?? 0,
      bVel?.[2] ?? 0
    );
    if (Array.isArray(f.cars)) {
      for (const car of f.cars) {
        const c = car.carIndex ?? 0;
        if (c < 0 || c >= MAX_CARS) continue;
        const basis = orthonormalizeFwdUpBasis(
          car.fwd?.[0] ?? 0,
          car.fwd?.[1] ?? 1,
          car.fwd?.[2] ?? 0,
          car.up?.[0] ?? 0,
          car.up?.[1] ?? 0,
          car.up?.[2] ?? 1
        );
        writeCarStateToSnapshot(
          snap,
          c,
          [car.pos?.[0] ?? 0, car.pos?.[1] ?? 0, car.pos?.[2] ?? 17],
          [car.vel?.[0] ?? 0, car.vel?.[1] ?? 0, car.vel?.[2] ?? 0],
          basis,
          car.boost ?? (car.boostPct ?? 50) / 100,
          Boolean(car.onGround),
          Boolean(car.demoed),
          Boolean(car.isBoosting),
          Boolean(car.supersonic)
        );
      }
    }
    const la = f.lookahead || {},
      cp = f.cameraPose || {};
    const focusCar =
      (Array.isArray(f.cars) &&
        f.cars.find((c: LegacyPatternCarJson) => c.carIndex === la.activeTouchCarIndex)) ||
      f.cars?.[0] ||
      null;

    const recordedCsvRow = {
      frame_id: tick,
      replay_frame_index: i,
      timestamp_sec: f.timestampSec ?? i / REPLAY_TICK_RATE,
      progress: f.progress ?? (payload.frames.length > 1 ? i / (payload.frames.length - 1) : 0),
      is_selected_cursor: f.isSelectedCursorFrame ? 1 : 0,
      slow_mo_factor: f.slowMoFactor ?? 1.0,
      active_touch_car_idx: la.activeTouchCarIndex ?? scorerCarIndex,
      next_touch_car_idx: la.nextTouchCarIndex ?? -1,
      next_touch_blend: la.nextTouchBlend ?? 0,
      lateral_bias: la.lateralBias ?? 1.0,
      cam_eye_x: cp.eyeUnreal?.[0] ?? 0,
      cam_eye_y: cp.eyeUnreal?.[1] ?? 0,
      cam_eye_z: cp.eyeUnreal?.[2] ?? 0,
      cam_target_x: cp.targetUnreal?.[0] ?? 0,
      cam_target_y: cp.targetUnreal?.[1] ?? 0,
      cam_target_z: cp.targetUnreal?.[2] ?? 0,
      cam_dist_to_target: cp.distanceToTarget ?? 0,
      cam_yaw_deg: cp.yawDeg ?? 0,
      cam_pitch_deg: cp.pitchDeg ?? 0,
      raw_eye_x: cp.rawUndampedEyeUnreal?.[0] ?? cp.eyeUnreal?.[0] ?? 0,
      raw_eye_y: cp.rawUndampedEyeUnreal?.[1] ?? cp.eyeUnreal?.[1] ?? 0,
      raw_eye_z: cp.rawUndampedEyeUnreal?.[2] ?? cp.eyeUnreal?.[2] ?? 0,
      raw_target_x: cp.rawUndampedTargetUnreal?.[0] ?? cp.targetUnreal?.[0] ?? 0,
      raw_target_y: cp.rawUndampedTargetUnreal?.[1] ?? cp.targetUnreal?.[1] ?? 0,
      raw_target_z: cp.rawUndampedTargetUnreal?.[2] ?? cp.targetUnreal?.[2] ?? 0,
      ball_x: f.ball?.pos?.[0] ?? 0,
      ball_y: f.ball?.pos?.[1] ?? 0,
      ball_z: f.ball?.pos?.[2] ?? 93,
      ball_vx: f.ball?.vel?.[0] ?? 0,
      ball_vy: f.ball?.vel?.[1] ?? 0,
      ball_vz: f.ball?.vel?.[2] ?? 0,
      ball_speed_kph: f.ball?.speedKph ?? 0,
      focus_car_x: focusCar?.pos?.[0] ?? 0,
      focus_car_y: focusCar?.pos?.[1] ?? 0,
      focus_car_z: focusCar?.pos?.[2] ?? 17,
      focus_car_vx: focusCar?.vel?.[0] ?? 0,
      focus_car_vy: focusCar?.vel?.[1] ?? 0,
      focus_car_vz: focusCar?.vel?.[2] ?? 0,
      focus_car_dist_to_ball: focusCar?.distToBall ?? 0,
      eye_step_uu: cp.eyeStepUu ?? 0,
      target_step_uu: cp.targetStepUu ?? 0,
      yaw_step_deg: cp.yawStepDeg ?? 0,
      pitch_step_deg: cp.pitchStepDeg ?? 0,
      raw_eye_step_uu: cp.rawEyeStepUu ?? 0,
      raw_target_step_uu: cp.rawTargetStepUu ?? 0,
      eye_accel_uu: cp.eyeAccelUu ?? 0,
      target_accel_uu: cp.targetAccelUu ?? 0,
      car_view_angle_deg: cp.carViewAngleDeg ?? 0,
      ball_view_angle_deg: cp.ballViewAngleDeg ?? 0,
      focus_car_fx: focusCar?.fwd?.[0] ?? 0,
      focus_car_fy: focusCar?.fwd?.[1] ?? 1,
      focus_car_fz: focusCar?.fwd?.[2] ?? 0,
      focus_car_ux: focusCar?.up?.[0] ?? 0,
      focus_car_uy: focusCar?.up?.[1] ?? 0,
      focus_car_uz: focusCar?.up?.[2] ?? 1,
      focus_car_visual_id: focusCar?.visualId || 'octane',
      focus_car_hitbox_id: focusCar?.hitboxId || focusCar?.visualId || 'octane',
    };

    encodeReplayDirectorTelemetryIntoState(snap, {
      progress: recordedCsvRow.progress,
      activeTouchCarIndex: recordedCsvRow.active_touch_car_idx,
      nextTouchCarIndex: recordedCsvRow.next_touch_car_idx,
      nextTouchBlend: recordedCsvRow.next_touch_blend,
      nextTouchBallPos: Array.isArray(la.nextTouchBallPos)
        ? { x: la.nextTouchBallPos[0], y: la.nextTouchBallPos[1], z: la.nextTouchBallPos[2] }
        : null,
      lateralBias: recordedCsvRow.lateral_bias,
      scorerCarIndex,
      postGoalElapsedSec: la.postGoalElapsedSec ?? 0,
    });

    activeFrames.push({
      tick,
      timestamp: f.timestampSec ?? i / REPLAY_TICK_RATE,
      snapshot: snap,
      incidents: Array.isArray(f.incidents) ? f.incidents : [],
      signals: [],
      recordedCsvRow,
    });
  }

  const touchEvents: ReplayTouchEvent[] = Array.isArray(payload.touchTimeline)
    ? payload.touchTimeline.map((t: LegacyTouchTimelineItemJson) => ({
        frameIndex: t.replayFrameIndex ?? 0,
        tick: t.frameId ?? 0,
        carIndex: t.carIndex ?? 0,
        team: t.team ?? 0,
        ballX: t.ballPos?.[0] ?? 0,
        ballY: t.ballPos?.[1] ?? 0,
        ballZ: t.ballPos?.[2] ?? 0,
      }))
    : [];

  const smooth = meta.trajectorySmoothnessSummary || {};
  return {
    format: 'json',
    fileName,
    activeFrames,
    scoringTeam,
    scorerCarIndex,
    selectedCursorIndex,
    lateralBias: payload.frames[0]?.lookahead?.lateralBias || 1.0,
    touchEvents,
    goalLineFrameIdx,
    hasRecordedCsvRows: true,
    directorConfig: payload.directorConfig || null,
    carEntries,
    anomalyPeaks: meta.anomalyPeaks || null,
    summary: {
      totalFrames: activeFrames.length,
      durationSec: round3(activeFrames.length / REPLAY_TICK_RATE),
      startFrameId: activeFrames[0]?.tick ?? 0,
      endFrameId: activeFrames[activeFrames.length - 1]?.tick ?? 0,
      maxEyeStepUu: smooth.maxEyeStepUu ?? 0,
      maxTargetStepUu: smooth.maxTargetStepUu ?? 0,
      maxYawStepDeg: smooth.maxYawStepDeg ?? 0,
      maxEyeAccelUu: smooth.maxEyeAccelUu ?? 0,
      maxPreGoalCarViewAngleDeg: smooth.maxPreGoalCarViewAngleDeg ?? 0,
      maxPreGoalBallViewAngleDeg: smooth.maxPreGoalBallViewAngleDeg ?? 0,
    },
  };
}
