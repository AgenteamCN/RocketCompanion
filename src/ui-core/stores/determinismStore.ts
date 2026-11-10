import { useSyncExternalStore } from 'react';
import { createExternalStore } from './createExternalStore';

export interface DeterminismMetrics {
  tickA: number;
  tickB: number;
  totalRollbacks: number;
  currentDepth: number;
  lastRollbackDurationMs: number;
  carDeltaPos: number;
  carDeltaVel: number;
  carDeltaAngVel: number;
  ballDeltaPos: number;
  maxDeltaPos: number;
  maxDeltaVel: number;
  maxDeltaBall: number;
  isBitExact: boolean;
}

export interface DeterminismHarnessHandle {
  periodicRollback?: boolean;
  rollbackInterval?: number;
  rollbackDepth?: number;
  addMetricsListener?: (cb: (m: DeterminismMetrics) => void) => void;
  onMetricsUpdated?: ((m: DeterminismMetrics) => void) | null;
  triggerManualRollback?: (depth: number) => void;
  executeRollback?: (depth: number) => void;
  compareStates?: () => void;
  setRollbackDepth?: (depth: number) => void;
  setRollbackInterval?: (interval: number) => void;
  resetMaxDeltas?: () => void;
}

export interface DeterminismState {
  metrics: DeterminismMetrics;
  periodicRollback: boolean;
  rollbackInterval: number;
  rollbackDepth: number;
  active: boolean;
  harnessRef: DeterminismHarnessHandle | null;
}

const core = createExternalStore<DeterminismState>({
  metrics: {
    tickA: 0,
    tickB: 0,
    totalRollbacks: 0,
    currentDepth: 0,
    lastRollbackDurationMs: 0,
    carDeltaPos: 0,
    carDeltaVel: 0,
    carDeltaAngVel: 0,
    ballDeltaPos: 0,
    maxDeltaPos: 0,
    maxDeltaVel: 0,
    maxDeltaBall: 0,
    isBitExact: true,
  },
  periodicRollback: true,
  rollbackInterval: 30,
  rollbackDepth: 15,
  active: false,
  harnessRef: null,
});

export const determinismStore = {
  getSnapshot: core.getSnapshot,
  subscribe: core.subscribe,

  setHarness: (harness: DeterminismHarnessHandle | null) => {
    core.setState(
      (state) => ({
        ...state,
        harnessRef: harness,
        active: Boolean(harness),
        periodicRollback: harness?.periodicRollback ?? state.periodicRollback,
        rollbackInterval: harness?.rollbackInterval ?? state.rollbackInterval,
        rollbackDepth: harness?.rollbackDepth ?? state.rollbackDepth,
      }),
      false
    );
    if (harness) {
      if (typeof harness.addMetricsListener === 'function') {
        harness.addMetricsListener((m: DeterminismMetrics) => {
          core.setState((s) => ({ ...s, metrics: { ...m } }));
        });
      } else {
        const prev = harness.onMetricsUpdated;
        harness.onMetricsUpdated = (m: DeterminismMetrics) => {
          if (typeof prev === 'function') prev(m);
          core.setState((s) => ({ ...s, metrics: { ...m } }));
        };
      }
    }
    core.notify();
  },

  updateMetrics: (m: Partial<DeterminismMetrics>) => {
    core.setState((state) => ({ ...state, metrics: { ...state.metrics, ...m } }));
  },

  togglePeriodic: () => {
    const state = core.getSnapshot();
    const next = !state.periodicRollback;
    if (state.harnessRef) {
      state.harnessRef.periodicRollback = next;
    }
    core.setState((s) => ({ ...s, periodicRollback: next }));
  },

  triggerManualRollback: (depth?: number) => {
    const state = core.getSnapshot();
    const d = depth ?? state.rollbackDepth;
    if (state.harnessRef?.triggerManualRollback) {
      state.harnessRef.triggerManualRollback(d);
    } else if (state.harnessRef?.executeRollback) {
      state.harnessRef.executeRollback(d);
      state.harnessRef.compareStates?.();
    }
  },

  setRollbackDepth: (depth: number) => {
    const state = core.getSnapshot();
    const safeDepth = Math.max(1, Math.min(240, Math.floor(Number(depth) || 15)));
    if (state.harnessRef) {
      if (typeof state.harnessRef.setRollbackDepth === 'function') {
        state.harnessRef.setRollbackDepth(safeDepth);
      } else {
        state.harnessRef.rollbackDepth = safeDepth;
      }
    }
    core.setState((s) => ({ ...s, rollbackDepth: safeDepth }));
  },

  setRollbackInterval: (interval: number) => {
    const state = core.getSnapshot();
    const safeInterval = Math.max(1, Math.min(600, Math.floor(Number(interval) || 30)));
    if (state.harnessRef) {
      if (typeof state.harnessRef.setRollbackInterval === 'function') {
        state.harnessRef.setRollbackInterval(safeInterval);
      } else {
        state.harnessRef.rollbackInterval = safeInterval;
      }
    }
    core.setState((s) => ({ ...s, rollbackInterval: safeInterval }));
  },

  resetDeltas: () => {
    const state = core.getSnapshot();
    if (state.harnessRef?.resetMaxDeltas) {
      state.harnessRef.resetMaxDeltas();
    }
    core.setState((s) => ({
      ...s,
      metrics: {
        ...s.metrics,
        maxDeltaPos: 0,
        maxDeltaVel: 0,
        maxDeltaBall: 0,
        isBitExact: true,
      },
    }));
  },

  resetMaxDeltas: () => {
    determinismStore.resetDeltas();
  },
};

export const useDeterminismData = () => {
  return useSyncExternalStore(determinismStore.subscribe, determinismStore.getSnapshot);
};
