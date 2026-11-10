import type { PredictionReconciler } from '../../network/client/PredictionReconciler.ts';
import type { PodiumCelebrationController } from '../modes/PodiumCelebrationController.ts';
import type { ReplayTimelineController } from '../../replay/ReplayTimelineController.ts';
import { hudStore, useAppStore } from '../runtimeUiPort.ts';
import type { NetworkDiagnosticsProbe } from './NetworkDiagnosticsProbe.ts';
import type {
  OnlineLobbyDualWorldController,
  OnlineLobbyWorldHostPort,
} from './OnlineLobbyDualWorldController.ts';
import type { OnlineMatchReconcilerBinder } from './OnlineMatchReconcilerBinder.ts';
import type {
  OnlineRosterSnapshotPayload,
  OnlineRosterSyncCoordinator,
} from './OnlineRosterSyncCoordinator.ts';
import type { ReconcilerSignalCoordinator } from './ReconcilerSignalCoordinator.ts';
import type { RuntimeMatchState } from './RuntimeMatchState.ts';
import type {
  HandshakeResponseMessage,
  NetworkSessionChannelLike,
  resolveClientJoinConfig,
} from './onlineLobbyTransitionPipeline.ts';

export interface OnlineSessionWorldPort extends OnlineLobbyWorldHostPort {
  setCarColor(carIndex: number, hex: string, persistPreference?: boolean): void;
}

export interface OnlineSessionLifecyclePort {
  readonly match: RuntimeMatchState | null;
  readonly trainingOptions: {
    boostOption?: string;
    disableGoalReset?: boolean;
    [key: string]: unknown;
  };
  readonly modeManager: {
    setMode(modeName: string): void;
    getActiveMode?(): { id?: string; onPhysicsEvent?(event: Record<string, unknown>): void } | null;
  } | null;
  readonly domEventManager?: { syncPausedAndInputState(): void } | null;
  readonly podiumController: PodiumCelebrationController | null;
  readonly replayTimelineController: ReplayTimelineController | null;
  isBotMatch: boolean;
  resetKickoff?(): void;
  releaseGoalReplayCameraOverride(source?: string | null): void;
  onSessionReady?(
    reconciler: PredictionReconciler | null,
    channel: NetworkSessionChannelLike | null
  ): void;
  onShowNetworkHUD?(): void;
}

export interface OnlineSessionBridgePort {
  readPredictionBootstrapConfig(): {
    readonly playerCarIndex: number;
    readonly disableGoalReset: boolean;
  };
  readMatchPhaseSnapshot(): {
    readonly mode: string | undefined;
    readonly phase: string | undefined;
  };
  resetReplayRecording(initializeBuffer: boolean): void;
  resetForSessionCleanup(): void;
  restoreFreeplayWorldAfterServerStop(): void;
  prepareWorldForHostLaunch(hostColorSlot: number): void;
  finalizeHostLaunchState(
    reconciler: PredictionReconciler | null,
    channel: NetworkSessionChannelLike | null,
    onlineSessionPatch: Record<string, unknown>
  ): void;
  prepareWorldForClientJoin(): void;
  bindClientJoinChannelAndHandshake(options: {
    reconciler: PredictionReconciler | null;
    channel: NetworkSessionChannelLike | null;
    joinCfg: ReturnType<typeof resolveClientJoinConfig>;
    lobbyDualWorld: OnlineLobbyDualWorldController;
    diagnosticsProbe: NetworkDiagnosticsProbe;
    reconcilerBinder: OnlineMatchReconcilerBinder;
    onResetReplayRecording: () => void;
    onUpdateRosterState: (state: string) => void;
  }): void;
  finalizeClientJoinState(
    reconciler: PredictionReconciler | null,
    channel: NetworkSessionChannelLike | null,
    playerName: string
  ): void;
  prepareWorldForLobbyReturn(): void;
  finalizeLobbyReturnState(): void;
  notifyPredictionSessionReady(
    reconciler: PredictionReconciler | null,
    channel: NetworkSessionChannelLike | null,
    showHUD: boolean
  ): void;
  applyRosterSnapshot(roster: OnlineRosterSnapshotPayload | null): Promise<void>;
  syncHostLobbyNotification(): void;
}

export function shouldReturnToLobbyOnRosterUpdate(
  isHost: boolean,
  matchMode: string | undefined,
  matchPhase: string | undefined,
  isLobbyDualWorldMode: boolean
): boolean {
  return isHost
    ? matchMode === 'match' || matchPhase !== 'lobby'
    : matchMode === 'match' || !isLobbyDualWorldMode;
}

export function resetRuntimeMatchStateToFreeplay(
  match: RuntimeMatchState | null,
  phase = 'freeplay'
): void {
  if (!match?.state) return;
  match.state = {
    ...match.state,
    mode: 'freeplay',
    paused: false,
    phase,
    overtime: false,
    winner: null,
    winReason: null,
    countdown: 0,
  };
}

export function syncOnlineSessionAppStoreState(
  matchMode: string | null,
  sessionPatch?: Record<string, unknown>
): void {
  const store = useAppStore.getState();
  if (matchMode) store.setMatchMode(matchMode);
  if (sessionPatch) store.setOnlineSession(sessionPatch);
}

export function createOnlineSessionBridgePort(
  ctx: OnlineSessionWorldPort & OnlineSessionLifecyclePort,
  getSignalCoordinator: () => ReconcilerSignalCoordinator,
  getRosterSyncCoordinator: () => OnlineRosterSyncCoordinator
): OnlineSessionBridgePort {
  const teardownActiveReplayAndPodium = (): void => {
    ctx.podiumController?.exitPodium();
    ctx.replayTimelineController?.endReplaySession();
    ctx.releaseGoalReplayCameraOverride();
  };

  return {
    readPredictionBootstrapConfig: () => {
      const gameplay = useAppStore.getState().gameplay;
      const disableGoalReset = Boolean(
        ctx.trainingOptions.disableGoalReset ?? gameplay?.goalRestart === false
      );
      return {
        playerCarIndex: ctx.playerCarIndex ?? 0,
        disableGoalReset,
      };
    },
    readMatchPhaseSnapshot: () => ({
      mode: ctx.match?.state?.mode,
      phase: ctx.match?.state?.phase,
    }),
    resetReplayRecording: (initializeBuffer: boolean) => {
      const physics = ctx.physics;
      if (!physics) return;
      if (initializeBuffer) physics.initReplayBuffer();
      physics.clearReplayBuffer();
      physics.setReplayRecordingActive(true);
    },
    resetForSessionCleanup: () => {
      ctx.isBotMatch = false;
      teardownActiveReplayAndPodium();
      getSignalCoordinator().resetSignalState();
      if (typeof ctx.onSessionReady === 'function') {
        ctx.onSessionReady(null, null);
      }
      ctx.playerCarIndex = 0;
    },
    restoreFreeplayWorldAfterServerStop: () => {
      const physics = ctx.physics;
      if (physics) {
        if (physics.numCars > 1) physics.configureCars('default', false, 0);
        const unlimitedBoost =
          useAppStore.getState().gameplay?.unlimitedBoost ??
          ctx.trainingOptions.boostOption === 'unlimited';
        physics.setUnlimitedBoost(unlimitedBoost);
      }
      resetRuntimeMatchStateToFreeplay(ctx.match, 'freeplay');
      ctx.modeManager?.setMode('freeplay');
      if (typeof ctx.resetKickoff === 'function') {
        ctx.resetKickoff();
      }
      ctx.interpolator?.sync(performance.now());
      syncOnlineSessionAppStoreState('freeplay', {
        isHosting: false,
        roomId: '',
        signalingConnected: false,
        connectedPeers: [],
        roomType: 'warmup',
        isReady: false,
      });
      ctx.domEventManager?.syncPausedAndInputState();
    },
    prepareWorldForHostLaunch: (hostColorSlot: number) => {
      ctx.isBotMatch = false;
      ctx.selectedColorSlot = hostColorSlot;
      ctx.playerCarIndex = 0;
    },
    finalizeHostLaunchState: (reconciler, channel, onlineSessionPatch) => {
      if (typeof ctx.onSessionReady === 'function') {
        ctx.onSessionReady(reconciler, channel);
      }
      syncOnlineSessionAppStoreState('online-warmup', onlineSessionPatch);
      getRosterSyncCoordinator().syncHostLobbyOngoingNotification();
      ctx.domEventManager?.syncPausedAndInputState();
    },
    prepareWorldForClientJoin: () => {
      teardownActiveReplayAndPodium();
      getSignalCoordinator().resetSignalState();
      resetRuntimeMatchStateToFreeplay(ctx.match, 'lobby');
      ctx.modeManager?.setMode('freeplay');
      ctx.isBotMatch = false;
    },
    bindClientJoinChannelAndHandshake: ({
      reconciler,
      channel,
      joinCfg,
      lobbyDualWorld,
      diagnosticsProbe,
      reconcilerBinder,
      onResetReplayRecording,
      onUpdateRosterState,
    }) => {
      if (reconciler) {
        reconciler.onHandshakeResponse = (msg: HandshakeResponseMessage) =>
          reconcilerBinder.handleClientHandshakeResponse({
            msg,
            joinCfg,
            world: ctx,
            reconciler,
            lobbyDualWorld,
            diagnosticsProbe,
            match: ctx.match,
            modeManager: ctx.modeManager,
            applyRosterSnapshot: (roster) => getRosterSyncCoordinator().applyRosterSnapshot(roster),
            onResetReplayRecording,
            onUpdateRosterState,
          });
      }
      if (channel) {
        channel.onColorChange = (msg: { carIndex?: number; hex: string }) => {
          const currentPlayerIdx = ctx.playerCarIndex ?? 0;
          ctx.setCarColor(msg.carIndex ?? (currentPlayerIdx === 0 ? 1 : 0), msg.hex, false);
        };
        if (typeof channel.send === 'function') {
          channel.send(JSON.stringify(joinCfg.joinPayload));
        }
      }
    },
    finalizeClientJoinState: (reconciler, channel, playerName) => {
      if (typeof ctx.onSessionReady === 'function') {
        ctx.onSessionReady(reconciler, channel);
      }
      syncOnlineSessionAppStoreState('online-warmup', {
        isHosting: false,
        playerName,
        signalingConnected: true,
      });
      ctx.domEventManager?.syncPausedAndInputState();
    },
    prepareWorldForLobbyReturn: () => {
      teardownActiveReplayAndPodium();
      const physics = ctx.physics;
      if (physics) {
        physics.resetGoalLatch();
        physics.setSimulationFrozen(false);
        physics.setUnlimitedBoost(true);
      }
      resetRuntimeMatchStateToFreeplay(ctx.match, 'lobby');
      hudStore.getState().setMatchState({
        matchPhase: 'lobby',
        kickoffCountdown: 0,
        winner: null,
        winReason: null,
      });
    },
    finalizeLobbyReturnState: () => {
      ctx.modeManager?.setMode('freeplay');
      syncOnlineSessionAppStoreState('online-warmup');
      ctx.domEventManager?.syncPausedAndInputState();
    },
    notifyPredictionSessionReady: (reconciler, channel, showHUD) => {
      if (reconciler) {
        ctx.interpolator?.sync(performance.now());
        if (typeof ctx.onSessionReady === 'function') {
          ctx.onSessionReady(reconciler, channel);
        }
      }
      if (showHUD && typeof ctx.onShowNetworkHUD === 'function') {
        ctx.onShowNetworkHUD();
      }
    },
    applyRosterSnapshot: (roster) => getRosterSyncCoordinator().applyRosterSnapshot(roster),
    syncHostLobbyNotification: () => getRosterSyncCoordinator().syncHostLobbyOngoingNotification(),
  };
}
