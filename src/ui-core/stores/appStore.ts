import { create } from 'zustand';
import { type AppState } from './appStoreTypes';
import { createNavigationAndCarSlice } from './slices/navigationAndCarSlice';
import { createCameraAndGraphicsSlice } from './slices/cameraAndGraphicsSlice';
import { createAudioAndGameplaySlice } from './slices/audioAndGameplaySlice';
import { createDevTunersSlice } from './slices/devTunersSlice';

export const useAppStore = create<AppState>()((...a) => ({
  ...createNavigationAndCarSlice(...a),
  ...createCameraAndGraphicsSlice(...a),
  ...createAudioAndGameplaySlice(...a),
  ...createDevTunersSlice(...a),
}));

