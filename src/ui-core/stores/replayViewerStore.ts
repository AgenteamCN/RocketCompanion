import { create } from 'zustand';

export type ReplayViewerState =
  | 'idle'
  | 'playing'
  | 'paused'
  | 'rewinding'
  | 'forwarding'
  | 'preroll-countdown'
  | 'intervening';

export type ReplayFlowPreset = '100' | '50' | '200' | '500' | 'custom';
export type ReplayDownCounterOption = 0 | 1 | 2 | 3;

export interface ReplayIncidentMarker {
  frameIndex: number;
  tick: number;
  type: number;
  carIndex: number;
  team: number;
  label: string;
}

export interface ReplaySignalMarker {
  frameIndex: number;
  tick: number;
  type: number;
  param1: number;
  param2: number;
  synthesized?: boolean;
  label: string;
}

export interface ReplayViewerStoreState {
  viewerState: ReplayViewerState;
  loadedFileName: string | null;
  totalFrames: number;
  cursorFrame: number;
  targetFrame: number;
  stateTrackCount: number;
  incidentTrackCount: number;
  signalTrackCount: number;
  recordedSignalCount: number;
  synthesizedSignalCount: number;
  incidentMarkers: ReplayIncidentMarker[];
  signalMarkers: ReplaySignalMarker[];
  downCounterSec: ReplayDownCounterOption;
  prerollRemainingSec: number;
  flowPreset: ReplayFlowPreset;
  customFlowPct: number;
  effectiveFlowPct: number;
  errorMessage: string | null;
  hasRetainedMatch: boolean;
  isWindowOpen: boolean;
  hasHotkeyPriority: boolean;
  activePovCarIndex: number;
  activePovSlotKey: number | null;
  activePovTeam: 0 | 1;
  isLoadingReplay: boolean;

  setDownCounterSec: (sec: ReplayDownCounterOption) => void;
  setFlowPreset: (preset: ReplayFlowPreset) => void;
  setCustomFlowPct: (pct: number) => void;
  setErrorMessage: (msg: string | null) => void;
  updateLiveTelemetry: (patch: Partial<ReplayViewerStoreState>) => void;

  runtimeHandlers: {
    onUploadReplayFile?: (file: File) => Promise<void> | void;
    onLoadRetainedMatchReplay?: () => void;
    onStartPlaying?: () => void;
    onPausePlaying?: () => void;
    onSeekFrame?: (frameIndex: number) => void;
    onPushBackwardStart?: () => void;
    onPushBackwardStop?: () => void;
    onPushForwardStart?: () => void;
    onPushForwardStop?: () => void;
    onResumeFromHere?: () => void;
    onReturnToReplay?: () => void;
    onSelectPovSlot?: (slotKey: number | null) => void;
    onClearReplay?: () => void;
  };
  setRuntimeHandlers: (handlers: Partial<ReplayViewerStoreState['runtimeHandlers']>) => void;
}

function createGuardedRuntimeHandlers<T extends object>(rawHandlers: T): T {
  return new Proxy(rawHandlers, {
    get(target, prop, receiver) {
      const val = Reflect.get(target, prop, receiver);
      if (typeof val === 'function') {
        return val;
      }
      if (typeof prop === 'string' && prop.startsWith('on')) {
        return (..._args: unknown[]) => {
          console.warn(
            `[replayViewerStore] Runtime handler "${prop}" was invoked before StandaloneReplayViewerController registered its handlers.`
          );
        };
      }
      return val;
    },
  });
}

export const useReplayViewerStore = create<ReplayViewerStoreState>((set) => ({
  viewerState: 'idle',
  loadedFileName: null,
  totalFrames: 0,
  cursorFrame: 0,
  targetFrame: 0,
  stateTrackCount: 0,
  incidentTrackCount: 0,
  signalTrackCount: 0,
  recordedSignalCount: 0,
  synthesizedSignalCount: 0,
  incidentMarkers: [],
  signalMarkers: [],
  downCounterSec: 0,
  prerollRemainingSec: 0,
  flowPreset: '100',
  customFlowPct: 60,
  effectiveFlowPct: 100,
  errorMessage: null,
  hasRetainedMatch: false,
  isWindowOpen: false,
  hasHotkeyPriority: false,
  activePovCarIndex: 0,
  activePovSlotKey: 1,
  activePovTeam: 0,
  isLoadingReplay: false,

  setDownCounterSec: (downCounterSec) => set({ downCounterSec }),
  setFlowPreset: (flowPreset) =>
    set((s) => ({
      flowPreset,
      effectiveFlowPct:
        flowPreset === 'custom' ? s.customFlowPct : Number(flowPreset) || 100,
    })),
  setCustomFlowPct: (customFlowPct) => {
    const clamped = Math.max(1, Math.min(500, Math.round(Number(customFlowPct) || 100)));
    set((s) => ({
      customFlowPct: clamped,
      effectiveFlowPct: s.flowPreset === 'custom' ? clamped : s.effectiveFlowPct,
    }));
  },
  setErrorMessage: (errorMessage) => set({ errorMessage }),
  updateLiveTelemetry: (patch) => set((s) => ({ ...s, ...patch })),

  runtimeHandlers: createGuardedRuntimeHandlers<ReplayViewerStoreState['runtimeHandlers']>({}),
  setRuntimeHandlers: (handlers) =>
    set((s) => ({
      runtimeHandlers: createGuardedRuntimeHandlers<ReplayViewerStoreState['runtimeHandlers']>({
        ...s.runtimeHandlers,
        ...handlers,
      }),
    })),
}));

