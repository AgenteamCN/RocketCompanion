/**
 * replayDirectorConfig.ts
 * Pure configuration schema, defaults, and parameter updates for the Goal Replay Director Camera & Slow-Motion.
 */

export const DEFAULT_REPLAY_DIRECTOR_FOV_DEG = 110.0;

export interface ReplayDirectorConfigState {
  cameraFovDeg: number;
  lastTouchSlowMoPreSeconds: number;
  lastTouchSlowMoPostSeconds: number;
  lastTouchSlowMoScale: number;
  goalLineSlowMoPreSeconds: number;
  goalLineSlowMoPostSeconds: number;
  goalLineSlowMoScale: number;

  touchHoldAfterSeconds: number;
  twoTouchLookaheadSeconds: number;
  twoTouchAnticipationWeight: number;

  corridorBackDistStart: number;
  corridorBackDistEnd: number;
  corridorSideDistBase: number;
  goalBoxShowcaseDist: number;
  carMidpointMaxWeight: number;

  cameraBaseHeightUu: number;
  cameraAerialHeightSlope: number;
  interceptorLookaheadSeconds: number;
  interceptorFramingWeight: number;
  suffixTimeDecayRate: number;
  trajectorySmoothPasses: number;
  maxTotalYawBudgetDeg: number;

  postGoalExplosionStretchDist: number;
  postGoalExplosionStretchDuration: number;
  postGoalScorerFollowTransitionSec: number;
  eyeDampingRate: number;
  gazeDampingRate: number;
  strikerSwitchDampingRate: number;
  muteSignalAudioInGoalReplay: boolean;
  [key: string]: number | boolean;
}

export const DEFAULT_REPLAY_DIRECTOR_CONFIG: Readonly<ReplayDirectorConfigState> = Object.freeze({
  cameraFovDeg: DEFAULT_REPLAY_DIRECTOR_FOV_DEG,
  lastTouchSlowMoPreSeconds: 0.50,
  lastTouchSlowMoPostSeconds: 0.25,
  lastTouchSlowMoScale: 0.50,
  goalLineSlowMoPreSeconds: 0.25,
  goalLineSlowMoPostSeconds: 0.25,
  goalLineSlowMoScale: 0.50,

  touchHoldAfterSeconds: 0.20,
  twoTouchLookaheadSeconds: 2.20,
  twoTouchAnticipationWeight: 0.36,

  corridorBackDistStart: 500.0,
  corridorBackDistEnd: 400.0,
  corridorSideDistBase: 760.0,
  goalBoxShowcaseDist: 920.0,
  carMidpointMaxWeight: 0.46,

  cameraBaseHeightUu: 195.0,
  cameraAerialHeightSlope: 0.36,
  interceptorLookaheadSeconds: 1.65,
  interceptorFramingWeight: 0.72,
  suffixTimeDecayRate: 1.40,
  trajectorySmoothPasses: 4,
  maxTotalYawBudgetDeg: 320.0,

  postGoalExplosionStretchDist: 780.0,
  postGoalExplosionStretchDuration: 0.36,
  postGoalScorerFollowTransitionSec: 0.28,
  eyeDampingRate: 5.2,
  gazeDampingRate: 8.5,
  strikerSwitchDampingRate: 4.2,
  muteSignalAudioInGoalReplay: true,
});

export const REPLAY_DIRECTOR_CONFIG: ReplayDirectorConfigState = {
  ...DEFAULT_REPLAY_DIRECTOR_CONFIG,
};

export type ReplayDirectorConfigListener = (config: ReplayDirectorConfigState) => void;
const directorConfigCallbacks: ReplayDirectorConfigListener[] = [];

export interface ReplayDirectorActiveControllerConfigTarget {
  isImportedPreview?: boolean;
  useRecordedCsvCamera?: boolean;
  _cachedSuffixCameraPlan?: unknown;
  _cachedSmoothnessSummary?: unknown;
  _cachedAnomalyPeaks?: unknown;
  refreshCurrentFrameDirectorPose?: () => void;
  invalidateCachedDirectorPlans?: (disableRecordedCsvCamera?: boolean) => void;
}

let _getActiveController: (() => ReplayDirectorActiveControllerConfigTarget | null) | null = null;
let _notifyActiveController: (() => void) | null = null;

export function setReplayDirectorActiveControllerHooks(hooks: {
  getActiveController: () => ReplayDirectorActiveControllerConfigTarget | null;
  notifyActiveController: () => void;
}): void {
  _getActiveController = hooks.getActiveController;
  _notifyActiveController = hooks.notifyActiveController;
}

export function sanitizeReplayDirectorConfigPatch(
  current: ReplayDirectorConfigState,
  patch: Partial<ReplayDirectorConfigState> = {}
): { nextConfig: ReplayDirectorConfigState; changed: boolean } {
  if (!patch || typeof patch !== 'object') {
    return { nextConfig: current, changed: false };
  }
  const nextConfig: ReplayDirectorConfigState = { ...current };
  let changed = false;
  for (const [key, val] of Object.entries(patch)) {
    if (!(key in DEFAULT_REPLAY_DIRECTOR_CONFIG)) continue;
    if (typeof DEFAULT_REPLAY_DIRECTOR_CONFIG[key] === 'boolean' && typeof val === 'boolean') {
      if (nextConfig[key] !== val) {
        nextConfig[key] = val;
        changed = true;
      }
    } else if (typeof val === 'number' && Number.isFinite(val)) {
      if (nextConfig[key] !== val) {
        nextConfig[key] = val;
        changed = true;
      }
    }
  }
  return { nextConfig, changed };
}

export function getReplayDirectorConfig(): ReplayDirectorConfigState {
  return { ...REPLAY_DIRECTOR_CONFIG };
}

export function updateReplayDirectorConfig(
  patch: Partial<ReplayDirectorConfigState> = {}
): ReplayDirectorConfigState {
  const { nextConfig, changed } = sanitizeReplayDirectorConfigPatch(REPLAY_DIRECTOR_CONFIG, patch);
  if (changed) {
    Object.assign(REPLAY_DIRECTOR_CONFIG, nextConfig);
  }
  const activeCtrl = _getActiveController?.();
  if (changed && activeCtrl) {
    activeCtrl.invalidateCachedDirectorPlans?.(true);
  }
  for (const fn of directorConfigCallbacks) {
    try {
      fn({ ...REPLAY_DIRECTOR_CONFIG });
    } catch (err) {
      console.warn('[replayDirectorConfig] Config listener failed:', err);
    }
  }
  if (changed) {
    _notifyActiveController?.();
  }
  return REPLAY_DIRECTOR_CONFIG;
}

export function resetReplayDirectorConfig(): ReplayDirectorConfigState {
  Object.assign(REPLAY_DIRECTOR_CONFIG, DEFAULT_REPLAY_DIRECTOR_CONFIG);
  const activeCtrl = _getActiveController?.();
  if (activeCtrl) {
    activeCtrl.invalidateCachedDirectorPlans?.(false);
  }
  for (const fn of directorConfigCallbacks) {
    try {
      fn({ ...REPLAY_DIRECTOR_CONFIG });
    } catch (err) {
      console.warn('[replayDirectorConfig] Config reset listener failed:', err);
    }
  }
  _notifyActiveController?.();
  return REPLAY_DIRECTOR_CONFIG;
}

export function subscribeReplayDirectorConfig(listener: ReplayDirectorConfigListener): () => boolean {
  if (typeof listener !== 'function') return () => false;
  if (!directorConfigCallbacks.includes(listener)) {
    directorConfigCallbacks.push(listener);
  }
  return () => {
    const idx = directorConfigCallbacks.indexOf(listener);
    if (idx === -1) return false;
    directorConfigCallbacks.splice(idx, 1);
    return true;
  };
}
