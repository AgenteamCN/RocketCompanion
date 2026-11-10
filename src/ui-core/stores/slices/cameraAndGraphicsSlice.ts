import { type StateCreator } from 'zustand';
import { STORAGE_KEYS, safeStorage } from '../../config/storageHelpers';
import { DEFAULT_CAMERA_SETTINGS, getInitialCamera } from '../../config/cameraDefaults';
import { DEFAULT_REPLAY_DIRECTOR_FOV_DEG } from '../../config/replayDirectorConfig';
import { updateReplayDirectorConfig } from '../../config/replayDirectorConfig';
import { setMaterialsConfig, getInitialMaterials } from '../../config/materialsConfig';
import { getInitialGraphics } from '../../config/trainingDefaults';
import { getInitialTelemetry } from '../../config/uiConfig';
import { type AppState } from '../appStoreTypes';

export type CameraAndGraphicsSlice = Pick<
  AppState,
  | 'renderScale'
  | 'setRenderScale'
  | 'camera'
  | 'graphics'
  | 'materials'
  | 'telemetry'
  | 'updateCamera'
  | 'resetCamera'
  | 'updateGraphics'
  | 'updateMaterials'
  | 'updateTelemetry'
  | 'isFreeCam'
  | 'freeCamFov'
  | 'setFreeCam'
  | 'toggleFreeCam'
  | 'setFreeCamFov'
>;

export const createCameraAndGraphicsSlice: StateCreator<
  AppState,
  [],
  [],
  CameraAndGraphicsSlice
> = (set, get) => ({
  renderScale: getInitialGraphics().renderScale ?? 50,
  setRenderScale: (scale) => get().updateGraphics({ renderScale: scale }),

  camera: getInitialCamera(),
  graphics: getInitialGraphics(),
  materials: getInitialMaterials(),
  telemetry: getInitialTelemetry(),

  updateCamera: (patch) => {
    set((s) => {
      const nextCamera = { ...s.camera, ...patch };
      safeStorage.set(STORAGE_KEYS.CAMERA_SETTINGS, JSON.stringify(nextCamera));
      get().bridge.onCameraChange?.(nextCamera);
      return { camera: nextCamera };
    });
  },

  resetCamera: () => {
    set(() => {
      const reset = { ...DEFAULT_CAMERA_SETTINGS };
      safeStorage.set(STORAGE_KEYS.CAMERA_SETTINGS, JSON.stringify(reset));
      get().bridge.onCameraChange?.(reset);
      return { camera: reset };
    });
  },

  updateGraphics: (patch) => {
    const nextGraphics = { ...get().graphics, ...patch };
    safeStorage.set(STORAGE_KEYS.GRAPHICS_SETTINGS, JSON.stringify(nextGraphics));
    set((s) => ({
      graphics: nextGraphics,
      renderScale: patch.renderScale !== undefined ? patch.renderScale : s.renderScale,
    }));
    get().bridge.onGraphicsChange?.(nextGraphics);
  },

  updateMaterials: (patch) => {
    set((s) => {
      const nextMaterials = { ...s.materials, ...patch };
      setMaterialsConfig(nextMaterials);
      get().bridge.onMaterialsChange?.(nextMaterials);
      return { materials: nextMaterials };
    });
  },

  updateTelemetry: (patch) => {
    set((s) => {
      const nextTelemetry = { ...s.telemetry, ...patch };
      if (nextTelemetry.fpsMode === 'off') {
        nextTelemetry.refreshRateMode = 'off';
      }
      safeStorage.set(STORAGE_KEYS.TELEMETRY_SETTINGS, JSON.stringify(nextTelemetry));
      return { telemetry: nextTelemetry };
    });
  },

  isFreeCam: false,
  freeCamFov: DEFAULT_REPLAY_DIRECTOR_FOV_DEG,
  setFreeCam: (enabled: boolean) => {
    const shouldEnable = Boolean(enabled);
    set({ isFreeCam: shouldEnable });
    get().bridge.onFreeCamToggle?.(shouldEnable);
  },
  toggleFreeCam: () => {
    const next = !get().isFreeCam;
    set({ isFreeCam: next });
    get().bridge.onFreeCamToggle?.(next);
    return next;
  },
  setFreeCamFov: (fov: number) => {
    const safeFov = Math.max(10, Math.min(150, Number(fov) || DEFAULT_REPLAY_DIRECTOR_FOV_DEG));
    set({ freeCamFov: safeFov });
    updateReplayDirectorConfig({ cameraFovDeg: safeFov });
    get().bridge.onFreeCamFovChange?.(safeFov);
  },
});
