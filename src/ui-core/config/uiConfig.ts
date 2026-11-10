/**
 * uiConfig.ts
 * Centralized UI and subsystem configuration types, defaults, and LocalStorage hydrators.
 */

import {
  STORAGE_KEYS,
  safeStorage,
} from './storageHelpers';
import {
  type DriftwoodsTunerConfig,
  DEFAULT_DRIFTWOODS_CONFIG,
  cloneDriftwoodsConfig,
  mergeDriftwoodsConfig,
} from './driftwoodsConfig';

export type ActiveMenuRoute =
  | 'main-menu'
  | 'play'
  | 'exhibition'
  | 'self-training'
  | 'kickoff-training'
  | 'static-training-pack'
  | 'host-match'
  | 'join-room'
  | 'host-training'
  | 'custom-play'
  | 'manage-room'
  | 'garage'
  | 'settings'
  | 'acoustics-equalizer'
  | 'trajectory'
  | 'camera'
  | 'training-config'
  | 'keybindings'
  | 'controller-settings'
  | 'advanced-audio'
  | 'event-trigger-rules'
  | 'exp-multi-bots'
  | 'exp-botpack-9700488'
  | 'dev-sandboxes'
  | 'dev-active-tuners'
  | 'dev-calibrated-presets'
  | 'dev-quick-actions'
  | 'dev-self-test'
  | 'dev-under-development'
  | 'dev-remote-profile'
  | 'dev-signaling-lab'
  | 'dev-tem-pack-converter';

export const ROUTE_PARENT_MAP: Record<ActiveMenuRoute, ActiveMenuRoute | null> = {
  'main-menu': null,
  'play': 'main-menu',
  'exhibition': 'play',
  'self-training': 'play',
  'kickoff-training': 'self-training',
  'static-training-pack': 'self-training',
  'host-match': 'play',
  'join-room': 'play',
  'host-training': 'play',
  'custom-play': 'play',
  'manage-room': 'main-menu',
  'garage': 'main-menu',
  'settings': 'main-menu',
  'acoustics-equalizer': 'settings',
  'trajectory': 'settings',
  'camera': 'settings',
  'training-config': 'settings',
  'keybindings': 'settings',
  'controller-settings': 'keybindings',
  'advanced-audio': 'dev-active-tuners',
  'event-trigger-rules': 'dev-active-tuners',
  'exp-multi-bots': 'dev-sandboxes',
  'exp-botpack-9700488': 'dev-sandboxes',
  'dev-tem-pack-converter': 'dev-sandboxes',
  'dev-sandboxes': 'settings',
  'dev-active-tuners': 'settings',
  'dev-calibrated-presets': 'settings',
  'dev-quick-actions': 'settings',
  'dev-self-test': 'settings',
  'dev-under-development': 'settings',
  'dev-remote-profile': 'settings',
  'dev-signaling-lab': 'dev-self-test',
};

export type ContainerTransitionMode = 'fluid-morph' | 'sequenced-step';

export function calculateSettingsSafeScale(windowWidth: number, windowHeight: number, safeAreaMargin: number): number {
  const marginW = windowWidth * (safeAreaMargin / 100);
  const marginH = windowHeight * (safeAreaMargin / 100);
  const Wsafe = Math.max(100, windowWidth - marginW * 2);
  const Hsafe = Math.max(100, windowHeight - marginH * 2);
  const maxAllowedW = Math.max(100, Wsafe - 32);
  const maxAllowedH = Math.max(100, Hsafe - 32);
  return Math.max(50, Math.floor(Math.min(maxAllowedW / 680, maxAllowedH / 540) * 100));
}

export interface ViewportMetrics {
  scaleFactor: number;
  renderWidth: number;
  renderHeight: number;
  isPortrait: boolean;
  isPillarboxed: boolean;
  pillarboxWidth: number;
  safeMarginPct: number;
}

export interface CameraConfig {
  cameraShake: boolean;
  fov: number;
  distance: number;
  height: number;
  angleDeg: number;
  stiffness: number;
  swivelSpeed: number;
  transitionSpeed: number;
  invertSwivel: boolean;
}

export type MenuPowerSaveOption = 'freeze' | '15' | '30' | 'match';

export interface GraphicsConfig {
  renderScale: number;
  limitFps: boolean;
  maxFps: number;
  showStadium: boolean;
  pauseRenderingOnMenu: boolean;
  menuPowerSave: MenuPowerSaveOption;
}

export interface VisualMaterialsConfig {
  ballStyle: 'football' | 'rocket-league';
  carPaint: 'cartoon' | 'anodized';
  paintFinish?: 'matte' | 'metallic';
  demolishedEffect: 'shockwave';
  boostVisual: 'cartoon' | 'gold-rush';
  boostAudio?: 'rush' | 'standard' | 'flamethrower' | 'plasma';
  boostFlameLuminance: 'balanced' | 'dynamic';
  boostPlumeLuminance: 'min' | 'balanced' | 'dynamic' | 'hdr';
}

export interface StoredColorPrefs {
  primaryTeam: 'blue' | 'orange';
  blueOrder: number[];
  orangeOrder: number[];
}

export interface AudioConfig {
  masterVolume: number;
  engineVolume: number;
  boostVolume: number;
  bgmVolume?: number;
  muteWhenUnfocused?: boolean;
  continueAudioOnLostFocus?: boolean;
  bassGain: number;
  midGain: number;
  trebleGain: number;
  hrtfEnabled: boolean;
  dynamicRangeProfile?: 'compressed' | 'dynamic' | 'monitor';
  spatialPanningModel?: 'equalpower' | 'HRTF';
  distanceModel?: 'smoothstep' | 'inverse' | 'linear' | 'exponential';
  audibilityFloor?: number;
  arenaAcousticScale?: number;
  farFieldHighShelfDb?: number;
}

export interface GameplayConfig {
  goalRestart: boolean;
  unlimitedBoost: boolean;
  showCarHitbox: boolean;
  showAllCarHitboxes?: boolean;
  ballCamIndicator: boolean;
  enableFToMirror?: boolean;
}

export interface BoostPadTunerConfig {
  bottomOpacity: number;
  topOpacity: number;
  midpoint: number;
  topCutoff?: number;
  power: number;
  glowIntensity: number;
  glowColor: string;
  coreColor: string;
  glowHeightOffsetBig?: number;
  glowHeightOffsetSmall?: number;
  orbRadius: number;
  orbHeightOffset: number;
  orbEmissiveIntensity: number;
  orbColor: string;
  topColor: string;
  topInactiveColor?: string;
  sideColor: string;
  sideFollowsBase: boolean;
  baseColor: string;
  baseRoughness?: number;
  baseMetalness?: number;
  sideRoughness?: number;
  sideMetalness?: number;
  topRoughness?: number;
  topMetalness?: number;
  padHeightOffset?: number;
  shadowEnabled: boolean;
  shadowRadius: number;
  shadowIntensity: number;
  shadowDistanceScale: number;
  refillEnabled: boolean;
  bigRefillThreshold: number;
  smallRefillThreshold: number;
  refillGlowColor?: string;
  refillGlowIntensity?: number;
  collectDuration: number;
  bezierP1X: number;
  bezierP1Y: number;
  bezierP2X: number;
  bezierP2Y: number;
  ballSquashFactor?: number;
  flashEnabled?: boolean;
  flashColor?: string;
  flashDuration?: number;
  flashMode?: 'on_demand' | 'consistent';
  orbCollectDuration: number;
  orbDropDistance: number;
  orbBezierP1X: number;
  orbBezierP1Y: number;
  orbBezierP2X: number;
  orbBezierP2Y: number;
  rotBigMid: number;
  rotBigCorner: number;
  rotSmallAxisY0: number;
  rotSmallAxisY1: number;
  rotSmallAxisY2: number;
  rotSmallAxisX0: number;
  rotSmallQuadA: number;
  rotSmallQuadB: number;
  rotSmallQuadC: number;
  rotSmallQuadD: number;
  rotSmallQuadE: number;
}

export const DEFAULT_BOOST_PAD_TUNER_CONFIG: BoostPadTunerConfig = {
  bottomOpacity: 0.08,
  topOpacity: 0,
  midpoint: 0.35,
  topCutoff: 0.35,
  power: 1,
  glowIntensity: 5,
  glowColor: '#d97e00',
  coreColor: '#ffe750',
  glowHeightOffsetBig: -0.01,
  glowHeightOffsetSmall: -0.05,
  orbRadius: 15,
  orbHeightOffset: 70,
  orbEmissiveIntensity: 5,
  orbColor: '#ffaa00',
  topColor: '#d2bb18',
  topInactiveColor: '#1c2026',
  sideColor: '#000000',
  sideFollowsBase: true,
  baseColor: '#888888',
  baseRoughness: 1,
  baseMetalness: 1,
  sideRoughness: 1,
  sideMetalness: 1,
  topRoughness: 1,
  topMetalness: 0,
  padHeightOffset: 7.5,
  shadowEnabled: true,
  shadowRadius: 10,
  shadowIntensity: 1,
  shadowDistanceScale: 0.012,
  refillEnabled: true,
  bigRefillThreshold: 3,
  smallRefillThreshold: 1,
  collectDuration: 300,
  bezierP1X: 0,
  bezierP1Y: -3,
  bezierP2X: 0,
  bezierP2Y: 1,
  orbCollectDuration: 200,
  orbDropDistance: 175,
  orbBezierP1X: 0,
  orbBezierP1Y: -1.15,
  orbBezierP2X: 0,
  orbBezierP2Y: 1,
  rotBigMid: -30,
  rotBigCorner: 15,
  rotSmallAxisY0: 0,
  rotSmallAxisY1: 0,
  rotSmallAxisY2: 60,
  rotSmallAxisX0: 30,
  rotSmallQuadA: 30,
  rotSmallQuadB: 30,
  rotSmallQuadC: -30,
  rotSmallQuadD: 30,
  rotSmallQuadE: 30,
};

export type TelemetryDisplayMode = 'off' | 'on_demand' | 'always';
export type TelemetryLatencyFormat = 'default' | 'advanced';

export interface TelemetryConfig {
  alwaysShow: boolean;
  pauseTelemetryInPowerSave?: boolean;
  fpsMode: TelemetryDisplayMode;
  refreshRateMode: TelemetryDisplayMode;
  renderScaleMode: TelemetryDisplayMode;
  physicsRateMode: TelemetryDisplayMode;
  latencyMode: TelemetryDisplayMode;
  latencyFormat?: TelemetryLatencyFormat;
}

export const DEFAULT_TELEMETRY_CONFIG: TelemetryConfig = {
  alwaysShow: true,
  pauseTelemetryInPowerSave: true,
  fpsMode: 'always',
  refreshRateMode: 'always',
  renderScaleMode: 'always',
  physicsRateMode: 'always',
  latencyMode: 'always',
  latencyFormat: 'default',
};

export const getInitialMargin = (): number => {
  const val = safeStorage.get(STORAGE_KEYS.SAFE_AREA_MARGIN);
  if (val !== null) {
    const num = parseInt(val, 10);
    if (!Number.isNaN(num)) return Math.min(10, Math.max(-5, num));
  }
  return 0;
};

export const getInitialUiScale = (): number => {
  const val = safeStorage.get(STORAGE_KEYS.UI_SCALE);
  if (val !== null) {
    const num = parseInt(val, 10);
    if (!Number.isNaN(num)) return Math.min(200, Math.max(50, num));
  }
  return 100;
};

export const getInitialSafeAreaHud = (): boolean => {
  return safeStorage.get(STORAGE_KEYS.SAFE_AREA_VISIBLE) === 'true';
};

export const getInitialTelemetry = (): TelemetryConfig => {
  const raw = safeStorage.get(STORAGE_KEYS.TELEMETRY_SETTINGS);
  if (raw) {
    try {
      const parsed = JSON.parse(raw);
      return { ...DEFAULT_TELEMETRY_CONFIG, ...parsed };
    } catch (err) {
      console.warn('[uiConfig] Failed to parse stored telemetry settings JSON, resetting to defaults:', err);
    }
  }
  return { ...DEFAULT_TELEMETRY_CONFIG };
};

export type TouchInputAgentMode = 'none' | 'necto' | 'nexto';

export const getInitialDeveloperMode = (): boolean => {
  if (typeof window === 'undefined') return false;
  try {
    const params = new URLSearchParams(window.location.search);
    return params.get('dev') === '1';
  } catch (err) {
    console.warn('[uiConfig] Failed to check developer mode URL params:', err);
    return false;
  }
};

export const getInitialTouchMode = (): boolean => {
  if (typeof window === 'undefined') return false;
  try {
    const params = new URLSearchParams(window.location.search);
    const touchParam = params.get('touch');
    return touchParam === '1' || touchParam === '2';
  } catch (err) {
    console.warn('[uiConfig] Failed to check touch mode URL params:', err);
    return false;
  }
};

export const getInitialTouchHeadlessMode = (): boolean => {
  if (typeof window === 'undefined') return false;
  try {
    const params = new URLSearchParams(window.location.search);
    return params.get('touch') === '2';
  } catch (err) {
    console.warn('[uiConfig] Failed to check touch headless mode URL params:', err);
    return false;
  }
};

export const getInitialBoostPadTuner = (): BoostPadTunerConfig => {
  const raw = safeStorage.get(STORAGE_KEYS.BOOST_PAD_TUNER);
  if (raw) {
    try {
      const parsed = JSON.parse(raw);
      if (parsed.collectDuration !== undefined && parsed.collectDuration <= 1.0) {
        parsed.collectDuration = Math.round(parsed.collectDuration * 1000);
      }
      if (parsed.orbCollectDuration !== undefined && parsed.orbCollectDuration <= 1.0) {
        parsed.orbCollectDuration = Math.round(parsed.orbCollectDuration * 1000);
      }
      return { ...DEFAULT_BOOST_PAD_TUNER_CONFIG, ...parsed };
    } catch (err) {
      console.warn('[uiConfig] Failed to parse stored boost pad tuner JSON:', err);
    }
  }
  return { ...DEFAULT_BOOST_PAD_TUNER_CONFIG };
};

export const getInitialDriftwoodsTuner = (): DriftwoodsTunerConfig => {
  const raw = safeStorage.get(STORAGE_KEYS.DRIFTWOODS_TUNER);
  if (raw) {
    try {
      const parsed = JSON.parse(raw);
      return mergeDriftwoodsConfig(DEFAULT_DRIFTWOODS_CONFIG, parsed);
    } catch (err) {
      console.warn('[uiConfig] Failed to parse stored driftwoods tuner JSON:', err);
    }
  }
  return cloneDriftwoodsConfig(DEFAULT_DRIFTWOODS_CONFIG);
};

export const getInitialInputBufferTarget = (): number => {
  const raw = safeStorage.get(STORAGE_KEYS.INPUT_BUFFER_TARGET);
  if (raw) {
    const parsed = parseInt(raw, 10);
    if (!isNaN(parsed) && parsed >= 1 && parsed <= 6) {
      return parsed;
    }
  }
  return 3;
};

export const getInitialInputBufferThreshold = (): [number, number] => {
  const alpha = getInitialInputBufferTarget();
  const raw = safeStorage.get(STORAGE_KEYS.INPUT_BUFFER_THRESHOLD);
  if (raw) {
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length === 2) {
        const rawCatchup = Number(parsed[0]);
        const rawSkip = Number(parsed[1]);
        if (Number.isFinite(rawCatchup) && Number.isFinite(rawSkip)) {
          const catchup = Math.max(-alpha, Math.min(0, Math.round(rawCatchup)));
          const skip = Math.min(alpha, Math.max(0, Math.round(rawSkip)));
          return [catchup || 0, skip || 0];
        }
      }
    } catch (err) {
      console.warn('[uiConfig] Failed to parse stored input buffer threshold JSON:', err);
    }
  }
  return [Math.max(-alpha, -2), Math.min(alpha, 2)];
};

export const getInitialFloatingOpacity = (): number => {
  const raw = safeStorage.get(STORAGE_KEYS.FLOATING_OPACITY);
  if (raw !== null) {
    const num = parseInt(valOrString(raw), 10);
    if (!Number.isNaN(num)) return Math.min(100, Math.max(1, num));
  }
  return 75;
};

function valOrString(v: string): string { return v; }

export const saveFloatingOpacity = (opacity: number): void => {
  const clamped = Math.min(100, Math.max(1, Math.round(opacity)));
  safeStorage.set(STORAGE_KEYS.FLOATING_OPACITY, String(clamped));
};
