/**
 * ReconcilerRollbackStepper.ts
 * Rollback step state pipeline, timeline synchronization, forward tick stepping,
 * and inbound packet reconciliation for PredictionReconciler.
 */

import type { CarControls, PredictionHistoryBuffer } from './PredictionHistoryBuffer.ts';
import { capturePreResimPositions } from './VisualErrorSmoother.ts';
import {
  recordReconcileTelemetryTick,
  syncClientCarTopology,
} from './NetworkTelemetryCollector.ts';
import type { TelemetrySimPort } from './ReconcilerMetricsModel.ts';
import type { ParsedReconcilerPacket } from './ReconcilerControlMessenger.ts';
import {
  executeReplayAndEvaluateCorrection,
  executeSyncTimelineStep,
  stepForwardRollbackTicks,
  type RollbackStepState,
  type RollbackStepperSyncInput,
  type RollbackStepperSyncOutput,
} from './reconcilerRollbackPipeline.ts';
import {
  drainAndPrepareInboundSessionPacket,
  type ReconcileSessionTarget,
  type ReconcilerHardResyncCallback,
  type ReconcilerMessageCallback,
  type ReconcilerSignalsCallback,
} from './reconcilerSessionPipeline.ts';

export type {
  ReconcileSessionTarget,
  ReconcilerHardResyncCallback,
  ReconcilerMessageCallback,
  ReconcilerSignalsCallback,
  RollbackStepState,
  RollbackStepperSyncInput,
  RollbackStepperSyncOutput,
};

export class ReconcilerRollbackStepper {
  stepForwardTicks(
    sim: TelemetrySimPort,
    historyBuffer: PredictionHistoryBuffer,
    fromTick: number,
    toTick: number,
    localCarIndex: number,
    kickoffMaskUntilTick: number,
    useSilentStep: boolean,
    isRedundant: boolean,
    nowMs: number,
    sendOutboundInput: (tick: number, controls: CarControls | null, nowMs: number) => void
  ): number {
    return stepForwardRollbackTicks(
      sim,
      historyBuffer,
      fromTick,
      toTick,
      localCarIndex,
      kickoffMaskUntilTick,
      useSilentStep,
      isRedundant,
      nowMs,
      sendOutboundInput
    );
  }

  executeSyncTimeline(input: RollbackStepperSyncInput): RollbackStepperSyncOutput {
    return executeSyncTimelineStep(input);
  }

  syncSessionTimeline(
    session: ReconcileSessionTarget,
    serverSnapshot: Float32Array | null,
    serverTick = 0,
    nowMs = performance.now()
  ): void {
    const targets = session.pacingController.evaluateTimelineTargets(
      session.channel,
      session.controlMessenger.baseMeasuredRtt,
      session.controlMessenger.measuredRtt,
      session.controlMessenger.hasServerReportedBuffer,
      session.metrics?.inputBufferSize,
      session._resolveEffectiveRtt()
    );
    session.pacingController.leadTicks = targets.leadTicks;
    const redundantConfig = session.getOutboundRedundantConfig();
    const syncOut = executeSyncTimelineStep({
      sim: session.sim,
      historyBuffer: session.historyBuffer,
      visualSmoother: session.visualSmoother,
      metrics: session.metrics,
      serverSnapshot,
      serverTick,
      nowMs,
      localCarIndex: session.localCarIndex,
      lobbyDualWorldMode: session.lobbyDualWorldMode,
      kickoffMaskUntilTick: session.kickoffMaskUntilTick,
      leadTicks: targets.leadTicks,
      downlinkTicks: targets.downlinkTicks,
      hardSnapCount: session.hardSnapCount,
      isRedundant: session.redundantHistoryCount > 1 || Boolean(session.enableRedundantInputs),
      sendOutboundInput: (t, ctrl, ts) =>
        session.controlMessenger.sendOutboundInputForTick(
          session.channel,
          session.historyBuffer,
          redundantConfig,
          session.localCarIndex,
          t,
          session.localCarIndex,
          ctrl,
          ts
        ),
    });
    session.lastServerRecordedInputTick = syncOut.lastServerRecordedInputTick;
    session.controlMessenger.lastServerRecordedInputTick = syncOut.lastServerRecordedInputTick;
    session.lastAckedServerTick = syncOut.lastAckedServerTick;
    session.isTimelineSynchronized = true;
    session.shouldSkipLocalStep = false;
    session.lastHardResyncTime = syncOut.lastHardResyncTime;
    session.hardSnapCount = syncOut.hardSnapCount;
    session.notifyMetricsUpdated();
  }

  private stepReconcilePacket(
    session: ReconcileSessionTarget,
    packet: ParsedReconcilerPacket,
    nowMs: number,
    effectiveRtt: number,
    leadTicks: number,
    downlinkTicks: number
  ): void {
    const { sim, channel, historyBuffer, visualSmoother, pacingController, telemetryCollector } =
      session;
    const {
      interpolator,
      metrics,
      localCarIndex,
      lobbyDualWorldMode,
      hostLobbyMode,
      kickoffMaskUntilTick,
    } = session;
    const serverTick = packet.serverTick;
    session.lastAckedServerTick = serverTick;
    metrics.applyServerAck(serverTick, effectiveRtt);
    const maxAckCarIndex = historyBuffer.recordAcknowledgedRemoteControls(
      packet.acknowledgedControls,
      localCarIndex
    );
    const topology = syncClientCarTopology({
      sim,
      packet,
      maxAckCarIndex,
      localCarIndex,
      lobbyDualWorldMode,
      hostLobbyMode,
      isLoopback: Boolean(channel?.isLoopback),
      carVisualPresets: session.carVisualPresets,
    });
    if (topology.activeCarMask !== undefined) session.activeCarMask = topology.activeCarMask;
    if (topology.invalidateTimelineSync) session.isTimelineSynchronized = false;
    if (topology.shouldAbortReconcile) {
      if (topology.shouldNotifyMetrics) session.notifyMetricsUpdated();
      return;
    }

    metrics.leadTicks = leadTicks;
    const targetDelta = leadTicks + downlinkTicks;
    let currentClientTick = Math.floor(sim.getHeaderView!().tickCount);
    const currentDelta = currentClientTick - serverTick;
    const desyncDistance = Math.abs(currentDelta - targetDelta);
    const rollbackDepth = currentClientTick - serverTick;
    const maxRollbackFrames = session.options.maxRollbackFrames ?? 180;

    if (
      !session.isTimelineSynchronized ||
      rollbackDepth > maxRollbackFrames ||
      rollbackDepth < 0 ||
      desyncDistance > maxRollbackFrames
    ) {
      const wasSync = session.isTimelineSynchronized;
      if (nowMs - session.lastHardResyncTime > 300 || !wasSync) {
        console.log(
          `[PredictionReconciler] Timeline sync aligned (currentDelta: ${currentDelta}, target: ${targetDelta}, rollbackDepth: ${rollbackDepth}). Snapping timeline to server tick ${serverTick}.`
        );
        session.syncTimeline(packet.stateSnapshot, serverTick, nowMs);
        if (wasSync) {
          recordReconcileTelemetryTick({
            isMatchTelemetryActive: telemetryCollector.isMatchTelemetryActive,
            telemetryRecorder: telemetryCollector.recorder,
            nowMs,
            clientTick: Math.floor(sim.getHeaderView!().tickCount),
            serverTick,
            effectiveRtt,
            isHardResyncSnap: true,
            kickoffMaskUntilTick,
            inputBufferTarget: pacingController.inputBufferTarget,
            leadTicks,
            interpolatorPhysicsRate: interpolator?.physicsRate,
            metrics,
            lastPacingStepStatus: telemetryCollector.lastPacingStepStatus,
          });
        }
        session.onHardResync?.();
      } else if (topology.shouldNotifyMetrics) {
        session.notifyMetricsUpdated();
      }
      return;
    }

    session.shouldSkipLocalStep = false;
    const isRedundant = session.redundantHistoryCount > 1 || Boolean(session.enableRedundantInputs);
    const redundantConfig = session.getOutboundRedundantConfig();
    currentClientTick = pacingController.stepPacing(
      currentClientTick,
      currentDelta,
      targetDelta,
      effectiveRtt,
      {
        nowMs,
        sim,
        channel,
        interpolator,
        telemetryCollector,
        metrics,
        kickoffMaskUntilTick,
        hasServerReportedBuffer: session.controlMessenger.hasServerReportedBuffer,
        lobbyDualWorldMode,
        localCarIndex,
        lastLocalControls: historyBuffer.lastLocalControls,
        stepForwardTicks: (from, to, silent, ts) =>
          stepForwardRollbackTicks(
            sim,
            historyBuffer,
            from,
            to,
            localCarIndex,
            kickoffMaskUntilTick,
            silent,
            isRedundant,
            ts,
            (t, ctrl, tMs) =>
              session.controlMessenger.sendOutboundInputForTick(
                channel,
                historyBuffer,
                redundantConfig,
                localCarIndex,
                t,
                localCarIndex,
                ctrl,
                tMs
              )
          ),
      }
    );

    const { prePositions, hasNaN, numCars } = capturePreResimPositions(sim, 8);
    if (hasNaN) {
      console.error(
        '[PredictionReconciler] NaN detected in vehicle coordinates! Forcing full state reset.'
      );
      session.syncTimeline(packet.stateSnapshot, serverTick, nowMs);
      session.onHardResync?.();
      return;
    }

    const nextState = executeReplayAndEvaluateCorrection(
      sim,
      historyBuffer,
      visualSmoother,
      packet,
      serverTick,
      currentClientTick,
      prePositions,
      numCars,
      localCarIndex,
      lobbyDualWorldMode,
      kickoffMaskUntilTick,
      session.getReconciliationTolerances(),
      metrics,
      session
    );
    session.skippedCorrections = nextState.skippedCorrections;
    session.hardSnapCount = nextState.hardSnapCount;
    session.totalCorrections = nextState.totalCorrections;
    session.maxCorrectionDelta = nextState.maxCorrectionDelta;
    metrics.clientTick = currentClientTick;

    if (telemetryCollector.isMatchTelemetryActive) {
      recordReconcileTelemetryTick({
        isMatchTelemetryActive: telemetryCollector.isMatchTelemetryActive,
        telemetryRecorder: telemetryCollector.recorder,
        nowMs,
        clientTick: currentClientTick,
        serverTick,
        effectiveRtt,
        isHardResyncSnap: false,
        kickoffMaskUntilTick,
        inputBufferTarget: pacingController.inputBufferTarget,
        leadTicks,
        interpolatorPhysicsRate: interpolator?.physicsRate,
        metrics,
        lastPacingStepStatus: telemetryCollector.lastPacingStepStatus,
      });
    }
    session.notifyMetricsUpdated();
  }

  reconcileInboundBatch(
    session: ReconcileSessionTarget,
    incomingPackets: unknown[],
    nowMs: number
  ): void {
    const prepared = drainAndPrepareInboundSessionPacket(session, incomingPackets, nowMs);
    if (!prepared) return;
    const { packet, effectiveRtt } = prepared;
    const targets = session.pacingController.evaluateTimelineTargets(
      session.channel,
      session.controlMessenger.baseMeasuredRtt,
      session.controlMessenger.measuredRtt,
      session.controlMessenger.hasServerReportedBuffer,
      session.metrics?.inputBufferSize,
      effectiveRtt
    );
    session.pacingController.leadTicks = targets.leadTicks;
    this.stepReconcilePacket(
      session,
      packet,
      nowMs,
      effectiveRtt,
      targets.leadTicks,
      targets.downlinkTicks
    );
  }
}
