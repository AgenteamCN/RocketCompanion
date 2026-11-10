/**
 * anthemCatalogConfig.ts
 * Goal Anthem Catalog (58 Stingers + No Anthem default + Random Anthem preferences)
 * and localStorage persistence helpers.
 */

import { STORAGE_KEYS, safeStorage, isPlainObject } from './storageHelpers';

export interface AnthemDef {
  id: string;
  title: string;
  artist: string;
  category: string;
  number: string;
  duration: string;
  durationSec: number;
  tag: string;
  file: string | null;
}

export interface AnthemCategoryDef {
  id: string;
  label: string;
  arenaName: string;
}

export const ANTHEM_CATEGORIES: readonly AnthemCategoryDef[] = Object.freeze([
  { id: 'all', label: 'All', arenaName: 'All Arenas' },
  { id: 'Aquatic', label: 'Aquatic', arenaName: 'AquaDome' },
  { id: 'Arena', label: 'Arena', arenaName: 'DFH Stadium' },
  { id: 'Breakout', label: 'Breakout', arenaName: 'Throwback Arcade' },
  { id: 'CelebrationStadium', label: 'Celebration', arenaName: 'Champions Field' },
  { id: 'Farm', label: 'Farm', arenaName: 'Farmstead' },
  { id: 'Park', label: 'Park', arenaName: 'Beckwith Park' },
  { id: 'Space', label: 'Space', arenaName: 'Starbase ARC' },
  { id: 'Space_Dark', label: 'Space Dark', arenaName: 'Starbase Aftermath' },
  { id: 'Street', label: 'Street', arenaName: 'Urban Central' },
  { id: 'TrainStation', label: 'Train Station', arenaName: 'Urban Station' },
  { id: 'Utopia_Lux', label: 'Utopia Lux', arenaName: 'Utopia Coliseum' },
]);

export const ANTHEM_SPECIFIC_CATEGORIES: readonly AnthemCategoryDef[] = Object.freeze(
  ANTHEM_CATEGORIES.filter((cat) => cat.id !== 'all')
);

export type RandomAnthemScope = 'all' | 'specific';

export const DEFAULT_ANTHEM_ID = 'random';
export const DEFAULT_RANDOM_ANTHEM_SCOPE: RandomAnthemScope = 'specific';
export const DEFAULT_RANDOM_ANTHEM_CATEGORY = 'TrainStation';

export interface StoredRandomAnthemPrefs {
  scope: RandomAnthemScope;
  category: string;
}

export const DEFAULT_ANTHEM_CATALOG_CONFIG = {
  anthemId: DEFAULT_ANTHEM_ID,
  randomScope: DEFAULT_RANDOM_ANTHEM_SCOPE,
  randomCategory: DEFAULT_RANDOM_ANTHEM_CATEGORY,
};

export const DEFAULT_STORED_RANDOM_ANTHEM_PREFS: StoredRandomAnthemPrefs = Object.freeze({
  scope: DEFAULT_RANDOM_ANTHEM_SCOPE,
  category: DEFAULT_RANDOM_ANTHEM_CATEGORY,
});

interface RawStingerEntry {
  id: string;
  category: string;
  number: string;
  durationSec: number;
  duration: string;
}

const RAW_STINGER_ENTRIES: readonly RawStingerEntry[] = Object.freeze([
  { id: 'MX_Aquatic_Stingers_0003', category: 'Aquatic', number: '0003', durationSec: 5.4, duration: '0:05' },
  { id: 'MX_Aquatic_Stingers_0006', category: 'Aquatic', number: '0006', durationSec: 5.5, duration: '0:05' },
  { id: 'MX_Aquatic_Stingers_0007', category: 'Aquatic', number: '0007', durationSec: 5.5, duration: '0:05' },
  { id: 'MX_Aquatic_Stingers_0008', category: 'Aquatic', number: '0008', durationSec: 5.4, duration: '0:05' },
  { id: 'MX_Arena_Stingers_0003', category: 'Arena', number: '0003', durationSec: 13.0, duration: '0:13' },
  { id: 'MX_Arena_Stingers_0005', category: 'Arena', number: '0005', durationSec: 12.0, duration: '0:12' },
  { id: 'MX_Arena_Stingers_0009', category: 'Arena', number: '0009', durationSec: 7.6, duration: '0:08' },
  { id: 'MX_Arena_Stingers_0015', category: 'Arena', number: '0015', durationSec: 11.1, duration: '0:11' },
  { id: 'MX_Arena_Stingers_0016', category: 'Arena', number: '0016', durationSec: 12.9, duration: '0:13' },
  { id: 'MX_Arena_Stingers_0017', category: 'Arena', number: '0017', durationSec: 8.2, duration: '0:08' },
  { id: 'MX_Arena_Stingers_0019', category: 'Arena', number: '0019', durationSec: 9.4, duration: '0:09' },
  { id: 'MX_Breakout_Stingers_0001', category: 'Breakout', number: '0001', durationSec: 12.3, duration: '0:12' },
  { id: 'MX_Breakout_Stingers_0002', category: 'Breakout', number: '0002', durationSec: 12.3, duration: '0:12' },
  { id: 'MX_Breakout_Stingers_0003', category: 'Breakout', number: '0003', durationSec: 9.7, duration: '0:10' },
  { id: 'MX_Breakout_Stingers_0004', category: 'Breakout', number: '0004', durationSec: 11.7, duration: '0:12' },
  { id: 'MX_Breakout_Stingers_0005', category: 'Breakout', number: '0005', durationSec: 11.3, duration: '0:11' },
  { id: 'MX_CelebrationStadium_Stingers_0001', category: 'CelebrationStadium', number: '0001', durationSec: 12.9, duration: '0:13' },
  { id: 'MX_CelebrationStadium_Stingers_0002', category: 'CelebrationStadium', number: '0002', durationSec: 14.6, duration: '0:15' },
  { id: 'MX_CelebrationStadium_Stingers_0003', category: 'CelebrationStadium', number: '0003', durationSec: 13.9, duration: '0:14' },
  { id: 'MX_CelebrationStadium_Stingers_0004', category: 'CelebrationStadium', number: '0004', durationSec: 15.3, duration: '0:15' },
  { id: 'MX_CelebrationStadium_Stingers_0005', category: 'CelebrationStadium', number: '0005', durationSec: 12.2, duration: '0:12' },
  { id: 'MX_CelebrationStadium_Stingers_0006', category: 'CelebrationStadium', number: '0006', durationSec: 16.4, duration: '0:16' },
  { id: 'MX_Farm_Stingers_0001', category: 'Farm', number: '0001', durationSec: 9.5, duration: '0:09' },
  { id: 'MX_Farm_Stingers_0002', category: 'Farm', number: '0002', durationSec: 8.8, duration: '0:09' },
  { id: 'MX_Farm_Stingers_0003', category: 'Farm', number: '0003', durationSec: 10.6, duration: '0:11' },
  { id: 'MX_Farm_Stingers_0004', category: 'Farm', number: '0004', durationSec: 10.8, duration: '0:11' },
  { id: 'MX_Farm_Stingers_0005', category: 'Farm', number: '0005', durationSec: 7.5, duration: '0:07' },
  { id: 'MX_Farm_Stingers_0006', category: 'Farm', number: '0006', durationSec: 9.9, duration: '0:10' },
  { id: 'MX_Farm_Stingers_0007', category: 'Farm', number: '0007', durationSec: 8.3, duration: '0:08' },
  { id: 'MX_Park_Stingers_0001', category: 'Park', number: '0001', durationSec: 15.3, duration: '0:15' },
  { id: 'MX_Park_Stingers_0002', category: 'Park', number: '0002', durationSec: 12.7, duration: '0:13' },
  { id: 'MX_Park_Stingers_0003', category: 'Park', number: '0003', durationSec: 11.2, duration: '0:11' },
  { id: 'MX_Park_Stingers_0004', category: 'Park', number: '0004', durationSec: 11.9, duration: '0:12' },
  { id: 'MX_Space_Dark_Stingers_0003', category: 'Space_Dark', number: '0003', durationSec: 10.8, duration: '0:11' },
  { id: 'MX_Space_Dark_Stingers_0004', category: 'Space_Dark', number: '0004', durationSec: 10.8, duration: '0:11' },
  { id: 'MX_Space_Dark_Stingers_0005', category: 'Space_Dark', number: '0005', durationSec: 10.8, duration: '0:11' },
  { id: 'MX_Space_Stingers_0003', category: 'Space', number: '0003', durationSec: 13.0, duration: '0:13' },
  { id: 'MX_Space_Stingers_0004', category: 'Space', number: '0004', durationSec: 12.3, duration: '0:12' },
  { id: 'MX_Space_Stingers_0006', category: 'Space', number: '0006', durationSec: 9.5, duration: '0:09' },
  { id: 'MX_Space_Stingers_0007', category: 'Space', number: '0007', durationSec: 10.6, duration: '0:11' },
  { id: 'MX_Space_Stingers_0009', category: 'Space', number: '0009', durationSec: 10.0, duration: '0:10' },
  { id: 'MX_Street_Stingers_0001', category: 'Street', number: '0001', durationSec: 10.8, duration: '0:11' },
  { id: 'MX_Street_Stingers_0002', category: 'Street', number: '0002', durationSec: 9.6, duration: '0:10' },
  { id: 'MX_Street_Stingers_0003', category: 'Street', number: '0003', durationSec: 8.9, duration: '0:09' },
  { id: 'MX_Street_Stingers_0004', category: 'Street', number: '0004', durationSec: 9.6, duration: '0:10' },
  { id: 'MX_TrainStation_Stingers_0001', category: 'TrainStation', number: '0001', durationSec: 12.0, duration: '0:12' },
  { id: 'MX_TrainStation_Stingers_0002', category: 'TrainStation', number: '0002', durationSec: 12.4, duration: '0:12' },
  { id: 'MX_TrainStation_Stingers_0006', category: 'TrainStation', number: '0006', durationSec: 11.1, duration: '0:11' },
  { id: 'MX_TrainStation_Stingers_0007', category: 'TrainStation', number: '0007', durationSec: 11.3, duration: '0:11' },
  { id: 'MX_TrainStation_Stingers_0009', category: 'TrainStation', number: '0009', durationSec: 8.9, duration: '0:09' },
  { id: 'MX_TrainStation_Stingers_0010', category: 'TrainStation', number: '0010', durationSec: 10.3, duration: '0:10' },
  { id: 'MX_TrainStation_Stingers_0011', category: 'TrainStation', number: '0011', durationSec: 8.7, duration: '0:09' },
  { id: 'MX_TrainStation_Stingers_0012', category: 'TrainStation', number: '0012', durationSec: 10.8, duration: '0:11' },
  { id: 'MX_Utopia_Lux_Stingers_0001', category: 'Utopia_Lux', number: '0001', durationSec: 17.7, duration: '0:18' },
  { id: 'MX_Utopia_Lux_Stingers_0002', category: 'Utopia_Lux', number: '0002', durationSec: 19.1, duration: '0:19' },
  { id: 'MX_Utopia_Lux_Stingers_0003', category: 'Utopia_Lux', number: '0003', durationSec: 17.2, duration: '0:17' },
  { id: 'MX_Utopia_Lux_Stingers_0004', category: 'Utopia_Lux', number: '0004', durationSec: 17.7, duration: '0:18' },
  { id: 'MX_Utopia_Lux_Stingers_0005', category: 'Utopia_Lux', number: '0005', durationSec: 16.9, duration: '0:17' },
]);

const CATEGORY_META_MAP: Record<string, { label: string; arenaName: string }> = {
  Aquatic: { label: 'Aquatic', arenaName: 'AquaDome Stinger' },
  Arena: { label: 'Arena', arenaName: 'DFH Stadium Stinger' },
  Breakout: { label: 'Breakout', arenaName: 'Throwback Arcade Stinger' },
  CelebrationStadium: { label: 'Celebration', arenaName: 'Champions Field Stinger' },
  Farm: { label: 'Farm', arenaName: 'Farmstead Stinger' },
  Park: { label: 'Park', arenaName: 'Beckwith Park Stinger' },
  Space_Dark: { label: 'Space Dark', arenaName: 'Starbase Aftermath Stinger' },
  Space: { label: 'Space', arenaName: 'Starbase ARC Stinger' },
  Street: { label: 'Street', arenaName: 'Urban Central Stinger' },
  TrainStation: { label: 'Train Station', arenaName: 'Urban Station Stinger' },
  Utopia_Lux: { label: 'Utopia Lux', arenaName: 'Utopia Coliseum Stinger' },
};

export const STINGER_ANTHEMS: readonly AnthemDef[] = Object.freeze(
  RAW_STINGER_ENTRIES.map((entry) => {
    const meta = CATEGORY_META_MAP[entry.category] || {
      label: entry.category,
      arenaName: 'Arena Stinger',
    };
    return Object.freeze({
      id: entry.id,
      title: entry.id,
      artist: `${meta.arenaName} · ${entry.id}.m4a`,
      category: entry.category,
      number: entry.number,
      duration: entry.duration,
      durationSec: entry.durationSec,
      tag: meta.label,
      file: `assets/audio/Anthems/${entry.id}.m4a`,
    });
  })
);

export const ANTHEM_CATALOG: readonly AnthemDef[] = Object.freeze([
  Object.freeze({
    id: 'none',
    title: 'No Anthem',
    artist: 'Muted · Do not play goal celebration audio',
    category: 'none',
    number: '0000',
    duration: 'MUTED',
    durationSec: 0,
    tag: 'Muted',
    file: null,
  }),
  Object.freeze({
    id: 'random',
    title: 'Random',
    artist: 'Shuffle across all 58 stadium stingers',
    category: 'random',
    number: '0000',
    duration: 'VARIES',
    durationSec: 11.5,
    tag: 'Random',
    file: null,
  }),
  ...STINGER_ANTHEMS,
]);

const VALID_ANTHEM_IDS = new Set(ANTHEM_CATALOG.map((a) => a.id));
const VALID_SPECIFIC_CATEGORY_IDS = new Set(ANTHEM_SPECIFIC_CATEGORIES.map((c) => c.id));

export function normalizeAnthemId(id: unknown): string {
  if (typeof id === 'string') {
    const trimmed = id.trim();
    if (VALID_ANTHEM_IDS.has(trimmed)) {
      return trimmed;
    }
    if (trimmed === 'muted' || trimmed === 'no-anthem' || trimmed === 'off') {
      return 'none';
    }
    if (trimmed === 'default') {
      return DEFAULT_ANTHEM_ID;
    }
  }
  return DEFAULT_ANTHEM_ID;
}

export function normalizeRandomAnthemScope(scope: unknown): RandomAnthemScope {
  return scope === 'all' ? 'all' : 'specific';
}

export function normalizeRandomAnthemCategory(category: unknown): string {
  if (typeof category === 'string') {
    const trimmed = category.trim();
    if (VALID_SPECIFIC_CATEGORY_IDS.has(trimmed)) {
      return trimmed;
    }
  }
  return DEFAULT_RANDOM_ANTHEM_CATEGORY;
}

export function loadStoredRandomAnthemPrefs(): StoredRandomAnthemPrefs {
  const raw = safeStorage.get(STORAGE_KEYS.PLAYER_ANTHEM_RANDOM_PREFS);
  if (!raw) {
    return { ...DEFAULT_STORED_RANDOM_ANTHEM_PREFS };
  }
  try {
    const parsed = JSON.parse(raw);
    if (!isPlainObject(parsed)) {
      return { ...DEFAULT_STORED_RANDOM_ANTHEM_PREFS };
    }
    return {
      scope: normalizeRandomAnthemScope(parsed.scope),
      category: normalizeRandomAnthemCategory(parsed.category),
    };
  } catch {
    return { ...DEFAULT_STORED_RANDOM_ANTHEM_PREFS };
  }
}

export function saveStoredRandomAnthemPrefs(
  prefs: Partial<StoredRandomAnthemPrefs>
): StoredRandomAnthemPrefs {
  const current = loadStoredRandomAnthemPrefs();
  const next: StoredRandomAnthemPrefs = {
    scope:
      prefs.scope !== undefined ? normalizeRandomAnthemScope(prefs.scope) : current.scope,
    category:
      prefs.category !== undefined
        ? normalizeRandomAnthemCategory(prefs.category)
        : current.category,
  };
  safeStorage.set(STORAGE_KEYS.PLAYER_ANTHEM_RANDOM_PREFS, JSON.stringify(next));
  return next;
}

export function getAnthemById(id: unknown): AnthemDef {
  const norm = normalizeAnthemId(id);
  return ANTHEM_CATALOG.find((a) => a.id === norm) || ANTHEM_CATALOG[0];
}

export function resolvePlayableAnthemDef(
  id: unknown,
  options?: {
    randomScope?: RandomAnthemScope;
    randomCategory?: string;
  }
): AnthemDef | null {
  const norm = normalizeAnthemId(id);
  if (norm === 'none') return null;
  if (norm === 'random') {
    if (STINGER_ANTHEMS.length === 0) return null;
    const stored = loadStoredRandomAnthemPrefs();
    const scope =
      options?.randomScope !== undefined
        ? normalizeRandomAnthemScope(options.randomScope)
        : stored.scope;
    const category =
      options?.randomCategory !== undefined
        ? normalizeRandomAnthemCategory(options.randomCategory)
        : stored.category;
    const pool =
      scope === 'specific'
        ? STINGER_ANTHEMS.filter((a) => a.category === category)
        : STINGER_ANTHEMS;
    const effectivePool = pool.length > 0 ? pool : STINGER_ANTHEMS;
    const idx = Math.floor(Math.random() * effectivePool.length);
    return effectivePool[idx] || null;
  }
  return STINGER_ANTHEMS.find((a) => a.id === norm) || null;
}

export function encodeAnthemIdIndex(id: unknown): number {
  if (typeof id === 'number' && Number.isFinite(id)) {
    const idx = Math.round(id);
    return idx >= 0 && idx < ANTHEM_CATALOG.length ? idx : 0;
  }
  const norm = normalizeAnthemId(id);
  const idx = ANTHEM_CATALOG.findIndex((a) => a.id === norm);
  return idx >= 0 ? idx : 0;
}

export function decodeAnthemIdIndex(index: unknown): string {
  const idx = Number(index);
  if (Number.isInteger(idx) && idx >= 0 && idx < ANTHEM_CATALOG.length) {
    return ANTHEM_CATALOG[idx].id;
  }
  return DEFAULT_ANTHEM_ID;
}

export function loadStoredPlayerAnthem(): string {
  const raw = safeStorage.get(STORAGE_KEYS.PLAYER_ANTHEM, DEFAULT_ANTHEM_ID);
  return normalizeAnthemId(raw);
}

export function saveStoredPlayerAnthem(anthemId: string): string {
  const normalized = normalizeAnthemId(anthemId);
  safeStorage.set(STORAGE_KEYS.PLAYER_ANTHEM, normalized);
  return normalized;
}
