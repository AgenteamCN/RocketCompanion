import { useSyncExternalStore } from 'react';
import { createExternalStore } from './createExternalStore';

export type TrajectoryUpdateKind =
  | 'incremental-tail'
  | 'progressive-catchup'
  | 'wasm-seam-resync'
  | 'full-car-hit'
  | 'full-deviation'
  | 'full-initial'
  | 'full-world-bounce'
  | 'full-forced'
  | 'cached-tick'
  | 'static-preview'
  | 'sleeping';

export interface BallTrajectoryAnomalyLatestSample {
  id: string;
  sequenceNumber: number;
  capturedAtIso: string;
  triggerKind: string;
  seamRegion: string;
  anomalyTick: number;
  ticksSinceLastCarHit: number;
  ticksSinceSpaceAAnchor: number;
  closestCarSurfaceGapUu: number;
  posErrorUu: number;
  velErrorUuPerSec: number;
  angVelErrorRadPerSec: number;
  spaceADirectPosErrorUu: number;
  spaceADirectVelErrorUuPerSec: number;
  tailContinuityErrorUu: number;
  livePos: [number, number, number];
  liveVel: [number, number, number];
  liveSpeedUuPerSec: number;
}

export interface BallTrajectoryAnomalySummary {
  armed: boolean;
  hasLatchedAnomaly: boolean;
  capturedCount: number;
  totalNonCarRecomputes: number;
  totalWasmSeamResyncs: number;
  spaceAAnchorTick: number;
  spaceAUpdateKind: string;
  latestSample: BallTrajectoryAnomalyLatestSample | null;
}

export const INITIAL_BALL_TRAJECTORY_ANOMALY_SUMMARY: Readonly<BallTrajectoryAnomalySummary> =
  Object.freeze({
    armed: true,
    hasLatchedAnomaly: false,
    capturedCount: 0,
    totalNonCarRecomputes: 0,
    totalWasmSeamResyncs: 0,
    spaceAAnchorTick: -1,
    spaceAUpdateKind: 'idle',
    latestSample: null,
  });

export interface BallTrajectoryTelemetry {
  computeTimeUs: number;
  wasmComputeTimeUs: number;
  geometryBuildTimeUs: number;
  lastUpdateKind: TrajectoryUpdateKind;
  activeSlices: number;
  remainingSlices: number;
  incrementalStepCount: number;
  fullRecomputeCount: number;
  carHitRecomputeCount: number;
  deviationRecomputeCount: number;
  primitiveCount: number;
  bounceCount: number;
  maxHeightUu: number;
  ballSpeedUu: number;
  anomalySummary?: BallTrajectoryAnomalySummary;
}

export const INITIAL_BALL_TRAJECTORY_TELEMETRY: Readonly<BallTrajectoryTelemetry> =
  Object.freeze({
    computeTimeUs: 0,
    wasmComputeTimeUs: 0,
    geometryBuildTimeUs: 0,
    lastUpdateKind: 'sleeping',
    activeSlices: 0,
    remainingSlices: 0,
    incrementalStepCount: 0,
    fullRecomputeCount: 0,
    carHitRecomputeCount: 0,
    deviationRecomputeCount: 0,
    primitiveCount: 0,
    bounceCount: 0,
    maxHeightUu: 0,
    ballSpeedUu: 0,
    anomalySummary: INITIAL_BALL_TRAJECTORY_ANOMALY_SUMMARY,
  });

export interface BallTrajectoryAnomalyActionHandlers {
  exportJson: (includeAll?: boolean) => void;
  copyJson: (includeAll?: boolean) => Promise<boolean>;
  resetAndArmNext: () => void;
  clearSamples: () => void;
}

interface BallTrajectoryTunerStoreState {
  telemetry: BallTrajectoryTelemetry;
  notifyAnomalyAlerts: boolean;
}

let anomalyHandlers: BallTrajectoryAnomalyActionHandlers | null = null;

const core = createExternalStore<BallTrajectoryTunerStoreState>({
  telemetry: { ...INITIAL_BALL_TRAJECTORY_TELEMETRY },
  notifyAnomalyAlerts: true,
});

export const ballTrajectoryTunerStore = {
  getSnapshot: core.getSnapshot,

  getTelemetry(): BallTrajectoryTelemetry {
    return core.getSnapshot().telemetry;
  },

  getNotifyAnomalyAlerts(): boolean {
    return core.getSnapshot().notifyAnomalyAlerts;
  },

  setNotifyAnomalyAlerts(enabled: boolean): void {
    core.setState((state) => ({
      ...state,
      notifyAnomalyAlerts: Boolean(enabled),
    }));
  },

  registerAnomalyHandlers(handlers: BallTrajectoryAnomalyActionHandlers | null): void {
    anomalyHandlers = handlers;
  },

  exportAnomalyJson(includeAll = true): void {
    anomalyHandlers?.exportJson(includeAll);
  },

  async copyAnomalyJson(includeAll = true): Promise<boolean> {
    if (!anomalyHandlers) return false;
    return anomalyHandlers.copyJson(includeAll);
  },

  resetAnomalyAndArmNext(): void {
    anomalyHandlers?.resetAndArmNext();
  },

  clearAnomalySamples(): void {
    anomalyHandlers?.clearSamples();
  },

  publishTelemetry(patch: Partial<BallTrajectoryTelemetry>): void {
    core.setState((state) => ({
      ...state,
      telemetry: {
        ...state.telemetry,
        ...patch,
      },
    }));
  },

  resetTelemetryCounters(): void {
    core.setState((state) => ({
      ...state,
      telemetry: {
        ...state.telemetry,
        incrementalStepCount: 0,
        fullRecomputeCount: 0,
        carHitRecomputeCount: 0,
        deviationRecomputeCount: 0,
      },
    }));
  },

  subscribe: core.subscribe,
};

export function useBallTrajectoryTunerStore(): BallTrajectoryTunerStoreState {
  return useSyncExternalStore(
    ballTrajectoryTunerStore.subscribe,
    ballTrajectoryTunerStore.getSnapshot,
    ballTrajectoryTunerStore.getSnapshot
  );
}
