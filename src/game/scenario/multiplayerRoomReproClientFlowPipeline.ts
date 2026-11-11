/**
 * multiplayerRoomReproClientFlowPipeline.ts
 * Client-tab multi-stage reproduction flow for Multiplayer Join-a-Room testing.
 * Coordinates BroadcastChannel barriers with the Host tab and runs selective
 * Client-side Lobby, Match, Trajectory, Physics Rate Sweep, and Goal Replay probes.
 */

import {
  probeClientLobbyGoalScoredAndReset,
  probeConsecutiveGoalsReplayKickoffLifecycle,
  probeNetworkLatencyBandwidthAndHudPowerSave,
  probeVariablePhysicsRateAndBandwidthSweep,
} from './multiplayerRoomReproEdgeCasePipeline.ts';
import type {
  ReproGoalReplayKickoffFreezeDiagnosticSnapshot,
  ReproLobbyGoalResetDiagnosticSnapshot,
  ReproNetworkLatencyHudDiagnosticSnapshot,
  ReproPhysicsRateSweepDiagnosticSnapshot,
  ReproProbeId,
  ReproProbeRuntimeView,
} from './multiplayerRoomReproEdgeCaseTypes.ts';
import {
  probeBallTrajectoryPredictorOnlineResets,
  type ReproHeadlessPacingController,
  type ReproTrajectoryWindowTracker,
} from './multiplayerRoomReproPhenomenaPipeline.ts';
import { emitReproStreamEvent } from './multiplayerRoomReproProbePipeline.ts';
import type {
  ReproTrajectoryPredictorDiagnosticSummary,
  ReproUrlConfig,
} from './multiplayerRoomReproTypes.ts';

const sleepMs = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

export interface ReproClientFlowContext {
  readonly targetView: ReproProbeRuntimeView;
  readonly cfg: ReproUrlConfig;
  readonly trajTracker: ReproTrajectoryWindowTracker;
  readonly pacingCtrl: ReproHeadlessPacingController | null;
  readonly hasProbe: (probeId: ReproProbeId) => boolean;
  readonly elapsedMs: () => number;
  readonly getSnapCount: () => number;
  readonly getStarvationCount: () => number;
  readonly getFallbackWarnCount: () => number;
  readonly logLifecycle: (message: string) => void;
  readonly recordPoseProbe: (stage: string) => void;
  readonly recordRosterVisibilityProbe: (stage: string) => void;
  readonly recordLobbyProbeDiagnostics: () => void;
  setLobbyGoalResetDiagnostics: (diag: ReproLobbyGoalResetDiagnosticSnapshot) => void;
  setNetworkLatencyHudDiagnostics: (diag: ReproNetworkLatencyHudDiagnosticSnapshot) => void;
  setTrajectoryDiagnostics: (summary: ReproTrajectoryPredictorDiagnosticSummary) => void;
  setPhysicsRateSweepDiagnostics: (diag: ReproPhysicsRateSweepDiagnosticSnapshot) => void;
  setGoalReplayKickoffDiagnostics: (diag: ReproGoalReplayKickoffFreezeDiagnosticSnapshot) => void;
}

export async function executeReproClientFlow(ctx: ReproClientFlowContext): Promise<void> {
  const { targetView, cfg } = ctx;
  ctx.logLifecycle(
    `Starting Client #${cfg.peerIndex} flow (mode=${cfg.rosterMode}, room=${cfg.roomCode}, probes=${cfg.enabledProbes.join(',')})`
  );
  await sleepMs(250);
  ctx.recordPoseProbe('client_before_join');

  const bridgeChannel = new BroadcastChannel(`rc_repro_bridge_${cfg.roomCode}`);
  let hostLobbySettled = false;
  let hostMatchStarted = false;
  let hostBallLaunched = false;
  let hostStartingGoalFreezeProbe = false;
  let hostProbesComplete = false;
  bridgeChannel.onmessage = (ev: MessageEvent) => {
    const data = ev.data as { type?: string } | null;
    if (data?.type === 'host_lobby_settled') hostLobbySettled = true;
    if (data?.type === 'host_match_started') hostMatchStarted = true;
    if (data?.type === 'host_ball_launched_in_playing') hostBallLaunched = true;
    if (data?.type === 'host_starting_goal_freeze_probe') hostStartingGoalFreezeProbe = true;
    if (data?.type === 'host_probes_complete') hostProbesComplete = true;
  };

  void targetView.matchPort
    ?.joinOnlineWarmup?.({
      roomId: cfg.roomCode,
      playerName: 'Player2727',
    })
    .catch(() => {});

  let answerToken = '';
  for (let i = 0; i < 30; i++) {
    const clientCtrl = targetView.multiplayerSession?.clientJoinNegotiator?.clientController;
    answerToken = clientCtrl?.channel?.answerToken || clientCtrl?.answerToken || '';
    if (answerToken || Boolean(clientCtrl?.channel?.isCrossTab)) break;
    await sleepMs(200);
  }

  bridgeChannel.postMessage({
    type: answerToken ? 'client_answer_ready' : 'client_joined_lobby',
    answerToken,
  });

  for (let i = 0; i < 20; i++) {
    if (hostLobbySettled) break;
    await sleepMs(200);
  }
  ctx.recordPoseProbe('client_lobby_connected');
  if (ctx.hasProbe('lobby-probes')) {
    ctx.recordLobbyProbeDiagnostics();
  }
  ctx.recordRosterVisibilityProbe('client_lobby_after_join');

  if (ctx.hasProbe('lobby-goal-reset')) {
    const goalResetDiag = await probeClientLobbyGoalScoredAndReset(
      targetView,
      'client',
      cfg.rosterMode,
      ctx.elapsedMs
    );
    ctx.setLobbyGoalResetDiagnostics(goalResetDiag);
    emitReproStreamEvent({ type: 'lobby_goal_reset_diag', diag: goalResetDiag });
  }
  bridgeChannel.postMessage({ type: 'client_lobby_probes_done' });

  for (let i = 0; i < 20; i++) {
    if (hostMatchStarted) break;
    await sleepMs(200);
  }
  await sleepMs(350);
  ctx.recordPoseProbe('client_match_countdown');
  ctx.recordRosterVisibilityProbe('client_match_active_600ms');

  if (ctx.hasProbe('network-latency-hud')) {
    const netLatencyDiag = await probeNetworkLatencyBandwidthAndHudPowerSave(
      targetView,
      'client',
      cfg.rosterMode,
      cfg,
      ctx.elapsedMs
    );
    ctx.setNetworkLatencyHudDiagnostics(netLatencyDiag);
    emitReproStreamEvent({ type: 'network_latency_hud_diag', diag: netLatencyDiag });
  }

  for (let i = 0; i < 60; i++) {
    const sim = targetView.physics?.sim ?? targetView.physics;
    const ballZ = sim?.getBallStateView?.()?.posZ ?? 0;
    if (hostBallLaunched && targetView.match?.state?.phase === 'playing' && ballZ > 600) {
      break;
    }
    if (hostBallLaunched && !ctx.hasProbe('trajectory')) break;
    await sleepMs(100);
  }

  if (ctx.hasProbe('trajectory')) {
    ctx.trajTracker.resetWindow(true);
    const trajSummary = await probeBallTrajectoryPredictorOnlineResets(
      targetView,
      'client',
      cfg.rosterMode,
      ctx.elapsedMs
    );
    ctx.setTrajectoryDiagnostics(trajSummary);
    emitReproStreamEvent({ type: 'trajectory_diag', summary: trajSummary });
    await sleepMs(1000);
    ctx.recordPoseProbe('client_match_playing_trajectory');
    ctx.trajTracker.resetWindow(false);
  }
  bridgeChannel.postMessage({ type: 'client_trajectory_probe_done' });

  if (ctx.hasProbe('physics-rate-sweep') && ctx.pacingCtrl) {
    const rateSweepDiag = await probeVariablePhysicsRateAndBandwidthSweep(
      targetView,
      'client',
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
    for (let i = 0; i < 20; i++) {
      if (hostStartingGoalFreezeProbe) break;
      await sleepMs(100);
    }
    const goalFreezeDiag = await probeConsecutiveGoalsReplayKickoffLifecycle(
      targetView,
      'client',
      cfg.rosterMode,
      ctx.elapsedMs,
      ctx.getSnapCount,
      ctx.getFallbackWarnCount
    );
    ctx.setGoalReplayKickoffDiagnostics(goalFreezeDiag);
    emitReproStreamEvent({ type: 'goal_replay_kickoff_diag', diag: goalFreezeDiag });
  }

  for (let i = 0; i < 30; i++) {
    if (hostProbesComplete) break;
    await sleepMs(150);
  }
  ctx.recordRosterVisibilityProbe('client_final_state');
  bridgeChannel.close();
}
