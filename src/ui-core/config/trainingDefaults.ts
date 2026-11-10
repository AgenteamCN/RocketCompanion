/**
 * trainingDefaults.ts
 * Default settings for offline freeplay, training modes, trajectory prediction, and graphics.
 */

import { safeStorage, createLocalStorageStore, stringOrDefault, STORAGE_KEYS } from './storageHelpers';

export const DEFAULT_TRAINING_SETTINGS = Object.freeze({
  disableGoalReset: false,
  boostOption: 'unlimited',
  showCarHitbox: false,
  showAllCarHitboxes: false,
});

export function isFreeplayConfigScopeActive(
  matchMode?: string | null,
  isOnlineOrServerActive = false
): boolean {
  const normalizedMode = matchMode || 'freeplay';
  return normalizedMode === 'freeplay' && !isOnlineOrServerActive;
}

export function isTrainingGoalBarrierScopeActive(
  matchMode?: string | null,
  isOnlineOrServerActive = false
): boolean {
  if (isOnlineOrServerActive) return false;
  const normalizedMode = matchMode || 'freeplay';
  return (
    normalizedMode === 'freeplay' ||
    normalizedMode === 'static-training-pack' ||
    normalizedMode === 'kickoff-training' ||
    normalizedMode === 'dev-test-lab' ||
    normalizedMode === 'replay-viewer'
  );
}

export const DEFAULT_GRAPHICS_SETTINGS = Object.freeze({
  showStadium: true,
  limitFps: true,
  maxFps: 120,
  renderScale: 50,
});

export const TRAJECTORY_STORAGE_KEY = STORAGE_KEYS.TRAJECTORY;

export type TrajectoryUpdateMode =
  | 'continuous-incremental'
  | 'event-snapshot'
  | 'full-every-tick';

export type TrajectoryRenderStyle = 'tube-3d';

export type TrajectoryDashCapStyle = 'round' | 'chamfer';

export interface TrajectoryConfig {
  enabled: boolean;
  predictionTicks: number;
  solidTicks: number;
  transparentTicks: number;
  thickness: number;
  opacity: number;
  color: string;
  dynamicMode: boolean;
  duration: number;
  // WASM incremental & trigger policy
  updateMode?: TrajectoryUpdateMode;
  recomputeOnCarHit?: boolean;
  recomputeOnWorldBounce?: boolean;
  deviationThresholdUu?: number;
  velocityThresholdUu?: number;
  catchupTicksPerFrame?: number;
  // 3D Geometry & Spatial Depth cues
  renderStyle?: TrajectoryRenderStyle;
  dashCapStyle?: TrajectoryDashCapStyle;
  sampleStride?: number;
  tubeRadialSegments?: number;
  shadingStrength?: number;
  radiusTaper?: number;
  horizonFade?: number;
  showBounceMarkers?: boolean;
  showGroundProjection?: boolean;
  dropLineIntervalTicks?: number;
  // Developer vs User menu exposure locks
  allowUserThicknessEdit?: boolean;
  allowUserDashEdit?: boolean;
  calculationMode?: string;
}

export const DEFAULT_TRAJECTORY_CONFIG: TrajectoryConfig = {
  enabled: true,
  predictionTicks: 600,
  solidTicks: 50,
  transparentTicks: 20,
  thickness: 20,
  opacity: 0.5,
  color: '#ffffff',
  dynamicMode: true,
  duration: 5,
  updateMode: 'continuous-incremental',
  recomputeOnCarHit: true,
  recomputeOnWorldBounce: false,
  deviationThresholdUu: 5,
  velocityThresholdUu: 15,
  catchupTicksPerFrame: 5,
  renderStyle: 'tube-3d',
  dashCapStyle: 'round',
  sampleStride: 1,
  tubeRadialSegments: 6,
  shadingStrength: 0.75,
  radiusTaper: 0.35,
  horizonFade: 0.3,
  showBounceMarkers: false,
  showGroundProjection: false,
  dropLineIntervalTicks: 104,
  allowUserThicknessEdit: false,
  allowUserDashEdit: true,
};

export function loadSavedTrajectorySettings(): Omit<TrajectoryConfig, 'duration'> & { duration?: number } {
  const raw = safeStorage.get(TRAJECTORY_STORAGE_KEY);
  if (raw) {
    try {
      const parsed = JSON.parse(raw);
      const updateMode: TrajectoryUpdateMode =
        parsed.updateMode === 'event-snapshot' ||
        parsed.updateMode === 'full-every-tick' ||
        parsed.updateMode === 'continuous-incremental'
          ? parsed.updateMode
          : DEFAULT_TRAJECTORY_CONFIG.updateMode!;
      const dashCapStyle: TrajectoryDashCapStyle =
        parsed.dashCapStyle === 'chamfer' || parsed.dashCapStyle === 'round'
          ? parsed.dashCapStyle
          : DEFAULT_TRAJECTORY_CONFIG.dashCapStyle!;
      return {
        ...DEFAULT_TRAJECTORY_CONFIG,
        enabled: typeof parsed.enabled === 'boolean' ? parsed.enabled : DEFAULT_TRAJECTORY_CONFIG.enabled,
        predictionTicks: Math.min(600, Math.max(60, Number(parsed.predictionTicks) || DEFAULT_TRAJECTORY_CONFIG.predictionTicks)),
        solidTicks: Math.min(240, Math.max(5, Number(parsed.solidTicks) || DEFAULT_TRAJECTORY_CONFIG.solidTicks)),
        transparentTicks: Math.min(240, Math.max(5, Number(parsed.transparentTicks) || DEFAULT_TRAJECTORY_CONFIG.transparentTicks)),
        thickness: Math.min(75, Math.max(1, Number(parsed.thickness) || DEFAULT_TRAJECTORY_CONFIG.thickness)),
        opacity: Math.min(1.0, Math.max(0.05, Number(parsed.opacity) || DEFAULT_TRAJECTORY_CONFIG.opacity)),
        color: typeof parsed.color === 'string' && /^#[0-9a-fA-F]{6}$/.test(parsed.color) ? parsed.color : DEFAULT_TRAJECTORY_CONFIG.color,
        dynamicMode: typeof parsed.dynamicMode === 'boolean' ? parsed.dynamicMode : DEFAULT_TRAJECTORY_CONFIG.dynamicMode,
        updateMode,
        recomputeOnCarHit:
          typeof parsed.recomputeOnCarHit === 'boolean'
            ? parsed.recomputeOnCarHit
            : DEFAULT_TRAJECTORY_CONFIG.recomputeOnCarHit,
        recomputeOnWorldBounce:
          typeof parsed.recomputeOnWorldBounce === 'boolean'
            ? parsed.recomputeOnWorldBounce
            : DEFAULT_TRAJECTORY_CONFIG.recomputeOnWorldBounce,
        deviationThresholdUu: Math.min(
          100,
          Math.max(0.5, Number(parsed.deviationThresholdUu) || DEFAULT_TRAJECTORY_CONFIG.deviationThresholdUu!)
        ),
        velocityThresholdUu: Math.min(
          1000,
          Math.max(5, Number(parsed.velocityThresholdUu) || DEFAULT_TRAJECTORY_CONFIG.velocityThresholdUu!)
        ),
        catchupTicksPerFrame: Math.min(
          600,
          Math.max(2, Math.round(Number(parsed.catchupTicksPerFrame) || DEFAULT_TRAJECTORY_CONFIG.catchupTicksPerFrame!))
        ),
        renderStyle: 'tube-3d',
        dashCapStyle,
        sampleStride: Math.min(8, Math.max(1, Math.round(Number(parsed.sampleStride) || DEFAULT_TRAJECTORY_CONFIG.sampleStride!))),
        tubeRadialSegments: Math.min(8, Math.max(4, Math.round(Number(parsed.tubeRadialSegments) || DEFAULT_TRAJECTORY_CONFIG.tubeRadialSegments!))),
        shadingStrength: Math.min(
          1,
          Math.max(
            0,
            typeof parsed.shadingStrength === 'number' && Number.isFinite(parsed.shadingStrength)
              ? parsed.shadingStrength
              : DEFAULT_TRAJECTORY_CONFIG.shadingStrength!
          )
        ),
        radiusTaper: Math.min(
          0.9,
          Math.max(
            0,
            typeof parsed.radiusTaper === 'number' && Number.isFinite(parsed.radiusTaper)
              ? parsed.radiusTaper
              : DEFAULT_TRAJECTORY_CONFIG.radiusTaper!
          )
        ),
        horizonFade: Math.min(
          0.9,
          Math.max(
            0,
            typeof parsed.horizonFade === 'number' && Number.isFinite(parsed.horizonFade)
              ? parsed.horizonFade
              : DEFAULT_TRAJECTORY_CONFIG.horizonFade!
          )
        ),
        showBounceMarkers:
          typeof parsed.showBounceMarkers === 'boolean'
            ? parsed.showBounceMarkers
            : DEFAULT_TRAJECTORY_CONFIG.showBounceMarkers,
        showGroundProjection:
          typeof parsed.showGroundProjection === 'boolean'
            ? parsed.showGroundProjection
            : DEFAULT_TRAJECTORY_CONFIG.showGroundProjection,
        dropLineIntervalTicks: Math.min(
          180,
          Math.max(15, Math.round(Number(parsed.dropLineIntervalTicks) || DEFAULT_TRAJECTORY_CONFIG.dropLineIntervalTicks!))
        ),
        allowUserThicknessEdit:
          typeof parsed.allowUserThicknessEdit === 'boolean'
            ? parsed.allowUserThicknessEdit
            : DEFAULT_TRAJECTORY_CONFIG.allowUserThicknessEdit,
        allowUserDashEdit:
          typeof parsed.allowUserDashEdit === 'boolean'
            ? parsed.allowUserDashEdit
            : DEFAULT_TRAJECTORY_CONFIG.allowUserDashEdit,
      };
    } catch (err) {
      console.warn('[trainingDefaults] Failed to load trajectory settings:', err);
    }
  }
  return { ...DEFAULT_TRAJECTORY_CONFIG };
}

export function saveTrajectorySettings(settings: Partial<TrajectoryConfig>): void {
  safeStorage.set(TRAJECTORY_STORAGE_KEY, JSON.stringify(settings));
}

export function getInitialTrajectory(): TrajectoryConfig {
  const raw = safeStorage.get(TRAJECTORY_STORAGE_KEY);
  if (raw) {
    try {
      const parsed = JSON.parse(raw);
      return {
        ...DEFAULT_TRAJECTORY_CONFIG,
        ...parsed,
        duration: parsed.predictionTicks
          ? Number((parsed.predictionTicks / 120).toFixed(1))
          : DEFAULT_TRAJECTORY_CONFIG.duration,
      };
    } catch (err) {
      console.warn('[trainingDefaults] Failed to parse stored trajectory settings JSON, resetting to defaults:', err);
    }
  }
  return { ...DEFAULT_TRAJECTORY_CONFIG };
}

export interface GraphicsConfigState {
  renderScale: number;
  limitFps: boolean;
  maxFps: number;
  showStadium: boolean;
  pauseRenderingOnMenu: boolean;
  menuPowerSave: 'freeze' | '15' | '30' | 'match';
}

export function getInitialGraphics(): GraphicsConfigState {
  const raw = safeStorage.get(STORAGE_KEYS.GRAPHICS_SETTINGS);
  if (raw) {
    try {
      const parsed = JSON.parse(raw);
      const rawPowerSave = parsed.menuPowerSave ?? (parsed.pauseRenderingOnMenu ? 'freeze' : '30');
      const menuPowerSave: 'freeze' | '15' | '30' | 'match' =
        rawPowerSave === 'freeze' ||
        rawPowerSave === '15' ||
        rawPowerSave === '30' ||
        rawPowerSave === 'match'
          ? rawPowerSave
          : '30';
      return {
        renderScale: parsed.renderScale ?? 50,
        limitFps: parsed.limitFps ?? true,
        maxFps: Math.max(15, Math.min(240, parsed.maxFps ?? 120)),
        showStadium: parsed.showStadium ?? true,
        pauseRenderingOnMenu: parsed.pauseRenderingOnMenu ?? true,
        menuPowerSave,
      };
    } catch (err) {
      console.warn('[trainingDefaults] Failed to parse stored graphics settings JSON, resetting to defaults:', err);
    }
  }
  return {
    renderScale: 50,
    limitFps: true,
    maxFps: 120,
    showStadium: true,
    pauseRenderingOnMenu: true,
    menuPowerSave: '30',
  };
}

export const botSettingsStore = createLocalStorageStore<{ botId: string }>(
  STORAGE_KEYS.BOT_SETTINGS,
  () => ({ botId: 'nexto' }),
  (target, source) => {
    target.botId = stringOrDefault(source.botId, ['seer', 'necto', 'nexto'], target.botId);
  }
);

export function getInitialKickoffWsOffset(): number {
  const raw = safeStorage.get(STORAGE_KEYS.KICKOFF_WS_OFFSET_PCT);
  if (raw !== null) {
    const val = Number(raw);
    if (Number.isFinite(val)) {
      return Math.max(0, Math.min(50, Math.round(val)));
    }
  }
  return 10;
}

export function saveKickoffWsOffset(offsetPct: number): void {
  const clamped = Math.max(0, Math.min(50, Math.round(offsetPct)));
  safeStorage.set(STORAGE_KEYS.KICKOFF_WS_OFFSET_PCT, String(clamped));
}

export const KICKOFF_SPAWNS = [
  { index: 0, key: '1', id: 'left-front',  label: '1 · Left Diagonal',  shortLabel: 'LF', x: -2048.0, y: -2560.0 },
  { index: 1, key: '2', id: 'left-back',   label: '2 · Left Back',      shortLabel: 'LB', x: -256.0,  y: -3840.0 },
  { index: 2, key: '3', id: 'center-back', label: '3 · Center Back',    shortLabel: 'CB', x: 0.0,     y: -4608.0 },
  { index: 3, key: '4', id: 'right-back',  label: '4 · Right Back',     shortLabel: 'RB', x: 256.0,   y: -3840.0 },
  { index: 4, key: '5', id: 'right-front', label: '5 · Right Diagonal', shortLabel: 'RF', x: 2048.0,  y: -2560.0 },
];
