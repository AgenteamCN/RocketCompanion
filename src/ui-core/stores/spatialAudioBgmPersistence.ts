import {
  STORAGE_KEYS,
  safeStorage,
  isPlainObject,
  clampNumberOrDefault,
  booleanOrDefault,
} from "../config/storageHelpers";
import {
  DEFAULT_BGM_SCENE_CONFIG,
  DEFAULT_SPATIAL_AUDIO_TUNER_CONFIG,
  type BgmSceneConfig,
  type SpatialAudioOverrideMode,
  type SpatialAudioTunerConfig,
} from "../config/spatialAttenuationProfiles";

export type { BgmSceneConfig, SpatialAudioOverrideMode, SpatialAudioTunerConfig };

export function sanitizeSpatialAudioTunerConfig(
  raw: unknown,
  fallback: SpatialAudioTunerConfig = DEFAULT_SPATIAL_AUDIO_TUNER_CONFIG
): SpatialAudioTunerConfig {
  const src = isPlainObject(raw) ? raw : {};
  const allowedModes: readonly SpatialAudioOverrideMode[] = ["auto", "normal", "spatial", "manual"];
  const overrideMode: SpatialAudioOverrideMode =
    typeof src.overrideMode === "string" &&
    allowedModes.includes(src.overrideMode as SpatialAudioOverrideMode)
      ? (src.overrideMode as SpatialAudioOverrideMode)
      : fallback.overrideMode;

  return {
    transitionDurationSec: clampNumberOrDefault(
      src.transitionDurationSec,
      fallback.transitionDurationSec,
      { min: 0.1, max: 8.0 }
    ),
    bgmFadeDurationSec: clampNumberOrDefault(src.bgmFadeDurationSec, fallback.bgmFadeDurationSec, {
      min: 0.1,
      max: 3.0,
    }),
    hpfMaxFreq: clampNumberOrDefault(src.hpfMaxFreq, fallback.hpfMaxFreq, {
      min: 20,
      max: 2000,
      integer: true,
    }),
    lpfMinFreq: clampNumberOrDefault(src.lpfMinFreq, fallback.lpfMinFreq, {
      min: 400,
      max: 16000,
      integer: true,
    }),
    wetMaxPct: clampNumberOrDefault(src.wetMaxPct, fallback.wetMaxPct, {
      min: 0,
      max: 100,
      integer: true,
    }),
    decaySec: clampNumberOrDefault(src.decaySec, fallback.decaySec, {
      min: 0.4,
      max: 8.0,
    }),
    wetBoost: clampNumberOrDefault(src.wetBoost, fallback.wetBoost, {
      min: 0.2,
      max: 3.0,
    }),
    bzX1: clampNumberOrDefault(src.bzX1, fallback.bzX1, { min: 0.01, max: 0.99 }),
    bzY1: clampNumberOrDefault(src.bzY1, fallback.bzY1, { min: 0.0, max: 1.0 }),
    bzX2: clampNumberOrDefault(src.bzX2, fallback.bzX2, { min: 0.01, max: 1.0 }),
    bzY2: clampNumberOrDefault(src.bzY2, fallback.bzY2, { min: 0.0, max: 1.0 }),
    overrideMode,
    manualBlend: clampNumberOrDefault(src.manualBlend, fallback.manualBlend, {
      min: 0.0,
      max: 1.0,
    }),
    muteSignalAudioInGoalReplay: booleanOrDefault(
      src.muteSignalAudioInGoalReplay,
      fallback.muteSignalAudioInGoalReplay
    ),
  };
}

export function loadStoredSpatialAudioTunerConfig(): SpatialAudioTunerConfig {
  const raw = safeStorage.get(STORAGE_KEYS.SPATIAL_AUDIO_TUNER);
  if (!raw) return { ...DEFAULT_SPATIAL_AUDIO_TUNER_CONFIG };
  try {
    return sanitizeSpatialAudioTunerConfig(JSON.parse(raw));
  } catch {
    return { ...DEFAULT_SPATIAL_AUDIO_TUNER_CONFIG };
  }
}

export function saveStoredSpatialAudioTunerConfig(
  cfg: SpatialAudioTunerConfig
): SpatialAudioTunerConfig {
  const clean = sanitizeSpatialAudioTunerConfig(cfg);
  const toStore = { ...clean, overrideMode: "auto" as const, manualBlend: 0 };
  safeStorage.set(STORAGE_KEYS.SPATIAL_AUDIO_TUNER, JSON.stringify(toStore));
  return clean;
}

export interface StoredBgmPrefs {
  realisticBgmEnabled: boolean;
  categorizedMode: boolean;
  deselectedVolumes: string[];
  deselectedTrackNames: string[];
  bgmVolume: number;
  bgmScenes: BgmSceneConfig;
}

export function sanitizeBgmSceneConfig(raw: unknown): BgmSceneConfig {
  const src = isPlainObject(raw) ? raw : {};
  return {
    freePlay: booleanOrDefault(src.freePlay, DEFAULT_BGM_SCENE_CONFIG.freePlay),
    singlePlayerTraining: booleanOrDefault(
      src.singlePlayerTraining,
      DEFAULT_BGM_SCENE_CONFIG.singlePlayerTraining
    ),
    multiplayerTraining: booleanOrDefault(
      src.multiplayerTraining,
      DEFAULT_BGM_SCENE_CONFIG.multiplayerTraining
    ),
    match: booleanOrDefault(src.match, DEFAULT_BGM_SCENE_CONFIG.match),
  };
}

export function loadStoredBgmPrefs(): StoredBgmPrefs {
  const raw = safeStorage.get(STORAGE_KEYS.BGM_PREFS);
  if (!raw) {
    return {
      realisticBgmEnabled: true,
      categorizedMode: true,
      deselectedVolumes: [],
      deselectedTrackNames: [],
      bgmVolume: 80,
      bgmScenes: { ...DEFAULT_BGM_SCENE_CONFIG },
    };
  }
  try {
    const parsed = JSON.parse(raw);
    if (!isPlainObject(parsed)) {
      return {
        realisticBgmEnabled: true,
        categorizedMode: true,
        deselectedVolumes: [],
        deselectedTrackNames: [],
        bgmVolume: 80,
        bgmScenes: { ...DEFAULT_BGM_SCENE_CONFIG },
      };
    }
    return {
      realisticBgmEnabled: booleanOrDefault(parsed.realisticBgmEnabled, true),
      categorizedMode: booleanOrDefault(parsed.categorizedMode, true),
      deselectedVolumes: Array.isArray(parsed.deselectedVolumes)
        ? parsed.deselectedVolumes.filter((v): v is string => typeof v === "string")
        : [],
      deselectedTrackNames: Array.isArray(parsed.deselectedTrackNames)
        ? parsed.deselectedTrackNames.filter((v): v is string => typeof v === "string")
        : [],
      bgmVolume: clampNumberOrDefault(parsed.bgmVolume, 80, { min: 0, max: 100, integer: true }),
      bgmScenes: sanitizeBgmSceneConfig(parsed.bgmScenes),
    };
  } catch {
    return {
      realisticBgmEnabled: true,
      categorizedMode: true,
      deselectedVolumes: [],
      deselectedTrackNames: [],
      bgmVolume: 80,
      bgmScenes: { ...DEFAULT_BGM_SCENE_CONFIG },
    };
  }
}

export function saveStoredBgmPrefs(prefs: StoredBgmPrefs): void {
  safeStorage.set(
    STORAGE_KEYS.BGM_PREFS,
    JSON.stringify({
      realisticBgmEnabled: Boolean(prefs.realisticBgmEnabled),
      categorizedMode: Boolean(prefs.categorizedMode),
      deselectedVolumes: Array.from(new Set(prefs.deselectedVolumes)),
      deselectedTrackNames: Array.from(new Set(prefs.deselectedTrackNames)),
      bgmVolume: clampNumberOrDefault(prefs.bgmVolume, 80, { min: 0, max: 100, integer: true }),
      bgmScenes: sanitizeBgmSceneConfig(prefs.bgmScenes),
    })
  );
}

export interface ParsedBgmFileMeta {
  vol: string;
  trackNum: number;
  cleanTitle: string;
}

export function parseBgmFileMetadata(fileName: string): ParsedBgmFileMeta {
  const baseName = fileName.replace(/\.[^/.]+$/, "");
  const match = /V(\d+)T(\d+)/i.exec(baseName);
  if (match) {
    return {
      vol: String(parseInt(match[1], 10)),
      trackNum: parseInt(match[2], 10) || 0,
      cleanTitle: baseName,
    };
  }
  return {
    vol: "Uncategorized",
    trackNum: 999,
    cleanTitle: baseName,
  };
}

export interface BgmUploadedTrack {
  id: string;
  rawName: string;
  title: string;
  volume: string | null;
  trackNum: number | null;
  file: File;
}

export type AnthemPreviewSource = "garage-preview" | "tuner-audition";

export interface SpatialAudioRuntimeCallbacks {
  onPreviewAnthem?: (anthemId: string, source?: AnthemPreviewSource) => void;
  onStopPreviewAnthem?: () => void;
  onSelectBgmTrack?: (trackId: string) => void;
  onNextBgmTrack?: () => void;
  onPrevBgmTrack?: () => void;
  onToggleBgmPlayPause?: () => void;
  onBgmPrefsChanged?: () => void;
  onBgmFilesUploaded?: (tracks: BgmUploadedTrack[]) => void;
  onTunerConfigChanged?: (config: SpatialAudioTunerConfig) => void;
}

export interface BgmPrefsStateSlice {
  realisticBgmEnabled: boolean;
  bgmCategorizedMode: boolean;
  bgmDeselectedVolumes: string[];
  bgmDeselectedTrackNames: string[];
  bgmVolume: number;
  bgmScenes: BgmSceneConfig;
}

export function persistBgmPrefsFromState(state: BgmPrefsStateSlice): void {
  const {
    realisticBgmEnabled,
    bgmCategorizedMode,
    bgmDeselectedVolumes,
    bgmDeselectedTrackNames,
    bgmVolume,
    bgmScenes,
  } = state;
  const prefs: StoredBgmPrefs = {
    realisticBgmEnabled,
    categorizedMode: bgmCategorizedMode,
    deselectedVolumes: bgmDeselectedVolumes,
    deselectedTrackNames: bgmDeselectedTrackNames,
    bgmVolume,
    bgmScenes,
  };
  saveStoredBgmPrefs(prefs);
}

const AUDIO_FILE_EXTENSIONS = /\.(mp3|wav|ogg|m4a|flac|aac|opus|webm)$/i;

export interface ParsedBgmUploadBatch {
  parsedTracks: BgmUploadedTrack[];
  sortedVolumes: string[];
  hasCategorizedVolumes: boolean;
}

export function parseAndSortUploadedBgmFiles(
  fileList: FileList | File[]
): ParsedBgmUploadBatch | null {
  const rawFiles = Array.from<File>(fileList as ArrayLike<File>).filter(
    (file) => file.type.startsWith("audio/") || AUDIO_FILE_EXTENSIONS.test(file.name)
  );
  if (rawFiles.length === 0) return null;

  const parsedTracks: BgmUploadedTrack[] = rawFiles.map((file, idx) => {
    const meta = parseBgmFileMetadata(file.name);
    const isUncat = meta.vol === "Uncategorized";
    return {
      id: `bgm-${idx}-${file.name}`,
      rawName: file.name,
      title: meta.cleanTitle,
      volume: isUncat ? null : meta.vol,
      trackNum: isUncat ? null : meta.trackNum,
      file,
    };
  });

  parsedTracks.sort((a, b) => {
    if (a.volume !== null && b.volume !== null) {
      if (a.volume !== b.volume) return Number(a.volume) - Number(b.volume);
      return (a.trackNum ?? 0) - (b.trackNum ?? 0);
    }
    if (a.volume !== null) return -1;
    if (b.volume !== null) return 1;
    return a.title.localeCompare(b.title);
  });

  const volumeSet = new Set<string>();
  let hasUncategorized = false;
  for (const t of parsedTracks) {
    if (t.volume !== null) {
      volumeSet.add(t.volume);
    } else {
      hasUncategorized = true;
    }
  }
  const sortedVolumes = Array.from(volumeSet).sort((a, b) => Number(a) - Number(b));
  if (hasUncategorized) {
    sortedVolumes.push("uncategorized");
  }

  return {
    parsedTracks,
    sortedVolumes,
    hasCategorizedVolumes: volumeSet.size > 0,
  };
}

export function toggleDeselectedItem(list: string[], item: string): string[] {
  return list.includes(item) ? list.filter((v) => v !== item) : [...list, item];
}

export function computeUpdatedDeselectedTracks(
  currentDeselected: string[],
  tracks: BgmUploadedTrack[],
  selected: boolean,
  targetRawNames?: string[]
): string[] {
  const scopeNames = targetRawNames ?? tracks.map((t) => t.rawName);
  const scopeSet = new Set(scopeNames);
  if (selected) {
    return currentDeselected.filter((n) => !scopeSet.has(n));
  }
  return Array.from(new Set([...currentDeselected, ...scopeNames]));
}

export function filterBgmTracksByPrefs(state: {
  bgmTracks: BgmUploadedTrack[];
  bgmCategorizedMode: boolean;
  bgmDeselectedVolumes: string[];
  bgmDeselectedTrackNames: string[];
}): BgmUploadedTrack[] {
  const { bgmTracks, bgmCategorizedMode, bgmDeselectedVolumes, bgmDeselectedTrackNames } = state;
  const deselectedVolumes = new Set(bgmDeselectedVolumes);
  const deselectedTracks = new Set(bgmDeselectedTrackNames);

  return bgmTracks.filter((track) => {
    if (deselectedTracks.has(track.rawName)) return false;
    if (bgmCategorizedMode) {
      const volKey = track.volume ?? "uncategorized";
      if (deselectedVolumes.has(volKey)) return false;
    }
    return true;
  });
}
