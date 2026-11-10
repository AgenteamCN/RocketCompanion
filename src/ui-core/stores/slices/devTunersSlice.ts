import { type StateCreator } from 'zustand';
import { floatingStore } from '../floatingStore';
import { FLOATING_WINDOW_OPACITY_PRESET } from '../floatingPresets';
import { activateNameTagOffscreenForDeveloperMode } from '../nameTagTunerStore';
import {
  DEFAULT_DRIFTWOODS_CONFIG,
  cloneDriftwoodsConfig,
  mergeDriftwoodsConfig,
  type DriftwoodsTunerConfig,
} from '../../config/driftwoodsConfig';
import { STORAGE_KEYS, safeStorage } from '../../config/storageHelpers';
import { type ClockPacingMode, type ClockPacingPriority, type ClockPacingParams, resolveEffectiveClockPacingParams, saveCustomClockPacingParams, getInitialClockPacingMode, getInitialClockPacingPriority, getInitialCustomClockPacingParams } from '../../config/clockPacingConfig';
import { DEFAULT_CLOCK_PACING_PARAMS, CLOCK_PACING_PRIORITY_PRESETS } from '../../config/clockPacingPresets';
import {
  DEFAULT_BOOST_PAD_TUNER_CONFIG,
  getInitialDeveloperMode,
  getInitialTouchMode,
  getInitialTouchHeadlessMode,
  type TouchInputAgentMode,
  getInitialBoostPadTuner,
  getInitialDriftwoodsTuner,
  getInitialInputBufferTarget,
  getInitialInputBufferThreshold,
} from '../../config/uiConfig';
import { type AppState } from '../appStoreTypes';

export type DevTunersSlice = Pick<
  AppState,
  | 'boostPadTuner'
  | 'driftwoodsTuner'
  | 'underDevelopment'
  | 'developerMode'
  | 'setDeveloperMode'
  | 'touchMode'
  | 'touchHeadlessMode'
  | 'touchInputAgent'
  | 'setTouchInputAgent'
  | 'clockPacingMode'
  | 'setClockPacingMode'
  | 'clockPacingPriority'
  | 'setClockPacingPriority'
  | 'customClockPacingParams'
  | 'updateCustomClockPacingParams'
  | 'resetCustomClockPacingParams'
  | 'inputBufferTarget'
  | 'setInputBufferTarget'
  | 'inputBufferThreshold'
  | 'setInputBufferThreshold'
  | 'updateBoostPadTuner'
  | 'resetBoostPadTuner'
  | 'updateDriftwoodsTuner'
  | 'resetDriftwoodsTuner'
  | 'applyDriftwoodsPreset'
  | 'updateUnderDevelopment'
  | 'precisionStep'
  | 'setPrecisionStep'
>;

export const createDevTunersSlice: StateCreator<
  AppState,
  [],
  [],
  DevTunersSlice
> = (set, get) => ({
  boostPadTuner: getInitialBoostPadTuner(),
  driftwoodsTuner: getInitialDriftwoodsTuner(),
  underDevelopment: {
    threeWheelsEnabled: false,
    stadiumPreset: 'standard',
    showThrowbackCollisionOverlay: false,
    selectedBoostCarIndex: 0,
    perCarBoostConfigs: {
      0: { unlimitedBoost: true, boostCollectable: true, rechargeBoostEnabled: false, rechargeBoostPerSecond: 10.0, rechargeBoostDelay: 0.25 },
      1: { unlimitedBoost: true, boostCollectable: true, rechargeBoostEnabled: false, rechargeBoostPerSecond: 10.0, rechargeBoostDelay: 0.25 },
      2: { unlimitedBoost: true, boostCollectable: true, rechargeBoostEnabled: false, rechargeBoostPerSecond: 10.0, rechargeBoostDelay: 0.25 },
      3: { unlimitedBoost: true, boostCollectable: true, rechargeBoostEnabled: false, rechargeBoostPerSecond: 10.0, rechargeBoostDelay: 0.25 },
      4: { unlimitedBoost: true, boostCollectable: true, rechargeBoostEnabled: false, rechargeBoostPerSecond: 10.0, rechargeBoostDelay: 0.25 },
      5: { unlimitedBoost: true, boostCollectable: true, rechargeBoostEnabled: false, rechargeBoostPerSecond: 10.0, rechargeBoostDelay: 0.25 },
      6: { unlimitedBoost: true, boostCollectable: true, rechargeBoostEnabled: false, rechargeBoostPerSecond: 10.0, rechargeBoostDelay: 0.25 },
      7: { unlimitedBoost: true, boostCollectable: true, rechargeBoostEnabled: false, rechargeBoostPerSecond: 10.0, rechargeBoostDelay: 0.25 },
    },
  },

  developerMode: getInitialDeveloperMode(),
  setDeveloperMode: (mode) => {
    if (mode && !getInitialDeveloperMode()) {
      return;
    }
    set({ developerMode: mode });
    if (mode) {
      activateNameTagOffscreenForDeveloperMode();
      const existing = floatingStore
        .getSnapshot()
        .windows.some((w) => w.id === FLOATING_WINDOW_OPACITY_PRESET.id);
      if (!existing) {
        floatingStore.spawnWindow({
          ...FLOATING_WINDOW_OPACITY_PRESET,
          startMinimized: true,
        });
      }
    }
  },
  touchMode: getInitialTouchMode(),
  touchHeadlessMode: getInitialTouchHeadlessMode(),
  touchInputAgent: 'none',
  setTouchInputAgent: (agent: TouchInputAgentMode) => set({ touchInputAgent: agent }),
  clockPacingMode: getInitialClockPacingMode(),
  setClockPacingMode: (mode: ClockPacingMode) => {
    if (mode === 'custom' && !get().developerMode && get().clockPacingMode !== 'custom') {
      return;
    }
    safeStorage.set?.(STORAGE_KEYS.CLOCK_PACING, mode);
    set({ clockPacingMode: mode });
    const s = get();
    const effective = resolveEffectiveClockPacingParams(
      mode,
      s.clockPacingPriority,
      s.inputBufferTarget,
      s.inputBufferThreshold,
      s.customClockPacingParams
    );
    s.bridge.onClockPacingModeChange?.(mode);
    s.bridge.onClockPacingParamsChange?.(effective);
  },
  clockPacingPriority: getInitialClockPacingPriority(),
  setClockPacingPriority: (priority: ClockPacingPriority) => {
    const preset = CLOCK_PACING_PRIORITY_PRESETS[priority] || CLOCK_PACING_PRIORITY_PRESETS.balanced;
    const nextTarget = preset.targetBufferTicks;
    const nextThreshold: [number, number] = [preset.deadband[0], preset.deadband[1]];
    safeStorage.set?.(STORAGE_KEYS.CLOCK_PACING_PRIORITY, priority);
    safeStorage.set?.(STORAGE_KEYS.INPUT_BUFFER_TARGET, nextTarget);
    safeStorage.set?.(STORAGE_KEYS.INPUT_BUFFER_THRESHOLD, JSON.stringify(nextThreshold));
    set({
      clockPacingPriority: priority,
      inputBufferTarget: nextTarget,
      inputBufferThreshold: nextThreshold,
    });
    const s = get();
    const effective = resolveEffectiveClockPacingParams(
      s.clockPacingMode,
      priority,
      nextTarget,
      nextThreshold,
      s.customClockPacingParams
    );
    s.bridge.onClockPacingPriorityChange?.(priority);
    s.bridge.onInputBufferTargetChange?.(nextTarget);
    s.bridge.onInputBufferThresholdChange?.(nextThreshold);
    s.bridge.onClockPacingParamsChange?.(effective);
  },
  customClockPacingParams: getInitialCustomClockPacingParams(),
  updateCustomClockPacingParams: (patch: Partial<ClockPacingParams>) => {
    const current = get().customClockPacingParams;
    const nextCustom = saveCustomClockPacingParams({ ...current, ...patch });
    safeStorage.set?.(STORAGE_KEYS.CLOCK_PACING, 'custom');
    set({
      customClockPacingParams: nextCustom,
      clockPacingMode: 'custom',
    });
    const s = get();
    s.bridge.onClockPacingModeChange?.('custom');
    s.bridge.onClockPacingParamsChange?.(nextCustom);
  },
  resetCustomClockPacingParams: () => {
    const reset = saveCustomClockPacingParams({ ...DEFAULT_CLOCK_PACING_PARAMS });
    set({ customClockPacingParams: reset });
    const s = get();
    const effective = resolveEffectiveClockPacingParams(
      s.clockPacingMode,
      s.clockPacingPriority,
      s.inputBufferTarget,
      s.inputBufferThreshold,
      reset
    );
    s.bridge.onClockPacingParamsChange?.(effective);
  },
  inputBufferTarget: getInitialInputBufferTarget(),
  setInputBufferTarget: (target: number) => {
    const clamped = Math.max(1, Math.min(6, Math.round(target)));
    safeStorage.set?.(STORAGE_KEYS.INPUT_BUFFER_TARGET, clamped);
    const currentThreshold = get().inputBufferThreshold;
    const nextCatchup = Math.max(-clamped, Math.min(0, currentThreshold[0]));
    const nextSkip = Math.max(0, Math.min(clamped, currentThreshold[1]));
    const nextThreshold: [number, number] = [nextCatchup, nextSkip];
    safeStorage.set?.(STORAGE_KEYS.INPUT_BUFFER_THRESHOLD, JSON.stringify(nextThreshold));
    set({ inputBufferTarget: clamped, inputBufferThreshold: nextThreshold });
    const s = get();
    const effective = resolveEffectiveClockPacingParams(
      s.clockPacingMode,
      s.clockPacingPriority,
      clamped,
      nextThreshold,
      s.customClockPacingParams
    );
    s.bridge.onInputBufferTargetChange?.(clamped);
    s.bridge.onInputBufferThresholdChange?.(nextThreshold);
    s.bridge.onClockPacingParamsChange?.(effective);
  },
  inputBufferThreshold: getInitialInputBufferThreshold(),
  setInputBufferThreshold: (range: [number, number]) => {
    const alpha = get().inputBufferTarget;
    const catchup = Math.max(-alpha, Math.min(0, Math.round(range[0])));
    const skip = Math.max(0, Math.min(alpha, Math.round(range[1])));
    const clamped: [number, number] = [catchup, skip];
    safeStorage.set?.(STORAGE_KEYS.INPUT_BUFFER_THRESHOLD, JSON.stringify(clamped));
    set({ inputBufferThreshold: clamped });
    const s = get();
    const effective = resolveEffectiveClockPacingParams(
      s.clockPacingMode,
      s.clockPacingPriority,
      s.inputBufferTarget,
      clamped,
      s.customClockPacingParams
    );
    s.bridge.onInputBufferThresholdChange?.(clamped);
    s.bridge.onClockPacingParamsChange?.(effective);
  },

  updateBoostPadTuner: (patch) => {
    set((s) => {
      const next = { ...s.boostPadTuner, ...patch };
      safeStorage.set(STORAGE_KEYS.BOOST_PAD_TUNER, JSON.stringify(next));
      get().bridge.onBoostPadTunerChange?.(next);
      return { boostPadTuner: next };
    });
  },

  resetBoostPadTuner: () => {
    set(() => {
      safeStorage.set(
        STORAGE_KEYS.BOOST_PAD_TUNER,
        JSON.stringify(DEFAULT_BOOST_PAD_TUNER_CONFIG)
      );
      get().bridge.onBoostPadTunerChange?.(DEFAULT_BOOST_PAD_TUNER_CONFIG);
      return { boostPadTuner: { ...DEFAULT_BOOST_PAD_TUNER_CONFIG } };
    });
  },

  updateDriftwoodsTuner: (patch) => {
    set((s) => {
      const next: DriftwoodsTunerConfig = mergeDriftwoodsConfig(s.driftwoodsTuner, patch);
      safeStorage.set(STORAGE_KEYS.DRIFTWOODS_TUNER, JSON.stringify(next));
      get().bridge.onDriftwoodsTunerChange?.(next);
      return { driftwoodsTuner: next };
    });
  },

  resetDriftwoodsTuner: () => {
    set(() => {
      const reset = cloneDriftwoodsConfig(DEFAULT_DRIFTWOODS_CONFIG);
      safeStorage.set(STORAGE_KEYS.DRIFTWOODS_TUNER, JSON.stringify(reset));
      get().bridge.onDriftwoodsTunerChange?.(reset);
      return { driftwoodsTuner: reset };
    });
  },

  applyDriftwoodsPreset: (preset) => {
    set(() => {
      const cloned = cloneDriftwoodsConfig(preset.config);
      safeStorage.set(STORAGE_KEYS.DRIFTWOODS_TUNER, JSON.stringify(cloned));
      get().bridge.onDriftwoodsTunerChange?.(cloned);
      return { driftwoodsTuner: cloned };
    });
  },

  updateUnderDevelopment: async (patch) => {
    const next = { ...get().underDevelopment, ...patch };
    set({ underDevelopment: next });
    await get().bridge.onUnderDevelopmentChange?.(next, patch);
  },

  precisionStep: 0.001,
  setPrecisionStep: (step: number) => {
    set({ precisionStep: step });
  },
});
