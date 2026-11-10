/**
 * vehiclePresets.ts
 * Standard RocketSim vehicle hitbox presets, visual identifiers, and color preference persistence.
 * Decoupled from UI layer to eliminate inverted dependencies.
 */

import { STORAGE_KEYS, safeStorage, createLocalStorageStore, stringOrDefault } from './storageHelpers';
import { CAR_VISUAL_IDS, type HitboxPresetSpec } from './vehicleConstants';

export const HITBOX_PRESETS: Readonly<Record<string, Readonly<HitboxPresetSpec>>> = Object.freeze({
  'hitbox-octane': Object.freeze({
    index: 0,
    id: 'hitbox-octane',
    name: 'Octane',
    length: 120.507,
    width: 86.6994,
    height: 38.6591,
    forward: 13.8757,
    up: 20.755,
  }),
  'hitbox-dominus': Object.freeze({
    index: 1,
    id: 'hitbox-dominus',
    name: 'Dominus',
    length: 130.427,
    width: 85.7799,
    height: 33.8,
    forward: 9.0,
    up: 15.75,
  }),
  'hitbox-plank': Object.freeze({
    index: 2,
    id: 'hitbox-plank',
    name: 'Batmobile (Plank)',
    length: 131.32,
    width: 87.1704,
    height: 31.8944,
    forward: 9.00857,
    up: 12.0942,
  }),
  'hitbox-breakout': Object.freeze({
    index: 3,
    id: 'hitbox-breakout',
    name: 'Breakout',
    length: 133.992,
    width: 83.021,
    height: 32.8,
    forward: 12.5,
    up: 11.75,
  }),
  'hitbox-hybrid': Object.freeze({
    index: 4,
    id: 'hitbox-hybrid',
    name: 'Hybrid',
    length: 129.519,
    width: 84.6879,
    height: 36.6591,
    forward: 13.8757,
    up: 20.755,
  }),
  'hitbox-merc': Object.freeze({
    index: 5,
    id: 'hitbox-merc',
    name: 'Merc',
    length: 123.22,
    width: 79.2103,
    height: 44.1591,
    forward: 11.3757,
    up: 21.505,
  }),
});

export const STORAGE_KEY_DISPLAY_SETTINGS = STORAGE_KEYS.DISPLAY_SETTINGS;
export const COLOR_PREFS_KEY = STORAGE_KEYS.COLOR_PREFS;

export const COLOR_SLOT_HEX_MAP: Readonly<Record<number, string>> = Object.freeze({
  0: '#ff7043',
  1: '#66bb6a',
  2: '#ffc107',
  3: '#42a5f5',
  4: '#fd6e9d',
  5: '#ba68c8',
});

export interface GarageSettingsState {
  vehiclePreset: string;
  carVisual: string;
}

export const DEFAULT_GARAGE_SETTINGS_CONFIG: GarageSettingsState = {
  vehiclePreset: 'fennec',
  carVisual: 'fennec',
};

export const garageSettingsStore = createLocalStorageStore<GarageSettingsState>(
  STORAGE_KEY_DISPLAY_SETTINGS,
  () => ({ ...DEFAULT_GARAGE_SETTINGS_CONFIG }),
  (target, stored) => {
    target.vehiclePreset = stringOrDefault(
      stored.vehiclePreset || stored.carVisual,
      CAR_VISUAL_IDS,
      target.vehiclePreset
    );
    target.carVisual = target.vehiclePreset;
  }
);

export function getInitialCar(): string {
  return garageSettingsStore.load().vehiclePreset || 'fennec';
}

export interface StoredColorPrefs {
  primaryTeam: 'blue' | 'orange';
  blueOrder: number[];
  orangeOrder: number[];
}

export function loadStoredColorPrefs(): StoredColorPrefs {
  try {
    const raw = safeStorage.get(COLOR_PREFS_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && Array.isArray(parsed.blueOrder) && Array.isArray(parsed.orangeOrder)) {
        return {
          primaryTeam: parsed.primaryTeam === 'blue' ? 'blue' : 'orange',
          blueOrder: parsed.blueOrder,
          orangeOrder: parsed.orangeOrder,
        };
      }
    }
  } catch (err) {
    console.warn('[vehiclePresets] Failed to load stored color preferences:', err);
  }
  return {
    primaryTeam: 'orange',
    orangeOrder: [2, 4, 0],
    blueOrder: [1, 5, 3],
  };
}

export function getPreferredColorSlot(
  prefs?: StoredColorPrefs | null,
  assignedTeam?: 0 | 1 | null
): number {
  const effective =
    prefs && (prefs.primaryTeam === 'blue' || prefs.primaryTeam === 'orange')
      ? prefs
      : loadStoredColorPrefs();
  const targetTeam =
    assignedTeam === 0 || assignedTeam === 1
      ? assignedTeam
      : effective.primaryTeam === 'blue'
      ? 0
      : 1;
  const slot = targetTeam === 0 ? effective.blueOrder?.[0] : effective.orangeOrder?.[0];
  const fallbackSlot = targetTeam === 0 ? 3 : 2;
  return typeof slot === 'number' && COLOR_SLOT_HEX_MAP[slot] !== undefined ? slot : fallbackSlot;
}

export function getPreferredColorHex(
  prefs?: StoredColorPrefs | null,
  assignedTeam?: 0 | 1 | null
): string {
  const slot = getPreferredColorSlot(prefs, assignedTeam);
  return COLOR_SLOT_HEX_MAP[slot] || (assignedTeam === 0 ? '#42a5f5' : '#ffc107');
}

export function getPreferredFreeplayTeam(prefs?: StoredColorPrefs | null): 0 | 1 {
  const effective =
    prefs && (prefs.primaryTeam === 'blue' || prefs.primaryTeam === 'orange')
      ? prefs
      : loadStoredColorPrefs();
  return effective.primaryTeam === 'orange' ? 1 : 0;
}

export function saveStoredColorPrefs(nextPrefs: StoredColorPrefs): number {
  const activeSlotId = getPreferredColorSlot(nextPrefs);
  safeStorage.set(COLOR_PREFS_KEY, JSON.stringify(nextPrefs));
  return activeSlotId;
}

export function generateRandomFourDigits(): string {
  return String(Math.floor(1000 + Math.random() * 9000));
}

export function generateDefaultPlayerName(): string {
  return `Player${generateRandomFourDigits()}`;
}

export function loadStoredPlayerName(fallback?: string): string {
  const saved = safeStorage.get(STORAGE_KEYS.PLAYER_NAME);
  if (saved && saved.trim()) {
    const trimmed = saved.trim().substring(0, 24);
    if (
      trimmed !== 'Host' &&
      trimmed !== 'Player' &&
      trimmed !== 'Player_01' &&
      trimmed !== 'Player_02'
    ) {
      return trimmed;
    }
  }
  const resolved =
    fallback &&
    fallback !== 'Host' &&
    fallback !== 'Player' &&
    fallback !== 'Player_01' &&
    fallback !== 'Player_02'
      ? fallback
      : generateDefaultPlayerName();
  safeStorage.set(STORAGE_KEYS.PLAYER_NAME, resolved);
  return resolved;
}

export function saveStoredPlayerName(name: string): void {
  const trimmed = String(name || '').trim();
  if (trimmed) {
    safeStorage.set(STORAGE_KEYS.PLAYER_NAME, trimmed);
  }
}
