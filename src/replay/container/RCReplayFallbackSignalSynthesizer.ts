/**
 * RCReplayFallbackSignalSynthesizer.ts
 * Synthesizes fallback Track C signals from Track B GOAL_SCORED incidents and matchInfo
 * when a replay container was recorded with 0 explicit Track C signals (e.g. legacy exp-multi-bots replays).
 */

import {
  SIM_OFFSETS,
  CAR_STATE_STRIDE,
  CAR_STATE_OFFSETS,
  INCIDENT_EVENT_TYPES,
  FLIP_RESET_OBJECT_TYPES,
  FLIP_RESET_SUBTYPES,
  FLIP_RESET_SUBTYPE_LABELS,
  MATCH_SIGNALS,
} from '../../physics/RocketSimConstants.ts';
import type {
  DecodedIncidentEvent,
  DecodedSignalEvent,
  ReplaySnapshotFloat32Array,
} from './RCReplayBinarySchema.ts';

function classifyLegacyFlipResetWorldSubType(
  x: number,
  y: number,
  z: number,
  nx: number,
  ny: number,
  nz: number
): number {
  const absX = Math.abs(x);
  const absY = Math.abs(y);
  const absNx = Math.abs(nx);
  const absNy = Math.abs(ny);
  if (absY >= 5040 && absX <= 960 && z <= 720) {
    if (Math.abs(z - 642) < 100 && absX <= 920) return FLIP_RESET_SUBTYPES.CROSSBAR;
    if (absX >= 800 || absY > 5120) return FLIP_RESET_SUBTYPES.GOALPOST;
  }
  if (nz <= -0.85 || (z >= 1950 && nz <= -0.5)) return FLIP_RESET_SUBTYPES.CEILING;
  if (nz >= 0.85) return FLIP_RESET_SUBTYPES.FLOOR;
  if (nz < -0.15) return FLIP_RESET_SUBTYPES.RAMP_CEILING;
  if (nz > 0.15) return FLIP_RESET_SUBTYPES.RAMP_GROUND;
  if (absNx >= 0.35 && absNy >= 0.35) return FLIP_RESET_SUBTYPES.CORNER_45;
  if (absNy >= absNx) return FLIP_RESET_SUBTYPES.BACKBOARD;
  return FLIP_RESET_SUBTYPES.SIDE_WALL;
}

export function enrichLegacyFlipResetIncidentFromFrames(
  inc: DecodedIncidentEvent,
  frames: ReplaySnapshotFloat32Array[]
): void {
  if (!inc || inc.type !== INCIDENT_EVENT_TYPES.FLIP_RESET_GAINED) return;
  const flagObj = (Number(inc.flags ?? 0) >>> 4) & 0xf;
  if (flagObj !== 0) return;

  const fIdx = Math.max(0, Math.min(frames.length - 1, inc.frameIndex ?? 0));
  const prevSnap = frames[Math.max(0, fIdx - 1)] || frames[fIdx];
  const carIdx = Math.max(0, Math.min(7, Number(inc.carIndex ?? inc.primaryId ?? 0)));
  const carBase = SIM_OFFSETS.CARS + carIdx * CAR_STATE_STRIDE;

  const cx = prevSnap ? prevSnap[carBase + 0] : Number(inc.carPosX ?? inc.x ?? 0);
  const cy = prevSnap ? prevSnap[carBase + 1] : Number(inc.carPosY ?? inc.y ?? 0);
  const cz = prevSnap ? prevSnap[carBase + 2] : Number(inc.carPosZ ?? inc.z ?? 0);
  const upX = prevSnap ? prevSnap[carBase + CAR_STATE_OFFSETS.UP + 0] : 0;
  const upY = prevSnap ? prevSnap[carBase + CAR_STATE_OFFSETS.UP + 1] : 0;
  const upZ = prevSnap ? prevSnap[carBase + CAR_STATE_OFFSETS.UP + 2] : 1;
  let gnx = prevSnap ? prevSnap[carBase + CAR_STATE_OFFSETS.GROUND_NORMAL + 0] : 0;
  let gny = prevSnap ? prevSnap[carBase + CAR_STATE_OFFSETS.GROUND_NORMAL + 1] : 0;
  let gnz = prevSnap ? prevSnap[carBase + CAR_STATE_OFFSETS.GROUND_NORMAL + 2] : 0;
  if (gnx * gnx + gny * gny + gnz * gnz < 0.1) {
    gnx = upX;
    gny = upY;
    gnz = upZ;
  }

  const bx = prevSnap ? prevSnap[SIM_OFFSETS.BALL + 0] : Number(inc.ballPosX ?? inc.normalX ?? 0);
  const by = prevSnap ? prevSnap[SIM_OFFSETS.BALL + 1] : Number(inc.ballPosY ?? inc.normalY ?? 0);
  const bz = prevSnap ? prevSnap[SIM_OFFSETS.BALL + 2] : Number(inc.ballPosZ ?? inc.normalZ ?? 0);

  const dx = cx - bx;
  const dy = cy - by;
  const dz = cz - bz;
  const distToBall = Math.hypot(dx, dy, dz);
  const invDist = distToBall > 1e-4 ? 1.0 / distToBall : 0;
  const ballToCarDotUp = dx * invDist * upX + dy * invDist * upY + dz * invDist * upZ;

  const isNearWorldBoundary =
    Math.abs(cy) >= 4980 || Math.abs(cx) >= 3960 || cz <= 65 || cz >= 1960;

  const isBallReset = distToBall <= 170.0 && ballToCarDotUp >= 0.45 && !isNearWorldBoundary;
  if (isBallReset) {
    Object.assign(inc, {
      subType: FLIP_RESET_SUBTYPES.BALL,
      resetSubType: FLIP_RESET_SUBTYPES.BALL,
      resetSubTypeName: FLIP_RESET_SUBTYPE_LABELS[FLIP_RESET_SUBTYPES.BALL],
      resetObjectCode: FLIP_RESET_OBJECT_TYPES.BALL,
      resetObjectType: 'ball',
      isBallFlipReset: true,
    });
  } else {
    const worldSub = classifyLegacyFlipResetWorldSubType(cx, cy, cz, gnx, gny, gnz);
    Object.assign(inc, {
      subType: worldSub,
      resetSubType: worldSub,
      resetSubTypeName:
        (FLIP_RESET_SUBTYPE_LABELS as Record<number, string>)[worldSub] || 'other_world',
      resetObjectCode: FLIP_RESET_OBJECT_TYPES.WORLD,
      resetObjectType: 'world',
      isBallFlipReset: false,
    });
  }
}

export interface FallbackSignalFrameSlotLike {
  tick?: number;
  snapshot?: Float32Array | null;
}

export interface FallbackSignalMatchInfo {
  durationSeconds?: number;
  mode?: string;
  winner?: string;
  winReason?: number;
  [key: string]: unknown;
}

export function synthesizeFallbackSignalsFromIncidents(
  incidents: Array<Partial<DecodedIncidentEvent> | null | undefined>,
  frameSlots: FallbackSignalFrameSlotLike[],
  matchInfo: FallbackSignalMatchInfo = {}
): DecodedSignalEvent[] {
  const frameCount = Array.isArray(frameSlots) ? frameSlots.length : 0;
  if (frameCount <= 0) return [];

  const synthesized: DecodedSignalEvent[] = [];
  let nextSignalId = 1;
  const durationSeconds =
    typeof matchInfo.durationSeconds === 'number' && matchInfo.durationSeconds >= 0
      ? matchInfo.durationSeconds
      : 300;

  // 1. Match Start signal at frame 0
  synthesized.push({
    signalId: nextSignalId++,
    signalType: MATCH_SIGNALS.MATCH_STARTED,
    type: MATCH_SIGNALS.MATCH_STARTED,
    frameId: frameSlots[0]?.tick ?? 0,
    tick: frameSlots[0]?.tick ?? 0,
    param1: durationSeconds,
    param2: 0,
    frameIndex: 0,
    synthesized: true,
  });

  // Detect initial kickoff GO (either frame 360 if ball is stationary for first 3s, or frame 0)
  let initialKickoffGoFrame = 0;
  if (frameCount > 360) {
    const snap0 = frameSlots[0]?.snapshot;
    const snap350 = frameSlots[350]?.snapshot;
    if (
      snap0 &&
      snap350 &&
      Math.hypot(snap0[4], snap0[5]) < 5 &&
      Math.hypot(snap350[4], snap350[5]) < 5 &&
      Math.hypot(snap350[22 + 12], snap350[22 + 13]) < 10
    ) {
      synthesized.push({
        signalId: nextSignalId++,
        signalType: MATCH_SIGNALS.KICKOFF_WILL_START,
        type: MATCH_SIGNALS.KICKOFF_WILL_START,
        frameId: frameSlots[0]?.tick ?? 0,
        tick: frameSlots[0]?.tick ?? 0,
        param1: 360,
        param2: 3,
        frameIndex: 0,
        synthesized: true,
      });
      initialKickoffGoFrame = 360;
    }
  }
  synthesized.push({
    signalId: nextSignalId++,
    signalType: MATCH_SIGNALS.KICKOFF_START,
    type: MATCH_SIGNALS.KICKOFF_START,
    frameId: frameSlots[initialKickoffGoFrame]?.tick ?? initialKickoffGoFrame,
    tick: frameSlots[initialKickoffGoFrame]?.tick ?? initialKickoffGoFrame,
    param1: 0,
    param2: 0,
    frameIndex: initialKickoffGoFrame,
    synthesized: true,
  });

  // 2. Scan Track B for GOAL_SCORED incidents (deduplicated per goal celebration window)
  let runningBlue = 0;
  let runningOrange = 0;
  let lastGoalFrame = -240;

  for (let i = 0; i < incidents.length; i++) {
    const inc = incidents[i];
    if (!inc || inc.type !== INCIDENT_EVENT_TYPES.GOAL_SCORED) continue;
    const fIdx = Math.max(0, Math.min(frameCount - 1, inc.frameIndex ?? 0));
    if (fIdx - lastGoalFrame < 60) continue; // Deduplicate dual WASM + mode GOAL_SCORED on same frame
    lastGoalFrame = fIdx;

    const scoringTeam = inc.team === 1 || (inc.y ?? inc.posY ?? 0) < 0 ? 1 : 0;
    if (scoringTeam === 0) runningBlue++;
    else runningOrange++;

    synthesized.push({
      signalId: nextSignalId++,
      signalType: MATCH_SIGNALS.SCORE_UPDATED,
      type: MATCH_SIGNALS.SCORE_UPDATED,
      frameId: inc.tick ?? frameSlots[fIdx]?.tick ?? fIdx,
      tick: inc.tick ?? frameSlots[fIdx]?.tick ?? fIdx,
      param1: runningBlue,
      param2: runningOrange,
      frameIndex: fIdx,
      synthesized: true,
    });

    // Scan forward after goal celebration for next kickoff reset (ball returns to center (0,0))
    for (let k = fIdx + 30; k < frameCount; k++) {
      const snap = frameSlots[k]?.snapshot;
      if (snap && Math.hypot(snap[4], snap[5]) < 5.0 && Math.hypot(snap[16], snap[17]) < 5.0) {
        synthesized.push({
          signalId: nextSignalId++,
          signalType: MATCH_SIGNALS.KICKOFF_WILL_START,
          type: MATCH_SIGNALS.KICKOFF_WILL_START,
          frameId: frameSlots[k]?.tick ?? k,
          tick: frameSlots[k]?.tick ?? k,
          param1: 360,
          param2: 3,
          frameIndex: k,
          synthesized: true,
        });
        const goIdx = Math.min(frameCount - 1, k + 360);
        synthesized.push({
          signalId: nextSignalId++,
          signalType: MATCH_SIGNALS.KICKOFF_START,
          type: MATCH_SIGNALS.KICKOFF_START,
          frameId: frameSlots[goIdx]?.tick ?? goIdx,
          tick: frameSlots[goIdx]?.tick ?? goIdx,
          param1: 0,
          param2: 0,
          frameIndex: goIdx,
          synthesized: true,
        });
        break;
      }
    }
  }

  // 3. Match End signal at final frame if matchInfo has a score or non-freeplay mode
  if (frameCount > 1 && matchInfo.mode !== 'freeplay' && matchInfo.mode !== 'training') {
    const lastIdx = frameCount - 1;
    const winnerCode = matchInfo.winner === 'blue' ? 0 : matchInfo.winner === 'orange' ? 1 : 2;
    synthesized.push({
      signalId: nextSignalId++,
      signalType: MATCH_SIGNALS.MATCH_ENDED,
      type: MATCH_SIGNALS.MATCH_ENDED,
      frameId: frameSlots[lastIdx]?.tick ?? lastIdx,
      tick: frameSlots[lastIdx]?.tick ?? lastIdx,
      param1: winnerCode,
      param2: matchInfo.winReason ?? 0,
      frameIndex: lastIdx,
      synthesized: true,
    });
  }

  return synthesized;
}
