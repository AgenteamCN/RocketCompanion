import type * as THREE from 'three';
import {
  useAppStore,
  pushQuickNotification,
  dismissQuickNotification,
  reachabilityStore,
  ballTrajectoryTunerStore,
  notifyNetworkTelemetryExportAvailable,
} from '../runtimeUiPort.ts';
import { BallTrajectoryPredictor } from '../../entities/BallTrajectoryPredictor.ts';
import { bindBallTrajectoryAnomalyUiBridge } from '../../entities/trajectory/ballTrajectoryAnomalyUiBridge.ts';
import { ReachabilityVisualizer } from '../../entities/ReachabilityVisualizer.ts';
import { CAR_COLOR_SLOTS } from '../../ui-core/config/vehicleConstants.ts';
import {
  getPreferredColorSlot,
  loadStoredPlayerName,
} from '../../ui-core/config/vehiclePresets.ts';
import { MultiplayerSessionManager } from '../../network/transport/MultiplayerSessionManager.ts';
import type {
  HostOnlineServerOptions,
  JoinOnlineServerOptions,
  NetworkSessionChannelLike,
} from './onlineLobbyTransitionPipeline.ts';
import type { BoostBloom } from '../../effects/BoostBloom.ts';
import type { SupersonicSpeedLinesPass } from '../../effects/SupersonicSpeedLinesPass.ts';
import type { EffectComposer } from '../../effects/PostprocessingPipeline.ts';
import type { applyVisualMaterialsConfig } from '../../effects/ThemeMaterialPipeline.ts';
import type { ArenaWorld } from '../../entities/ArenaWorld.ts';
import type { CameraManager } from '../../camera/CameraManager.ts';
import type { RocketSimPhysicsEngine } from '../../physics/RocketSimPhysicsEngine.ts';
import type { PhysicsStateInterpolator } from '../../physics/PhysicsStateInterpolator.ts';
import type { AuthoritativeServerHost } from '../../network/server/AuthoritativeServerHost.ts';
import type { PredictionReconciler } from '../../network/client/PredictionReconciler.ts';

export type HostRoomSettings = HostOnlineServerOptions & Record<string, unknown>;
export type JoinRoomSettings = JoinOnlineServerOptions & Record<string, unknown>;

export interface PairingApprovalRequest {
  peerId: string;
  peerName: string;
  pairingCode: string;
}

export type SessionStatusSnapshot = Record<string, unknown>;

declare global {
  interface Window {
    __ENABLE_DETERMINISM_HARNESS__?: boolean;
    __ENABLE_NETWORK_PREDICTION__?: boolean;
  }
}

export interface TeamAssignmentPair {
  playerTeam: number;
  opponentTeam: number;
}

export interface MountedGameUIHandle {
  openMenu(route?: string): void;
  closeMenu(): void;
  toggleMenu(): void;
  attachToRuntime?(runtime: unknown): void;
  syncVisualMaterials?(): void;
  destroy(): void;
}

export interface RuntimeSceneOptions {
  CameraControllerClass?: new (aspect: number) => CameraManager;
  gameUI?: MountedGameUIHandle | null;
  mountUI?: (container: HTMLElement, runtime: unknown) => MountedGameUIHandle;
  [key: string]: unknown;
}

export interface SceneGraphRuntimeCallbacks {
  readonly diagnosticsProbe: RuntimeSceneCallbackHost['networkManager']['diagnosticsProbe'];
  readonly sessionCoordinator: RuntimeSceneCallbackHost['networkManager']['sessionCoordinator'];
  readonly rosterSyncCoordinator: RuntimeSceneCallbackHost['networkManager']['rosterSyncCoordinator'];
  readonly loadoutCoordinator: RuntimeSceneCallbackHost['loadoutCoordinator'];
  onResetKickoff(): void;
  onBallControl(actionId: string): void;
  onKickoffSpawnSelect(spawnIndex: number): void;
  onEnsurePlayerFlipResetVisual(carIndex: number): void;
  onSyncInitialMaterials(
    arena: ArenaWorld,
    applyFn: typeof applyVisualMaterialsConfig,
    materials: Record<string, unknown> | undefined
  ): void;
  onUpdateViewport(
    renderer: THREE.WebGLRenderer,
    camera: CameraManager,
    composer: EffectComposer,
    boostBloom: BoostBloom,
    speedLinesPass: SupersonicSpeedLinesPass | null,
    activeGraphicsSettings: Record<string, unknown>
  ): void;
  onMountOrAttachGameUI(container: HTMLElement): MountedGameUIHandle | null;
  onDisposeHeadlessBloomOcclusion(): void;
}

export interface SceneGraphFactoryConfig {
  container: HTMLElement | null;
  physics: RocketSimPhysicsEngine;
  interpolator: PhysicsStateInterpolator;
  selectedPreset?: string | null;
  teamAssignment?: TeamAssignmentPair | null;
  playerCarIndex: number;
  options: RuntimeSceneOptions;
  onProgress?: ((progress: number, message?: string) => void) | null;
  callbacks: SceneGraphRuntimeCallbacks;
}

export interface RuntimeSceneCallbackHost {
  container: HTMLElement | null;
  selectedPreset: string;
  teamAssignment: TeamAssignmentPair | null;
  playerCarIndex: number;
  physics: RocketSimPhysicsEngine | null;
  interpolator: PhysicsStateInterpolator | null;
  arena: ArenaWorld | null;
  ballTrajectoryPredictor: BallTrajectoryPredictor | null;
  authoritativeServer: AuthoritativeServerHost | null;
  networkReconciler: PredictionReconciler | null;
  match: { state: { mode?: string } } | null;
  modeManager: { getActiveMode?(): unknown };
  options: RuntimeSceneOptions;
  bloomOcclusion: { dispose(): void };
  domEventManager: { updateViewport(): void };
  loadoutCoordinator: {
    setCarColor(carIndex: number, colorVal: number | string, broadcast?: boolean): void;
  };
  networkManager: {
    diagnosticsProbe: { enableDeterminismHarness(autoOpenPanel: boolean): Promise<unknown> };
    sessionCoordinator: {
      enableNetworkPrediction(enabled: boolean): Promise<unknown>;
      hostOnlineServer(opts: HostRoomSettings): Promise<unknown>;
      stopOnlineServer(): Promise<void>;
      joinOnlineServer(opts: JoinRoomSettings): Promise<unknown>;
    };
    rosterSyncCoordinator: {
      onRemotePlayerConnected(
        channel: NetworkSessionChannelLike,
        name: string
      ): Promise<number | null | undefined>;
      removeRemotePlayer(carIndex: number): Promise<void>;
    };
  };
  applyVisualMaterialsConfig: unknown;
  renderer: THREE.WebGLRenderer | null;
  camera: CameraManager | null;
  composer: EffectComposer | null;
  boostBloom: BoostBloom | null;
  speedLinesPass: SupersonicSpeedLinesPass | null;
  activeGraphicsSettings: unknown;
  resetKickoff(seed?: number): void;
  getFlipResetVisual(carIndex: number): unknown;
}

export interface VisualizersAndSessionBundle {
  ballTrajectoryPredictor: BallTrajectoryPredictor | null;
  reachabilityVisualizer: ReachabilityVisualizer | null;
  multiplayerSession: MultiplayerSessionManager;
}

function resolvePreferredTeamColor(
  assignedTeam: number | null | undefined
): { slot: number; hex: string } | null {
  const teamSlot = assignedTeam === 0 || assignedTeam === 1 ? assignedTeam : null;
  const idx = getPreferredColorSlot(null, teamSlot);
  if (idx >= 0 && idx < CAR_COLOR_SLOTS.length) {
    return { slot: idx, hex: CAR_COLOR_SLOTS[idx].hex };
  }
  return null;
}

export function createSceneVisualizersAndMultiplayerSession(params: {
  isTouchHeadless: boolean;
  arena: ArenaWorld | null;
  physics: RocketSimPhysicsEngine;
  callbacks: SceneGraphRuntimeCallbacks;
}): VisualizersAndSessionBundle {
  const { isTouchHeadless, arena, physics, callbacks } = params;
  const { diagnosticsProbe, sessionCoordinator, rosterSyncCoordinator, loadoutCoordinator } =
    callbacks;
  let ballTrajectoryPredictor: BallTrajectoryPredictor | null = null;
  let reachabilityVisualizer: ReachabilityVisualizer | null = null;

  if (!isTouchHeadless && arena) {
    ballTrajectoryPredictor = new BallTrajectoryPredictor(
      arena.scene,
      {},
      physics?.ballRadius || 91.25,
      physics,
      (telemetry) => ballTrajectoryTunerStore.publishTelemetry(telemetry)
    );
    bindBallTrajectoryAnomalyUiBridge(
      ballTrajectoryPredictor.anomalyRecorder,
      ballTrajectoryTunerStore,
      pushQuickNotification,
      dismissQuickNotification
    );
    reachabilityVisualizer = new ReachabilityVisualizer(
      arena.scene,
      physics,
      ballTrajectoryPredictor,
      {
        getConfig() {
          return reachabilityStore.getConfig();
        },
        onTelemetry(telemetry: unknown) {
          reachabilityStore.publishTelemetry(telemetry);
        },
      }
    );
  }

  const urlParams =
    typeof window !== 'undefined' ? new URLSearchParams(window.location.search) : null;
  const isDeterminismTest = urlParams && urlParams.get('test') === 'determinism';
  if (
    isDeterminismTest ||
    (typeof window !== 'undefined' && window.__ENABLE_DETERMINISM_HARNESS__)
  ) {
    diagnosticsProbe
      .enableDeterminismHarness(true)
      .catch((err: unknown) => console.error('[DeterminismHarness] Failed to activate:', err));
  }
  const isNetTest =
    urlParams &&
    (urlParams.get('test') === 'prediction' || urlParams.get('test') === 'multiplayer');
  if (isNetTest || (typeof window !== 'undefined' && window.__ENABLE_NETWORK_PREDICTION__)) {
    sessionCoordinator
      .enableNetworkPrediction(true)
      .catch((err: unknown) => console.error('[NetworkPrediction] Failed to activate:', err));
  }

  let multiplayerSession: MultiplayerSessionManager | null = null;
  multiplayerSession = new MultiplayerSessionManager({
    resolvePlayerName() {
      return loadStoredPlayerName().substring(0, 16);
    },
    resolveTeamColor: resolvePreferredTeamColor,
    onUnexpectedDisconnect() {
      notifyNetworkTelemetryExportAvailable('disconnected');
    },
    async onHostServer(opts: HostRoomSettings) {
      await sessionCoordinator.hostOnlineServer(opts);
    },
    async onStopServer() {
      await sessionCoordinator.stopOnlineServer();
    },
    async onLeaveServer() {
      await sessionCoordinator.stopOnlineServer();
    },
    async onJoinServer(opts: JoinRoomSettings) {
      await sessionCoordinator.joinOnlineServer(opts);
    },
    async onPeerConnected(channel: NetworkSessionChannelLike, name: string) {
      return (await rosterSyncCoordinator.onRemotePlayerConnected(channel, name)) ?? -1;
    },
    async onRemovePlayer(carIndex: number) {
      await rosterSyncCoordinator.removeRemotePlayer(carIndex);
    },
    onColorSelect(carIndex: number, _slotId: number, hex: string) {
      loadoutCoordinator.setCarColor(carIndex, hex);
    },
    onSessionStatusChange(status: SessionStatusSnapshot) {
      if (useAppStore && typeof useAppStore.getState === 'function') {
        useAppStore.getState().setOnlineSession?.(status as unknown as Record<string, unknown>);
      }
    },
    onPairingApprovalRequest(req: PairingApprovalRequest) {
      const notifId = `pair-req-${req.peerId}`;
      pushQuickNotification({
        id: notifId,
        type: 'persistent',
        tone: 'warning',
        icon: 'shield-alert',
        duration: 0,
        content: `Join Request: "${req.peerName}" — Pair Code [${req.pairingCode}]`,
        buttons: [
          {
            label: 'Accept',
            color: 'emerald',
            onClick() {
              multiplayerSession?.approvePendingPeer(req.peerId);
              dismissQuickNotification(notifId);
            },
          },
          {
            label: 'Decline',
            color: 'rose',
            onClick() {
              multiplayerSession?.declinePendingPeer(req.peerId);
              dismissQuickNotification(notifId);
            },
          },
        ],
      });
    },
  });

  return {
    ballTrajectoryPredictor,
    reachabilityVisualizer,
    multiplayerSession,
  };
}
