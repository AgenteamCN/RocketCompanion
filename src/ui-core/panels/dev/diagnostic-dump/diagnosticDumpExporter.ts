import {
  networkDiagnosticsStore,
  type DiagnosticDumpExportOptions,
} from '../../../stores/networkDiagnosticsStore';
import {
  globalPacingTelemetryRecorder,
  MAX_TELEMETRY_TICKS,
} from '../../../stores/pacingTelemetryRecorder';
import {
  buildZipArchiveBytes,
  downloadNetworkTelemetryZip,
} from '../../../stores/pacingTelemetryExporter';

export const RC_REPLAY_STATE_INPUT_STRIDE = 184;

export const CAPACITY_PRESETS = [
  { label: '30s (3.6k)', frames: 3600 },
  { label: '90s (10.8k)', frames: 10800 },
  { label: '150s (18k)', frames: 18000 },
  { label: '300s (36k)', frames: 36000 },
];

export function triggerZipDownload(bytes: Uint8Array, filename: string): boolean {
  if (typeof document === 'undefined' || typeof Blob === 'undefined') return false;
  const blob = new Blob([bytes as unknown as BlobPart], { type: 'application/zip' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 5000);
  return true;
}

export function executeUnifiedDiagnosticDumpExport(options: DiagnosticDumpExportOptions): string {
  const { includeClientReplay, includeReconcileTelemetry, includeServerReplay } = options;

  const { metrics, bridge } = networkDiagnosticsStore.getState();
  if (bridge.onExportUnifiedDiagnosticDump) {
    const status = bridge.onExportUnifiedDiagnosticDump({
      includeClientReplay,
      includeReconcileTelemetry,
      includeServerReplay,
    });
    if (typeof status === 'string') return status;
    return 'Unified diagnostic dump requested via runtime bridge.';
  }

  const diag = metrics.diagnosticBuffers as any;
  const isOnlineSession = Boolean(diag?.isOnlineSession || metrics.connected);
  const isLobby = Boolean(diag?.isLobby);
  const matchState = String(diag?.matchState || 'FREEPLAY');
  const isHosting = Boolean(diag?.isHosting);

  const clientFrames = Number(diag?.clientFrames ?? 0);
  const clientOverflowPaused = Boolean(diag?.clientOverflowPaused);
  const effectiveMaxFrames = Number(diag?.maxClientFrames) || 36000;
  const autoPauseOnOverflow = Boolean(diag?.autoPauseOnOverflow ?? true);
  const clientBytes = clientFrames * RC_REPLAY_STATE_INPUT_STRIDE;
  const clientMb = (clientBytes / (1024 * 1024)).toFixed(2);

  const recorder = globalPacingTelemetryRecorder;
  const telemetryTicks = Number(diag?.telemetryTicks ?? recorder?.count ?? 0);
  const telemetrySummary = recorder?.getSummaryStats?.() || {};

  const serverFrames = Number(diag?.serverFrames ?? 0);
  const activeCarMask = Number(diag?.activeCarMask ?? 1);
  const activeSlots: number[] = [];
  for (let i = 0; i < 8; i++) {
    if (activeCarMask & (1 << i)) activeSlots.push(i);
  }

  const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const phaseSlug = !isOnlineSession ? 'offline' : isLobby ? 'lobby' : 'match';
  const entries: Array<{ name: string; data: Uint8Array | string }> = [];

  let exportedTelemetryTicks = 0;
  if (includeReconcileTelemetry && recorder && recorder.count > 0) {
    try {
      const metaObj =
        typeof recorder.toMetadataObject === 'function'
          ? recorder.toMetadataObject()
          : {
              schemaVersion: 'rc-network-telemetry-v2',
              exportedAt: new Date().toISOString(),
              summary: recorder.getSummaryStats?.() || {},
            };
      const csvText = recorder.toCsvString?.() || '';
      entries.push({
        name: 'reconcile-pacing-metadata.json',
        data: JSON.stringify(metaObj, null, 2),
      });
      if (csvText) {
        entries.push({
          name: 'reconcile-pacing-telemetry.csv',
          data: csvText,
        });
      }
      exportedTelemetryTicks = recorder.count;
    } catch (err) {
      console.warn('[DiagnosticDumpFloatingWindow] Failed to serialize reconcile telemetry:', err);
    }
  }

  const manifest = {
    schemaVersion: 'rc-diagnostic-dump-v1',
    exportedAtIso: new Date().toISOString(),
    session: {
      isOnlineSession,
      isHosting,
      isLobby,
      matchState,
      localPlayerCarIndex: diag?.localPlayerCarIndex ?? 0,
      activeCarSlots: activeSlots,
      scores: {
        blue: diag?.blueScore ?? 0,
        orange: diag?.orangeScore ?? 0,
      },
    },
    buffers: {
      clientPresentationReplay: {
        included: includeClientReplay,
        recordedFrames: clientFrames,
        exportedFrames: includeClientReplay ? clientFrames : 0,
        maxCapacityFrames: effectiveMaxFrames,
        overflowPaused: clientOverflowPaused,
        autoPauseOnOverflow,
        estimatedSizeMb: Number(clientMb),
      },
      reconcileAndPacingTelemetry: {
        included: includeReconcileTelemetry,
        recordedTicks: telemetryTicks,
        exportedTicks: exportedTelemetryTicks,
        maxCapacityTicks: MAX_TELEMETRY_TICKS,
        totalCorrections: metrics.corrections,
        mispredictions: metrics.mispredictions,
        lastReconcileErrorUu: metrics.lastErrorUu,
        maxReconcileErrorUu: metrics.maxErrorUu,
        starvationCount: telemetrySummary.starvationCount ?? 0,
        hardResyncCount: telemetrySummary.hardResyncCount ?? 0,
        rttMs: metrics.rttMs,
        jitterMs: metrics.jitterMs,
        inputBufferDepth: metrics.inputBufferDepth,
      },
      serverAuthoritativeReplay: {
        included: includeServerReplay,
        available: isHosting,
        recordedFrames: serverFrames,
        exportedFrames: includeServerReplay ? serverFrames : 0,
      },
    },
  };

  entries.unshift({
    name: 'diagnostic-manifest.json',
    data: JSON.stringify(manifest, null, 2),
  });

  const zipBytes = buildZipArchiveBytes(entries);
  const filename = `rc-diagnostic-dump-${phaseSlug}-${stamp}.zip`;
  triggerZipDownload(zipBytes, filename);
  const kb = (zipBytes.byteLength / 1024).toFixed(1);
  return `Exported ${filename} (${kb} KB · C:${clientFrames}f, T:${exportedTelemetryTicks}t, S:${serverFrames}f)`;
}

export function exportStandaloneTelemetryZip(): string {
  const { metrics } = networkDiagnosticsStore.getState();
  const diag = metrics.diagnosticBuffers;
  const isLobby = Boolean(diag?.isLobby);
  const recorder = globalPacingTelemetryRecorder;
  const telemetryTicks = Number(diag?.telemetryTicks ?? recorder?.count ?? 0);
  if (!recorder || recorder.count <= 0) {
    return 'No reconcile/pacing telemetry ticks recorded yet.';
  }
  downloadNetworkTelemetryZip(recorder, isLobby ? 'lobby-dump' : 'match-dump');
  return `Exported Reconcile & Pacing Telemetry (${telemetryTicks} ticks).`;
}
