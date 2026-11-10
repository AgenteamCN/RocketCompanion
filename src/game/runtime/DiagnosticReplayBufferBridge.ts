import {
  globalPacingTelemetryRecorder,
  type GameRuntimeUiBridgePort,
  type PacingTelemetryRecorderPort,
  type RuntimeReplayPort,
  type WasmReplayTracksPort,
} from '../runtimeUiPort.ts';
import { gameAudio } from '../../audio/GameAudioEngineFacade.ts';
import {
  retainCompletedMatchReplayAndNotify,
  exportRetainedMatchReplayFile,
} from '../../replay/ReplayFileExporter.ts';
import type { RocketSimPhysicsEngine } from '../../physics/RocketSimPhysicsEngine.ts';
import type { PhysicsStateInterpolator } from '../../physics/PhysicsStateInterpolator.ts';
import type { ReplayTimelineController } from '../../replay/ReplayTimelineController.ts';
import type { RuntimeMatchState } from './RuntimeMatchState.ts';
import type { OnlineSessionCoordinator } from './OnlineSessionCoordinator.ts';
import type {
  FreeplayModeCleanupPort,
  RuntimeDomainPortOwner,
} from './GoalBarrierRuntimeBridge.ts';
import { createRuntimeTunerPort } from './ArenaEnvironmentTunerBridge.ts';
import { createRuntimeCameraPort, createRuntimeMatchPort } from './OnlineMatchControlBridge.ts';
import {
  buildDiagnosticBufferContextSnapshot,
  isLocalModeGoalReplaySkippable,
  resolveDiagnosticRecorderResetSpec,
} from './runtimeBridgeSnapshotPipeline.ts';

export type DiagnosticReplayDomainPort = Pick<
  RuntimeDomainPortOwner,
  | 'replayTimelineController'
  | 'interpolator'
  | 'match'
  | 'modeManager'
  | 'networkManager'
  | 'arena'
  | 'physics'
  | 'playerCarIndex'
>;

type AuthoritativeReplayRingBuffer = NonNullable<
  OnlineSessionCoordinator['authoritativeServer']
>['hostReplayRingBuffer'];

function seekReplayTimelineNormalized(
  timeline: ReplayTimelineController | null,
  interpolator: PhysicsStateInterpolator | null,
  progress01: number
): ReturnType<RuntimeReplayPort['seekReplayNormalized']> {
  if (!timeline) return null;
  timeline.sessionState.isPersistent = true;
  timeline.seekToNormalized(progress01, interpolator);
  return {
    progress: timeline.progress,
    frameIndex: timeline.currentFrameIndex,
    totalFrames: timeline.getTotalRecordedFrames(),
    isPaused: timeline.sessionState.isPaused,
  };
}

function cleanupFreeplayModeBeforeReplayViewer(
  freeplayMode: FreeplayModeCleanupPort | undefined
): void {
  if (!freeplayMode) return;
  if (freeplayMode.nameTagTunerController?.isActive) {
    freeplayMode.nameTagTunerController.exitTunerArena();
  }
  if (freeplayMode.directorPreview?.isReplayActive || freeplayMode.isGoalReplayActive?.()) {
    freeplayMode.exitDirectorPatternPreview?.();
  }
  if (freeplayMode.rewinderController?.isBlockingLivePhysics) {
    freeplayMode.rewinderController.clearBuffer?.();
  }
}

function resetDiagnosticSessionBuffers(
  session: OnlineSessionCoordinator,
  physics: RocketSimPhysicsEngine | null
): void {
  session.clientReplayOverflowPaused = false;
  physics?.clearReplayBuffer?.();
  const { networkReconciler, authoritativeServer } = session;
  if (networkReconciler || authoritativeServer) physics?.setReplayRecordingActive?.(true);
  authoritativeServer?.hostReplayRingBuffer?.clear?.();
  networkReconciler?.resetStats();
  if (networkReconciler?.metrics) networkReconciler.metrics.mispredictions = 0;
  const recorder =
    (networkReconciler?.telemetryCollector.recorder as PacingTelemetryRecorderPort | undefined) ||
    globalPacingTelemetryRecorder;
  recorder?.reset?.(resolveDiagnosticRecorderResetSpec(networkReconciler?.pacingController));
}

function retainAndExportDiagnosticClientReplay(
  physics: RocketSimPhysicsEngine | null,
  fallbackRingBuffer: AuthoritativeReplayRingBuffer | null,
  matchState: RuntimeMatchState['state'] | undefined,
  rosterPlayers: Array<Record<string, unknown>> | undefined,
  isLobby: boolean
): number {
  const clientFrames = Number(physics?.getReplayFrameCount?.() ?? 0);
  const ringFramesCount = Number(fallbackRingBuffer?.size ?? 0);
  if (!physics || (clientFrames <= 0 && ringFramesCount <= 0)) return 0;
  const rosterList = Array.isArray(rosterPlayers) ? rosterPlayers : [];
  retainCompletedMatchReplayAndNotify({
    engine: clientFrames > 0 ? physics : null,
    ringBuffer: clientFrames > 0 ? null : fallbackRingBuffer,
    mode: isLobby ? 'online-lobby-dump' : 'online-match-dump',
    blueScore: matchState?.blueScore ?? 0,
    orangeScore: matchState?.orangeScore ?? 0,
    durationSeconds: matchState?.durationSeconds ?? 60,
    arenaPreset: physics.getArenaPreset?.() ?? 0,
    roster: rosterList,
    loadouts: rosterList,
    suppressNotification: true,
  });
  exportRetainedMatchReplayFile();
  return clientFrames > 0 ? clientFrames : ringFramesCount;
}

export function createRuntimeReplayPort(domain: DiagnosticReplayDomainPort): RuntimeReplayPort {
  const { networkManager } = domain;
  const { sessionCoordinator, rosterSyncCoordinator, diagnosticsProbe } = networkManager;

  return {
    seekReplayNormalized: (progress01) =>
      seekReplayTimelineNormalized(
        domain.replayTimelineController,
        domain.interpolator,
        progress01
      ),
    toggleReplayPause: () => {
      const timeline = domain.replayTimelineController;
      if (!timeline) return null;
      return { isPaused: timeline.togglePause(), isPersistent: timeline.sessionState.isPersistent };
    },
    cycleReplaySpeed: () => domain.replayTimelineController?.cyclePlaybackSpeed() ?? null,
    voteOrSkipReplay: () => {
      if (isLocalModeGoalReplaySkippable(domain.match?.state?.mode)) {
        domain.modeManager?.getActiveMode?.()?.skipGoalReplay?.();
        return;
      }
      gameAudio?.stadiumSpatialEngine?.notifyGoalReplaySkipped?.();
      networkManager.voteSkipReplay();
    },
    prepareForReplayViewerEntry: () => {
      cleanupFreeplayModeBeforeReplayViewer(
        domain.modeManager?.modes?.get?.('freeplay') as FreeplayModeCleanupPort | undefined
      );
    },
    getDiagnosticSessionHandles: () => ({
      reconciler: sessionCoordinator.networkReconciler,
      channel: sessionCoordinator.networkChannel,
    }),
    getDiagnosticBufferContext: () => {
      const { physics, arena, match } = domain;
      const { networkReconciler, authoritativeServer } = sessionCoordinator;
      const recorder =
        (networkReconciler?.telemetryCollector.recorder as
          PacingTelemetryRecorderPort | undefined) || globalPacingTelemetryRecorder;
      return buildDiagnosticBufferContextSnapshot({
        hasReconciler: Boolean(networkReconciler),
        hasAuthoritativeServer: Boolean(authoritativeServer),
        isArenaLobbyMode: Boolean(arena?.isLobbyMode),
        matchState: match?.state,
        localPlayerCarIndex: domain.playerCarIndex ?? 0,
        clientFrames: Number(physics?.getReplayFrameCount?.() ?? 0),
        clientRecordingActive: Boolean(physics?.getReplayRecordingActive?.() ?? false),
        clientOverflowPaused: Boolean(sessionCoordinator.clientReplayOverflowPaused),
        diagnosticDumpMaxFrames: networkManager.diagnosticDumpMaxFrames,
        diagnosticDumpPauseOnOverflow: networkManager.diagnosticDumpPauseOnOverflow,
        recorder,
        serverFrames: Number(authoritativeServer?.hostReplayRingBuffer?.size ?? 0),
        activeCarMask: Number(physics?.getActiveCarMask?.() ?? 0),
        arenaPreset: physics?.getArenaPreset?.() ?? 0,
        rosterPlayers: rosterSyncCoordinator.lastRosterSnapshot?.players,
      });
    },
    setDiagnosticMaxCapacity: (frames) => {
      networkManager.diagnosticDumpMaxFrames = frames;
      const { physics } = domain;
      const clientFrames = Number(physics?.getReplayFrameCount?.() ?? 0);
      if (clientFrames < frames && sessionCoordinator.clientReplayOverflowPaused) {
        sessionCoordinator.clientReplayOverflowPaused = false;
        physics?.setReplayRecordingActive?.(true);
      }
    },
    setDiagnosticAutoPauseOverflow: (enabled) => {
      networkManager.diagnosticDumpPauseOnOverflow = Boolean(enabled);
    },
    setDiagnosticRecordingActive: (recordingActive) => {
      sessionCoordinator.clientReplayOverflowPaused = false;
      domain.physics?.setReplayRecordingActive?.(recordingActive);
    },
    clearDiagnosticBuffers: () => {
      resetDiagnosticSessionBuffers(sessionCoordinator, domain.physics);
    },
    extractClientReplayTracks: () => {
      const tracks = domain.physics?.extractWasmReplayTracks?.() as
        WasmReplayTracksPort | undefined;
      return tracks && tracks.frameCount > 0 ? tracks : null;
    },
    extractServerReplaySlots: () => {
      const ringBuffer = sessionCoordinator.authoritativeServer?.hostReplayRingBuffer as
        { getRecentFrames?(): Float32Array[] } | undefined;
      return ringBuffer?.getRecentFrames?.() || [];
    },
    retainAndExportStandaloneClientReplay: (isLobby) => {
      const freeplayMode = domain.modeManager?.modes?.get?.('freeplay') as
        { replayRingBuffer?: AuthoritativeReplayRingBuffer } | undefined;
      const fallbackRingBuffer =
        sessionCoordinator.authoritativeServer?.hostReplayRingBuffer ||
        freeplayMode?.replayRingBuffer ||
        null;
      return retainAndExportDiagnosticClientReplay(
        domain.physics,
        fallbackRingBuffer,
        domain.match?.state,
        rosterSyncCoordinator.lastRosterSnapshot?.players,
        isLobby
      );
    },
    toggleZeroGFleet: async (enabled, anchorMode) => {
      await diagnosticsProbe.toggleDiagnosticTestFleet(enabled, anchorMode);
    },
    setZeroGAnchorMode: async (anchorMode) => {
      await diagnosticsProbe.spawnDiagnosticTestFleet({ anchorMode });
    },
    sampleZeroGFleetTelemetry: () => diagnosticsProbe.sampleDiagnosticFleetTelemetry(),
    setTestCarAudioEnabled: (enabled) => {
      diagnosticsProbe.setTestCarAudioEnabled(enabled);
    },
    setLobbyGhostModeEnabled: (enabled) => {
      diagnosticsProbe.configureLobbyGhostMode(enabled);
    },
    dumpNextPacket: () => {
      void diagnosticsProbe.dumpNextNetworkPacket();
    },
    dumpLatestPacket: () => {
      diagnosticsProbe.dumpLatestNetworkPacket(null);
    },
    triggerBurstDrop: (count) => {
      diagnosticsProbe.dropPacketBurst(count);
    },
  };
}

export function createGameRuntimeDomainPorts(
  domain: RuntimeDomainPortOwner
): GameRuntimeUiBridgePort {
  return {
    cameraPort: createRuntimeCameraPort(domain),
    matchPort: createRuntimeMatchPort(domain),
    tunerPort: createRuntimeTunerPort(domain),
    replayPort: createRuntimeReplayPort(domain),
  };
}
