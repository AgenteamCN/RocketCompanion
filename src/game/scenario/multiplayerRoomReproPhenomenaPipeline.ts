/**
 * multiplayerRoomReproPhenomenaPipeline.ts
 * Modular diagnostic probes for reproducing the 4 Multiplayer Online Match &
 * Trajectory Predictor phenomena:
 * - Phenomenon A: Host forced takeover in Online Match (except 1v1) via neutral
 *   localTeam / bot_fill_1 slot 0 takeover and duplicate applyBotFillPolicy.
 * - Phenomenon B: Car names forced to generic 'Car 1..4' during/after Goal Replay
 *   and Host missing Client visibility while Client sees all vehicles normally.
 * - Phenomenon C: Client unable to see Host's Lobby diagnostic probes (#6 & #7)
 *   and Host probe name tags resolving to 'AlphaStriker' & 'Captain Ping' instead
 *   of 'Boost' & 'Roll'.
 * - Phenomenon D: BallTrajectoryPredictor constantly resetting to 5 ticks
 *   ('full-initial' / 'full-deviation') on every network reconciliation frame.
 */

import { getNameTagConfig, getNameTagRuntimeState, useAppStore } from '../runtimeUiPort.ts';
import { startGoalReplayDirectorSession } from '../runtime/signalWorldTransitionPipeline.ts';
import type { RuntimeSignalHostPort } from '../runtime/RuntimeGoalReplaySignalSubController.ts';
import { roundMetric } from './scenarioMetricsPipeline.ts';
import type {
  ReproHostTakeoverDiagnosticSnapshot,
  ReproLobbyProbeDiagnosticSnapshot,
  ReproProbeRuntimeView,
  ReproRole,
  ReproRosterMode,
  ReproRosterVisibilityAndNameTagSnapshot,
  ReproTrajectoryPredictorDiagnosticSummary,
  ReproTrajectoryPredictorOnlineSample,
} from './multiplayerRoomReproTypes.ts';

const sleepMs = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

function resolveEffectiveCarNameTag(carIndex: number): string {
  const runtimeState = getNameTagRuntimeState();
  const config = getNameTagConfig();
  const carEntries = Array.isArray(runtimeState?.carEntries) ? runtimeState.carEntries : [];
  const entry = carEntries.find((e) => e.carIndex === carIndex);
  return (
    entry?.name ||
    (entry as { username?: string } | undefined)?.username ||
    config.previewNames?.[carIndex % 6] ||
    `Player ${carIndex + 1}`
  );
}

export function sampleLobbyDiagnosticProbes(
  targetView: ReproProbeRuntimeView,
  role: ReproRole,
  rosterMode: ReproRosterMode,
  elapsedMs: number
): ReproLobbyProbeDiagnosticSnapshot {
  const diagProbe = targetView.networkManager?.diagnosticsProbe;
  const fleetEnabled = Boolean(diagProbe?.diagnosticsFleetController?.enabled);
  const sim = targetView.physics?.sim ?? targetView.physics;
  const serverActiveCarMask = Number(sim?.getActiveCarMask?.() ?? 0);
  const serverCar6BitActive = Boolean(
    (serverActiveCarMask & (1 << 6)) !== 0 || sim?.getCarStateView?.(6)?.isActive
  );
  const serverCar7BitActive = Boolean(
    (serverActiveCarMask & (1 << 7)) !== 0 || sim?.getCarStateView?.(7)?.isActive
  );

  const car6MeshVisible = Boolean(targetView.arena?.cars?.[6]?.visible);
  const car7MeshVisible = Boolean(targetView.arena?.cars?.[7]?.visible);
  const shouldResolveProbeNames =
    role === 'host' ? fleetEnabled || car6MeshVisible : car6MeshVisible;
  const car6ResolvedNameTag = shouldResolveProbeNames ? resolveEffectiveCarNameTag(6) : null;
  const car7ResolvedNameTag = shouldResolveProbeNames ? resolveEffectiveCarNameTag(7) : null;

  const hostProbeNamesMismatch =
    role === 'host' && (car6ResolvedNameTag !== 'Boost' || car7ResolvedNameTag !== 'Roll');
  const clientCannotSeeHostProbes =
    role === 'client' &&
    (serverCar6BitActive || serverCar7BitActive) &&
    (!car6MeshVisible || !car7MeshVisible);

  return {
    role,
    rosterMode,
    elapsedMs: Math.round(elapsedMs),
    fleetControllerEnabled: fleetEnabled,
    serverActiveCarMask,
    serverCar6BitActive,
    serverCar7BitActive,
    car6MeshVisible,
    car7MeshVisible,
    car6ResolvedNameTag,
    car7ResolvedNameTag,
    expectedCar6NameTag: 'Boost',
    expectedCar7NameTag: 'Roll',
    hostProbeNamesMismatch,
    clientCannotSeeHostProbes,
  };
}

export function sampleRosterVisibilityAndNameTags(
  targetView: ReproProbeRuntimeView,
  stage: string,
  role: ReproRole,
  rosterMode: ReproRosterMode,
  elapsedMs: number
): ReproRosterVisibilityAndNameTagSnapshot {
  const appState = useAppStore?.getState?.();
  const onlineSession = appState?.onlineSession as
    { localTeam?: string; connectedPeers?: ReadonlyArray<unknown> } | undefined;
  const uiLocalTeamDefault = String(onlineSession?.localTeam ?? 'neutral');
  const connectedPeerCount = Array.isArray(onlineSession?.connectedPeers)
    ? onlineSession.connectedPeers.length
    : 0;

  const cars = targetView.arena?.cars ?? [];
  const visibleCarIndices: number[] = [];
  for (let i = 0; i < cars.length; i++) {
    if (cars[i]?.visible) visibleCarIndices.push(i);
  }
  const clientCar1Visible = Boolean(cars[1]?.visible);

  const ntState = getNameTagRuntimeState();
  const rawEntries = Array.isArray(ntState?.carEntries) ? ntState.carEntries : [];
  const nameTagCarEntries = rawEntries.map((e) => ({
    carIndex: Number(e.carIndex ?? -1),
    name: String(e.name ?? ''),
    isBot: Boolean((e as { isBot?: boolean }).isBot),
  }));

  const forcedGenericCarNamesDetected = nameTagCarEntries.some((e) => /^Car [1-7]$/.test(e.name));
  const hostMissingClientVisibility = role === 'host' && !clientCar1Visible;
  const localPlayerCarIndex = Number(
    targetView.arena?.playerCarIndex ?? targetView.playerCarIndex ?? 0
  );

  return {
    stage,
    role,
    rosterMode,
    elapsedMs: Math.round(elapsedMs),
    uiLocalTeamDefault,
    uiLobbyPeersPropPassed: connectedPeerCount > 0,
    connectedPeerCount,
    localPlayerCarIndex,
    visibleCarIndices,
    clientCar1Visible,
    nameTagCarEntries,
    forcedGenericCarNamesDetected,
    hostMissingClientVisibility,
  };
}

export function triggerGoalReplayNameTagCorruptionRepro(targetView: ReproProbeRuntimeView): void {
  const directorPort = {
    playerCarIndex: targetView.arena?.playerCarIndex ?? targetView.playerCarIndex ?? 0,
    selectedPreset: targetView.selectedPreset ?? 'fennec',
    selectedHitbox: targetView.selectedHitbox ?? null,
    selectedColorSlot: targetView.selectedColorSlot ?? null,
    physics: targetView.physics ?? null,
    arena: targetView.arena ?? null,
    authoritativeServer: targetView.networkManager?.sessionCoordinator?.authoritativeServer ?? null,
    replayTimelineController: targetView.replayTimelineController ?? null,
    replayPovCarIndex: null,
  } as unknown as RuntimeSignalHostPort;

  startGoalReplayDirectorSession(directorPort, {
    durationTicks: 120,
    scoringTeam: 0,
    scorerCarIndex: 0,
  });
}

export async function probeHostTakeoverPhenomenon(
  targetView: ReproProbeRuntimeView,
  rosterMode: ReproRosterMode,
  elapsedMs: number
): Promise<ReproHostTakeoverDiagnosticSnapshot> {
  const appState = useAppStore?.getState?.();
  const uiDefaultLocalTeam = String(
    (appState?.onlineSession as { localTeam?: string } | undefined)?.localTeam ?? 'neutral'
  );
  const maxPlayers = rosterMode === '2p' ? 2 : rosterMode === '2p2ai' ? 4 : 6;
  const botFillMode = rosterMode === '2p' ? 'empty' : 'auto_fill';

  const rosterPlayers =
    targetView.networkManager?.rosterSyncCoordinator?.lastRosterSnapshot?.players ?? [];
  const activeBotCountInMatch = rosterPlayers.filter((p) => Boolean(p?.isBot)).length;
  const botFillRunsInMode = activeBotCountInMatch > 0;

  // Trigger the UI role-switch call when Host's localTeam is 'neutral' (teamCode=2)
  // or switches to spectator in an auto_fill room:
  targetView.matchPort?.switchOnlineRoleOrTeam?.('spectator', 2);
  await sleepMs(250);

  const postSwitchPlayers =
    targetView.networkManager?.rosterSyncCoordinator?.lastRosterSnapshot?.players ?? [];
  const hostInPlayers = postSwitchPlayers.some((p) => p?.sessionId === 'host' && !p?.isBot);
  const car0Entry = postSwitchPlayers.find((p) => p?.entityId === 0);
  const car0AssignedEntityAfterNeutralSwitch = car0Entry
    ? `${String(car0Entry.sessionId ?? 'unknown')}:${String(car0Entry.name ?? '')}(isBot=${Boolean(car0Entry.isBot)})`
    : null;
  const botFillTakesOverCar0WhenHostNeutralSwitched = Boolean(car0Entry && car0Entry.isBot);
  const hostLocalCarIndexStillZero =
    Number(targetView.arena?.playerCarIndex ?? targetView.playerCarIndex ?? 0) === 0;

  return {
    rosterMode,
    elapsedMs: Math.round(elapsedMs),
    maxPlayers,
    botFillMode,
    uiDefaultLocalTeam,
    activeBotCountInMatch,
    botFillRunsInMode,
    neutralTeamSwitchMovesHostToSpectator: !hostInPlayers,
    botFillTakesOverCar0WhenHostNeutralSwitched,
    hostLocalCarIndexStillZero,
    car0AssignedEntityAfterNeutralSwitch,
  };
}

export async function probeBallTrajectoryPredictorOnlineResets(
  targetView: ReproProbeRuntimeView,
  role: ReproRole,
  rosterMode: ReproRosterMode,
  getElapsedMs: () => number
): Promise<ReproTrajectoryPredictorDiagnosticSummary> {
  const predictor = targetView.ballTrajectoryPredictor;
  const phys = targetView.physics;
  const server = targetView.networkManager?.sessionCoordinator?.authoritativeServer;

  if (predictor) {
    predictor.updateSettings?.({ enabled: true });
    predictor.forcePredictAnyMovement = true;
    predictor.setSceneContext?.({ isGoalReplayActive: false, isPodiumActive: false });
  }

  // Launch the ball high into mid-air flight so it flies undisturbed without touching anything
  const launchState = {
    pos: [0, 0, 950] as [number, number, number],
    vel: [180, 720, 420] as [number, number, number],
    angVel: [0, 0, 0] as [number, number, number],
  };
  if (server?.sim?.setBallState) {
    server.sim.setBallState(launchState);
  }
  if (phys?.setBallState) {
    phys.setBallState(launchState);
  }

  const catchupTicksPerFrame = Number(predictor?.settings?.catchupTicksPerFrame ?? 5);
  const maxPredictionTicks = Number(predictor?.settings?.predictionTicks ?? 600);
  const initialWriteRevision = Number(phys?.ballStateWriteRevision ?? 0);
  const samples: ReproTrajectoryPredictorOnlineSample[] = [];

  for (let i = 0; i < 6; i++) {
    await sleepMs(60);
    const curTick = phys?.getHeaderView?.()?.tickCount ?? 0;
    try {
      predictor?.update?.(
        curTick,
        targetView.arena?.ball?.position ?? null,
        1280,
        720,
        phys ?? null
      );
    } catch {
      // Ignore WebGL/WASM errors in headless SwiftShader
    }
    const stateBuf = phys?.state;
    const ballView = (phys?.sim ?? phys)?.getBallStateView?.();
    const ballPosZ = roundMetric(ballView?.posZ ?? stateBuf?.[6] ?? 0, 2);
    const ballVelZ = roundMetric(ballView?.velZ ?? stateBuf?.[18] ?? 0, 2);
    const writeRev = Number(phys?.ballStateWriteRevision ?? 0);
    const corrCount = Number(targetView.networkReconciler?.correctionCount ?? 0);
    const predCount = Number(predictor?.predictionCount ?? 0);
    const updateKind = String(predictor?.sampler?.lastUpdateKind ?? 'unknown');

    samples.push({
      sampleIndex: i,
      elapsedMs: getElapsedMs(),
      simTick: curTick,
      ballPosZ,
      ballVelZ,
      ballStateWriteRevision: writeRev,
      reconcilerCorrectionCount: corrCount,
      predictionCount: predCount,
      maxPredictionTicks,
      catchupTicksPerFrame,
      lastUpdateMode: updateKind,
    });
  }

  const finalWriteRevision =
    samples.length > 0 ? samples[samples.length - 1].ballStateWriteRevision : initialWriteRevision;
  const writeRevisionIncrementsDuringFlight = Math.max(
    0,
    finalWriteRevision - initialWriteRevision
  );
  const fullResetCountDuringFlight = samples.filter(
    (s) => s.lastUpdateMode === 'full-initial' || s.lastUpdateMode === 'full-deviation'
  ).length;
  const counts = samples.map((s) => s.predictionCount).filter((c) => c > 0);
  const minPredictionCountObserved = counts.length > 0 ? Math.min(...counts) : 0;
  const maxPredictionCountObserved = counts.length > 0 ? Math.max(...counts) : 0;

  return {
    role,
    rosterMode,
    predictorEnabled: Boolean(predictor?.settings?.enabled ?? predictor?.isActive),
    catchupTicksPerFrame,
    maxPredictionTicks,
    initialWriteRevision,
    finalWriteRevision,
    writeRevisionIncrementsDuringFlight,
    fullResetCountDuringFlight,
    minPredictionCountObserved,
    maxPredictionCountObserved,
    trajectoryCollapsedBelow30Ticks:
      maxPredictionCountObserved > 0 && maxPredictionCountObserved <= 30,
    samples,
  };
}

export interface ReproTrajectoryWindowTracker {
  resetWindow: (active: boolean) => void;
  stepAndObserve: () => void;
  getWindowSnapshot: () => {
    readonly maxObservedPredictionCount: number;
    readonly collapseToCatchupCount: number;
  };
}

export function createTrajectoryObservationTracker(
  targetView: ReproProbeRuntimeView
): ReproTrajectoryWindowTracker {
  let trackingActive = false;
  let maxObservedPredictionCount = 0;
  let prevObservedPredictionCount = 0;
  let collapseToCatchupCount = 0;

  return {
    resetWindow(active: boolean): void {
      trackingActive = active;
      maxObservedPredictionCount = 0;
      prevObservedPredictionCount = 0;
      collapseToCatchupCount = 0;
    },
    stepAndObserve(): void {
      const sim = targetView.physics?.sim ?? targetView.physics;
      const btp = targetView.ballTrajectoryPredictor;
      if (!sim || !btp?.update) return;
      const curTick = sim.getHeaderView?.()?.tickCount ?? 0;
      btp.update(curTick, targetView.arena?.ball?.position, 1280, 720, targetView.physics);
      if (!trackingActive) return;

      const bv = sim.getBallStateView?.();
      const ballZ = bv?.posZ ?? 0;
      const ballSpeed = Math.hypot(bv?.velX ?? 0, bv?.velY ?? 0, bv?.velZ ?? 0);
      const count = Number(btp.predictionCount ?? 0);
      const isCarHitReset = btp.sampler?.lastUpdateKind === 'full-car-hit';
      if (ballZ > 110 && ballSpeed > 100) {
        if (prevObservedPredictionCount >= 20 && count > 0 && count <= 5 && !isCarHitReset) {
          collapseToCatchupCount++;
        }
        if (count > maxObservedPredictionCount) {
          maxObservedPredictionCount = count;
        }
        prevObservedPredictionCount = count;
      }
    },
    getWindowSnapshot() {
      return { maxObservedPredictionCount, collapseToCatchupCount };
    },
  };
}

export function startHeadlessReproPacingLoop(
  targetView: ReproProbeRuntimeView,
  speedMultiplier: number,
  onFrameStepped: () => void
): ReturnType<typeof setInterval> {
  const mutableRuntime = targetView as {
    setupAudio?: () => Promise<void>;
    setupBot?: () => Promise<void>;
    renderSubsystem?: { update?: (ctx: { shouldSkipGpuRender?: boolean }) => void } | null;
  };
  mutableRuntime.setupAudio = async () => {};
  mutableRuntime.setupBot = async () => {};
  targetView.stop?.();
  if (mutableRuntime.renderSubsystem) {
    mutableRuntime.renderSubsystem.update = (ctx) => {
      ctx.shouldSkipGpuRender = true;
    };
  }

  const extraSimTicks = Math.max(3, 3 * speedMultiplier);
  let syntheticNow = performance.now();
  return setInterval(() => {
    for (let i = 0; i < extraSimTicks; i++) {
      syntheticNow += 1000 / 120;
      try {
        targetView.pipeline?.executeSimulationOnly?.(syntheticNow);
      } catch (err) {
        console.error(err);
      }
    }
    syntheticNow += 1000 / 120;
    try {
      targetView.renderFrame?.(syntheticNow);
      onFrameStepped();
    } catch (err) {
      console.error(err);
    }
  }, 33);
}
