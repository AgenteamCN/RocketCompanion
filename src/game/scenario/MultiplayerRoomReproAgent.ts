/**
 * MultiplayerRoomReproAgent.ts
 * Browser-side multi-tab reproduction controller for Multiplayer Host-a-Room and
 * Join-a-Room flows (?reproRole=host|client&reproMode=2p|3p3ai&reproSpeed=1..8).
 * Exercises the real AuthoritativeServerWorker Web Worker, P2PWebRTCChannel,
 * CrossTabSignaling, and PredictionReconciler while streaming telemetry to
 * /__rc_repro_stream.
 */

import { ensureExperimentalEngine } from '../../ai/experimental/ExperimentalBotAgent.ts';
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
import type {
  ReproPoseProbeSnapshot,
  ReproRoleSummaryReport,
  ReproUrlConfig,
} from './multiplayerRoomReproTypes.ts';

const sleepMs = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

export class MultiplayerRoomReproAgent {
  private readonly targetView: ReproProbeRuntimeView;
  private readonly cfg: ReproUrlConfig;
  private readonly startTimeMs = performance.now();
  private readonly poseProbes: ReproPoseProbeSnapshot[] = [];
  private readonly logState: ReproLogInterceptorState = createReproLogInterceptorState();
  private rawCrossTabJoinedBeforeBridge = false;
  private speedTimerId: ReturnType<typeof setInterval> | null = null;
  private trajectoryTrackingActive = false;
  private maxObservedPredictionCount = 0;
  private prevObservedPredictionCount = 0;
  private collapseToCatchupCount = 0;

  constructor(targetView: ReproProbeRuntimeView, cfg: ReproUrlConfig) {
    this.targetView = targetView;
    this.cfg = cfg;
  }

  private elapsedMs(): number {
    return Math.round(performance.now() - this.startTimeMs);
  }

  private resetTrajectoryWindow(active: boolean): void {
    this.trajectoryTrackingActive = active;
    this.maxObservedPredictionCount = 0;
    this.prevObservedPredictionCount = 0;
    this.collapseToCatchupCount = 0;
  }

  private stepBallTrajectoryPredictorAndObserve(): void {
    const sim = this.targetView.physics?.sim ?? this.targetView.physics;
    const btp = this.targetView.ballTrajectoryPredictor;
    if (!sim || !btp?.update) return;
    const curTick = sim.getHeaderView?.()?.tickCount ?? 0;
    btp.update(curTick, this.targetView.arena?.ball?.position, 1280, 720, this.targetView.physics);
    if (!this.trajectoryTrackingActive) return;

    const bv = sim.getBallStateView?.();
    const ballZ = bv?.posZ ?? 0;
    const ballSpeed = Math.hypot(bv?.velX ?? 0, bv?.velY ?? 0, bv?.velZ ?? 0);
    const count = Number(btp.predictionCount ?? 0);
    const sampler = (btp as { sampler?: Record<string, unknown> }).sampler;
    const isCarHitReset = sampler?.lastUpdateKind === 'full-car-hit';
    if (ballZ > 110 && ballSpeed > 100) {
      if (this.prevObservedPredictionCount >= 20 && count > 0 && count <= 5 && !isCarHitReset) {
        this.collapseToCatchupCount++;
      }
      if (count > this.maxObservedPredictionCount) {
        this.maxObservedPredictionCount = count;
      }
      this.prevObservedPredictionCount = count;
    }
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
      this.elapsedMs(),
      {
        maxObservedPredictionCount: this.maxObservedPredictionCount,
        collapseToCatchupCount: this.collapseToCatchupCount,
      }
    );
    this.poseProbes.push(probe);
    emitReproStreamEvent({ type: 'pose_probe', probe });
    return probe;
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

    const extraSimTicks = 3;
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
        this.stepBallTrajectoryPredictorAndObserve();
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
      finalMatchPhase === 'kickoff' ||
      finalMatchPhase === 'playing';

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
    bridgeChannel.onmessage = (ev: MessageEvent) => {
      const data = ev.data as { type?: string; answerToken?: string } | null;
      if (data?.type === 'client_answer_ready' && typeof data.answerToken === 'string') {
        pendingClientAnswerToken = data.answerToken;
      }
    };

    const gameMode =
      this.cfg.rosterMode === '2p' ? '1v1' : this.cfg.rosterMode === '2p2ai' ? '2v2' : '3v3';
    const hostOk = await this.targetView.matchPort?.hostOnlineWarmup?.({
      roomId: this.cfg.roomCode,
      playerName: 'HostRepro',
      gameMode,
      botFillMode: this.cfg.rosterMode === '2p' ? 'empty' : 'auto_fill',
      durationSeconds: 90,
      lobbyMode: true,
    });
    const offerToken = this.targetView.multiplayerSession?.hostController?.offerToken || '';
    this.logLifecycle(
      `hostOnlineWarmup completed: success=${Boolean(hostOk)}, offerLen=${offerToken.length}`
    );

    this.recordPoseProbe('host_after_warmup_0ms');
    await sleepMs(1000);
    this.recordPoseProbe('host_lobby_1500ms');

    if (typeof window !== 'undefined') {
      const clientUrl = new URL(window.location.href);
      clientUrl.searchParams.set('reproRole', 'client');
      clientUrl.searchParams.set('reproPeerIdx', '1');
      window.open(clientUrl.toString(), '_blank');
      this.logLifecycle('Opened Client tab via window.open');
    }

    for (let i = 0; i < 60; i++) {
      if (pendingClientAnswerToken) break;
      await sleepMs(250);
    }
    await sleepMs(500);

    const preBridgeDiag = inspectChannelHandshakeDiagnostics(this.targetView, 'host');
    this.rawCrossTabJoinedBeforeBridge =
      preBridgeDiag.isCrossTab || preBridgeDiag.hostRegisteredClientPeers > 0;
    this.logLifecycle(
      `Pre-bridge Host channel state: hasOwnIsHost=${preBridgeDiag.hasOwnIsHostProperty}, isHost=${String(preBridgeDiag.channelIsHostValue)}, isCrossTab=${preBridgeDiag.isCrossTab}, peers=${preBridgeDiag.hostRegisteredClientPeers}`
    );

    if (this.cfg.bridgeSignalingAfterProbe) {
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
        const postBridgePeers =
          this.targetView.multiplayerSession?.hostController?.getConnectedPeerList?.()?.length ?? 0;
        this.logLifecycle(
          `Post-bridge Host channel state: isCrossTab=${Boolean(sigChan.isCrossTab)}, registeredClientPeers=${postBridgePeers}`
        );
      }
    }

    // Allow Client to receive Lobby state + diagnostic probes #6/#7 before starting match
    await sleepMs(1000);
    bridgeChannel.postMessage({ type: 'host_lobby_settled' });
    await sleepMs(400);

    if (this.cfg.rosterMode !== '2p') {
      await ensureExperimentalEngine('ducky');
    }

    this.targetView.matchPort?.forceStartOnlineMatch?.(90);
    bridgeChannel.postMessage({ type: 'host_match_started' });
    this.logLifecycle('Invoked forceStartOnlineMatch(90)');

    await sleepMs(350);
    this.recordPoseProbe('host_match_start_250ms');

    // Wait for prepare + 480-tick (4.0s) kickoff countdown to transition to playing phase
    for (let i = 0; i < 40; i++) {
      if (this.targetView.match?.state?.phase === 'playing') break;
      await sleepMs(200);
    }
    await sleepMs(250);

    const airborneBallState = {
      pos: [0, 0, 950],
      vel: [180, 720, 420],
      angVel: [0, 0, 0],
    };
    this.targetView.networkManager?.sessionCoordinator?.authoritativeServer?.sim?.setBallState?.(
      airborneBallState
    );
    (this.targetView.physics?.sim ?? this.targetView.physics)?.setBallState?.(airborneBallState);
    this.resetTrajectoryWindow(true);
    bridgeChannel.postMessage({ type: 'host_ball_launched_in_playing' });

    await sleepMs(1400);
    this.recordPoseProbe('host_match_playing_trajectory');
    this.resetTrajectoryWindow(false);
    bridgeChannel.close();
  }

  private async runClientFlow(): Promise<void> {
    this.logLifecycle(
      `Starting Client #${this.cfg.peerIndex} flow (mode=${this.cfg.rosterMode}, room=${this.cfg.roomCode})`
    );
    await sleepMs(250);
    this.recordPoseProbe('client_before_join');

    const bridgeChannel = new BroadcastChannel(`rc_repro_bridge_${this.cfg.roomCode}`);
    let hostLobbySettled = false;
    let hostMatchStarted = false;
    let hostBallLaunched = false;
    bridgeChannel.onmessage = (ev: MessageEvent) => {
      const data = ev.data as { type?: string } | null;
      if (data?.type === 'host_lobby_settled') hostLobbySettled = true;
      if (data?.type === 'host_match_started') hostMatchStarted = true;
      if (data?.type === 'host_ball_launched_in_playing') hostBallLaunched = true;
    };

    void this.targetView.matchPort
      ?.joinOnlineWarmup?.({
        roomId: this.cfg.roomCode,
        playerName: 'Player2727',
      })
      .catch(() => {});

    let answerToken = '';
    for (let i = 0; i < 30; i++) {
      const clientCtrl = this.targetView.multiplayerSession?.clientJoinNegotiator?.clientController;
      answerToken = clientCtrl?.channel?.answerToken || clientCtrl?.answerToken || '';
      if (answerToken) break;
      await sleepMs(200);
    }

    this.logLifecycle(`Client answer generated: answerLen=${answerToken.length}`);

    if (answerToken) {
      bridgeChannel.postMessage({
        type: 'client_answer_ready',
        answerToken,
      });
    }

    for (let i = 0; i < 20; i++) {
      if (hostLobbySettled) break;
      await sleepMs(200);
    }
    this.recordPoseProbe('client_lobby_connected');

    for (let i = 0; i < 20; i++) {
      if (hostMatchStarted) break;
      await sleepMs(200);
    }
    await sleepMs(350);
    this.recordPoseProbe('client_match_countdown');

    for (let i = 0; i < 60; i++) {
      const sim = this.targetView.physics?.sim ?? this.targetView.physics;
      const ballZ = sim?.getBallStateView?.()?.posZ ?? 0;
      if (hostBallLaunched && this.targetView.match?.state?.phase === 'playing' && ballZ > 600) {
        break;
      }
      await sleepMs(100);
    }

    this.resetTrajectoryWindow(true);
    await sleepMs(1400);
    this.recordPoseProbe('client_match_playing_trajectory');
    this.resetTrajectoryWindow(false);
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
