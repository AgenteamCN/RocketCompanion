/**
 * botpack9700488Specs.ts
 * Architecture specifications, policy metadata registry, canonical boost pad coordinates,
 * and WASM pad index mappings for the 8 RLBot Botpack#9700488 policies (Chronos v2.1, Dice,
 * Ducky, Fury, Galactus v2, Kira, Rain 3v3, and Ripple v1.1) plus Nexto/Necto/Heuristic.
 */

import { EXPERIMENTAL_MODEL_URLS } from './SafeTensorsLoader.ts';

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

export const EXPERIMENTAL_BOT_POLICIES: ReadonlyArray<Readonly<ExperimentalBotPolicyMeta>> =
  Object.freeze([
    {
      id: 'nexto',
      name: 'Nexto (Native SafeTensors)',
      shortName: 'Nexto',
      rank: 'Grand Champion',
      modelUrl: EXPERIMENTAL_MODEL_URLS.nexto,
      tickSkip: 8,
      maxPlayers: 3,
      showcaseFormat: '3v3',
      category: 'legacy',
      scriptedKickoff: true,
    },
    {
      id: 'necto',
      name: 'Necto (Native SafeTensors)',
      shortName: 'Necto',
      rank: 'Diamond',
      modelUrl: EXPERIMENTAL_MODEL_URLS.necto,
      tickSkip: 8,
      maxPlayers: 3,
      showcaseFormat: '3v3',
      category: 'legacy',
      scriptedKickoff: false,
    },
    {
      id: 'heuristic',
      name: 'Tactical Heuristic (Multi-Role)',
      shortName: 'Heuristic',
      rank: 'All-Star',
      modelUrl: null,
      tickSkip: 4,
      maxPlayers: 3,
      showcaseFormat: '3v3',
      category: 'legacy',
      scriptedKickoff: false,
    },
    {
      id: 'chronos',
      name: 'Chronos v2.1 (Botpack #9700488)',
      shortName: 'Chronos v2.1',
      rank: 'SSL (3v3)',
      modelUrl: EXPERIMENTAL_MODEL_URLS.chronos,
      tickSkip: 8,
      maxPlayers: 3,
      showcaseFormat: '3v3',
      category: 'botpack_9700488',
      scriptedKickoff: false,
    },
    {
      id: 'dice',
      name: 'Dice (Botpack #9700488)',
      shortName: 'Dice',
      rank: 'GC (2v2)',
      modelUrl: EXPERIMENTAL_MODEL_URLS.dice,
      tickSkip: 8,
      maxPlayers: 2,
      showcaseFormat: '2v2',
      category: 'botpack_9700488',
      scriptedKickoff: false,
    },
    {
      id: 'ducky',
      name: 'Ducky (Botpack #9700488)',
      shortName: 'Ducky',
      rank: 'GC (3v3)',
      modelUrl: EXPERIMENTAL_MODEL_URLS.ducky,
      tickSkip: 8,
      maxPlayers: 3,
      showcaseFormat: '3v3',
      category: 'botpack_9700488',
      scriptedKickoff: false,
    },
    {
      id: 'fury',
      name: 'Fury (Botpack #9700488)',
      shortName: 'Fury',
      rank: 'SSL (3v3)',
      modelUrl: EXPERIMENTAL_MODEL_URLS.fury,
      tickSkip: 8,
      maxPlayers: 3,
      showcaseFormat: '3v3',
      category: 'botpack_9700488',
      scriptedKickoff: false,
    },
    {
      id: 'galactus',
      name: 'Galactus v2 (Botpack #9700488)',
      shortName: 'Galactus v2',
      rank: 'GC (3v3)',
      modelUrl: EXPERIMENTAL_MODEL_URLS.galactus,
      tickSkip: 8,
      maxPlayers: 3,
      showcaseFormat: '3v3',
      category: 'botpack_9700488',
      scriptedKickoff: false,
    },
    {
      id: 'kira',
      name: 'Kira (Botpack #9700488)',
      shortName: 'Kira',
      rank: 'SSL Duel (1v1)',
      modelUrl: EXPERIMENTAL_MODEL_URLS.kira,
      tickSkip: 8,
      maxPlayers: 1,
      showcaseFormat: '1v1',
      category: 'botpack_9700488',
      scriptedKickoff: false,
    },
    {
      id: 'rain',
      name: 'Rain (Botpack #9700488)',
      shortName: 'Rain',
      rank: 'SSL (3v3)',
      modelUrl: EXPERIMENTAL_MODEL_URLS.rain,
      tickSkip: 6,
      maxPlayers: 3,
      showcaseFormat: '3v3',
      category: 'botpack_9700488',
      scriptedKickoff: false,
    },
    {
      id: 'ripple_v1_1',
      name: 'Ripple v1.1 (Botpack #9700488)',
      shortName: 'Ripple v1.1',
      rank: 'SSL Human-Pretrained (3v3)',
      modelUrl: EXPERIMENTAL_MODEL_URLS.ripple_v1_1,
      tickSkip: 4,
      maxPlayers: 3,
      showcaseFormat: '3v3',
      category: 'botpack_9700488',
      scriptedKickoff: false,
    },
  ]);

export const BOTPACK_9700488_POLICIES: ReadonlyArray<Readonly<ExperimentalBotPolicyMeta>> =
  Object.freeze(EXPERIMENTAL_BOT_POLICIES.filter((p) => p.category === 'botpack_9700488'));

export function getExperimentalBotPolicyMeta(
  botType: string
): Readonly<ExperimentalBotPolicyMeta> | null {
  return EXPERIMENTAL_BOT_POLICIES.find((p) => p.id === botType) || null;
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

export const POS_COEF = 1.0 / 5000.0;
export const VEL_COEF = 1.0 / 2300.0;
export const ANG_VEL_COEF = 1.0 / 3.0;

export const FURY_POS_COEF_X = 1.0 / 4096.0;
export const FURY_POS_COEF_Y = 1.0 / 6000.0;
export const FURY_POS_COEF_Z = 1.0 / 2044.0;
export const FURY_VEL_COEF = 1.0 / 2300.0;
export const FURY_ANG_VEL_COEF = 1.0 / 5.5;

export const BLUE_GOAL_BACK: readonly [number, number, number] = [0.0, -6000.0, 321.3875];
export const ORANGE_GOAL_BACK: readonly [number, number, number] = [0.0, 6000.0, 321.3875];
export const BIG_BOOST_PAD_INDICES: readonly number[] = [3, 4, 15, 18, 29, 30];

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

// Mapping from canonical Y-sorted boost pad index (0..33 in CommonValues::BOOST_LOCATIONS)
// to RocketSim WASM pad array index (where big pads are 0..5 and small pads are 6..33).
export const CANONICAL_TO_WASM_PAD_INDEX: readonly number[] = Object.freeze([
  6, 7, 8, 4, 5, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 0, 19, 20, 1, 21, 22, 23, 24, 25, 26, 27,
  28, 29, 30, 2, 3, 31, 32, 33,
]);

// Precomputed X-mirror boost pad index mapping for Chronos v2.1
export const MIRROR_X_PAD_INDEX: Int32Array = (() => {
  const map = new Int32Array(34);
  for (let i = 0; i < 34; i++) {
    const loc = CANONICAL_BOOST_LOCATIONS[i];
    let found = i;
    for (let j = 0; j < 34; j++) {
      const other = CANONICAL_BOOST_LOCATIONS[j];
      if (Math.abs(loc[0] + other[0]) < 3.0 && Math.abs(loc[1] - other[1]) < 3.0) {
        found = j;
        break;
      }
    }
    map[i] = found;
  }
  return map;
})();

export const MLP_BOTPACK_SPECS: Readonly<Record<string, MlpBotpackSpec>> = Object.freeze({
  chronos: {
    obsDim: 225,
    sharedDims: [960, 960],
    policyDims: [960, 800, 640, 640],
    outDim: 90,
    leakyAlpha: 0,
  },
  dice: {
    obsDim: 167,
    sharedDims: [900, 900],
    policyDims: [900, 900, 900],
    outDim: 90,
    leakyAlpha: 0.01,
  },
  ducky: {
    obsDim: 295,
    sharedDims: [],
    policyDims: [512, 512, 512, 256],
    outDim: 90,
    leakyAlpha: 0,
  },
  fury: {
    obsDim: 318,
    sharedDims: [1536, 1536],
    policyDims: [1024, 1024, 1024],
    outDim: 380,
    leakyAlpha: 0,
  },
  galactus: {
    obsDim: 258,
    sharedDims: [1024, 1024],
    policyDims: [1024, 1024, 1024, 1024],
    outDim: 90,
    leakyAlpha: 0.01,
  },
  kira: {
    obsDim: 109,
    sharedDims: [1024, 1024, 1024],
    policyDims: [1024, 1024, 512, 512],
    outDim: 90,
    leakyAlpha: 0,
  },
  rain: {
    obsDim: 231,
    sharedDims: [1280],
    policyDims: [1024, 768, 512, 256],
    outDim: 90,
    leakyAlpha: 0,
  },
});

export const RIPPLE_BOTPACK_SPECS: Readonly<Record<string, RippleBotpackSpec>> = Object.freeze({
  ripple_v1_1: {
    dim: 128,
    numLayers: 4,
    boostDim: 32,
  },
});
