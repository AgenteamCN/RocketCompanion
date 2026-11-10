/**
 * multiCarHeuristicPolicy.ts
 * Role-aware multi-car tactical heuristic policy with striker/support/defender spacing.
 * Assigns dynamic roles among same-team cars based on distance to the ball:
 * - Role 0 (Closest): Primary Striker / Challenger
 * - Role 1 (2nd Closest): Midfield Support / Offset Wing
 * - Role 2 (3rd Closest): Third-Man Sweeper / Goalie Anchor
 */

import { ArenaHeaderView, CarStateView, BallStateView } from '../../physics/RocketSimStateViews.ts';
import { DEFAULT_CAR_CONTROLS, resolveActiveCars } from './experimentalMultiCarObsPipeline.ts';
import type { CarControls } from './botpack9700488Actions.ts';
import type { ActiveCarSlot } from './botpackSharedBallPredPipeline.ts';

const sHeaderView = new ArenaHeaderView();
const sBallView = new BallStateView();
const sCarViews: CarStateView[] = Array.from({ length: 8 }, () => new CarStateView());

export function multiCarHeuristicDecide(
  simState: Float32Array,
  _boostPads: unknown,
  selfCarIndex: number,
  selfTeam: number,
  activeCars: ActiveCarSlot[] | null = null
): CarControls {
  sHeaderView.attach(simState);
  if (!simState || sHeaderView.numCars < 1) {
    return { ...DEFAULT_CAR_CONTROLS };
  }

  const roster = resolveActiveCars(simState, activeCars ?? undefined) as ActiveCarSlot[];
  const carView = (sCarViews[selfCarIndex] || new CarStateView()).attachCar(simState, selfCarIndex);
  sBallView.attach(simState);

  const cx = carView.posX;
  const cy = carView.posY;
  const cz = carView.posZ;
  const fx = carView.fwdX;
  const fy = carView.fwdY;
  const rx = carView.rightX;
  const ry = carView.rightY;

  // 1. Wall / Ceiling recovery guard (only when actually tilted on a wall or high up, never on flat ground near goals)
  if (
    (carView.upZ < 0.72 && (Math.abs(cx) > 3750 || Math.abs(cy) > 4850 || cz > 250)) ||
    cz > 1100
  ) {
    const toCenterLen = Math.hypot(-cx, -cy) || 1;
    const dirX = -cx / toCenterLen;
    const dirY = -cy / toCenterLen;
    const dotRight = dirX * rx + dirY * ry;
    const dotFwd = dirX * fx + dirY * fy;
    const steer = Math.max(-1, Math.min(1, dotRight * 3.0));
    return {
      throttle: dotFwd < -0.4 ? -1.0 : 0.85,
      steer: dotFwd < -0.4 ? -steer : steer,
      pitch: !carView.isOnGround ? -0.5 : 0,
      yaw: steer,
      roll: !carView.isOnGround ? Math.max(-1, Math.min(1, -carView.rightZ * 2.0)) : 0,
      jump: false,
      boost: false,
      handbrake: Math.abs(dotRight) > 0.65 && carView.isOnGround,
    };
  }

  const bx = sBallView.posX + sBallView.velX * 0.14;
  const by = sBallView.posY + sBallView.velY * 0.14;
  const bz = sBallView.posZ;

  // Determine tactical role among teammates by ranking distance to predicted ball
  let teammatesCloserCount = 0;
  let closestOppDist = 99999;
  const selfDistToBall = Math.hypot(bx - cx, by - cy);

  for (let i = 0; i < roster.length; i++) {
    const other = roster[i];
    if (other.carIndex === selfCarIndex) continue;
    const ov = (sCarViews[other.carIndex] || new CarStateView()).attachCar(
      simState,
      other.carIndex
    );
    if (ov.isDemoed) continue;
    const d = Math.hypot(bx - (ov.posX + ov.velX * 0.12), by - (ov.posY + ov.velY * 0.12));
    if (other.team === selfTeam) {
      if (
        d < selfDistToBall - 40 ||
        (Math.abs(d - selfDistToBall) <= 40 && other.carIndex < selfCarIndex)
      ) {
        teammatesCloserCount++;
      }
    } else if (d < closestOppDist) {
      closestOppDist = d;
    }
  }

  const enemyGoalY = selfTeam === 0 ? 5120 : -5120;
  const ownGoalY = selfTeam === 0 ? -5120 : 5120;
  const ballToGoalX = 0 - bx;
  const ballToGoalY = enemyGoalY - by;
  const ballToGoalLen = Math.hypot(ballToGoalX, ballToGoalY) || 1;
  const attackDirX = ballToGoalX / ballToGoalLen;
  const attackDirY = ballToGoalY / ballToGoalLen;

  const isKickoffBall =
    Math.abs(sBallView.posX) < 15 &&
    Math.abs(sBallView.posY) < 15 &&
    Math.hypot(sBallView.velX, sBallView.velY) < 15;
  const isBehindBall = selfTeam === 0 ? cy < by + 60 : cy > by - 60;

  let targetX = bx;
  let targetY = by;

  if (teammatesCloserCount === 1 && !isKickoffBall) {
    // Role 1: Midfield Support — position slightly behind and laterally offset from ball
    const wingSign = cx >= 0 ? 1 : -1;
    targetX = Math.max(-2800, Math.min(2800, bx * 0.5 + wingSign * 900));
    targetY = Math.max(-4200, Math.min(4200, by + (ownGoalY - by) * 0.35));
  } else if (teammatesCloserCount >= 2 && !isKickoffBall) {
    // Role 2: Third-Man Sweeper — protect backfield between ball and own goal
    targetX = Math.max(-1600, Math.min(1600, bx * 0.35));
    targetY = Math.max(-4450, Math.min(4450, ownGoalY * 0.65 + by * 0.35));
  } else if (isKickoffBall) {
    targetX = 0;
    targetY = 0;
  } else if (!isBehindBall) {
    const sideSign = cx >= bx ? 1 : -1;
    targetX = Math.max(-3200, Math.min(3200, bx + sideSign * 420));
    targetY = Math.max(-4400, Math.min(4400, by + (ownGoalY > 0 ? 480 : -480)));
  } else if (closestOppDist < selfDistToBall * 0.65 && selfDistToBall > 500) {
    const blockRatio = 0.28;
    targetX = bx * (1 - blockRatio);
    targetY = by + (ownGoalY - by) * blockRatio;
  } else if (selfDistToBall > 340) {
    const offset = Math.min(280, selfDistToBall * 0.45);
    targetX = Math.max(-3300, Math.min(3300, bx - attackDirX * offset));
    targetY = Math.max(-4500, Math.min(4500, by - attackDirY * offset));
  }

  const dx = targetX - cx;
  const dy = targetY - cy;
  const targetLen = Math.hypot(dx, dy) || 1;
  const dirX = dx / targetLen;
  const dirY = dy / targetLen;

  const dotRight = dirX * rx + dirY * ry;
  const dotFwd = dirX * fx + dirY * fy;

  const steer = Math.max(-1, Math.min(1, dotRight * 2.6));
  const throttle =
    dotFwd < -0.35 && selfDistToBall < 450 && !isKickoffBall
      ? -1.0
      : Math.abs(dotRight) > 0.8
        ? 0.45
        : 1.0;
  const boost =
    (isKickoffBall || (isBehindBall && teammatesCloserCount === 0)) &&
    dotFwd > 0.88 &&
    selfDistToBall > 380 &&
    Math.abs(cx) < 3100 &&
    Math.abs(cy) < 4200 &&
    carView.boost > 12;
  const jump =
    !isKickoffBall &&
    teammatesCloserCount === 0 &&
    isBehindBall &&
    selfDistToBall < 185 &&
    bz < 200 &&
    bz > 85 &&
    carView.isOnGround &&
    dotFwd > 0.9;
  const handbrake =
    carView.isOnGround && Math.abs(dotRight) > 0.78 && dotFwd < 0.25 && !isKickoffBall;

  return {
    throttle,
    steer: throttle < 0 ? -steer : steer,
    pitch: jump ? -0.8 : 0,
    yaw: steer,
    roll: 0,
    jump,
    boost,
    handbrake,
  };
}
