/**
 * ReplayDirectorTrajectoryPlanner.ts
 * Phase-Aware Behind-Striker, Handoff-Anticipation, and Goal-Box Showcase Camera Trajectory
 * Planner for Rocket League Goal Replay Director Camera.
 */

import { REPLAY_DIRECTOR_CONFIG } from '../ui-core/config/replayDirectorConfig.ts';

import {
  clamp,
  smoothstep,
  smooth1DZeroPhase,
  smoothTrajectoryWithVelocityCap,
  computeAdaptiveDirectorEyeHeight,
  clampPositionInsideArena,
} from './replayDirectorElevationPipeline.ts';
import {
  solveDirectorTrajectoryGazeAndPoses,
  type GoalExplosionFrameInput,
  type SolveDirectorTrajectoryGazeResult,
} from './ReplayDirectorGazeSolver.ts';
import {
  buildDirectorSubjectAnchors,
  type BuildDirectorSubjectAnchorsOptions,
} from './replayDirectorSubjectAnchorPipeline.ts';

export type SuffixDirectorTrajectoryPlan = SolveDirectorTrajectoryGazeResult;

export type BuildSuffixSafeDirectorTrajectoryOptions = BuildDirectorSubjectAnchorsOptions;

const TICK_RATE = 120;

/**
 * Builds the full-window Phase-Aware Director Camera Trajectory across all frames [0 .. N-1]:
 * 1. Striker Approach Phase: places the camera behind the active striker along a forward-consistent
 *    Striker->Ball and Play->Goal sightline at car-grounded elevation.
 * 2. Multi-Touch Handoff Phase: smoothly transitions between passers and receivers without corner whips.
 * 3. Post-Touch & Post-Goal Showcase Phase: holds a stable oblique behind-play vantage point as the
 *    ball enters the goal mouth without teleporting into the back wall or sprinting backward.
 */
export function buildSuffixSafeDirectorTrajectory(
  frames: ReadonlyArray<GoalExplosionFrameInput>,
  options: BuildSuffixSafeDirectorTrajectoryOptions = {}
): SuffixDirectorTrajectoryPlan | null {
  const anchors = buildDirectorSubjectAnchors(frames, options);
  if (!anchors) return null;

  const {
    N,
    goalIdx,
    goalSignY,
    goalY,
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
    bouncePullbackUu,
    smScx,
    smScy,
    smScz,
    handoffArcWArr,
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
    wxAxis,
    resolvedLateralBias,
  } = anchors;

  const sideBase = clamp(REPLAY_DIRECTOR_CONFIG.corridorSideDistBase ?? 760.0, 120.0, 1400.0);
  const baseHeightUu = clamp(REPLAY_DIRECTOR_CONFIG.cameraBaseHeightUu ?? 218.0, 185.0, 520.0);
  const aerialSlope = clamp(
    (REPLAY_DIRECTOR_CONFIG.cameraAerialHeightSlope ?? 0.36) * 2.15,
    0.55,
    0.9
  );

  const rawPreX = new Float64Array(goalIdx + 1);
  const rawPreY = new Float64Array(goalIdx + 1);
  const rawPreZ = new Float64Array(goalIdx + 1);

  const effScxArr = new Float64Array(goalIdx + 1);
  const effScyArr = new Float64Array(goalIdx + 1);
  const fxArr = new Float64Array(goalIdx + 1);
  const fyArr = new Float64Array(goalIdx + 1);
  const ceilingPullArr = new Float64Array(goalIdx + 1);

  for (let i = 0; i <= goalIdx; i++) {
    const oppW = oppChallengeWArr[i];
    const handoffArcW = handoffArcWArr[i];
    const postShotW = postShotBallFocus[i];

    // 1. Leash far-backfield striker (> 1150 UU from ball) so camera doesn't start 5000 UU away,
    // while keeping effScx/effScy at the exact striker position once within 1150 UU of the ball.
    const rawCbx = sbx[i] - smScx[i];
    const rawCby = sby[i] - smScy[i];
    const rawCbDist = Math.hypot(rawCbx, rawCby) || 1.0;
    const maxLeashDist = 1150.0;
    const effCbDist =
      rawCbDist > maxLeashDist ? maxLeashDist + (rawCbDist - maxLeashDist) * 0.22 : rawCbDist;
    const leashRatio = effCbDist / rawCbDist;
    const effScx = sbx[i] - rawCbx * leashRatio;
    let effScy = sby[i] - rawCby * leashRatio;

    // Prevent attacking-backboard over-drive when striker slides deeper into attacking corner than ball
    const ballGoalDepth = (goalY - sby[i]) * goalSignY;
    const carGoalDepth = (goalY - effScy) * goalSignY;
    const nearAttackingBackboardW = 1.0 - smoothstep(900.0, 1600.0, ballGoalDepth);
    const minBehindBallDepth = ballGoalDepth + 140.0;
    if (nearAttackingBackboardW > 0.0 && carGoalDepth < minBehindBallDepth) {
      const clampW =
        nearAttackingBackboardW * smoothstep(0.0, 240.0, minBehindBallDepth - carGoalDepth);
      const safeScy = goalY - goalSignY * minBehindBallDepth;
      effScy = effScy * (1.0 - clampW) + safeScy * clampW;
    }

    effScxArr[i] = effScx;
    effScyArr[i] = effScy;

    const cbx = sbx[i] - effScx;
    const cby = sby[i] - effScy;
    const cbDist = Math.hypot(cbx, cby) || 1.0;
    const ucbx = cbx / cbDist;
    const ucby = cby / cbDist;

    const closeAnchorW = 1.0 - smoothstep(550.0, 1600.0, cbDist);
    const ballAnchorW = clamp(0.26 * closeAnchorW + 0.56 * postShotW + oppW * 0.25, 0.0, 0.85);
    const anchorX = (effScx * (1.0 - ballAnchorW) + sbx[i] * ballAnchorW) * 0.86;
    const anchorY = effScy * (1.0 - ballAnchorW) + sby[i] * ballAnchorW;

    // 2. Forward-consistent sightline F: blends Striker->Ball (when positively aligned with Goal)
    // and Play->Goal, with defensive back-wall turn-out so -F never backs into the defensive backboard.
    const bgx = (0.0 - sbx[i]) * 0.68;
    const bgy = goalSignY * Math.max(950.0, (goalY - sby[i]) * goalSignY);
    const bgDist = Math.hypot(bgx, bgy) || 1.0;
    let ubgx = bgx / bgDist;
    let ubgy = bgy / bgDist;

    const defBackWallProx = smoothstep(3400.0, 4650.0, -sby[i] * goalSignY);
    if (defBackWallProx > 0.0) {
      const sideInward = sbx[i] >= 0 ? 1.0 : -1.0;
      ubgx = ubgx * (1.0 - 0.65 * defBackWallProx) + sideInward * (0.65 * defBackWallProx);
      ubgy = ubgy * (1.0 - 0.45 * defBackWallProx);
      const ubNorm = Math.hypot(ubgx, ubgy) || 1.0;
      ubgx /= ubNorm;
      ubgy /= ubNorm;
    }

    const alignW = smoothstep(-0.05, 0.55, ucbx * ubgx + ucby * ubgy);
    const wCB = 0.38 * smoothstep(140.0, 680.0, cbDist) * alignW * (1.0 - postShotW) * (1.0 - oppW);

    let fx = ucbx * wCB + ubgx * (1.0 - wCB);
    let fy = ucby * wCB + ubgy * (1.0 - wCB);
    const fNorm = Math.hypot(fx, fy) || 1.0;
    fx /= fNorm;
    fy /= fNorm;
    fxArr[i] = fx;
    fyArr[i] = fy;

    const goalDistY = Math.abs(goalY - sby[i]);
    const goalProx = 1.0 - smoothstep(1400.0, 3800.0, goalDistY);

    // 3. Longitudinal pullback (including lateral Car-Ball span & ceiling-ball pullback)
    const lateralSpan = Math.abs(cbx * -fy + cby * fx);
    const spanPullback = Math.min(620.0, lateralSpan * 0.42) * (1.0 - 0.75 * postShotW);
    const ceilingPullback = Math.max(0.0, sbz[i] - 900.0) * 0.36;
    ceilingPullArr[i] = ceilingPullback;

    const baseBack =
      (630.0 + 110.0 * smoothstep(250.0, 1500.0, cbDist)) * (1.0 - 0.12 * goalProx) +
      spanPullback +
      ceilingPullback +
      oppW * 160.0 +
      bouncePullbackUu[i] * 0.25;
    const closeLatW = 1.0 - 0.7 * smoothstep(750.0, 2200.0, cbDist);
    const postShotSideWiden = 140.0 * smoothstep(lastScoreTouchFrame - 20, goalIdx, i);
    const sideMag =
      (360.0 * closeLatW + goalProx * 170.0 + handoffArcW * 160.0 + postShotSideWiden) *
      (1.0 - 0.65 * defBackWallProx);

    const forwardDot = Math.max(0.0, openSideX * fx);
    const latDirX = openSideX - forwardDot * fx;
    const latDirY = -forwardDot * fy;

    const ex = anchorX - fx * baseBack + latDirX * sideMag;
    const ey = anchorY - fy * baseBack + latDirY * sideMag;
    const ez = computeAdaptiveDirectorEyeHeight(smScz[i], baseHeightUu, aerialSlope, sbz[i]);

    rawPreX[i] = ex;
    rawPreY[i] = ey;
    rawPreZ[i] = clamp(ez, 195.0, 1240.0);
  }

  // Deep zero-phase dolly filter irons out 1-second corner excursions and rebound pumps
  const baseDollyX = smooth1DZeroPhase(rawPreX, 0.042, 4);
  const baseDollyY = smooth1DZeroPhase(rawPreY, 0.042, 4);
  const baseDollyZ = smooth1DZeroPhase(rawPreZ, 0.065, 3);

  // Enforce Cone-Bounded Behind-Play Invariant on the smoothed dolly path so the camera never
  // drifts in front of the active Ball or Striker
  const pushXArr = new Float64Array(goalIdx + 1);
  const pushYArr = new Float64Array(goalIdx + 1);
  for (let i = 0; i <= goalIdx; i++) {
    let ex = baseDollyX[i];
    let ey = baseDollyY[i];
    const fx = fxArr[i];
    const fy = fyArr[i];
    const postShotW = postShotBallFocus[i];
    const effScx = effScxArr[i];
    const effScy = effScyArr[i];

    const latBall = Math.abs((sbx[i] - ex) * -fy + (sby[i] - ey) * fx);
    const latCar = Math.abs((effScx - ex) * -fy + (effScy - ey) * fx);
    const reqProjBall = Math.max(460.0, latBall * 1.38 + ceilingPullArr[i] * 0.45);
    const reqProjCar = Math.max(460.0, latCar * 1.38) * (1.0 - 0.75 * postShotW);

    const projBall = (sbx[i] - ex) * fx + (sby[i] - ey) * fy;
    const projCar = (effScx - ex) * fx + (effScy - ey) * fy;
    const deficit = Math.max(reqProjBall - projBall, reqProjCar - projCar);
    if (deficit > 0.0) {
      const pushBack = Math.min(950.0, deficit);
      ex -= fx * pushBack;
      ey -= fy * pushBack;
    }

    const maxAttackY = sby[i] * goalSignY - 340.0;
    if (ey * goalSignY > maxAttackY) {
      ey = maxAttackY * goalSignY;
    }
    pushXArr[i] = ex;
    pushYArr[i] = ey;
  }

  const smoothPreX = smooth1DZeroPhase(pushXArr, 0.065, 3);
  const smoothPreY = smooth1DZeroPhase(pushYArr, 0.065, 3);
  const smoothPreZ = baseDollyZ;

  const rawFullEyeX = new Float64Array(N);
  const rawFullEyeY = new Float64Array(N);
  const rawFullEyeZ = new Float64Array(N);

  for (let i = 0; i <= goalIdx; i++) {
    const cl = clampPositionInsideArena(smoothPreX[i], smoothPreY[i], smoothPreZ[i]);
    rawFullEyeX[i] = cl.x;
    rawFullEyeY[i] = cl.y;
    rawFullEyeZ[i] = cl.z;
  }

  const goalEyeX = rawFullEyeX[goalIdx];
  const goalEyeY = rawFullEyeY[goalIdx];
  const goalEyeZ = rawFullEyeZ[goalIdx];
  const stretchDur = Math.max(0.1, REPLAY_DIRECTOR_CONFIG.postGoalExplosionStretchDuration ?? 0.36);
  const followTransSec = Math.max(
    0.08,
    REPLAY_DIRECTOR_CONFIG.postGoalScorerFollowTransitionSec ?? 0.28
  );

  for (let i = goalIdx + 1; i < N; i++) {
    const postSec = (i - goalIdx) / TICK_RATE;
    const stretchU = clamp(postSec / (stretchDur * 1.5), 0, 1);
    const stretch = stretchU * stretchU * (3 - 2 * stretchU);
    const followW = smoothstep(0.0, followTransSec * 2.8, postSec);

    const sx = clamp(smScx[i], -3000.0, 3000.0);
    const sy = clamp(smScy[i], -4350.0, 4350.0);
    const sz = smScz[i];

    const postSideOffset = wxAxis * (sideBase * 0.45 * resolvedLateralBias);
    const desiredX = clamp(sx * 0.65 + postSideOffset, -3100.0, 3100.0);
    const desiredY =
      Math.min(goalEyeY * goalSignY, (sy - goalSignY * 520.0) * goalSignY) * goalSignY;
    const desiredZ = clamp(goalEyeZ + stretch * 55.0 + Math.max(0, sz - 40.0) * 0.2, 195.0, 1180.0);

    // Leash post-goal camera drift to within 320 UU of goalEye so it never sprints backward
    // across the stadium or slams into the outside of the goalpost wall.
    const dxPost = (desiredX - goalEyeX) * followW;
    const dyPost = (desiredY - goalEyeY) * followW;
    const dzPost = (desiredZ - goalEyeZ) * followW;
    const postDist = Math.hypot(dxPost, dyPost, dzPost);
    const maxPostDrift = 320.0;
    const driftScale = postDist > maxPostDrift && postDist > 1e-6 ? maxPostDrift / postDist : 1.0;

    const cl = clampPositionInsideArena(
      goalEyeX + dxPost * driftScale,
      goalEyeY + dyPost * driftScale,
      goalEyeZ + dzPost * driftScale
    );
    rawFullEyeX[i] = cl.x;
    rawFullEyeY[i] = cl.y;
    rawFullEyeZ[i] = cl.z;
  }

  const {
    eyeX: fullEyeX,
    eyeY: fullEyeY,
    eyeZ: fullEyeZ,
  } = smoothTrajectoryWithVelocityCap(rawFullEyeX, rawFullEyeY, rawFullEyeZ, 12.0, 0.08, 2);

  return solveDirectorTrajectoryGazeAndPoses({
    N,
    goalIdx,
    goalY,
    followTransSec,
    fullEyeX,
    fullEyeY,
    fullEyeZ,
    resolvedLateralBias,
    scorerCarIdx,
    activeScoringTouches,
    oppTouches,
    bx,
    by,
    bz,
    gazeBallZ: gazeEnvelopeZ,
    smScx,
    smScy,
    smScz,
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
  });
}
