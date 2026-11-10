import {
  type SpatialAudioTunerConfig,
  type StoredBgmPrefs,
  type BgmSceneConfig,
  saveStoredBgmPrefs,
  parseBgmFileMetadata,
} from "../config/spatialAudioConfig";

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
