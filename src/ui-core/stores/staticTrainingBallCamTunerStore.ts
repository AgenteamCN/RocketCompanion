import { create } from 'zustand';
import {
  STORAGE_KEYS,
  readStorageJson,
  writeStorageJson,
} from '../config/storageHelpers';

export interface StaticTrainingBallCamTunerConfig {
  /** Horizontal camera FOV in degrees during Static Training Edit Mode (default 110) */
  fov: number;
  /** Camera distance behind the ball along the velocity direction (UU) */
  distance: number;
  /** Vertical elevation offset relative to the ball center perpendicular to aim (UU) */
  height: number;
  /** Camera pitch offset angle relative to ball velocity pitch (degrees; negative looks downward over the ball) */
  angle: number;
  /** Horizontal lateral offset perpendicular to the velocity direction (UU; negative = left, positive = right) */
  lateralOffset: number;
  /** Temporary override opacity for the ball while in Edit Mode (default 0.7) */
  editBallOpacity: number;
  /** Whether the temporary Edit Mode ball opacity override is active (reverts to Global when testing [G] or playing) */
  enableEditOpacityOverride: boolean;
  /** Ball opacity when the 0-second timeout expires and the ball hits the ground (default 0.7) */
  expiredBallOpacity: number;

  // --- 3D Car Direction & Speed Arrow Visual Parameters ---
  /** Semi-transparent opacity of the 3D direction/speed arrow body & cone (0.1 .. 1.0, default 0.78) */
  arrowOpacity: number;
  /** Opacity of the dark silhouette shadow / outline around the arrow for high contrast (0.0 .. 1.0, default 0.52) */
  shadowOpacity: number;
  /** Scale multiplier of the dark silhouette shadow shell relative to the arrow (1.02 .. 1.6, default 1.18) */
  shadowScale: number;
  /** Radial shadow halo backdrop size behind the arrow (UU, 0 = off, default 95) */
  haloScale: number;
  /** Cone base radius of the arrow head (UU, default 20) */
  coneRadius: number;
  /** Cone length of the arrow head (UU, default 58) */
  coneLength: number;
  /** Rounded tip radius of the arrow cone (UU, 0 = sharp point, default 2.5) */
  tipRadius: number;
  /** Cylinder shaft radius of the arrow stem (UU, default 7.0) */
  shaftRadius: number;
  /** Base length of the arrow shaft at 0 speed (UU, default 155) */
  arrowBaseLength: number;
  /** Maximum additional shaft length at 2300 UU/s max speed (UU, default 300) */
  arrowMaxExtraLength: number;
  /** Vertical height offset of the arrow above the car center (UU, default 32) */
  arrowHeightOffset: number;
  /** Forward offset of the arrow along its pointing direction from the car center (UU, default 18) */
  arrowForwardOffset: number;
}

export const DEFAULT_STATIC_TRAINING_BALL_CAM_CONFIG: StaticTrainingBallCamTunerConfig = {
  fov: 110,
  distance: 330,
  height: 400,
  angle: -45,
  lateralOffset: 150,
  editBallOpacity: 0.7,
  enableEditOpacityOverride: true,
  expiredBallOpacity: 0.7,
  arrowOpacity: 0.78,
  shadowOpacity: 0.52,
  shadowScale: 1.18,
  haloScale: 95,
  coneRadius: 20,
  coneLength: 58,
  tipRadius: 2.5,
  shaftRadius: 7.0,
  arrowBaseLength: 155,
  arrowMaxExtraLength: 300,
  arrowHeightOffset: 32,
  arrowForwardOffset: 18,
};

export const DEFAULT_STATIC_TRAINING_BALL_CAM_TUNER_CONFIG =
  DEFAULT_STATIC_TRAINING_BALL_CAM_CONFIG;

const STORAGE_KEY = STORAGE_KEYS.STATIC_TRAINING_BALL_CAM_TUNER;

function numOrDefault(val: unknown, fallback: number): number {
  return typeof val === 'number' && Number.isFinite(val) ? val : fallback;
}

function loadInitialConfig(): StaticTrainingBallCamTunerConfig {
  const parsed = readStorageJson<Partial<StaticTrainingBallCamTunerConfig>>(
    STORAGE_KEY,
    DEFAULT_STATIC_TRAINING_BALL_CAM_CONFIG
  );
  const d = DEFAULT_STATIC_TRAINING_BALL_CAM_CONFIG;
  return {
    fov: numOrDefault(parsed.fov, d.fov),
    distance: numOrDefault(parsed.distance, d.distance),
    height: numOrDefault(parsed.height, d.height),
    angle: numOrDefault(parsed.angle, d.angle),
    lateralOffset: numOrDefault(parsed.lateralOffset, d.lateralOffset),
    editBallOpacity: numOrDefault(parsed.editBallOpacity, d.editBallOpacity),
    enableEditOpacityOverride:
      typeof parsed.enableEditOpacityOverride === 'boolean'
        ? parsed.enableEditOpacityOverride
        : d.enableEditOpacityOverride,
    expiredBallOpacity: numOrDefault(parsed.expiredBallOpacity, d.expiredBallOpacity),
    arrowOpacity: numOrDefault(parsed.arrowOpacity, d.arrowOpacity),
    shadowOpacity: numOrDefault(parsed.shadowOpacity, d.shadowOpacity),
    shadowScale: numOrDefault(parsed.shadowScale, d.shadowScale),
    haloScale: numOrDefault(parsed.haloScale, d.haloScale),
    coneRadius: numOrDefault(parsed.coneRadius, d.coneRadius),
    coneLength: numOrDefault(parsed.coneLength, d.coneLength),
    tipRadius: numOrDefault(parsed.tipRadius, d.tipRadius),
    shaftRadius: numOrDefault(parsed.shaftRadius, d.shaftRadius),
    arrowBaseLength: numOrDefault(parsed.arrowBaseLength, d.arrowBaseLength),
    arrowMaxExtraLength: numOrDefault(parsed.arrowMaxExtraLength, d.arrowMaxExtraLength),
    arrowHeightOffset: numOrDefault(parsed.arrowHeightOffset, d.arrowHeightOffset),
    arrowForwardOffset: numOrDefault(parsed.arrowForwardOffset, d.arrowForwardOffset),
  };
}

function saveConfigToStorage(cfg: StaticTrainingBallCamTunerConfig) {
  writeStorageJson(STORAGE_KEY, cfg);
}

export interface StaticTrainingBallCamTunerState extends StaticTrainingBallCamTunerConfig {
  updateConfig: (patch: Partial<StaticTrainingBallCamTunerConfig>) => void;
  switchLateralSide: () => void;
  resetDefaults: () => void;
}

export const useStaticTrainingBallCamTunerStore = create<StaticTrainingBallCamTunerState>((set, get) => ({
  ...loadInitialConfig(),
  updateConfig: (patch) => {
    const current = get();
    const next: StaticTrainingBallCamTunerConfig = {
      fov: patch.fov !== undefined ? Number(patch.fov) : current.fov,
      distance: patch.distance !== undefined ? Number(patch.distance) : current.distance,
      height: patch.height !== undefined ? Number(patch.height) : current.height,
      angle: patch.angle !== undefined ? Number(patch.angle) : current.angle,
      lateralOffset:
        patch.lateralOffset !== undefined ? Number(patch.lateralOffset) : current.lateralOffset,
      editBallOpacity:
        patch.editBallOpacity !== undefined
          ? Number(patch.editBallOpacity)
          : current.editBallOpacity,
      enableEditOpacityOverride:
        patch.enableEditOpacityOverride !== undefined
          ? Boolean(patch.enableEditOpacityOverride)
          : current.enableEditOpacityOverride,
      expiredBallOpacity:
        patch.expiredBallOpacity !== undefined
          ? Number(patch.expiredBallOpacity)
          : current.expiredBallOpacity,
      arrowOpacity:
        patch.arrowOpacity !== undefined ? Number(patch.arrowOpacity) : current.arrowOpacity,
      shadowOpacity:
        patch.shadowOpacity !== undefined ? Number(patch.shadowOpacity) : current.shadowOpacity,
      shadowScale:
        patch.shadowScale !== undefined ? Number(patch.shadowScale) : current.shadowScale,
      haloScale: patch.haloScale !== undefined ? Number(patch.haloScale) : current.haloScale,
      coneRadius: patch.coneRadius !== undefined ? Number(patch.coneRadius) : current.coneRadius,
      coneLength: patch.coneLength !== undefined ? Number(patch.coneLength) : current.coneLength,
      tipRadius: patch.tipRadius !== undefined ? Number(patch.tipRadius) : current.tipRadius,
      shaftRadius:
        patch.shaftRadius !== undefined ? Number(patch.shaftRadius) : current.shaftRadius,
      arrowBaseLength:
        patch.arrowBaseLength !== undefined
          ? Number(patch.arrowBaseLength)
          : current.arrowBaseLength,
      arrowMaxExtraLength:
        patch.arrowMaxExtraLength !== undefined
          ? Number(patch.arrowMaxExtraLength)
          : current.arrowMaxExtraLength,
      arrowHeightOffset:
        patch.arrowHeightOffset !== undefined
          ? Number(patch.arrowHeightOffset)
          : current.arrowHeightOffset,
      arrowForwardOffset:
        patch.arrowForwardOffset !== undefined
          ? Number(patch.arrowForwardOffset)
          : current.arrowForwardOffset,
    };
    saveConfigToStorage(next);
    set(next);
  },
  switchLateralSide: () => {
    const current = get();
    const next: StaticTrainingBallCamTunerConfig = {
      ...current,
      lateralOffset: -current.lateralOffset,
    };
    saveConfigToStorage(next);
    set(next);
  },
  resetDefaults: () => {
    const next = { ...DEFAULT_STATIC_TRAINING_BALL_CAM_CONFIG };
    saveConfigToStorage(next);
    set(next);
  },
}));
