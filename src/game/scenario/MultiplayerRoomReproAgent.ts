/**
 * MultiplayerRoomReproAgent.ts
 * Browser-side multi-tab reproduction controller for Multiplayer Host-a-Room and
 * Join-a-Room flows (?reproRole=host|client&reproMode=2p|2p2ai|3p3ai&reproSpeed=1..8).
 * Supports selective stage/probe execution (?reproProbes=all|<comma-list>),
 * variable physics step rates (?reproPhysicsHz=60,90,100,120,144), and simulated
 * network latency/bandwidth (?reproLatencyMs=50&reproBandwidthKbps=512).
 */

import { executeReproClientFlow } from './multiplayerRoomReproClientFlowPipeline.ts';
import type {
  ReproGoalReplayKickoffFreezeDiagnosticSnapshot,
  ReproLobbyGoalResetDiagnosticSnapshot,
  ReproNetworkLatencyHudDiagnosticSnapshot,
  ReproPhysicsRateSweepDiagnosticSnapshot,
  ReproProbeId,
  ReproProbeRuntimeView,
} from './multiplayerRoomReproEdgeCaseTypes.ts';
import {
  executeReproHostFlow,
  type ReproHostFlowContext,
} from './multiplayerRoomReproHostFlowPipeline.ts';
import {
  createReproLogInterceptorState,
  installReproConsoleAndErrorInterceptors,
  type ReproLogInterceptorState,
} from './multiplayerRoomReproLogInterceptor.ts';
import {
  createTrajectoryObservationTracker,
  sampleLobbyDiagnosticProbes,
  sampleRosterVisibilityAndNameTags,
  startHeadlessReproPacingLoop,
  type ReproHeadlessPacingController,
  type ReproTrajectoryWindowTracker,
} from './multiplayerRoomReproPhenomenaPipeline.ts';
import {
  emitReproStreamEvent,
  inspectChannelHandshakeDiagnostics,
  parseMultiplayerRoomReproUrlConfig,
  sampleSimAndMeshVehiclePose,
  shouldRunReproProbe,
} from './multiplayerRoomReproProbePipeline.ts';
import type {
  ReproHostTakeoverDiagnosticSnapshot,
  ReproLobbyProbeDiagnosticSnapshot,
  ReproPoseProbeSnapshot,
  ReproRoleSummaryReport,
  ReproRosterVisibilityAndNameTagSnapshot,
  ReproTrajectoryPredictorDiagnosticSummary,
  ReproUrlConfig,
} from './multiplayerRoomReproTypes.ts';

export class MultiplayerRoomReproAgent {
  private readonly targetView: ReproProbeRuntimeView;
  private readonly cfg: ReproUrlConfig;
  private readonly startTimeMs = performance.now();
  private readonly poseProbes: ReproPoseProbeSnapshot[] = [];
  private readonly rosterVisibilityProbes: ReproRosterVisibilityAndNameTagSnapshot[] = [];
  private lobbyProbeDiagnostics: ReproLobbyProbeDiagnosticSnapshot | null = null;
  private lobbyGoalResetDiagnostics: ReproLobbyGoalResetDiagnosticSnapshot | null = null;
  private networkLatencyHudDiagnostics: ReproNetworkLatencyHudDiagnosticSnapshot | null = null;
  private hostTakeoverDiagnostics: ReproHostTakeoverDiagnosticSnapshot | null = null;
  private trajectoryDiagnostics: ReproTrajectoryPredictorDiagnosticSummary | null = null;
  private goalReplayKickoffDiagnostics: ReproGoalReplayKickoffFreezeDiagnosticSnapshot | null =
    null;
  private physicsRateSweepDiagnostics: ReproPhysicsRateSweepDiagnosticSnapshot | null = null;
  private readonly logState: ReproLogInterceptorState = createReproLogInterceptorState();
  private readonly trajTracker: ReproTrajectoryWindowTracker;
  private rawCrossTabJoinedBeforeBridge = false;
  private kickoffFallbackWarnCount = 0;
  private pacingCtrl: ReproHeadlessPacingController | null = null;

  constructor(targetView: ReproProbeRuntimeView, cfg: ReproUrlConfig) {
    this.targetView = targetView;
    this.cfg = cfg;
    this.trajTracker = createTrajectoryObservationTracker(targetView);
  }

  private elapsedMs(): number {
    return Math.round(performance.now() - this.startTimeMs);
  }

  private hasProbe(probeId: ReproProbeId): boolean {
    return shouldRunReproProbe(this.cfg, probeId);
  }

  private logLifecycle(message: string): void {
    const role = this.cfg.role ?? 'host';
    emitReproStreamEvent({
      type: 'lifecycle',
      role,
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
      this.trajTracker.getWindowSnapshot()
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

  private buildFlowContext(): ReproHostFlowContext {
    return {
      targetView: this.targetView,
      cfg: this.cfg,
      trajTracker: this.trajTracker,
      pacingCtrl: this.pacingCtrl,
      hasProbe: (id) => this.hasProbe(id),
      elapsedMs: () => this.elapsedMs(),
      getSnapCount: () => this.logState.reconcilerSnapLogCount,
      getStarvationCount: () => this.logState.inputStarvationLogCount,
      getFallbackWarnCount: () => this.kickoffFallbackWarnCount,
      logLifecycle: (msg) => this.logLifecycle(msg),
      recordPoseProbe: (stage) => {
        this.recordPoseProbe(stage);
      },
      recordRosterVisibilityProbe: (stage) => {
        this.recordRosterVisibilityProbe(stage);
      },
      recordLobbyProbeDiagnostics: () => {
        this.recordLobbyProbeDiagnostics();
      },
      setRawCrossTabJoinedBeforeBridge: (joined) => {
        this.rawCrossTabJoinedBeforeBridge = joined;
      },
      setLobbyGoalResetDiagnostics: (d) => {
        this.lobbyGoalResetDiagnostics = d;
      },
      setNetworkLatencyHudDiagnostics: (d) => {
        this.networkLatencyHudDiagnostics = d;
      },
      setHostTakeoverDiagnostics: (d) => {
        this.hostTakeoverDiagnostics = d;
      },
      setTrajectoryDiagnostics: (s) => {
        this.trajectoryDiagnostics = s;
      },
      setPhysicsRateSweepDiagnostics: (d) => {
        this.physicsRateSweepDiagnostics = d;
      },
      setGoalReplayKickoffDiagnostics: (d) => {
        this.goalReplayKickoffDiagnostics = d;
      },
    };
  }

  public async run(): Promise<ReproRoleSummaryReport> {
    const role = this.cfg.role ?? 'host';
    installReproConsoleAndErrorInterceptors(
      role,
      this.cfg.rosterMode,
      () => this.elapsedMs(),
      this.logState
    );
    const origWarn = console.warn.bind(console);
    console.warn = (...args: unknown[]) => {
      origWarn(...args);
      if (args.map(String).join(' ').includes('[GameAudioSubsystem:Fallback]')) {
        this.kickoffFallbackWarnCount++;
      }
    };

    this.pacingCtrl = startHeadlessReproPacingLoop(this.targetView, this.cfg.speedMultiplier, () =>
      this.trajTracker.stepAndObserve()
    );

    try {
      const flowCtx = this.buildFlowContext();
      if (this.cfg.role === 'host') {
        await executeReproHostFlow(flowCtx);
      } else if (this.cfg.role === 'client') {
        await executeReproClientFlow(flowCtx);
      }
    } finally {
      this.pacingCtrl?.stop();
      this.pacingCtrl = null;
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
      kickoffFallbackWarnCount: this.kickoffFallbackWarnCount,
      enteredMatch,
      finalMatchMode,
      finalMatchPhase,
      rawCrossTabJoinedBeforeBridge: this.rawCrossTabJoinedBeforeBridge,
      bridgedDataChannelOpened: this.logState.bridgedDataChannelOpened,
      handshakeDiagnostics,
      lobbyProbeDiagnostics: this.lobbyProbeDiagnostics,
      lobbyGoalResetDiagnostics: this.lobbyGoalResetDiagnostics,
      networkLatencyHudDiagnostics: this.networkLatencyHudDiagnostics,
      rosterVisibilityProbes: this.rosterVisibilityProbes,
      hostTakeoverDiagnostics: this.hostTakeoverDiagnostics,
      trajectoryDiagnostics: this.trajectoryDiagnostics,
      goalReplayKickoffDiagnostics: this.goalReplayKickoffDiagnostics,
      physicsRateSweepDiagnostics: this.physicsRateSweepDiagnostics,
      poseProbes: this.poseProbes,
      reconcilerSamples: this.logState.reconcilerSamples,
      starvationSamples: this.logState.starvationSamples,
      caughtErrors: this.logState.caughtErrors,
    };

    emitReproStreamEvent({ type: 'role_summary', summary });
    return summary;
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
