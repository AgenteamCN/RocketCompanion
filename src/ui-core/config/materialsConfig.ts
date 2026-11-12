/**
 * materialsConfig.ts
 * Centralized materials and shader appearance configuration and persistence.
 */

import { safeStorage, STORAGE_KEYS } from './storageHelpers';
import { applyVehiclePaintFinishPreset } from './vehicleTunerConfig';
import { getAudioSettings, setAllBoostAudioVariations } from './audioConfig';

export const MATERIALS_STORAGE_KEY = STORAGE_KEYS.MATERIALS;

export interface MaterialsConfigState {
  ballStyle: 'football' | 'rocket-league';
  carPaint: 'cartoon' | 'anodized';
  paintFinish: 'matte' | 'metallic';
  demolishedEffect: 'shockwave';
  boostVisual: 'cartoon' | 'gold-rush' | 'light-beam' | 'light-wave' | 'custom';
  boostAudio: 'rush' | 'standard' | 'flamethrower' | 'plasma';
  boostFlameLuminance: 'balanced' | 'dynamic';
  boostPlumeLuminance: 'min' | 'balanced' | 'dynamic' | 'hdr';
  [key: string]: unknown;
}

const MATERIALS_BOOST_SCHEMA_VERSION = 2;

export const DEFAULT_MATERIALS_CONFIG: MaterialsConfigState = {
  ballStyle: 'football',
  carPaint: 'cartoon',
  paintFinish: 'metallic',
  demolishedEffect: 'shockwave',
  boostVisual: 'light-wave',
  boostAudio: 'rush',
  boostFlameLuminance: 'balanced',
  boostPlumeLuminance: 'min',
};

let activeMaterials: MaterialsConfigState = (() => {
  const raw = safeStorage.get(MATERIALS_STORAGE_KEY);
  if (raw) {
    try {
      const rawObj = JSON.parse(raw) as Record<string, unknown>;
      const parsed: MaterialsConfigState = { ...DEFAULT_MATERIALS_CONFIG, ...rawObj };
      parsed.demolishedEffect = 'shockwave';
      if (parsed.paintFinish !== 'matte' && parsed.paintFinish !== 'metallic') {
        parsed.paintFinish = 'metallic';
      }
      if (
        rawObj._boostVisualSchemaVersion !== MATERIALS_BOOST_SCHEMA_VERSION ||
        parsed.boostVisual === 'custom' ||
        (parsed.boostVisual !== 'cartoon' &&
          parsed.boostVisual !== 'gold-rush' &&
          parsed.boostVisual !== 'light-beam' &&
          parsed.boostVisual !== 'light-wave')
      ) {
        parsed.boostVisual = 'light-wave';
      }
      if (!parsed.boostAudio) {
        const audioCfg = getAudioSettings?.();
        const rawVar = audioCfg?.boostStartVariation;
        parsed.boostAudio =
          rawVar === 'standard' || rawVar === 'flamethrower' || rawVar === 'plasma' ? rawVar : 'rush';
      }
      applyVehiclePaintFinishPreset(parsed.paintFinish);
      return parsed;
    } catch (err) {
      console.warn('[materialsConfig] Failed to parse stored materials config:', err);
    }
  }
  const audioCfg = getAudioSettings?.();
  const rawInitial = audioCfg?.boostStartVariation;
  const initialBoostAudio: MaterialsConfigState['boostAudio'] =
    rawInitial === 'standard' || rawInitial === 'flamethrower' || rawInitial === 'plasma'
      ? rawInitial
      : DEFAULT_MATERIALS_CONFIG.boostAudio;
  applyVehiclePaintFinishPreset(DEFAULT_MATERIALS_CONFIG.paintFinish);
  return { ...DEFAULT_MATERIALS_CONFIG, boostAudio: initialBoostAudio };
})();

type MaterialsListener = (materials: MaterialsConfigState) => void;
const materialsCallbacks: MaterialsListener[] = [];

export function getMaterialsConfig(): MaterialsConfigState {
  return activeMaterials;
}

export function setMaterialsConfig(
  partialConfig: Partial<MaterialsConfigState>,
  persist = true
): void {
  if (
    partialConfig &&
    (partialConfig.paintFinish === 'matte' || partialConfig.paintFinish === 'metallic')
  ) {
    applyVehiclePaintFinishPreset(partialConfig.paintFinish);
  }
  if (partialConfig && typeof partialConfig.boostAudio === 'string' && partialConfig.boostAudio) {
    setAllBoostAudioVariations(partialConfig.boostAudio);
  }
  activeMaterials = {
    ...activeMaterials,
    ...partialConfig,
    _boostVisualSchemaVersion: MATERIALS_BOOST_SCHEMA_VERSION,
  };
  if (persist) {
    safeStorage.set(MATERIALS_STORAGE_KEY, JSON.stringify(activeMaterials));
  }
  for (const listener of materialsCallbacks) {
    try {
      listener(activeMaterials);
    } catch (err) {
      console.error('[materialsConfig] materialsConfig listener error:', err);
    }
  }
}

export function onMaterialsConfigChange(listener: MaterialsListener): () => boolean {
  if (!materialsCallbacks.includes(listener)) {
    materialsCallbacks.push(listener);
  }
  return () => {
    const idx = materialsCallbacks.indexOf(listener);
    if (idx === -1) return false;
    materialsCallbacks.splice(idx, 1);
    return true;
  };
}

export function getInitialMaterials(): MaterialsConfigState {
  return getMaterialsConfig() || { ...DEFAULT_MATERIALS_CONFIG };
}
