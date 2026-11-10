/**
 * botpackSharedBallPredPipeline.ts
 * Shared 600-tick (5.0s @ 120Hz) ball prediction trajectory cache, physics coordinate
 * transformations, and active car roster sorting for Botpack#9700488 observation pipelines.
 */

import {
  ArenaHeaderView,
  CarStateView,
  BallStateView,
  BoostPadStateView,
} from '../../physics/RocketSimStateViews.ts';
import { resolveActiveCars } from './experimentalMultiCarObsPipeline.ts';

export interface ActiveCarSlot {
  carIndex: number;
  team: number;
}

export interface BallPredictionEnginePort {
  updateBallPrediction?: (seconds: number) => number;
  updateBallPredictionIncremental?: (seconds: number) => number;
  getBallPrediction?: () => Float32Array | null;
  getBallPredictionStride?: () => number;
}

export interface CarPhysSnapshot {
  posX: number;
  posY: number;
  posZ: number;
  velX: number;
  velY: number;
  velZ: number;
  angVelX: number;
  angVelY: number;
  angVelZ: number;
  fwdX: number;
  fwdY: number;
  fwdZ: number;
  rightX: number;
  rightY: number;
  rightZ: number;
  upX: number;
  upY: number;
  upZ: number;
  boost: number;
  isOnGround: boolean;
  hasFlipOrJump: boolean;
  hasFlipReset: boolean;
  isDemoed: boolean;
  hasJumped: boolean;
  isSupersonic: boolean;
  demoRespawnTimer: number;
  airTimeSinceJump: number;
}

export interface BallPhysSnapshot {
  posX: number;
  posY: number;
  posZ: number;
  velX: number;
  velY: number;
  velZ: number;
  angVelX: number;
  angVelY: number;
  angVelZ: number;
}

export interface BuiltBotpackObs {
  obs: Float32Array;
  mirrorX?: boolean;
  selfCarView: CarStateView;
}

export interface SortedCarCandidate {
  carIndex: number;
  team: number;
  distSq: number;
  cv: CarStateView;
}

export const sHeaderView = new ArenaHeaderView();
export const sBallView = new BallStateView();
export const sPadView = new BoostPadStateView();
export const sCarViews: CarStateView[] = Array.from({ length: 8 }, () => new CarStateView());

// Shared ball trajectory cache (up to 600 ticks @ 120Hz = 5.0s, 6 floats per tick)
let sBallPredCacheTick = -1;
let sBallPredCachePx = 0;
let sBallPredCacheTicks = 0;
let sBallPredLastHorizonSec = 0;
const sBallPredBuffer = new Float32Array(601 * 6);

export function resetSharedBallPredictionCache(): void {
  sBallPredCacheTick = -1;
  sBallPredCachePx = 0;
  sBallPredCacheTicks = 0;
  sBallPredLastHorizonSec = 0;
}

export function getActiveBotBallPredictionHorizonSeconds(currentTick: number): number {
  if (
    sBallPredCacheTick >= 0 &&
    currentTick >= sBallPredCacheTick &&
    currentTick - sBallPredCacheTick <= 16
  ) {
    return sBallPredLastHorizonSec;
  }
  return 0;
}

/**
 * Computes or retrieves a ball prediction trajectory up to `horizonSeconds` (max 5.0s / 600 ticks @ 120Hz).
 */
export function ensureSharedBallPrediction(
  simState: Float32Array,
  physicsEngine: BallPredictionEnginePort | null = null,
  horizonSeconds = 5.0
): Float32Array {
  sHeaderView.attach(simState);
  sBallView.attach(simState);
  const tick = sHeaderView.tickCount;
  const px = sBallView.posX;
  const reqHorizonSec = Math.min(5.0, Math.max(1.0, horizonSeconds));
  const reqTicks = Math.min(600, Math.ceil(reqHorizonSec * 120));

  if (
    sBallPredCacheTick === tick &&
    sBallPredCacheTicks >= reqTicks &&
    Math.abs(sBallPredCachePx - px) < 0.01
  ) {
    return sBallPredBuffer;
  }
  sBallPredCacheTick = tick;
  sBallPredCachePx = px;
  sBallPredCacheTicks = reqTicks;
  sBallPredLastHorizonSec = reqHorizonSec;

  sBallPredBuffer[0] = sBallView.posX;
  sBallPredBuffer[1] = sBallView.posY;
  sBallPredBuffer[2] = sBallView.posZ;
  sBallPredBuffer[3] = sBallView.velX;
  sBallPredBuffer[4] = sBallView.velY;
  sBallPredBuffer[5] = sBallView.velZ;

  if (physicsEngine && physicsEngine.updateBallPrediction && physicsEngine.getBallPrediction) {
    const count = physicsEngine.updateBallPredictionIncremental
      ? physicsEngine.updateBallPredictionIncremental(reqHorizonSec)
      : physicsEngine.updateBallPrediction(reqHorizonSec);
    const raw = physicsEngine.getBallPrediction();
    const stride = Math.max(6, physicsEngine.getBallPredictionStride?.() ?? 9);
    const availableSlices = raw ? Math.min(count, Math.floor(raw.length / stride)) : 0;
    if (raw && availableSlices > 0) {
      const copyCount = Math.min(reqTicks, availableSlices);
      for (let i = 0; i < copyCount; i++) {
        const src = i * stride;
        const dst = (i + 1) * 6;
        sBallPredBuffer[dst + 0] = raw[src + 0];
        sBallPredBuffer[dst + 1] = raw[src + 1];
        sBallPredBuffer[dst + 2] = raw[src + 2];
        sBallPredBuffer[dst + 3] = raw[src + 3];
        sBallPredBuffer[dst + 4] = raw[src + 4];
        sBallPredBuffer[dst + 5] = raw[src + 5];
      }
      const lastOff = copyCount * 6;
      for (let t = copyCount + 1; t <= reqTicks; t++) {
        const dst = t * 6;
        for (let k = 0; k < 6; k++) {
          sBallPredBuffer[dst + k] = sBallPredBuffer[lastOff + k];
        }
      }
      return sBallPredBuffer;
    }
  }

  let x = sBallView.posX;
  let y = sBallView.posY;
  let z = sBallView.posZ;
  let vx = sBallView.velX;
  let vy = sBallView.velY;
  let vz = sBallView.velZ;
  const dt = 1.0 / 120.0;
  const minX = -4096.0 + 91.25;
  const maxX = 4096.0 - 91.25;
  const minY = -5120.0 + 91.25;
  const maxY = 5120.0 - 91.25;
  const minZ = 91.25;
  const maxZ = 2044.0 - 91.25;

  for (let t = 1; t <= 600; t++) {
    if (z > 94.0 || Math.abs(vz) > 5.0) {
      vz -= 650.0 * dt;
    } else {
      z = 93.15;
      vz = 0.0;
    }
    vx *= 1.0 - 0.0305 * dt;
    vy *= 1.0 - 0.0305 * dt;
    vz *= 1.0 - 0.0305 * dt;
    x += vx * dt;
    y += vy * dt;
    z += vz * dt;

    if (x < minX) {
      x = minX;
      vx = -vx * 0.6;
    } else if (x > maxX) {
      x = maxX;
      vx = -vx * 0.6;
    }
    if (Math.abs(x) >= 800.0 || z >= 600.0) {
      if (y < minY) {
        y = minY;
        vy = -vy * 0.6;
      } else if (y > maxY) {
        y = maxY;
        vy = -vy * 0.6;
      }
    }
    if (z < minZ) {
      z = minZ;
      vz = Math.abs(vz) < 25.0 ? 0.0 : -vz * 0.6;
    } else if (z > maxZ) {
      z = maxZ;
      vz = -vz * 0.6;
    }

    const dst = t * 6;
    sBallPredBuffer[dst + 0] = x;
    sBallPredBuffer[dst + 1] = y;
    sBallPredBuffer[dst + 2] = z;
    sBallPredBuffer[dst + 3] = vx;
    sBallPredBuffer[dst + 4] = vy;
    sBallPredBuffer[dst + 5] = vz;
  }

  return sBallPredBuffer;
}

export function getCarPhys(cv: CarStateView, inv: boolean, mirrorX = false): CarPhysSnapshot {
  const s = inv ? -1.0 : 1.0;
  const mx = mirrorX ? -1.0 : 1.0;

  const isOnGround = cv.isOnGround;
  const hasFlipOrJump = cv.hasFlipOrJump;
  const isDemoed = cv.isDemoed;
  const isJumping = cv.isJumping;
  const isFlipping = cv.isFlipping;
  const airTimeSinceJump = cv.airTimeSinceJump;
  const hasJumped =
    !isOnGround && (isJumping || isFlipping || airTimeSinceJump > 0.0001 || !hasFlipOrJump);
  const hasFlipReset = !isOnGround && hasFlipOrJump && !hasJumped;

  return {
    posX: cv.posX * s * mx,
    posY: cv.posY * s,
    posZ: cv.posZ,
    velX: cv.velX * s * mx,
    velY: cv.velY * s,
    velZ: cv.velZ,
    angVelX: cv.angVelX * s,
    angVelY: cv.angVelY * s * mx,
    angVelZ: cv.angVelZ * mx,
    fwdX: cv.fwdX * s * mx,
    fwdY: cv.fwdY * s,
    fwdZ: cv.fwdZ,
    rightX: cv.rightX * s,
    rightY: cv.rightY * s * mx,
    rightZ: cv.rightZ * mx,
    upX: cv.upX * s * mx,
    upY: cv.upY * s,
    upZ: cv.upZ,
    boost: cv.boost,
    isOnGround,
    hasFlipOrJump,
    hasFlipReset,
    isDemoed,
    hasJumped,
    isSupersonic: cv.isSupersonic,
    demoRespawnTimer: cv.demoRespawnTimer,
    airTimeSinceJump,
  };
}

export function getBallPhys(bv: BallStateView, inv: boolean, mirrorX = false): BallPhysSnapshot {
  const s = inv ? -1.0 : 1.0;
  const mx = mirrorX ? -1.0 : 1.0;
  return {
    posX: bv.posX * s * mx,
    posY: bv.posY * s,
    posZ: bv.posZ,
    velX: bv.velX * s * mx,
    velY: bv.velY * s,
    velZ: bv.velZ,
    angVelX: bv.angVelX * s,
    angVelY: bv.angVelY * s * mx,
    angVelZ: bv.angVelZ * mx,
  };
}

export function rotDot(
  phys: CarPhysSnapshot,
  vx: number,
  vy: number,
  vz: number
): [number, number, number] {
  return [
    phys.fwdX * vx + phys.fwdY * vy + phys.fwdZ * vz,
    phys.rightX * vx + phys.rightY * vy + phys.rightZ * vz,
    phys.upX * vx + phys.upY * vy + phys.upZ * vz,
  ];
}

export function collectTeammatesAndOpponents(
  simState: Float32Array,
  selfCarIndex: number,
  normSelfTeam: number,
  activeCars: ActiveCarSlot[] | null,
  maxTeammates: number,
  maxOpponents: number
): {
  teammates: SortedCarCandidate[];
  opponents: SortedCarCandidate[];
  roster: ActiveCarSlot[];
} {
  const roster = resolveActiveCars(simState, activeCars ?? undefined) as ActiveCarSlot[];
  sBallView.attach(simState);
  const bx = sBallView.posX;
  const by = sBallView.posY;
  const bz = sBallView.posZ;

  const teammates: SortedCarCandidate[] = [];
  const opponents: SortedCarCandidate[] = [];

  for (let i = 0; i < roster.length; i++) {
    const entry = roster[i];
    if (entry.carIndex === selfCarIndex) continue;
    const cv = (sCarViews[entry.carIndex] || new CarStateView()).attachCar(
      simState,
      entry.carIndex
    );
    const dx = cv.posX - bx;
    const dy = cv.posY - by;
    const dz = cv.posZ - bz;
    const distSq = dx * dx + dy * dy + dz * dz;
    const item: SortedCarCandidate = {
      carIndex: entry.carIndex,
      team: entry.team === 1 ? 1 : 0,
      distSq,
      cv,
    };
    if (item.team === normSelfTeam) {
      teammates.push(item);
    } else {
      opponents.push(item);
    }
  }

  const cmp = (a: SortedCarCandidate, b: SortedCarCandidate) =>
    a.distSq !== b.distSq ? a.distSq - b.distSq : a.carIndex - b.carIndex;
  teammates.sort(cmp);
  opponents.sort(cmp);

  if (teammates.length > maxTeammates) teammates.length = maxTeammates;
  if (opponents.length > maxOpponents) opponents.length = maxOpponents;

  return { teammates, opponents, roster };
}
