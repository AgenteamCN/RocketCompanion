import {
  networkDiagnosticsStore,
  type DiagnosticDumpExportOptions,
  type DiagnosticProbeTelemetry,
  type NetworkDiagnosticsBridge,
} from '../../ui-core/stores/networkDiagnosticsStore.ts';
import type { GameRuntimeUiBridgePort } from '../../game/runtimeUiPort.ts';
import {
  buildDiagnosticBufferSnapshot,
  exportStandaloneClientReplayDump,
  exportUnifiedDiagnosticDumpArchive,
} from './diagnosticDumpExportPipeline.ts';

function createNetworkDiagnosticsBridgeController(
  runtimePort: GameRuntimeUiBridgePort
): Partial<NetworkDiagnosticsBridge> {
  const { cameraPort, replayPort } = runtimePort;
  const refreshBuffers = () => {
    networkDiagnosticsStore.updateDiagnosticBuffers(buildDiagnosticBufferSnapshot(runtimePort));
  };

  return {
    async onToggleZeroGFleet(enabled: boolean, anchorMode: string) {
      await replayPort.toggleZeroGFleet(enabled, anchorMode);
    },
    onSampleZeroGFleetTelemetry() {
      return replayPort.sampleZeroGFleetTelemetry() as DiagnosticProbeTelemetry[];
    },
    async onSetZeroGAnchorMode(anchorMode: string) {
      await replayPort.setZeroGAnchorMode(anchorMode);
    },
    onSetObservationTarget(targetCarIndex: number) {
      cameraPort.setDiagnosticObservationTarget(targetCarIndex);
    },
    onSetTestCarAudioEnabled(enabled: boolean) {
      replayPort.setTestCarAudioEnabled(enabled);
    },
    onSetLobbyGhostMode(enabled: boolean) {
      replayPort.setLobbyGhostModeEnabled(enabled);
    },
    onDumpNextPacket() {
      replayPort.dumpNextPacket();
    },
    onDumpLatestPacket() {
      replayPort.dumpLatestPacket();
    },
    onTriggerBurstDrop(count: number) {
      replayPort.triggerBurstDrop(count);
    },
    onSetDiagnosticMaxCapacity(frames: number) {
      replayPort.setDiagnosticMaxCapacity(frames);
      refreshBuffers();
    },
    onSetDiagnosticAutoPauseOverflow(enabled: boolean) {
      replayPort.setDiagnosticAutoPauseOverflow(enabled);
      refreshBuffers();
    },
    onToggleDiagnosticRecordingPause(recordingActive: boolean) {
      replayPort.setDiagnosticRecordingActive(recordingActive);
      refreshBuffers();
    },
    onClearDiagnosticBuffers() {
      replayPort.clearDiagnosticBuffers();
      refreshBuffers();
    },
    onExportUnifiedDiagnosticDump(options: DiagnosticDumpExportOptions) {
      return exportUnifiedDiagnosticDumpArchive(runtimePort, options);
    },
    onExportStandaloneClientReplay() {
      return exportStandaloneClientReplayDump(runtimePort);
    },
  };
}

export function syncRuntimeNetworkDiagnostics(
  runtimePort: GameRuntimeUiBridgePort | null | undefined
): void {
  if (!runtimePort) return;
  networkDiagnosticsStore.registerBridge(createNetworkDiagnosticsBridgeController(runtimePort));

  const handles = runtimePort.replayPort.getDiagnosticSessionHandles();
  networkDiagnosticsStore.setSession(handles.reconciler, handles.channel);
  networkDiagnosticsStore.updateDiagnosticBuffers(buildDiagnosticBufferSnapshot(runtimePort));
}
