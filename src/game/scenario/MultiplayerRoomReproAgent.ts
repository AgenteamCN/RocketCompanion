/**
 * MultiplayerRoomReproAgent.ts
 * Browser-side multi-tab reproduction controller for Multiplayer Host-a-Room and
 * Join-a-Room flows (?reproRole=host|client&reproMode=2p|3p3ai&reproSpeed=1..8).
 * Exercises the real AuthoritativeServerWorker Web Worker, P2PWebRTCChannel,
 * CrossTabSignaling, and PredictionReconciler while streaming telemetry to
 * /__rc_repro_stream.
 */

import {
  createReproLogInterceptorState,
  installReproConsoleAndErrorInterceptors,
  type ReproLogInterceptorState,
} from './multiplayerRoomReproLogInterceptor.ts';
import {
  emitReproStreamEvent,
  inspectChannelHandshakeDiagnostics,
  parseMultiplayerRoomReproUrlConfig,
  sampleSimAndMeshVehiclePose,
  type ReproInspectableWebRtcChannel,
  type ReproProbeRuntimeView,
} from './multiplayerRoomReproProbePipeline.ts';
import {
  probeBallTrajectoryPredictorOnlineResets,
  probeHostTakeoverPhenomenon,
  sampleLobbyDiagnosticProbes,
  sampleRosterVisibilityAndNameTags,
  triggerGoalReplayNameTagCorruptionRepro,
} from './multiplayerRoomReproPhenomenaPipeline.ts';
import type {
  ReproHostTakeoverDiagnosticSnapshot,
  ReproLobbyProbeDiagnosticSnapshot,
  ReproPoseProbeSnapshot,
  ReproRoleSummaryReport,
  ReproRosterVisibilityAndNameTagSnapshot,
  ReproTrajectoryPredictorDiagnosticSummary,
  ReproUrlConfig,
} from './multiplayerRoomReproTypes.ts';

const sleepMs = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

export class MultiplayerRoomReproAgent {
  private readonly targetView: ReproProbeRuntimeView;
  private readonly cfg: ReproUrlConfig;
  private readonly startTimeMs = performance.now();
  private readonly poseProbes: ReproPoseProbeSnapshot[] = [];
  private readonly rosterVisibilityProbes: ReproRosterVisibilityAndNameTagSnapshot[] = [];
  private lobbyProbeDiagnostics: ReproLobbyProbeDiagnosticSnapshot | null = null;
  private hostTakeoverDiagnostics: ReproHostTakeoverDiagnosticSnapshot | null = null;
  private trajectoryDiagnostics: ReproTrajectoryPredictorDiagnosticSummary | null = null;
  private readonly logState: ReproLogInterceptorState = createReproLogInterceptorState();
  private rawCrossTabJoinedBeforeBridge = false;
  private speedTimerId: ReturnType<typeof setInterval> | null = null;

  constructor(targetView: ReproProbeRuntimeView, cfg: ReproUrlConfig) {
    this.targetView = targetView;
    this.cfg = cfg;
  }

  private elapsedMs(): number {
    return Math.round(performance.now() - this.startTimeMs);
  }

  private logLifecycle(message: string): void {
    if (!this.cfg.role) return;
    emitReproStreamEvent({
      type: 'lifecycle',
      role: this.cfg.role,
      rosterMode: this.cfg.rosterMode,
      elapsedMs: this.elapsedMs(),
      message,
    });
  }

  private recordPoseProbe(stage: string): ReproPoseProbeSnapshot {
    const role = this.cfg.role ?? 'host';
    const probe = sampleSimAndMeshVehiclePose(
      this.targetView,
      stage,
      role,
      this.cfg.rosterMode,
      this.elapsedMs()
    );
    this.poseProbes.push(probe);
    emitReproStreamEvent({ type: 'pose_probe', probe });
    return probe;
  }

  private recordRosterVisibilityProbe(stage: string): ReproRosterVisibilityAndNameTagSnapshot {
    const role = this.cfg.role ?? 'host';
    const probe = sampleRosterVisibilityAndNameTags(
      this.targetView,
      stage,
      role,
      this.cfg.rosterMode,
      this.elapsedMs()
    );
    this.rosterVisibilityProbes.push(probe);
    emitReproStreamEvent({ type: 'roster_visibility_probe', probe });
    return probe;
  }

  private recordLobbyProbeDiagnostics(): ReproLobbyProbeDiagnosticSnapshot {
    const role = this.cfg.role ?? 'host';
    const diag = sampleLobbyDiagnosticProbes(
      this.targetView,
      role,
      this.cfg.rosterMode,
      this.elapsedMs()
    );
    this.lobbyProbeDiagnostics = diag;
    emitReproStreamEvent({ type: 'lobby_probe_diag', diag });
    return diag;
  }

  private configureHeadlessPacing(): void {
    const mutableRuntime = this.targetView as {
      setupAudio?: () => Promise<void>;
      setupBot?: () => Promise<void>;
      renderSubsystem?: { update?: (ctx: { shouldSkipGpuRender?: boolean }) => void } | null;
    };
    mutableRuntime.setupAudio = async () => {};
    mutableRuntime.setupBot = async () => {};
    this.targetView.stop?.();
    if (mutableRuntime.renderSubsystem) {
      mutableRuntime.renderSubsystem.update = (ctx) => {
        ctx.shouldSkipGpuRender = true;
      };
    }

    const extraSimTicks = Math.max(3, 3 * this.cfg.speedMultiplier);
    let syntheticNow = performance.now();
    this.speedTimerId = setInterval(() => {
      for (let i = 0; i < extraSimTicks; i++) {
        syntheticNow += 1000 / 120;
        try {
          this.targetView.pipeline?.executeSimulationOnly?.(syntheticNow);
        } catch (err) {
          console.error(err);
        }
      }
      syntheticNow += 1000 / 120;
      try {
        this.targetView.renderFrame?.(syntheticNow);
      } catch (err) {
        console.error(err);
      }
    }, 33);
  }

  public async run(): Promise<ReproRoleSummaryReport> {
    const role = this.cfg.role ?? 'host';
    installReproConsoleAndErrorInterceptors(
      role,
      this.cfg.rosterMode,
      () => this.elapsedMs(),
      this.logState
    );
    this.configureHeadlessPacing();

    try {
      if (this.cfg.role === 'host') {
        await this.runHostFlow();
      } else if (this.cfg.role === 'client') {
        await this.runClientFlow();
      }
    } finally {
      if (this.speedTimerId !== null) {
        clearInterval(this.speedTimerId);
        this.speedTimerId = null;
      }
    }

    const handshakeDiagnostics = inspectChannelHandshakeDiagnostics(this.targetView, role);
    emitReproStreamEvent({
      type: 'handshake_probe',
      role,
      rosterMode: this.cfg.rosterMode,
      elapsedMs: this.elapsedMs(),
      diagnostics: handshakeDiagnostics,
    });

    const finalMatchMode = String(this.targetView.match?.state?.mode ?? 'unknown');
    const finalMatchPhase = String(this.targetView.match?.state?.phase ?? 'unknown');
    const enteredMatch =
      finalMatchMode === 'standard' ||
      finalMatchMode === 'match' ||
      finalMatchPhase === 'countdown' ||
      finalMatchPhase === 'kickoff';

    const summary: ReproRoleSummaryReport = {
      role,
      peerIndex: this.cfg.peerIndex,
      rosterMode: this.cfg.rosterMode,
      roomCode: this.cfg.roomCode,
      speedMultiplier: this.cfg.speedMultiplier,
      elapsedMs: this.elapsedMs(),
      reconcilerSnapLogCount: this.logState.reconcilerSnapLogCount,
      inputStarvationLogCount: this.logState.inputStarvationLogCount,
      readonlyRttTypeErrorCount: this.logState.readonlyRttTypeErrorCount,
      enteredMatch,
      finalMatchMode,
      finalMatchPhase,
      rawCrossTabJoinedBeforeBridge: this.rawCrossTabJoinedBeforeBridge,
      bridgedDataChannelOpened: this.logState.bridgedDataChannelOpened,
      handshakeDiagnostics,
      lobbyProbeDiagnostics: this.lobbyProbeDiagnostics,
      rosterVisibilityProbes: this.rosterVisibilityProbes,
      hostTakeoverDiagnostics: this.hostTakeoverDiagnostics,
      trajectoryDiagnostics: this.trajectoryDiagnostics,
      poseProbes: this.poseProbes,
      reconcilerSamples: this.logState.reconcilerSamples,
      starvationSamples: this.logState.starvationSamples,
      caughtErrors: this.logState.caughtErrors,
    };

    emitReproStreamEvent({ type: 'role_summary', summary });
    return summary;
  }

  private async runHostFlow(): Promise<void> {
    this.logLifecycle(
      `Starting Host flow (mode=${this.cfg.rosterMode}, room=${this.cfg.roomCode}, speed=${this.cfg.speedMultiplier}x)`
    );
    await sleepMs(250);
    this.recordPoseProbe('host_before_warmup');

    const bridgeChannel = new BroadcastChannel(`rc_repro_bridge_${this.cfg.roomCode}`);
    let pendingClientAnswerToken: string | null = null;
    let clientJoinedSignalReceived = false;
    bridgeChannel.onmessage = (ev: MessageEvent) => {
      const data = ev.data as { type?: string; answerToken?: string } | null;
      if (data?.type === 'client_answer_ready' && typeof data.answerToken === 'string') {
        pendingClientAnswerToken = data.answerToken;
      } else if (data?.type === 'client_joined_lobby') {
        clientJoinedSignalReceived = true;
      }
    };

    const hostOk = await this.targetView.matchPort?.hostOnlineWarmup?.({
      roomId: this.cfg.roomCode,
      playerName: 'HostRepro',
      gameMode: this.cfg.rosterMode === '2p' ? '1v1' : '3v3',
      botFillMode: this.cfg.rosterMode === '2p' ? 'empty' : 'auto_fill',
      durationSeconds: 90,
      lobbyMode: true,
    });
    const offerToken = this.targetView.multiplayerSession?.hostController?.offerToken || '';
    this.logLifecycle(
      `hostOnlineWarmup completed: success=${Boolean(hostOk)}, offerLen=${offerToken.length}`
    );

    this.recordPoseProbe('host_after_warmup_0ms');
    await sleepMs(600);

    // Phenomenon C: Spawn Host's Lobby diagnostic probes (#6 & #7) and sample their name tags & visibility
    await this.targetView.networkManager?.diagnosticsProbe?.spawnDiagnosticTestFleet?.();
    await sleepMs(400);
    this.recordLobbyProbeDiagnostics();
    this.recordPoseProbe('host_lobby_1500ms');

    if (typeof window !== 'undefined') {
      const clientUrl = new URL(window.location.href);
      clientUrl.searchParams.set('reproRole', 'client');
      clientUrl.searchParams.set('reproPeerIdx', '1');
      window.open(clientUrl.toString(), '_blank');
      this.logLifecycle('Opened Client tab via window.open');
    }

    for (let i = 0; i < 40; i++) {
      const diagNow = inspectChannelHandshakeDiagnostics(this.targetView, 'host');
      if (
        pendingClientAnswerToken ||
        clientJoinedSignalReceived ||
        diagNow.isCrossTab ||
        diagNow.hostRegisteredClientPeers > 0
      ) {
        break;
      }
      await sleepMs(200);
    }
    await sleepMs(400);

    const preBridgeDiag = inspectChannelHandshakeDiagnostics(this.targetView, 'host');
    this.rawCrossTabJoinedBeforeBridge =
      preBridgeDiag.isCrossTab || preBridgeDiag.hostRegisteredClientPeers > 0;
    this.logLifecycle(
      `Pre-bridge Host channel state: hasOwnIsHost=${preBridgeDiag.hasOwnIsHostProperty}, isHost=${String(preBridgeDiag.channelIsHostValue)}, isCrossTab=${preBridgeDiag.isCrossTab}, peers=${preBridgeDiag.hostRegisteredClientPeers}`
    );

    if (this.cfg.bridgeSignalingAfterProbe && !this.rawCrossTabJoinedBeforeBridge) {
      const sigChan = this.targetView.multiplayerSession?.hostController?.channel as
        | (ReproInspectableWebRtcChannel & {
            handshake?: { handleRoomMessage?: (msg: unknown) => void };
          })
        | null
        | undefined;
      if (sigChan) {
        if (pendingClientAnswerToken && sigChan.acceptAnswerToken) {
          const applied = await sigChan.acceptAnswerToken(pendingClientAnswerToken);
          this.logLifecycle(`Applied Client WebRTC answer token via bridge: applied=${applied}`);
        }
        sigChan.handshake?.handleRoomMessage?.({
          type: 'cross_tab_join',
          clientName: 'Player2727',
          clientColorSlot: 5,
          clientColorHex: '#ff7043',
        });
        await sleepMs(250);
      }
    }

    // Give Client 1200ms in Lobby to sample Phenomenon C before Host starts match
    await sleepMs(1200);

    this.recordRosterVisibilityProbe('host_lobby_with_client');

    await sleepMs(150);
    this.targetView.matchPort?.forceStartOnlineMatch?.(90);
    bridgeChannel.postMessage({ type: 'host_match_started' });
    this.logLifecycle('Invoked forceStartOnlineMatch(90)');

    await sleepMs(250);
    this.recordPoseProbe('host_match_start_250ms');
    this.recordRosterVisibilityProbe('host_match_start_250ms');

    await sleepMs(1200);
    this.recordPoseProbe('host_match_running_1450ms');
    this.recordRosterVisibilityProbe('host_match_running_1450ms');

    // Phenomenon D: Sample BallTrajectoryPredictor online reconciliation resets during mid-air flight
    this.trajectoryDiagnostics = await probeBallTrajectoryPredictorOnlineResets(
      this.targetView,
      'host',
      this.cfg.rosterMode,
      () => this.elapsedMs()
    );
    emitReproStreamEvent({ type: 'trajectory_diag', summary: this.trajectoryDiagnostics });

    // Phenomenon B: Trigger Goal Replay Director session and observe Car 1..4 generic name overwrite
    triggerGoalReplayNameTagCorruptionRepro(this.targetView);
    this.recordRosterVisibilityProbe('host_after_goal_replay_director');

    // Phenomenon A: Probe Host forced takeover in 3p3ai (auto_fill) vs 2p (1v1)
    this.hostTakeoverDiagnostics = await probeHostTakeoverPhenomenon(
      this.targetView,
      this.cfg.rosterMode,
      this.elapsedMs()
    );
    emitReproStreamEvent({ type: 'host_takeover_diag', diag: this.hostTakeoverDiagnostics });

    bridgeChannel.postMessage({ type: 'host_probes_complete' });
    bridgeChannel.close();
  }

  private async runClientFlow(): Promise<void> {
    this.logLifecycle(
      `Starting Client #${this.cfg.peerIndex} flow (mode=${this.cfg.rosterMode}, room=${this.cfg.roomCode})`
    );
    await sleepMs(250);
    this.recordPoseProbe('client_before_join');

    const bridgeChannel = new BroadcastChannel(`rc_repro_bridge_${this.cfg.roomCode}`);
    let hostMatchStarted = false;
    let hostProbesComplete = false;
    bridgeChannel.onmessage = (ev: MessageEvent) => {
      const data = ev.data as { type?: string } | null;
      if (data?.type === 'host_match_started') {
        hostMatchStarted = true;
      } else if (data?.type === 'host_probes_complete') {
        hostProbesComplete = true;
      }
    };

    void this.targetView.matchPort
      ?.joinOnlineWarmup?.({
        roomId: this.cfg.roomCode,
        playerName: 'Player2727',
      })
      .catch(() => {});

    let answerToken = '';
    for (let i = 0; i < 20; i++) {
      const clientCtrl = this.targetView.multiplayerSession?.clientJoinNegotiator?.clientController;
      answerToken = clientCtrl?.channel?.answerToken || clientCtrl?.answerToken || '';
      const isCrossTab = Boolean(clientCtrl?.channel?.isCrossTab);
      if (answerToken || isCrossTab) break;
      await sleepMs(150);
    }

    bridgeChannel.postMessage({
      type: answerToken ? 'client_answer_ready' : 'client_joined_lobby',
      answerToken,
    });
    this.logLifecycle(`Client joined lobby (answerLen=${answerToken.length})`);

    await sleepMs(800);
    this.recordPoseProbe('client_after_join_600ms');

    // Phenomenon C on Client: Sample whether Client can see Host's Lobby diagnostic probes (#6 & #7)
    this.recordLobbyProbeDiagnostics();
    this.recordRosterVisibilityProbe('client_lobby_after_join');
    bridgeChannel.postMessage({ type: 'client_lobby_sampled_ready' });

    // Wait for Host to start the match
    for (let i = 0; i < 40; i++) {
      const modeNow = String(this.targetView.match?.state?.mode ?? '');
      if (hostMatchStarted || modeNow === 'match') break;
      await sleepMs(150);
    }

    await sleepMs(600);
    this.recordPoseProbe('client_match_active_600ms');
    this.recordRosterVisibilityProbe('client_match_active_600ms');

    for (let i = 0; i < 30; i++) {
      if (hostProbesComplete) break;
      await sleepMs(150);
    }
    this.recordPoseProbe('client_final_state');
    this.recordRosterVisibilityProbe('client_final_state');
    bridgeChannel.close();
  }
}

export function startMultiplayerRoomReproIfRequested(targetView: unknown): void {
  const cfg = parseMultiplayerRoomReproUrlConfig();
  if (!cfg.role) return;

  const mutableRuntime = targetView as {
    setupAudio?: () => Promise<void>;
    setupBot?: () => Promise<void>;
  };
  mutableRuntime.setupAudio = async () => {};
  mutableRuntime.setupBot = async () => {};

  const agent = new MultiplayerRoomReproAgent(targetView as ReproProbeRuntimeView, cfg);
  void agent.run();
}
