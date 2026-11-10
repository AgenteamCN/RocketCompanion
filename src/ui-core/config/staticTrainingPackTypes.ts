/**
 * StaticTrainingPackTypes.ts
 * Data structures, defaults, and normalization helpers for Static Training Packs.
 */

export type EditSubMode = 'car-heading' | 'car-speed' | 'ball-speed' | 'free-cam';

export const EDIT_SUB_MODES_ORDER: EditSubMode[] = [
  'car-heading',
  'car-speed',
  'ball-speed',
  'free-cam',
];

export const MAX_SHOTS_PER_PACK = 99;

export interface StaticTrainingCarConfig {
  /** World position in RocketSim UU: [x, y, z] */
  location: [number, number, number];
  /** Car nose heading yaw in radians (0 = +X, PI/2 = +Y toward Orange goal) */
  headingYaw: number;
  /** Car nose pitch in radians (-PI/2 .. +PI/2) */
  headingPitch: number;
  /** Car air roll angle in radians (-PI .. +PI) */
  airRoll: number;
  /** Initial linear speed magnitude in UU/s (0 .. 2300) */
  speed: number;
  /** Initial linear velocity yaw in radians (independent of headingYaw when speedFollowsHeading is false) */
  speedYaw: number;
  /** Initial linear velocity pitch in radians (independent of headingPitch when speedFollowsHeading is false) */
  speedPitch: number;
  /**
   * When true (default), car launch speed direction stays aligned with the car's nose
   * (speedYaw = headingYaw, speedPitch = headingPitch), allowing speed adjustment via [ / ]
   * directly inside Car Heading mode and hiding the redundant Car Speed sub-mode icon.
   */
  speedFollowsHeading: boolean;
  /**
   * When true, car is spawned at ground level first and settled for 60 frames
   * so wheel suspension stabilizes before spawning the ball and launching.
   */
  snapToGround: boolean;
  /**
   * Whether the car spawns with an available flip/dodge when airborne.
   * Default: true. When snapToGround is false and hasFlip is false, the car spawns
   * in mid-air without a flip opportunity.
   */
  hasFlip: boolean;
  /** Initial boost reserve (0 .. 100) */
  initialBoost: number;
  /** Unlimited boost flag (default false -> Limit Boost Amount toggle is ON at 100 by default) */
  unlimitedBoost: boolean;
}

import type { StaticTrainingVariationConfig } from './staticTrainingVariationTypes';

export type { StaticTrainingVariationConfig };

export interface StaticTrainingEditorFreeCam {
  /** World position in RocketSim / Unreal UU: [x, y, z] */
  location: [number, number, number];
  /** Pitch in radians (-PI/2 .. +PI/2) */
  pitch: number;
  /** Yaw in radians (0 = +X, PI/2 = +Y toward Orange goal) */
  yaw: number;
  /** Roll in radians */
  roll: number;
  /** True when the camera matches Rocket League's unmoved default editor camera [-600, -700, 530] */
  isDefaultOverview?: boolean;
}

export interface StaticTrainingBallConfig {
  /** World position in RocketSim UU: [x, y, z] */
  location: [number, number, number];
  /** Initial linear speed magnitude in UU/s (0 .. 4000) */
  speed: number;
  /** Initial linear velocity yaw in radians */
  speedYaw: number;
  /** Initial linear velocity pitch in radians */
  speedPitch: number;
  /**
   * Initial cannon/ball roll angle in radians (maps `VelocityStartRotationR` from `.Tem`).
   */
  startRotationRoll?: number;
  /**
   * Kickoff State: when true (activated by pressing '[' again after speed reaches 0),
   * the ball remains completely suspended/stationary even in mid-air until touched by a car.
   */
  kickoffState: boolean;
  /**
   * When true (default), angular velocity is automatically generated from speed magnitude.
   * When false, manual 3-axis angularVelocity [wx, wy, wz] is used.
   */
  randomAngularVelocity: boolean;
  /** 3-axis angular velocity in rad/s [-6 .. +6] */
  angularVelocity: [number, number, number];
}

export interface StaticTrainingShotItem {
  id: string;
  index: number;
  name: string;
  /** Shot timeout in seconds (default: 10, max: 60) */
  timeoutSeconds: number;
  car: StaticTrainingCarConfig;
  ball: StaticTrainingBallConfig;
  /**
   * Optional per-shot Editor Free Camera pose (`EditorFreeCam` from `.Tem` or saved in `.RCSPackE`).
   * Stripped when exporting standard `.RCSPack`, preserved when exporting `.RCSPackE`.
   */
  editorFreeCam?: StaticTrainingEditorFreeCam;
}

export type StaticTrainingPackFormatType = 'RCSPack' | 'RCSPackE' | 'RLRCSPack';

export interface StaticTrainingPackMetadata {
  uuid: string;
  title: string;
  description: string;
  /**
   * Unmapped `.Tem` / `RLRCSPack` raw properties & round extras (visible in Developer Mode).
   */
  originalDescription?: string;
  /** Rocket League 16-char custom training code (e.g. `DEC7-4CAD-1452-30D3`) */
  code?: string;
  /** Original pack creator name (e.g. `Kevpert`, `Psyonix`, `Poquito`) */
  creator?: string;
  /** Structured tags for folder filtering (e.g. `['Kevpert', 'Diamond', 'F7']`) */
  tags?: string[];
  /** Official release year-month for Psyonix / Spotlight packs (e.g. `'2022-09'`) */
  releaseYearMonth?: string;
  /** Competitive rank tier tag (`Bronze` .. `Supersonic Legend`) */
  rankTier?: string;
  /** Pack origin format (`RLRCSPack` for converted `.Tem`, `RCSPack` / `RCSPackE` for native) */
  sourcePackType?: StaticTrainingPackFormatType;
  /** Author/video-recommended BakkesMod training variation parameters */
  recommendedVariation?: StaticTrainingVariationConfig;
  /** True when seeded from the built-in Dev Mode pack catalog */
  isBuiltInDevPack?: boolean;
  createdAt: number;
  updatedAt: number;
  itemCount: number;
}

export interface RCSPackArchive {
  format: 'RCSPack' | 'RCSPackE' | 'RLRCSPack';
  version: 1 | 2;
  category: 'static-training-pack';
  metadata: StaticTrainingPackMetadata;
  items: StaticTrainingShotItem[];
}

export function generateUUID(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

export function createDefaultShotItem(index = 0): StaticTrainingShotItem {
  return {
    id: generateUUID(),
    index,
    name: `Shot ${index + 1}`,
    timeoutSeconds: 10,
    car: {
      location: [0, -2400, 17.05],
      headingYaw: Math.PI / 2,
      headingPitch: 0,
      airRoll: 0,
      speed: 0,
      speedYaw: Math.PI / 2,
      speedPitch: 0,
      speedFollowsHeading: true,
      snapToGround: true,
      hasFlip: true,
      initialBoost: 100,
      unlimitedBoost: false,
    },
    ball: {
      location: [0, 600, 320],
      speed: 1150,
      speedYaw: Math.PI / 2,
      speedPitch: 0.32,
      startRotationRoll: 0,
      kickoffState: false,
      randomAngularVelocity: true,
      angularVelocity: [0, 2.4, 0.8],
    },
  };
}

export type RawShotCarInput = Partial<StaticTrainingCarConfig> & {
  pos?: [number, number, number] | number[];
};

export type RawShotBallInput = Partial<StaticTrainingBallConfig> & {
  pos?: [number, number, number] | number[];
};

export function cloneShotItem(
  item: Partial<Omit<StaticTrainingShotItem, 'car' | 'ball' | 'editorFreeCam'>> & {
    car?: RawShotCarInput | null;
    ball?: RawShotBallInput | null;
    editorFreeCam?: Partial<StaticTrainingEditorFreeCam> | null;
  },
  newIndex?: number
): StaticTrainingShotItem {
  const idx = typeof newIndex === 'number' ? newIndex : (item?.index ?? 0);
  const rawCar = item?.car || {};
  const rawBall = item?.ball || {};
  const carLoc = Array.isArray(rawCar.location)
    ? rawCar.location
    : Array.isArray(rawCar.pos)
    ? rawCar.pos
    : [0, -2400, 17.05];
  const ballLoc = Array.isArray(rawBall.location)
    ? rawBall.location
    : Array.isArray(rawBall.pos)
    ? rawBall.pos
    : [0, 0, 93.15];

  const headingYaw = Number(rawCar.headingYaw ?? Math.PI / 2);
  const headingPitch = Number(rawCar.headingPitch ?? 0);
  const snapToGround = Boolean(rawCar.snapToGround ?? true);
  const speedFollowsHeading =
    rawCar.speedFollowsHeading !== undefined ? Boolean(rawCar.speedFollowsHeading) : true;

  const rawCam = item?.editorFreeCam;
  const editorFreeCam: StaticTrainingEditorFreeCam | undefined =
    rawCam && typeof rawCam === 'object' && Array.isArray(rawCam.location)
      ? {
          location: [
            Number(rawCam.location[0]) || 0,
            Number(rawCam.location[1]) || 0,
            Number(rawCam.location[2]) || 0,
          ],
          pitch: Number(rawCam.pitch) || 0,
          yaw: Number(rawCam.yaw) || 0,
          roll: Number(rawCam.roll) || 0,
          ...(rawCam.isDefaultOverview !== undefined
            ? { isDefaultOverview: Boolean(rawCam.isDefaultOverview) }
            : {}),
        }
      : undefined;

  return {
    id: typeof item?.id === 'string' && item.id ? item.id : generateUUID(),
    index: idx,
    name: item?.name || `Shot ${idx + 1}`,
    timeoutSeconds: Number.isFinite(item?.timeoutSeconds)
      ? Math.max(1, Math.min(60, Number(item.timeoutSeconds)))
      : 10,
    car: {
      location: [
        Number.isFinite(Number(carLoc[0])) ? Number(carLoc[0]) : 0,
        Number.isFinite(Number(carLoc[1])) ? Number(carLoc[1]) : -2400,
        Number.isFinite(Number(carLoc[2])) ? Number(carLoc[2]) : 17.05,
      ],
      headingYaw,
      headingPitch,
      airRoll: Number(rawCar.airRoll ?? 0),
      speed: Math.max(0, Math.min(2300, Number(rawCar.speed) || 0)),
      speedYaw: speedFollowsHeading
        ? headingYaw
        : Number(rawCar.speedYaw ?? headingYaw),
      speedPitch: speedFollowsHeading
        ? snapToGround
          ? 0
          : headingPitch
        : Number(rawCar.speedPitch ?? headingPitch),
      speedFollowsHeading,
      snapToGround,
      hasFlip: rawCar.hasFlip !== undefined ? Boolean(rawCar.hasFlip) : true,
      initialBoost: Math.max(0, Math.min(100, Number(rawCar.initialBoost ?? 100))),
      unlimitedBoost:
        rawCar.unlimitedBoost !== undefined ? Boolean(rawCar.unlimitedBoost) : false,
    },
    ball: {
      location: [
        Number.isFinite(Number(ballLoc[0])) ? Number(ballLoc[0]) : 0,
        Number.isFinite(Number(ballLoc[1])) ? Number(ballLoc[1]) : 0,
        Math.max(
          93.15,
          Number.isFinite(Number(ballLoc[2])) ? Number(ballLoc[2]) : 93.15
        ),
      ],
      speed: Math.max(0, Math.min(4000, Number(rawBall.speed) || 0)),
      speedYaw: Number(rawBall.speedYaw ?? Math.PI / 2),
      speedPitch: Number(rawBall.speedPitch ?? 0),
      ...(rawBall.startRotationRoll !== undefined && Number(rawBall.startRotationRoll) !== 0
        ? { startRotationRoll: Number(rawBall.startRotationRoll) }
        : {}),
      kickoffState: Boolean(rawBall.kickoffState ?? false),
      randomAngularVelocity: Boolean(rawBall.randomAngularVelocity ?? true),
      angularVelocity: [
        Math.max(-6, Math.min(6, Number(rawBall.angularVelocity?.[0]) || 0)),
        Math.max(-6, Math.min(6, Number(rawBall.angularVelocity?.[1]) || 0)),
        Math.max(-6, Math.min(6, Number(rawBall.angularVelocity?.[2]) || 0)),
      ],
    },
    ...(editorFreeCam ? { editorFreeCam } : {}),
  };
}

export function areShotItemsEqual(
  a: StaticTrainingShotItem | null | undefined,
  b: StaticTrainingShotItem | null | undefined
): boolean {
  if (!a || !b) return a === b;
  const eps = 1e-4;
  const eqNum = (x: number, y: number) => Math.abs((x || 0) - (y || 0)) < eps;
  if (a.name !== b.name) return false;
  if (!eqNum(a.timeoutSeconds, b.timeoutSeconds)) return false;

  const ca = a.car;
  const cb = b.car;
  if (
    !eqNum(ca.location[0], cb.location[0]) ||
    !eqNum(ca.location[1], cb.location[1]) ||
    !eqNum(ca.location[2], cb.location[2]) ||
    !eqNum(ca.headingYaw, cb.headingYaw) ||
    !eqNum(ca.headingPitch, cb.headingPitch) ||
    !eqNum(ca.airRoll, cb.airRoll) ||
    !eqNum(ca.speed, cb.speed) ||
    !eqNum(ca.speedYaw, cb.speedYaw) ||
    !eqNum(ca.speedPitch, cb.speedPitch) ||
    Boolean(ca.speedFollowsHeading ?? true) !== Boolean(cb.speedFollowsHeading ?? true) ||
    Boolean(ca.snapToGround) !== Boolean(cb.snapToGround) ||
    Boolean(ca.hasFlip ?? true) !== Boolean(cb.hasFlip ?? true) ||
    !eqNum(ca.initialBoost, cb.initialBoost) ||
    Boolean(ca.unlimitedBoost) !== Boolean(cb.unlimitedBoost)
  ) {
    return false;
  }

  const ba = a.ball;
  const bb = b.ball;
  if (
    !eqNum(ba.location[0], bb.location[0]) ||
    !eqNum(ba.location[1], bb.location[1]) ||
    !eqNum(ba.location[2], bb.location[2]) ||
    !eqNum(ba.speed, bb.speed) ||
    !eqNum(ba.speedYaw, bb.speedYaw) ||
    !eqNum(ba.speedPitch, bb.speedPitch) ||
    !eqNum(ba.startRotationRoll ?? 0, bb.startRotationRoll ?? 0) ||
    Boolean(ba.kickoffState) !== Boolean(bb.kickoffState) ||
    Boolean(ba.randomAngularVelocity) !== Boolean(bb.randomAngularVelocity) ||
    !eqNum(ba.angularVelocity[0], bb.angularVelocity[0]) ||
    !eqNum(ba.angularVelocity[1], bb.angularVelocity[1]) ||
    !eqNum(ba.angularVelocity[2], bb.angularVelocity[2])
  ) {
    return false;
  }

  const camA = a.editorFreeCam;
  const camB = b.editorFreeCam;
  if (Boolean(camA) !== Boolean(camB)) return false;
  if (camA && camB) {
    if (
      !eqNum(camA.location[0], camB.location[0]) ||
      !eqNum(camA.location[1], camB.location[1]) ||
      !eqNum(camA.location[2], camB.location[2]) ||
      !eqNum(camA.pitch, camB.pitch) ||
      !eqNum(camA.yaw, camB.yaw) ||
      !eqNum(camA.roll, camB.roll)
    ) {
      return false;
    }
  }

  return true;
}

export function areShotListsEqual(
  a: StaticTrainingShotItem[],
  b: StaticTrainingShotItem[]
): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i].id !== b[i].id || !areShotItemsEqual(a[i], b[i])) {
      return false;
    }
  }
  return true;
}

export function createStarterShots(uuid = 'starter-aerial-striker-pack'): StaticTrainingShotItem[] {
  return [
    {
      id: `${uuid}-shot-0`,
      index: 0,
      name: 'Midfield Lob Volley',
      timeoutSeconds: 10,
      car: {
        location: [0, -2400, 17.05],
        headingYaw: Math.PI / 2,
        headingPitch: 0,
        airRoll: 0,
        speed: 650,
        speedYaw: Math.PI / 2,
        speedPitch: 0,
        speedFollowsHeading: true,
        snapToGround: true,
        hasFlip: true,
        initialBoost: 100,
        unlimitedBoost: true,
      },
      ball: {
        location: [0, 300, 260],
        speed: 1180,
        speedYaw: Math.PI / 2,
        speedPitch: 0.36,
        kickoffState: false,
        randomAngularVelocity: true,
        angularVelocity: [0, 2.5, 0.6],
      },
    },
    {
      id: `${uuid}-shot-1`,
      index: 1,
      name: 'High Floating Kickoff-State Aerial',
      timeoutSeconds: 10,
      car: {
        location: [-1100, -1800, 17.05],
        headingYaw: 1.18,
        headingPitch: 0,
        airRoll: 0,
        speed: 0,
        speedYaw: 1.18,
        speedPitch: 0,
        speedFollowsHeading: true,
        snapToGround: true,
        hasFlip: true,
        initialBoost: 100,
        unlimitedBoost: true,
      },
      ball: {
        location: [0, 2900, 820],
        speed: 0,
        speedYaw: Math.PI / 2,
        speedPitch: 0,
        kickoffState: true,
        randomAngularVelocity: true,
        angularVelocity: [0, 0, 1.8],
      },
    },
    {
      id: `${uuid}-shot-2`,
      index: 2,
      name: 'Backboard Read Cross',
      timeoutSeconds: 10,
      car: {
        location: [850, -1200, 17.05],
        headingYaw: 1.72,
        headingPitch: 0,
        airRoll: 0,
        speed: 900,
        speedYaw: 1.72,
        speedPitch: 0,
        speedFollowsHeading: true,
        snapToGround: true,
        hasFlip: true,
        initialBoost: 100,
        unlimitedBoost: true,
      },
      ball: {
        location: [-1400, 1500, 240],
        speed: 1950,
        speedYaw: 1.24,
        speedPitch: 0.28,
        kickoffState: false,
        randomAngularVelocity: true,
        angularVelocity: [1.5, 2.2, -1.0],
      },
    },
  ];
}
