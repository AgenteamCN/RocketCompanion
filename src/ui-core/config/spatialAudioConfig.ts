/**
 * spatialAudioConfig.ts
 * Background Music filter persistence and Non-Linear Directional Spatial Audio Engine parameters.
 */

import { STORAGE_KEYS, safeStorage, isPlainObject, clampNumberOrDefault, booleanOrDefault } from './storageHelpers';

// ============================================================================
// Spatial Audio Engine Tuner Configuration (Defaults from spaceaudio/new + 2.0s)
// ============================================================================

export type SpatialAudioOverrideMode = 'auto' | 'normal' | 'spatial' | 'manual';

export interface SpatialAudioTunerConfig {
  /** Smooth spatial transition duration in seconds (default: 2.0s) */
  transitionDurationSec: number;
  /** Play/Pause/Enable/Disable smooth fade-in & fade-out duration in seconds (default: 2.0s, max: 3.0s) */
  bgmFadeDurationSec: number;
  /** High-Pass Filter cutoff frequency at full spatial blend (default: 425 Hz) */
  hpfMaxFreq: number;
  /** Low-Pass Filter cutoff frequency at full spatial blend (default: 3500 Hz) */
  lpfMinFreq: number;
  /** Convolver reverb wet ceiling percentage at full spatial blend (default: 69%) */
  wetMaxPct: number;
  /** Stadium impulse response decay time in seconds (default: 3.0s) */
  decaySec: number;
  /** Equal-power wet makeup gain multiplier (default: 1.35) */
  wetBoost: number;
  /** Directional Cubic-Bezier control point P1.x (default: 0.22 — fast near 0, slow near 1) */
  bzX1: number;
  /** Directional Cubic-Bezier control point P1.y (default: 1.0) */
  bzY1: number;
  /** Directional Cubic-Bezier control point P2.x (default: 1.0) */
  bzX2: number;
  /** Directional Cubic-Bezier control point P2.y (default: 1.0) */
  bzY2: number;
  /** Active Tuner override mode ('auto' follows game state) */
  overrideMode: SpatialAudioOverrideMode;
  /** Manual blend override when overrideMode === 'manual' (0.0 = Normal, 1.0 = Spatial) */
  manualBlend: number;
  /** Suppress Signal-triggered audio cues (kickoff countdown, 10s/30s/60s clock alerts) during Goal Replay */
  muteSignalAudioInGoalReplay: boolean;
}

export const DEFAULT_SPATIAL_AUDIO_TUNER_CONFIG: SpatialAudioTunerConfig = Object.freeze({
  transitionDurationSec: 2.0,
  bgmFadeDurationSec: 2.0,
  hpfMaxFreq: 425,
  lpfMinFreq: 3500,
  wetMaxPct: 69,
  decaySec: 3.0,
  wetBoost: 1.35,
  bzX1: 0.22,
  bzY1: 1.0,
  bzX2: 1.0,
  bzY2: 1.0,
  overrideMode: 'auto',
  manualBlend: 0,
  muteSignalAudioInGoalReplay: true,
});

export function sanitizeSpatialAudioTunerConfig(
  raw: unknown,
  fallback: SpatialAudioTunerConfig = DEFAULT_SPATIAL_AUDIO_TUNER_CONFIG
): SpatialAudioTunerConfig {
  const src = isPlainObject(raw) ? raw : {};
  const allowedModes: readonly SpatialAudioOverrideMode[] = ['auto', 'normal', 'spatial', 'manual'];
  const overrideMode: SpatialAudioOverrideMode =
    typeof src.overrideMode === 'string' && allowedModes.includes(src.overrideMode as SpatialAudioOverrideMode)
      ? (src.overrideMode as SpatialAudioOverrideMode)
      : fallback.overrideMode;

  return {
    transitionDurationSec: clampNumberOrDefault(src.transitionDurationSec, fallback.transitionDurationSec, {
      min: 0.1,
      max: 8.0,
    }),
    bgmFadeDurationSec: clampNumberOrDefault(src.bgmFadeDurationSec, fallback.bgmFadeDurationSec, {
      min: 0.1,
      max: 3.0,
    }),
    hpfMaxFreq: clampNumberOrDefault(src.hpfMaxFreq, fallback.hpfMaxFreq, {
      min: 20,
      max: 2000,
      integer: true,
    }),
    lpfMinFreq: clampNumberOrDefault(src.lpfMinFreq, fallback.lpfMinFreq, {
      min: 400,
      max: 16000,
      integer: true,
    }),
    wetMaxPct: clampNumberOrDefault(src.wetMaxPct, fallback.wetMaxPct, {
      min: 0,
      max: 100,
      integer: true,
    }),
    decaySec: clampNumberOrDefault(src.decaySec, fallback.decaySec, {
      min: 0.4,
      max: 8.0,
    }),
    wetBoost: clampNumberOrDefault(src.wetBoost, fallback.wetBoost, {
      min: 0.2,
      max: 3.0,
    }),
    bzX1: clampNumberOrDefault(src.bzX1, fallback.bzX1, { min: 0.01, max: 0.99 }),
    bzY1: clampNumberOrDefault(src.bzY1, fallback.bzY1, { min: 0.0, max: 1.0 }),
    bzX2: clampNumberOrDefault(src.bzX2, fallback.bzX2, { min: 0.01, max: 1.0 }),
    bzY2: clampNumberOrDefault(src.bzY2, fallback.bzY2, { min: 0.0, max: 1.0 }),
    overrideMode,
    manualBlend: clampNumberOrDefault(src.manualBlend, fallback.manualBlend, { min: 0.0, max: 1.0 }),
    muteSignalAudioInGoalReplay: booleanOrDefault(
      src.muteSignalAudioInGoalReplay,
      fallback.muteSignalAudioInGoalReplay
    ),
  };
}

export function loadStoredSpatialAudioTunerConfig(): SpatialAudioTunerConfig {
  const raw = safeStorage.get(STORAGE_KEYS.SPATIAL_AUDIO_TUNER);
  if (!raw) return { ...DEFAULT_SPATIAL_AUDIO_TUNER_CONFIG };
  try {
    const parsed = JSON.parse(raw);
    return sanitizeSpatialAudioTunerConfig(parsed);
  } catch {
    return { ...DEFAULT_SPATIAL_AUDIO_TUNER_CONFIG };
  }
}

export function saveStoredSpatialAudioTunerConfig(cfg: SpatialAudioTunerConfig): SpatialAudioTunerConfig {
  const clean = sanitizeSpatialAudioTunerConfig(cfg);
  // Persist acoustic & curve parameters while resetting session-only manual override on reload
  const toStore = { ...clean, overrideMode: 'auto' as const, manualBlend: 0 };
  safeStorage.set(STORAGE_KEYS.SPATIAL_AUDIO_TUNER, JSON.stringify(toStore));
  return clean;
}

/**
 * Solves a 1D Cubic-Bezier curve y(x) for x in [0, 1] with control points P1=(x1,y1), P2=(x2,y2).
 * Using a phase state `u` in [0, 1] mapped through y(u):
 * - When `u` is near 0 (Normal Playback): slope dy/du is steep -> both leaving Normal (0 -> 1)
 *   and entering Normal (1 -> 0) happen VERY QUICKLY.
 * - When `u` is near 1 (Spatial Stadium Effect): slope dy/du is gentle -> both entering Spatial (0 -> 1)
 *   and leaving Spatial (1 -> 0) happen SLOWLY and smoothly.
 * - Reversing direction mid-transition simply reverses du/dt from the current `u` without any jump.
 */
export function solveCubicBezier(
  x: number,
  x1: number,
  y1: number,
  x2: number,
  y2: number
): number {
  if (x <= 0) return 0;
  if (x >= 1) return 1;

  const cx = 3.0 * x1;
  const bx = 3.0 * (x2 - x1) - cx;
  const ax = 1.0 - cx - bx;

  const cy = 3.0 * y1;
  const by = 3.0 * (y2 - y1) - cy;
  const ay = 1.0 - cy - by;

  const sampleCurveX = (t: number) => ((ax * t + bx) * t + cx) * t;
  const sampleCurveY = (t: number) => ((ay * t + by) * t + cy) * t;
  const sampleCurveDerivativeX = (t: number) => (3.0 * ax * t + 2.0 * bx) * t + cx;

  let t2 = x;
  for (let i = 0; i < 8; i++) {
    const xEst = sampleCurveX(t2) - x;
    if (Math.abs(xEst) < 1e-6) break;
    const d2 = sampleCurveDerivativeX(t2);
    if (Math.abs(d2) < 1e-6) break;
    t2 = t2 - xEst / d2;
  }

  if (t2 < 0 || t2 > 1 || Number.isNaN(t2)) {
    let t0 = 0.0;
    let t1 = 1.0;
    t2 = x;
    for (let i = 0; i < 12; i++) {
      const xEst = sampleCurveX(t2);
      if (Math.abs(xEst - x) < 1e-6) break;
      if (x > xEst) t0 = t2;
      else t1 = t2;
      t2 = 0.5 * (t1 - t0) + t0;
    }
  }

  return Math.max(0, Math.min(1, sampleCurveY(t2)));
}

export function evaluateSpatialBlendFromPhase(
  linearPhaseU: number,
  cfg: Pick<SpatialAudioTunerConfig, 'bzX1' | 'bzY1' | 'bzX2' | 'bzY2'> = DEFAULT_SPATIAL_AUDIO_TUNER_CONFIG
): number {
  return solveCubicBezier(
    Math.max(0, Math.min(1, linearPhaseU)),
    cfg.bzX1,
    cfg.bzY1,
    cfg.bzX2,
    cfg.bzY2
  );
}

// ============================================================================
// Background Music Filter Preferences (Persisted; Audio Files Are Session-Only)
// ============================================================================

export interface BgmSceneConfig {
  freePlay: boolean;
  singlePlayerTraining: boolean;
  multiplayerTraining: boolean;
  match: boolean;
}

export const DEFAULT_BGM_SCENE_CONFIG: BgmSceneConfig = Object.freeze({
  freePlay: true,
  singlePlayerTraining: true,
  multiplayerTraining: false,
  match: false,
});

export interface StoredBgmPrefs {
  /** Realistic Background Music toggle in Settings -> Advanced (default: true) */
  realisticBgmEnabled: boolean;
  /** Whether playlist filter groups tracks by V{n}T{m} Volume (true) or lists Uncategorized (false) */
  categorizedMode: boolean;
  /** Volume IDs deselected by the user (new volumes default to selected) */
  deselectedVolumes: string[];
  /** Individual track filenames deselected by the user (new tracks default to selected) */
  deselectedTrackNames: string[];
  /** Background Music volume percentage (0..100, default: 80) */
  bgmVolume: number;
  /** Active scenes where Background Music is allowed to play */
  bgmScenes: BgmSceneConfig;
}

export const DEFAULT_STORED_BGM_PREFS: StoredBgmPrefs = Object.freeze({
  realisticBgmEnabled: true,
  categorizedMode: true,
  deselectedVolumes: [],
  deselectedTrackNames: [],
  bgmVolume: 80,
  bgmScenes: DEFAULT_BGM_SCENE_CONFIG,
});

export function sanitizeBgmSceneConfig(raw: unknown): BgmSceneConfig {
  const src = isPlainObject(raw) ? raw : {};
  return {
    freePlay: booleanOrDefault(src.freePlay, DEFAULT_BGM_SCENE_CONFIG.freePlay),
    singlePlayerTraining: booleanOrDefault(
      src.singlePlayerTraining,
      DEFAULT_BGM_SCENE_CONFIG.singlePlayerTraining
    ),
    multiplayerTraining: booleanOrDefault(
      src.multiplayerTraining,
      DEFAULT_BGM_SCENE_CONFIG.multiplayerTraining
    ),
    match: booleanOrDefault(src.match, DEFAULT_BGM_SCENE_CONFIG.match),
  };
}

export function loadStoredBgmPrefs(): StoredBgmPrefs {
  const raw = safeStorage.get(STORAGE_KEYS.BGM_PREFS);
  if (!raw) {
    return {
      realisticBgmEnabled: true,
      categorizedMode: true,
      deselectedVolumes: [],
      deselectedTrackNames: [],
      bgmVolume: 80,
      bgmScenes: { ...DEFAULT_BGM_SCENE_CONFIG },
    };
  }
  try {
    const parsed = JSON.parse(raw);
    if (!isPlainObject(parsed)) {
      return {
        realisticBgmEnabled: true,
        categorizedMode: true,
        deselectedVolumes: [],
        deselectedTrackNames: [],
        bgmVolume: 80,
        bgmScenes: { ...DEFAULT_BGM_SCENE_CONFIG },
      };
    }
    return {
      realisticBgmEnabled: booleanOrDefault(parsed.realisticBgmEnabled, true),
      categorizedMode: booleanOrDefault(parsed.categorizedMode, true),
      deselectedVolumes: Array.isArray(parsed.deselectedVolumes)
        ? parsed.deselectedVolumes.filter((v): v is string => typeof v === 'string')
        : [],
      deselectedTrackNames: Array.isArray(parsed.deselectedTrackNames)
        ? parsed.deselectedTrackNames.filter((v): v is string => typeof v === 'string')
        : [],
      bgmVolume: clampNumberOrDefault(parsed.bgmVolume, 80, { min: 0, max: 100, integer: true }),
      bgmScenes: sanitizeBgmSceneConfig(parsed.bgmScenes),
    };
  } catch {
    return {
      realisticBgmEnabled: true,
      categorizedMode: true,
      deselectedVolumes: [],
      deselectedTrackNames: [],
      bgmVolume: 80,
      bgmScenes: { ...DEFAULT_BGM_SCENE_CONFIG },
    };
  }
}

export function saveStoredBgmPrefs(prefs: StoredBgmPrefs): void {
  safeStorage.set(
    STORAGE_KEYS.BGM_PREFS,
    JSON.stringify({
      realisticBgmEnabled: Boolean(prefs.realisticBgmEnabled),
      categorizedMode: Boolean(prefs.categorizedMode),
      deselectedVolumes: Array.from(new Set(prefs.deselectedVolumes)),
      deselectedTrackNames: Array.from(new Set(prefs.deselectedTrackNames)),
      bgmVolume: clampNumberOrDefault(prefs.bgmVolume, 80, { min: 0, max: 100, integer: true }),
      bgmScenes: sanitizeBgmSceneConfig(prefs.bgmScenes),
    })
  );
}

export interface ParsedBgmFileMeta {
  vol: string;
  trackNum: number;
  cleanTitle: string;
}

/**
 * Parses soundtrack filenames following the `V{vol}T{track}` convention (e.g. `V1T03_Track.m4a`)
 * or falls back to `'Uncategorized'`.
 */
export function parseBgmFileMetadata(fileName: string): ParsedBgmFileMeta {
  const baseName = fileName.replace(/\.[^/.]+$/, '');
  const match = /V(\d+)T(\d+)/i.exec(baseName);
  if (match) {
    const volNum = String(parseInt(match[1], 10));
    const trackNum = parseInt(match[2], 10) || 0;
    return {
      vol: volNum,
      trackNum,
      cleanTitle: baseName,
    };
  }
  return {
    vol: 'Uncategorized',
    trackNum: 999,
    cleanTitle: baseName,
  };
}
