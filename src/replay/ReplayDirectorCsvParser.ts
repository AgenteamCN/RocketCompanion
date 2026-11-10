/**
 * ReplayDirectorCsvParser.ts
 * Pure data pipeline that parses an exported Director Diagnostic Pattern CSV string
 * into replay frames, camera telemetry rows, and trajectory smoothness summary.
 */

import { REPLAY_TICK_RATE } from './ReplayRingBuffer.ts';
import { MAX_CARS, INCIDENT_EVENT_TYPES } from '../physics/RocketSimConstants.ts';
import { encodeReplayDirectorTelemetryIntoState } from './ReplayFrameInterpolator.ts';
import { round3, round4 } from './ReplayDirectorSceneAnalysis.ts';
import type { ReplayTouchEvent } from './ReplayDirectorGazeSolver.ts';
import {
  initBlankSnapshotBuffer,
  orthonormalizeFwdUpBasis,
  writeBallStateToSnapshot,
  writeCarStateToSnapshot,
  type OrthonormalBasis,
  type ParsedDirectorDiagnosticPattern,
} from './ReplayDirectorLegacyFormatParser.ts';
import { normalizeReplayDirectorCarEntry } from './replayDirectorCarRosterPipeline.ts';
import type {
  DirectorRecordedCsvRow,
  ReplayActiveFrameEntry,
  ReplayIncidentEntry,
} from './replayDirectorStateTypes.ts';

interface CarTrackPoint {
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  fx?: number;
  fy?: number;
  fz?: number;
  ux?: number;
  uy?: number;
  uz?: number;
  boost?: number;
  onGround?: boolean;
  visualId?: string;
  hitboxId?: string;
  team?: number;
}

type ParsedCsvRow = DirectorRecordedCsvRow & Record<string, number | string | undefined>;

function buildOrthonormalBasisFromVelocity(
  vx: number,
  vy: number,
  vz: number,
  fallbackDirX: number = 0,
  fallbackDirY: number = 1
): OrthonormalBasis {
  const speed = Math.hypot(vx, vy, vz);
  let fx = fallbackDirX,
    fy = fallbackDirY,
    fz = 0;
  if (speed > 25) {
    fx = vx / speed;
    fy = vy / speed;
    fz = vz / speed;
  } else {
    const fl = Math.hypot(fx, fy);
    if (fl > 1e-4) {
      fx /= fl;
      fy /= fl;
    } else {
      fx = 0;
      fy = 1;
    }
  }
  let rx = -fy,
    ry = fx;
  const rz = 0;
  const rl = Math.hypot(rx, ry, rz);
  if (rl > 1e-4) {
    rx /= rl;
    ry /= rl;
  } else {
    rx = -1;
    ry = 0;
  }
  const ux = fy * rz - fz * ry;
  const uy = fz * rx - fx * rz;
  const uz = fx * ry - fy * rx;
  return { fx, fy, fz, rx, ry, rz, ux, uy, uz };
}

const STRING_CSV_HEADERS = new Set([
  'focus_car_visual_id',
  'focus_car_hitbox_id',
  'cars_pose_compact',
]);

export function parseDirectorDiagnosticPatternCsv(
  csvText: string,
  fileName: string = 'imported-pattern.csv'
): ParsedDirectorDiagnosticPattern | null {
  if (typeof csvText !== 'string' || !csvText.trim()) return null;
  const rawLines = csvText
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0);
  if (rawLines.length < 2) return null;

  const headers = rawLines[0].split(',').map((h) => h.trim());
  if (!headers.includes('ball_x') || !headers.includes('cam_eye_x')) return null;
  const hasFocusOrientation = headers.includes('focus_car_fx') && headers.includes('focus_car_ux');

  const rows: ParsedCsvRow[] = [];
  for (let i = 1; i < rawLines.length; i++) {
    const parts = rawLines[i].split(',');
    if (parts.length < 15) continue;
    const row: ParsedCsvRow = {};
    for (let c = 0; c < headers.length; c++) {
      const h = headers[c];
      const rawCell = (parts[c] ?? '').trim();
      if (STRING_CSV_HEADERS.has(h)) {
        row[h] = rawCell;
      } else {
        const val = Number(rawCell);
        row[h] = Number.isFinite(val) ? val : 0;
      }
    }
    rows.push(row);
  }
  if (rows.length === 0) return null;

  let maxCarIdx = 0;
  for (const r of rows) {
    const a = Math.max(0, Math.round(r.active_touch_car_idx ?? 0));
    const n = Math.round(r.next_touch_car_idx ?? -1);
    if (a > maxCarIdx) maxCarIdx = a;
    if (n > maxCarIdx) maxCarIdx = n;
    if (typeof r.cars_pose_compact === 'string' && r.cars_pose_compact.length > 0) {
      for (const seg of r.cars_pose_compact.split(';')) {
        const cIdx = Number(seg.split(':')[0]);
        if (Number.isFinite(cIdx) && cIdx > maxCarIdx) {
          maxCarIdx = Math.min(MAX_CARS - 1, Math.round(cIdx));
        }
      }
    }
  }
  const numCars = Math.min(MAX_CARS, Math.max(1, maxCarIdx + 1));

  const carMetaBySlot = new Map<number, { team?: number; visualId?: string; hitboxId?: string }>();
  const carTracks: (CarTrackPoint | null)[][] = Array.from({ length: numCars }, () =>
    new Array<CarTrackPoint | null>(rows.length).fill(null)
  );

  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    let populatedFromCompact = false;
    if (typeof r.cars_pose_compact === 'string' && r.cars_pose_compact.length > 0) {
      for (const seg of r.cars_pose_compact.split(';')) {
        if (!seg) continue;
        const fields = seg.split(':');
        if (fields.length < 16) continue;
        const cIdx = Math.min(numCars - 1, Math.max(0, Math.round(Number(fields[0]) || 0)));
        const team = Number(fields[1]);
        const vis = fields[2] || 'octane';
        const hb = fields[3] || vis || 'octane';
        const resolvedTeam = Number.isFinite(team) ? team : cIdx % 2;
        carMetaBySlot.set(cIdx, { team: resolvedTeam, visualId: vis, hitboxId: hb });
        carTracks[cIdx][i] = {
          x: Number(fields[4]) || 0,
          y: Number(fields[5]) || 0,
          z: Number(fields[6]) || 17,
          vx: Number(fields[7]) || 0,
          vy: Number(fields[8]) || 0,
          vz: Number(fields[9]) || 0,
          fx: Number(fields[10]) || 0,
          fy: Number(fields[11]) || 1,
          fz: Number(fields[12]) || 0,
          ux: Number(fields[13]) || 0,
          uy: Number(fields[14]) || 0,
          uz: Number(fields[15]) || 1,
          boost: fields.length > 16 ? (Number(fields[16]) || 50) / 100 : 0.5,
          onGround: fields.length > 17 ? Number(fields[17]) > 0.5 : (Number(fields[6]) || 17) <= 24,
          visualId: vis,
          hitboxId: hb,
          team: resolvedTeam,
        };
        populatedFromCompact = true;
      }
    }
    if (!populatedFromCompact) {
      const cIdx = Math.min(numCars - 1, Math.max(0, Math.round(r.active_touch_car_idx ?? 0)));
      const vis =
        typeof r.focus_car_visual_id === 'string' && r.focus_car_visual_id
          ? r.focus_car_visual_id
          : undefined;
      const hb =
        typeof r.focus_car_hitbox_id === 'string' && r.focus_car_hitbox_id
          ? r.focus_car_hitbox_id
          : vis;
      if (vis && !carMetaBySlot.has(cIdx)) {
        carMetaBySlot.set(cIdx, { team: cIdx % 2, visualId: vis, hitboxId: hb || vis });
      }
      carTracks[cIdx][i] = {
        x: r.focus_car_x ?? 0,
        y: r.focus_car_y ?? 0,
        z: r.focus_car_z ?? 17,
        vx: r.focus_car_vx ?? 0,
        vy: r.focus_car_vy ?? 0,
        vz: r.focus_car_vz ?? 0,
        ...(hasFocusOrientation
          ? {
              fx: r.focus_car_fx ?? 0,
              fy: r.focus_car_fy ?? 1,
              fz: r.focus_car_fz ?? 0,
              ux: r.focus_car_ux ?? 0,
              uy: r.focus_car_uy ?? 0,
              uz: r.focus_car_uz ?? 1,
            }
          : {}),
      };
    }
  }

  for (let c = 0; c < numCars; c++) {
    const track = carTracks[c];
    let firstValid = -1,
      lastValid = -1;
    for (let i = 0; i < track.length; i++) {
      if (track[i]) {
        if (firstValid < 0) firstValid = i;
        lastValid = i;
      }
    }
    if (firstValid < 0) continue;
    const firstPt = track[firstValid]!,
      lastPt = track[lastValid]!;
    for (let i = 0; i < firstValid; i++) track[i] = { ...firstPt };
    for (let i = lastValid + 1; i < track.length; i++) track[i] = { ...lastPt };
    let segStart = firstValid;
    for (let i = firstValid + 1; i <= lastValid; i++) {
      if (track[i]) {
        if (i - segStart > 1) {
          const a = track[segStart]!,
            b = track[i]!,
            span = i - segStart;
          for (let k = segStart + 1; k < i; k++) {
            const t = (k - segStart) / span;
            track[k] = {
              ...a,
              x: a.x + (b.x - a.x) * t,
              y: a.y + (b.y - a.y) * t,
              z: a.z + (b.z - a.z) * t,
              vx: a.vx + (b.vx - a.vx) * t,
              vy: a.vy + (b.vy - a.vy) * t,
              vz: a.vz + (b.vz - a.vz) * t,
              ...(typeof a.fx === 'number' && typeof b.fx === 'number'
                ? {
                    fx: a.fx + (b.fx - a.fx) * t,
                    fy: (a.fy ?? 1) + ((b.fy ?? 1) - (a.fy ?? 1)) * t,
                    fz: (a.fz ?? 0) + ((b.fz ?? 0) - (a.fz ?? 0)) * t,
                    ux: (a.ux ?? 0) + ((b.ux ?? 0) - (a.ux ?? 0)) * t,
                    uy: (a.uy ?? 0) + ((b.uy ?? 0) - (a.uy ?? 0)) * t,
                    uz: (a.uz ?? 1) + ((b.uz ?? 1) - (a.uz ?? 1)) * t,
                  }
                : {}),
            };
          }
        }
        segStart = i;
      }
    }
  }

  const lastRow = rows[rows.length - 1];
  const scoringTeam = (lastRow.ball_y ?? 0) >= 0 ? 0 : 1;

  let goalLineFrameIdx = -1;
  for (let i = 0; i < rows.length; i++) {
    if (Math.abs(rows[i].ball_y ?? 0) >= 5120) {
      goalLineFrameIdx = i;
      break;
    }
  }
  const scorerLookupIdx = goalLineFrameIdx >= 0 ? goalLineFrameIdx : rows.length - 1;
  const scorerCarIndex = Math.max(
    0,
    Math.round(rows[scorerLookupIdx]?.active_touch_car_idx ?? lastRow.active_touch_car_idx ?? 0)
  );

  const touchEvents: ReplayTouchEvent[] = [];
  for (let i = 1; i < rows.length; i++) {
    const prev = rows[i - 1],
      curr = rows[i];
    const dv = Math.hypot(
      (curr.ball_vx ?? 0) - (prev.ball_vx ?? 0),
      (curr.ball_vy ?? 0) - (prev.ball_vy ?? 0),
      (curr.ball_vz ?? 0) - (prev.ball_vz ?? 0)
    );
    const isCloseImpulse = (curr.focus_car_dist_to_ball ?? 9999) < 330 && dv > 120;
    const isSwitch =
      Math.round(curr.active_touch_car_idx ?? 0) !== Math.round(prev.active_touch_car_idx ?? 0);
    if (isCloseImpulse || isSwitch) {
      const cIdx = Math.max(0, Math.round(curr.active_touch_car_idx ?? 0));
      const prevTouch = touchEvents[touchEvents.length - 1];
      if (!prevTouch || prevTouch.carIndex !== cIdx || i - prevTouch.frameIndex > 8) {
        touchEvents.push({
          frameIndex: i,
          tick: Math.round(curr.frame_id ?? i),
          carIndex: cIdx,
          team: cIdx % 2,
          ballX: curr.ball_x ?? 0,
          ballY: curr.ball_y ?? 0,
          ballZ: curr.ball_z ?? 0,
        });
      }
    }
  }

  let selectedCursorIndex = 0;
  let maxEyeStepUu = 0,
    maxTargetStepUu = 0,
    maxYawStepDeg = 0,
    maxEyeAccelUu = 0;
  let maxPreGoalCarViewAngleDeg = 0,
    maxPreGoalBallViewAngleDeg = 0;

  const firstFrameId = Math.round(rows[0]?.frame_id ?? 0);
  const peakZero = () => ({ replayFrameIndex: 0, frameId: firstFrameId, timestampSec: 0 });
  const anomalyPeaks = {
    maxEyeStep: { valueUu: 0, ...peakZero() },
    maxYawStep: { valueDeg: 0, ...peakZero() },
    maxEyeAccel: { valueUu: 0, ...peakZero() },
    maxPreGoalCarViewAngle: { valueDeg: 0, ...peakZero() },
    maxPreGoalBallViewAngle: { valueDeg: 0, ...peakZero() },
  };

  const activeFrames: ReplayActiveFrameEntry[] = [];
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    const tick = Math.round(r.frame_id ?? i);
    const ts = round3(i / REPLAY_TICK_RATE);
    if (Math.round(r.is_selected_cursor ?? 0) === 1) selectedCursorIndex = i;

    const eyeStep = r.eye_step_uu ?? 0,
      targetStep = r.target_step_uu ?? 0;
    const absYawStep = Math.abs(r.yaw_step_deg ?? 0),
      eyeAccel = r.eye_accel_uu ?? 0;
    const carViewAngle = r.car_view_angle_deg ?? 0,
      ballViewAngle = r.ball_view_angle_deg ?? 0;

    if (eyeStep > maxEyeStepUu) {
      maxEyeStepUu = eyeStep;
      anomalyPeaks.maxEyeStep = {
        valueUu: round3(maxEyeStepUu),
        replayFrameIndex: i,
        frameId: tick,
        timestampSec: ts,
      };
    }
    if (targetStep > maxTargetStepUu) maxTargetStepUu = targetStep;
    if (absYawStep > maxYawStepDeg) {
      maxYawStepDeg = absYawStep;
      anomalyPeaks.maxYawStep = {
        valueDeg: round4(maxYawStepDeg),
        replayFrameIndex: i,
        frameId: tick,
        timestampSec: ts,
      };
    }
    if (eyeAccel > maxEyeAccelUu) {
      maxEyeAccelUu = eyeAccel;
      anomalyPeaks.maxEyeAccel = {
        valueUu: round3(maxEyeAccelUu),
        replayFrameIndex: i,
        frameId: tick,
        timestampSec: ts,
      };
    }
    if (goalLineFrameIdx < 0 || i <= goalLineFrameIdx) {
      if (carViewAngle > maxPreGoalCarViewAngleDeg) {
        maxPreGoalCarViewAngleDeg = carViewAngle;
        anomalyPeaks.maxPreGoalCarViewAngle = {
          valueDeg: round3(maxPreGoalCarViewAngleDeg),
          replayFrameIndex: i,
          frameId: tick,
          timestampSec: ts,
        };
      }
      if (ballViewAngle > maxPreGoalBallViewAngleDeg) {
        maxPreGoalBallViewAngleDeg = ballViewAngle;
        anomalyPeaks.maxPreGoalBallViewAngle = {
          valueDeg: round3(maxPreGoalBallViewAngleDeg),
          replayFrameIndex: i,
          frameId: tick,
          timestampSec: ts,
        };
      }
    }

    const snap = initBlankSnapshotBuffer(tick, numCars);
    writeBallStateToSnapshot(
      snap,
      r.ball_x ?? 0,
      r.ball_y ?? 0,
      r.ball_z ?? 93,
      r.ball_vx ?? 0,
      r.ball_vy ?? 0,
      r.ball_vz ?? 0
    );

    for (let c = 0; c < numCars; c++) {
      const ct = carTracks[c][i];
      if (!ct) continue;
      const toBallX = (r.ball_x ?? 0) - ct.x,
        toBallY = (r.ball_y ?? 0) - ct.y;
      const basis =
        typeof ct.fx === 'number' && typeof ct.ux === 'number'
          ? orthonormalizeFwdUpBasis(ct.fx, ct.fy ?? 1, ct.fz ?? 0, ct.ux, ct.uy ?? 0, ct.uz ?? 1)
          : buildOrthonormalBasisFromVelocity(ct.vx, ct.vy, ct.vz, toBallX, toBallY);
      const speed = Math.hypot(ct.vx, ct.vy, ct.vz);
      writeCarStateToSnapshot(
        snap,
        c,
        [ct.x, ct.y, ct.z],
        [ct.vx, ct.vy, ct.vz],
        basis,
        typeof ct.boost === 'number' ? ct.boost : 0.5,
        typeof ct.onGround === 'boolean' ? ct.onGround : ct.z <= 24,
        false,
        speed > 1400,
        speed > 2200
      );
    }

    const postGoalElapsedSec =
      goalLineFrameIdx >= 0 && i > goalLineFrameIdx ? (i - goalLineFrameIdx) / REPLAY_TICK_RATE : 0;

    encodeReplayDirectorTelemetryIntoState(snap, {
      progress: r.progress ?? (rows.length > 1 ? i / (rows.length - 1) : 0),
      activeTouchCarIndex: Math.round(r.active_touch_car_idx ?? scorerCarIndex),
      nextTouchCarIndex: Math.round(r.next_touch_car_idx ?? -1),
      nextTouchBlend: r.next_touch_blend ?? 0,
      nextTouchBallPos: null,
      lateralBias: r.lateral_bias || 1.0,
      scorerCarIndex,
      postGoalElapsedSec,
    });

    const incidents: ReplayIncidentEntry[] = [];
    if (i === goalLineFrameIdx) {
      incidents.push({
        type: INCIDENT_EVENT_TYPES.GOAL_SCORED,
        team: scoringTeam,
        carIndex: scorerCarIndex,
      });
    }

    activeFrames.push({
      tick,
      timestamp: i / REPLAY_TICK_RATE,
      snapshot: snap,
      incidents,
      signals: [],
      recordedCsvRow: r,
    });
  }

  const carEntries = Array.from({ length: numCars }, (_, cIdx) => {
    const meta = carMetaBySlot.get(cIdx);
    const defaultTeam = cIdx === scorerCarIndex ? scoringTeam : cIdx % 2;
    return normalizeReplayDirectorCarEntry(
      {
        carIndex: cIdx,
        team: meta?.team ?? defaultTeam,
        visualId: meta?.visualId || 'octane',
        hitboxId: meta?.hitboxId || meta?.visualId || 'octane',
      },
      cIdx,
      defaultTeam
    );
  });

  return {
    format: 'csv',
    fileName,
    activeFrames,
    scoringTeam,
    scorerCarIndex,
    selectedCursorIndex,
    lateralBias: rows[0]?.lateral_bias || 1.0,
    touchEvents,
    goalLineFrameIdx,
    hasRecordedCsvRows: true,
    carEntries,
    anomalyPeaks,
    summary: {
      totalFrames: activeFrames.length,
      durationSec: round3(activeFrames.length / REPLAY_TICK_RATE),
      startFrameId: activeFrames[0]?.tick ?? 0,
      endFrameId: activeFrames[activeFrames.length - 1]?.tick ?? 0,
      maxEyeStepUu: round3(maxEyeStepUu),
      maxTargetStepUu: round3(maxTargetStepUu),
      maxYawStepDeg: round4(maxYawStepDeg),
      maxEyeAccelUu: round3(maxEyeAccelUu),
      maxPreGoalCarViewAngleDeg: round3(maxPreGoalCarViewAngleDeg),
      maxPreGoalBallViewAngleDeg: round3(maxPreGoalBallViewAngleDeg),
    },
  };
}
