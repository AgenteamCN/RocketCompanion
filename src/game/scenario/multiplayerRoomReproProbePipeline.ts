/**
 * multiplayerRoomReproProbePipeline.ts
 * Pure helper pipeline for parsing URL probe configuration, sampling vehicle
 * physics (CarStateView) and 3D scenegraph (arena.cars & arena.carWheels) poses,
 * detecting entry orientation/wheel anomalies, inspecting P2PWebRTCChannel /
 * PredictionReconciler handshake state, and streaming reproduction telemetry.
 */

import { captureRuntimeReplayCarEntries } from '../../replay/replayDirectorCarRosterPipeline.ts';
import { getNameTagRuntimeState } from '../runtimeUiPort.ts';
import { roundMetric } from './scenarioMetricsPipeline.ts';
import {
  ALL_REPRO_PROBE_IDS,
  type ReproInspectableWebRtcChannel,
  type ReproProbeBallView,
  type ReproProbeCarView,
  type ReproProbeId,
  type ReproProbeRuntimeView,
  type ReproTrajectoryObservationWindow,
} from './multiplayerRoomReproEdgeCaseTypes.ts';
import type {
  ReproBallTrajectorySample,
  ReproHandshakeDiagnosticSnapshot,
  ReproMeshCarPoseSample,
  ReproNameTagSample,
  ReproPoseAnomalyItem,
  ReproPoseProbeSnapshot,
  ReproRole,
  ReproRosterMode,
  ReproSimCarPoseSample,
  ReproStreamEvent,
  ReproUrlConfig,
} from './multiplayerRoomReproTypes.ts';

export type {
  ReproInspectableWebRtcChannel,
  ReproProbeBallView,
  ReproProbeCarView,
  ReproProbeRuntimeView,
  ReproTrajectoryObservationWindow,
};

const DEFAULT_PHYSICS_HZ_STEPS: readonly number[] = Object.freeze([60, 90, 100, 120, 144]);

export function parseEnabledProbeList(
  raw: string | null | undefined,
  rosterMode: ReproRosterMode = '2p'
): readonly ReproProbeId[] {
  const clean = String(raw || 'all')
    .trim()
    .toLowerCase();
  if (clean === 'full') {
    return ALL_REPRO_PROBE_IDS;
  }
  if (!clean || clean === 'all') {
    return rosterMode === '2p'
      ? ALL_REPRO_PROBE_IDS
      : ALL_REPRO_PROBE_IDS.filter((id) => id !== 'goal-replay-kickoff-freeze');
  }
  const tokens = clean
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  const valid = tokens.filter((t): t is ReproProbeId =>
    (ALL_REPRO_PROBE_IDS as readonly string[]).includes(t)
  );
  return valid.length > 0 ? valid : ALL_REPRO_PROBE_IDS;
}

export function shouldRunReproProbe(cfg: ReproUrlConfig, probeId: ReproProbeId): boolean {
  return cfg.enabledProbes.includes(probeId);
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
      enabledProbes: ALL_REPRO_PROBE_IDS,
      latencyMs: 50,
      bandwidthKbps: 512,
      physicsHzSteps: DEFAULT_PHYSICS_HZ_STEPS,
    };
  }
  const params = new URLSearchParams(window.location.search);
  const rawRole = params.get('reproRole');
  const role: ReproRole | null = rawRole === 'host' || rawRole === 'client' ? rawRole : null;
  const rawMode = params.get('reproMode');
  const rosterMode: ReproRosterMode =
    rawMode === '2p' ? '2p' : rawMode === '2p2ai' ? '2p2ai' : '3p3ai';
  const defaultRoom = rosterMode === '2p' ? '4816' : rosterMode === '2p2ai' ? '8144' : '7216';
  const roomCode = (params.get('reproRoom') || defaultRoom).trim() || defaultRoom;
  const rawSpeed = Number(params.get('reproSpeed') || 1);
  const speedMultiplier =
    Number.isFinite(rawSpeed) && rawSpeed >= 1 ? Math.min(8, Math.round(rawSpeed)) : 1;
  const rawPeerIdx = Number(params.get('reproPeerIdx') || 1);
  const peerIndex =
    Number(rawPeerIdx) >= 1 && Number.isFinite(rawPeerIdx) ? Math.round(rawPeerIdx) : 1;
  const bridgeParam = params.get('reproBridgeSignaling');
  const bridgeSignalingAfterProbe = bridgeParam !== '0' && bridgeParam !== 'false';
  const enabledProbes = parseEnabledProbeList(params.get('reproProbes'), rosterMode);
  const rawLatency = Number(params.get('reproLatencyMs') ?? 50);
  const latencyMs =
    Number.isFinite(rawLatency) && rawLatency >= 0 ? Math.min(300, Math.round(rawLatency)) : 50;
  const rawBw = Number(params.get('reproBandwidthKbps') ?? 512);
  const bandwidthKbps = Number.isFinite(rawBw) && rawBw >= 32 ? Math.round(rawBw) : 512;
  const rawHz = params.get('reproPhysicsHz');
  const parsedHz = rawHz
    ? rawHz
        .split(',')
        .map((s) => Number(s.trim()))
        .filter((n) => Number.isFinite(n) && n >= 60 && n <= 144)
    : [];
  const physicsHzSteps = parsedHz.length > 0 ? parsedHz : DEFAULT_PHYSICS_HZ_STEPS;

  return {
    role,
    rosterMode,
    roomCode,
    speedMultiplier,
    peerIndex,
    bridgeSignalingAfterProbe,
    enabledProbes,
    latencyMs,
    bandwidthKbps,
    physicsHzSteps,
  };
}

export function sampleSimAndMeshVehiclePose(
  targetView: ReproProbeRuntimeView,
  stage: string,
  role: ReproRole,
  rosterMode: ReproRosterMode,
  elapsedMs: number,
  trajWindow?: ReproTrajectoryObservationWindow
): ReproPoseProbeSnapshot {
  const sim = targetView.physics?.sim ?? targetView.physics;
  const simTick = sim?.getHeaderView?.()?.tickCount ?? -1;
  const matchMode = String(targetView.match?.state?.mode ?? 'unknown');
  const matchPhase = String(targetView.match?.state?.phase ?? 'unknown');
  const isLobbyDualWorld = Boolean(targetView.networkManager?.isLobbyDualWorldActive?.());
  const playerCarIndex = Number(targetView.arena?.playerCarIndex ?? 0);
  const isStaticPoseStage =
    !stage.includes('playing') && !stage.includes('trajectory') && matchPhase !== 'playing';
  const simCars: ReproSimCarPoseSample[] = [];
  const meshCars: ReproMeshCarPoseSample[] = [];
  const anomalies: ReproPoseAnomalyItem[] = [];

  for (let i = 0; i < 8; i++) {
    const cv = sim?.getCarStateView?.(i);
    if (!cv) continue;
    const isVisibleMesh = Boolean(targetView.arena?.cars?.[i]?.visible);
    const isSlotActive =
      typeof sim?.isCarSlotActive === 'function'
        ? Boolean(sim.isCarSlotActive(i))
        : Boolean(cv.isActive ?? isVisibleMesh);
    if (!isSlotActive && !isVisibleMesh && i > 1) continue;

    const sus: [number, number, number, number] = [
      roundMetric(cv.getWheelSusLength(0), 3),
      roundMetric(cv.getWheelSusLength(1), 3),
      roundMetric(cv.getWheelSusLength(2), 3),
      roundMetric(cv.getWheelSusLength(3), 3),
    ];
    const frontRearSusDelta = roundMetric((sus[0] + sus[1]) * 0.5 - (sus[2] + sus[3]) * 0.5, 3);
    const sample: ReproSimCarPoseSample = {
      idx: i,
      active: isSlotActive,
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

    const speed = Math.hypot(sample.vel[0], sample.vel[1], sample.vel[2]);
    if (
      i >= 6 &&
      !isLobbyDualWorld &&
      (matchMode === 'standard' || matchMode === 'match') &&
      isVisibleMesh
    ) {
      anomalies.push({
        carIndex: i,
        kind: 'lobby_ghost_car_suspended_or_tilted',
        description: `Diagnostic car #${i} remained visible during active match at posZ=${sample.pos[2]}`,
      });
    } else if (
      i < 6 &&
      sample.active &&
      isStaticPoseStage &&
      speed < 5 &&
      Math.abs(sample.fwdZ) >= 0.005
    ) {
      anomalies.push({
        carIndex: i,
        kind: 'chassis_pitch_tilt_on_ground',
        description: `Car #${i} pitched with fwdZ=${sample.fwdZ}, frontRearSusDelta=${sample.frontRearSusDelta}`,
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

    const matchingSimCar = simCars.find((sc) => sc.idx === i);
    const carSpeed = matchingSimCar
      ? Math.hypot(matchingSimCar.vel[0], matchingSimCar.vel[1], matchingSimCar.vel[2])
      : 0;
    if (isStaticPoseStage && i < 6 && carSpeed < 5 && Math.abs(frontRearWheelHeightDeltaY) >= 1.0) {
      anomalies.push({
        carIndex: i,
        kind: 'front_rear_wheel_height_asymmetry',
        description: `Car #${i} (${preset}/${hitbox}) front vs rear wheel Y delta=${frontRearWheelHeightDeltaY} UU`,
      });
    }
  }

  const nameTagEntries: ReproNameTagSample[] = (getNameTagRuntimeState()?.carEntries ?? []).map(
    (e) => ({
      carIndex: Number(e.carIndex ?? -1),
      name: String(e.name ?? ''),
      team: Number(e.team ?? 0),
      isBot: Boolean((e as { isBot?: boolean }).isBot),
    })
  );
  const replayRosterNames: ReproNameTagSample[] = captureRuntimeReplayCarEntries(
    targetView as never
  ).map((e) => ({
    carIndex: Number(e.carIndex ?? -1),
    name: String(e.name ?? ''),
    team: Number(e.team ?? 0),
    isBot: Boolean(e.isBot),
  }));

  const ballView = sim?.getBallStateView?.();
  const btp = targetView.ballTrajectoryPredictor;
  const predictionCount = Number(btp?.predictionCount ?? 0);
  const ballTrajectory: ReproBallTrajectorySample = {
    isActive: Boolean(btp?.isActive),
    predictionCount,
    maxObservedPredictionCount: Math.max(
      predictionCount,
      trajWindow?.maxObservedPredictionCount ?? 0
    ),
    collapseToCatchupCount: trajWindow?.collapseToCatchupCount ?? 0,
    ballPosZ: roundMetric(ballView?.posZ ?? 0, 2),
    ballSpeed: roundMetric(
      Math.hypot(ballView?.velX ?? 0, ballView?.velY ?? 0, ballView?.velZ ?? 0),
      2
    ),
  };

  if (stage === 'host_lobby_1500ms' || stage === 'client_lobby_connected') {
    for (const [probeIdx, expectedName] of [
      [6, 'Boost'],
      [7, 'Roll'],
    ] as const) {
      const hasMesh = meshCars.some((m) => m.idx === probeIdx);
      const tag = nameTagEntries.find((e) => e.carIndex === probeIdx);
      if (!hasMesh || !tag || tag.name !== expectedName) {
        anomalies.push({
          carIndex: probeIdx,
          kind: 'lobby_diagnostic_probe_missing_or_misnamed',
          description: `Lobby probe #${probeIdx} on ${role}: visible=${hasMesh}, nameTag=${JSON.stringify(tag?.name ?? null)}`,
        });
      }
    }
  }

  if (stage.startsWith('host_match_') || stage.startsWith('client_match_')) {
    const expectedLocalCarIdx = role === 'host' ? 0 : 1;
    if (playerCarIndex !== expectedLocalCarIdx) {
      anomalies.push({
        carIndex: playerCarIndex,
        kind: 'host_car_takeover_or_reassigned',
        description: `${role} playerCarIndex=${playerCarIndex} (expected ${expectedLocalCarIdx}) during ${stage}`,
      });
    }
    const expectedCars = rosterMode === '2p' ? 2 : rosterMode === '2p2ai' ? 4 : 6;
    for (let cIdx = 0; cIdx < expectedCars; cIdx++) {
      const simActive = simCars.some((c) => c.idx === cIdx && c.active);
      const meshVis = meshCars.some((m) => m.idx === cIdx);
      if (!simActive || !meshVis) {
        anomalies.push({
          carIndex: cIdx,
          kind: 'missing_match_participant_car',
          description: `${role} missing car #${cIdx} in ${rosterMode} at ${stage}`,
        });
      }
      const tag = nameTagEntries.find((e) => e.carIndex === cIdx);
      const replayEntry = replayRosterNames.find((e) => e.carIndex === cIdx);
      if (
        !tag ||
        /^Car \d+$/.test(tag.name) ||
        !replayEntry ||
        /^Car \d+$/.test(replayEntry.name)
      ) {
        anomalies.push({
          carIndex: cIdx,
          kind: 'fallback_generic_car_name',
          description: `${role} car #${cIdx} has fallback/missing name`,
        });
      }
    }
  }

  if (
    stage.includes('trajectory') &&
    (ballTrajectory.maxObservedPredictionCount < 25 || ballTrajectory.collapseToCatchupCount > 0)
  ) {
    anomalies.push({
      carIndex: -1,
      kind: 'trajectory_prediction_reset_collapse',
      description: `${role} BallTrajectoryPredictor failed stability check at ${stage}`,
    });
  }

  return {
    stage,
    role,
    rosterMode,
    elapsedMs: Math.round(elapsedMs),
    simTick,
    matchMode,
    matchPhase,
    isLobbyDualWorld,
    playerCarIndex,
    simCars,
    meshCars,
    nameTagEntries,
    replayRosterNames,
    ballTrajectory,
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
    measuredRttGetterOnly: Boolean(rttDesc && rttDesc.get && !rttDesc.set),
    reconcilerHardSnapCount: targetView.networkReconciler?.hardSnapCount ?? 0,
    reconcilerCorrections: targetView.networkReconciler?.correctionCount ?? 0,
    reconcilerLobbyDualWorldMode: Boolean(targetView.networkReconciler?.lobbyDualWorldMode),
    hostRegisteredClientPeers: hostCtrl?.getConnectedPeerList?.()?.length ?? 0,
  };
}

export async function applyHostCrossTabSignalingBridge(
  targetView: ReproProbeRuntimeView,
  pendingClientAnswerToken: string | null,
  logLifecycle: (msg: string) => void
): Promise<void> {
  const sigChan = targetView.multiplayerSession?.hostController?.channel as
    | (ReproInspectableWebRtcChannel & {
        handshake?: { handleRoomMessage?: (msg: unknown) => void };
      })
    | null
    | undefined;
  if (!sigChan) return;
  if (pendingClientAnswerToken && sigChan.acceptAnswerToken) {
    const applied = await sigChan.acceptAnswerToken(pendingClientAnswerToken);
    logLifecycle(`Applied Client WebRTC answer token via bridge: applied=${applied}`);
  }
  sigChan.handshake?.handleRoomMessage?.({
    type: 'cross_tab_join',
    clientName: 'Player2727',
    clientColorSlot: 5,
    clientColorHex: '#ff7043',
  });
  await new Promise((resolve) => setTimeout(resolve, 250));
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
