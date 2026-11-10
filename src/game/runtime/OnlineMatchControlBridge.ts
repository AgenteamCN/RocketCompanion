import type {
  HostOnlineWarmupPortOptions,
  RuntimeCameraPort,
  RuntimeMatchPort,
} from '../runtimeUiPort.ts';
import {
  resolveEffectiveClockPacingParams,
  type ClockPacingMode,
  type ClockPacingPriority,
  type ClockPacingParams,
} from '../../ui-core/config/clockPacingConfig.ts';
import type { PacingControllerParams } from '../../ui-core/config/pacingControllerEvaluator.ts';
import type { MultiplayerSessionManager } from '../../network/transport/MultiplayerSessionManager.ts';
import type { PredictionReconciler } from '../../network/client/PredictionReconciler.ts';
import type { RuntimeDomainPortOwner } from './GoalBarrierRuntimeBridge.ts';
import {
  createMatchModeTransitionBridge,
  type MatchModeTransitionDomainPort,
} from './MatchModeTransitionBridge.ts';

export type CameraControlDomainPort = Pick<RuntimeDomainPortOwner, 'camera' | 'networkManager'>;
export type OnlineMatchControlDomainPort = MatchModeTransitionDomainPort;

export type OnlineWarmupRoomConfigSpec = {
  readonly roomType: string;
  readonly gameMode: string;
  readonly botFillMode: string;
  readonly durationSeconds: number;
  readonly lobbyMode: boolean;
};

export type InitialClockPacingStateInput = Parameters<
  RuntimeMatchPort['syncInitialClockPacing']
>[0];

export function buildOnlineWarmupRoomConfig(
  opts: HostOnlineWarmupPortOptions
): OnlineWarmupRoomConfigSpec {
  return {
    roomType: opts.roomType || 'match',
    gameMode: opts.gameMode || '2v2',
    botFillMode: opts.botFillMode || 'auto_fill',
    durationSeconds: opts.durationSeconds ?? 300,
    lobbyMode: opts.lobbyMode !== undefined ? Boolean(opts.lobbyMode) : true,
  };
}

async function leaveMultiplayerSignalingSession(
  session: MultiplayerSessionManager | null
): Promise<void> {
  if (!session) return;
  if (session.isHosting) {
    await session.stopHosting?.();
  } else {
    await session.leaveSession?.();
  }
}

async function reconnectMultiplayerSignalingSession(
  session: MultiplayerSessionManager | null
): Promise<void> {
  if (!session) return;
  if (session.isHosting) {
    await session.reprobeAndRefreshHostSignaling?.();
  } else if (session.joinRoomId) {
    await session.joinRoom?.(session.joinRoomId, session.joinPassword);
  }
}

function applyInitialClockPacingToReconciler(
  reconciler: PredictionReconciler | null | undefined,
  state: InitialClockPacingStateInput
): void {
  if (!reconciler) return;
  reconciler.setClockPacingMode?.(state.clockPacingMode);
  reconciler.setClockPacingPriority?.(state.clockPacingPriority);
  reconciler.setInputBufferTarget?.(state.inputBufferTarget);
  if (Array.isArray(state.inputBufferThreshold)) {
    reconciler.setInputBufferThresholds?.(
      state.inputBufferThreshold[0],
      state.inputBufferThreshold[1]
    );
  }
  if (state.customClockPacingParams) {
    reconciler.setClockPacingParams?.(
      resolveEffectiveClockPacingParams(
        state.clockPacingMode as ClockPacingMode,
        state.clockPacingPriority as ClockPacingPriority,
        state.inputBufferTarget,
        state.inputBufferThreshold,
        state.customClockPacingParams as unknown as ClockPacingParams
      )
    );
  }
}

export function createRuntimeCameraPort(domain: CameraControlDomainPort): RuntimeCameraPort {
  const { diagnosticsProbe } = domain.networkManager;
  return {
    applyPovSettings: (cameraConfig) => {
      domain.camera?.applyPovSettings?.(cameraConfig);
    },
    setFreeCam: (enabled) => {
      domain.camera?.setFreeCam?.(enabled);
    },
    setFreeCamFov: (fov) => {
      domain.camera?.setFreeCamFov?.(fov);
    },
    resetFreeCamOverview: () => {
      domain.camera?.resetFreeCamOverview?.();
    },
    setDiagnosticObservationTarget: (targetCarIndex) =>
      diagnosticsProbe.setDiagnosticObservationTarget(targetCarIndex),
  };
}

export function createRuntimeMatchPort(domain: OnlineMatchControlDomainPort): RuntimeMatchPort {
  const modeTransitionSlice = createMatchModeTransitionBridge(domain);
  const { networkManager } = domain;
  const { sessionCoordinator, rosterSyncCoordinator } = networkManager;
  const getReconciler = () => sessionCoordinator.networkReconciler;

  return {
    ...modeTransitionSlice,
    hostOnlineWarmup: async (opts) => {
      const session = domain.multiplayerSession;
      const roomConfig = buildOnlineWarmupRoomConfig(opts);
      if (session) {
        if (opts.playerName) session.playerName = opts.playerName;
        await session.startHosting(opts.roomId, opts.password || '', roomConfig);
        return true;
      }
      await sessionCoordinator.hostOnlineServer({
        roomId: opts.roomId,
        playerName: opts.playerName,
        ...roomConfig,
      });
      return true;
    },
    joinOnlineWarmup: async (opts) => {
      const session = domain.multiplayerSession;
      if (session) {
        if (opts.playerName) session.playerName = opts.playerName;
        return Boolean(await session.joinRoom(opts.roomId, opts.password || '', 10000));
      }
      await sessionCoordinator.joinOnlineServer({
        playerName: opts.playerName,
      });
      return true;
    },
    approvePendingPeer: (peerId) => {
      domain.multiplayerSession?.approvePendingPeer?.(peerId);
    },
    declinePendingPeer: (peerId) => {
      domain.multiplayerSession?.declinePendingPeer?.(peerId);
    },
    leaveOnlineServer: async () => {
      await leaveMultiplayerSignalingSession(domain.multiplayerSession);
      await sessionCoordinator.stopOnlineServer();
    },
    returnToOnlineLobby: async () => {
      await sessionCoordinator.returnOnlineMatchToLobby();
      domain.multiplayerSession?.notifyReturnedToLobby?.();
    },
    pauseOnlineMatch: (pause) => {
      sessionCoordinator.authoritativeServer?.pauseMatch?.(Boolean(pause));
    },
    removeRemotePlayer: async (carIndex) => {
      await rosterSyncCoordinator.removeRemotePlayer(carIndex);
    },
    reconnectSignaling: async () => {
      await reconnectMultiplayerSignalingSession(domain.multiplayerSession);
    },
    forceStartOnlineMatch: (durationSeconds = 90) => {
      networkManager.forceStartOnlineMatch(durationSeconds);
      domain.multiplayerSession?.notifyMatchStarted?.();
    },
    setOnlineGameMode: (gameMode) => {
      networkManager.setOnlineGameMode(gameMode);
    },
    setOnlineMatchDuration: (durationSeconds) => {
      networkManager.setOnlineMatchDuration(durationSeconds);
    },
    setOnlineBotFillMode: (botFillMode) => {
      networkManager.setOnlineBotFillMode(botFillMode);
    },
    setClientReady: (ready) => {
      networkManager.setClientReady(ready);
    },
    addOnlineBot: (team = null) => {
      networkManager.addOnlineBot(team);
    },
    voteRematch: (ready) => {
      if (domain.match?.state?.mode === 'exp-multi-bots') {
        void domain.modeManager?.getActiveMode?.()?.applyRosterAndStartMatch?.();
        return;
      }
      networkManager.voteRematch(ready);
    },
    switchOnlineRoleOrTeam: (role, team) => {
      networkManager.switchOnlineRoleOrTeam(role, team);
    },
    setClockPacingMode: (pacingMode) => {
      getReconciler()?.setClockPacingMode?.(pacingMode);
    },
    setClockPacingPriority: (priority) => {
      getReconciler()?.setClockPacingPriority?.(priority);
    },
    setClockPacingParams: (params) => {
      if (params) {
        getReconciler()?.setClockPacingParams?.(params as PacingControllerParams);
      }
    },
    setInputBufferTarget: (bufferTarget) => {
      getReconciler()?.setInputBufferTarget?.(bufferTarget);
    },
    setInputBufferThresholds: (minOffset, maxOffset) => {
      getReconciler()?.setInputBufferThresholds?.(minOffset, maxOffset);
    },
    syncInitialClockPacing: (state) => {
      applyInitialClockPacingToReconciler(getReconciler(), state);
    },
  };
}
