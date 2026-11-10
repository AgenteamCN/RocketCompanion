import type { AuthoritativeServerHost } from '../../network/server/AuthoritativeServerHost.ts';
import type { PredictionReconciler } from '../../network/client/PredictionReconciler.ts';
import { getMaterialsConfig } from '../../ui-core/config/materialsConfig.ts';
import { useAppStore } from '../runtimeUiPort.ts';
import {
  dismissHostLobbyOngoingNotification,
  type OnlineRosterSnapshotPayload,
} from './OnlineRosterSyncCoordinator.ts';
import type { NetworkDiagnosticsProbe } from './NetworkDiagnosticsProbe.ts';
import type { OnlineLobbyDualWorldController } from './OnlineLobbyDualWorldController.ts';
import type { OnlineMatchReconcilerBinder } from './OnlineMatchReconcilerBinder.ts';
import {
  resolveClientJoinConfig,
  resolveHostSessionLaunchConfig,
  type HostOnlineServerOptions,
  type JoinOnlineServerOptions,
  type NetworkSessionChannelLike,
} from './onlineLobbyTransitionPipeline.ts';

import {
  shouldReturnToLobbyOnRosterUpdate,
  type OnlineSessionBridgePort,
} from './onlineSessionEnvironmentPipeline.ts';

export type { OnlineSessionBridgePort };

export type NetworkPredictionOptions = {
  redundantHistoryCount?: number;
  enableRedundantInputs?: boolean;
  useBitPacking?: boolean;
  forceFallback?: boolean;
};
export type ReturnToLobbyOptions = { fromServerRoster?: boolean };
export interface RosterUpdateMessage {
  state?: string;
  roster?: OnlineRosterSnapshotPayload | null;
}

export class OnlineSessionCoordinator {
  public readonly lobbyDualWorld: OnlineLobbyDualWorldController;
  public readonly reconcilerBinder: OnlineMatchReconcilerBinder;
  private readonly diagnosticsProbe: NetworkDiagnosticsProbe;
  private readonly sessionBridge: OnlineSessionBridgePort;
  authoritativeServer: AuthoritativeServerHost | null = null;
  networkChannel: NetworkSessionChannelLike | null = null;
  networkReconciler: PredictionReconciler | null = null;
  remotePeerCarMap: Map<string, number> = new Map();
  latestServerRosterState = 'lobby';
  telemetryNotified = false;
  clientReplayOverflowPaused = false;

  constructor(
    lobbyDualWorld: OnlineLobbyDualWorldController,
    reconcilerBinder: OnlineMatchReconcilerBinder,
    diagnosticsProbe: NetworkDiagnosticsProbe,
    sessionBridge: OnlineSessionBridgePort
  ) {
    this.lobbyDualWorld = lobbyDualWorld;
    this.reconcilerBinder = reconcilerBinder;
    this.diagnosticsProbe = diagnosticsProbe;
    this.sessionBridge = sessionBridge;
  }

  private resetOnlineReplayRecording(initializeBuffer: boolean): void {
    this.sessionBridge.resetReplayRecording(initializeBuffer);
    this.clientReplayOverflowPaused = false;
  }

  private createPredictionReconciler(
    localCarIndex: number,
    visualId: string,
    extraOptions: Record<string, unknown> = {},
    bindHardResync = true
  ): PredictionReconciler {
    const reconciler = this.reconcilerBinder.createPredictionReconciler(
      this.networkChannel,
      localCarIndex,
      visualId,
      extraOptions,
      bindHardResync
    );
    this.networkReconciler = reconciler;
    return reconciler;
  }

  private bindRosterUpdateHandler(isHost: boolean): void {
    if (!this.networkReconciler) return;
    this.networkReconciler.onRosterUpdate = async (msg: RosterUpdateMessage) => {
      if (msg?.state) this.latestServerRosterState = msg.state;
      if (msg?.state === 'lobby' && this.latestServerRosterState === 'lobby') {
        const phaseSnapshot = this.sessionBridge.readMatchPhaseSnapshot();
        const needsReturn = shouldReturnToLobbyOnRosterUpdate(
          isHost,
          phaseSnapshot.mode,
          phaseSnapshot.phase,
          Boolean(this.networkReconciler?.lobbyDualWorldMode)
        );
        if (needsReturn) await this.returnOnlineMatchToLobby({ fromServerRoster: true });
        else if (!isHost) await this.diagnosticsProbe.ensureClientLobbyDiagnosticProbes();
      }
      if (msg?.roster && (!msg?.state || msg.state === this.latestServerRosterState)) {
        await this.sessionBridge.applyRosterSnapshot(msg.roster);
      }
    };
  }

  private disposeActiveSessionTransports(
    preserveChannel: NetworkSessionChannelLike | null = null
  ): void {
    this.networkChannel = this.reconcilerBinder.disposeSessionTransports(
      this.authoritativeServer,
      this.networkChannel,
      this.networkReconciler,
      preserveChannel
    );
    this.authoritativeServer = null;
    this.networkReconciler = null;
  }

  async enableNetworkPrediction(
    showHUD = true,
    options: NetworkPredictionOptions = {}
  ): Promise<PredictionReconciler | null> {
    if (!this.networkReconciler) {
      const { playerCarIndex, disableGoalReset } =
        this.sessionBridge.readPredictionBootstrapConfig();
      const loopback = await this.reconcilerBinder.bootstrapLoopbackPredictionServer(
        this.lobbyDualWorld.getLocalLoadout(),
        disableGoalReset,
        Boolean(options.forceFallback)
      );
      if (!loopback) return null;
      this.authoritativeServer = loopback.server;
      this.networkChannel = loopback.channel;
      this.resetOnlineReplayRecording(true);
      this.createPredictionReconciler(playerCarIndex, loopback.visualId, { ...options }, true);
      this.reconcilerBinder.syncServerTimelineIfReady(
        this.authoritativeServer,
        this.networkReconciler,
        false
      );
      this.sessionBridge.notifyPredictionSessionReady(
        this.networkReconciler,
        this.networkChannel,
        showHUD
      );
      return this.networkReconciler;
    }
    this.sessionBridge.notifyPredictionSessionReady(null, null, showHUD);
    return this.networkReconciler;
  }

  cleanupOnlineSession(): void {
    this.telemetryNotified = this.reconcilerBinder.exportSessionTelemetryOnCleanup(
      this.networkReconciler,
      this.telemetryNotified
    );
    this.remotePeerCarMap.clear();
    dismissHostLobbyOngoingNotification();
    this.sessionBridge.resetForSessionCleanup();
    this.diagnosticsProbe.configureLobbyGhostMode(false);
    this.diagnosticsProbe.setMultiWorldGhostVisible(false);
    this.disposeActiveSessionTransports();
    this.lobbyDualWorld.configureArenaLobbyFlags(false, false, 0);
  }

  async stopOnlineServer(options: { rebindLoopback?: boolean } = {}): Promise<void> {
    this.cleanupOnlineSession();
    this.lobbyDualWorld.hideNonZeroArenaCars();
    this.lobbyDualWorld.applyFreeplayTeamAndColorOnStop();
    this.sessionBridge.restoreFreeplayWorldAfterServerStop();
    if (options.rebindLoopback === true) await this.enableNetworkPrediction(false);
  }

  async hostOnlineServer(
    options: HostOnlineServerOptions = {}
  ): Promise<AuthoritativeServerHost | null> {
    if (this.authoritativeServer) await this.stopOnlineServer({ rebindLoopback: false });
    this.remotePeerCarMap = new Map();
    const cfg = resolveHostSessionLaunchConfig(
      options,
      this.lobbyDualWorld.getLocalLoadout(),
      useAppStore.getState().onlineSession,
      getMaterialsConfig()
    );
    this.sessionBridge.prepareWorldForHostLaunch(cfg.hostColorSlot);
    this.diagnosticsProbe.setTestCarAudioEnabled(false, true);
    this.lobbyDualWorld.hideNonZeroArenaCars();
    this.resetOnlineReplayRecording(true);
    const bootstrapped = await this.reconcilerBinder.bootstrapHostAuthoritativeServer(
      cfg.serverOptions,
      cfg.hostVisualId,
      cfg.isMatchLobby
    );
    if (!bootstrapped) return null;
    this.authoritativeServer = bootstrapped.server;
    this.networkChannel = bootstrapped.channel;
    this.networkReconciler = bootstrapped.reconciler;
    this.latestServerRosterState = cfg.isMatchLobby ? 'lobby' : 'match';
    this.bindRosterUpdateHandler(true);
    await this.lobbyDualWorld.activateHostLobbyGhostAndFleet(
      cfg.isMatchLobby,
      this.authoritativeServer,
      this.diagnosticsProbe,
      (roster) => this.sessionBridge.applyRosterSnapshot(roster)
    );
    this.reconcilerBinder.syncServerTimelineIfReady(
      this.authoritativeServer,
      this.networkReconciler,
      cfg.isMatchLobby
    );
    this.sessionBridge.finalizeHostLaunchState(
      this.networkReconciler,
      this.networkChannel,
      cfg.onlineSessionPatch
    );
    return this.authoritativeServer;
  }

  async joinOnlineServer(
    options: JoinOnlineServerOptions = {}
  ): Promise<NetworkSessionChannelLike | null> {
    const channel = options.channel ?? null;
    const joinCfg = resolveClientJoinConfig(
      options,
      this.lobbyDualWorld.getLocalLoadout(),
      getMaterialsConfig()
    );
    this.disposeActiveSessionTransports(channel);
    this.sessionBridge.prepareWorldForClientJoin();
    this.networkChannel = channel;
    this.reconcilerBinder.applyInitialChannelLatency(this.networkChannel, false);
    await this.lobbyDualWorld.prepareClientJoinLobbyWorld(
      joinCfg.localVisualId,
      this.diagnosticsProbe
    );
    this.resetOnlineReplayRecording(true);
    this.createPredictionReconciler(1, joinCfg.localVisualId, { isMatchTelemetryActive: true });
    this.lobbyDualWorld.activateClientDualWorld(this.networkReconciler, this.diagnosticsProbe);
    this.latestServerRosterState = 'lobby';
    this.bindRosterUpdateHandler(false);
    this.sessionBridge.bindClientJoinChannelAndHandshake({
      reconciler: this.networkReconciler,
      channel: this.networkChannel,
      joinCfg,
      lobbyDualWorld: this.lobbyDualWorld,
      diagnosticsProbe: this.diagnosticsProbe,
      reconcilerBinder: this.reconcilerBinder,
      onResetReplayRecording: () => this.resetOnlineReplayRecording(false),
      onUpdateRosterState: (state) => {
        this.latestServerRosterState = state;
      },
    });
    this.sessionBridge.finalizeClientJoinState(
      this.networkReconciler,
      this.networkChannel,
      joinCfg.playerName
    );
    return this.networkChannel;
  }

  async returnOnlineMatchToLobby(options: ReturnToLobbyOptions = {}): Promise<void> {
    if (
      options.fromServerRoster &&
      this.latestServerRosterState &&
      this.latestServerRosterState !== 'lobby'
    ) {
      return;
    }
    this.latestServerRosterState = 'lobby';
    const isHost = Boolean(this.authoritativeServer);
    this.sessionBridge.prepareWorldForLobbyReturn();
    this.resetOnlineReplayRecording(false);
    const { resolvedLocalCarIndex, localTeam } =
      await this.lobbyDualWorld.restoreParticipantAndArenaState(this.networkReconciler, isHost);
    const completed = await this.lobbyDualWorld.finalizeLobbyReturnWorldAndProbes({
      isHost,
      localCarIndex: resolvedLocalCarIndex,
      localTeam,
      fromServerRoster: options.fromServerRoster,
      reconciler: this.networkReconciler,
      authoritativeServer: this.authoritativeServer,
      diagnosticsProbe: this.diagnosticsProbe,
      isStillInLobby: () =>
        this.latestServerRosterState === 'lobby' &&
        this.sessionBridge.readMatchPhaseSnapshot().mode !== 'match',
      syncHostLobbyNotification: () => this.sessionBridge.syncHostLobbyNotification(),
    });
    if (!completed) return;
    this.sessionBridge.finalizeLobbyReturnState();
  }
}
