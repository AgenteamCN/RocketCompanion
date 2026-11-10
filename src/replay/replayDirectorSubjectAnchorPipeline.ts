/**
 * replayDirectorSubjectAnchorPipeline.ts
 * Pure pipeline for subject trajectory smoothing and per-frame director subject anchors.
 */

import {
  SIM_OFFSETS,
  BALL_STATE_STRIDE,
  CAR_STATE_STRIDE,
  MAX_CARS,
} from '../physics/RocketSimConstants.ts';
import { REPLAY_DIRECTOR_CONFIG } from '../ui-core/config/replayDirectorConfig.ts';
import {
  resolveGoalExplosionFrameIndex,
  type ReplayTouchEvent,
  type GoalExplosionFrameInput,
} from './ReplayDirectorGazeSolver.ts';
import {
  clamp,
  smooth1DZeroPhase,
  computeBounceBridgedBallTrajectory,
  resolveInitialCorridorAndLateralBias,
} from './replayDirectorElevationPipeline.ts';

const TICK_RATE = 120;

export interface BuildDirectorSubjectAnchorsOptions {
  scoringTeam?: number;
  scorerCarIndex?: number;
  goalLineFrameIdx?: number;
  touchEvents?: ReplayTouchEvent[];
  carTeamResolver?: (carIndex: number) => number;
  lateralBias?: number;
  initialSettledCarPos?: { carIndex?: number; x: number; y: number; z: number } | null;
}

export interface DirectorSubjectAnchorsResult {
  N: number;
  goalIdx: number;
  goalSignY: number;
  goalY: number;
  holdTicks: number;
  scorerCarIdx: number;
  lastScoreTouchFrame: number;
  openSideX: number;
  activeScoringTouches: ReplayTouchEvent[];
  oppTouches: ReplayTouchEvent[];
  bx: Float64Array;
  by: Float64Array;
  bz: Float64Array;
  sbx: Float64Array;
  sby: Float64Array;
  sbz: Float64Array;
  gazeEnvelopeZ: Float64Array;
  eyeEnvelopeZ: Float64Array;
  bouncePullbackUu: Float64Array;
  smScx: Float64Array;
  smScy: Float64Array;
  smScz: Float64Array;
  lastScorerX: Float64Array;
  lastScorerY: Float64Array;
  lastScorerZ: Float64Array;
  handoffArcWArr: Float64Array;
  handoffZLiftArr: Float64Array;
  oppChallengeWArr: Float64Array;
  smOcx: Float64Array;
  smOcy: Float64Array;
  smOcz: Float64Array;
  smOppW: Float64Array;
  postShotBallFocus: Float64Array;
  activeScoreCar: Int32Array;
  nextScoreCar: Int32Array;
  nextTouchBlendArr: Float64Array;
  hasNextTouchBall: Uint8Array;
  nextTouchBallX: Float64Array;
  nextTouchBallY: Float64Array;
  nextTouchBallZ: Float64Array;
  activeOppCar: Int32Array;
  carSwitchBlendArr: Float64Array;
  ux: number;
  uy: number;
  wxAxis: number;
  wyAxis: number;
  resolvedLateralBias: number;
}

function getFrameSnap(item: GoalExplosionFrameInput): ArrayLike<number> | null {
  if (!item) return null;
  if ('snapshot' in item && item.snapshot) return item.snapshot;
  return 'length' in item && typeof item.length === 'number' ? item : null;
}

export function buildDirectorSubjectAnchors(
  frames: ReadonlyArray<GoalExplosionFrameInput>,
  options: BuildDirectorSubjectAnchorsOptions = {}
): DirectorSubjectAnchorsResult | null {
  const N = Array.isArray(frames) ? frames.length : 0;
  if (N === 0) return null;

  const scoringTeam = options.scoringTeam ?? 0;
  const goalSignY = scoringTeam === 0 ? 1.0 : -1.0;
  const goalY = goalSignY * 5120.0;
  const fallbackScorer =
    typeof options.scorerCarIndex === 'number' && options.scorerCarIndex >= 0
      ? options.scorerCarIndex
      : 0;
  const firstSnap = getFrameSnap(frames[0]);
  const numCars = Math.min(
    MAX_CARS,
    Math.max(1, Math.round(firstSnap?.[SIM_OFFSETS.NUM_CARS] || 1))
  );

  const f64 = (): Float64Array<ArrayBufferLike> => new Float64Array(N);
  const i32 = () => new Int32Array(N);
  const bx = f64(),
    by = f64(),
    bz = f64(),
    bvx = f64(),
    bvy = f64(),
    bvz = f64();
  const cx = Array.from({ length: numCars }, f64),
    cy = Array.from({ length: numCars }, f64),
    cz = Array.from({ length: numCars }, f64);

  const resolvedGoalIdx = resolveGoalExplosionFrameIndex(
    frames,
    goalSignY,
    typeof options.goalLineFrameIdx === 'number' ? options.goalLineFrameIdx : -1
  );

  for (let i = 0; i < N; i++) {
    const snap = getFrameSnap(frames[i]);
    if (!snap || snap.length < SIM_OFFSETS.BALL + BALL_STATE_STRIDE) continue;
    bx[i] = snap[SIM_OFFSETS.BALL] || 0;
    by[i] = snap[SIM_OFFSETS.BALL + 1] || 0;
    bz[i] = snap[SIM_OFFSETS.BALL + 2] || 93;
    bvx[i] = snap[SIM_OFFSETS.BALL + 12] || 0;
    bvy[i] = snap[SIM_OFFSETS.BALL + 13] || 0;
    bvz[i] = snap[SIM_OFFSETS.BALL + 14] || 0;
    for (let c = 0; c < numCars; c++) {
      const base = SIM_OFFSETS.CARS + c * CAR_STATE_STRIDE;
      if (snap.length >= base + 15) {
        cx[c][i] = snap[base] || 0;
        cy[c][i] = snap[base + 1] || 0;
        cz[c][i] = snap[base + 2] || 17;
      }
    }
  }

  const goalIdx = clamp(resolvedGoalIdx < 0 ? Math.max(0, N - 1) : resolvedGoalIdx, 0, N - 1);
  for (let c = 0; c < numCars; c++) {
    for (let idx = Math.min(N - 1, 3); idx >= 1; idx--) {
      if (
        Math.hypot(
          cx[c][idx] - cx[c][idx - 1],
          cy[c][idx] - cy[c][idx - 1],
          cz[c][idx] - cz[c][idx - 1]
        ) > 180.0
      ) {
        for (let k = 0; k < idx; k++) {
          cx[c][k] = cx[c][idx];
          cy[c][k] = cy[c][idx];
          cz[c][k] = cz[c][idx];
        }
        break;
      }
    }
    cx[c] = smooth1DZeroPhase(cx[c], 0.22, 2);
    cy[c] = smooth1DZeroPhase(cy[c], 0.22, 2);
    cz[c] = smooth1DZeroPhase(cz[c], 0.18, 2);
  }

  const sbx = smooth1DZeroPhase(bx, 0.18, 2),
    sby = smooth1DZeroPhase(by, 0.18, 2),
    sbz = smooth1DZeroPhase(bz, 0.16, 2);
  const { gazeEnvelopeZ, eyeEnvelopeZ, bouncePullbackUu } = computeBounceBridgedBallTrajectory(
    bz,
    bvz,
    goalIdx
  );

  const rawTouches: ReplayTouchEvent[] = Array.isArray(options.touchEvents)
    ? options.touchEvents
    : [];
  const touchTeamByCar = new Map<number, number>();
  for (const t of rawTouches) {
    if (t && typeof t.carIndex === 'number' && typeof t.team === 'number')
      touchTeamByCar.set(t.carIndex, t.team);
  }
  const resolveCarTeam = (c: number): number =>
    typeof options.carTeamResolver === 'function'
      ? options.carTeamResolver(c)
      : (touchTeamByCar.get(c) ?? c % 2);

  const preGoalTouches = rawTouches.filter((t) => t && t.frameIndex <= goalIdx + 8);
  const scoringTouches = preGoalTouches.filter((t) => t.team === scoringTeam);
  const activeScoringTouches: ReplayTouchEvent[] =
    scoringTouches.length > 0
      ? scoringTouches
      : preGoalTouches.length > 0
        ? preGoalTouches
        : [
            {
              frameIndex: goalIdx,
              tick: goalIdx,
              carIndex: clamp(fallbackScorer, 0, numCars - 1),
              team: scoringTeam,
              ballX: bx[goalIdx],
              ballY: by[goalIdx],
              ballZ: bz[goalIdx],
            },
          ];

  const scorerCarIdx = clamp(
    activeScoringTouches[activeScoringTouches.length - 1]?.carIndex ?? fallbackScorer,
    0,
    numCars - 1
  );
  const oppTouches: ReplayTouchEvent[] = preGoalTouches
    .filter((t) => t.team !== scoringTeam && t.frameIndex > 12 && t.frameIndex <= goalIdx + 2)
    .map((t) => ({ ...t }));

  const firstScoreTouchFrame = Math.max(12, (activeScoringTouches[0]?.frameIndex ?? 0) - 30);
  for (let c = 0; c < numCars; c++) {
    if (resolveCarTeam(c) === scoringTeam) continue;
    let minD = 310.0,
      bestF = -1;
    for (let i = firstScoreTouchFrame; i <= goalIdx; i++) {
      const d = Math.hypot(cx[c][i] - bx[i], cy[c][i] - by[i], cz[c][i] - bz[i]);
      if (d < minD) {
        minD = d;
        bestF = i;
      }
    }
    if (
      bestF >= 0 &&
      !oppTouches.some((ot) => ot.carIndex === c && Math.abs(ot.frameIndex - bestF) < 75)
    ) {
      oppTouches.push({
        frameIndex: bestF,
        tick: bestF,
        carIndex: c,
        team: resolveCarTeam(c),
        ballX: bx[bestF],
        ballY: by[bestF],
        ballZ: bz[bestF],
        isSaveAttempt: true,
      });
    }
  }
  oppTouches.sort((a, b) => a.frameIndex - b.frameIndex);

  const cfg = REPLAY_DIRECTOR_CONFIG;
  const holdTicks = Math.round(clamp(cfg.touchHoldAfterSeconds ?? 0.2, 0.0, 1.2) * TICK_RATE);
  const lookaheadTicks = Math.max(
    45,
    Math.round(clamp(cfg.twoTouchLookaheadSeconds ?? 2.2, 0.4, 5.0) * TICK_RATE)
  );
  const anticipationWeight = clamp(cfg.twoTouchAnticipationWeight ?? 0.36, 0.0, 1.0);
  const interceptorPreTicks = Math.max(
    24,
    Math.round(clamp(cfg.interceptorLookaheadSeconds ?? 1.65, 0.2, 4.0) * TICK_RATE)
  );
  const interceptorPostTicks = Math.round(0.75 * TICK_RATE);
  const interceptorWeightCfg = clamp(cfg.interceptorFramingWeight ?? 0.72, 0.0, 1.0);

  const scx = f64(),
    scy = f64(),
    scz = f64(),
    handoffArcWArr = f64(),
    handoffZLiftArr = f64(),
    oppChallengeWArr = f64(),
    postShotBallFocus = f64();
  const activeScoreCar = i32(),
    nextScoreCar = i32(),
    nextTouchBlendArr = f64(),
    nextTouchBallX = f64(),
    nextTouchBallY = f64(),
    nextTouchBallZ = f64();
  const hasNextTouchBall = new Uint8Array(N),
    carSwitchBlendArr = f64(),
    ocx = f64(),
    ocy = f64(),
    ocz = f64(),
    oppW = f64(),
    activeOppCar = i32();

  const lastScoreTouchFrame =
    activeScoringTouches[activeScoringTouches.length - 1]?.frameIndex ?? goalIdx;
  const postShotReleaseTicks = Math.max(24, Math.round(0.32 * TICK_RATE));
  const firstCarIdx = clamp(activeScoringTouches[0]?.carIndex ?? scorerCarIdx, 0, numCars - 1);

  for (let i = 0; i < N; i++) {
    const firstTouchF = activeScoringTouches[0]?.frameIndex ?? goalIdx;
    const firstRefF =
      activeScoringTouches.length > 1 && activeScoringTouches[1].carIndex !== firstCarIdx
        ? Math.min(i, firstTouchF + 16)
        : i;
    let wx = cx[firstCarIdx][firstRefF],
      wy = cy[firstCarIdx][firstRefF],
      wz = cz[firstCarIdx][firstRefF];
    let domCar = firstCarIdx,
      swBlend = 1.0,
      handoffArcW = 0.0;

    for (let k = 0; k < activeScoringTouches.length - 1; k++) {
      const t0 = activeScoringTouches[k],
        t1 = activeScoringTouches[k + 1];
      const c0 = clamp(t0.carIndex, 0, numCars - 1),
        c1 = clamp(t1.carIndex, 0, numCars - 1);
      const gap = Math.max(36, t1.frameIndex - t0.frameIndex);

      const c0Deeper =
        c1 !== c0
          ? Math.max(0.0, (cy[c0][t0.frameIndex] - cy[c1][t0.frameIndex]) * goalSignY)
          : 0.0;
      const earlyLead =
        c0Deeper > 450.0
          ? Math.min(140, Math.round(gap * 0.42))
          : Math.min(22, Math.round(gap * 0.16));
      const startF = c1 !== c0 ? t0.frameIndex - earlyLead : t0.frameIndex + 20;
      const spanF =
        c1 !== c0
          ? clamp(Math.round(gap * 0.72) + earlyLead, 85, 260)
          : clamp(Math.round(gap * 0.35), 40, 90);
      if (i >= startF) {
        const u = clamp((i - startF) / spanF, 0, 1),
          s = u * u * (3 - 2 * u);
        const c1RefF =
          k + 2 < activeScoringTouches.length && activeScoringTouches[k + 2].carIndex !== c1
            ? Math.min(i, t1.frameIndex + 16)
            : i;
        wx = wx * (1 - s) + cx[c1][c1RefF] * s;
        wy = wy * (1 - s) + cy[c1][c1RefF] * s;
        wz = wz * (1 - s) + cz[c1][c1RefF] * s;
        if (s >= 0.5) domCar = c1;
        if (c1 !== c0 && u > 0 && u < 1) swBlend = Math.min(swBlend, Math.abs(2 * s - 1));
      }
      if (c1 !== c0) {
        const dtH = i - t0.frameIndex;
        if (dtH >= -25 && dtH <= 95) {
          const bell = Math.sin(((dtH + 25) / 120) * Math.PI);
          handoffArcW = Math.max(handoffArcW, 0.22 * bell * bell);
        }
      }
    }

    if (i <= goalIdx) {
      postShotBallFocus[i] =
        i > lastScoreTouchFrame + holdTicks
          ? 0.5 -
            0.5 *
              Math.cos(
                clamp((i - (lastScoreTouchFrame + holdTicks)) / postShotReleaseTicks, 0, 1) *
                  Math.PI
              )
          : 0.0;
    } else {
      postShotBallFocus[i] = 1.0;
      const postS = 0.5 - 0.5 * Math.cos(clamp((i - goalIdx) / 28, 0, 1) * Math.PI);
      wx = wx * (1 - postS) + cx[scorerCarIdx][i] * postS;
      wy = wy * (1 - postS) + cy[scorerCarIdx][i] * postS;
      wz = wz * (1 - postS) + cz[scorerCarIdx][i] * postS;
      domCar = scorerCarIdx;
    }

    scx[i] = wx;
    scy[i] = wy;
    scz[i] = wz;
    handoffArcWArr[i] = handoffArcW;
    handoffZLiftArr[i] = 0.0;
    activeScoreCar[i] = domCar;
    carSwitchBlendArr[i] = swBlend;

    let kCurr = activeScoringTouches.length - 1;
    for (let j = 0; j < activeScoringTouches.length; j++) {
      if (i <= activeScoringTouches[j].frameIndex + holdTicks) {
        kCurr = j;
        break;
      }
    }
    const currTouch = activeScoringTouches[kCurr];
    const nt =
      i >= currTouch.frameIndex - 65 && kCurr + 1 < activeScoringTouches.length
        ? activeScoringTouches[kCurr + 1]
        : currTouch;
    const dtNext = nt.frameIndex - i;
    if (dtNext > 0 && dtNext <= lookaheadTicks) {
      const s = 0.5 - 0.5 * Math.cos(clamp(1.0 - dtNext / lookaheadTicks, 0, 1) * Math.PI);
      nextScoreCar[i] = clamp(nt.carIndex, 0, numCars - 1);
      nextTouchBlendArr[i] = anticipationWeight * s * s;
      nextTouchBallX[i] = nt.ballX ?? bx[nt.frameIndex];
      nextTouchBallY[i] = nt.ballY ?? by[nt.frameIndex];
      nextTouchBallZ[i] = nt.ballZ ?? bz[nt.frameIndex];
      hasNextTouchBall[i] = 1;
    } else {
      nextScoreCar[i] = -1;
      nextTouchBlendArr[i] = 0;
      nextTouchBallX[i] = bx[i];
      nextTouchBallY[i] = by[i];
      nextTouchBallZ[i] = bz[i];
      hasNextTouchBall[i] = 0;
    }

    let challengeW = 0,
      sumOppW = 0,
      sumOx = 0,
      sumOy = 0,
      sumOz = 0,
      bestOppW = 0,
      bestOppCar = -1;
    for (const ot of oppTouches) {
      const cIdx = clamp(ot.carIndex, 0, numCars - 1);
      const absDt = Math.abs(i - ot.frameIndex);
      if (!ot.isSaveAttempt && absDt < 65) {
        challengeW = Math.max(challengeW, 0.16 * (0.5 + 0.5 * Math.cos((absDt / 65) * Math.PI)));
      }
      const dtTicks = ot.frameIndex - i;
      let w =
        dtTicks >= 0 && dtTicks <= interceptorPreTicks
          ? 0.5 - 0.5 * Math.cos((1.0 - dtTicks / interceptorPreTicks) * Math.PI)
          : dtTicks < 0 && -dtTicks <= interceptorPostTicks
            ? 0.5 - 0.5 * Math.cos((1.0 - -dtTicks / interceptorPostTicks) * Math.PI)
            : 0;
      w *= (ot.isSaveAttempt ? 0.55 : 0.85) * interceptorWeightCfg;
      if (w > 1e-4) {
        sumOppW += w;
        sumOx += w * cx[cIdx][i];
        sumOy += w * cy[cIdx][i];
        sumOz += w * cz[cIdx][i];
        if (w > bestOppW) {
          bestOppW = w;
          bestOppCar = cIdx;
        }
      }
    }
    oppChallengeWArr[i] = challengeW;

    if (sumOppW > 1e-4 && i <= goalIdx + 12) {
      ocx[i] = sumOx / sumOppW;
      ocy[i] = sumOy / sumOppW;
      ocz[i] = sumOz / sumOppW;
      oppW[i] = Math.min(0.65, bestOppW);
      activeOppCar[i] = bestOppCar;
    } else {
      ocx[i] = bx[i];
      ocy[i] = by[i];
      ocz[i] = bz[i];
      oppW[i] = 0;
      activeOppCar[i] = -1;
    }
  }

  const smScx = smooth1DZeroPhase(scx, 0.11, 2),
    smScy = smooth1DZeroPhase(scy, 0.11, 2),
    smScz = smooth1DZeroPhase(scz, 0.12, 2);
  const smOcx = smooth1DZeroPhase(ocx, 0.16, 2),
    smOcy = smooth1DZeroPhase(ocy, 0.16, 2),
    smOcz = smooth1DZeroPhase(ocz, 0.16, 2);
  const smOppW = smooth1DZeroPhase(oppW, 0.12, 2);
  const { ux, uy, wxAxis, wyAxis, openSideX, resolvedLateralBias } =
    resolveInitialCorridorAndLateralBias({
      goalIdx,
      goalY,
      goalSignY,
      lastScoreTouchFrame,
      holdTicks,
      sbx,
      sby,
      smScx,
      smScy,
    });

  return {
    N,
    goalIdx,
    goalSignY,
    goalY,
    holdTicks,
    scorerCarIdx,
    lastScoreTouchFrame,
    openSideX,
    activeScoringTouches,
    oppTouches,
    bx,
    by,
    bz,
    sbx,
    sby,
    sbz,
    gazeEnvelopeZ,
    eyeEnvelopeZ,
    bouncePullbackUu,
    smScx,
    smScy,
    smScz,
    lastScorerX: cx[scorerCarIdx],
    lastScorerY: cy[scorerCarIdx],
    lastScorerZ: cz[scorerCarIdx],
    handoffArcWArr,
    handoffZLiftArr,
    oppChallengeWArr,
    smOcx,
    smOcy,
    smOcz,
    smOppW,
    postShotBallFocus,
    activeScoreCar,
    nextScoreCar,
    nextTouchBlendArr,
    hasNextTouchBall,
    nextTouchBallX,
    nextTouchBallY,
    nextTouchBallZ,
    activeOppCar,
    carSwitchBlendArr,
    ux,
    uy,
    wxAxis,
    wyAxis,
    resolvedLateralBias,
  };
}
