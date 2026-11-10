import { type StateCreator } from 'zustand';
import { STORAGE_KEYS, safeStorage } from '../../config/storageHelpers';
import { getInitialTrajectory } from '../../config/trainingDefaults';
import { audioConfig } from '../../config/audioConfig';
import { loadStoredBgmPrefs } from '../../config/spatialAudioConfig';
import { type AppState } from '../appStoreTypes';

function getInitialAppAudio(): AppState['audio'] {
  const cfg = audioConfig.config as Record<string, any>;
  const bgmPrefs = loadStoredBgmPrefs();
  const toPct = (v: unknown, defPct: number) => {
    const n = Number(v);
    if (!Number.isFinite(n)) return defPct;
    return n <= 1.5
      ? Math.round(Math.max(0, Math.min(1, n)) * 100)
      : Math.round(Math.max(0, Math.min(100, n)));
  };
  const muteWhenUnfocused =
    cfg.continueAudioOnLostFocus !== undefined ? !cfg.continueAudioOnLostFocus : true;
  const rawPanModel: 'equalpower' | 'HRTF' =
    cfg.spatialPanningModel === 'HRTF' ? 'HRTF' : 'equalpower';
  const rawDynProfile: 'compressed' | 'dynamic' | 'monitor' =
    cfg.dynamicRangeProfile === 'compressed' ||
    cfg.dynamicRangeProfile === 'monitor' ||
    cfg.dynamicRangeProfile === 'dynamic'
      ? cfg.dynamicRangeProfile
      : 'dynamic';
  const rawDistModel: 'smoothstep' | 'inverse' | 'linear' | 'exponential' =
    cfg.distanceModel === 'inverse' ||
    cfg.distanceModel === 'linear' ||
    cfg.distanceModel === 'exponential' ||
    cfg.distanceModel === 'smoothstep'
      ? cfg.distanceModel
      : 'smoothstep';
  return {
    masterVolume: toPct(cfg.masterVolume, 100),
    engineVolume: toPct(cfg.engineVolume, 100),
    boostVolume: toPct(cfg.boostVolume, 80),
    bgmVolume: bgmPrefs.bgmVolume ?? 80,
    muteWhenUnfocused,
    continueAudioOnLostFocus: !muteWhenUnfocused,
    bassGain: Number.isFinite(Number(cfg.eqBass)) ? Number(cfg.eqBass) : 0,
    midGain: Number.isFinite(Number(cfg.eqMid)) ? Number(cfg.eqMid) : 0,
    trebleGain: Number.isFinite(Number(cfg.eqTreble)) ? Number(cfg.eqTreble) : 0,
    hrtfEnabled: cfg.spatialAudio !== undefined ? Boolean(cfg.spatialAudio) : true,
    dynamicRangeProfile: rawDynProfile,
    spatialPanningModel: rawPanModel,
    distanceModel: rawDistModel,
    audibilityFloor: Number.isFinite(Number(cfg.minAudibleGainFloor))
      ? Math.round(Math.max(0, Math.min(0.5, Number(cfg.minAudibleGainFloor))) * 100)
      : 15,
    arenaAcousticScale: Number.isFinite(Number(cfg.arenaAcousticScale))
      ? Number(cfg.arenaAcousticScale)
      : 1.0,
    farFieldHighShelfDb: Number.isFinite(Number(cfg.farFieldHighShelfDb))
      ? Number(cfg.farFieldHighShelfDb)
      : 0,
  };
}

export type AudioAndGameplaySlice = Pick<
  AppState,
  | 'audio'
  | 'gameplay'
  | 'trajectory'
  | 'resetGameplay'
  | 'updateAudio'
  | 'updateGameplay'
  | 'updateTrajectory'
>;

export const createAudioAndGameplaySlice: StateCreator<
  AppState,
  [],
  [],
  AudioAndGameplaySlice
> = (set, get) => ({
  audio: getInitialAppAudio(),
  gameplay: {
    goalRestart: true,
    unlimitedBoost: true,
    showCarHitbox: false,
    showAllCarHitboxes: false,
    ballCamIndicator: true,
    enableFToMirror: true,
  },
  trajectory: getInitialTrajectory(),

  resetGameplay: () => {
    const next = {
      goalRestart: true,
      unlimitedBoost: true,
      showCarHitbox: false,
      showAllCarHitboxes: false,
      ballCamIndicator: true,
      enableFToMirror: true,
    };
    get().bridge.onGameplayChange?.(next);
    set({ gameplay: next });
  },

  updateAudio: (patch) => {
    set((s) => {
      const nextAudio = { ...s.audio, ...patch };
      if (patch.muteWhenUnfocused !== undefined) {
        nextAudio.continueAudioOnLostFocus = !patch.muteWhenUnfocused;
      } else if (patch.continueAudioOnLostFocus !== undefined) {
        nextAudio.muteWhenUnfocused = !patch.continueAudioOnLostFocus;
      }
      if (patch.masterVolume !== undefined) {
        audioConfig.set('masterVolume', Math.max(0, Math.min(1, patch.masterVolume / 100)));
      }
      if (patch.engineVolume !== undefined) {
        audioConfig.set('engineVolume', Math.max(0, Math.min(1, patch.engineVolume / 100)));
      }
      if (patch.boostVolume !== undefined) {
        audioConfig.set('boostVolume', Math.max(0, Math.min(1, patch.boostVolume / 100)));
      }
      if (
        nextAudio.continueAudioOnLostFocus !== undefined &&
        (patch.muteWhenUnfocused !== undefined || patch.continueAudioOnLostFocus !== undefined)
      ) {
        audioConfig.set('continueAudioOnLostFocus', Boolean(nextAudio.continueAudioOnLostFocus));
      }
      if (patch.bassGain !== undefined) {
        audioConfig.set('eqBass', Math.max(-12, Math.min(12, Number(patch.bassGain) || 0)));
      }
      if (patch.midGain !== undefined) {
        audioConfig.set('eqMid', Math.max(-12, Math.min(12, Number(patch.midGain) || 0)));
      }
      if (patch.trebleGain !== undefined) {
        audioConfig.set('eqTreble', Math.max(-12, Math.min(12, Number(patch.trebleGain) || 0)));
      }
      if (patch.hrtfEnabled !== undefined) {
        audioConfig.set('spatialAudio', Boolean(patch.hrtfEnabled));
      }
      if (patch.dynamicRangeProfile !== undefined) {
        audioConfig.set('dynamicRangeProfile', patch.dynamicRangeProfile);
      }
      if (patch.spatialPanningModel !== undefined) {
        audioConfig.set('spatialPanningModel', patch.spatialPanningModel);
      }
      if (patch.distanceModel !== undefined) {
        audioConfig.set('distanceModel', patch.distanceModel);
      }
      if (patch.audibilityFloor !== undefined) {
        const clampedFloor = Math.max(0, Math.min(50, Number(patch.audibilityFloor) || 0)) / 100;
        audioConfig.set('minAudibleGainFloor', clampedFloor);
      }
      if (patch.arenaAcousticScale !== undefined) {
        const clampedScale = Math.max(0.5, Math.min(2.0, Number(patch.arenaAcousticScale) || 1.0));
        audioConfig.set('arenaAcousticScale', clampedScale);
      }
      if (patch.farFieldHighShelfDb !== undefined) {
        const clampedShelf = Math.max(-12, Math.min(0, Number(patch.farFieldHighShelfDb) || 0));
        audioConfig.set('farFieldHighShelfDb', clampedShelf);
      }
      get().bridge.onAudioChange?.(nextAudio);
      return { audio: nextAudio };
    });
  },

  updateGameplay: (patch) => {
    set((s) => {
      const nextGameplay = { ...s.gameplay, ...patch };
      get().bridge.onGameplayChange?.(nextGameplay);
      return { gameplay: nextGameplay };
    });
  },

  updateTrajectory: (patch) => {
    set((s) => {
      const nextTrajectory = { ...s.trajectory, ...patch };
      safeStorage.set(STORAGE_KEYS.TRAJECTORY, JSON.stringify(nextTrajectory));
      get().bridge.onTrajectoryChange?.(nextTrajectory);
      return { trajectory: nextTrajectory };
    });
  },
});
