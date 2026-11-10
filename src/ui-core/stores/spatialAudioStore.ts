import { create } from "zustand";
import {
  DEFAULT_ANTHEM_ID,
  DEFAULT_RANDOM_ANTHEM_SCOPE,
  DEFAULT_RANDOM_ANTHEM_CATEGORY,
  type RandomAnthemScope,
  loadStoredPlayerAnthem,
  saveStoredPlayerAnthem,
  loadStoredRandomAnthemPrefs,
  saveStoredRandomAnthemPrefs,
} from "../config/anthemCatalogConfig";
import {
  DEFAULT_SPATIAL_AUDIO_TUNER_CONFIG,
  type SpatialAudioTunerConfig,
  type BgmSceneConfig,
  loadStoredBgmPrefs,
  loadStoredSpatialAudioTunerConfig,
  saveStoredSpatialAudioTunerConfig,
} from "../config/spatialAudioConfig";
import { audioConfig } from "../config/audioConfig";
import { updateReplayDirectorConfig } from "../config/replayDirectorConfig";
import {
  type BgmUploadedTrack,
  type AnthemPreviewSource,
  type SpatialAudioRuntimeCallbacks,
  persistBgmPrefsFromState,
  parseAndSortUploadedBgmFiles,
  toggleDeselectedItem,
  computeUpdatedDeselectedTracks,
  filterBgmTracksByPrefs,
} from "./spatialAudioBgmPersistence";

export type { BgmUploadedTrack, AnthemPreviewSource, SpatialAudioRuntimeCallbacks };

export interface SpatialAudioStoreState {
  selectedAnthem: string;
  randomAnthemScope: RandomAnthemScope;
  randomAnthemCategory: string;
  isGarageAnthemTabActive: boolean;
  previewingAnthemId: string | null;
  previewSource: AnthemPreviewSource | null;
  activeGoalAnthemId: string | null;
  anthemLinearPhase: number;
  anthemBlend: number;
  isGoalReplaySkipped: boolean;

  bgmEnabled: boolean;
  bgmVolume: number;
  bgmScenes: BgmSceneConfig;
  realisticBgmEnabled: boolean;
  bgmCategorizedMode: boolean;
  bgmDeselectedVolumes: string[];
  bgmDeselectedTrackNames: string[];
  bgmTracks: BgmUploadedTrack[];
  bgmVolumes: string[];
  bgmCurrentTrackId: string | null;
  bgmCurrentTrackTitle: string | null;
  bgmIsPlaying: boolean;
  bgmLinearPhase: number;
  bgmBlend: number;

  tunerConfig: SpatialAudioTunerConfig;
  runtimeCallbacks: SpatialAudioRuntimeCallbacks;

  setSelectedAnthem: (anthemId: string) => void;
  setRandomAnthemScope: (scope: RandomAnthemScope) => void;
  setRandomAnthemCategory: (category: string) => void;
  setGarageAnthemTabActive: (active: boolean) => void;
  togglePreviewAnthem: (anthemId: string, source?: AnthemPreviewSource) => void;
  stopPreviewAnthem: () => void;
  setPreviewingAnthemId: (anthemId: string | null, source?: AnthemPreviewSource | null) => void;
  setActiveGoalAnthemId: (anthemId: string | null) => void;
  setAnthemTransitionState: (linearPhase: number, blend: number) => void;
  setGoalReplaySkipped: (skipped: boolean) => void;

  setBgmEnabled: (enabled: boolean) => void;
  setBgmVolume: (volume: number) => void;
  setBgmSceneEnabled: (sceneKey: keyof BgmSceneConfig, enabled: boolean) => void;
  toggleBgmScene: (sceneKey: keyof BgmSceneConfig) => void;
  setRealisticBgmEnabled: (enabled: boolean) => void;
  setBgmCategorizedMode: (categorized: boolean) => void;
  uploadBgmFiles: (files: FileList | File[]) => void;
  toggleBgmVolume: (volumeKey: string) => void;
  setAllBgmVolumes: (selected: boolean) => void;
  toggleBgmTrack: (rawName: string) => void;
  setAllBgmTracks: (selected: boolean, targetRawNames?: string[]) => void;
  playSpecificBgmTrack: (trackId: string) => void;
  nextBgmTrack: () => void;
  prevBgmTrack: () => void;
  toggleBgmPlayPause: () => void;
  setBgmPlaybackState: (patch: {
    currentTrackId?: string | null;
    currentTrackTitle?: string | null;
    isPlaying?: boolean;
  }) => void;
  setBgmTransitionState: (linearPhase: number, blend: number) => void;

  updateTunerConfig: (patch: Partial<SpatialAudioTunerConfig>) => void;
  resetTunerConfig: () => void;
  hydrateFromStorage: () => void;

  registerRuntimeCallbacks: (callbacks: SpatialAudioRuntimeCallbacks) => void;
}

const initialBgmPrefs = loadStoredBgmPrefs();
const initialRandomAnthemPrefs = loadStoredRandomAnthemPrefs();

function syncReplayDirectorMuteSignal(muteSignalAudioInGoalReplay: boolean): void {
  try {
    audioConfig.set("muteSignalAudioInGoalReplay", muteSignalAudioInGoalReplay);
    updateReplayDirectorConfig({ muteSignalAudioInGoalReplay });
  } catch {
    // Ignore if unavailable
  }
}

export const useSpatialAudioStore = create<SpatialAudioStoreState>((set, get) => ({
  selectedAnthem: loadStoredPlayerAnthem() || DEFAULT_ANTHEM_ID,
  randomAnthemScope: initialRandomAnthemPrefs.scope || DEFAULT_RANDOM_ANTHEM_SCOPE,
  randomAnthemCategory: initialRandomAnthemPrefs.category || DEFAULT_RANDOM_ANTHEM_CATEGORY,
  isGarageAnthemTabActive: false,
  previewingAnthemId: null,
  previewSource: null,
  activeGoalAnthemId: null,
  anthemLinearPhase: 0,
  anthemBlend: 0,
  isGoalReplaySkipped: false,

  bgmEnabled: false,
  bgmVolume: initialBgmPrefs.bgmVolume,
  bgmScenes: initialBgmPrefs.bgmScenes,
  realisticBgmEnabled: initialBgmPrefs.realisticBgmEnabled,
  bgmCategorizedMode: initialBgmPrefs.categorizedMode,
  bgmDeselectedVolumes: initialBgmPrefs.deselectedVolumes,
  bgmDeselectedTrackNames: initialBgmPrefs.deselectedTrackNames,
  bgmTracks: [],
  bgmVolumes: [],
  bgmCurrentTrackId: null,
  bgmCurrentTrackTitle: null,
  bgmIsPlaying: false,
  bgmLinearPhase: 1,
  bgmBlend: 1,

  tunerConfig: loadStoredSpatialAudioTunerConfig(),
  runtimeCallbacks: {},

  setSelectedAnthem: (anthemId) => {
    set({ selectedAnthem: saveStoredPlayerAnthem(anthemId) });
  },

  setRandomAnthemScope: (scope) => {
    const saved = saveStoredRandomAnthemPrefs({ scope });
    set({ randomAnthemScope: saved.scope });
    const { previewingAnthemId, previewSource, runtimeCallbacks } = get();
    if (previewingAnthemId === "random") {
      runtimeCallbacks.onPreviewAnthem?.("random", previewSource || "garage-preview");
    }
  },

  setRandomAnthemCategory: (category) => {
    const saved = saveStoredRandomAnthemPrefs({ category });
    set({ randomAnthemCategory: saved.category });
    const { previewingAnthemId, previewSource, runtimeCallbacks } = get();
    if (previewingAnthemId === "random") {
      runtimeCallbacks.onPreviewAnthem?.("random", previewSource || "garage-preview");
    }
  },

  setGarageAnthemTabActive: (active) => {
    const next = Boolean(active);
    if (get().isGarageAnthemTabActive === next) return;
    set({ isGarageAnthemTabActive: next });
    get().runtimeCallbacks.onBgmPrefsChanged?.();
  },

  togglePreviewAnthem: (anthemId, source = "garage-preview") => {
    const { previewingAnthemId, runtimeCallbacks } = get();
    if (previewingAnthemId === anthemId || anthemId === "none") {
      set({ previewingAnthemId: null, previewSource: null });
      runtimeCallbacks.onStopPreviewAnthem?.();
    } else {
      set({ previewingAnthemId: anthemId, previewSource: source });
      runtimeCallbacks.onPreviewAnthem?.(anthemId, source);
    }
  },

  stopPreviewAnthem: () => {
    const { previewingAnthemId, runtimeCallbacks } = get();
    if (previewingAnthemId !== null) {
      set({ previewingAnthemId: null, previewSource: null });
    }
    runtimeCallbacks.onStopPreviewAnthem?.();
  },

  setPreviewingAnthemId: (anthemId, source = null) => {
    set({ previewingAnthemId: anthemId, previewSource: anthemId ? source : null });
  },

  setActiveGoalAnthemId: (anthemId) => set({ activeGoalAnthemId: anthemId }),

  setAnthemTransitionState: (linearPhase, blend) =>
    set({ anthemLinearPhase: linearPhase, anthemBlend: blend }),

  setGoalReplaySkipped: (skipped) => set({ isGoalReplaySkipped: skipped }),

  setBgmEnabled: (enabled) => {
    set({ bgmEnabled: enabled });
    get().runtimeCallbacks.onBgmPrefsChanged?.();
  },

  setBgmVolume: (volume) => {
    const clamped = Math.max(0, Math.min(100, Math.round(Number(volume) || 0)));
    set((state) => {
      persistBgmPrefsFromState({ ...state, bgmVolume: clamped });
      return { bgmVolume: clamped };
    });
    get().runtimeCallbacks.onBgmPrefsChanged?.();
  },

  setBgmSceneEnabled: (sceneKey, enabled) => {
    set((state) => {
      const nextScenes: BgmSceneConfig = { ...state.bgmScenes, [sceneKey]: Boolean(enabled) };
      persistBgmPrefsFromState({ ...state, bgmScenes: nextScenes });
      return { bgmScenes: nextScenes };
    });
    get().runtimeCallbacks.onBgmPrefsChanged?.();
  },

  toggleBgmScene: (sceneKey) => {
    set((state) => {
      const nextScenes: BgmSceneConfig = {
        ...state.bgmScenes,
        [sceneKey]: !state.bgmScenes[sceneKey],
      };
      persistBgmPrefsFromState({ ...state, bgmScenes: nextScenes });
      return { bgmScenes: nextScenes };
    });
    get().runtimeCallbacks.onBgmPrefsChanged?.();
  },

  setRealisticBgmEnabled: (realistic) => {
    set((state) => {
      persistBgmPrefsFromState({ ...state, realisticBgmEnabled: realistic });
      return { realisticBgmEnabled: realistic };
    });
    get().runtimeCallbacks.onBgmPrefsChanged?.();
  },

  setBgmCategorizedMode: (categorized) => {
    set((state) => {
      persistBgmPrefsFromState({ ...state, bgmCategorizedMode: categorized });
      return { bgmCategorizedMode: categorized };
    });
    get().runtimeCallbacks.onBgmPrefsChanged?.();
  },

  uploadBgmFiles: (fileList) => {
    const batch = parseAndSortUploadedBgmFiles(fileList);
    if (!batch) return;
    const { parsedTracks, sortedVolumes, hasCategorizedVolumes } = batch;

    set((state) => {
      const nextCategorizedMode = hasCategorizedVolumes ? state.bgmCategorizedMode : false;
      persistBgmPrefsFromState({ ...state, bgmCategorizedMode: nextCategorizedMode });
      return {
        bgmTracks: parsedTracks,
        bgmVolumes: sortedVolumes,
        bgmCategorizedMode: nextCategorizedMode,
      };
    });

    const { runtimeCallbacks } = get();
    runtimeCallbacks.onBgmFilesUploaded?.(parsedTracks);
    runtimeCallbacks.onBgmPrefsChanged?.();
  },

  toggleBgmVolume: (volumeKey) => {
    set((state) => {
      const nextDeselected = toggleDeselectedItem(state.bgmDeselectedVolumes, volumeKey);
      persistBgmPrefsFromState({ ...state, bgmDeselectedVolumes: nextDeselected });
      return { bgmDeselectedVolumes: nextDeselected };
    });
    get().runtimeCallbacks.onBgmPrefsChanged?.();
  },

  setAllBgmVolumes: (selected) => {
    set((state) => {
      const nextDeselected = selected ? [] : [...state.bgmVolumes];
      persistBgmPrefsFromState({ ...state, bgmDeselectedVolumes: nextDeselected });
      return { bgmDeselectedVolumes: nextDeselected };
    });
    get().runtimeCallbacks.onBgmPrefsChanged?.();
  },

  toggleBgmTrack: (rawName) => {
    set((state) => {
      const nextDeselected = toggleDeselectedItem(state.bgmDeselectedTrackNames, rawName);
      persistBgmPrefsFromState({ ...state, bgmDeselectedTrackNames: nextDeselected });
      return { bgmDeselectedTrackNames: nextDeselected };
    });
    get().runtimeCallbacks.onBgmPrefsChanged?.();
  },

  setAllBgmTracks: (selected, targetRawNames) => {
    set((state) => {
      const nextDeselected = computeUpdatedDeselectedTracks(
        state.bgmDeselectedTrackNames,
        state.bgmTracks,
        selected,
        targetRawNames
      );
      persistBgmPrefsFromState({ ...state, bgmDeselectedTrackNames: nextDeselected });
      return { bgmDeselectedTrackNames: nextDeselected };
    });
    get().runtimeCallbacks.onBgmPrefsChanged?.();
  },

  playSpecificBgmTrack: (trackId) => get().runtimeCallbacks.onSelectBgmTrack?.(trackId),
  nextBgmTrack: () => get().runtimeCallbacks.onNextBgmTrack?.(),
  prevBgmTrack: () => get().runtimeCallbacks.onPrevBgmTrack?.(),
  toggleBgmPlayPause: () => get().runtimeCallbacks.onToggleBgmPlayPause?.(),

  setBgmPlaybackState: (patch) => {
    set((state) => ({
      bgmCurrentTrackId:
        patch.currentTrackId !== undefined ? patch.currentTrackId : state.bgmCurrentTrackId,
      bgmCurrentTrackTitle:
        patch.currentTrackTitle !== undefined ? patch.currentTrackTitle : state.bgmCurrentTrackTitle,
      bgmIsPlaying: patch.isPlaying !== undefined ? patch.isPlaying : state.bgmIsPlaying,
    }));
  },

  setBgmTransitionState: (linearPhase, blend) =>
    set({ bgmLinearPhase: linearPhase, bgmBlend: blend }),

  updateTunerConfig: (patch) => {
    const nextConfig = saveStoredSpatialAudioTunerConfig({ ...get().tunerConfig, ...patch });
    if (typeof patch.muteSignalAudioInGoalReplay === "boolean") {
      syncReplayDirectorMuteSignal(nextConfig.muteSignalAudioInGoalReplay);
    }
    set({ tunerConfig: nextConfig });
    get().runtimeCallbacks.onTunerConfigChanged?.(nextConfig);
  },

  resetTunerConfig: () => {
    const nextConfig: SpatialAudioTunerConfig = { ...DEFAULT_SPATIAL_AUDIO_TUNER_CONFIG };
    saveStoredSpatialAudioTunerConfig(nextConfig);
    syncReplayDirectorMuteSignal(nextConfig.muteSignalAudioInGoalReplay);
    set({ tunerConfig: nextConfig });
    get().runtimeCallbacks.onTunerConfigChanged?.(nextConfig);
  },

  hydrateFromStorage: () => {
    const bgmPrefs = loadStoredBgmPrefs();
    const randomPrefs = loadStoredRandomAnthemPrefs();
    const selectedAnthem = loadStoredPlayerAnthem() || DEFAULT_ANTHEM_ID;
    const tunerConfig = loadStoredSpatialAudioTunerConfig();
    set({
      selectedAnthem,
      randomAnthemScope: randomPrefs.scope || DEFAULT_RANDOM_ANTHEM_SCOPE,
      randomAnthemCategory: randomPrefs.category || DEFAULT_RANDOM_ANTHEM_CATEGORY,
      bgmVolume: bgmPrefs.bgmVolume,
      bgmScenes: bgmPrefs.bgmScenes,
      realisticBgmEnabled: bgmPrefs.realisticBgmEnabled,
      bgmCategorizedMode: bgmPrefs.categorizedMode,
      bgmDeselectedVolumes: bgmPrefs.deselectedVolumes,
      bgmDeselectedTrackNames: bgmPrefs.deselectedTrackNames,
      tunerConfig,
    });
    const cb = get().runtimeCallbacks;
    cb.onBgmPrefsChanged?.();
    cb.onTunerConfigChanged?.(tunerConfig);
  },

  registerRuntimeCallbacks: (callbacks) => set({ runtimeCallbacks: callbacks }),
}));

export function getFilteredBgmTracks(state: {
  bgmTracks: BgmUploadedTrack[];
  bgmCategorizedMode: boolean;
  bgmDeselectedVolumes: string[];
  bgmDeselectedTrackNames: string[];
}): BgmUploadedTrack[] {
  return filterBgmTracksByPrefs(state);
}
