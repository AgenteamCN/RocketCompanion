import { create } from 'zustand';
import {
  STORAGE_KEYS,
  readStorageJson,
  writeStorageJson,
} from '../config/storageHelpers';
import {
  DEFAULT_KEYBOARD_INPUT_OVERLAY_CONFIG,
  normalizeKeyboardInputOverlayConfig,
  setKeyboardInputOverlayRuntimeConfig,
  type KeyboardInputOverlayConfig,
  type NoseArrowColorSource,
} from '../config/keyboardInputOverlayConfig';
import type { KeyboardInputOverlayTelemetry } from '../config/keyboardInputOverlayTelemetry';

export type {
  KeyboardInputOverlayConfig,
  KeyboardInputOverlayTelemetry,
  NoseArrowColorSource,
};

const STORAGE_KEY = STORAGE_KEYS.KEYBOARD_INPUT_OVERLAY;

function loadInitialKeyboardOverlayConfig(): KeyboardInputOverlayConfig {
  const raw = readStorageJson<Partial<KeyboardInputOverlayConfig>>(
    STORAGE_KEY,
    DEFAULT_KEYBOARD_INPUT_OVERLAY_CONFIG
  );
  const normalized = normalizeKeyboardInputOverlayConfig(raw);
  setKeyboardInputOverlayRuntimeConfig(normalized);
  return normalized;
}

function extractSerializableConfig(
  state: KeyboardInputOverlayConfig
): KeyboardInputOverlayConfig {
  return normalizeKeyboardInputOverlayConfig(state);
}

export interface KeyboardInputOverlayStoreState extends KeyboardInputOverlayConfig {
  updateConfig: (patch: Partial<KeyboardInputOverlayConfig>) => void;
  resetDefaults: () => void;
  exportConfigJson: () => string;
  importConfigJson: (jsonText: string) => boolean;
}

export const useKeyboardInputOverlayStore = create<KeyboardInputOverlayStoreState>(
  (set, get) => ({
    ...loadInitialKeyboardOverlayConfig(),
    updateConfig: (patch) => {
      const merged = normalizeKeyboardInputOverlayConfig({
        ...extractSerializableConfig(get()),
        ...patch,
      });
      setKeyboardInputOverlayRuntimeConfig(merged);
      writeStorageJson(STORAGE_KEY, merged);
      set(merged);
    },
    resetDefaults: () => {
      const next = normalizeKeyboardInputOverlayConfig(
        DEFAULT_KEYBOARD_INPUT_OVERLAY_CONFIG
      );
      setKeyboardInputOverlayRuntimeConfig(next);
      writeStorageJson(STORAGE_KEY, next);
      set(next);
    },
    exportConfigJson: () => {
      const clean = extractSerializableConfig(get());
      return JSON.stringify(clean, null, 2);
    },
    importConfigJson: (jsonText: string) => {
      try {
        const parsed = JSON.parse(jsonText);
        if (!parsed || typeof parsed !== 'object') return false;
        const merged = normalizeKeyboardInputOverlayConfig({
          ...extractSerializableConfig(get()),
          ...(parsed as Partial<KeyboardInputOverlayConfig>),
        });
        setKeyboardInputOverlayRuntimeConfig(merged);
        writeStorageJson(STORAGE_KEY, merged);
        set(merged);
        return true;
      } catch {
        return false;
      }
    },
  })
);

