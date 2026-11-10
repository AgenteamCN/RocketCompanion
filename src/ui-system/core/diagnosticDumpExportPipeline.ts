import {
  networkDiagnosticsStore,
  type DiagnosticBufferSnapshot,
  type DiagnosticDumpExportOptions,
} from '../../ui-core/stores/networkDiagnosticsStore.ts';
import { MAX_TELEMETRY_TICKS } from '../../ui-core/stores/pacingTelemetryRecorder.ts';
import { buildZipArchiveBytes } from '../../ui-core/stores/pacingTelemetryExporter.ts';
import { serializeRCReplayBinaryContainer } from '../../replay/container/RCReplayBinaryEncoder.ts';
import { RC_REPLAY_STATE_INPUT_STRIDE } from '../../replay/container/RCReplayBinarySchema.ts';
import type { GameRuntimeUiBridgePort } from '../../game/runtimeUiPort.ts';

function triggerZipDownload(bytes: Uint8Array, filename: string): boolean {
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

export function buildDiagnosticBufferSnapshot(
  runtimePort: GameRuntimeUiBridgePort | null | undefined
): Partial<DiagnosticBufferSnapshot> {
  if (!runtimePort) return {};
  const ctx = runtimePort.replayPort.getDiagnosticBufferContext();
  const telemetryTicks = Number(ctx.recorder?.count ?? 0);
  const summary = ctx.recorder?.getSummaryStats?.() || {};

  return {
    isOnlineSession: ctx.isOnlineSession,
    isLobby: ctx.isLobby,
    matchState: ctx.matchState,
    isHosting: ctx.isHosting,
    localPlayerCarIndex: ctx.localPlayerCarIndex,
    activeCarMask: ctx.activeCarMask,
    clientFrames: ctx.clientFrames,
    clientRecordingActive: ctx.clientRecordingActive,
    clientOverflowPaused: ctx.clientOverflowPaused,
    maxClientFrames: ctx.maxClientFrames,
    autoPauseOnOverflow: ctx.autoPauseOnOverflow,
    telemetryTicks,
    maxTelemetryTicks: MAX_TELEMETRY_TICKS,
    starvationCount: summary.starvationCount ?? 0,
    hardResyncCount: summary.hardResyncCount ?? 0,
    serverFrames: ctx.serverFrames,
  };
}

export function exportUnifiedDiagnosticDumpArchive(
  runtimePort: GameRuntimeUiBridgePort,
  options: DiagnosticDumpExportOptions
): string {
  const { replayPort } = runtimePort;
  const ctx = replayPort.getDiagnosticBufferContext();
  const snap = buildDiagnosticBufferSnapshot(runtimePort);
  const isOnlineSession = Boolean(snap.isOnlineSession);
  const isLobby = Boolean(snap.isLobby);
  const isHosting = Boolean(snap.isHosting);
  const matchState = String(snap.matchState || 'FREEPLAY');
  const clientFrames = Number(snap.clientFrames ?? 0);
  const serverFrames = Number(snap.serverFrames ?? 0);
  const activeCarMask = Number(snap.activeCarMask ?? 0);
  const activeSlots: number[] = [];
  for (let i = 0; i < 8; i++) {
    if ((activeCarMask & (1 << i)) !== 0) activeSlots.push(i);
  }

  const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const phaseSlug = !isOnlineSession ? 'offline' : isLobby ? 'lobby' : 'match';
  const entries: Array<{ name: string; data: Uint8Array | string }> = [];

  let exportedClientFrames = 0;
  if (options.includeClientReplay && clientFrames > 0) {
    try {
      const tracks = replayPort.extractClientReplayTracks();
      if (tracks && tracks.frameCount > 0) {
        const containerBytes = serializeRCReplayBinaryContainer({
          ...tracks,
          mode: isLobby ? 'online-lobby-client' : 'online-match-client',
          blueScore: ctx.blueScore,
          orangeScore: ctx.orangeScore,
          roster: ctx.roster,
          loadouts: ctx.roster,
          createdAtIso: new Date().toISOString(),
        });
        entries.push({
          name: `client-presentation-${phaseSlug}.rcreplay`,
          data: containerBytes,
        });
        exportedClientFrames = tracks.frameCount;
      }
    } catch (err) {
      console.warn('[diagnosticDumpExportPipeline] Failed to serialize client replay:', err);
    }
  }

  const recorder = ctx.recorder;
  let exportedTelemetryTicks = 0;
  if (options.includeReconcileTelemetry && recorder && recorder.count > 0) {
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
      console.warn('[diagnosticDumpExportPipeline] Failed to serialize telemetry:', err);
    }
  }

  let exportedServerFrames = 0;
  if (options.includeServerReplay && serverFrames > 0) {
    try {
      const rawSlots = replayPort.extractServerReplaySlots();
      if (rawSlots.length > 0) {
        const serverContainerBytes = serializeRCReplayBinaryContainer({
          slots: rawSlots,
          mode: isLobby ? 'online-lobby-server-auth' : 'online-match-server-auth',
          blueScore: ctx.blueScore,
          orangeScore: ctx.orangeScore,
          roster: ctx.roster,
          loadouts: ctx.roster,
          createdAtIso: new Date().toISOString(),
        });
        entries.push({
          name: `server-authoritative-${phaseSlug}.rcreplay`,
          data: serverContainerBytes,
        });
        exportedServerFrames = rawSlots.length;
      }
    } catch (err) {
      console.warn('[diagnosticDumpExportPipeline] Failed to serialize server replay:', err);
    }
  }

  const metrics = networkDiagnosticsStore.getSnapshot().metrics;
  const clientMb = ((clientFrames * RC_REPLAY_STATE_INPUT_STRIDE) / (1024 * 1024)).toFixed(2);
  const manifest = {
    schemaVersion: 'rc-diagnostic-dump-v1',
    exportedAtIso: new Date().toISOString(),
    session: {
      isOnlineSession,
      isHosting,
      isLobby,
      matchState,
      localPlayerCarIndex: ctx.localPlayerCarIndex,
      activeCarMask,
      activeCarSlots: activeSlots,
      scores: {
        blue: ctx.blueScore,
        orange: ctx.orangeScore,
      },
      roster: ctx.roster,
    },
    buffers: {
      clientPresentationReplay: {
        included: options.includeClientReplay,
        recordedFrames: clientFrames,
        exportedFrames: exportedClientFrames,
        maxCapacityFrames: snap.maxClientFrames ?? 36000,
        overflowPaused: Boolean(snap.clientOverflowPaused),
        autoPauseOnOverflow: Boolean(snap.autoPauseOnOverflow),
        estimatedSizeMb: Number(clientMb),
      },
      reconcileAndPacingTelemetry: {
        included: options.includeReconcileTelemetry,
        recordedTicks: Number(snap.telemetryTicks ?? 0),
        exportedTicks: exportedTelemetryTicks,
        maxCapacityTicks: MAX_TELEMETRY_TICKS,
        totalCorrections: metrics.corrections,
        mispredictions: metrics.mispredictions,
        lastReconcileErrorUu: metrics.lastErrorUu,
        maxReconcileErrorUu: metrics.maxErrorUu,
        starvationCount: snap.starvationCount ?? 0,
        hardResyncCount: snap.hardResyncCount ?? 0,
        rttMs: metrics.rttMs,
        jitterMs: metrics.jitterMs,
        inputBufferDepth: metrics.inputBufferDepth,
      },
      serverAuthoritativeReplay: {
        included: options.includeServerReplay,
        available: isHosting,
        recordedFrames: serverFrames,
        exportedFrames: exportedServerFrames,
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
  return `Exported ${filename} (${kb} KB - C:${exportedClientFrames}f, T:${exportedTelemetryTicks}t, S:${exportedServerFrames}f)`;
}

export function exportStandaloneClientReplayDump(runtimePort: GameRuntimeUiBridgePort): string {
  const snap = buildDiagnosticBufferSnapshot(runtimePort);
  const isLobby = Boolean(snap.isLobby);
  const exportedFrames = runtimePort.replayPort.retainAndExportStandaloneClientReplay(isLobby);
  if (exportedFrames <= 0) {
    return 'No client presentation replay frames recorded yet.';
  }
  const durationSec = (exportedFrames / 120).toFixed(1);
  return `Exported standalone Client Replay (${exportedFrames} frames / ${durationSec}s).`;
}
