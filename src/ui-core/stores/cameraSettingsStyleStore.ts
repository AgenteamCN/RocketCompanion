import { create } from "zustand";
import { syncBridge as crossClientSync } from "./syncBridge";
import {
  STORAGE_KEYS,
  readStorageJson,
  writeStorageJson,
  safeStorage,
} from "../config/storageHelpers";
import {
  createCameraSettingsStylePresets,
  createDefaultCameraSettingsStyleConfig,
  extractCameraSettingsSnapshot,
  type CameraBooleanControlType,
  type CameraCheckboxAnimStyle,
  type CameraCheckboxColorVariant,
  type CameraCheckboxIconStyle,
  type CameraCheckboxPlacement,
  type CameraLabelTextAlign,
  type CameraReadoutContainerMode,
  type CameraReadoutTextAlign,
  type CameraResetButtonMode,
  type CameraResetButtonStyle,
  type CameraResetButtonWidthMode,
  type CameraResetConfirmMode,
  type CameraSettingsPresetId,
  type CameraSettingsStyleConfig,
  type CameraSliderColorScheme,
} from "./cameraSettingsStylePresetsInternal";

export type {
  CameraSettingsPresetId,
  CameraReadoutContainerMode,
  CameraReadoutTextAlign,
  CameraLabelTextAlign,
  CameraBooleanControlType,
  CameraCheckboxPlacement,
  CameraCheckboxColorVariant,
  CameraCheckboxIconStyle,
  CameraCheckboxAnimStyle,
  CameraSliderColorScheme,
  CameraResetButtonMode,
  CameraResetButtonStyle,
  CameraResetButtonWidthMode,
  CameraResetConfirmMode,
  CameraSettingsStyleConfig,
};

export const DEFAULT_CAMERA_SETTINGS_STYLE_CONFIG: CameraSettingsStyleConfig =
  createDefaultCameraSettingsStyleConfig();

export const CAMERA_SETTINGS_STYLE_PRESETS = createCameraSettingsStylePresets(
  DEFAULT_CAMERA_SETTINGS_STYLE_CONFIG
);

const STORAGE_KEY = STORAGE_KEYS.CAMERA_SETTINGS_STYLE;
const SYNC_KEY = "store:cameraSettingsStyle:v1";

const normalizeConfig = (
  raw?: Partial<CameraSettingsStyleConfig>
): CameraSettingsStyleConfig => ({
  ...DEFAULT_CAMERA_SETTINGS_STYLE_CONFIG,
  ...(raw && typeof raw === "object" ? raw : {}),
});

const loadSavedConfig = (): CameraSettingsStyleConfig =>
  normalizeConfig(
    readStorageJson<Partial<CameraSettingsStyleConfig>>(
      STORAGE_KEY,
      DEFAULT_CAMERA_SETTINGS_STYLE_CONFIG
    )
  );

const saveConfig = (cfg: CameraSettingsStyleConfig) => {
  if (!crossClientSync.isApplyingRemote()) {
    crossClientSync.set(SYNC_KEY, cfg);
  }
  writeStorageJson(STORAGE_KEY, cfg);
};

const extractSnapshot = (s: CameraSettingsStyleConfig): CameraSettingsStyleConfig =>
  extractCameraSettingsSnapshot(s, DEFAULT_CAMERA_SETTINGS_STYLE_CONFIG);

export interface CameraSettingsStyleStore extends CameraSettingsStyleConfig {
  setParam: <K extends keyof CameraSettingsStyleConfig>(
    key: K,
    value: CameraSettingsStyleConfig[K]
  ) => void;
  updateParams: (patch: Partial<CameraSettingsStyleConfig>) => void;
  applyPreset: (presetId: CameraSettingsPresetId) => void;
  resetToDefaults: () => void;
  exportConfigCode: () => string;
}

const initialConfig = normalizeConfig(
  crossClientSync.get<CameraSettingsStyleConfig>(SYNC_KEY, loadSavedConfig())
);

export const useCameraSettingsStyleStore = create<CameraSettingsStyleStore>((set, get) => ({
  ...initialConfig,

  setParam: (key, value) => {
    set((state) => {
      const next = normalizeConfig({
        ...extractSnapshot(state),
        [key]: value,
      });
      saveConfig(next);
      return next;
    });
  },

  updateParams: (patch) => {
    set((state) => {
      const next = normalizeConfig({
        ...extractSnapshot(state),
        ...patch,
      });
      saveConfig(next);
      return next;
    });
  },

  applyPreset: (presetId) => {
    const found = CAMERA_SETTINGS_STYLE_PRESETS[presetId];
    if (!found) return;
    set((state) => {
      const next = normalizeConfig({
        ...extractSnapshot(state),
        ...found.patch,
        preset: presetId,
      });
      saveConfig(next);
      return next;
    });
  },

  resetToDefaults: () => {
    const fresh = { ...DEFAULT_CAMERA_SETTINGS_STYLE_CONFIG };
    saveConfig(fresh);
    set(() => fresh);
  },

  exportConfigCode: () => {
    const snapshot = extractSnapshot(get());
    return `export const DEFAULT_CAMERA_SETTINGS_STYLE_CONFIG: CameraSettingsStyleConfig = ${JSON.stringify(
      snapshot,
      null,
      2
    )};`;
  },
}));

crossClientSync.registerDefault(SYNC_KEY, { ...DEFAULT_CAMERA_SETTINGS_STYLE_CONFIG });

crossClientSync.onReset((scopePrefix) => {
  if (scopePrefix && !SYNC_KEY.startsWith(scopePrefix)) return;
  const fresh = { ...DEFAULT_CAMERA_SETTINGS_STYLE_CONFIG };
  safeStorage.remove(STORAGE_KEY);
  useCameraSettingsStyleStore.setState(fresh);
});

crossClientSync.subscribeKey<CameraSettingsStyleConfig>(SYNC_KEY, (remote) => {
  if (!remote || typeof remote !== "object") return;
  const merged = normalizeConfig(remote);
  writeStorageJson(STORAGE_KEY, merged);
  useCameraSettingsStyleStore.setState(merged);
});
