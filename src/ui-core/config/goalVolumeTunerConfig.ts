export const BALL_COLLISION_RADIUS = 91.25;

export interface GoalVolumeBoxSpec {
  enabled?: boolean;
  halfWidthX: number;
  minY: number;
  maxY: number;
  minZ: number;
  maxZ: number;
}

export interface BallGoalRimFxConfig {
  enabled: boolean;
  innerStartPct: number;
  outerEndPct: number;
  rimColor: string;
  rimIntensity: number;
  coreColor: string;
  coreBrightness: number;
  bezierP1X: number;
  bezierP1Y: number;
  bezierP2X: number;
  bezierP2Y: number;
  seamWidthUu: number;
  seamIntensity: number;
  jitterAmplitude: number;
}

export interface GoalVolumeTunerConfig {
  showHitboxVisual: boolean;
  standard: Required<GoalVolumeBoxSpec>;
  throwback: Required<GoalVolumeBoxSpec>;
  ballRimFx: BallGoalRimFxConfig;
}

export interface GoalVolumeTunerPatch {
  showHitboxVisual?: boolean;
  standard?: Partial<GoalVolumeBoxSpec>;
  throwback?: Partial<GoalVolumeBoxSpec>;
  ballRimFx?: Partial<BallGoalRimFxConfig>;
}

export const STANDARD_GOAL_VOLUME_BOX: Readonly<GoalVolumeBoxSpec> = Object.freeze({
  halfWidthX: 892.755,
  minY: 5120.0,
  maxY: 6000.0,
  minZ: 0.0,
  maxZ: 642.775,
});

export const THROWBACK_GOAL_VOLUME_BOX: Readonly<GoalVolumeBoxSpec> = Object.freeze({
  halfWidthX: 940.0,
  minY: 4922.0,
  maxY: 5460.0,
  minZ: 0.0,
  maxZ: 640.0,
});

export const DEFAULT_GOAL_VOLUME_TUNER_CONFIG: Readonly<GoalVolumeTunerConfig> = Object.freeze({
  showHitboxVisual: false,
  standard: {
    enabled: false,
    halfWidthX: STANDARD_GOAL_VOLUME_BOX.halfWidthX,
    minY: STANDARD_GOAL_VOLUME_BOX.minY,
    maxY: STANDARD_GOAL_VOLUME_BOX.maxY,
    minZ: STANDARD_GOAL_VOLUME_BOX.minZ,
    maxZ: STANDARD_GOAL_VOLUME_BOX.maxZ,
  },
  throwback: {
    enabled: true,
    halfWidthX: THROWBACK_GOAL_VOLUME_BOX.halfWidthX,
    minY: THROWBACK_GOAL_VOLUME_BOX.minY,
    maxY: THROWBACK_GOAL_VOLUME_BOX.maxY,
    minZ: THROWBACK_GOAL_VOLUME_BOX.minZ,
    maxZ: THROWBACK_GOAL_VOLUME_BOX.maxZ,
  },
  ballRimFx: {
    enabled: true,
    innerStartPct: 60,
    outerEndPct: 100,
    rimColor: '#989898',
    rimIntensity: 1,
    coreColor: '#2d2d2d',
    coreBrightness: 1,
    bezierP1X: 0.75,
    bezierP1Y: 0.01,
    bezierP2X: 1,
    bezierP2Y: 0.24,
    seamWidthUu: 10,
    seamIntensity: 0.8,
    jitterAmplitude: 0.75,
  },
});

export const goalVolumeTunerRuntimeConfig: GoalVolumeTunerConfig = {
  showHitboxVisual: DEFAULT_GOAL_VOLUME_TUNER_CONFIG.showHitboxVisual,
  standard: { ...DEFAULT_GOAL_VOLUME_TUNER_CONFIG.standard },
  throwback: { ...DEFAULT_GOAL_VOLUME_TUNER_CONFIG.throwback },
  ballRimFx: { ...DEFAULT_GOAL_VOLUME_TUNER_CONFIG.ballRimFx },
};

type GoalVolumeTunerCallback = (snapshot: GoalVolumeTunerConfig) => void;
const goalVolumeCallbacks: GoalVolumeTunerCallback[] = [];
const goalVolumeObjectCallbacks: GoalVolumeTunerCallback[] = [];

export function getGoalVolumeTunerConfig(): GoalVolumeTunerConfig {
  return {
    showHitboxVisual: Boolean(goalVolumeTunerRuntimeConfig.showHitboxVisual),
    standard: { ...goalVolumeTunerRuntimeConfig.standard },
    throwback: { ...goalVolumeTunerRuntimeConfig.throwback },
    ballRimFx: { ...goalVolumeTunerRuntimeConfig.ballRimFx },
  };
}

export function getGoalVolumeBoxForPreset(isThrowback = false): Required<GoalVolumeBoxSpec> {
  const src = isThrowback
    ? goalVolumeTunerRuntimeConfig.throwback
    : goalVolumeTunerRuntimeConfig.standard;
  return {
    enabled: isThrowback ? true : Boolean(src.enabled),
    halfWidthX: Number(src.halfWidthX) || (isThrowback ? THROWBACK_GOAL_VOLUME_BOX.halfWidthX : STANDARD_GOAL_VOLUME_BOX.halfWidthX),
    minY: Number(src.minY) || (isThrowback ? THROWBACK_GOAL_VOLUME_BOX.minY : STANDARD_GOAL_VOLUME_BOX.minY),
    maxY: Number(src.maxY) || (isThrowback ? THROWBACK_GOAL_VOLUME_BOX.maxY : STANDARD_GOAL_VOLUME_BOX.maxY),
    minZ: Number.isFinite(Number(src.minZ)) ? Number(src.minZ) : 0.0,
    maxZ: Number(src.maxZ) || (isThrowback ? THROWBACK_GOAL_VOLUME_BOX.maxZ : STANDARD_GOAL_VOLUME_BOX.maxZ),
  };
}

export function getBallGoalRimFxConfig(): BallGoalRimFxConfig {
  return goalVolumeTunerRuntimeConfig.ballRimFx;
}

export function subscribeGoalVolumeTunerConfig(listener: GoalVolumeTunerCallback): () => void {
  if (typeof listener !== 'function') return () => {};
  if (!goalVolumeCallbacks.includes(listener)) {
    goalVolumeCallbacks.push(listener);
  }
  return () => {
    const idx = goalVolumeCallbacks.indexOf(listener);
    if (idx !== -1) goalVolumeCallbacks.splice(idx, 1);
  };
}

export function registerGoalVolumeTunerApplier(applier: GoalVolumeTunerCallback): () => void {
  if (typeof applier !== 'function') return () => {};
  if (!goalVolumeObjectCallbacks.includes(applier)) {
    goalVolumeObjectCallbacks.push(applier);
  }
  return () => {
    const idx = goalVolumeObjectCallbacks.indexOf(applier);
    if (idx !== -1) goalVolumeObjectCallbacks.splice(idx, 1);
  };
}

function notifyAll(): GoalVolumeTunerConfig {
  const snapshot = getGoalVolumeTunerConfig();
  for (const applier of goalVolumeObjectCallbacks) {
    try {
      applier(snapshot);
    } catch {
      // ignore applier errors
    }
  }
  for (const listener of goalVolumeCallbacks) {
    try {
      listener(snapshot);
    } catch {
      // ignore listener errors
    }
  }
  return snapshot;
}

export function updateGoalVolumeTunerConfig(patch: GoalVolumeTunerPatch = {}): GoalVolumeTunerConfig {
  if (!patch || typeof patch !== 'object') return getGoalVolumeTunerConfig();
  if (typeof patch.showHitboxVisual === 'boolean') {
    goalVolumeTunerRuntimeConfig.showHitboxVisual = patch.showHitboxVisual;
  }
  if (patch.standard && typeof patch.standard === 'object') {
    Object.assign(goalVolumeTunerRuntimeConfig.standard, patch.standard);
  }
  if (patch.throwback && typeof patch.throwback === 'object') {
    Object.assign(goalVolumeTunerRuntimeConfig.throwback, patch.throwback);
  }
  if (patch.ballRimFx && typeof patch.ballRimFx === 'object') {
    Object.assign(goalVolumeTunerRuntimeConfig.ballRimFx, patch.ballRimFx);
  }
  return notifyAll();
}

export function resetGoalVolumeTunerConfig(): GoalVolumeTunerConfig {
  goalVolumeTunerRuntimeConfig.showHitboxVisual = DEFAULT_GOAL_VOLUME_TUNER_CONFIG.showHitboxVisual;
  goalVolumeTunerRuntimeConfig.standard = { ...DEFAULT_GOAL_VOLUME_TUNER_CONFIG.standard };
  goalVolumeTunerRuntimeConfig.throwback = { ...DEFAULT_GOAL_VOLUME_TUNER_CONFIG.throwback };
  goalVolumeTunerRuntimeConfig.ballRimFx = { ...DEFAULT_GOAL_VOLUME_TUNER_CONFIG.ballRimFx };
  return notifyAll();
}
