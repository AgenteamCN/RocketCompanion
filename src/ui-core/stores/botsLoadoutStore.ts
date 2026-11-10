import { create } from 'zustand';
import {
  type BotsLoadoutConfig,
  type BotPaintFinishOption,
  type BotBoostVisualOption,
  type BotBoostAudioOption,
  type BotAnthemCategoryOption,
  ALL_BOT_VISUAL_IDS,
  DEFAULT_GLB_BOT_VISUAL_IDS,
  ALL_BOT_PAINT_FINISHES,
  ALL_BOT_BOOST_VISUALS,
  ALL_BOT_BOOST_AUDIOS,
  ALL_BOT_ANTHEM_CATEGORIES,
  loadStoredBotsLoadoutConfig,
  saveStoredBotsLoadoutConfig,
  resetStoredBotsLoadoutConfig,
  rollRandomBotLoadout,
  type RolledBotLoadout,
} from '../config/botsLoadoutConfig';

export interface BotsLoadoutStoreState extends BotsLoadoutConfig {
  lastSampleRoll: RolledBotLoadout | null;
  toggleVisualId: (visualId: string) => void;
  setVisualIdsPreset: (preset: 'glb' | 'all') => void;
  togglePaintFinish: (finish: BotPaintFinishOption) => void;
  toggleBoostVisual: (boostVisual: BotBoostVisualOption) => void;
  toggleBoostAudio: (boostAudio: BotBoostAudioOption) => void;
  toggleAnthemCategory: (category: BotAnthemCategoryOption) => void;
  setAllAnthemCategories: () => void;
  updateConfig: (patch: Partial<BotsLoadoutConfig>) => void;
  resetDefaults: () => void;
  rollSampleLoadout: () => RolledBotLoadout;
  runtimeCallbacks: {
    onBotsLoadoutConfigChanged?: (config: BotsLoadoutConfig) => void;
  };
  registerRuntimeCallbacks: (
    cb: BotsLoadoutStoreState['runtimeCallbacks']
  ) => void;
}

function togglePoolItem<T extends string>(current: readonly T[], item: T): T[] {
  const exists = current.includes(item);
  if (exists) {
    // Keep at least 1 selected option so random selection always has a valid pool
    if (current.length <= 1) return [...current];
    return current.filter((v) => v !== item);
  }
  return [...current, item];
}

const initialConfig = loadStoredBotsLoadoutConfig();

export const useBotsLoadoutStore = create<BotsLoadoutStoreState>((set, get) => ({
  ...initialConfig,
  lastSampleRoll: null,
  runtimeCallbacks: {},

  toggleVisualId: (visualId) => {
    const nextVisualIds = togglePoolItem(get().visualIds, visualId);
    const saved = saveStoredBotsLoadoutConfig({ visualIds: nextVisualIds });
    set({ ...saved, lastSampleRoll: rollRandomBotLoadout(saved) });
    get().runtimeCallbacks.onBotsLoadoutConfigChanged?.(saved);
  },

  setVisualIdsPreset: (preset) => {
    const nextVisualIds =
      preset === 'all' ? [...ALL_BOT_VISUAL_IDS] : [...DEFAULT_GLB_BOT_VISUAL_IDS];
    const saved = saveStoredBotsLoadoutConfig({ visualIds: nextVisualIds });
    set({ ...saved, lastSampleRoll: rollRandomBotLoadout(saved) });
    get().runtimeCallbacks.onBotsLoadoutConfigChanged?.(saved);
  },

  togglePaintFinish: (finish) => {
    const nextFinishes = togglePoolItem(get().paintFinishes, finish);
    const saved = saveStoredBotsLoadoutConfig({ paintFinishes: nextFinishes });
    set({ ...saved, lastSampleRoll: rollRandomBotLoadout(saved) });
    get().runtimeCallbacks.onBotsLoadoutConfigChanged?.(saved);
  },

  toggleBoostVisual: (boostVisual) => {
    const nextVisuals = togglePoolItem(get().boostVisuals, boostVisual);
    const saved = saveStoredBotsLoadoutConfig({ boostVisuals: nextVisuals });
    set({ ...saved, lastSampleRoll: rollRandomBotLoadout(saved) });
    get().runtimeCallbacks.onBotsLoadoutConfigChanged?.(saved);
  },

  toggleBoostAudio: (boostAudio) => {
    const nextAudios = togglePoolItem(get().boostAudios, boostAudio);
    const saved = saveStoredBotsLoadoutConfig({ boostAudios: nextAudios });
    set({ ...saved, lastSampleRoll: rollRandomBotLoadout(saved) });
    get().runtimeCallbacks.onBotsLoadoutConfigChanged?.(saved);
  },

  toggleAnthemCategory: (category) => {
    const nextCategories = togglePoolItem(get().anthemCategories, category);
    const saved = saveStoredBotsLoadoutConfig({
      anthemCategories: nextCategories,
    });
    set({ ...saved, lastSampleRoll: rollRandomBotLoadout(saved) });
    get().runtimeCallbacks.onBotsLoadoutConfigChanged?.(saved);
  },

  setAllAnthemCategories: () => {
    const playableCats = ALL_BOT_ANTHEM_CATEGORIES.filter(
      (c) => c.id !== 'none'
    ).map((c) => c.id);
    const saved = saveStoredBotsLoadoutConfig({
      anthemCategories: playableCats,
    });
    set({ ...saved, lastSampleRoll: rollRandomBotLoadout(saved) });
    get().runtimeCallbacks.onBotsLoadoutConfigChanged?.(saved);
  },

  updateConfig: (patch) => {
    const saved = saveStoredBotsLoadoutConfig(patch);
    set({ ...saved, lastSampleRoll: rollRandomBotLoadout(saved) });
    get().runtimeCallbacks.onBotsLoadoutConfigChanged?.(saved);
  },

  resetDefaults: () => {
    const saved = resetStoredBotsLoadoutConfig();
    set({ ...saved, lastSampleRoll: rollRandomBotLoadout(saved) });
    get().runtimeCallbacks.onBotsLoadoutConfigChanged?.(saved);
  },

  rollSampleLoadout: () => {
    const rolled = rollRandomBotLoadout(get());
    set({ lastSampleRoll: rolled });
    return rolled;
  },

  registerRuntimeCallbacks: (cb) => {
    set((s) => ({
      runtimeCallbacks: { ...s.runtimeCallbacks, ...cb },
    }));
  },
}));

export const botsLoadoutStore = {
  getState: () => useBotsLoadoutStore.getState(),
  subscribe: useBotsLoadoutStore.subscribe,
};
