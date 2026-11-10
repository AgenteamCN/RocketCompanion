import { create } from 'zustand';
import {
  INITIAL_ENGINE_AUDIO_TELEMETRY,
  getEngineAudioTuningConfig,
  updateEngineAudioTuningConfig,
  resetEngineAudioTuningConfig,
  getEngineAudioRuntimeActions,
  subscribeEngineAudioTelemetry,
  type EngineAudioTuningConfig,
  type EngineAudioLiveTelemetry,
} from '../config/engineAudioConfig';

export interface EngineAudioStoreState {
  config: EngineAudioTuningConfig;
  telemetry: EngineAudioLiveTelemetry;
  updateConfig: (patch: Partial<EngineAudioTuningConfig>) => void;
  resetConfig: () => void;
  updateTelemetry: (patch: Partial<EngineAudioLiveTelemetry>) => void;
  triggerBackfireTest: () => void;
  triggerEntitySpawnTest: () => void;
  triggerZeroSpeedReset: () => void;
  setManualBenchState: (patch: {
    active?: boolean;
    throttle?: boolean;
    boost?: boolean;
    reverse?: boolean;
    airborne?: boolean;
  }) => void;
}

export const useEngineAudioStore = create<EngineAudioStoreState>((set) => ({
  config: { ...getEngineAudioTuningConfig() },
  telemetry: { ...INITIAL_ENGINE_AUDIO_TELEMETRY },

  updateConfig: (patch) => {
    const next = updateEngineAudioTuningConfig(patch);
    set({ config: { ...next } });
  },

  resetConfig: () => {
    const next = resetEngineAudioTuningConfig();
    set({
      config: { ...next },
      telemetry: { ...INITIAL_ENGINE_AUDIO_TELEMETRY, loaded: true },
    });
  },

  updateTelemetry: (patch) => {
    set((state) => ({
      telemetry: {
        ...state.telemetry,
        ...patch,
      },
    }));
  },

  triggerBackfireTest: () => {
    getEngineAudioRuntimeActions().triggerBackfireTest?.();
  },

  triggerEntitySpawnTest: () => {
    getEngineAudioRuntimeActions().triggerEntitySpawnTest?.();
  },

  triggerZeroSpeedReset: () => {
    getEngineAudioRuntimeActions().triggerZeroSpeedReset?.();
  },

  setManualBenchState: (patch) => {
    getEngineAudioRuntimeActions().setManualBenchState?.(patch);
    set((state) => ({
      telemetry: {
        ...state.telemetry,
        manualOverrideActive:
          patch.active !== undefined ? patch.active : state.telemetry.manualOverrideActive,
        manualThrottle:
          patch.throttle !== undefined ? patch.throttle : state.telemetry.manualThrottle,
        manualBoost:
          patch.boost !== undefined ? patch.boost : state.telemetry.manualBoost,
        manualReverse:
          patch.reverse !== undefined ? patch.reverse : state.telemetry.manualReverse,
        manualAirborne:
          patch.airborne !== undefined ? patch.airborne : state.telemetry.manualAirborne,
      },
    }));
  },
}));

subscribeEngineAudioTelemetry((patch) => {
  useEngineAudioStore.getState().updateTelemetry(patch);
});
