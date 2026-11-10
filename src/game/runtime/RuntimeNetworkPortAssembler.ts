import { ReconcilerSignalCoordinator } from './ReconcilerSignalCoordinator.ts';
import {
  OnlineRosterSyncCoordinator,
  type OnlineRosterSyncHostPort,
} from './OnlineRosterSyncCoordinator.ts';
import type {
  RuntimeSignalHostPort,
  SignalAudioFacadeLike,
} from './RuntimeGoalReplaySignalSubController.ts';
import {
  NetworkDiagnosticsProbe,
  type NetworkDiagnosticsHostPort,
} from './NetworkDiagnosticsProbe.ts';
import { OnlineLobbyDualWorldController } from './OnlineLobbyDualWorldController.ts';
import { OnlineMatchReconcilerBinder } from './OnlineMatchReconcilerBinder.ts';
import { OnlineSessionCoordinator } from './OnlineSessionCoordinator.ts';
import {
  createOnlineSessionBridgePort,
  type OnlineSessionLifecyclePort,
  type OnlineSessionWorldPort,
} from './onlineSessionEnvironmentPipeline.ts';
import type { EntityManager } from '../../entities/EntityManager.ts';
import type { PredictionReconciler } from '../../network/client/PredictionReconciler.ts';
import type { SimulationStage } from '../pipeline/stages/SimulationStage.ts';
import type { GameAudioSubsystem } from '../subsystems/GameAudioSubsystem.ts';
import type { DeterminismHarness } from '../../physics/DeterminismHarness.ts';
import type { MultiplayerSessionManager } from '../../network/transport/MultiplayerSessionManager.ts';

export interface RuntimeNetworkHostPort extends OnlineSessionWorldPort, OnlineSessionLifecyclePort {
  readonly entityManager: EntityManager | null;
  readonly multiplayerSession: MultiplayerSessionManager | null;
  readonly simulationStage: SimulationStage | null;
  readonly audioSubsystem: GameAudioSubsystem | null;
  readonly flipResetVisuals: Map<number, { stopVisual(): void; play?(): void }>;
  readonly options: { gameAudio?: SignalAudioFacadeLike; [key: string]: unknown } | null;
  _clientGoalIncidentLatched: boolean;
  _localSkipReplayReady: boolean;
  readonly botCoordinator?: { botKickoffStep: number } | null;
  readonly inputPoller?: { latchJumpSuppression(): void } | null;
  getFlipResetVisual?(carIndex: number): { play(): void; stopVisual(): void } | null;
  isGoalReplayCameraOverrideActive(): boolean;
  acquireGoalReplayCameraOverride?(source?: string): void;
  replayPovCarIndex?: number | null;
  onDeterminismHarnessReady?(harness: DeterminismHarness, showHUD: boolean): void;
}

export interface RuntimeNetworkWorldSnapshot {
  readonly playerCarIndex: number;
  readonly isArenaLobbyMode: boolean;
  readonly matchMode: string | undefined;
  readonly matchPhase: string | undefined;
}

export interface AssembledNetworkCoordinators {
  readonly diagnosticsProbe: NetworkDiagnosticsProbe;
  readonly sessionCoordinator: OnlineSessionCoordinator;
  readonly rosterSyncCoordinator: OnlineRosterSyncCoordinator;
  readonly signalCoordinator: ReconcilerSignalCoordinator;
}

export function createRuntimeNetworkWorldSnapshotReader(
  ctx: RuntimeNetworkHostPort
): () => RuntimeNetworkWorldSnapshot {
  return () => ({
    playerCarIndex: ctx.playerCarIndex ?? 0,
    isArenaLobbyMode: Boolean(ctx.arena?.isLobbyMode),
    matchMode: ctx.match?.state?.mode,
    matchPhase: ctx.match?.state?.phase,
  });
}

export function createNetworkDiagnosticsHostPort(
  ctx: RuntimeNetworkHostPort,
  getSessionCoordinator: () => OnlineSessionCoordinator
): NetworkDiagnosticsHostPort {
  return {
    getPhysics: () => ctx.physics,
    getArena: () => ctx.arena,
    getInterpolator: () => ctx.interpolator,
    getCamera: () => ctx.camera,
    getAuthoritativeServer: () => getSessionCoordinator().authoritativeServer,
    getNetworkChannel: () => getSessionCoordinator().networkChannel,
    getNetworkReconciler: () => getSessionCoordinator().networkReconciler,
    getPlayerCarIndex: () => ctx.playerCarIndex ?? 0,
    isMatchPhaseBlockingDiagnosticsFleet: () => {
      const matchMode = ctx.match?.state?.mode;
      const phase = ctx.match?.state?.phase;
      return Boolean(matchMode === 'match' && phase && phase !== 'lobby' && phase !== 'freeplay');
    },
    ensureFlipResetVisual: (carIndex: number) => {
      if (typeof ctx.getFlipResetVisual === 'function') {
        ctx.getFlipResetVisual(carIndex);
      }
    },
    notifyDeterminismHarnessReady: (harness, showHUD) => {
      if (typeof ctx.onDeterminismHarnessReady === 'function') {
        ctx.onDeterminismHarnessReady(harness, showHUD);
      }
    },
  };
}

export function createOnlineRosterSyncHostPort(
  ctx: RuntimeNetworkHostPort,
  sessionCoordinator: OnlineSessionCoordinator,
  diagnosticsProbe: NetworkDiagnosticsProbe,
  isLobbyDualWorldActive: () => boolean
): OnlineRosterSyncHostPort {
  return {
    world: ctx,
    session: {
      get authoritativeServer() {
        return sessionCoordinator.authoritativeServer;
      },
      get networkReconciler() {
        return sessionCoordinator.networkReconciler;
      },
      get remotePeerCarMap() {
        return sessionCoordinator.remotePeerCarMap;
      },
      isLobbyDualWorldActive,
    },
    diagnostics: {
      isDiagnosticFleetEnabled: () => Boolean(diagnosticsProbe.diagnosticsFleetController?.enabled),
      spawnDiagnosticTestFleet: (options) => diagnosticsProbe.spawnDiagnosticTestFleet(options),
      despawnDiagnosticTestFleet: () => diagnosticsProbe.despawnDiagnosticTestFleet(),
    },
  };
}

export function createRuntimeSignalHostPort(
  ctx: RuntimeNetworkHostPort,
  sessionCoordinator: OnlineSessionCoordinator,
  rosterSyncCoordinator: OnlineRosterSyncCoordinator,
  diagnosticsProbe: NetworkDiagnosticsProbe,
  isLobbyDualWorldActive: (reconciler?: PredictionReconciler | null) => boolean
): RuntimeSignalHostPort {
  return {
    get arena() {
      return ctx.arena;
    },
    get physics() {
      return ctx.physics;
    },
    get entityManager() {
      return ctx.entityManager;
    },
    get options() {
      return ctx.options;
    },
    get flipResetVisuals() {
      return ctx.flipResetVisuals;
    },
    get match() {
      return ctx.match;
    },
    get modeManager() {
      return ctx.modeManager;
    },
    get replayTimelineController() {
      return ctx.replayTimelineController;
    },
    get podiumController() {
      return ctx.podiumController;
    },
    get camera() {
      return ctx.camera;
    },
    get interpolator() {
      return ctx.interpolator;
    },
    get simulationStage() {
      return ctx.simulationStage;
    },
    get audioSubsystem() {
      return ctx.audioSubsystem;
    },
    get authoritativeServer() {
      return sessionCoordinator.authoritativeServer;
    },
    get remotePeerCarMap() {
      return sessionCoordinator.remotePeerCarMap;
    },
    get playerCarIndex() {
      return ctx.playerCarIndex;
    },
    set playerCarIndex(val: number) {
      ctx.playerCarIndex = val;
    },
    get replayPovCarIndex() {
      return ctx.replayPovCarIndex;
    },
    set replayPovCarIndex(val: number | null | undefined) {
      ctx.replayPovCarIndex = val;
    },
    get selectedColorSlot() {
      return ctx.selectedColorSlot;
    },
    set selectedColorSlot(val: number | null) {
      ctx.selectedColorSlot = val;
    },
    get clientReplayOverflowPaused() {
      return sessionCoordinator.clientReplayOverflowPaused;
    },
    set clientReplayOverflowPaused(val: boolean) {
      sessionCoordinator.clientReplayOverflowPaused = Boolean(val);
    },
    get _clientGoalIncidentLatched() {
      return ctx._clientGoalIncidentLatched;
    },
    set _clientGoalIncidentLatched(val: boolean) {
      ctx._clientGoalIncidentLatched = val;
    },
    get _localSkipReplayReady() {
      return ctx._localSkipReplayReady;
    },
    set _localSkipReplayReady(val: boolean) {
      ctx._localSkipReplayReady = val;
    },
    getLastRosterSnapshot: () => rosterSyncCoordinator.lastRosterSnapshot,
    getParticipantTeams: () => rosterSyncCoordinator.participantTeams,
    syncHostLobbyOngoingNotification: () =>
      rosterSyncCoordinator.syncHostLobbyOngoingNotification(),
    isLobbyDualWorldActive: (reconciler) => isLobbyDualWorldActive(reconciler),
    despawnDiagnosticTestFleet: () => diagnosticsProbe.despawnDiagnosticTestFleet(),
    setLobbyGhostMode: (enabled, options) => {
      diagnosticsProbe.configureLobbyGhostMode(enabled, options);
      return diagnosticsProbe.lobbyGhostMode;
    },
    setLatestServerRosterState: (state: string) => {
      sessionCoordinator.latestServerRosterState = state;
    },
    isNetworkTelemetryNotified: () => sessionCoordinator.telemetryNotified,
    markNetworkTelemetryNotified: (notified: boolean) => {
      sessionCoordinator.telemetryNotified = Boolean(notified);
    },
    resetBotKickoffStep: () => {
      if (ctx.botCoordinator) ctx.botCoordinator.botKickoffStep = 0;
    },
    isGoalReplayCameraOverrideActive: () => ctx.isGoalReplayCameraOverrideActive(),
    acquireGoalReplayCameraOverride: (source) => {
      if (typeof ctx.acquireGoalReplayCameraOverride === 'function') {
        ctx.acquireGoalReplayCameraOverride(source);
      }
    },
    releaseGoalReplayCameraOverride: (source) => {
      ctx.releaseGoalReplayCameraOverride(source);
    },
    getFlipResetVisual: (carIdx) =>
      typeof ctx.getFlipResetVisual === 'function' ? ctx.getFlipResetVisual(carIdx) : null,
    resetAudio: () => {
      ctx.audioSubsystem?.resetAudio();
    },
    latchJumpSuppression: () => {
      ctx.inputPoller?.latchJumpSuppression();
    },
    setCarColor: (carIndex, hexColor, persistPreference) => {
      ctx.setCarColor(carIndex, hexColor, persistPreference);
    },
  };
}

export function assembleNetworkCoordinators(
  ctx: RuntimeNetworkHostPort,
  isLobbyDualWorldActive: (reconciler?: PredictionReconciler | null) => boolean
): AssembledNetworkCoordinators {
  let sessionCoordinator!: OnlineSessionCoordinator;
  let rosterSyncCoordinator!: OnlineRosterSyncCoordinator;
  let signalCoordinator!: ReconcilerSignalCoordinator;

  const diagnosticsProbe = new NetworkDiagnosticsProbe(
    createNetworkDiagnosticsHostPort(ctx, () => sessionCoordinator)
  );
  const lobbyDualWorld = new OnlineLobbyDualWorldController(ctx);
  const reconcilerBinder = new OnlineMatchReconcilerBinder({
    get physics() {
      return ctx.physics;
    },
    get interpolator() {
      return ctx.interpolator;
    },
    get camera() {
      return ctx.camera;
    },
    bindReconcilerSignals: (reconciler) => {
      signalCoordinator.bindReconcilerSignals(reconciler);
    },
  });

  const sessionBridge = createOnlineSessionBridgePort(
    ctx,
    () => signalCoordinator,
    () => rosterSyncCoordinator
  );
  sessionCoordinator = new OnlineSessionCoordinator(
    lobbyDualWorld,
    reconcilerBinder,
    diagnosticsProbe,
    sessionBridge
  );
  rosterSyncCoordinator = new OnlineRosterSyncCoordinator(
    createOnlineRosterSyncHostPort(ctx, sessionCoordinator, diagnosticsProbe, () =>
      isLobbyDualWorldActive()
    )
  );
  signalCoordinator = new ReconcilerSignalCoordinator(
    createRuntimeSignalHostPort(
      ctx,
      sessionCoordinator,
      rosterSyncCoordinator,
      diagnosticsProbe,
      isLobbyDualWorldActive
    )
  );

  return {
    diagnosticsProbe,
    sessionCoordinator,
    rosterSyncCoordinator,
    signalCoordinator,
  };
}
