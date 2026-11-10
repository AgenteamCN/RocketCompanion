export const POST_GOAL_FREEZE_DELAY_TICKS = 30;
export const EXPIRE_REPLAY_LOOKBACK_TICKS = 1200;
export const UU_TO_KPH = 0.036;
export const TOUCH_DIRECT_DISTANCE_UU = 168.0;
export const TOUCH_IMPULSE_DISTANCE_UU = 198.0;
export const TOUCH_IMPULSE_MIN_DELTA_V_UU = 25.0;
export const DEFAULT_GRAVITY_Z_PER_TICK = -650.0 / 120.0;

export interface BallStateViewLike {
  posX: number;
  posY: number;
  posZ: number;
  velX: number;
  velY: number;
  velZ: number;
}
export interface CarStateViewLike {
  posX: number;
  posY: number;
  posZ: number;
  isDemoed?: boolean;
}
export interface BallVelocityTrackerState {
  prevBallVelX: number;
  prevBallVelY: number;
  prevBallVelZ: number;
}
export interface GoalScoredEvaluation {
  scored: boolean;
  scoringTeam: 0 | 1;
  ballSpeedUu: number;
  ballSpeedKph: number;
}

export interface GoalScoredEvaluationOptions {
  /**
   * Specialized for `.RLRCSPack` training packs where shots may launch outward from inside
   * the goal net: requires a positive velocity component pointing toward the inside of the goal
   * (`inwardVelUu > 0`) and rejects stationary or outward-moving balls (`outwardVelUu >= 0`
   * or `outwardVelUu > maxOutwardGoalVelocityUu`).
   */
  requireInwardGoalVelocity?: boolean;
  maxOutwardGoalVelocityUu?: number;
}

const NO_GOAL_EVALUATION: Readonly<GoalScoredEvaluation> = Object.freeze({
  scored: false,
  scoringTeam: 0,
  ballSpeedUu: 0,
  ballSpeedKph: 0,
});

export function evaluateGoalScoredFromBallView(
  sim: { isBallScored?: (bView: BallStateViewLike) => boolean } | null | undefined,
  bView: BallStateViewLike | null | undefined,
  options?: GoalScoredEvaluationOptions
): GoalScoredEvaluation {
  if (!bView) return NO_GOAL_EVALUATION;
  const scored =
    typeof sim?.isBallScored === 'function'
      ? Boolean(sim.isBallScored(bView))
      : Math.abs(bView.posY) > 5120 + 91.25 &&
        Math.abs(bView.posX) < 892.755 &&
        bView.posZ < 642.775;
  if (!scored) return NO_GOAL_EVALUATION;

  if (options?.requireInwardGoalVelocity) {
    const inwardVelUu = bView.posY >= 0 ? bView.velY : -bView.velY;
    const outwardVelUu = -inwardVelUu;
    const maxOutwardUu = options.maxOutwardGoalVelocityUu ?? 100;
    if (inwardVelUu <= 0 || outwardVelUu > maxOutwardUu) {
      return NO_GOAL_EVALUATION;
    }
  }

  const scoringTeam: 0 | 1 = bView.posY > 0 ? 0 : 1;
  const ballSpeedUu = Math.hypot(bView.velX, bView.velY, bView.velZ);
  const ballSpeedKph = Math.max(1, Math.round(ballSpeedUu * UU_TO_KPH));
  return { scored: true, scoringTeam, ballSpeedUu, ballSpeedKph };
}

export function computeGravityCompensatedBallImpulse(
  bView: BallStateViewLike,
  tracker: BallVelocityTrackerState,
  gravityZPerTick = DEFAULT_GRAVITY_Z_PER_TICK
): number {
  const dvX = bView.velX - tracker.prevBallVelX;
  const dvY = bView.velY - tracker.prevBallVelY;
  const dvZ = bView.velZ - (tracker.prevBallVelZ + gravityZPerTick);
  tracker.prevBallVelX = bView.velX;
  tracker.prevBallVelY = bView.velY;
  tracker.prevBallVelZ = bView.velZ;
  return Math.hypot(dvX, dvY, dvZ);
}

export function detectSingleCarBallTouch(
  bView: BallStateViewLike | null | undefined,
  carView: CarStateViewLike | null | undefined,
  tracker: BallVelocityTrackerState
): boolean {
  if (!bView || !carView || carView.isDemoed) return false;
  const impulseMag = computeGravityCompensatedBallImpulse(bView, tracker);
  const dist = Math.hypot(
    carView.posX - bView.posX,
    carView.posY - bView.posY,
    carView.posZ - bView.posZ
  );
  return (
    dist <= TOUCH_DIRECT_DISTANCE_UU ||
    (dist <= TOUCH_IMPULSE_DISTANCE_UU && impulseMag > TOUCH_IMPULSE_MIN_DELTA_V_UU)
  );
}

export function findClosestTouchingCarIndex<T extends { carIndex: number }>(params: {
  sim: { getCarStateView?: (carIndex: number) => CarStateViewLike | null } | null | undefined;
  bView: BallStateViewLike | null | undefined;
  entries: readonly T[];
  tracker: BallVelocityTrackerState;
}): number {
  const { sim, bView, entries, tracker } = params;
  if (!sim || !bView) return -1;

  const impulseMag = computeGravityCompensatedBallImpulse(bView, tracker);
  let closestCarIdx = -1;
  let closestDist = Infinity;

  for (const entry of entries) {
    const cv = sim.getCarStateView?.(entry.carIndex);
    if (!cv || cv.isDemoed) continue;
    const dist = Math.hypot(cv.posX - bView.posX, cv.posY - bView.posY, cv.posZ - bView.posZ);
    if (dist < closestDist) {
      closestDist = dist;
      closestCarIdx = entry.carIndex;
    }
  }

  if (
    closestCarIdx >= 0 &&
    (closestDist <= TOUCH_DIRECT_DISTANCE_UU ||
      (closestDist <= TOUCH_IMPULSE_DISTANCE_UU && impulseMag > TOUCH_IMPULSE_MIN_DELTA_V_UU))
  ) {
    return closestCarIdx;
  }
  return -1;
}

export function stepPostGoalBallFreeze(params: {
  sim:
    | {
        getBallState?: () => Float32Array | ArrayLike<number>;
        setBallState?: (state: Float32Array) => void;
      }
    | null
    | undefined;
  goalResetTicks: number;
  currentTick: number;
  goalIncidentTick: number;
  frozenBallState: Float32Array | null;
  freezeDelayTicks?: number;
}): Float32Array | null {
  const {
    sim,
    goalResetTicks,
    currentTick,
    goalIncidentTick,
    frozenBallState,
    freezeDelayTicks = POST_GOAL_FREEZE_DELAY_TICKS,
  } = params;
  if (
    goalResetTicks <= 0 ||
    goalIncidentTick < 0 ||
    currentTick < goalIncidentTick + freezeDelayTicks
  ) {
    return frozenBallState;
  }
  let nextFrozen = frozenBallState;
  if (!nextFrozen && typeof sim?.getBallState === 'function') {
    const snapBall = new Float32Array(sim.getBallState());
    for (let i = 12; i < 18 && i < snapBall.length; i++) snapBall[i] = 0;
    nextFrozen = snapBall;
  }
  if (nextFrozen && typeof sim?.setBallState === 'function') sim.setBallState(nextFrozen);
  return nextFrozen;
}

export function hasKickoffBallMoved(bView: BallStateViewLike | null | undefined): boolean {
  if (!bView) return false;
  return (
    Math.abs(bView.posX) + Math.abs(bView.posY) > 2.0 || Math.hypot(bView.velX, bView.velY) > 5.0
  );
}
