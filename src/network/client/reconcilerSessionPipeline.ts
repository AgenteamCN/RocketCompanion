/**
 * reconcilerSessionPipeline.ts
 * Pure session state & packet preparation pipeline for PredictionReconciler:
 * session interface contract, timeline reset, tolerance clamping, local step commit,
 * and inbound server packet draining/replay-mode handling.
 */

import type {
  CarControls,
  PredictionHistoryBuffer,
  ReconciliationTolerances,
} from './PredictionHistoryBuffer.ts';
import type { VisualErrorSmoother } from './VisualErrorSmoother.ts';
import type { NetworkTelemetryCollector } from './NetworkTelemetryCollector.ts';
import type {
  HandshakeResponsePayload,
  PredictionReconcilerOptions,
  ReconcilerMetrics,
  RosterStatePayload,
  TelemetryChannelPort,
  TelemetrySimPort,
} from './ReconcilerMetricsModel.ts';
import type {
  ClientClockPacingController,
  ClockPacingInterpolatorPort,
} from './ClientClockPacingController.ts';
import type {
  OutboundRedundantInputConfig,
  ParsedReconcilerPacket,
  ReconcilerControlMessenger,
} from './ReconcilerControlMessenger.ts';
import type { MatchSignalDescriptor } from '../protocol/GlobalPayloadCodec.ts';
import {
  createBoostPadEdgeTracker,
  type BoostPadEdgeTracker,
} from '../protocol/boostPadBitmaskPipeline.ts';
import type { RollbackStepState } from './reconcilerRollbackPipeline.ts';

export type ReconcilerSignalsCallback = (
  signals: MatchSignalDescriptor[],
  packetServerTick?: number | null
) => void;
export type ReconcilerMessageCallback<T = Record<string, unknown>> = (msg: T) => void;
export type ReconcilerHardResyncCallback = () => void;

export interface ReconcileSessionTarget extends RollbackStepState {
  sim: TelemetrySimPort;
  channel: TelemetryChannelPort | null | undefined;
  options: PredictionReconcilerOptions;
  historyBuffer: PredictionHistoryBuffer;
  visualSmoother: VisualErrorSmoother;
  pacingController: ClientClockPacingController;
  telemetryCollector: NetworkTelemetryCollector;
  controlMessenger: ReconcilerControlMessenger;
  interpolator: ClockPacingInterpolatorPort | null;
  metrics: ReconcilerMetrics;
  boostPadEdgeTracker: BoostPadEdgeTracker;
  localCarIndex: number;
  lobbyDualWorldMode: boolean;
  hostLobbyMode: boolean;
  replayPlaybackMode: boolean;
  kickoffMaskUntilTick: number;
  redundantHistoryCount: number;
  enableRedundantInputs: boolean;
  useBitPacking: boolean;
  redundantHistoryTicks: number;
  tickDtMs: number;
  neutralControls: Readonly<CarControls>;
  posTolerance: number;
  velTolerance: number;
  rotTolerance: number;
  ballPosTolerance: number;
  ballVelTolerance: number;
  boostTolerance: number;
  hardSnapThreshold: number;
  carVisualPresets: Map<number, string>;
  lobbyPrevAuthoritativeState: Float32Array | null;
  lobbyCurrAuthoritativeState: Float32Array | null;
  onSignals: ReconcilerSignalsCallback | null;
  onRosterUpdate: ReconcilerMessageCallback<RosterStatePayload> | null;
  onHandshakeResponse: ReconcilerMessageCallback<HandshakeResponsePayload> | null;
  onHardResync: ReconcilerHardResyncCallback | null;
  onMetricsUpdated: ((metrics: ReconcilerMetrics) => void) | null;
  setLobbyDualWorldMode(enabled: boolean): void;
  getReconciliationTolerances(): ReconciliationTolerances;
  getOutboundRedundantConfig(): OutboundRedundantInputConfig;
  _resolveEffectiveRtt(): number;
  syncTimeline(serverSnapshot: Float32Array | null, serverTick?: number, nowMs?: number): void;
  notifyMetricsUpdated(): void;
}

export interface ResolvedInitialReconcilerConfig {
  readonly localCarIndex: number;
  readonly redundantHistoryCount: number;
  readonly useBitPacking: boolean;
  readonly initTick: number;
  readonly posTolerance: number;
  readonly velTolerance: number;
  readonly rotTolerance: number;
  readonly ballPosTolerance: number;
  readonly ballVelTolerance: number;
  readonly boostTolerance: number;
  readonly hardSnapThreshold: number;
  readonly enableRedundantInputs: boolean;
  readonly redundantHistoryTicks: number;
  readonly interpolator: ClockPacingInterpolatorPort | null;
  readonly lobbyDualWorldMode: boolean;
  readonly hostLobbyMode: boolean;
  readonly resetTelemetryOnStart: boolean;
  readonly onHardResync: ReconcilerHardResyncCallback | null;
}

export function resolveInitialReconcilerConfig(
  opts: PredictionReconcilerOptions,
  currentSimTick: number,
  isChannelLoopback: boolean
): ResolvedInitialReconcilerConfig {
  const initTick = Math.max(-1, Math.floor(currentSimTick || 0) - 1);
  const lobbyDualWorldMode = Boolean(opts.lobbyDualWorldMode);
  return {
    localCarIndex: opts.localCarIndex ?? 0,
    redundantHistoryCount: opts.redundantHistoryCount ?? (opts.enableRedundantBuffer ? 10 : 1),
    useBitPacking: opts.useBitPacking ?? false,
    initTick,
    posTolerance: opts.posTolerance ?? 0.5,
    velTolerance: opts.velTolerance ?? 5.0,
    rotTolerance: opts.rotTolerance ?? 0.015,
    ballPosTolerance: opts.ballPosTolerance ?? 1.0,
    ballVelTolerance: opts.ballVelTolerance ?? 10.0,
    boostTolerance: opts.boostTolerance ?? 1.0,
    hardSnapThreshold: opts.hardSnapThreshold ?? 500.0,
    enableRedundantInputs: opts.enableRedundantInputs ?? false,
    redundantHistoryTicks: opts.redundantHistoryTicks ?? 12,
    interpolator: opts.interpolator || null,
    lobbyDualWorldMode,
    hostLobbyMode: Boolean(opts.hostLobbyMode ?? (isChannelLoopback && !lobbyDualWorldMode)),
    resetTelemetryOnStart: opts.resetTelemetryOnStart !== false,
    onHardResync: opts.onHardResync || null,
  };
}

export function resolveClampedReconciliationTolerances(
  current: ReconciliationTolerances,
  patch: Partial<ReconciliationTolerances> = {}
): ReconciliationTolerances {
  const nonNeg = (v: number | undefined, cur: number) =>
    typeof v === 'number' && Number.isFinite(v) && v >= 0 ? v : cur;
  const hardSnapThreshold =
    typeof patch.hardSnapThreshold === 'number' &&
    Number.isFinite(patch.hardSnapThreshold) &&
    patch.hardSnapThreshold > 0
      ? patch.hardSnapThreshold
      : current.hardSnapThreshold;
  return {
    posTolerance: nonNeg(patch.posTolerance, current.posTolerance),
    velTolerance: nonNeg(patch.velTolerance, current.velTolerance),
    rotTolerance: nonNeg(patch.rotTolerance, current.rotTolerance),
    ballPosTolerance: nonNeg(patch.ballPosTolerance, current.ballPosTolerance),
    ballVelTolerance: nonNeg(patch.ballVelTolerance, current.ballVelTolerance),
    boostTolerance: current.boostTolerance,
    hardSnapThreshold,
  };
}

export function commitPredictedLocalStep(
  session: ReconcileSessionTarget,
  carIndex: number,
  controls: CarControls,
  nowMs = performance.now()
): { committed: CarControls; shouldNotifyMetrics: boolean } {
  const { sim, channel, historyBuffer, controlMessenger, localCarIndex, metrics } = session;
  const currentTick = Math.floor(sim.getHeaderView!().tickCount);
  const isKickoffMasked =
    session.kickoffMaskUntilTick > 0 && currentTick < session.kickoffMaskUntilTick;
  const committed = isKickoffMasked
    ? historyBuffer.setCarControls(currentTick, carIndex, session.neutralControls)
    : historyBuffer.getCarControls(currentTick, carIndex) ||
      historyBuffer.setCarControls(currentTick, carIndex, controls);
  if (carIndex === localCarIndex) historyBuffer.lastLocalControls = { ...committed };
  historyBuffer.clientInputRingBuffer.record(currentTick, carIndex, committed);
  controlMessenger.sendOutboundInputForTick(
    channel,
    historyBuffer,
    session.getOutboundRedundantConfig(),
    localCarIndex,
    currentTick,
    carIndex,
    committed,
    nowMs
  );
  sim.saveStateSlot(currentTick % 256);
  historyBuffer.saveTickSnapshot(currentTick, sim);
  metrics.applyClientPredictionStep(
    currentTick,
    session._resolveEffectiveRtt(),
    session.pacingController.leadTicks
  );
  return { committed, shouldNotifyMetrics: currentTick % 2 === 0 };
}

export function drainAndPrepareInboundSessionPacket(
  session: ReconcileSessionTarget,
  incomingPackets: unknown[],
  nowMs: number
): { packet: ParsedReconcilerPacket; effectiveRtt: number } | null {
  const packet = session.controlMessenger.drainAndParseServerPackets(
    {
      channel: session.channel,
      lobbyDualWorldMode: session.lobbyDualWorldMode,
      hostLobbyMode: session.hostLobbyMode,
      replayPlaybackMode: session.replayPlaybackMode,
      inputBufferTarget: session.pacingController.inputBufferTarget,
      metrics: session.metrics,
      boostPadEdgeTracker: session.boostPadEdgeTracker,
      isTimelineSynchronized: () => session.isTimelineSynchronized,
      onSignals: session.onSignals,
      onRosterUpdate: session.onRosterUpdate,
      onHandshakeResponse: session.onHandshakeResponse,
      setLocalCarIndex: (id) => {
        session.localCarIndex = id;
      },
      setLobbyDualWorldMode: (en) => session.setLobbyDualWorldMode(en),
      setLobbyAuthoritativeSnapshots: (prev, curr) => {
        session.lobbyPrevAuthoritativeState = prev;
        session.lobbyCurrAuthoritativeState = curr;
      },
      syncTimelineFromHandshake: (snap, frame, ts) => {
        session.syncTimeline(snap, frame, ts);
        session.interpolator?.sync?.(ts);
      },
    },
    incomingPackets,
    nowMs
  );
  session.lastServerRecordedInputTick = session.controlMessenger.lastServerRecordedInputTick;
  if (!packet) return null;

  const serverTick = packet.serverTick;
  if (!session.replayPlaybackMode && serverTick <= session.lastAckedServerTick && serverTick > 0) {
    return null;
  }

  session.controlMessenger.recordLatestParsedPacket(packet);
  const lobbySnaps = session.controlMessenger.updateLobbyAuthoritativeSnapshots(
    session.lobbyDualWorldMode,
    packet,
    session.lobbyPrevAuthoritativeState,
    session.lobbyCurrAuthoritativeState
  );
  session.lobbyPrevAuthoritativeState = lobbySnaps.prev;
  session.lobbyCurrAuthoritativeState = lobbySnaps.curr;

  const effectiveRtt = session._resolveEffectiveRtt();
  if (session.replayPlaybackMode) {
    session.lastAckedServerTick = serverTick;
    session.metrics.applyServerAck(serverTick, effectiveRtt);
    session.historyBuffer.recordAcknowledgedRemoteControls(
      packet.acknowledgedControls,
      session.localCarIndex
    );
    session.notifyMetricsUpdated();
    return null;
  }

  return { packet, effectiveRtt };
}
