import { AuthoritativeServerHost } from '../../network/server/AuthoritativeServerHost.ts';
import { PredictionReconciler } from '../../network/client/PredictionReconciler.ts';
import { CLIENT_COMMAND_TYPES } from '../../physics/RocketSimConstants.ts';
import {
  packLoadoutCommandParam1,
  packLoadoutCommandParam2,
} from '../../ui-core/config/vehicleConstants.ts';
import { getMaterialsConfig } from '../../ui-core/config/materialsConfig.ts';
import {
  useAppStore,
  hudStore,
  networkDiagnosticsStore,
  snapshotCurrentTelemetryPayload,
  notifyNetworkTelemetryExportAvailable,
} from '../runtimeUiPort.ts';
import type { ArenaWorld } from '../../entities/ArenaWorld.ts';
import type { RocketSimPhysicsEngine } from '../../physics/RocketSimPhysicsEngine.ts';
import type { PhysicsStateInterpolator } from '../../physics/PhysicsStateInterpolator.ts';
import type { CameraManager } from '../../camera/CameraManager.ts';
import type { RuntimeMatchState } from './RuntimeMatchState.ts';
import type { OnlineRosterSnapshotPayload } from './OnlineRosterSyncCoordinator.ts';
import type { NetworkDiagnosticsProbe } from './NetworkDiagnosticsProbe.ts';
import type { OnlineLobbyDualWorldController } from './OnlineLobbyDualWorldController.ts';
import {
  resolveClientHandshakeTransition,
  resolveClientJoinConfig,
  resolveHandshakeTeamColorSlot,
  resolveLoadoutDefaults,
  resolveSessionClockPacingConfig,
  type HandshakeResponseMessage,
  type LocalVehicleLoadoutState,
  type NetworkSessionChannelLike,
} from './onlineLobbyTransitionPipeline.ts';

export interface OnlineMatchReconcilerBinderHostPort {
  readonly physics: RocketSimPhysicsEngine | null;
  readonly interpolator: PhysicsStateInterpolator | null;
  readonly camera: CameraManager | null;
  bindReconcilerSignals(reconciler: PredictionReconciler): void;
}

export class OnlineMatchReconcilerBinder {
  private readonly host: OnlineMatchReconcilerBinderHostPort;

  constructor(host: OnlineMatchReconcilerBinderHostPort) {
    this.host = host;
  }

  public applyInitialChannelLatency(
    channel: NetworkSessionChannelLike | null,
    asymmetric: boolean
  ): void {
    if (!channel) return;
    const metrics = networkDiagnosticsStore?.getSnapshot?.()?.metrics;
    if (asymmetric) {
      const uplink = metrics?.extraUplinkMs ?? metrics?.extraLatencyMs ?? 0;
      const downlink = metrics?.extraDownlinkMs ?? metrics?.extraLatencyMs ?? 0;
      if (uplink > 0 || downlink > 0) {
        if (typeof channel.setAsymmetricLatency === 'function') {
          channel.setAsymmetricLatency(uplink, downlink);
        } else {
          channel.extraUplinkMs = uplink;
          channel.extraDownlinkMs = downlink;
        }
      }
      return;
    }
    const extraLatency = metrics?.extraLatencyMs ?? 0;
    if (extraLatency > 0) {
      if (typeof channel.setExtraLatency === 'function') channel.setExtraLatency(extraLatency);
      else channel.extraLatencyMs = extraLatency;
    }
  }

  public createPredictionReconciler(
    channel: NetworkSessionChannelLike | null,
    localCarIndex: number,
    visualId: string,
    extraOptions: Record<string, unknown> = {},
    bindHardResync = true
  ): PredictionReconciler {
    const pacing = resolveSessionClockPacingConfig();
    const reconciler = new PredictionReconciler(this.host.physics, channel, {
      localCarIndex,
      interpolator: this.host.interpolator,
      redundantHistoryCount: (extraOptions.redundantHistoryCount as number) ?? 10,
      enableRedundantInputs: (extraOptions.enableRedundantInputs as boolean) ?? true,
      useBitPacking: (extraOptions.useBitPacking as boolean) ?? false,
      clockPacingMode: pacing.mode,
      clockPacingPriority: pacing.priority,
      clockPacingParams: pacing.params,
      inputBufferTarget: pacing.target,
      catchupThresholdOffset: pacing.threshold[0],
      skipThresholdOffset: pacing.threshold[1],
      ...extraOptions,
    });
    reconciler.setCarVisualPreset(localCarIndex, visualId);
    this.host.bindReconcilerSignals(reconciler);
    if (bindHardResync) {
      reconciler.onHardResync = () => {
        this.host.interpolator?.sync?.(performance.now());
        const p = this.host.camera?.camera?.position;
        if (p && (!Number.isFinite(p.x) || !Number.isFinite(p.y) || !Number.isFinite(p.z))) {
          this.host.camera?.resetView?.();
        }
      };
    }
    return reconciler;
  }

  private bindHostLoopbackTimelineAligner(reconciler: PredictionReconciler): void {
    const origReconcileBatch = reconciler.rollbackStepper.reconcileInboundBatch.bind(
      reconciler.rollbackStepper
    );
    reconciler.rollbackStepper.reconcileInboundBatch = (session, incomingPackets, nowMs) => {
      const ch = session.channel;
      const sim = ch?.simulator ?? ch;
      const isUnimpairedLoopback = Boolean(
        (ch?.isLoopback || sim?.isLoopback) &&
        !(
          (sim?.extraRttMs ??
            ch?.extraRttMs ??
            (sim?.extraLatencyMs ?? ch?.extraLatencyMs ?? 0) * 2) > 0
        ) &&
        !((sim?.jitterMs ?? ch?.jitterMs ?? 0) > 0) &&
        !((sim?.packetLossRate ?? ch?.packetLossRate ?? 0) > 0) &&
        !(sim?.burstDropEnabled ?? ch?.burstDropEnabled)
      );
      if (isUnimpairedLoopback) {
        const prevSyncTimeline = session.syncTimeline.bind(session);
        const origLog = console.log;
        session.syncTimeline = (snap, tick = 0, ts = nowMs) => {
          reconciler.rollbackStepper.syncSessionTimeline(session, snap, tick, ts, false);
        };
        console.log = (...args: unknown[]) => {
          if (
            typeof args[0] === 'string' &&
            args[0].includes('[PredictionReconciler] Timeline sync aligned')
          ) {
            return;
          }
          origLog.apply(console, args);
        };
        try {
          origReconcileBatch(session, incomingPackets, nowMs);
        } finally {
          console.log = origLog;
          session.syncTimeline = prevSyncTimeline;
        }
        return;
      }
      origReconcileBatch(session, incomingPackets, nowMs);
    };
  }

  public syncServerTimelineIfReady(
    authoritativeServer: AuthoritativeServerHost | null,
    reconciler: PredictionReconciler | null,
    requireActiveCar: boolean
  ): void {
    if (!authoritativeServer || !reconciler) return;
    const serverSnapshot = authoritativeServer.sim.saveCompactState();
    const serverTick = Math.floor(authoritativeServer.sim.getHeaderView().tickCount);
    if (!requireActiveCar || (serverSnapshot && serverSnapshot[1] >= 1)) {
      reconciler.rollbackStepper.syncSessionTimeline(
        reconciler,
        serverSnapshot,
        serverTick,
        performance.now(),
        false
      );
      this.host.interpolator?.sync?.(performance.now());
    }
  }

  public async bootstrapLoopbackPredictionServer(
    localLoadout: LocalVehicleLoadoutState,
    disableGoalReset: boolean,
    forceFallback: boolean
  ): Promise<{
    server: AuthoritativeServerHost;
    channel: NetworkSessionChannelLike;
    visualId: string;
  } | null> {
    const physics = this.host.physics;
    if (!physics) return null;
    const ld = resolveLoadoutDefaults({}, localLoadout, getMaterialsConfig());
    const compactState = physics.saveCompactState();
    const trainingOptions = {
      unlimitedBoost: physics.isUnlimitedBoost,
      fifoDurationSeconds: 60,
      goalReplayEnabled: !disableGoalReset,
    };
    const server = new AuthoritativeServerHost(null, {
      snapshotInterval: 1,
      forceFallback,
      hostVisualId: ld.visualId,
      hostHitboxId: ld.hitboxId,
      hostPaintFinish: ld.paintFinish,
      hostBoostVisual: ld.boostVisual,
      hostBoostAudio: ld.boostAudio,
      initialState: Array.from(compactState),
      trainingOptions,
    });
    await server.init();
    const channel = server.channel as NetworkSessionChannelLike;
    this.applyInitialChannelLatency(channel, true);
    const latestState = physics.saveCompactState();
    server.sim.setUnlimitedBoost(physics.isUnlimitedBoost);
    server.configureTrainingRuleset?.(trainingOptions);
    await server.sim.restoreState(latestState);
    return { server, channel, visualId: ld.visualId };
  }

  public async bootstrapHostAuthoritativeServer(
    serverOptions: Record<string, unknown>,
    hostVisualId: string,
    isMatchLobby: boolean
  ): Promise<{
    server: AuthoritativeServerHost;
    channel: NetworkSessionChannelLike;
    reconciler: PredictionReconciler;
  } | null> {
    const physics = this.host.physics;
    if (!physics) return null;
    if (physics.numCars > 1) {
      physics.configureCars('default', false, 0);
      physics.resetKickoff();
    }
    physics.setUnlimitedBoost(true);
    const server = new AuthoritativeServerHost(null, {
      ...serverOptions,
      initialState: Array.from(physics.saveCompactState()),
    });
    await server.init();
    server.sim.setUnlimitedBoost(true);
    const channel = server.channel as NetworkSessionChannelLike;
    this.applyInitialChannelLatency(channel, false);
    const reconciler = this.createPredictionReconciler(channel, 0, hostVisualId, {
      hostLobbyMode: isMatchLobby,
      isMatchTelemetryActive: true,
    });
    this.bindHostLoopbackTimelineAligner(reconciler);
    this.syncServerTimelineIfReady(server, reconciler, false);
    return { server, channel, reconciler };
  }

  public exportSessionTelemetryOnCleanup(
    reconciler: PredictionReconciler | null,
    telemetryNotified: boolean
  ): boolean {
    const telemetryRecorder = reconciler?.telemetryCollector.recorder;
    if (!telemetryRecorder || telemetryRecorder.count <= 0) return telemetryNotified;
    const wasEvicted = Boolean(
      networkDiagnosticsStore?.getSnapshot?.()?.metrics?.disconnectEvicted
    );
    if (wasEvicted && !telemetryNotified) {
      notifyNetworkTelemetryExportAvailable('disconnected', telemetryRecorder);
      return true;
    }
    snapshotCurrentTelemetryPayload(telemetryRecorder);
    return telemetryNotified;
  }

  public disposeSessionTransports(
    authoritativeServer: AuthoritativeServerHost | null,
    networkChannel: NetworkSessionChannelLike | null,
    networkReconciler: PredictionReconciler | null,
    preserveChannel: NetworkSessionChannelLike | null = null
  ): NetworkSessionChannelLike | null {
    if (authoritativeServer) {
      try {
        authoritativeServer.destroy?.();
      } catch (err) {
        console.warn('[OnlineMatchReconcilerBinder] Error destroying authoritative server:', err);
      }
    }
    let nextChannel = networkChannel;
    if (networkChannel && networkChannel !== preserveChannel) {
      try {
        networkChannel.destroy?.();
      } catch (err) {
        console.warn('[OnlineMatchReconcilerBinder] Error destroying network channel:', err);
      }
      nextChannel = null;
    }
    if (networkReconciler) {
      networkReconciler.setMatchTelemetryActive?.(false, false);
    }
    return nextChannel;
  }

  public applyMidMatchHandshakeTransition(options: {
    transition: ReturnType<typeof resolveClientHandshakeTransition>;
    reconciler: PredictionReconciler | null;
    match: RuntimeMatchState | null;
    modeManager: { setMode?(modeName: string): void } | null;
    diagnosticsProbe: NetworkDiagnosticsProbe;
  }): void {
    const { transition, reconciler, match, modeManager, diagnosticsProbe } = options;
    this.host.physics?.setUnlimitedBoost?.(false);
    reconciler?.setLobbyDualWorldMode?.(false);
    reconciler?.setMatchTelemetryActive?.(true, true);
    diagnosticsProbe.configureLobbyGhostMode(false, { syncServerLobby: false });
    diagnosticsProbe.despawnDiagnosticTestFleet();
    networkDiagnosticsStore?.syncZeroGFleetState?.(false);
    if (match?.state) {
      match.state = {
        ...match.state,
        mode: 'match',
        phase: transition.resolvedPhase,
        durationSeconds: transition.resolvedDuration,
        clockSeconds: transition.resolvedClock,
        score: transition.resolvedScore,
      };
    }
    modeManager?.setMode?.('match');
    const storeState = useAppStore?.getState?.();
    storeState?.setMatchMode?.('match');
    if (storeState?.activeOverlay === 'room-WaitingRoom') storeState.setActiveOverlay?.('none');
    hudStore?.getState?.()?.setMatchState?.({
      matchPhase: transition.resolvedPhase,
      clockSeconds: transition.resolvedClock,
      score: transition.resolvedScore,
    });
  }

  public queueHandshakeLoadoutAndAck(
    reconciler: PredictionReconciler | null,
    joinCfg: ReturnType<typeof resolveClientJoinConfig>,
    colorSlot: number,
    localLoadout: LocalVehicleLoadoutState,
    isMidMatchJoin: boolean
  ): void {
    if (!reconciler) return;
    const ld = resolveLoadoutDefaults(
      { ...joinCfg.loadout, colorSlot },
      localLoadout,
      getMaterialsConfig()
    );
    reconciler.controlMessenger.enqueueClientCommand(
      CLIENT_COMMAND_TYPES.CMD_SET_LOADOUT,
      packLoadoutCommandParam1(ld.visualId, ld.hitboxId),
      packLoadoutCommandParam2(colorSlot, ld.paintFinish, ld.boostVisual, ld.boostAudio)
    );
    if (isMidMatchJoin) {
      reconciler.controlMessenger.enqueueClientCommand(
        CLIENT_COMMAND_TYPES.CMD_ARENA_LOADED_ACK,
        1,
        0
      );
    }
  }

  public async handleClientHandshakeResponse(options: {
    msg: HandshakeResponseMessage;
    joinCfg: ReturnType<typeof resolveClientJoinConfig>;
    world: {
      readonly physics: RocketSimPhysicsEngine | null;
      readonly arena: ArenaWorld | null;
      readonly interpolator: PhysicsStateInterpolator | null;
      playerCarIndex: number;
      selectedColorSlot: number | null;
    };
    reconciler: PredictionReconciler | null;
    lobbyDualWorld: OnlineLobbyDualWorldController;
    diagnosticsProbe: NetworkDiagnosticsProbe;
    match: RuntimeMatchState | null;
    modeManager: { setMode?(modeName: string): void } | null;
    applyRosterSnapshot: (roster: OnlineRosterSnapshotPayload | null) => Promise<void>;
    onResetReplayRecording: () => void;
    onUpdateRosterState: (state: string) => void;
  }): Promise<void> {
    const {
      msg,
      joinCfg,
      world,
      reconciler,
      lobbyDualWorld,
      diagnosticsProbe,
      match,
      modeManager,
      applyRosterSnapshot,
      onResetReplayRecording,
      onUpdateRosterState,
    } = options;
    if (msg?.state) onUpdateRosterState(msg.state);
    const transition = resolveClientHandshakeTransition(
      msg,
      useAppStore?.getState?.()?.onlineSession
    );
    const { physics, arena, interpolator } = world;
    if (transition.assignedCarIndex !== null) {
      world.playerCarIndex = transition.assignedCarIndex;
      if (reconciler) reconciler.localCarIndex = transition.assignedCarIndex;
      if (arena) arena.playerCarIndex = transition.assignedCarIndex;
    }
    const activePlayerCarIndex = world.playerCarIndex ?? 0;
    onResetReplayRecording();
    if (transition.isLobbyOrWarmup) {
      physics?.setUnlimitedBoost?.(true);
      lobbyDualWorld.configureArenaLobbyFlags(true, false);
      lobbyDualWorld.activateClientDualWorld(reconciler, diagnosticsProbe);
      arena?.vehicleRegistry.ensureCar(
        activePlayerCarIndex,
        transition.localTeam,
        joinCfg.localVisualId
      );
      lobbyDualWorld.configureClientLobbyLocalCar(
        activePlayerCarIndex,
        transition.localTeam,
        joinCfg.localVisualId,
        false
      );
      if (
        (msg?.state === 'lobby' || !msg?.state) &&
        diagnosticsProbe.diagnosticsFleetController?.enabled !== false
      ) {
        await diagnosticsProbe.ensureClientLobbyDiagnosticProbes();
      }
      interpolator?.sync?.(performance.now());
    } else if (transition.isMidMatchJoin) {
      lobbyDualWorld.configureArenaLobbyFlags(false, false);
      this.applyMidMatchHandshakeTransition({
        transition,
        reconciler,
        match,
        modeManager,
        diagnosticsProbe,
      });
    }
    if (msg?.roster) await applyRosterSnapshot(msg.roster);
    useAppStore?.getState?.()?.setOnlineSession?.(transition.onlineSessionPatch);
    lobbyDualWorld.focusCameraOnCar(activePlayerCarIndex);
    const handshakeColor = resolveHandshakeTeamColorSlot(msg);
    world.selectedColorSlot = handshakeColor.colorSlot;
    if (handshakeColor.colorHex)
      arena?.vehicleRegistry.setCarColor(activePlayerCarIndex, handshakeColor.colorHex);
    this.queueHandshakeLoadoutAndAck(
      reconciler,
      joinCfg,
      handshakeColor.colorSlot,
      lobbyDualWorld.getLocalLoadout(),
      transition.isMidMatchJoin
    );
  }
}
