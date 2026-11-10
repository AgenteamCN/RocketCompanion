import { create } from 'zustand';
import { safeStorage, STORAGE_KEYS } from '../config/storageHelpers';

export interface ReferenceImageItem {
  id: string;
  name: string;
  relativePath: string;
  url: string;
  width: number;
  height: number;
  sizeBytes: number;
}

export interface ResolutionCalibrationProfile {
  resolutionKey: string; // e.g., "4112x2658"
  width: number;
  height: number;
  scaleLinked: boolean;
  scaleX: number;
  scaleY: number;
  offsetX: number; // in px
  offsetY: number; // in px
  opacity: number; // 0 to 1
  invertImage: boolean;
}

export type CameraLookOverridePreset = 'none' | 'left' | 'right' | 'up' | 'down' | 'rearView';

export const DEFAULT_LOOK_HORIZONTAL_MAGNITUDE = 0.95;
export const DEFAULT_LOOK_VERTICAL_MAGNITUDE = 0.81;

export interface ReferenceOverlayProfilesExport {
  version: string;
  exportedAt: string;
  activeResolutionKey: string;
  activeProfile: ResolutionCalibrationProfile;
  profiles: Record<string, ResolutionCalibrationProfile>;
}

export interface ReferenceOverlayState {
  enabled: boolean;
  folderName: string;
  images: ReferenceImageItem[];
  activeIndex: number;
  activeResolutionKey: string;
  profiles: Record<string, ResolutionCalibrationProfile>;
  cameraLookPreset: CameraLookOverridePreset;
  cameraLookStrength: number;
  cameraLookHorizontalStrength: number;
  cameraLookVerticalStrength: number;
  cameraLookXOverride: number;
  cameraLookYOverride: number;
  rearViewOverride: boolean;
  setEnabled: (enabled: boolean) => void;
  setFolderImages: (folderName: string, images: ReferenceImageItem[]) => void;
  clearImages: () => void;
  setActiveIndex: (index: number) => void;
  stepImage: (delta: number) => void;
  setActiveResolutionKey: (resKey: string) => void;
  getProfile: (resKey?: string) => ResolutionCalibrationProfile;
  updateProfile: (patch: Partial<ResolutionCalibrationProfile>, resKey?: string) => void;
  resetProfile: (resKey?: string) => void;
  importProfilesJson: (data: unknown) => boolean;
  exportProfilesJson: () => ReferenceOverlayProfilesExport;
  exportActiveProfileJson: (resKey?: string) => ResolutionCalibrationProfile;
  setCameraLookPreset: (preset: CameraLookOverridePreset) => void;
  setCameraLookStrength: (strength: number) => void;
  setCameraLookAxes: (lookX: number, lookY: number) => void;
}

const STORAGE_KEY_REF_OVERLAY_PROFILES = STORAGE_KEYS.REF_OVERLAY_PROFILES;

export const DEFAULT_REFERENCE_RESOLUTION = '4112x2658';
export const REFERENCE_RESOLUTION_REF_SPEC = '4112x2658-ref';

export function normalizeResolutionDimensionsKey(resKey: string): string {
  const match = String(resKey || '').match(/^(\d+)x(\d+)/);
  return match ? `${match[1]}x${match[2]}` : resKey;
}

export function createDefaultResolutionProfile(
  resKey = DEFAULT_REFERENCE_RESOLUTION
): ResolutionCalibrationProfile {
  const dimsKey = normalizeResolutionDimensionsKey(resKey);
  const [wStr, hStr] = dimsKey.split('x');
  const width = parseInt(wStr, 10) || 4112;
  const height = parseInt(hStr, 10) || 2658;
  if (resKey === REFERENCE_RESOLUTION_REF_SPEC) {
    return {
      resolutionKey: REFERENCE_RESOLUTION_REF_SPEC,
      width,
      height,
      scaleLinked: true,
      scaleX: 0.42,
      scaleY: 0.42,
      offsetX: 0,
      offsetY: 15,
      opacity: 0.2,
      invertImage: false,
    };
  }
  const isDefaultBig = resKey === DEFAULT_REFERENCE_RESOLUTION || dimsKey === DEFAULT_REFERENCE_RESOLUTION;
  return {
    resolutionKey: isDefaultBig ? DEFAULT_REFERENCE_RESOLUTION : `${width}x${height}`,
    width,
    height,
    scaleLinked: true,
    scaleX: isDefaultBig ? 0.414 : 1.0,
    scaleY: isDefaultBig ? 0.414 : 1.0,
    offsetX: 0,
    offsetY: isDefaultBig ? 12.5 : 0,
    opacity: isDefaultBig ? 0.25 : 0.5,
    invertImage: false,
  };
}

function sanitizeProfile(
  key: string,
  raw: Partial<ResolutionCalibrationProfile>
): ResolutionCalibrationProfile {
  const base = createDefaultResolutionProfile(key);
  return {
    resolutionKey: key,
    width: typeof raw.width === 'number' ? raw.width : base.width,
    height: typeof raw.height === 'number' ? raw.height : base.height,
    scaleLinked: typeof raw.scaleLinked === 'boolean' ? raw.scaleLinked : base.scaleLinked,
    scaleX: typeof raw.scaleX === 'number' ? raw.scaleX : base.scaleX,
    scaleY: typeof raw.scaleY === 'number' ? raw.scaleY : base.scaleY,
    offsetX: typeof raw.offsetX === 'number' ? raw.offsetX : base.offsetX,
    offsetY: typeof raw.offsetY === 'number' ? raw.offsetY : base.offsetY,
    opacity: typeof raw.opacity === 'number' ? raw.opacity : base.opacity,
    invertImage: typeof raw.invertImage === 'boolean' ? raw.invertImage : base.invertImage,
  };
}

function loadSavedProfiles(): Record<string, ResolutionCalibrationProfile> {
  const defaultMap: Record<string, ResolutionCalibrationProfile> = {
    [DEFAULT_REFERENCE_RESOLUTION]: createDefaultResolutionProfile(DEFAULT_REFERENCE_RESOLUTION),
    [REFERENCE_RESOLUTION_REF_SPEC]: createDefaultResolutionProfile(REFERENCE_RESOLUTION_REF_SPEC),
  };
  try {
    const raw = safeStorage.get(STORAGE_KEY_REF_OVERLAY_PROFILES);
    if (!raw) return defaultMap;
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === 'object') {
      const src = parsed.profiles || parsed;
      for (const [k, v] of Object.entries(src)) {
        if (v && typeof v === 'object') {
          const s = sanitizeProfile(k, v as Partial<ResolutionCalibrationProfile>);
          if (k === DEFAULT_REFERENCE_RESOLUTION && s.scaleX === 0.42 && s.offsetY === 15 && s.opacity === 0.2) {
            continue;
          }
          defaultMap[k] = s;
        }
      }
    }
  } catch (err) {
    console.warn('[referenceOverlayStore] Failed to load saved profiles:', err);
  }
  return defaultMap;
}

function saveProfilesToStorage(profiles: Record<string, ResolutionCalibrationProfile>) {
  safeStorage.set(STORAGE_KEY_REF_OVERLAY_PROFILES, JSON.stringify({ profiles }));
}

function resolveEffectiveKey(state: ReferenceOverlayState, resKey?: string): string {
  if (resKey) return resKey;
  if (state.activeResolutionKey !== 'ALL') return state.activeResolutionKey;
  const img = state.images[state.activeIndex];
  return img ? `${img.width}x${img.height}` : DEFAULT_REFERENCE_RESOLUTION;
}

function revokeBlobImages(images: ReferenceImageItem[]): void {
  for (const img of images) {
    if (img.url.startsWith('blob:')) {
      try {
        URL.revokeObjectURL(img.url);
      } catch (err) {
        console.warn('[referenceOverlayStore] Failed to revoke blob URL:', err);
      }
    }
  }
}

export const useReferenceOverlayStore = create<ReferenceOverlayState>((set, get) => ({
  enabled: true,
  folderName: '',
  images: [],
  activeIndex: 0,
  activeResolutionKey: DEFAULT_REFERENCE_RESOLUTION,
  profiles: loadSavedProfiles(),

  cameraLookPreset: 'none',
  cameraLookStrength: DEFAULT_LOOK_HORIZONTAL_MAGNITUDE,
  cameraLookHorizontalStrength: DEFAULT_LOOK_HORIZONTAL_MAGNITUDE,
  cameraLookVerticalStrength: DEFAULT_LOOK_VERTICAL_MAGNITUDE,
  cameraLookXOverride: 0,
  cameraLookYOverride: 0,
  rearViewOverride: false,

  setEnabled: (enabled) => set({ enabled }),

  setFolderImages: (folderName, images) => {
    revokeBlobImages(get().images);
    if (images.length === 0) {
      set({ folderName: '', images: [], activeIndex: 0 });
      return;
    }

    const hasRefRes = images.some((img) => `${img.width}x${img.height}` === DEFAULT_REFERENCE_RESOLUTION);
    const currentKey = get().activeResolutionKey;
    const targetResKey =
      hasRefRes && currentKey === REFERENCE_RESOLUTION_REF_SPEC
        ? REFERENCE_RESOLUTION_REF_SPEC
        : hasRefRes
        ? DEFAULT_REFERENCE_RESOLUTION
        : `${images[0].width}x${images[0].height}`;

    const profiles = { ...get().profiles };
    for (const img of images) {
      const rk = `${img.width}x${img.height}`;
      if (!profiles[rk]) profiles[rk] = createDefaultResolutionProfile(rk);
    }
    if (!profiles[REFERENCE_RESOLUTION_REF_SPEC]) {
      profiles[REFERENCE_RESOLUTION_REF_SPEC] = createDefaultResolutionProfile(REFERENCE_RESOLUTION_REF_SPEC);
    }
    saveProfilesToStorage(profiles);

    const targetDims = normalizeResolutionDimensionsKey(targetResKey);
    const firstIdx = images.findIndex((img) => `${img.width}x${img.height}` === targetDims);
    set({
      enabled: true,
      folderName,
      images,
      activeResolutionKey: targetResKey,
      activeIndex: firstIdx >= 0 ? firstIdx : 0,
      profiles,
    });
  },

  clearImages: () => {
    revokeBlobImages(get().images);
    set({ folderName: '', images: [], activeIndex: 0 });
  },

  setActiveIndex: (index) => {
    const imgs = get().images;
    if (imgs.length === 0) return;
    const clamped = ((index % imgs.length) + imgs.length) % imgs.length;
    const img = imgs[clamped];
    const currentKey = get().activeResolutionKey;
    const imgDims = img ? `${img.width}x${img.height}` : '';
    const resKey =
      currentKey === 'ALL'
        ? 'ALL'
        : imgDims && normalizeResolutionDimensionsKey(currentKey) === imgDims
        ? currentKey
        : imgDims || currentKey;
    set({ activeIndex: clamped, activeResolutionKey: resKey });
  },

  stepImage: (delta) => {
    const { images, activeIndex, activeResolutionKey } = get();
    if (images.length === 0) return;
    const activeDims = normalizeResolutionDimensionsKey(activeResolutionKey);
    const matchingIndices = images
      .map((img, idx) => ({ img, idx }))
      .filter(({ img }) => (activeResolutionKey === 'ALL' ? true : `${img.width}x${img.height}` === activeDims))
      .map((item) => item.idx);

    const pool = matchingIndices.length > 0 ? matchingIndices : images.map((_, i) => i);
    const currentPos = Math.max(0, pool.indexOf(activeIndex));
    const nextIdx = pool[((currentPos + delta) % pool.length + pool.length) % pool.length];
    const nextImg = images[nextIdx];
    const nextImgDims = nextImg ? `${nextImg.width}x${nextImg.height}` : '';
    set({
      activeIndex: nextIdx,
      activeResolutionKey:
        activeResolutionKey === 'ALL'
          ? 'ALL'
          : nextImgDims && normalizeResolutionDimensionsKey(activeResolutionKey) === nextImgDims
          ? activeResolutionKey
          : nextImgDims || activeResolutionKey,
    });
  },

  setActiveResolutionKey: (resKey) => {
    const { images, profiles } = get();
    const nextProfiles = { ...profiles };
    if (resKey !== 'ALL' && !nextProfiles[resKey]) {
      nextProfiles[resKey] = createDefaultResolutionProfile(resKey);
      saveProfilesToStorage(nextProfiles);
    }
    const targetDims = normalizeResolutionDimensionsKey(resKey);
    const firstIdx = images.findIndex((img) => (resKey === 'ALL' ? true : `${img.width}x${img.height}` === targetDims));
    set({
      activeResolutionKey: resKey,
      activeIndex: firstIdx >= 0 ? firstIdx : 0,
      profiles: nextProfiles,
    });
  },

  getProfile: (resKey) => {
    const state = get();
    const effectiveKey = resolveEffectiveKey(state, resKey);
    return state.profiles[effectiveKey] || createDefaultResolutionProfile(effectiveKey);
  },

  updateProfile: (patch, resKey) => {
    const state = get();
    const effectiveKey = resolveEffectiveKey(state, resKey);
    const existing = state.profiles[effectiveKey] || createDefaultResolutionProfile(effectiveKey);
    const next: ResolutionCalibrationProfile = sanitizeProfile(effectiveKey, { ...existing, ...patch });

    if (next.scaleLinked) {
      if (patch.scaleX !== undefined && patch.scaleY === undefined) next.scaleY = patch.scaleX;
      else if (patch.scaleY !== undefined && patch.scaleX === undefined) next.scaleX = patch.scaleY;
      else if (patch.scaleLinked === true) next.scaleY = next.scaleX;
    }

    const nextProfiles = { ...state.profiles, [effectiveKey]: next };
    saveProfilesToStorage(nextProfiles);
    set({ profiles: nextProfiles });
  },

  resetProfile: (resKey) => {
    const state = get();
    const effectiveKey = resolveEffectiveKey(state, resKey);
    const nextProfiles = { ...state.profiles, [effectiveKey]: createDefaultResolutionProfile(effectiveKey) };
    saveProfilesToStorage(nextProfiles);
    set({ profiles: nextProfiles });
  },

  importProfilesJson: (data) => {
    if (!data || typeof data !== 'object') return false;
    const obj = data as Record<string, unknown>;
    if (typeof obj.resolutionKey === 'string' && typeof obj.scaleX === 'number' && typeof obj.scaleY === 'number') {
      const k = obj.resolutionKey;
      const nextProfiles = { ...get().profiles, [k]: sanitizeProfile(k, obj as Partial<ResolutionCalibrationProfile>) };
      saveProfilesToStorage(nextProfiles);
      set({ profiles: nextProfiles });
      return true;
    }
    const rawProfiles = obj.referenceOverlayProfiles || obj.profiles || obj;
    if (!rawProfiles || typeof rawProfiles !== 'object') return false;
    const mapSource = (rawProfiles as Record<string, unknown>).profiles || rawProfiles;
    if (!mapSource || typeof mapSource !== 'object') return false;
    const nextProfiles = { ...get().profiles };
    let importedCount = 0;
    for (const [k, v] of Object.entries(mapSource)) {
      if (v && typeof v === 'object' && /^\d+x\d+/.test(k)) {
        nextProfiles[k] = sanitizeProfile(k, v as Partial<ResolutionCalibrationProfile>);
        importedCount++;
      }
    }
    if (importedCount > 0) {
      saveProfilesToStorage(nextProfiles);
      set({ profiles: nextProfiles });
      return true;
    }
    return false;
  },

  exportProfilesJson: () => {
    const state = get();
    const activeProfile = state.getProfile();
    return {
      version: 'hitbox-reference-overlay-v1',
      exportedAt: new Date().toISOString(),
      activeResolutionKey: activeProfile.resolutionKey,
      activeProfile,
      profiles: state.profiles,
    };
  },

  exportActiveProfileJson: (resKey) => get().getProfile(resKey),

  setCameraLookPreset: (preset) => {
    const state = get();
    let lookX = 0;
    let lookY = 0;
    let rearView = false;
    let nextStrength = state.cameraLookStrength;

    if (preset === 'left' || preset === 'right') {
      nextStrength = state.cameraLookHorizontalStrength || DEFAULT_LOOK_HORIZONTAL_MAGNITUDE;
      lookX = preset === 'left' ? -nextStrength : nextStrength;
    } else if (preset === 'up' || preset === 'down') {
      nextStrength = state.cameraLookVerticalStrength || DEFAULT_LOOK_VERTICAL_MAGNITUDE;
      lookY = preset === 'up' ? -nextStrength : nextStrength;
    } else if (preset === 'rearView') {
      rearView = true;
    }

    set({
      cameraLookPreset: preset,
      cameraLookStrength: nextStrength,
      cameraLookXOverride: lookX,
      cameraLookYOverride: lookY,
      rearViewOverride: rearView,
    });
  },

  setCameraLookStrength: (strength) => {
    const clamped = Math.max(0, Math.min(1, Number(strength) || 0));
    const state = get();
    const preset = state.cameraLookPreset;
    let lookX = state.cameraLookXOverride;
    let lookY = state.cameraLookYOverride;
    let nextH = state.cameraLookHorizontalStrength;
    let nextV = state.cameraLookVerticalStrength;

    if (preset === 'left' || preset === 'right') {
      lookX = preset === 'left' ? -clamped : clamped;
      lookY = 0;
      nextH = clamped;
    } else if (preset === 'up' || preset === 'down') {
      lookX = 0;
      lookY = preset === 'up' ? -clamped : clamped;
      nextV = clamped;
    }
    set({
      cameraLookStrength: clamped,
      cameraLookHorizontalStrength: nextH,
      cameraLookVerticalStrength: nextV,
      cameraLookXOverride: lookX,
      cameraLookYOverride: lookY,
    });
  },

  setCameraLookAxes: (lookX, lookY) => {
    set({
      cameraLookXOverride: Math.max(-1, Math.min(1, Number(lookX) || 0)),
      cameraLookYOverride: Math.max(-1, Math.min(1, Number(lookY) || 0)),
      rearViewOverride: false,
    });
  },
}));
