import { create } from 'zustand';
import {
  DEFAULT_NAME_TAG_CONFIG,
  DEFAULT_RUNTIME_SYNC_SNAPSHOT,
  KICKOFF_PERMUTATION_COUNT,
  NAME_TAG_STORAGE_KEY,
  createDefaultCarOverride,
  mapVariantPatchToConfigPatch,
  resolveNameTagVariantParams,
  type NameTagBoostBorderOverride,
  type NameTagCameraMode,
  type NameTagCarOverride,
  type NameTagCardDisplayMode,
  type NameTagCardVariantParams,
  type NameTagConfig,
  type NameTagFittedParameters,
  type NameTagRuntimeState,
  type NameTagRuntimeSyncSnapshot,
  type NameTagTelemetrySnapshot,
} from '../config/nameTagConfig';
import {
  buildNameTagCalibrationExportPayload as buildExportPayload,
  computeFittedParametersFromSamples as computeFittedFromSamples,
  mergeNameTagConfigPatch,
  sanitizeCarOverride,
  sanitizeConfig,
  sanitizeRuntimeSyncSnapshot,
} from '../config/nameTagCalibrationMath';
import { safeLocalStorageGet, safeLocalStorageSet, safeStorage } from '../config/storageHelpers';
import { getInitialDeveloperMode } from '../config/uiConfig';
import { syncBridge } from './syncBridge';

export type {
  NameTagBoostBorderOverride,
  NameTagCameraMode,
  NameTagCarOverride,
  NameTagCardVariantParams,
  NameTagConfig,
  NameTagFittedParameters,
  NameTagRuntimeState,
  NameTagRuntimeSyncSnapshot,
  NameTagTelemetrySnapshot,
};

const CONFIG_SYNC_KEY = 'store:nameTagConfig:v1';
const RUNTIME_SYNC_KEY = 'store:nameTagRuntime:v1';
const TELEMETRY_SYNC_KEY = 'store:nameTagTelemetry:v1';
const DEV_OFFSCREEN_MANUAL_OFF_KEY = 'rc_dev_quick_offscreen_manual_off_v1';

function loadSavedNameTagConfig(): NameTagConfig {
  const isDevMode = getInitialDeveloperMode();
  try {
    const raw = safeLocalStorageGet(NAME_TAG_STORAGE_KEY);
    if (!raw) return sanitizeConfig({ ...DEFAULT_NAME_TAG_CONFIG, offscreenIndicatorEnabled: isDevMode });
    const sanitized = sanitizeConfig(typeof raw === 'string' ? JSON.parse(raw) : raw);
    if (isDevMode && !sanitized.offscreenIndicatorEnabled && safeLocalStorageGet(DEV_OFFSCREEN_MANUAL_OFF_KEY) !== '1') {
      return { ...sanitized, offscreenIndicatorEnabled: true };
    }
    return sanitized;
  } catch {
    return sanitizeConfig({ ...DEFAULT_NAME_TAG_CONFIG, offscreenIndicatorEnabled: isDevMode });
  }
}

function persistNameTagConfig(config: NameTagConfig, broadcast = true): void {
  try {
    safeLocalStorageSet(NAME_TAG_STORAGE_KEY, JSON.stringify(config));
  } catch {}
  if (broadcast && !syncBridge.isApplyingRemote()) syncBridge.set(CONFIG_SYNC_KEY, config);
}

let currentConfig: NameTagConfig = sanitizeConfig(syncBridge.get<NameTagConfig>(CONFIG_SYNC_KEY, loadSavedNameTagConfig()));
const initialRuntimeSync = sanitizeRuntimeSyncSnapshot(syncBridge.get<NameTagRuntimeSyncSnapshot>(RUNTIME_SYNC_KEY, DEFAULT_RUNTIME_SYNC_SNAPSHOT));

let runtimeState: NameTagRuntimeState = {
  ...initialRuntimeSync,
  isMultiplayerOrMultiCarMode: false,
  carEntries: [],
  onEnterTunerArena: null,
  onExitTunerArena: null,
  onReshuffleKickoffPositions: null,
  onSelectPovCar: null,
  onFocusFreeCamOverview: null,
};

const DEFAULT_TELEMETRY_SNAPSHOT: NameTagTelemetrySnapshot = {
  updatedAtMs: 0,
  viewportWidthPx: 1920,
  viewportHeightPx: 1080,
  aspectRatio: 16 / 9,
  devicePixelRatio: 1,
  cameraMode: 'pov',
  focusedCarIndex: 0,
  cameraFovDeg: 110,
  cameraPosition: [0, 0, 0],
  cameraForward: [0, 0, -1],
  cameraUp: [0, 1, 0],
  cars: [],
};

let latestTelemetrySnapshot: NameTagTelemetrySnapshot = syncBridge.get<NameTagTelemetrySnapshot>(TELEMETRY_SYNC_KEY, DEFAULT_TELEMETRY_SNAPSHOT);
const configListeners = new Set<() => void>();
const telemetryListeners = new Set<(snapshot: NameTagTelemetrySnapshot) => void>();

function extractRuntimeSyncSnapshot(s: NameTagRuntimeState): NameTagRuntimeSyncSnapshot {
  return {
    isTunerArenaActive: s.isTunerArenaActive,
    kickoffPermutationIndex: s.kickoffPermutationIndex,
    activeCameraMode: s.activeCameraMode,
    focusedCarIndex: s.focusedCarIndex,
    selectedCalibrationCarIndex: s.selectedCalibrationCarIndex,
    boostBorderOverride: s.boostBorderOverride,
  };
}

export function notifyNameTagListeners(): void {
  useNameTagTunerStore.setState({ config: currentConfig, ...extractRuntimeSyncSnapshot(runtimeState) });
  for (const listener of configListeners) {
    try {
      listener();
    } catch {}
  }
}

export function getNameTagConfig(): NameTagConfig {
  return currentConfig;
}

export function updateNameTagConfig(
  patch: Partial<NameTagConfig>,
  options?: { fromCloudSync?: boolean; fromDevAutoActivate?: boolean }
): NameTagConfig {
  if (typeof patch.offscreenIndicatorEnabled === 'boolean' && !options?.fromCloudSync && !options?.fromDevAutoActivate && !syncBridge.isApplyingRemote()) {
    try {
      safeLocalStorageSet(DEV_OFFSCREEN_MANUAL_OFF_KEY, patch.offscreenIndicatorEnabled ? '0' : '1');
    } catch {}
  }
  currentConfig = mergeNameTagConfigPatch(currentConfig, patch);
  persistNameTagConfig(currentConfig, true);
  notifyNameTagListeners();
  return currentConfig;
}

export function updateActiveNameTagVariant(patch: Partial<NameTagCardVariantParams>): NameTagConfig {
  return updateNameTagConfig(mapVariantPatchToConfigPatch(currentConfig.cardDisplayMode === 'single-char', patch));
}

export function copyNameTagVariantParameters(fromMode: NameTagCardDisplayMode, toMode: NameTagCardDisplayMode): NameTagConfig {
  const source = resolveNameTagVariantParams(currentConfig, fromMode === 'single-char');
  return updateNameTagConfig(
    mapVariantPatchToConfigPatch(toMode === 'single-char', { ...source, carOverrides: source.carOverrides.map((ov) => ({ ...ov })) })
  );
}

export function activateNameTagOffscreenForDeveloperMode(): void {
  if (safeLocalStorageGet(DEV_OFFSCREEN_MANUAL_OFF_KEY) === '1') return;
  if (!currentConfig.offscreenIndicatorEnabled) updateNameTagConfig({ offscreenIndicatorEnabled: true }, { fromDevAutoActivate: true });
}

export function updateNameTagCarOverride(carIndex: number, patch: Partial<NameTagCarOverride>): NameTagConfig {
  const isSingleChar = currentConfig.cardDisplayMode === 'single-char';
  const v = resolveNameTagVariantParams(currentConfig, isSingleChar);
  const next = v.carOverrides.map((e, i) => (i === carIndex ? sanitizeCarOverride({ ...e, ...patch }, v.verticalOffsetUu, v.screenVerticalOffsetPx) : e));
  return updateNameTagConfig(mapVariantPatchToConfigPatch(isSingleChar, { carOverrides: next }));
}

export function resetNameTagCarOverride(carIndex: number): NameTagConfig {
  const isSingleChar = currentConfig.cardDisplayMode === 'single-char';
  const v = resolveNameTagVariantParams(currentConfig, isSingleChar);
  const next = v.carOverrides.map((e, i) => (i === carIndex ? createDefaultCarOverride(v.verticalOffsetUu, v.screenVerticalOffsetPx) : e));
  return updateNameTagConfig(mapVariantPatchToConfigPatch(isSingleChar, { carOverrides: next }));
}

export function resetAllNameTagCarOverrides(): NameTagConfig {
  const isSingleChar = currentConfig.cardDisplayMode === 'single-char';
  const v = resolveNameTagVariantParams(currentConfig, isSingleChar);
  const next = Array.from({ length: 6 }, () => createDefaultCarOverride(v.verticalOffsetUu, v.screenVerticalOffsetPx));
  return updateNameTagConfig(mapVariantPatchToConfigPatch(isSingleChar, { carOverrides: next }));
}

export function resetNameTagConfig(): NameTagConfig {
  try {
    safeLocalStorageSet(DEV_OFFSCREEN_MANUAL_OFF_KEY, '0');
  } catch {}
  currentConfig = sanitizeConfig({ ...DEFAULT_NAME_TAG_CONFIG, offscreenIndicatorEnabled: getInitialDeveloperMode() });
  persistNameTagConfig(currentConfig, true);
  notifyNameTagListeners();
  return currentConfig;
}

export function subscribeNameTagConfig(listener: () => void): () => void {
  configListeners.add(listener);
  return () => configListeners.delete(listener);
}

export function getNameTagRuntimeState(): NameTagRuntimeState {
  return runtimeState;
}

export function setNameTagRuntimeState(patch: Partial<NameTagRuntimeState>): NameTagRuntimeState {
  const prev = extractRuntimeSyncSnapshot(runtimeState);
  runtimeState = { ...runtimeState, ...patch };
  const next = sanitizeRuntimeSyncSnapshot(extractRuntimeSyncSnapshot(runtimeState));
  runtimeState = { ...runtimeState, ...next };
  const changed =
    prev.isTunerArenaActive !== next.isTunerArenaActive ||
    prev.kickoffPermutationIndex !== next.kickoffPermutationIndex ||
    prev.activeCameraMode !== next.activeCameraMode ||
    prev.focusedCarIndex !== next.focusedCarIndex ||
    prev.selectedCalibrationCarIndex !== next.selectedCalibrationCarIndex ||
    prev.boostBorderOverride !== next.boostBorderOverride;
  if (changed && !syncBridge.isApplyingRemote()) syncBridge.set(RUNTIME_SYNC_KEY, next);
  notifyNameTagListeners();
  return runtimeState;
}

export function setNameTagTelemetrySnapshot(snapshot: NameTagTelemetrySnapshot, broadcast = true): void {
  latestTelemetrySnapshot = snapshot;
  if (broadcast && !syncBridge.isApplyingRemote()) syncBridge.set(TELEMETRY_SYNC_KEY, snapshot);
  for (const listener of telemetryListeners) listener(snapshot);
}

export function getNameTagTelemetrySnapshot(): NameTagTelemetrySnapshot {
  return latestTelemetrySnapshot;
}

export function subscribeNameTagTelemetry(listener: (snapshot: NameTagTelemetrySnapshot) => void): () => void {
  telemetryListeners.add(listener);
  return () => telemetryListeners.delete(listener);
}

export function computeFittedParametersFromSamples(): NameTagFittedParameters {
  return computeFittedFromSamples(getNameTagConfig(), latestTelemetrySnapshot);
}

export function applyFittedParametersFromCarOverrides(): NameTagConfig {
  const f = computeFittedParametersFromSamples();
  const isSingleChar = currentConfig.cardDisplayMode === 'single-char';
  const next = Array.from({ length: 6 }, () => createDefaultCarOverride(f.verticalOffsetUu, f.screenVerticalOffsetPx));
  return updateNameTagConfig(
    mapVariantPatchToConfigPatch(isSingleChar, {
      cameraScaleFactor: f.cameraScaleFactor,
      distanceScaleExponent: f.distanceScaleExponent,
      nearScaleMultiplier: f.nearScaleMultiplier,
      farScaleMultiplier: f.farScaleMultiplier,
      verticalOffsetUu: f.verticalOffsetUu,
      screenVerticalOffsetPx: f.screenVerticalOffsetPx,
      carOverrides: next,
    })
  );
}

export function buildNameTagCalibrationExportPayload() {
  return buildExportPayload(getNameTagConfig(), getNameTagTelemetrySnapshot(), runtimeState.kickoffPermutationIndex);
}

export interface NameTagTunerStoreState {
  config: NameTagConfig;
  isTunerArenaActive: boolean;
  kickoffPermutationIndex: number;
  activeCameraMode: NameTagCameraMode;
  focusedCarIndex: number;
  selectedCalibrationCarIndex: number;
  boostBorderOverride: NameTagBoostBorderOverride;
  updateConfig: (patch: Partial<NameTagConfig>) => void;
  updateActiveVariant: (patch: Partial<NameTagCardVariantParams>) => void;
  copyVariantParameters: (fromMode: NameTagCardDisplayMode, toMode: NameTagCardDisplayMode) => void;
  updatePreviewName: (index: number, name: string) => void;
  updatePreviewBoostAmount: (index: number, boostAmount: number) => void;
  updatePreviewAerialClimbingFlag: (index: number, climbing: boolean) => void;
  setBoostBorderOverride: (override: NameTagBoostBorderOverride) => void;
  selectCalibrationCar: (carIndex: number) => void;
  updateCarOverride: (carIndex: number, patch: Partial<NameTagCarOverride>) => void;
  resetCarOverride: (carIndex: number) => void;
  resetAllCarOverrides: () => void;
  applyFittedFromCarOverrides: () => void;
  exportCalibrationJson: () => string;
  resetConfig: () => void;
  enterTunerArenaAndSpawnSixCars: () => void;
  exitTunerArena: () => void;
  reshuffleKickoffPositions: () => void;
  selectPovCar: (carIndex: number) => void;
  focusFreeCamOverview: () => void;
}

export const useNameTagTunerStore = create<NameTagTunerStoreState>((_set, get) => ({
  config: currentConfig,
  ...extractRuntimeSyncSnapshot(runtimeState),
  updateConfig: (patch) => updateNameTagConfig(patch),
  updateActiveVariant: (patch) => updateActiveNameTagVariant(patch),
  copyVariantParameters: (fromMode, toMode) => copyNameTagVariantParameters(fromMode, toMode),
  updatePreviewName: (index, name) => {
    const next = [...get().config.previewNames];
    if (index >= 0 && index < 6) next[index] = name;
    updateNameTagConfig({ previewNames: next });
  },
  updatePreviewBoostAmount: (index, boostAmount) => {
    const next = [...get().config.previewBoostAmounts];
    if (index >= 0 && index < 6) next[index] = Math.max(0, Math.min(100, Math.round(Number(boostAmount) || 0)));
    updateNameTagConfig({ previewBoostAmounts: next });
  },
  updatePreviewAerialClimbingFlag: (index, climbing) => {
    const next = [...(get().config.previewAerialClimbingFlags || [])];
    if (index >= 0 && index < 6) next[index] = Boolean(climbing);
    updateNameTagConfig({ previewAerialClimbingFlags: next });
  },
  setBoostBorderOverride: (override) => setNameTagRuntimeState({ boostBorderOverride: override }),
  selectCalibrationCar: (carIndex) => setNameTagRuntimeState({ selectedCalibrationCarIndex: Math.max(0, Math.min(5, Math.round(Number(carIndex) || 0))) }),
  updateCarOverride: (carIndex, patch) => updateNameTagCarOverride(carIndex, patch),
  resetCarOverride: (carIndex) => resetNameTagCarOverride(carIndex),
  resetAllCarOverrides: () => resetAllNameTagCarOverrides(),
  applyFittedFromCarOverrides: () => applyFittedParametersFromCarOverrides(),
  exportCalibrationJson: () => JSON.stringify(buildNameTagCalibrationExportPayload(), null, 2),
  resetConfig: () => resetNameTagConfig(),
  enterTunerArenaAndSpawnSixCars: () => {
    setNameTagRuntimeState({ isTunerArenaActive: true, activeCameraMode: 'pov', focusedCarIndex: 0 });
    runtimeState.onEnterTunerArena?.();
  },
  exitTunerArena: () => {
    setNameTagRuntimeState({ isTunerArenaActive: false, activeCameraMode: 'free' });
    runtimeState.onExitTunerArena?.();
  },
  reshuffleKickoffPositions: () => {
    const nextIndex = (runtimeState.kickoffPermutationIndex + 1) % KICKOFF_PERMUTATION_COUNT;
    setNameTagRuntimeState({ isTunerArenaActive: true, kickoffPermutationIndex: nextIndex });
    runtimeState.onReshuffleKickoffPositions?.();
  },
  selectPovCar: (carIndex) => {
    const idx = Math.max(0, Math.min(5, Math.round(Number(carIndex) || 0)));
    setNameTagRuntimeState({ isTunerArenaActive: true, activeCameraMode: 'pov', focusedCarIndex: idx });
    runtimeState.onSelectPovCar?.(idx);
  },
  focusFreeCamOverview: () => {
    setNameTagRuntimeState({ isTunerArenaActive: true, activeCameraMode: 'free' });
    runtimeState.onFocusFreeCamOverview?.();
  },
}));

syncBridge.registerDefault(CONFIG_SYNC_KEY, sanitizeConfig(DEFAULT_NAME_TAG_CONFIG));
syncBridge.registerDefault(RUNTIME_SYNC_KEY, { ...DEFAULT_RUNTIME_SYNC_SNAPSHOT });
syncBridge.registerDefault(TELEMETRY_SYNC_KEY, DEFAULT_TELEMETRY_SNAPSHOT);

syncBridge.onReset((scopePrefix) => {
  if (!scopePrefix || CONFIG_SYNC_KEY.startsWith(scopePrefix)) {
    currentConfig = sanitizeConfig(DEFAULT_NAME_TAG_CONFIG);
    safeStorage.remove(NAME_TAG_STORAGE_KEY);
  }
  if (!scopePrefix || RUNTIME_SYNC_KEY.startsWith(scopePrefix)) {
    runtimeState = { ...runtimeState, ...DEFAULT_RUNTIME_SYNC_SNAPSHOT };
  }
  notifyNameTagListeners();
});

syncBridge.subscribeKey<NameTagConfig>(CONFIG_SYNC_KEY, (remote) => {
  if (!remote || typeof remote !== 'object') return;
  currentConfig = sanitizeConfig(remote);
  persistNameTagConfig(currentConfig, false);
  notifyNameTagListeners();
});

syncBridge.subscribeKey<NameTagRuntimeSyncSnapshot>(RUNTIME_SYNC_KEY, (remote) => {
  if (!remote || typeof remote !== 'object') return;
  runtimeState = { ...runtimeState, ...sanitizeRuntimeSyncSnapshot(remote) };
  notifyNameTagListeners();
});

syncBridge.subscribeKey<NameTagTelemetrySnapshot>(TELEMETRY_SYNC_KEY, (remote) => {
  if (!remote || typeof remote !== 'object' || !Array.isArray(remote.cars)) return;
  latestTelemetrySnapshot = remote;
  for (const listener of telemetryListeners) listener(remote);
});
