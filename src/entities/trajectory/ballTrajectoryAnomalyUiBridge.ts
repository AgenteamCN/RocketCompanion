import type {
  BallTrajectoryAnomalySummary,
  TrajectoryAnomalySample,
} from './ballTrajectoryAnomalyTypes.ts';

export interface TrajectoryAnomalyUiBridgeRecorderPort {
  buildExportBundle(includeAllSamples?: boolean): Record<string, unknown>;
  getSummary(): BallTrajectoryAnomalySummary;
  resetLatchedAnomaly(): void;
  clearAllSamples(): void;
  setOnAnomalyCaptured(cb: ((sample: TrajectoryAnomalySample) => void) | null): void;
}

export interface TrajectoryAnomalyUiBridgeTunerStore {
  publishTelemetry(telemetry: unknown): void;
  getNotifyAnomalyAlerts?(): boolean;
  registerAnomalyHandlers?(
    handlers: {
      exportJson: (includeAll?: boolean) => void;
      copyJson: (includeAll?: boolean) => Promise<boolean>;
      resetAndArmNext: () => void;
      clearSamples: () => void;
    } | null
  ): void;
}

export function bindBallTrajectoryAnomalyUiBridge(
  recorder: TrajectoryAnomalyUiBridgeRecorderPort,
  tunerStore: TrajectoryAnomalyUiBridgeTunerStore,
  pushNotification?: (config: Record<string, unknown>) => unknown,
  dismissNotification?: (id: string) => unknown
): void {
  const notifId = 'traj-anomaly-captured';

  const exportJson = (includeAll = true): void => {
    const bundle = recorder.buildExportBundle(includeAll);
    const json = JSON.stringify(bundle, null, 2);
    if (typeof document === 'undefined') return;
    const summary = recorder.getSummary();
    const tag = summary.latestSample
      ? `${summary.latestSample.seamRegion}-t${summary.latestSample.anomalyTick}`
      : `samples-${summary.capturedCount}`;
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `ball-trajectory-anomaly-${tag}-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const copyJson = async (includeAll = true): Promise<boolean> => {
    const bundle = recorder.buildExportBundle(includeAll);
    const json = JSON.stringify(bundle, null, 2);
    if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(json);
      return true;
    }
    return false;
  };

  const resetAndArmNext = (): void => {
    recorder.resetLatchedAnomaly();
    dismissNotification?.(notifId);
    tunerStore.publishTelemetry({ anomalySummary: recorder.getSummary() });
  };

  const clearSamples = (): void => {
    recorder.clearAllSamples();
    dismissNotification?.(notifId);
    tunerStore.publishTelemetry({ anomalySummary: recorder.getSummary() });
  };

  tunerStore.registerAnomalyHandlers?.({
    exportJson,
    copyJson,
    resetAndArmNext,
    clearSamples,
  });

  recorder.setOnAnomalyCaptured((sample) => {
    tunerStore.publishTelemetry({ anomalySummary: recorder.getSummary() });
    if (tunerStore.getNotifyAnomalyAlerts?.() === false) return;
    const groupLabel = (sample.bufferGroup ?? 'alpha').toUpperCase();
    pushNotification?.({
      collapseKey: notifId,
      sourceNamespace: 'ball-trajectory-predictor',
      collapseStrategy: 'ALWAYS_REPLACE',
      type: 'temporary',
      tone: 'warning',
      icon: 'alert-triangle',
      duration: 1000,
      content: `Trajectory Anomaly #${sample.sequenceNumber} [${groupLabel} · ${sample.triggerKind}] @ ${sample.seamRegion} (posErr ${sample.metrics.posErrorUu.toFixed(2)} UU, dVel ${sample.metrics.velErrorUuPerSec.toFixed(1)} UU/s)`,
      buttons: [
        { label: 'Export JSON', color: 'green', onClick: () => exportJson(true) },
        { label: 'Reset & Arm Next', color: 'amber', onClick: () => resetAndArmNext() },
      ],
    });
  });
}
