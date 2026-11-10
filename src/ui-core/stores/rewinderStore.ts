import { create } from 'zustand';

export type RewinderFlowPreset = '100' | '50' | '25' | '75' | 'custom';
export type RewinderRecorderState =
  | 'idle'
  | 'recording'
  | 'stopped'
  | 'rewinding'
  | 'forwarding'
  | 'paused-scrub'
  | 'preroll-countdown';
export type RewinderDownCounterSec = 0 | 1 | 2 | 3;
export type RewinderDownCounterOption = RewinderDownCounterSec;

export function resolveRewinderRateFromPreset(preset: RewinderFlowPreset, customPct: number): number {
  if (preset === '100' || preset === '75' || preset === '50' || preset === '25') return Number(preset);
  return Math.max(5, Math.min(200, Math.round(customPct)));
}

export interface RewinderState {
  rewinderState: RewinderRecorderState;
  rewinderRecordedFrames: number;
  rewinderCursorFrame: number;
  rewinderTargetFrame: number;
  rewinderDownCounterSec: RewinderDownCounterSec;
  rewinderPrerollRemainingSec: number;
  rewinderMaxCapacityFrames: number;
  rewinderFlowPreset: RewinderFlowPreset;
  rewinderCustomFlowPct: number;
  rewinderEffectiveFlowPct: number;
  rewinderWindowOpen: boolean;
  rewinderHasHotkeyPriority: boolean;

  setRewinderFlowPreset: (preset: RewinderFlowPreset) => void;
  setRewinderCustomFlowPct: (pct: number) => void;
  setRewinderDownCounterSec: (sec: RewinderDownCounterSec) => void;
  resetRewinderTelemetry: () => void;
  updateLiveTelemetry: (patch: Partial<RewinderState>) => void;

  runtimeHandlers: {
    onRewinderStartRecording?: () => void;
    onRewinderStopRecording?: () => void;
    onRewinderPushBackwardStart?: () => void;
    onRewinderPushBackwardStop?: () => void;
    onRewinderPushForwardStart?: () => void;
    onRewinderPushForwardStop?: () => void;
    onRewinderResumeFromHere?: () => void;
    onRewinderClearBuffer?: () => void;
    onRewinderCancelToFreeplay?: () => void;
    onRewinderExportReplay?: () => Promise<boolean | void> | boolean | void;
    onRewinderImportReplay?: (file: File) => Promise<boolean | void> | boolean | void;
    onRewinderSeekFrame?: (frameIndex: number) => void;
  };
  setRuntimeHandlers: (handlers: Partial<RewinderState['runtimeHandlers']>) => void;
}

export const useRewinderStore = create<RewinderState>((set, get) => ({
  rewinderState: 'idle',
  rewinderRecordedFrames: 0,
  rewinderCursorFrame: 0,
  rewinderTargetFrame: 0,
  rewinderDownCounterSec: 0,
  rewinderPrerollRemainingSec: 0,
  rewinderMaxCapacityFrames: 18000,
  rewinderFlowPreset: '100',
  rewinderCustomFlowPct: 50,
  rewinderEffectiveFlowPct: 100,
  rewinderWindowOpen: false,
  rewinderHasHotkeyPriority: false,

  runtimeHandlers: new Proxy({} as RewinderState['runtimeHandlers'], {
    get(target, prop, receiver) {
      const val = Reflect.get(target, prop, receiver);
      if (typeof val === 'function') {
        return val;
      }
      if (typeof prop === 'string' && prop.startsWith('on')) {
        return (..._args: unknown[]) => {
          console.warn(
            `[rewinderStore] Runtime handler "${prop}" was invoked before FreeplayRewinderController or SubsystemIsolationLabMode registered it.`
          );
        };
      }
      return val;
    },
  }),

  setRuntimeHandlers: (handlers) =>
    set((s) => {
      const merged = { ...s.runtimeHandlers, ...handlers };
      return {
        runtimeHandlers: new Proxy(merged, {
          get(target, prop, receiver) {
            const val = Reflect.get(target, prop, receiver);
            if (typeof val === 'function') {
              return val;
            }
            if (typeof prop === 'string' && prop.startsWith('on')) {
              return (..._args: unknown[]) => {
                console.warn(
                  `[rewinderStore] Runtime handler "${prop}" is not registered in the current mode.`
                );
              };
            }
            return val;
          },
        }),
      };
    }),

  setRewinderFlowPreset: (rewinderFlowPreset) => {
    const eff = resolveRewinderRateFromPreset(rewinderFlowPreset, get().rewinderCustomFlowPct);
    set({ rewinderFlowPreset, rewinderEffectiveFlowPct: eff });
  },

  setRewinderCustomFlowPct: (pct) => {
    const clamped = Math.max(5, Math.min(200, Math.round(pct)));
    const eff = get().rewinderFlowPreset === 'custom' ? clamped : get().rewinderEffectiveFlowPct;
    set({ rewinderCustomFlowPct: clamped, rewinderEffectiveFlowPct: eff });
  },

  setRewinderDownCounterSec: (rewinderDownCounterSec) => {
    const clamped: RewinderDownCounterSec =
      rewinderDownCounterSec === 0 ? 0 : rewinderDownCounterSec === 1 ? 1 : rewinderDownCounterSec === 2 ? 2 : 3;
    set({ rewinderDownCounterSec: clamped });
  },

  resetRewinderTelemetry: () =>
    set({
      rewinderState: 'idle',
      rewinderRecordedFrames: 0,
      rewinderCursorFrame: 0,
      rewinderTargetFrame: 0,
      rewinderPrerollRemainingSec: 0,
    }),

  updateLiveTelemetry: (patch) => set((s) => ({ ...s, ...patch })),
}));
