/**
 * multiplayerRoomReproProbePipeline.ts
 * Pure helper pipeline for sampling vehicle physics (CarStateView) and 3D scenegraph
 * (arena.cars & arena.carWheels) poses, detecting entry orientation/wheel anomalies,
 * inspecting P2PWebRTCChannel / PredictionReconciler handshake state, and streaming
 * real-time reproduction telemetry.
 */

import { captureRuntimeReplayCarEntries } from '../../replay/replayDirectorCarRosterPipeline.ts';
import { getNameTagRuntimeState } from '../runtimeUiPort.ts';
import { roundMetric } from './scenarioMetricsPipeline.ts';
import type {
  ReproBallTrajectorySample,
  ReproHandshakeDiagnosticSnapshot,
  ReproInspectableWebRtcChannel,
  ReproMeshCarPoseSample,
  ReproNameTagSample,
  ReproPoseAnomalyItem,
  ReproPoseProbeSnapshot,
  ReproProbeBallView,
  ReproProbeCarView,
  ReproProbeRuntimeView,
  ReproRole,
  ReproRosterMode,
  ReproSimCarPoseSample,
  ReproStreamEvent,
  ReproTrajectoryObservationWindow,
  ReproUrlConfig,
} from './multiplayerRoomReproTypes.ts';

export type {
  ReproInspectableWebRtcChannel,
  ReproProbeBallView,
  ReproProbeCarView,
  ReproProbeRuntimeView,
  ReproTrajectoryObservationWindow,
};

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
  const rosterMode: ReproRosterMode =
    rawMode === '2p' ? '2p' : rawMode === '2p2ai' ? '2p2ai' : '3p3ai';
  const defaultRoom = rosterMode === '2p' ? '4816' : rosterMode === '2p2ai' ? '5916' : '7216';
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
    const frontSusAvg = (sus[0] + sus[1]) * 0.5;
    const rearSusAvg = (sus[2] + sus[3]) * 0.5;
    const frontRearSusDelta = roundMetric(frontSusAvg - rearSusAvg, 3);

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

    const matchingSimCar = simCars.find((sc) => sc.idx === i);
    const carSpeed = matchingSimCar
      ? Math.hypot(matchingSimCar.vel[0], matchingSimCar.vel[1], matchingSimCar.vel[2])
      : 0;
    if (isStaticPoseStage && i < 6 && carSpeed < 5 && Math.abs(frontRearWheelHeightDeltaY) >= 1.0) {
      anomalies.push({
        carIndex: i,
        kind: 'front_rear_wheel_height_asymmetry',
        description: `Car #${i} (${preset}/${hitbox}) front vs rear wheel mount Y delta=${frontRearWheelHeightDeltaY} UU (wheelHeightsY=[${wheelHeightsY.join(', ')}])`,
      });
    }
  }

  const rawNameTags = getNameTagRuntimeState()?.carEntries ?? [];
  const nameTagEntries: ReproNameTagSample[] = rawNameTags.map((e) => ({
    carIndex: Number(e.carIndex ?? -1),
    name: String(e.name ?? ''),
    team: Number(e.team ?? 0),
    isBot: Boolean((e as { isBot?: boolean }).isBot),
  }));

  const rawReplayEntries = captureRuntimeReplayCarEntries(targetView as never);
  const replayRosterNames: ReproNameTagSample[] = rawReplayEntries.map((e) => ({
    carIndex: Number(e.carIndex ?? -1),
    name: String(e.name ?? ''),
    team: Number(e.team ?? 0),
    isBot: Boolean(e.isBot),
  }));

  const ballView = sim?.getBallStateView?.();
  const ballPosZ = roundMetric(ballView?.posZ ?? 0, 2);
  const ballSpeed = roundMetric(
    Math.hypot(ballView?.velX ?? 0, ballView?.velY ?? 0, ballView?.velZ ?? 0),
    2
  );
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
    ballPosZ,
    ballSpeed,
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
          description: `Lobby probe #${probeIdx} on ${role}: visible=${hasMesh}, nameTag=${JSON.stringify(tag?.name ?? null)} (expected '${expectedName}')`,
        });
      }
    }
  }

  const isActiveMatchStage = stage.startsWith('host_match_') || stage.startsWith('client_match_');
  if (isActiveMatchStage) {
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
          description: `${role} missing car #${cIdx} in ${rosterMode} at ${stage} (simActive=${simActive}, meshVisible=${meshVis})`,
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
          description: `${role} car #${cIdx} has fallback/missing name (nameTag=${JSON.stringify(tag?.name ?? null)}, replayName=${JSON.stringify(replayEntry?.name ?? null)})`,
        });
      }
    }
  }

  if (stage.includes('trajectory')) {
    if (
      ballTrajectory.maxObservedPredictionCount < 25 ||
      ballTrajectory.collapseToCatchupCount > 0
    ) {
      anomalies.push({
        carIndex: -1,
        kind: 'trajectory_prediction_reset_collapse',
        description: `${role} BallTrajectoryPredictor failed stability check at ${stage}: maxObservedPredictionCount=${ballTrajectory.maxObservedPredictionCount}, collapseToCatchupCount=${ballTrajectory.collapseToCatchupCount}, current=${ballTrajectory.predictionCount}`,
      });
    }
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
