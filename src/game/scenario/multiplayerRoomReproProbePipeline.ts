/**
 * multiplayerRoomReproProbePipeline.ts
 * Pure helper pipeline for sampling vehicle physics (CarStateView) and 3D scenegraph
 * (arena.cars & arena.carWheels) poses, detecting entry orientation/wheel anomalies,
 * inspecting P2PWebRTCChannel / PredictionReconciler handshake state, and streaming
 * real-time reproduction telemetry.
 */

import { roundMetric } from './scenarioMetricsPipeline.ts';
import type {
  ReproHandshakeDiagnosticSnapshot,
  ReproMeshCarPoseSample,
  ReproPoseAnomalyItem,
  ReproPoseProbeSnapshot,
  ReproRole,
  ReproRosterMode,
  ReproSimCarPoseSample,
  ReproStreamEvent,
  ReproUrlConfig,
} from './multiplayerRoomReproTypes.ts';

export interface ReproProbeCarView {
  readonly isActive: boolean;
  readonly team: number;
  readonly posX: number;
  readonly posY: number;
  readonly posZ: number;
  readonly velX: number;
  readonly velY: number;
  readonly velZ: number;
  readonly fwdZ: number;
  readonly upZ: number;
  readonly quatX: number;
  readonly quatY: number;
  readonly quatZ: number;
  readonly quatW: number;
  readonly isOnGround: boolean | number;
  readonly getWheelContact: (wheelIndex: number) => boolean;
  readonly getWheelSusLength: (wheelIndex: number) => number;
}

export interface ReproProbeRuntimeView {
  readonly stop?: () => void;
  readonly renderFrame?: (timestamp?: number) => boolean;
  readonly pipeline?: {
    readonly executeSimulationOnly?: (timestamp: number) => void;
  } | null;
  readonly clockScheduler?: { gl?: unknown } | null;
  readonly renderSubsystem?: { update?: (ctx: { shouldSkipGpuRender?: boolean }) => void } | null;
  readonly setupAudio?: () => Promise<void>;
  readonly setupBot?: () => Promise<void>;
  readonly physics?: {
    readonly getHeaderView?: () => { readonly tickCount: number };
    readonly getCarStateView?: (carIndex: number) => ReproProbeCarView | null;
    readonly sim?: {
      readonly getHeaderView?: () => { readonly tickCount: number };
      readonly getCarStateView?: (carIndex: number) => ReproProbeCarView | null;
    } | null;
  } | null;
  readonly arena?: {
    readonly cars?: ReadonlyArray<{
      readonly visible?: boolean;
      readonly position?: { readonly y?: number };
      readonly rotation?: { readonly x?: number; readonly y?: number; readonly z?: number };
    } | null>;
    readonly vehiclePresets?: ReadonlyArray<string | null>;
    readonly carHitboxes?: ReadonlyArray<{
      readonly userData?: { readonly hitboxId?: string };
    } | null>;
    readonly carWheels?: ReadonlyArray<ReadonlyArray<{
      readonly steer?: { readonly position?: { readonly y?: number } };
      readonly mount?: { readonly position?: { readonly y?: number } };
    } | null> | null>;
  } | null;
  readonly match?: {
    readonly state?: {
      readonly mode?: string;
      readonly phase?: string;
    } | null;
  } | null;
  readonly matchPort?: {
    readonly hostOnlineWarmup?: (opts: {
      roomId: string;
      password?: string;
      playerName?: string;
      roomType?: string;
      gameMode?: string;
      botFillMode?: string;
      durationSeconds?: number;
      lobbyMode?: boolean;
    }) => Promise<boolean>;
    readonly joinOnlineWarmup?: (opts: {
      roomId: string;
      password?: string;
      playerName?: string;
    }) => Promise<boolean>;
    readonly forceStartOnlineMatch?: (durationSeconds?: number) => void;
  } | null;
  readonly multiplayerSession?: {
    readonly hostController?: {
      readonly offerToken?: string;
      readonly channel?: ReproInspectableWebRtcChannel | null;
      readonly peerChannels?: ReadonlyMap<string, ReproInspectableWebRtcChannel>;
      readonly getConnectedPeerList?: () => ReadonlyArray<unknown>;
    } | null;
    readonly clientJoinNegotiator?: {
      readonly clientController?: {
        readonly answerToken?: string;
        readonly channel?: ReproInspectableWebRtcChannel | null;
      } | null;
    } | null;
  } | null;
  readonly networkReconciler?: {
    readonly hardSnapCount?: number;
    readonly correctionCount?: number;
    readonly lobbyDualWorldMode?: boolean;
  } | null;
  readonly networkManager?: {
    readonly isLobbyDualWorldActive?: () => boolean;
  } | null;
}

export interface ReproInspectableWebRtcChannel {
  readonly role?: string;
  readonly isHost?: boolean;
  readonly isCrossTab?: boolean;
  readonly transportMode?: string;
  readonly answerToken?: string;
  readonly dataChannel?: { readonly readyState?: string } | null;
  readonly acceptAnswerToken?: (answerToken: string) => Promise<boolean>;
}

export function parseMultiplayerRoomReproUrlConfig(): ReproUrlConfig {
  if (typeof window === 'undefined' || !window.location?.search) {
    return {
      role: null,
      rosterMode: '3p3ai',
      roomCode: '7216',
      speedMultiplier: 1,
      peerIndex: 1,
      bridgeSignalingAfterProbe: true,
    };
  }
  const params = new URLSearchParams(window.location.search);
  const rawRole = params.get('reproRole');
  const role: ReproRole | null = rawRole === 'host' || rawRole === 'client' ? rawRole : null;
  const rawMode = params.get('reproMode');
  const rosterMode: ReproRosterMode = rawMode === '2p' ? '2p' : '3p3ai';
  const defaultRoom = rosterMode === '2p' ? '4816' : '7216';
  const roomCode = (params.get('reproRoom') || defaultRoom).trim() || defaultRoom;
  const rawSpeed = Number(params.get('reproSpeed') || 1);
  const speedMultiplier =
    Number.isFinite(rawSpeed) && rawSpeed >= 1 ? Math.min(8, Math.round(rawSpeed)) : 1;
  const rawPeerIdx = Number(params.get('reproPeerIdx') || 1);
  const peerIndex = Number.isFinite(rawPeerIdx) && rawPeerIdx >= 1 ? Math.round(rawPeerIdx) : 1;
  const bridgeParam = params.get('reproBridgeSignaling');
  const bridgeSignalingAfterProbe = bridgeParam !== '0' && bridgeParam !== 'false';

  return {
    role,
    rosterMode,
    roomCode,
    speedMultiplier,
    peerIndex,
    bridgeSignalingAfterProbe,
  };
}

export function sampleSimAndMeshVehiclePose(
  targetView: ReproProbeRuntimeView,
  stage: string,
  role: ReproRole,
  rosterMode: ReproRosterMode,
  elapsedMs: number
): ReproPoseProbeSnapshot {
  const sim = targetView.physics?.sim ?? targetView.physics;
  const simTick = sim?.getHeaderView?.()?.tickCount ?? -1;
  const simCars: ReproSimCarPoseSample[] = [];
  const meshCars: ReproMeshCarPoseSample[] = [];
  const anomalies: ReproPoseAnomalyItem[] = [];

  for (let i = 0; i < 8; i++) {
    const cv = sim?.getCarStateView?.(i);
    if (!cv) continue;
    const isVisibleMesh = Boolean(targetView.arena?.cars?.[i]?.visible);
    if (!cv.isActive && !isVisibleMesh && i > 1) continue;

    const sus: [number, number, number, number] = [
      roundMetric(cv.getWheelSusLength(0), 3),
      roundMetric(cv.getWheelSusLength(1), 3),
      roundMetric(cv.getWheelSusLength(2), 3),
      roundMetric(cv.getWheelSusLength(3), 3),
    ];
    const frontSusAvg = (sus[0] + sus[1]) * 0.5;
    const rearSusAvg = (sus[2] + sus[3]) * 0.5;
    const frontRearSusDelta = roundMetric(frontSusAvg - rearSusAvg, 3);

    const sample: ReproSimCarPoseSample = {
      idx: i,
      active: Boolean(cv.isActive),
      team: cv.team,
      pos: [roundMetric(cv.posX, 2), roundMetric(cv.posY, 2), roundMetric(cv.posZ, 3)],
      vel: [roundMetric(cv.velX, 2), roundMetric(cv.velY, 2), roundMetric(cv.velZ, 2)],
      fwdZ: roundMetric(cv.fwdZ, 4),
      upZ: roundMetric(cv.upZ, 4),
      quat: [
        roundMetric(cv.quatX, 4),
        roundMetric(cv.quatY, 4),
        roundMetric(cv.quatZ, 4),
        roundMetric(cv.quatW, 4),
      ],
      onGround: Boolean(cv.isOnGround),
      contacts: [
        cv.getWheelContact(0),
        cv.getWheelContact(1),
        cv.getWheelContact(2),
        cv.getWheelContact(3),
      ],
      sus,
      frontRearSusDelta,
    };
    simCars.push(sample);

    if (
      i >= 6 &&
      isVisibleMesh &&
      (sample.pos[2] > 30 || Math.abs(sample.fwdZ) > 0.2 || sample.upZ < 0.5)
    ) {
      anomalies.push({
        carIndex: i,
        kind: 'lobby_ghost_car_suspended_or_tilted',
        description: `Car #${i} visible in lobby at posZ=${sample.pos[2]}, fwdZ=${sample.fwdZ}, upZ=${sample.upZ}, onGround=${sample.onGround}`,
      });
    } else if (i < 6 && sample.active && Math.abs(sample.fwdZ) >= 0.005) {
      anomalies.push({
        carIndex: i,
        kind: 'chassis_pitch_tilt_on_ground',
        description: `Car #${i} pitched with fwdZ=${sample.fwdZ}, frontRearSusDelta=${sample.frontRearSusDelta} (sus=[${sample.sus.join(', ')}])`,
      });
    }
  }

  const carsArr = targetView.arena?.cars ?? [];
  for (let i = 0; i < carsArr.length; i++) {
    const c = carsArr[i];
    if (!c || !c.visible) continue;
    const wList = targetView.arena?.carWheels?.[i] ?? [];
    const wheelHeightsY = wList.map((w) =>
      roundMetric(w?.steer?.position?.y ?? w?.mount?.position?.y ?? 0, 3)
    );
    const frontWheelY = wheelHeightsY.length >= 2 ? (wheelHeightsY[0] + wheelHeightsY[1]) * 0.5 : 0;
    const rearWheelY = wheelHeightsY.length >= 4 ? (wheelHeightsY[2] + wheelHeightsY[3]) * 0.5 : 0;
    const frontRearWheelHeightDeltaY = roundMetric(rearWheelY - frontWheelY, 3);
    const preset = targetView.arena?.vehiclePresets?.[i] ?? 'unknown';
    const hitbox = targetView.arena?.carHitboxes?.[i]?.userData?.hitboxId ?? 'unknown';

    meshCars.push({
      idx: i,
      preset,
      hitbox,
      meshY: roundMetric(c.position?.y ?? 0, 3),
      rot: [
        roundMetric(c.rotation?.x ?? 0, 4),
        roundMetric(c.rotation?.y ?? 0, 4),
        roundMetric(c.rotation?.z ?? 0, 4),
      ],
      wheelHeightsY,
      frontRearWheelHeightDeltaY,
    });

    if (Math.abs(frontRearWheelHeightDeltaY) >= 1.0) {
      anomalies.push({
        carIndex: i,
        kind: 'front_rear_wheel_height_asymmetry',
        description: `Car #${i} (${preset}/${hitbox}) front vs rear wheel mount Y delta=${frontRearWheelHeightDeltaY} UU (wheelHeightsY=[${wheelHeightsY.join(', ')}])`,
      });
    }
  }

  return {
    stage,
    role,
    rosterMode,
    elapsedMs: Math.round(elapsedMs),
    simTick,
    matchMode: String(targetView.match?.state?.mode ?? 'unknown'),
    matchPhase: String(targetView.match?.state?.phase ?? 'unknown'),
    isLobbyDualWorld: Boolean(targetView.networkManager?.isLobbyDualWorldActive?.()),
    simCars,
    meshCars,
    anomalies,
  };
}

export function inspectChannelHandshakeDiagnostics(
  targetView: ReproProbeRuntimeView,
  role: ReproRole
): ReproHandshakeDiagnosticSnapshot {
  const hostCtrl = targetView.multiplayerSession?.hostController;
  const clientCtrl = targetView.multiplayerSession?.clientJoinNegotiator?.clientController;
  const channel: ReproInspectableWebRtcChannel | null =
    role === 'host' ? (hostCtrl?.channel ?? null) : (clientCtrl?.channel ?? null);

  const proto = channel ? Object.getPrototypeOf(channel) : null;
  const rttDesc = proto ? Object.getOwnPropertyDescriptor(proto, 'measuredRttMs') : undefined;
  const measuredRttGetterOnly = Boolean(rttDesc && rttDesc.get && !rttDesc.set);

  return {
    role,
    channelRole: channel?.role ?? null,
    hasOwnIsHostProperty: Boolean(
      channel && Object.prototype.hasOwnProperty.call(channel, 'isHost')
    ),
    channelIsHostValue: channel?.isHost,
    isCrossTab: Boolean(channel?.isCrossTab),
    transportMode: channel?.transportMode ?? null,
    dataChannelReadyState: channel?.dataChannel?.readyState ?? null,
    measuredRttGetterOnly,
    reconcilerHardSnapCount: targetView.networkReconciler?.hardSnapCount ?? 0,
    reconcilerCorrections: targetView.networkReconciler?.correctionCount ?? 0,
    reconcilerLobbyDualWorldMode: Boolean(targetView.networkReconciler?.lobbyDualWorldMode),
    hostRegisteredClientPeers: hostCtrl?.getConnectedPeerList?.()?.length ?? 0,
  };
}

export function emitReproStreamEvent(event: ReproStreamEvent): void {
  const serialized = JSON.stringify(event);
  console.info(`[ReproStream] ${serialized}`);
  if (typeof fetch === 'function') {
    void fetch('/__rc_repro_stream', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: serialized,
      keepalive: true,
    }).catch(() => {});
  }
}
