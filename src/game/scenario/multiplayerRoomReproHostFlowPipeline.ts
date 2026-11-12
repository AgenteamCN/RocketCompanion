/**
 * multiplayerRoomReproHostFlowPipeline.ts
 * Host-tab multi-stage reproduction flow for Multiplayer Host-a-Room testing.
 * Coordinates BroadcastChannel barriers with the Client tab and runs selective
 * Host-side Lobby, Match, Trajectory, Physics Rate Sweep, Goal Replay, and
 * Host Takeover probes.
 */

import { ensureExperimentalEngine } from '../../ai/experimental/ExperimentalBotAgent.ts';
import type { ReproClientFlowContext } from './multiplayerRoomReproClientFlowPipeline.ts';
import {
  probeClientLobbyGoalScoredAndReset,
  probeConsecutiveGoalsReplayKickoffLifecycle,
  probeNetworkLatencyBandwidthAndHudPowerSave,
  probeVariablePhysicsRateAndBandwidthSweep,
} from './multiplayerRoomReproEdgeCasePipeline.ts';
import {
  probeBallTrajectoryPredictorOnlineResets,
  probeHostTakeoverPhenomenon,
  triggerGoalReplayNameTagCorruptionRepro,
} from './multiplayerRoomReproPhenomenaPipeline.ts';
import {
  applyHostCrossTabSignalingBridge,
  emitReproStreamEvent,
  inspectChannelHandshakeDiagnostics,
} from './multiplayerRoomReproProbePipeline.ts';
import type { ReproHostTakeoverDiagnosticSnapshot } from './multiplayerRoomReproTypes.ts';

const sleepMs = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

export interface ReproHostFlowContext extends ReproClientFlowContext {
  setRawCrossTabJoinedBeforeBridge: (joined: boolean) => void;
  setHostTakeoverDiagnostics: (diag: ReproHostTakeoverDiagnosticSnapshot) => void;
}

export async function executeReproHostFlow(ctx: ReproHostFlowContext): Promise<void> {
  const { targetView, cfg } = ctx;
  ctx.logLifecycle(
    `Starting Host flow (mode=${cfg.rosterMode}, room=${cfg.roomCode}, probes=${cfg.enabledProbes.join(',')})`
  );
  await sleepMs(250);
  ctx.recordPoseProbe('host_before_warmup');

  const bridgeChannel = new BroadcastChannel(`rc_repro_bridge_${cfg.roomCode}`);
  let pendingClientAnswerToken: string | null = null;
  let clientJoinedSignalReceived = false;
  let clientLobbyProbesDone = false;
  let clientTrajectoryProbeDone = false;
  bridgeChannel.onmessage = (ev: MessageEvent) => {
    const data = ev.data as { type?: string; answerToken?: string } | null;
    if (data?.type === 'client_answer_ready' && typeof data.answerToken === 'string') {
      pendingClientAnswerToken = data.answerToken;
    } else if (data?.type === 'client_joined_lobby') {
      clientJoinedSignalReceived = true;
    } else if (data?.type === 'client_lobby_probes_done') {
      clientLobbyProbesDone = true;
    } else if (data?.type === 'client_trajectory_probe_done') {
      clientTrajectoryProbeDone = true;
    }
  };

  const gameMode = cfg.rosterMode === '2p' ? '1v1' : cfg.rosterMode === '2p2ai' ? '2v2' : '3v3';
  const hostOk = await targetView.matchPort?.hostOnlineWarmup?.({
    roomId: cfg.roomCode,
    playerName: 'HostRepro',
    gameMode,
    botFillMode: cfg.rosterMode === '2p' ? 'empty' : 'auto_fill',
    durationSeconds: 90,
    lobbyMode: true,
  });
  const offerToken = targetView.multiplayerSession?.hostController?.offerToken || '';
  ctx.logLifecycle(
    `hostOnlineWarmup completed: success=${Boolean(hostOk)}, offerLen=${offerToken.length}`
  );

  ctx.recordPoseProbe('host_after_warmup_0ms');
  await sleepMs(1000);
  if (ctx.hasProbe('lobby-probes')) {
    ctx.recordLobbyProbeDiagnostics();
  }
  ctx.recordPoseProbe('host_lobby_1500ms');

  if (typeof window !== 'undefined') {
    const clientUrl = new URL(window.location.href);
    clientUrl.searchParams.set('reproRole', 'client');
    clientUrl.searchParams.set('reproPeerIdx', '1');
    window.open(clientUrl.toString(), '_blank');
    ctx.logLifecycle('Opened Client tab via window.open');
  }

  for (let i = 0; i < 60; i++) {
    const diagNow = inspectChannelHandshakeDiagnostics(targetView, 'host');
    if (
      pendingClientAnswerToken ||
      clientJoinedSignalReceived ||
      diagNow.hostRegisteredClientPeers > 0
    ) {
      break;
    }
    await sleepMs(250);
  }
  await sleepMs(500);

  const preBridgeDiag = inspectChannelHandshakeDiagnostics(targetView, 'host');
  const rawJoined = preBridgeDiag.isCrossTab || preBridgeDiag.hostRegisteredClientPeers > 0;
  ctx.setRawCrossTabJoinedBeforeBridge(rawJoined);
  if (cfg.bridgeSignalingAfterProbe && !rawJoined) {
    await applyHostCrossTabSignalingBridge(targetView, pendingClientAnswerToken, ctx.logLifecycle);
  }

  await sleepMs(1000);
  bridgeChannel.postMessage({ type: 'host_lobby_settled' });
  ctx.recordRosterVisibilityProbe('host_lobby_with_client');

  if (ctx.hasProbe('lobby-goal-reset')) {
    const goalResetDiag = await probeClientLobbyGoalScoredAndReset(
      targetView,
      'host',
      cfg.rosterMode,
      ctx.elapsedMs
    );
    ctx.setLobbyGoalResetDiagnostics(goalResetDiag);
    emitReproStreamEvent({ type: 'lobby_goal_reset_diag', diag: goalResetDiag });
  }

  for (let i = 0; i < 25; i++) {
    if (clientLobbyProbesDone) break;
    await sleepMs(100);
  }

  if (cfg.rosterMode !== '2p') {
    await ensureExperimentalEngine('ducky');
  }

  targetView.matchPort?.forceStartOnlineMatch?.(90);
  bridgeChannel.postMessage({ type: 'host_match_started' });
  ctx.logLifecycle('Invoked forceStartOnlineMatch(90)');

  await sleepMs(350);
  ctx.recordPoseProbe('host_match_start_250ms');
  ctx.recordRosterVisibilityProbe('host_match_start_250ms');

  for (let i = 0; i < 40; i++) {
    if (targetView.match?.state?.phase === 'playing') break;
    await sleepMs(200);
  }
  await sleepMs(250);
  ctx.recordRosterVisibilityProbe('host_match_running_1450ms');

  if (ctx.hasProbe('network-latency-hud')) {
    const netLatencyDiag = await probeNetworkLatencyBandwidthAndHudPowerSave(
      targetView,
      'host',
      cfg.rosterMode,
      cfg,
      ctx.elapsedMs
    );
    ctx.setNetworkLatencyHudDiagnostics(netLatencyDiag);
    emitReproStreamEvent({ type: 'network_latency_hud_diag', diag: netLatencyDiag });
  }

  if (ctx.hasProbe('trajectory')) {
    ctx.trajTracker.resetWindow(true);
    bridgeChannel.postMessage({ type: 'host_ball_launched_in_playing' });
    const trajSummary = await probeBallTrajectoryPredictorOnlineResets(
      targetView,
      'host',
      cfg.rosterMode,
      ctx.elapsedMs
    );
    ctx.setTrajectoryDiagnostics(trajSummary);
    emitReproStreamEvent({ type: 'trajectory_diag', summary: trajSummary });
    await sleepMs(1000);
    ctx.recordPoseProbe('host_match_playing_trajectory');
    ctx.trajTracker.resetWindow(false);
  } else {
    bridgeChannel.postMessage({ type: 'host_ball_launched_in_playing' });
  }

  for (let i = 0; i < 20; i++) {
    if (clientTrajectoryProbeDone) break;
    await sleepMs(100);
  }

  if (ctx.hasProbe('physics-rate-sweep') && ctx.pacingCtrl) {
    const rateSweepDiag = await probeVariablePhysicsRateAndBandwidthSweep(
      targetView,
      'host',
      cfg.rosterMode,
      cfg.physicsHzSteps,
      ctx.pacingCtrl,
      ctx.elapsedMs,
      ctx.getStarvationCount
    );
    ctx.setPhysicsRateSweepDiagnostics(rateSweepDiag);
    emitReproStreamEvent({ type: 'physics_rate_sweep_diag', diag: rateSweepDiag });
  }

  if (ctx.hasProbe('goal-replay-kickoff-freeze')) {
    bridgeChannel.postMessage({ type: 'host_starting_goal_freeze_probe' });
    const goalFreezeDiag = await probeConsecutiveGoalsReplayKickoffLifecycle(
      targetView,
      'host',
      cfg.rosterMode,
      ctx.elapsedMs,
      ctx.getSnapCount,
      ctx.getFallbackWarnCount
    );
    ctx.setGoalReplayKickoffDiagnostics(goalFreezeDiag);
    emitReproStreamEvent({ type: 'goal_replay_kickoff_diag', diag: goalFreezeDiag });
  }

  if (ctx.hasProbe('goal-replay-director')) {
    triggerGoalReplayNameTagCorruptionRepro(targetView);
    ctx.recordRosterVisibilityProbe('host_after_goal_replay_director');
  }

  if (ctx.hasProbe('host-takeover')) {
    const takeoverDiag = await probeHostTakeoverPhenomenon(
      targetView,
      cfg.rosterMode,
      ctx.elapsedMs()
    );
    ctx.setHostTakeoverDiagnostics(takeoverDiag);
    emitReproStreamEvent({ type: 'host_takeover_diag', diag: takeoverDiag });
  }

  bridgeChannel.postMessage({ type: 'host_probes_complete' });
  bridgeChannel.close();
}
