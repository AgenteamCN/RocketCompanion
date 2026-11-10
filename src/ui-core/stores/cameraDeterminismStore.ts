import { useSyncExternalStore } from 'react';
import { CAMERA_SOURCE_MODES, CAMERA_CAPTURE_STATES } from '../config/cameraDefaults';
import { useQuickNotificationStore } from './quickNotificationStore';
import { createExternalStore } from './createExternalStore';

export type CameraSourceMode = 'wasm' | 'clean_js';
export type CameraCaptureState = 'monitoring' | 'capturing_post' | 'captured_ready';

export const CAMERA_DIVERGENCE_NOTIFICATION_ID = 'camera-determinism-divergence';

export interface CameraDeterminismMetrics {
  frameIndex: number;
  activeSource: CameraSourceMode;
  captureState: CameraCaptureState;
  preBufferCount: number;
  postBufferCount: number;
  totalCapturedCount: number;
  triggerFrameIndex: number;
  deltaPos: number;
  deltaDir: number;
  deltaUp: number;
  deltaFov: number;
  maxRelError: number;
  peakDeltaPos: number;
  peakDeltaDir: number;
  peakDeltaUp: number;
  peakDeltaFov: number;
  peakRelError: number;
  divergenceCount: number;
  isMatching: boolean;
}

export interface CameraDeterminismStoreState {
  metrics: CameraDeterminismMetrics;
  activeSource: CameraSourceMode;
  autoCaptureEnabled: boolean;
  posTolerance: number;
}

let harnessRef: any | null = null;
let unsubscribeHarness: (() => void) | null = null;
let hasNotifiedDivergence = false;

const core = createExternalStore<CameraDeterminismStoreState>(
  {
    metrics: {
      frameIndex: 0,
      activeSource: CAMERA_SOURCE_MODES.CLEAN_JS as CameraSourceMode,
      captureState: CAMERA_CAPTURE_STATES.MONITORING as CameraCaptureState,
      preBufferCount: 0,
      postBufferCount: 0,
      totalCapturedCount: 0,
      triggerFrameIndex: -1,
      deltaPos: 0,
      deltaDir: 0,
      deltaUp: 0,
      deltaFov: 0,
      maxRelError: 0,
      peakDeltaPos: 0,
      peakDeltaDir: 0,
      peakDeltaUp: 0,
      peakDeltaFov: 0,
      peakRelError: 0,
      divergenceCount: 0,
      isMatching: true,
    },
    activeSource: CAMERA_SOURCE_MODES.CLEAN_JS as CameraSourceMode,
    autoCaptureEnabled: true,
    posTolerance: 0.01,
  },
  {
    onFirstSubscribe: () => {
      if (harnessRef) {
        syncStateFromHarness();
      }
    },
  }
);

function dispatchDivergenceQuickNotification() {
  try {
    useQuickNotificationStore.getState().pushNotification({
      id: CAMERA_DIVERGENCE_NOTIFICATION_ID,
      type: 'temporary',
      duration: 5000,
      tone: 'warning',
      icon: 'camera',
      content: 'Camera divergence detected. Diagnostic trace recorded.',
      buttons: [
        {
          key: 'download',
          label: 'Download',
          icon: 'download',
          color: 'sky',
          dismissOnClick: false,
          onClick: () => {
            harnessRef?.exportCsvFile?.();
          },
        },
        {
          key: 'reset',
          label: 'Reset',
          icon: 'rotate-ccw',
          color: 'amber',
          dismissOnClick: true,
          onClick: () => {
            cameraDeterminismStore.resetCaptureAndPeaks();
          },
        },
      ],
    });
  } catch (err) {
    console.warn('[cameraDeterminismStore] Failed to dispatch divergence notification:', err);
  }
}

function syncStateFromHarness() {
  if (!harnessRef) return;
  core.setState(
    {
      metrics: { ...(harnessRef.metrics as CameraDeterminismMetrics) },
      activeSource: harnessRef.activeSource as CameraSourceMode,
      autoCaptureEnabled: Boolean(harnessRef.autoCaptureEnabled),
      posTolerance: Number(harnessRef.posTolerance),
    },
    false
  );
}

export const cameraDeterminismStore = {
  getSnapshot: core.getSnapshot,
  subscribe: core.subscribe,

  setHarness: (harness: any) => {
    if (harnessRef === harness) return;
    if (unsubscribeHarness) {
      unsubscribeHarness();
      unsubscribeHarness = null;
    }
    harnessRef = harness;
    if (!harness) return;

    syncStateFromHarness();

    if (typeof harness.subscribe === 'function') {
      unsubscribeHarness = harness.subscribe((updatedMetrics: CameraDeterminismMetrics) => {
        if (!updatedMetrics.isMatching && !hasNotifiedDivergence) {
          hasNotifiedDivergence = true;
          dispatchDivergenceQuickNotification();
        }

        const state = core.getSnapshot();
        const criticalChange =
          state.activeSource !== harness.activeSource ||
          state.metrics.captureState !== updatedMetrics.captureState ||
          state.metrics.isMatching !== updatedMetrics.isMatching ||
          state.autoCaptureEnabled !== Boolean(harness.autoCaptureEnabled) ||
          state.posTolerance !== Number(harness.posTolerance);

        if (core.getListenerCount() === 0 && !criticalChange) {
          return;
        }

        syncStateFromHarness();
        core.notify();
      });
    }
    core.notify();
  },

  setActiveSource: (source: CameraSourceMode) => {
    if (harnessRef) {
      harnessRef.setActiveSource(source);
    } else {
      core.setState((state) => ({
        ...state,
        activeSource: source,
        metrics: { ...state.metrics, activeSource: source },
      }));
    }
  },

  toggleActiveSource: () => {
    if (harnessRef) {
      return harnessRef.toggleActiveSource() as CameraSourceMode;
    }
    const state = core.getSnapshot();
    const next: CameraSourceMode = state.activeSource === 'clean_js' ? 'wasm' : 'clean_js';
    cameraDeterminismStore.setActiveSource(next);
    return next;
  },

  toggleAutoCapture: () => {
    const state = core.getSnapshot();
    const next = !state.autoCaptureEnabled;
    if (harnessRef) {
      harnessRef.autoCaptureEnabled = next;
    }
    core.setState((s) => ({
      ...s,
      autoCaptureEnabled: next,
    }));
  },

  setPosTolerance: (tolerance: number) => {
    if (harnessRef) {
      harnessRef.setPosTolerance(tolerance);
    } else {
      core.setState((s) => ({ ...s, posTolerance: Number(tolerance) }));
    }
  },

  resetCaptureAndPeaks: () => {
    hasNotifiedDivergence = false;
    harnessRef?.resetCaptureAndPeaks?.();
    try {
      useQuickNotificationStore.getState().dismissNotification(CAMERA_DIVERGENCE_NOTIFICATION_ID);
    } catch (err) {
      console.warn('[cameraDeterminismStore] Failed to dismiss divergence notification:', err);
    }
  },

  triggerManualCapture: () => {
    harnessRef?.triggerManualCapture?.();
  },

  exportCsvFile: () => {
    return harnessRef?.exportCsvFile?.() ?? '';
  },
};

export const useCameraDeterminismData = () => {
  return useSyncExternalStore(
    cameraDeterminismStore.subscribe,
    cameraDeterminismStore.getSnapshot
  );
};


