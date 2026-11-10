/**
 * reconcilerRollbackPipeline.ts
 * Pure RollbackStepState data structure, timeline sync step,
 * 3-tier snapshot discrepancy evaluation, and transient timer preservation.
 */

import {
  evaluateHistoricalSnapshotDelta,
  type CarControls,
  type PredictionHistoryBuffer,
  type ReconciliationTolerances,
} from './PredictionHistoryBuffer.ts';
import type { PreResimPositions, VisualErrorSmoother } from './VisualErrorSmoother.ts';
import {
  configureClientLobbyDiagnosticProbes,
  restoreClientLobbyLocalEntities,
  saveClientLobbyLocalEntities,
} from './NetworkTelemetryCollector.ts';
import type {
  ReconcilerMetrics,
  TelemetrySimPort,
  TopologyPacketPort,
} from './ReconcilerMetricsModel.ts';

export interface RollbackStepState {
  lastAckedServerTick: number;
  lastServerRecordedInputTick: number;
  isTimelineSynchronized: boolean;
  shouldSkipLocalStep: boolean;
  lastHardResyncTime: number;
  activeCarMask: number;
  skippedCorrections: number;
  hardSnapCount: number;
  totalCorrections: number;
  maxCorrectionDelta: number;
}

export interface RollbackStepperSyncInput {
  sim: TelemetrySimPort;
  historyBuffer: PredictionHistoryBuffer;
  visualSmoother: VisualErrorSmoother;
  metrics: ReconcilerMetrics;
  serverSnapshot: Float32Array | null;
  serverTick: number;
  nowMs: number;
  localCarIndex: number;
  lobbyDualWorldMode: boolean;
  kickoffMaskUntilTick: number;
  leadTicks: number;
  downlinkTicks: number;
  hardSnapCount: number;
  isRedundant: boolean;
  sendOutboundInput: (tick: number, controls: CarControls | null, nowMs: number) => void;
}

export interface RollbackStepperSyncOutput {
  currentClientTick: number;
  lastServerRecordedInputTick: number;
  lastAckedServerTick: number;
  lastHardResyncTime: number;
  hardSnapCount: number;
}

export function createInitialRollbackStepState(
  initialServerRecordedInputTick = -1
): RollbackStepState {
  return {
    lastAckedServerTick: -1,
    lastServerRecordedInputTick: initialServerRecordedInputTick,
    isTimelineSynchronized: false,
    shouldSkipLocalStep: false,
    lastHardResyncTime: 0,
    activeCarMask: 0,
    skippedCorrections: 0,
    hardSnapCount: 0,
    totalCorrections: 0,
    maxCorrectionDelta: 0,
  };
}

export function stepForwardRollbackTicks(
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
  const updatedTick = historyBuffer.stepSimulationRange(
    sim,
    fromTick,
    toTick,
    localCarIndex,
    kickoffMaskUntilTick,
    useSilentStep,
    !isRedundant ? (t, ctrl) => sendOutboundInput(t, ctrl, nowMs) : undefined
  );
  if (isRedundant && toTick > fromTick) sendOutboundInput(toTick - 1, null, nowMs);
  return updatedTick;
}

export function executeSyncTimelineStep(
  input: RollbackStepperSyncInput
): RollbackStepperSyncOutput {
  const { sim, historyBuffer, visualSmoother, metrics, serverSnapshot, serverTick, nowMs } = input;
  const savedLobby = saveClientLobbyLocalEntities(sim, input.lobbyDualWorldMode);
  if (serverSnapshot) sim.restoreState(serverSnapshot);
  if (
    input.lobbyDualWorldMode ||
    (typeof sim?.isCarSlotActive === 'function' &&
      (sim.isCarSlotActive(6) || sim.isCarSlotActive(7)))
  ) {
    configureClientLobbyDiagnosticProbes(sim);
  }
  historyBuffer.backfillMissingLocalInputs(
    serverTick - 16,
    serverTick,
    input.localCarIndex,
    input.kickoffMaskUntilTick
  );
  stepForwardRollbackTicks(
    sim,
    historyBuffer,
    serverTick,
    serverTick + input.leadTicks + input.downlinkTicks,
    input.localCarIndex,
    input.kickoffMaskUntilTick,
    true,
    input.isRedundant,
    nowMs,
    input.sendOutboundInput
  );
  if (savedLobby) {
    restoreClientLobbyLocalEntities(
      sim,
      input.lobbyDualWorldMode,
      input.localCarIndex,
      historyBuffer.lastLocalControls,
      savedLobby
    );
  }
  const currentClientTick = Math.floor(sim.getHeaderView!().tickCount);
  const hardSnapCount = (input.hardSnapCount || 0) + 1;
  visualSmoother.reset();
  sim.saveStateSlot(currentClientTick % 256);
  historyBuffer.saveTickSnapshot(currentClientTick, sim);
  metrics.applyHardSyncState(currentClientTick, serverTick, input.leadTicks, hardSnapCount);
  return {
    currentClientTick,
    lastServerRecordedInputTick: serverTick - 1,
    lastAckedServerTick: serverTick,
    lastHardResyncTime: nowMs,
    hardSnapCount,
  };
}

interface CarTransientTimersView {
  boostSpentTimer?: number;
  flipRelTorqueX?: number;
  flipRelTorqueY?: number;
  flipRelTorqueZ?: number;
  autoFlipTimer?: number;
  autoFlipTorqueScale?: number;
  hasFlipped?: number;
}

export function preserveCarTransientTimersAcrossCompactRestore(
  sim: TelemetrySimPort,
  slotFullState: Float32Array | null | undefined,
  numCars: number
): void {
  if (!slotFullState || slotFullState.length < 410) return;
  for (let c = 0; c < numCars; c++) {
    const cv = sim.getCarStateView(c) as CarTransientTimersView | null;
    const base = 26 + c * 48;
    if (cv && base + 38 < slotFullState.length) {
      cv.boostSpentTimer = slotFullState[base + 15];
      cv.flipRelTorqueX = slotFullState[base + 25];
      cv.flipRelTorqueY = slotFullState[base + 26];
      cv.flipRelTorqueZ = slotFullState[base + 27];
      cv.autoFlipTimer = slotFullState[base + 36];
      cv.autoFlipTorqueScale = slotFullState[base + 37];
      cv.hasFlipped = slotFullState[base + 38];
    }
  }
}

export function executeReplayAndEvaluateCorrection(
  sim: TelemetrySimPort,
  historyBuffer: PredictionHistoryBuffer,
  visualSmoother: VisualErrorSmoother,
  packet: TopologyPacketPort,
  serverTick: number,
  currentClientTick: number,
  prePositions: PreResimPositions,
  numCars: number,
  localCarIndex: number,
  lobbyDualWorldMode: boolean,
  kickoffMaskUntilTick: number,
  tolerances: ReconciliationTolerances,
  metrics: ReconcilerMetrics,
  state: RollbackStepState
): RollbackStepState {
  let { skippedCorrections, hardSnapCount, totalCorrections, maxCorrectionDelta } = state;
  sim.saveStateSlot?.(currentClientTick % 256);
  historyBuffer.saveTickSnapshot(currentClientTick, sim);
  const evalResult = evaluateHistoricalSnapshotDelta(
    packet.stateSnapshot,
    historyBuffer.getTickSnapshot(serverTick),
    {
      numCars,
      localCarIndex,
      isLobbyDualWorld: lobbyDualWorldMode,
      tolerances,
      isCarSlotActive:
        typeof sim?.isCarSlotActive === 'function'
          ? (c: number) => sim.isCarSlotActive!(c)
          : undefined,
    }
  );
  if (evalResult.canCompare) {
    if (evalResult.withinTier1) {
      skippedCorrections = (skippedCorrections || 0) + 1;
      metrics.applyTier1Skip(
        evalResult.localPosDelta,
        skippedCorrections,
        visualSmoother.getMagnitude()
      );
      return { ...state, skippedCorrections };
    }
    metrics.historicalPosDelta = evalResult.localPosDelta;
  }
  const isTier3HistoricalHardSnap = Boolean(evalResult.canCompare && evalResult.exceedsHardSnap);
  const savedLobbyEntities = saveClientLobbyLocalEntities(sim, lobbyDualWorldMode);
  let slotFullState: Float32Array | null = null;
  if (serverTick < currentClientTick && currentClientTick - serverTick < 256) {
    if (sim.restoreStateSlot?.(serverTick % 256) && typeof sim?.saveState === 'function') {
      slotFullState = sim.saveState();
    }
  }
  sim.restoreState(packet.stateSnapshot);
  if (slotFullState) preserveCarTransientTimersAcrossCompactRestore(sim, slotFullState, numCars);
  if (
    lobbyDualWorldMode ||
    (typeof sim?.isCarSlotActive === 'function' &&
      (sim.isCarSlotActive(6) || sim.isCarSlotActive(7)))
  ) {
    configureClientLobbyDiagnosticProbes(sim);
  }
  historyBuffer.backfillMissingLocalInputs(
    serverTick - 16,
    serverTick,
    localCarIndex,
    kickoffMaskUntilTick
  );
  historyBuffer.resimulateSilentRange(
    sim,
    serverTick,
    currentClientTick,
    numCars,
    localCarIndex,
    kickoffMaskUntilTick
  );
  if (savedLobbyEntities) {
    restoreClientLobbyLocalEntities(
      sim,
      lobbyDualWorldMode,
      localCarIndex,
      historyBuffer.lastLocalControls,
      savedLobbyEntities
    );
  }
  sim.saveStateSlot(currentClientTick % 256);
  historyBuffer.saveTickSnapshot(currentClientTick, sim);
  const discrepancy = visualSmoother.applyPostResimDiscrepancy(
    sim,
    prePositions,
    {
      numCars,
      localCarIndex,
      isLobbyDualWorld: lobbyDualWorldMode,
      hardSnapThreshold: tolerances.hardSnapThreshold ?? 500.0,
      isTier3HistoricalHardSnap,
    },
    metrics
  );
  let nextHardSnap: number | undefined;
  let nextTotal: number | undefined;
  let nextMaxDelta: number | undefined;
  if (discrepancy.isTier3HardSnap) {
    hardSnapCount = (hardSnapCount || 0) + 1;
    nextHardSnap = hardSnapCount;
  }
  if (discrepancy.effectiveDelta > 0.05) {
    totalCorrections++;
    nextTotal = totalCorrections;
    if (discrepancy.effectiveDelta > maxCorrectionDelta) {
      maxCorrectionDelta = discrepancy.effectiveDelta;
      nextMaxDelta = discrepancy.effectiveDelta;
    }
  }
  metrics.applyCorrectionCounters(nextHardSnap, nextTotal, nextMaxDelta);
  return { ...state, skippedCorrections, hardSnapCount, totalCorrections, maxCorrectionDelta };
}
