import {
  useAppStore,
  networkDiagnosticsStore,
  floatingStore,
  type RuntimeMatchPort,
} from '../runtimeUiPort.ts';
import type { MultiplayerSessionManager } from '../../network/transport/MultiplayerSessionManager.ts';
import type { RuntimeMatchState } from './RuntimeMatchState.ts';
import type { OnlineSessionCoordinator } from './OnlineSessionCoordinator.ts';
import type { NetworkDiagnosticsProbe } from './NetworkDiagnosticsProbe.ts';
import type {
  FreeplayModeCleanupPort,
  RuntimeDomainPortOwner,
} from './GoalBarrierRuntimeBridge.ts';

export type MatchModeTransitionDomainPort = Pick<
  RuntimeDomainPortOwner,
  | 'match'
  | 'networkManager'
  | 'botCoordinator'
  | 'playerCarIndex'
  | 'matchDurationSeconds'
  | 'domEventManager'
  | 'gameUI'
  | 'multiplayerSession'
  | 'modeManager'
  | 'physics'
  | 'trainingOptions'
  | 'resetKickoff'
>;

const TRAINING_FLOATING_WINDOW_IDS = [
  'subsystem-isolation-lab',
  'experimental-multi-bots',
  'experimental-bot-pack',
  'kickoff-training-tuner',
  'replay-viewer',
  'replay-to-rcs-importer',
] as const;

function closeTrainingAndDiagnosticFloatingWindows(): void {
  for (const windowId of TRAINING_FLOATING_WINDOW_IDS) {
    floatingStore.closeWindow(windowId);
  }
}

function teardownMultiplayerSignalingSession(session: MultiplayerSessionManager | null): void {
  if (!session) return;
  if (session.isHosting) {
    void session.stopHosting?.();
  } else if (session.clientController || session.signalingHandler) {
    void session.leaveSession?.();
  }
}

function teardownNetworkCoordinatorSession(
  netSession: OnlineSessionCoordinator | null | undefined,
  includeReconcilerAndCleanup: boolean
): void {
  if (!netSession) return;
  const hasActiveHandles = Boolean(
    netSession.authoritativeServer ||
    netSession.networkChannel ||
    (includeReconcilerAndCleanup && netSession.networkReconciler)
  );
  if (!hasActiveHandles) return;
  if (includeReconcilerAndCleanup) {
    netSession.cleanupOnlineSession?.();
  }
  void netSession.stopOnlineServer?.({ rebindLoopback: false });
}

function disableActiveDiagnosticsFleetAndGhost(probe: NetworkDiagnosticsProbe): void {
  if (probe.diagnosticsFleetController?.enabled) {
    void probe.toggleDiagnosticTestFleet(false);
    networkDiagnosticsStore.syncZeroGFleetState(false);
  }
  if (probe.lobbyGhostMode) {
    probe.configureLobbyGhostMode(false);
    networkDiagnosticsStore?.setLobbyGhostMode?.(false);
  }
}

function applyMatchStateModeTransition(
  match: RuntimeMatchState | null,
  lifecycleAction: 'leave' | 'start',
  modeId: string
): void {
  if (!match) return;
  if (lifecycleAction === 'leave') {
    match.leave();
    match.state.mode = modeId;
    match.state.countdown = 0;
    return;
  }
  match.start();
  match.state.mode = modeId;
}

export function leaveActiveBotMatchIfNeeded(
  domain: Pick<MatchModeTransitionDomainPort, 'botCoordinator' | 'match'>
): void {
  const { botCoordinator, match } = domain;
  if (botCoordinator.isBotMatch || match?.state?.mode === 'match') {
    botCoordinator.leaveBotMatch();
  }
}

export function stopActiveOnlineOrLoopbackSessionIfNeeded(
  domain: Pick<MatchModeTransitionDomainPort, 'multiplayerSession' | 'networkManager'>
): void {
  teardownMultiplayerSignalingSession(domain.multiplayerSession);
  teardownNetworkCoordinatorSession(domain.networkManager?.sessionCoordinator, true);
}

export function transitionToTrainingMode(
  domain: MatchModeTransitionDomainPort,
  modeId: string,
  reEnterIfActive = false
): void {
  stopActiveOnlineOrLoopbackSessionIfNeeded(domain);
  leaveActiveBotMatchIfNeeded(domain);
  const { modeManager, domEventManager } = domain;
  const activeMode = modeManager?.activeMode;
  const alreadyActive = activeMode?.id === modeId;
  applyMatchStateModeTransition(domain.match, 'leave', modeId);
  if (reEnterIfActive && alreadyActive) {
    activeMode?.onEnter?.();
  } else {
    modeManager?.setMode?.(modeId);
  }
  domEventManager.syncPausedAndInputState();
}

export function transitionToExpMultiBotsMode(domain: MatchModeTransitionDomainPort): void {
  stopActiveOnlineOrLoopbackSessionIfNeeded(domain);
  leaveActiveBotMatchIfNeeded(domain);
  const { modeManager, domEventManager } = domain;
  const activeMode = modeManager?.activeMode;
  const alreadyExpMode = activeMode?.id === 'exp-multi-bots';
  applyMatchStateModeTransition(domain.match, 'start', 'exp-multi-bots');
  if (alreadyExpMode) {
    void activeMode?.applyRosterAndStartMatch?.();
  } else {
    modeManager?.setMode?.('exp-multi-bots');
  }
  domEventManager.syncPausedAndInputState();
}

export type LocalMatchModeTransitionSlice = Pick<
  RuntimeMatchPort,
  | 'getMatchMode'
  | 'isOnlineOrServerActive'
  | 'isBotMatch'
  | 'getPlayerCarIndex'
  | 'getMatchDurationSeconds'
  | 'syncPausedAndInputState'
  | 'handleOverlayChange'
  | 'openMainMenu'
  | 'startExpMultiBots'
  | 'startKickoffTraining'
  | 'startReplayViewer'
  | 'startStaticTrainingPack'
  | 'startDevTestLab'
  | 'restartMatch'
  | 'returnToFreeplay'
  | 'resetKickoff'
>;

export function createMatchModeTransitionBridge(
  domain: MatchModeTransitionDomainPort
): LocalMatchModeTransitionSlice {
  const { networkManager, botCoordinator, domEventManager } = domain;
  const { sessionCoordinator, diagnosticsProbe } = networkManager;

  return {
    getMatchMode: () => domain.match?.state?.mode || 'freeplay',
    isOnlineOrServerActive: () =>
      Boolean(sessionCoordinator.authoritativeServer || sessionCoordinator.networkReconciler),
    isBotMatch: () => botCoordinator.isBotMatch,
    getPlayerCarIndex: () => domain.playerCarIndex ?? 0,
    getMatchDurationSeconds: () => domain.matchDurationSeconds || 300,
    syncPausedAndInputState: (graphicsOverride = null) => {
      domEventManager.syncPausedAndInputState(graphicsOverride);
    },
    handleOverlayChange: (overlayName, isOpen) => {
      domEventManager.handleOverlayChange(overlayName, isOpen);
    },
    openMainMenu: () => {
      const { gameUI } = domain;
      if (gameUI) {
        gameUI.openMenu('main-menu');
      } else {
        useAppStore.getState().openMenu('main-menu');
      }
    },
    startExpMultiBots: () => {
      transitionToExpMultiBotsMode(domain);
    },
    startKickoffTraining: () => {
      transitionToTrainingMode(domain, 'kickoff-training', false);
    },
    startReplayViewer: () => {
      transitionToTrainingMode(domain, 'replay-viewer', false);
    },
    startStaticTrainingPack: () => {
      transitionToTrainingMode(domain, 'static-training-pack', true);
    },
    startDevTestLab: () => {
      transitionToTrainingMode(domain, 'dev-test-lab', true);
    },
    restartMatch: async () => {
      const currentMode = domain.match?.state?.mode || useAppStore.getState().matchMode;
      if (currentMode === 'exp-multi-bots') {
        const activeMode = domain.modeManager?.getActiveMode?.();
        if (activeMode && typeof activeMode.applyRosterAndStartMatch === 'function') {
          await activeMode.applyRosterAndStartMatch();
        } else {
          transitionToExpMultiBotsMode(domain);
        }
        useAppStore.setState({ matchMode: 'exp-multi-bots' });
        return;
      }
      const duration = domain.matchDurationSeconds || 300;
      await botCoordinator.startBotMatch(undefined, duration);
      useAppStore.setState({ matchMode: 'match' });
    },
    returnToFreeplay: (unlimitedBoost) => {
      closeTrainingAndDiagnosticFloatingWindows();
      disableActiveDiagnosticsFleetAndGhost(diagnosticsProbe);
      teardownMultiplayerSignalingSession(domain.multiplayerSession);
      teardownNetworkCoordinatorSession(sessionCoordinator, false);
      leaveActiveBotMatchIfNeeded(domain);

      const { modeManager, trainingOptions } = domain;
      domain.match?.leave();
      modeManager?.setMode?.('freeplay');

      const freeplayMode = modeManager?.modes?.get?.('freeplay') as
        FreeplayModeCleanupPort | undefined;
      freeplayMode?.resetToCleanFreeplay?.();

      domain.physics?.setUnlimitedBoost?.(unlimitedBoost);
      if (trainingOptions) {
        trainingOptions.boostOption = unlimitedBoost ? 'unlimited' : 'standard';
      }
      domain.resetKickoff();
      domEventManager.syncPausedAndInputState();
    },
    resetKickoff: () => {
      domain.resetKickoff();
    },
  };
}
