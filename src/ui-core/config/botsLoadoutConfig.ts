/**
 * botsLoadoutConfig.ts
 * Multi-select randomizable Bots Loadout configuration, LocalStorage persistence,
 * and per-bot independent loadout roller for Exhibition & Bot Auto-Fill modes.
 */

import { safeStorage, STORAGE_KEYS } from './storageHelpers';
import {
  CAR_VISUAL_CATALOG,
  resolveVehicleHitboxId,
  getCarColorSlotById,
} from './vehicleConstants';
import { loadStoredColorPrefs } from './vehiclePresets';
import {
  STINGER_ANTHEMS,
  ANTHEM_SPECIFIC_CATEGORIES,
  resolvePlayableAnthemDef,
} from './anthemCatalogConfig';

export type BotPaintFinishOption = 'metallic' | 'matte';
export type BotBoostVisualOption = 'light-wave' | 'light-beam';
export type BotBoostAudioOption = 'standard' | 'rush' | 'flamethrower' | 'plasma';
export type BotAnthemCategoryOption =
  | 'Aquatic'
  | 'Arena'
  | 'Breakout'
  | 'CelebrationStadium'
  | 'Farm'
  | 'Park'
  | 'Space'
  | 'Space_Dark'
  | 'Street'
  | 'TrainStation'
  | 'Utopia_Lux'
  | 'none';

export const PAINT_FINISH_CATALOG: readonly { id: BotPaintFinishOption; name: string }[] = [
  { id: 'metallic', name: 'Metallic' },
  { id: 'matte', name: 'Matte' },
];

export const BOOST_VISUAL_CATALOG: readonly { id: BotBoostVisualOption; name: string }[] = [
  { id: 'light-wave', name: 'Light Wave' },
  { id: 'light-beam', name: 'Light Beam' },
];

export const BOOST_AUDIO_CATALOG: readonly { id: BotBoostAudioOption; name: string }[] = [
  { id: 'standard', name: 'Standard' },
  { id: 'rush', name: 'Rush' },
  { id: 'flamethrower', name: 'Flamethrower' },
  { id: 'plasma', name: 'Plasma' },
];

export interface BotsLoadoutConfig {
  /** Multi-select vehicle visual IDs (8 standard car presets across 6 hitboxes; excludes player-only TriOctane variants) */
  visualIds: string[];
  /** Multi-select paint finishes (default: ['metallic']) */
  paintFinishes: BotPaintFinishOption[];
  /** Multi-select boost trail visual effects (default: ['light-wave', 'light-beam']) */
  boostVisuals: BotBoostVisualOption[];
  /** Multi-select boost audio effects (default: ['standard']) */
  boostAudios: BotBoostAudioOption[];
  /** Multi-select anthem stinger categories (default: ['TrainStation']) */
  anthemCategories: BotAnthemCategoryOption[];
}

export interface RolledBotLoadout {
  visualId: string;
  hitboxId: string;
  paintFinish: BotPaintFinishOption;
  boostVisual: BotBoostVisualOption;
  boostAudio: BotBoostAudioOption;
  anthemCategory: BotAnthemCategoryOption;
  anthemId: string;
  colorSlot?: number;
  colorHex?: string;
}

export const BOT_VISUAL_CATALOG = Object.freeze(
  CAR_VISUAL_CATALOG.filter((c) => !c.playerOnly)
);

export const ALL_BOT_VISUAL_IDS: readonly string[] = Object.freeze(
  BOT_VISUAL_CATALOG.map((c) => c.id)
);

export const DEFAULT_GLB_BOT_VISUAL_IDS: readonly string[] = Object.freeze(
  BOT_VISUAL_CATALOG.filter((c) => !c.isPreset).map((c) => c.id)
);

export const ALL_BOT_PAINT_FINISHES: readonly BotPaintFinishOption[] = Object.freeze([
  'metallic',
  'matte',
]);

export const ALL_BOT_BOOST_VISUALS: readonly BotBoostVisualOption[] = Object.freeze([
  'light-wave',
  'light-beam',
]);

export const ALL_BOT_BOOST_AUDIOS: readonly BotBoostAudioOption[] = Object.freeze([
  'standard',
  'rush',
  'flamethrower',
  'plasma',
]);

export const ALL_BOT_ANTHEM_CATEGORIES: readonly {
  id: BotAnthemCategoryOption;
  label: string;
  arenaName: string;
  count: number;
}[] = Object.freeze([
  ...ANTHEM_SPECIFIC_CATEGORIES.map((cat) => ({
    id: cat.id as BotAnthemCategoryOption,
    label: cat.label,
    arenaName: cat.arenaName,
    count: STINGER_ANTHEMS.filter((a) => a.category === cat.id && a.file).length,
  })),
  {
    id: 'none' as BotAnthemCategoryOption,
    label: 'None (Muted)',
    arenaName: 'Silent Goal Replay',
    count: 0,
  },
]);

export const DEFAULT_BOTS_LOADOUT_CONFIG: BotsLoadoutConfig = {
  visualIds: [...DEFAULT_GLB_BOT_VISUAL_IDS], // 8 standard GLB vehicles (excludes player-only TriOctane variants)
  paintFinishes: ['metallic'],
  boostVisuals: ['light-wave', 'light-beam'],
  boostAudios: ['standard'],
  anthemCategories: ['TrainStation'],
};

function sanitizeNonEmptyPool<T extends string>(
  raw: unknown,
  allowed: readonly T[],
  fallback: readonly T[]
): T[] {
  if (!Array.isArray(raw)) return [...fallback];
  const valid = raw.filter(
    (item): item is T => typeof item === 'string' && (allowed as readonly string[]).includes(item)
  );
  const unique = Array.from(new Set(valid));
  return unique.length > 0 ? unique : [...fallback];
}

export function normalizeBotsLoadoutConfig(
  raw?: Partial<BotsLoadoutConfig> | null
): BotsLoadoutConfig {
  if (!raw || typeof raw !== 'object') {
    return {
      visualIds: [...DEFAULT_BOTS_LOADOUT_CONFIG.visualIds],
      paintFinishes: [...DEFAULT_BOTS_LOADOUT_CONFIG.paintFinishes],
      boostVisuals: [...DEFAULT_BOTS_LOADOUT_CONFIG.boostVisuals],
      boostAudios: [...DEFAULT_BOTS_LOADOUT_CONFIG.boostAudios],
      anthemCategories: [...DEFAULT_BOTS_LOADOUT_CONFIG.anthemCategories],
    };
  }
  const allowedAnthemCats = ALL_BOT_ANTHEM_CATEGORIES.map((c) => c.id);
  const sanitizedVisualIds = sanitizeNonEmptyPool(
    raw.visualIds,
    ALL_BOT_VISUAL_IDS,
    DEFAULT_BOTS_LOADOUT_CONFIG.visualIds
  );
  if (sanitizedVisualIds.length === 7 && !sanitizedVisualIds.includes('octane')) {
    sanitizedVisualIds.push('octane');
  }
  return {
    visualIds: sanitizedVisualIds,
    paintFinishes: sanitizeNonEmptyPool(
      raw.paintFinishes,
      ALL_BOT_PAINT_FINISHES,
      DEFAULT_BOTS_LOADOUT_CONFIG.paintFinishes
    ),
    boostVisuals: sanitizeNonEmptyPool(
      raw.boostVisuals,
      ALL_BOT_BOOST_VISUALS,
      DEFAULT_BOTS_LOADOUT_CONFIG.boostVisuals
    ),
    boostAudios: sanitizeNonEmptyPool(
      raw.boostAudios,
      ALL_BOT_BOOST_AUDIOS,
      DEFAULT_BOTS_LOADOUT_CONFIG.boostAudios
    ),
    anthemCategories: sanitizeNonEmptyPool(
      raw.anthemCategories,
      allowedAnthemCats,
      DEFAULT_BOTS_LOADOUT_CONFIG.anthemCategories
    ),
  };
}

let cachedBotsLoadoutConfig: BotsLoadoutConfig | null = null;

export function loadStoredBotsLoadoutConfig(): BotsLoadoutConfig {
  const raw = safeStorage.get(STORAGE_KEYS.BOTS_LOADOUT_CONFIG);
  if (raw) {
    try {
      const parsed = JSON.parse(raw);
      cachedBotsLoadoutConfig = normalizeBotsLoadoutConfig(parsed);
      return cachedBotsLoadoutConfig;
    } catch (err) {
      console.warn('[botsLoadoutConfig] Failed to parse stored bots loadout config:', err);
    }
  }
  cachedBotsLoadoutConfig = normalizeBotsLoadoutConfig(DEFAULT_BOTS_LOADOUT_CONFIG);
  return cachedBotsLoadoutConfig;
}

export function getBotsLoadoutConfig(): BotsLoadoutConfig {
  if (!cachedBotsLoadoutConfig) {
    return loadStoredBotsLoadoutConfig();
  }
  return cachedBotsLoadoutConfig;
}

export function saveStoredBotsLoadoutConfig(
  next: Partial<BotsLoadoutConfig>
): BotsLoadoutConfig {
  const current = getBotsLoadoutConfig();
  const normalized = normalizeBotsLoadoutConfig({ ...current, ...next });
  cachedBotsLoadoutConfig = normalized;
  safeStorage.set(STORAGE_KEYS.BOTS_LOADOUT_CONFIG, JSON.stringify(normalized));
  return normalized;
}

export function resetStoredBotsLoadoutConfig(): BotsLoadoutConfig {
  const normalized = normalizeBotsLoadoutConfig(DEFAULT_BOTS_LOADOUT_CONFIG);
  cachedBotsLoadoutConfig = normalized;
  safeStorage.set(STORAGE_KEYS.BOTS_LOADOUT_CONFIG, JSON.stringify(normalized));
  return normalized;
}

function pickRandomFromPool<T>(pool: readonly T[], fallback: T): T {
  if (!Array.isArray(pool) || pool.length === 0) return fallback;
  if (pool.length === 1) return pool[0];
  const idx = Math.floor(Math.random() * pool.length);
  return pool[idx] ?? fallback;
}

/**
 * Resolves a bot's boost trail effect according to the same-team bot assignment policy:
 * - 1st bot on a team uses 'light-wave'
 * - 2nd bot on the same team uses 'light-beam'
 * - 3rd+ bot on the same team (when both 'light-wave' and 'light-beam' are already present)
 *   rolls randomly between 'light-wave' and 'light-beam'.
 * Human players on the team do not restrict or count toward bot boost choices.
 */
export function resolveTeamBotBoostVisual(
  pool: readonly BotBoostVisualOption[],
  usedBotBoostVisualsOnTeam?: Iterable<string>
): BotBoostVisualOption {
  const validPool =
    Array.isArray(pool) && pool.length > 0 ? pool : ALL_BOT_BOOST_VISUALS;
  if (validPool.length === 1) {
    return validPool[0];
  }
  if (!usedBotBoostVisualsOnTeam) {
    return pickRandomFromPool(validPool, 'light-wave');
  }
  const usedSet = new Set<string>(usedBotBoostVisualsOnTeam);
  const canWave = validPool.includes('light-wave');
  const canBeam = validPool.includes('light-beam');

  if (canWave && canBeam) {
    const hasWave = usedSet.has('light-wave');
    const hasBeam = usedSet.has('light-beam');
    if (!hasWave && !hasBeam) {
      return 'light-wave';
    }
    if (hasWave && !hasBeam) {
      return 'light-beam';
    }
    if (!hasWave && hasBeam) {
      return 'light-wave';
    }
  }
  return pickRandomFromPool(validPool, 'light-wave');
}

/**
 * Resolves the next fallback team color slot from the user's Garage team color priority order
 * (e.g., Blue: [1, 5, 3], Orange: [2, 4, 0]), skipping color slots already occupied on that team.
 */
export function resolveBotFallbackColorForTeam(
  team: number,
  usedSlotsOnTeam: Iterable<number> = []
): { colorSlot: number; colorHex: string } {
  const prefs = loadStoredColorPrefs() || {
    blueOrder: [1, 5, 3],
    orangeOrder: [2, 4, 0],
  };
  const defaultOrder = team === 1 ? [2, 4, 0] : [1, 5, 3];
  const rawOrder = team === 1 ? prefs.orangeOrder : prefs.blueOrder;
  const order =
    Array.isArray(rawOrder) && rawOrder.length > 0 ? rawOrder : defaultOrder;
  const usedSet = new Set<number>(usedSlotsOnTeam);

  let chosenSlot = order.find((slotId: number) => !usedSet.has(slotId));
  if (chosenSlot === undefined) {
    chosenSlot = order[usedSet.size % order.length] ?? defaultOrder[0];
  }
  const slotObj = getCarColorSlotById(chosenSlot);
  return {
    colorSlot: chosenSlot,
    colorHex: slotObj?.hex || (team === 1 ? '#ff7043' : '#42a5f5'),
  };
}

/**
 * Independently rolls each loadout attribute from its selected multi-choice pool.
 * For boostVisual, when team bot history (`usedBotBoostVisualsOnTeam`) is supplied,
 * enforces: 1st bot -> 'light-wave', 2nd bot -> 'light-beam', 3rd+ bot -> random.
 */
export function rollRandomBotLoadout(
  configOverride?: Partial<BotsLoadoutConfig> | null,
  team?: number,
  usedSlotsOnTeam?: Iterable<number>,
  usedBotBoostVisualsOnTeam?: Iterable<string>
): RolledBotLoadout {
  const cfg = configOverride
    ? normalizeBotsLoadoutConfig(configOverride)
    : getBotsLoadoutConfig();

  const visualId = pickRandomFromPool(cfg.visualIds, 'fennec');
  const hitboxId = resolveVehicleHitboxId(visualId);
  const paintFinish = pickRandomFromPool(cfg.paintFinishes, 'metallic');
  const boostVisual = resolveTeamBotBoostVisual(
    cfg.boostVisuals,
    usedBotBoostVisualsOnTeam
  );
  const boostAudio = pickRandomFromPool(cfg.boostAudios, 'standard');
  const anthemCategory = pickRandomFromPool(cfg.anthemCategories, 'TrainStation');

  let anthemId = 'none';
  if (anthemCategory !== 'none') {
    const resolvedAnthem = resolvePlayableAnthemDef('random', {
      randomScope: 'specific',
      randomCategory: anthemCategory,
    });
    anthemId = resolvedAnthem?.id || 'MX_TrainStation_Stingers_0001';
  }

  const result: RolledBotLoadout = {
    visualId,
    hitboxId,
    paintFinish,
    boostVisual,
    boostAudio,
    anthemCategory,
    anthemId,
  };

  if (team === 0 || team === 1) {
    const { colorSlot, colorHex } = resolveBotFallbackColorForTeam(
      team,
      usedSlotsOnTeam
    );
    result.colorSlot = colorSlot;
    result.colorHex = colorHex;
  }

  return result;
}


