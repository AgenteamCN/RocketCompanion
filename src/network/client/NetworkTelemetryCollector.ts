/**
 * NetworkTelemetryCollector.ts
 * Standalone network telemetry collector, recorder tick emitter,
 * and client car slot / lobby probe topology synchronizer.
 */

import type {
  PacingControllerState,
  PacingControllerParams,
} from '../../ui-core/config/pacingControllerEvaluator.ts';
import { isDiagnosticProbeSlot } from '../../physics/RocketSimConstants.ts';
import type {
  PacingStepStatus,
  ReconcilerMetrics,
  TelemetryRecorderPort,
  TelemetrySimPort,
  TopologyPacketPort,
} from './ReconcilerMetricsModel.ts';

const BALL_OFFSET = 4;
const CAR_BASE_OFFSET = 22;
const CAR_STRIDE = 40;

export interface SavedLobbyLocalEntities {
  compactState: Float32Array | null;
}

export interface ReconcileTelemetryTickInput {
  isMatchTelemetryActive: boolean;
  telemetryRecorder: TelemetryRecorderPort | null | undefined;
  nowMs: number;
  clientTick: number;
  serverTick: number;
  effectiveRtt: number;
  isHardResyncSnap: boolean;
  kickoffMaskUntilTick: number;
  inputBufferTarget: number;
  leadTicks: number;
  interpolatorPhysicsRate?: number;
  metrics: ReconcilerMetrics;
  lastPacingStepStatus?: PacingStepStatus | null;
}

export interface TopologySyncInput {
  sim: TelemetrySimPort;
  packet: TopologyPacketPort;
  maxAckCarIndex: number;
  localCarIndex: number;
  lobbyDualWorldMode: boolean;
  hostLobbyMode: boolean;
  isLoopback: boolean;
  carVisualPresets: Map<number, string>;
}

export interface TopologySyncResult {
  shouldAbortReconcile: boolean;
  shouldNotifyMetrics: boolean;
  invalidateTimelineSync: boolean;
  activeCarMask?: number;
}

export function configureClientLobbyDiagnosticProbes(
  sim: TelemetrySimPort | null | undefined
): void {
  if (!sim) return;
  const hasSlot6 =
    typeof sim.isCarSlotActive === 'function' ? sim.isCarSlotActive(6) : sim.numCars > 6;
  if (hasSlot6) {
    sim.setCarLinearFactorAndGravity?.(6, 0, 0, 1, 1.0);
    sim.setCarUnlimitedBoost?.(6, true);
    sim.setCarCollisionMask?.(6, false, false);
  }
  const hasSlot7 =
    typeof sim.isCarSlotActive === 'function' ? sim.isCarSlotActive(7) : sim.numCars > 7;
  if (hasSlot7) {
    sim.setCarLinearFactorAndGravity?.(7, 0, 0, 0, 0.0);
    sim.setCarUnlimitedBoost?.(7, true);
    sim.setCarCollisionMask?.(7, false, false);
  }
}

export function saveClientLobbyLocalEntities(
  sim: TelemetrySimPort | null | undefined,
  lobbyDualWorldMode: boolean
): SavedLobbyLocalEntities | null {
  if (!lobbyDualWorldMode || !sim) return null;
  const compactState =
    typeof sim.saveCompactState === 'function'
      ? sim.saveCompactState()
      : sim.state
        ? new Float32Array(sim.state)
        : null;
  return { compactState };
}

export function restoreClientLobbyLocalEntities(
  sim: TelemetrySimPort | null | undefined,
  lobbyDualWorldMode: boolean,
  localCarIndex: number,
  lastLocalControls: unknown,
  saved: SavedLobbyLocalEntities | null
): void {
  if (!lobbyDualWorldMode || !sim || !saved) return;
  const localIdx = localCarIndex ?? 1;

  if (saved.compactState && sim.state && sim.state.length >= CAR_BASE_OFFSET + 6 * CAR_STRIDE) {
    const copyEnd = CAR_BASE_OFFSET + 6 * CAR_STRIDE;
    sim.state.subarray(BALL_OFFSET, copyEnd).set(saved.compactState.subarray(BALL_OFFSET, copyEnd));
    if (sim.state.length >= 440 && saved.compactState.length >= 440) {
      sim.state.subarray(416, 416 + 6 * 4).set(saved.compactState.subarray(416, 416 + 6 * 4));
    }
    if (typeof sim.restoreCompactState === 'function') {
      sim.restoreCompactState(sim.state, { preserveEngineTick: true });
    } else {
      sim.setBallState?.(saved.compactState.subarray(BALL_OFFSET, CAR_BASE_OFFSET));
      if (localIdx >= 0 && localIdx < 6) {
        const cOff = CAR_BASE_OFFSET + localIdx * CAR_STRIDE;
        sim.setCarState?.(localIdx, saved.compactState.subarray(cOff, cOff + CAR_STRIDE));
      }
    }
  }

  if (localIdx >= 0 && localIdx < 6 && typeof sim.getCarStateView === 'function') {
    const cv = sim.getCarStateView(localIdx);
    if (
      cv &&
      (!Number.isFinite(cv.posZ) ||
        cv.posZ < 10.0 ||
        Math.abs(cv.posX) > 4050 ||
        Math.abs(cv.posY) > 5100)
    ) {
      const isOrange = localIdx % 2 === 1;
      const yaw = isOrange ? -0.75 * Math.PI : 0.25 * Math.PI;
      const cy = Math.cos(yaw);
      const sy = Math.sin(yaw);
      sim.setCarState?.(localIdx, {
        pos: [isOrange ? 2048 : -2048, isOrange ? 2560 : -2560, 17.0],
        forward: [cy, sy, 0],
        right: [-sy, cy, 0],
        up: [0, 0, 1],
        vel: [0, 0, 0],
        angVel: [0, 0, 0],
        boost: 100,
        isOnGround: true,
        isDemoed: false,
        hasFlipOrJump: true,
      });
    }
  }

  if (localIdx >= 0 && lastLocalControls) sim.setControls?.(localIdx, lastLocalControls);
  configureClientLobbyDiagnosticProbes(sim);
}

export function syncClientCarTopology(input: TopologySyncInput): TopologySyncResult {
  const {
    sim,
    packet,
    maxAckCarIndex,
    localCarIndex,
    lobbyDualWorldMode,
    hostLobbyMode,
    isLoopback,
    carVisualPresets,
  } = input;
  const snapCarCount =
    packet.stateSnapshot && packet.stateSnapshot.length > 2
      ? Math.round(packet.stateSnapshot[2] || 0)
      : 0;
  const serverCarCount = Math.min(
    8,
    Math.max(
      1,
      snapCarCount,
      maxAckCarIndex + 1,
      packet.acknowledgedControls?.length || 1,
      localCarIndex + 1
    )
  );
  const serverHasLobbyProbes =
    typeof packet.activeCarMask !== 'number' ||
    packet.activeCarMask === 0 ||
    (packet.activeCarMask & 0xc0) !== 0;

  if (
    !lobbyDualWorldMode &&
    !hostLobbyMode &&
    !isLoopback &&
    typeof packet.activeCarMask === 'number' &&
    (packet.activeCarMask & 0xc0) !== 0
  ) {
    return {
      shouldAbortReconcile: true,
      shouldNotifyMetrics: true,
      invalidateTimelineSync: false,
    };
  }

  let topologyChanged = false;
  let activeCarMask: number | undefined;

  if (
    typeof sim.addCarAtSlot === 'function' &&
    typeof sim.isCarSlotActive === 'function' &&
    typeof packet.activeCarMask === 'number' &&
    packet.activeCarMask > 0
  ) {
    let targetMask = packet.activeCarMask & 0xff;
    if (lobbyDualWorldMode) {
      const diagMask = packet.activeCarMask & 0xc0 || 0xc0;
      const localBit = localCarIndex >= 0 && localCarIndex < 8 ? 1 << localCarIndex : 0;
      targetMask = diagMask | localBit;
    } else if (localCarIndex >= 0 && localCarIndex < 8) {
      targetMask |= 1 << localCarIndex;
    }
    for (let c = 0; c < 8; c++) {
      const shouldBeActive = (targetMask & (1 << c)) !== 0;
      const isActive = sim.isCarSlotActive(c);
      if (shouldBeActive && !isActive) {
        const preset = carVisualPresets.get(c) || (isDiagnosticProbeSlot(c) ? 'fennec' : 'octane');
        const defaultTeam = c === 6 ? 0 : c === 7 ? 1 : c % 2;
        sim.addCarAtSlot(c, defaultTeam, preset);
        topologyChanged = true;
      } else if (!shouldBeActive && isActive && c !== localCarIndex) {
        sim.removeCar?.(c);
        topologyChanged = true;
      }
    }
    activeCarMask = targetMask;
  } else {
    while (sim.numCars < serverCarCount) {
      const nextCarIdx = sim.numCars;
      const preset = carVisualPresets.get(nextCarIdx) || 'octane';
      sim.addCar(nextCarIdx % 2, preset);
      topologyChanged = true;
    }
    if (!lobbyDualWorldMode && typeof sim.removeCar === 'function') {
      while (sim.numCars > serverCarCount && sim.numCars > 1) {
        if (!sim.removeCar(sim.numCars - 1)) break;
        topologyChanged = true;
      }
    }
  }

  if (lobbyDualWorldMode) {
    configureClientLobbyDiagnosticProbes(sim);
    if (!serverHasLobbyProbes) {
      return {
        shouldAbortReconcile: true,
        shouldNotifyMetrics: true,
        invalidateTimelineSync: true,
        activeCarMask,
      };
    }
  } else if (typeof packet.activeCarMask === 'number' && (packet.activeCarMask & 0xc0) !== 0) {
    configureClientLobbyDiagnosticProbes(sim);
  }

  return {
    shouldAbortReconcile: false,
    shouldNotifyMetrics: false,
    invalidateTimelineSync: topologyChanged,
    activeCarMask,
  };
}

export function recordReconcileTelemetryTick(input: ReconcileTelemetryTickInput): void {
  if (!input.isMatchTelemetryActive || !input.telemetryRecorder) return;
  const {
    telemetryRecorder,
    nowMs,
    clientTick,
    serverTick,
    effectiveRtt,
    isHardResyncSnap,
    kickoffMaskUntilTick,
    inputBufferTarget,
    leadTicks,
    interpolatorPhysicsRate,
    metrics,
    lastPacingStepStatus,
  } = input;

  const isKickoffMasked = kickoffMaskUntilTick > 0 && clientTick < kickoffMaskUntilTick;
  if (isHardResyncSnap) {
    if (isKickoffMasked) return;
    telemetryRecorder.recordTick?.({
      nowMs,
      clientTick,
      serverTick,
      rawRttMs: effectiveRtt,
      smoothRttMs: metrics.smoothRttMs || effectiveRtt,
      jitterMs: metrics.measuredJitterMs || 0,
      serverBuffer: inputBufferTarget,
      effectiveBuffer: inputBufferTarget,
      targetBuffer: inputBufferTarget,
      physicsRateHz: interpolatorPhysicsRate ?? 120,
      leadTicks,
      posErrorUu: metrics.lastCorrectionDelta || 0,
      localPosErrorUu: metrics.localCorrectionDelta || 0,
      ballPosErrorUu: metrics.ballCorrectionDelta || 0,
      remotePosErrorUu: metrics.remoteCorrectionDelta || 0,
      probePosErrorUu: metrics.probeCorrectionDelta || 0,
      reconcileTier: 3,
      tierState: 0,
      packetArrived: true,
      hardResync: true,
      tier3Snap: true,
      stepCatchup: false,
      stepSkip: false,
      tierSwitched: false,
      isKickoffMasked,
    });
    return;
  }

  const stepOut = lastPacingStepStatus?.stepOut;
  const recTier = metrics.reconcileTier || 1;
  telemetryRecorder.recordTick?.({
    nowMs,
    clientTick,
    serverTick,
    rawRttMs: effectiveRtt,
    smoothRttMs: stepOut?.smoothRttMs ?? effectiveRtt,
    jitterMs: stepOut?.jitterMs ?? 0,
    serverBuffer:
      lastPacingStepStatus?.rawServerBuffer ?? metrics.inputBufferSize ?? inputBufferTarget,
    effectiveBuffer: stepOut?.effectiveBuffer ?? metrics.effectiveInputBuffer ?? inputBufferTarget,
    targetBuffer: stepOut?.activeTarget ?? metrics.targetInputBuffer ?? inputBufferTarget,
    physicsRateHz: stepOut?.physicsRateHz ?? interpolatorPhysicsRate ?? 120,
    leadTicks,
    posErrorUu: metrics.lastCorrectionDelta || 0,
    localPosErrorUu: metrics.localCorrectionDelta || 0,
    ballPosErrorUu: metrics.ballCorrectionDelta || 0,
    remotePosErrorUu: metrics.remoteCorrectionDelta || 0,
    probePosErrorUu: metrics.probeCorrectionDelta || 0,
    reconcileTier: recTier,
    tierState: stepOut?.tierState ?? 0,
    packetArrived: true,
    hardResync: Boolean(stepOut?.requestHardResync),
    tier3Snap: Boolean(recTier === 3),
    stepCatchup: Boolean(lastPacingStepStatus?.stepCatchup),
    stepSkip: Boolean(lastPacingStepStatus?.stepSkip),
    tierSwitched: Boolean(stepOut?.tierSwitched),
    isKickoffMasked,
  });
}

export class NetworkTelemetryCollector {
  recorder: TelemetryRecorderPort | null | undefined;
  isMatchTelemetryActive: boolean;
  pacingControllerState: PacingControllerState = { initialized: false };
  lastPacingStepStatus: PacingStepStatus | null = null;
  private readonly listeners = new Set<(metrics: ReconcilerMetrics) => void>();

  constructor(recorder: TelemetryRecorderPort | null | undefined, isMatchTelemetryActive = true) {
    this.recorder = recorder;
    this.isMatchTelemetryActive = Boolean(isMatchTelemetryActive);
  }

  reset(mode: string, priority: string, params: PacingControllerParams | null): void {
    this.pacingControllerState = { initialized: false };
    this.lastPacingStepStatus = null;
    if (this.recorder) {
      this.recorder.reset?.();
      this.recorder.setSessionMetadata?.(mode, priority, params);
    }
  }

  updateSessionMetadata(
    mode: string,
    priority: string,
    params: PacingControllerParams | null
  ): void {
    this.recorder?.setSessionMetadata?.(mode, priority, params);
  }

  addListener(fn: (metrics: ReconcilerMetrics) => void): () => void {
    if (typeof fn === 'function') {
      this.listeners.add(fn);
      return () => this.listeners.delete(fn);
    }
    return () => {};
  }

  emitMetrics(
    metrics: ReconcilerMetrics,
    onMetricsUpdated?: ((metrics: ReconcilerMetrics) => void) | null
  ): void {
    if (onMetricsUpdated) {
      try {
        onMetricsUpdated(metrics);
      } catch (err) {
        console.error('[PredictionReconciler] Error in onMetricsUpdated callback:', err);
      }
    }
    for (const listener of this.listeners) {
      try {
        listener(metrics);
      } catch (err) {
        console.error('[PredictionReconciler] Error in metrics listener:', err);
      }
    }
  }
}
