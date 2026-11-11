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
    await sleepMs(1500);
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
    await sleepMs(1000);

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

    await sleepMs(750);
    if (this.cfg.rosterMode === '3p3ai') {
      await ensureExperimentalEngine('ducky');
    }

    this.targetView.matchPort?.forceStartOnlineMatch?.(90);
    this.logLifecycle('Invoked forceStartOnlineMatch(90)');

    await sleepMs(250);
    this.recordPoseProbe('host_match_start_250ms');
    await sleepMs(3500);
    this.recordPoseProbe('host_match_running_3750ms');
    bridgeChannel.close();
  }

  private async runClientFlow(): Promise<void> {
    this.logLifecycle(
      `Starting Client #${this.cfg.peerIndex} flow (mode=${this.cfg.rosterMode}, room=${this.cfg.roomCode})`
    );
    await sleepMs(250);
    this.recordPoseProbe('client_before_join');

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
      const bridgeChannel = new BroadcastChannel(`rc_repro_bridge_${this.cfg.roomCode}`);
      bridgeChannel.postMessage({
        type: 'client_answer_ready',
        answerToken,
      });
      bridgeChannel.close();
    }

    await sleepMs(500);
    this.recordPoseProbe('client_after_join_500ms');
    await sleepMs(2500);
    this.recordPoseProbe('client_poll_3000ms');
    await sleepMs(4500);
    this.recordPoseProbe('client_poll_7500ms');
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
