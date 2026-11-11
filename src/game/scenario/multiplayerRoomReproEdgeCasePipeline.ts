/**
 * multiplayerRoomReproEdgeCasePipeline.ts
 * Pure diagnostic probes for the online investigation edge cases:
 * 1. Client Lobby dual-world goal scored & ball reset supervision (lobby-goal-reset)
 * 2. 50ms/50ms NetworkSimulator latency, bandwidth & tab-blur HUD ping (network-latency-hud)
 * 3. Consecutive 2-goal -> Replay -> KICKOFF_WILL_START/START freeze chain (goal-replay-kickoff-freeze)
 * 4. Variable physics step rate sweep (60Hz..144Hz) & timeScale stability (physics-rate-sweep)
 */

import { useAppStore } from '../runtimeUiPort.ts';
import type {
  ReproGoalReplayKickoffFreezeDiagnosticSnapshot,
  ReproGoalTransitionSample,
  ReproInspectableWebRtcChannel,
  ReproLobbyGoalResetDiagnosticSnapshot,
  ReproNetworkLatencyHudDiagnosticSnapshot,
  ReproPhysicsRateStepSample,
  ReproPhysicsRateSweepDiagnosticSnapshot,
  ReproProbeRuntimeView,
} from './multiplayerRoomReproEdgeCaseTypes.ts';
import type { ReproHeadlessPacingController } from './multiplayerRoomReproPhenomenaPipeline.ts';
import type { ReproRole, ReproRosterMode, ReproUrlConfig } from './multiplayerRoomReproTypes.ts';
import { roundMetric } from './scenarioMetricsPipeline.ts';

const sleepMs = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

export async function probeClientLobbyGoalScoredAndReset(
  targetView: ReproProbeRuntimeView,
  role: ReproRole,
  rosterMode: ReproRosterMode,
  getElapsedMs: () => number
): Promise<ReproLobbyGoalResetDiagnosticSnapshot> {
  const sim = targetView.physics?.sim ?? targetView.physics;
  const isLobbyDualWorld = Boolean(targetView.networkManager?.isLobbyDualWorldActive?.());
  const bv0 = sim?.getBallStateView?.();
  const initialBallPos: [number, number, number] = [
    roundMetric(bv0?.posX ?? 0, 2),
    roundMetric(bv0?.posY ?? 0, 2),
    roundMetric(bv0?.posZ ?? 0, 2),
  ];
  const startTick = sim?.getHeaderView?.()?.tickCount ?? 0;
  const injectedGoalPosY = 4820;
  const goalShotPatch = {
    pos: [0, injectedGoalPosY, 95] as [number, number, number],
    vel: [0, 2950, 40] as [number, number, number],
    angVel: [0, 0, 0] as [number, number, number],
  };
  const server = targetView.networkManager?.sessionCoordinator?.authoritativeServer;

  if (role === 'host') {
    server?.sim?.setBallState?.(goalShotPatch);
  }
  targetView.physics?.setBallState?.(goalShotPatch);

  const bvInjected = sim?.getBallStateView?.();
  let maxObservedAbsBallY = roundMetric(Math.abs(bvInjected?.posY ?? injectedGoalPosY), 2);
  let ballResetToCenterObserved = false;

  for (let i = 0; i < 40; i++) {
    await sleepMs(20);
    const bv = sim?.getBallStateView?.();
    const absY = Math.abs(bv?.posY ?? 0);
    if (absY > maxObservedAbsBallY) {
      maxObservedAbsBallY = roundMetric(absY, 2);
    }
    if (maxObservedAbsBallY >= 4800 && absY < 250) {
      ballResetToCenterObserved = true;
      break;
    }
  }

  const bvEnd = sim?.getBallStateView?.();
  const postWaitBallPos: [number, number, number] = [
    roundMetric(bvEnd?.posX ?? 0, 2),
    roundMetric(bvEnd?.posY ?? 0, 2),
    roundMetric(bvEnd?.posZ ?? 0, 2),
  ];
  const endTick = sim?.getHeaderView?.()?.tickCount ?? startTick;
  const ballStuckInGoal = !ballResetToCenterObserved && Math.abs(postWaitBallPos[1]) > 5000;

  if (ballStuckInGoal && role === 'client') {
    targetView.physics?.setBallState?.({
      pos: [0, 0, 93.15],
      vel: [0, 0, 0],
      angVel: [0, 0, 0],
    });
  }

  return {
    role,
    rosterMode,
    elapsedMs: getElapsedMs(),
    isLobbyDualWorld,
    initialBallPos,
    injectedGoalPosY,
    maxObservedAbsBallY,
    postWaitBallPos,
    ticksObserved: Math.max(0, endTick - startTick),
    ballResetToCenterObserved,
    ballStuckInGoal,
  };
}

function resolveActiveWebRtcChannels(
  targetView: ReproProbeRuntimeView,
  role: ReproRole
): ReproInspectableWebRtcChannel[] {
  if (role === 'host') {
    const hostCtrl = targetView.multiplayerSession?.hostController;
    const list: ReproInspectableWebRtcChannel[] = [];
    if (hostCtrl?.channel) list.push(hostCtrl.channel);
    if (hostCtrl?.peerChannels) {
      for (const ch of hostCtrl.peerChannels.values()) {
        if (ch && !list.includes(ch)) list.push(ch);
      }
    }
    return list;
  }
  const clientCh = targetView.multiplayerSession?.clientJoinNegotiator?.clientController?.channel;
  return clientCh ? [clientCh] : [];
}

export async function probeNetworkLatencyBandwidthAndHudPowerSave(
  targetView: ReproProbeRuntimeView,
  role: ReproRole,
  rosterMode: ReproRosterMode,
  cfg: ReproUrlConfig,
  getElapsedMs: () => number
): Promise<ReproNetworkLatencyHudDiagnosticSnapshot> {
  const channels = resolveActiveWebRtcChannels(targetView, role);
  const primary = channels[0] ?? null;
  const uplinkMs = Math.max(0, cfg.latencyMs);
  const downlinkMs = Math.max(0, cfg.latencyMs);

  const channelRttMsBeforePing = Math.round(primary?.measuredRttMs ?? primary?.rttMs ?? 0);
  const stats0 = primary?.simulator?.stats;
  const pings0 = stats0?.pingsSent ?? 0;
  const pongs0 = stats0?.pongsReceived ?? 0;
  const bytesSent0 = stats0?.bytesSent ?? 0;
  const bytesRecv0 = stats0?.bytesReceived ?? 0;
  const t0 = performance.now();

  for (const ch of channels) {
    ch.setAsymmetricLatency?.(uplinkMs, downlinkMs);
    ch.setJitter?.(2);
  }

  for (let i = 0; i < 3; i++) {
    for (const ch of channels) {
      ch.transport?.sendPing?.();
    }
    await sleepMs(140);
  }
  await sleepMs(200);

  const dtSec = Math.max(0.05, (performance.now() - t0) / 1000);
  const stats1 = primary?.simulator?.stats;
  const bytesSentDelta = Math.max(0, (stats1?.bytesSent ?? 0) - bytesSent0);
  const bytesRecvDelta = Math.max(0, (stats1?.bytesReceived ?? 0) - bytesRecv0);
  const realizedThroughputKbps = roundMetric(
    ((bytesSentDelta + bytesRecvDelta) * 8) / 1000 / dtSec,
    2
  );
  const channelMeasuredRttMsAfterPing = Math.round(
    primary?.measuredRttMs ?? primary?.rttMs ?? primary?.simulator?.measuredRttMs ?? 0
  );
  const reconcilerRttMs = Math.round(targetView.networkReconciler?.metrics?.rttMs ?? 0);

  const readHudPeerPing = (): number | null => {
    const peers = useAppStore?.getState?.()?.onlineSession?.connectedPeers ?? [];
    const remote = peers.find((p) => (role === 'host' ? p.carIndex === 1 : p.carIndex === 0));
    return typeof remote?.pingMs === 'number' ? remote.pingMs : null;
  };

  const hudPeerPingBeforeBlurMs = readHudPeerPing();
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new Event('blur'));
  }
  await sleepMs(160);
  const hudPeerPingDuringPowerSaveMs = readHudPeerPing();
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new Event('focus'));
  }

  for (const ch of channels) {
    ch.setAsymmetricLatency?.(0, 0);
  }

  const expectedMinRtt = Math.max(15, Math.round((uplinkMs + downlinkMs) * 0.75));
  return {
    role,
    rosterMode,
    elapsedMs: getElapsedMs(),
    injectedUplinkMs: uplinkMs,
    injectedDownlinkMs: downlinkMs,
    targetBandwidthKbps: cfg.bandwidthKbps,
    channelRttMsBeforePing,
    channelMeasuredRttMsAfterPing,
    reconcilerRttMs,
    pingsSentDelta: Math.max(0, (stats1?.pingsSent ?? 0) - pings0),
    pongsReceivedDelta: Math.max(0, (stats1?.pongsReceived ?? 0) - pongs0),
    bytesSent: bytesSentDelta,
    bytesReceived: bytesRecvDelta,
    realizedThroughputKbps,
    hudPeerPingBeforeBlurMs,
    hudPeerPingDuringPowerSaveMs,
    hudDroppedToHardcoded18Ms:
      hudPeerPingDuringPowerSaveMs === 18 && channelMeasuredRttMsAfterPing >= 50,
    pingTraversedSimulator: uplinkMs === 0 ? true : channelMeasuredRttMsAfterPing >= expectedMinRtt,
  };
}

export async function probeConsecutiveGoalsReplayKickoffLifecycle(
  targetView: ReproProbeRuntimeView,
  role: ReproRole,
  rosterMode: ReproRosterMode,
  getElapsedMs: () => number,
  getSnapCount: () => number,
  getFallbackWarnCount: () => number
): Promise<ReproGoalReplayKickoffFreezeDiagnosticSnapshot> {
  const sim = targetView.physics?.sim ?? targetView.physics;
  const readTick = (): number =>
    targetView.networkReconciler?.lastAuthoritativeTick ?? sim?.getHeaderView?.()?.tickCount ?? 0;
  const samples: ReproGoalTransitionSample[] = [];
  const goalsToAttempt = 2;

  for (let goalIndex = 1; goalIndex <= goalsToAttempt; goalIndex++) {
    for (let w = 0; w < 45; w++) {
      if (targetView.match?.state?.phase === 'playing') break;
      await sleepMs(100);
    }

    const goalStartMs = performance.now();
    const preGoalServerTick = readTick();
    const snaps0 = getSnapCount();
    const fallback0 = getFallbackWarnCount();
    const rollbacks0 = targetView.networkReconciler?.rollbackBudgetExhaustedCount ?? 0;
    const score0 =
      (targetView.match?.state?.blueScore ?? 0) + (targetView.match?.state?.orangeScore ?? 0);

    if (role === 'host') {
      const server = targetView.networkManager?.sessionCoordinator?.authoritativeServer;
      const goalShot = {
        pos: [0, 4820, 95] as [number, number, number],
        vel: [0, 2950, 40] as [number, number, number],
        angVel: [0, 0, 0] as [number, number, number],
      };
      server?.sim?.setBallState?.(goalShot);
      targetView.physics?.setBallState?.(goalShot);
    }

    let celebrationObserved = false;
    let replayObserved = false;
    let maxServerTickDuringReplay = 0;
    let replayPollCount = 0;
    let kickoffObserved = false;
    let serverTickAtKickoffWillStart = -1;
    let playingResumed = false;
    let serverTickAtPlayingResumed = -1;

    for (let poll = 0; poll < 165; poll++) {
      await sleepMs(75);
      const phase = String(targetView.match?.state?.phase ?? '');
      const curTick = readTick();
      const scoreNow =
        (targetView.match?.state?.blueScore ?? 0) + (targetView.match?.state?.orangeScore ?? 0);
      const inReplay =
        phase === 'replay' || Boolean(targetView.networkReconciler?.replayPlaybackMode);

      if (phase === 'goal_scored' || scoreNow > score0) {
        celebrationObserved = true;
      }
      if (inReplay) {
        replayObserved = true;
        replayPollCount++;
        if (curTick > maxServerTickDuringReplay) {
          maxServerTickDuringReplay = curTick;
        }
        if (replayPollCount >= 5) {
          targetView.networkManager?.voteSkipReplay?.();
          targetView.matchPort?.voteSkipOnlineReplay?.();
        }
      }
      if ((celebrationObserved || replayObserved) && phase === 'kickoff') {
        if (!kickoffObserved) {
          kickoffObserved = true;
          serverTickAtKickoffWillStart = curTick;
        }
      }
      if (kickoffObserved && phase === 'playing') {
        playingResumed = true;
        serverTickAtPlayingResumed = curTick;
        break;
      }
    }

    const tickRegressedAfterReplay =
      maxServerTickDuringReplay > 0 &&
      serverTickAtKickoffWillStart > 0 &&
      serverTickAtKickoffWillStart < maxServerTickDuringReplay;

    samples.push({
      goalIndex,
      preGoalServerTick,
      celebrationObserved,
      replayObserved,
      maxServerTickDuringReplay,
      kickoffObserved,
      serverTickAtKickoffWillStart,
      tickRegressedAfterReplay,
      playingResumed,
      serverTickAtPlayingResumed,
      kickoffFallbackWarnDelta: Math.max(0, getFallbackWarnCount() - fallback0),
      reconcilerSnapDelta: Math.max(0, getSnapCount() - snaps0),
      rollbackBudgetExhaustedDelta: Math.max(
        0,
        (targetView.networkReconciler?.rollbackBudgetExhaustedCount ?? 0) - rollbacks0
      ),
      durationMs: Math.round(performance.now() - goalStartMs),
    });
  }

  const goalsCompletedToPlaying = samples.filter((s) => s.playingResumed).length;
  const anyTickRegressionDetected = samples.some((s) => s.tickRegressedAfterReplay);
  const totalKickoffFallbackWarnings = samples.reduce(
    (acc, s) => acc + s.kickoffFallbackWarnDelta,
    0
  );

  return {
    role,
    rosterMode,
    elapsedMs: getElapsedMs(),
    goalsAttempted: goalsToAttempt,
    goalsCompletedToPlaying,
    anyTickRegressionDetected,
    totalKickoffFallbackWarnings,
    clientFrozenAfterReplay: goalsCompletedToPlaying < goalsToAttempt,
    samples,
  };
}

export async function probeVariablePhysicsRateAndBandwidthSweep(
  targetView: ReproProbeRuntimeView,
  role: ReproRole,
  rosterMode: ReproRosterMode,
  hzSteps: readonly number[],
  pacingCtrl: ReproHeadlessPacingController,
  getElapsedMs: () => number,
  getStarvationCount: () => number
): Promise<ReproPhysicsRateSweepDiagnosticSnapshot> {
  const sim = targetView.physics?.sim ?? targetView.physics;
  const steps: ReproPhysicsRateStepSample[] = [];
  const defaultHz = pacingCtrl.getTargetHz();

  for (const rawHz of hzSteps) {
    const targetHz = Math.max(60, Math.min(144, Math.round(rawHz)));
    pacingCtrl.setTargetHz(targetHz);
    const t0 = performance.now();
    const startTick = sim?.getHeaderView?.()?.tickCount ?? 0;
    const snaps0 = targetView.networkReconciler?.hardSnapCount ?? 0;
    const starve0 = getStarvationCount();

    let leadSum = 0;
    let bufSum = 0;
    const subSamples = 5;
    for (let s = 0; s < subSamples; s++) {
      await sleepMs(60);
      leadSum += targetView.networkReconciler?.metrics?.leadTicks ?? 0;
      bufSum += targetView.networkReconciler?.metrics?.bufferTicks ?? 0;
    }

    const durationMs = Math.max(1, Math.round(performance.now() - t0));
    const endTick = sim?.getHeaderView?.()?.tickCount ?? startTick;
    const realizedRateHz = roundMetric(((endTick - startTick) * 1000) / durationMs, 2);

    steps.push({
      targetHz,
      durationMs,
      startTick,
      endTick,
      realizedRateHz,
      reconcilerTimeScale: roundMetric(targetView.networkReconciler?.timeScale ?? 1, 4),
      meanLeadTicks: roundMetric(leadSum / subSamples, 2),
      meanBufferTicks: roundMetric(bufSum / subSamples, 2),
      hardSnapDelta: Math.max(0, (targetView.networkReconciler?.hardSnapCount ?? 0) - snaps0),
      starvationDelta: Math.max(0, getStarvationCount() - starve0),
    });
  }

  pacingCtrl.setTargetHz(defaultHz);
  const realizedRates = steps.map((s) => s.realizedRateHz);

  return {
    role,
    rosterMode,
    elapsedMs: getElapsedMs(),
    requestedHzSteps: [...hzSteps],
    minRealizedHz: realizedRates.length > 0 ? Math.min(...realizedRates) : 0,
    maxRealizedHz: realizedRates.length > 0 ? Math.max(...realizedRates) : 0,
    totalHardSnapsAcrossSweep: steps.reduce((acc, s) => acc + s.hardSnapDelta, 0),
    totalStarvationsAcrossSweep: steps.reduce((acc, s) => acc + s.starvationDelta, 0),
    steps,
  };
}
