import { create } from 'zustand';
import {
  type ClockPacingPriority,
  getInitialClockPacingMode,
  getInitialClockPacingPriority,
} from '../config/clockPacingConfig';
import {
  getInitialInputBufferTarget,
  getInitialInputBufferThreshold,
} from '../config/uiConfig';
import { useAppStore } from './appStore';

export type ClockPacingMode = 'legacy' | 'sts' | 'csts' | 'custom';

export type ExperiencePriorityOption =
  | 'competitive'
  | 'balanced'
  | 'motion'
  | 'input_consistency'
  | 'custom';

export function normalizeExperiencePriority(raw: string | undefined): ExperiencePriorityOption {
  if (raw === 'competitive' || raw === 'low_latency_5050') return 'competitive';
  if (raw === 'motion' || raw === 'rate_stability') return 'motion';
  if (raw === 'input_consistency' || raw === 'anti_starvation') return 'input_consistency';
  if (raw === 'custom') return 'custom';
  return 'balanced';
}

export function mapExperienceToClockPriority(
  priority: ExperiencePriorityOption
): ClockPacingPriority | null {
  switch (priority) {
    case 'competitive':
      return 'low_latency_5050';
    case 'balanced':
      return 'balanced';
    case 'motion':
      return 'rate_stability';
    case 'input_consistency':
      return 'anti_starvation';
    case 'custom':
      return null;
  }
}

export interface SettingsPacingState {
  clockPacingMode: ClockPacingMode;
  experiencePriority: ExperiencePriorityOption;
  inputBufferTarget: number;
  inputBufferThreshold: [number, number];
  /**
   * Updates Input Buffer mode in Settings -> Advanced.
   * Only when adjusted to 'custom' does it force Gameplay Experience Priority to 'custom'.
   */
  setClockPacingMode: (mode: ClockPacingMode) => void;
  /**
   * Updates Experience Priority in Settings -> Gameplay.
   * Can be adjusted independently (setting to 'custom' does not force Input Buffer to 'custom').
   * When pulled back to any of the 4 non-custom presets, Input Buffer defaults back to 'csts'.
   */
  setExperiencePriority: (priority: ExperiencePriorityOption) => void;
  setInputBufferTarget: (target: number) => void;
  setInputBufferThreshold: (threshold: [number, number]) => void;
  hydrateFromAppStore: () => void;
  resetSettingsPacing: () => void;
}

export const useSettingsPacingStore = create<SettingsPacingState>((set) => ({
  clockPacingMode: getInitialClockPacingMode(),
  experiencePriority:
    getInitialClockPacingMode() === 'custom'
      ? 'custom'
      : normalizeExperiencePriority(getInitialClockPacingPriority()),
  inputBufferTarget: getInitialInputBufferTarget(),
  inputBufferThreshold: getInitialInputBufferThreshold(),

  setClockPacingMode: (mode) => {
    set((state) => ({
      clockPacingMode: mode,
      experiencePriority: mode === 'custom' ? 'custom' : state.experiencePriority,
    }));
    const app = useAppStore.getState();
    app.setClockPacingMode(mode);
  },

  setExperiencePriority: (priority) => {
    set((state) => {
      const nextMode = priority !== 'custom' ? 'csts' : state.clockPacingMode;
      return {
        experiencePriority: priority,
        clockPacingMode: nextMode,
      };
    });
    const app = useAppStore.getState();
    const mappedPriority = mapExperienceToClockPriority(priority);
    if (mappedPriority) {
      app.setClockPacingPriority(mappedPriority);
      app.setClockPacingMode('csts');
    }
    const updatedApp = useAppStore.getState();
    set({
      inputBufferTarget: updatedApp.inputBufferTarget,
      inputBufferThreshold: updatedApp.inputBufferThreshold,
    });
  },

  setInputBufferTarget: (nextAlpha) => {
    set((state) => ({
      inputBufferTarget: nextAlpha,
      inputBufferThreshold: [
        Math.max(-nextAlpha, state.inputBufferThreshold[0]),
        Math.min(nextAlpha, state.inputBufferThreshold[1]),
      ],
    }));
    useAppStore.getState().setInputBufferTarget(nextAlpha);
  },

  setInputBufferThreshold: (threshold) => {
    set({
      inputBufferThreshold: threshold,
    });
    useAppStore.getState().setInputBufferThreshold(threshold);
  },

  hydrateFromAppStore: () => {
    const app = useAppStore.getState();
    set({
      clockPacingMode: app.clockPacingMode,
      experiencePriority:
        app.clockPacingMode === 'custom'
          ? 'custom'
          : normalizeExperiencePriority(app.clockPacingPriority),
      inputBufferTarget: app.inputBufferTarget,
      inputBufferThreshold: app.inputBufferThreshold,
    });
  },

  resetSettingsPacing: () => {
    set({
      clockPacingMode: 'csts',
      experiencePriority: 'balanced',
      inputBufferTarget: 3,
      inputBufferThreshold: [-1, 1],
    });
    const app = useAppStore.getState();
    app.setClockPacingMode('csts');
    app.setClockPacingPriority('balanced');
    app.setInputBufferTarget(3);
    app.setInputBufferThreshold([-1, 1]);
  },
}));
