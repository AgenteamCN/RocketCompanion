import { create } from 'zustand';
import type {
  ReplayDownCounterOption,
  ReplayFlowPreset,
  ReplayIncidentMarker,
  ReplaySignalMarker,
  ReplayViewerState,
} from './replayViewerStore';

export type RLReplayInterpolationMethod = 'hermite-clamped' | 'linear';
export type RLReplayNonPovInterventionMode = 'disappear' | 'trajectory' | 'nexto' | 'necto';

export interface ReplayNativeEventMarker {
  frameIndex: number;
  kind: 'goal' | 'save' | 'demolish' | 'user-mark';
  slotIndex: number;
  team: -1 | 0 | 1;
  label: string;
}

export interface ReplayKeyframeMarker {
  frameIndex: number;
  kind: 'ue-keyframe' | 'kickoff';
  sourceFrame30Hz: number;
  label: string;
}

export interface RLReplayTrackDeltaSummary {
  part1CrcValid: boolean;
  part2CrcValid: boolean;
  replayId: string;
  mapName: string;
  date: string;
  sourceFrameCount: number;
  upsampledFrameCount: number;
  mappedPropertyCount: number;
  trackDeltaOnlyPropertyCount: number;
  unmappedPropertyNames: string[];
}

export interface ReplayToRcsImporterStoreState {
  viewerState: ReplayViewerState;
  loadedFileName: string | null;
  totalFrames: number;
  sourceFrameCount: number;
  sourceRecordFps: number;
  cursorFrame: number;
  targetFrame: number;
  stateTrackCount: number;
  incidentTrackCount: number;
  signalTrackCount: number;
  nativeEventTrackCount: number;
  keyframeTrackCount: number;
  recordedSignalCount: number;
  synthesizedSignalCount: number;
  incidentMarkers: ReplayIncidentMarker[];
  signalMarkers: ReplaySignalMarker[];
  nativeEventMarkers: ReplayNativeEventMarker[];
  keyframeMarkers: ReplayKeyframeMarker[];
  interpolationMethod: RLReplayInterpolationMethod;
  nonPovInterventionMode: RLReplayNonPovInterventionMode;
  trackDeltaSummary: RLReplayTrackDeltaSummary | null;
  downCounterSec: ReplayDownCounterOption;
  prerollRemainingSec: number;
  flowPreset: ReplayFlowPreset;
  customFlowPct: number;
  effectiveFlowPct: number;
  errorMessage: string | null;
  isWindowOpen: boolean;
  hasHotkeyPriority: boolean;
  activePovCarIndex: number;
  activePovSlotKey: number | null;
  activePovTeam: 0 | 1;
  isLoadingReplay: boolean;
  isExportingRcsPack: boolean;

  setDownCounterSec: (sec: ReplayDownCounterOption) => void;
  setFlowPreset: (preset: ReplayFlowPreset) => void;
  setCustomFlowPct: (pct: number) => void;
  setInterpolationMethod: (method: RLReplayInterpolationMethod) => void;
  setNonPovInterventionMode: (mode: RLReplayNonPovInterventionMode) => void;
  setErrorMessage: (msg: string | null) => void;
  updateLiveTelemetry: (patch: Partial<ReplayToRcsImporterStoreState>) => void;

  runtimeHandlers: {
    onUploadRLReplayFile?: (file: File) => Promise<void> | void;
    onExportRcsReplayPack?: () => Promise<void> | void;
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
    onInterpolationMethodChange?: (method: RLReplayInterpolationMethod) => void;
    onNonPovInterventionModeChange?: (mode: RLReplayNonPovInterventionMode) => void;
    onClearReplay?: () => void;
  };
  setRuntimeHandlers: (handlers: Partial<ReplayToRcsImporterStoreState['runtimeHandlers']>) => void;
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
            `[replayToRcsImporterStore] Runtime handler "${prop}" was invoked before ReplayToRcsImporterController registered its handlers.`
          );
        };
      }
      return val;
    },
  });
}

export const useReplayToRcsImporterStore = create<ReplayToRcsImporterStoreState>((set) => ({
  viewerState: 'idle',
  loadedFileName: null,
  totalFrames: 0,
  sourceFrameCount: 0,
  sourceRecordFps: 30,
  cursorFrame: 0,
  targetFrame: 0,
  stateTrackCount: 0,
  incidentTrackCount: 0,
  signalTrackCount: 0,
  nativeEventTrackCount: 0,
  keyframeTrackCount: 0,
  recordedSignalCount: 0,
  synthesizedSignalCount: 0,
  incidentMarkers: [],
  signalMarkers: [],
  nativeEventMarkers: [],
  keyframeMarkers: [],
  interpolationMethod: 'hermite-clamped',
  nonPovInterventionMode: 'trajectory',
  trackDeltaSummary: null,
  downCounterSec: 0,
  prerollRemainingSec: 0,
  flowPreset: '100',
  customFlowPct: 60,
  effectiveFlowPct: 100,
  errorMessage: null,
  isWindowOpen: false,
  hasHotkeyPriority: false,
  activePovCarIndex: 0,
  activePovSlotKey: 1,
  activePovTeam: 0,
  isLoadingReplay: false,
  isExportingRcsPack: false,

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
  setInterpolationMethod: (interpolationMethod) =>
    set((s) => {
      s.runtimeHandlers.onInterpolationMethodChange?.(interpolationMethod);
      return { interpolationMethod };
    }),
  setNonPovInterventionMode: (nonPovInterventionMode) =>
    set((s) => {
      s.runtimeHandlers.onNonPovInterventionModeChange?.(nonPovInterventionMode);
      return { nonPovInterventionMode };
    }),
  setErrorMessage: (errorMessage) => set({ errorMessage }),
  updateLiveTelemetry: (patch) => set((s) => ({ ...s, ...patch })),

  runtimeHandlers: createGuardedRuntimeHandlers<ReplayToRcsImporterStoreState['runtimeHandlers']>({}),
  setRuntimeHandlers: (handlers) =>
    set((s) => ({
      runtimeHandlers: createGuardedRuntimeHandlers<ReplayToRcsImporterStoreState['runtimeHandlers']>({
        ...s.runtimeHandlers,
        ...handlers,
      }),
    })),
}));
