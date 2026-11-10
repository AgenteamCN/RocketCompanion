import { useAppStore } from '../../ui-core/stores/appStore.ts';
import { hudStore } from '../../ui-core/stores/hudStore.ts';
import { ensureSignalingProfileBridge } from './runtimeSignalingProfileBridge.ts';
import {
  retainCompletedMatchReplayAndNotify,
  exportRetainedMatchReplayFile,
  type ReplayRawFrameSlotItem,
} from '../../replay/ReplayFileExporter.ts';
import type {
  GameRuntimeUiBridgePort,
  HostOnlineWarmupPortOptions,
  JoinOnlineWarmupPortOptions,
} from '../../game/runtimeUiPort.ts';
import type {
  ClockPacingMode,
  ClockPacingParams,
  ClockPacingPriority,
} from '../../ui-core/config/clockPacingConfig.ts';

interface AuthoritativeReplayExportPayload {
  stateInputBytes?: Uint8Array | null;
  incidentBytes?: Uint8Array | null;
  signalBytes?: Uint8Array | null;
  gameMode?: string;
  durationSeconds?: number;
  blueScore?: number;
  orangeScore?: number;
  roster?: Array<Record<string, unknown>> | { players?: Array<Record<string, unknown>> };
  loadouts?: Array<Record<string, unknown>>;
}

interface AuthoritativeServerReplayHandle {
  requestFullReplayExport?: () => Promise<AuthoritativeReplayExportPayload | null>;
  hostReplayRingBuffer?: {
    getRecentFrames: (maxFrames?: number) => ReplayRawFrameSlotItem[];
  } | null;
  cachedSnapshot?: Float32Array | null;
}

interface RuntimeWithAuthoritativeServer {
  authoritativeServer?: AuthoritativeServerReplayHandle | null;
  networkManager?: {
    sessionCoordinator?: {
      authoritativeServer?: AuthoritativeServerReplayHandle | null;
    } | null;
  } | null;
}

function bindHudReplayTransportHandlers(runtimePort: GameRuntimeUiBridgePort): void {
  const { replayPort } = runtimePort;
  hudStore.getState().setReplayState?.({
    onReplaySeekNormalized(progress01: number) {
      const sought = replayPort.seekReplayNormalized(progress01);
      if (!sought) return;
      hudStore.getState().setReplayState({
        replayProgress: sought.progress,
        replayFrameIndex: sought.frameIndex,
        replayTotalFrames: sought.totalFrames,
        replayPaused: sought.isPaused,
        replayPersistent: true,
      });
    },
    onReplayTogglePause() {
      const toggled = replayPort.toggleReplayPause();
      if (!toggled) return;
      hudStore.getState().setReplayState({
        replayPaused: toggled.isPaused,
        replayPersistent: toggled.isPersistent,
      });
    },
    onReplayCycleSpeed() {
      const speed = replayPort.cycleReplaySpeed();
      if (speed === null) return;
      hudStore.getState().setReplayState({ replaySpeed: speed });
    },
  });
}

async function exportOnlineTrainingReplayFromRuntime(
  runtimePort: GameRuntimeUiBridgePort,
  durationSeconds = 60
): Promise<boolean> {
  try {
    const driverRuntime =
      typeof window !== 'undefined'
        ? (
            window as unknown as {
              __rcScenarioDriver?: { runtime?: RuntimeWithAuthoritativeServer };
            }
          ).__rcScenarioDriver?.runtime
        : undefined;
    const server =
      driverRuntime?.authoritativeServer ??
      driverRuntime?.networkManager?.sessionCoordinator?.authoritativeServer ??
      null;
    if (typeof server?.requestFullReplayExport === 'function') {
      const exportData = await server.requestFullReplayExport();
      const exportedRoster = Array.isArray(exportData?.loadouts)
        ? exportData.loadouts
        : !Array.isArray(exportData?.roster) && Array.isArray(exportData?.roster?.players)
          ? exportData.roster.players
          : Array.isArray(exportData?.roster)
            ? exportData.roster
            : [];
      const retained = retainCompletedMatchReplayAndNotify({
        stateInputBytes: exportData?.stateInputBytes || undefined,
        incidentBytes: exportData?.incidentBytes || undefined,
        signalBytes: exportData?.signalBytes || undefined,
        ringBuffer: server.hostReplayRingBuffer || undefined,
        fallbackState: server.cachedSnapshot || undefined,
        mode: 'Online Training',
        gameMode: exportData?.gameMode || '3v3',
        durationSeconds: exportData?.durationSeconds ?? durationSeconds,
        roster: exportedRoster,
        loadouts: exportedRoster,
        blueScore: exportData?.blueScore ?? 0,
        orangeScore: exportData?.orangeScore ?? 0,
      });
      if (retained) {
        await exportRetainedMatchReplayFile(retained);
        return true;
      }
    }
    const exportedFrames = runtimePort.replayPort.retainAndExportStandaloneClientReplay(true);
    return exportedFrames > 0;
  } catch (err) {
    console.error('[runtimeOnlineBridgeHandlers] Failed to export online training replay:', err);
    return false;
  }
}

const IDLE_ONLINE_SESSION_PATCH = {
  isHosting: false,
  roomId: '',
  password: '',
  pairingCode: undefined,
  activeRelayLabel: undefined,
  pendingPairingRequests: [],
  signalingConnected: false,
  signalingHealthLevel: 'offline' as const,
  connectedPeers: [],
  roomType: 'match' as const,
  gameMode: '3v3' as const,
  botFillMode: 'auto_fill' as const,
  matchDurationSeconds: 90,
  isReady: false,
};

export function createOnlineBridgeHandlers(runtimePort: GameRuntimeUiBridgePort) {
  const { matchPort, replayPort } = runtimePort;
  ensureSignalingProfileBridge();
  bindHudReplayTransportHandlers(runtimePort);

  return {
    async onHostOnlineWarmup(
      opts: HostOnlineWarmupPortOptions & { ghostMode?: 'automatically-enable' | 'manual' }
    ) {
      try {
        const ok = await matchPort.hostOnlineWarmup(opts);
        if (ok && opts.ghostMode !== undefined) {
          replayPort.setLobbyGhostModeEnabled(opts.ghostMode === 'automatically-enable');
        }
        return ok;
      } catch (e) {
        console.error('[mountGameUI] Error hosting online warmup', e);
        return false;
      }
    },
    async onJoinOnlineWarmup(opts: JoinOnlineWarmupPortOptions) {
      try {
        return await matchPort.joinOnlineWarmup(opts);
      } catch (e) {
        console.error('[mountGameUI] Error joining online warmup', e);
        return false;
      }
    },
    onApprovePendingPeer: matchPort.approvePendingPeer.bind(matchPort),
    onDeclinePendingPeer: matchPort.declinePendingPeer.bind(matchPort),
    async onLeaveOnlineServer() {
      try {
        await matchPort.leaveOnlineServer();
        const appState = useAppStore.getState();
        appState.setMatchMode('freeplay');
        appState.setOnlineSession(IDLE_ONLINE_SESSION_PATCH);
      } catch (e) {
        console.error('[mountGameUI] Error stopping online server', e);
      }
    },
    async onReturnToOnlineLobby() {
      try {
        await matchPort.returnToOnlineLobby();
      } catch (e) {
        console.error('[mountGameUI] Error returning online match to lobby', e);
      }
    },
    onPauseOnlineMatch(pause: boolean, resumeCountdownSeconds = 3) {
      matchPort.pauseOnlineMatch(pause, resumeCountdownSeconds);
    },
    onRemovePlayer: matchPort.removeRemotePlayer.bind(matchPort),
    async onReconnectSignaling() {
      try {
        await matchPort.reconnectSignaling();
      } catch (e) {
        console.error('[mountGameUI] Error reconnecting signaling', e);
      }
    },
    onResetBall: matchPort.resetKickoff.bind(matchPort),
    onExportOnlineTrainingReplay(durationSeconds = 60): Promise<boolean> {
      return exportOnlineTrainingReplayFromRuntime(runtimePort, durationSeconds);
    },
    onForceStartOnlineMatch(durationSeconds = 90) {
      useAppStore.getState().closeMenu();
      matchPort.forceStartOnlineMatch(durationSeconds);
    },
    onSetOnlineGameMode: matchPort.setOnlineGameMode.bind(matchPort),
    onSetOnlineMatchDuration(durationSeconds: number) {
      useAppStore.getState().setOnlineSession({ matchDurationSeconds: durationSeconds });
      matchPort.setOnlineMatchDuration(durationSeconds);
    },
    onSetOnlineBotFillMode(botFillMode: 'no_bots' | 'auto_fill' | 'bots_vs_humans' | 'custom') {
      useAppStore.getState().setOnlineSession({ botFillMode });
      matchPort.setOnlineBotFillMode(botFillMode);
    },
    onAddOnlineBot(team?: number) {
      matchPort.addOnlineBot(team ?? null);
    },
    onSetClientReady(ready: boolean) {
      useAppStore.getState().setOnlineSession({ isReady: ready });
      matchPort.setClientReady(ready);
    },
    onVoteSkipReplay: replayPort.voteOrSkipReplay.bind(replayPort),
    onVoteRematch: matchPort.voteRematch.bind(matchPort),
    onSwitchOnlineRoleTeam: matchPort.switchOnlineRoleOrTeam.bind(matchPort),
    onClockPacingModeChange: matchPort.setClockPacingMode.bind(matchPort),
    onClockPacingPriorityChange: matchPort.setClockPacingPriority.bind(matchPort),
    onClockPacingParamsChange(params: ClockPacingParams) {
      matchPort.setClockPacingParams(params as unknown as Record<string, unknown>);
    },
    onInputBufferTargetChange: matchPort.setInputBufferTarget.bind(matchPort),
    onInputBufferThresholdChange(range: [number, number]) {
      matchPort.setInputBufferThresholds(range[0], range[1]);
    },
  };
}
