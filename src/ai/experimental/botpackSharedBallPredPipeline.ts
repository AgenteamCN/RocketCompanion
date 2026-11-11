/**
 * botpackSharedBallPredPipeline.ts
 * Shared 600-tick (5.0s @ 120Hz) ball prediction trajectory cache, policy metadata registry,
 * canonical boost pad coordinates, and Ripple action lookup table.
 */

import {
  ArenaHeaderView,
  CarStateView,
  BallStateView,
  BoostPadStateView,
} from '../../physics/RocketSimStateViews.ts';
import { decodeCarControls, type CarControls } from './experimentalMultiCarObsPipeline.ts';

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

export interface SafeTensorEntry {
  shape: number[];
  dtype: string;
  data: Float32Array | Int32Array;
}

export interface ParsedSafeTensorsModel {
  metadata: Record<string, unknown>;
  tensors: Record<string, SafeTensorEntry>;
}

export interface MlpBotpackSpec {
  readonly obsDim: number;
  readonly sharedDims: readonly number[];
  readonly policyDims: readonly number[];
  readonly outDim: number;
  readonly leakyAlpha: number;
}

export interface RippleBotpackSpec {
  readonly dim: number;
  readonly numLayers: number;
  readonly boostDim: number;
}

export interface ExperimentalBotPolicyMeta {
  id: string;
  name: string;
  shortName: string;
  rank: string;
  modelUrl: string | null;
  tickSkip: number;
  maxPlayers: number;
  showcaseFormat: string;
  category: string;
  scriptedKickoff: boolean;
}

export const EXPERIMENTAL_MODEL_URLS: Readonly<Record<string, string>> = Object.freeze({
  necto: '/assets/models/experimental/necto_policy.safetensors',
  nexto: '/assets/models/experimental/nexto_policy.safetensors',
  ko_v2: '/assets/models/experimental/kickoff_v2_policy.safetensors',
  ko_v1: '/assets/models/experimental/kickoff_v1_policy.safetensors',
  chronos: '/assets/models/experimental/botpack_9700488/chronos_policy.safetensors',
  dice: '/assets/models/experimental/botpack_9700488/dice_policy.safetensors',
  ducky: '/assets/models/experimental/botpack_9700488/ducky_policy.safetensors',
  fury: '/assets/models/experimental/botpack_9700488/fury_policy.safetensors',
  galactus: '/assets/models/experimental/botpack_9700488/galactus_policy.safetensors',
  kira: '/assets/models/experimental/botpack_9700488/kira_policy.safetensors',
  rain: '/assets/models/experimental/botpack_9700488/rain_3v3_policy.safetensors',
  ripple_v1_1: '/assets/models/experimental/botpack_9700488/ripple_v1_1_policy.safetensors',
});

export const BOT_POLICY_ID_MAP: Readonly<Record<string, number>> = Object.freeze({
  heuristic: 0,
  nexto: 1,
  necto: 2,
  ko_v1: 3,
  ko_v2: 4,
  chronos: 5,
  dice: 6,
  ducky: 7,
  fury: 8,
  galactus: 9,
  kira: 10,
  rain: 11,
  ripple_v1_1: 12,
});

const mkPolicy = (
  id: string,
  name: string,
  shortName: string,
  rank: string,
  tickSkip: number,
  maxPlayers: number,
  showcaseFormat: string,
  category = 'botpack_9700488',
  scriptedKickoff = false
): Readonly<ExperimentalBotPolicyMeta> =>
  Object.freeze({
    id,
    name,
    shortName,
    rank,
    modelUrl: EXPERIMENTAL_MODEL_URLS[id] || null,
    tickSkip,
    maxPlayers,
    showcaseFormat,
    category,
    scriptedKickoff,
  });

export const EXPERIMENTAL_BOT_POLICIES: ReadonlyArray<Readonly<ExperimentalBotPolicyMeta>> =
  Object.freeze([
    mkPolicy(
      'nexto',
      'Nexto (Native SafeTensors)',
      'Nexto',
      'Grand Champion',
      8,
      3,
      '3v3',
      'legacy',
      true
    ),
    mkPolicy('necto', 'Necto (Native SafeTensors)', 'Necto', 'Diamond', 8, 3, '3v3', 'legacy'),
    mkPolicy(
      'heuristic',
      'Tactical Heuristic (Multi-Role)',
      'Heuristic',
      'All-Star',
      4,
      3,
      '3v3',
      'legacy'
    ),
    mkPolicy(
      'chronos',
      'Chronos v2.1 (Botpack #9700488)',
      'Chronos v2.1',
      'SSL (3v3)',
      8,
      3,
      '3v3'
    ),
    mkPolicy('dice', 'Dice (Botpack #9700488)', 'Dice', 'GC (2v2)', 8, 2, '2v2'),
    mkPolicy('ducky', 'Ducky (Botpack #9700488)', 'Ducky', 'GC (3v3)', 8, 3, '3v3'),
    mkPolicy('fury', 'Fury (Botpack #9700488)', 'Fury', 'SSL (3v3)', 8, 3, '3v3'),
    mkPolicy('galactus', 'Galactus v2 (Botpack #9700488)', 'Galactus v2', 'GC (3v3)', 8, 3, '3v3'),
    mkPolicy('kira', 'Kira (Botpack #9700488)', 'Kira', 'SSL Duel (1v1)', 8, 1, '1v1'),
    mkPolicy('rain', 'Rain (Botpack #9700488)', 'Rain', 'SSL (3v3)', 6, 3, '3v3'),
    mkPolicy(
      'ripple_v1_1',
      'Ripple v1.1 (Botpack #9700488)',
      'Ripple v1.1',
      'SSL Human-Pretrained (3v3)',
      4,
      3,
      '3v3'
    ),
  ]);

export const BOTPACK_9700488_POLICIES: ReadonlyArray<Readonly<ExperimentalBotPolicyMeta>> =
  Object.freeze(EXPERIMENTAL_BOT_POLICIES.filter((p) => p.category === 'botpack_9700488'));

export function getExperimentalBotPolicyMeta(
  botType: string
): Readonly<ExperimentalBotPolicyMeta> | null {
  return EXPERIMENTAL_BOT_POLICIES.find((p) => p.id === botType) || null;
}

export const RIPPLE_BOTPACK_SPECS: Readonly<Record<string, RippleBotpackSpec>> = Object.freeze({
  ripple_v1_1: { dim: 320, numLayers: 2, boostDim: 16 },
});

export const CANONICAL_BOOST_LOCATIONS: ReadonlyArray<readonly [number, number, number]> =
  Object.freeze([
    [0.0, -4240.0, 70.0],
    [-1792.0, -4184.0, 70.0],
    [1792.0, -4184.0, 70.0],
    [-3072.0, -4096.0, 73.0],
    [3072.0, -4096.0, 73.0],
    [-940.0, -3308.0, 70.0],
    [940.0, -3308.0, 70.0],
    [0.0, -2816.0, 70.0],
    [-3584.0, -2484.0, 70.0],
    [3584.0, -2484.0, 70.0],
    [-1788.0, -2300.0, 70.0],
    [1788.0, -2300.0, 70.0],
    [-2048.0, -1036.0, 70.0],
    [0.0, -1024.0, 70.0],
    [2048.0, -1036.0, 70.0],
    [-3584.0, 0.0, 73.0],
    [-1024.0, 0.0, 70.0],
    [1024.0, 0.0, 70.0],
    [3584.0, 0.0, 73.0],
    [-2048.0, 1036.0, 70.0],
    [0.0, 1024.0, 70.0],
    [2048.0, 1036.0, 70.0],
    [-1788.0, 2300.0, 70.0],
    [1788.0, 2300.0, 70.0],
    [-3584.0, 2484.0, 70.0],
    [3584.0, 2484.0, 70.0],
    [0.0, 2816.0, 70.0],
    [-940.0, 3310.0, 70.0],
    [940.0, 3308.0, 70.0],
    [-3072.0, 4096.0, 73.0],
    [3072.0, 4096.0, 73.0],
    [-1792.0, 4184.0, 70.0],
    [1792.0, 4184.0, 70.0],
    [0.0, 4240.0, 70.0],
  ]);

export const CANONICAL_TO_WASM_PAD_INDEX: readonly number[] = Object.freeze([
  6, 7, 8, 4, 5, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 0, 19, 20, 1, 21, 22, 23, 24, 25, 26, 27,
  28, 29, 30, 2, 3, 31, 32, 33,
]);

export const RIPPLE_276_ACTIONS: ReadonlyArray<Readonly<CarControls>> = (() => {
  const actions: CarControls[] = [];
  for (const thr of [-1, 0, 1]) {
    for (const str of [-1, -0.5, 0, 0.5, 1]) {
      for (const boost of [0, 1]) {
        for (const hb of [0, 1]) {
          if (boost === 1 && thr !== 1) continue;
          actions.push(decodeCarControls([thr || boost, str, 0, str, 0, 0, boost, hb]));
        }
      }
    }
  }
  for (const pitch of [-1, 0, 1]) {
    for (const yaw of [-1, 0, 1]) {
      for (const roll of [-1, 0, 1]) {
        for (const jump of [0, 1]) {
          for (const boost of [0, 1]) {
            for (const hb of [0, 1]) {
              if (jump === 1 && hb === 1) continue;
              if (pitch === 0 && yaw === 0 && roll === 0 && jump === 0 && hb === 1) continue;
              if (jump === 0 && boost === 0 && hb === 0) continue;
              const actualHb = jump === 1 && (pitch !== 0 || yaw !== 0 || roll !== 0) ? 1 : hb;
              actions.push(
                decodeCarControls([boost, yaw, pitch, yaw, roll, jump, boost, actualHb])
              );
            }
          }
        }
      }
    }
  }
  return Object.freeze(actions.map((a) => Object.freeze(a)));
})();

export const sHeaderView = new ArenaHeaderView();
export const sBallView = new BallStateView();
export const sPadView = new BoostPadStateView();
export const sCarViews: CarStateView[] = Array.from({ length: 8 }, () => new CarStateView());

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
      const copyCount = Math.min(reqTicks + 1, availableSlices);
      for (let i = 0; i < copyCount; i++) {
        const src = i * stride;
        const dst = i * 6;
        sBallPredBuffer[dst + 0] = raw[src + 0];
        sBallPredBuffer[dst + 1] = raw[src + 1];
        sBallPredBuffer[dst + 2] = raw[src + 2];
        sBallPredBuffer[dst + 3] = raw[src + 3];
        sBallPredBuffer[dst + 4] = raw[src + 4];
        sBallPredBuffer[dst + 5] = raw[src + 5];
      }
      const lastOff = Math.max(0, copyCount - 1) * 6;
      for (let t = copyCount; t <= reqTicks; t++) {
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
