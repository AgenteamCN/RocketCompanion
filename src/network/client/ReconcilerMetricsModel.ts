/**
 * ReconcilerMetricsModel.ts
 * Telemetry port contracts, asymmetric latency breakdown solver,
 * lead/downlink tick calculators, and ReconcilerMetrics model.
 */

import type {
  PacingControllerParams,
  PacingControllerStepResult,
} from '../../ui-core/config/pacingControllerEvaluator.ts';

export interface TelemetrySimulatorPort {
  extraUplinkMs?: number;
  extraDownlinkMs?: number;
  extraLatencyMs?: number;
  extraRttMs?: number;
  isLoopback?: boolean;
  baseMeasuredRttMs?: number;
  rttMs?: number;
  measuredRttMs?: number;
  jitterMs?: number;
  packetLossRate?: number;
  burstDropEnabled?: boolean;
}

export interface TelemetryChannelPort extends TelemetrySimulatorPort {
  simulator?: TelemetrySimulatorPort;
  sendClientInput?: (packet: Uint8Array, nowMs?: number) => unknown;
  send?: (packet: Uint8Array, nowMs?: number) => unknown;
  receiveClientPackets?: (nowMs?: number) => unknown[];
  receiveServerPackets?: (nowMs?: number) => unknown[];
  inboundQueue?: unknown[];
}

export interface TelemetrySimPort {
  state?: Float32Array;
  numCars: number;
  isCarSlotActive?: (carIndex: number) => boolean;
  setCarLinearFactorAndGravity?: (
    carIndex: number,
    lx: number,
    ly: number,
    lz: number,
    gravityScale: number
  ) => void;
  setCarUnlimitedBoost?: (carIndex: number, enabled: boolean) => void;
  setCarCollisionMask?: (
    carIndex: number,
    collideWithBall: boolean,
    collideWithCars: boolean
  ) => void;
  saveCompactState?: () => Float32Array;
  restoreCompactState?: (state: Float32Array, opts?: { preserveEngineTick?: boolean }) => void;
  setBallState?: (state: Float32Array | Record<string, unknown>) => void;
  setCarState?: (carIndex: number, state: Float32Array | Record<string, unknown>) => void;
  getCarStateView: (carIndex: number) => { posX: number; posY: number; posZ: number } | null;
  getBallStateView?: () => { posX: number; posY: number; posZ: number } | null;
  getHeaderView?: () => { tickCount: number };
  setControls?: (carIndex: number, controls: unknown) => void;
  addCarAtSlot?: (carIndex: number, team: number, preset: string) => void;
  addCar: (team: number, preset: string) => void;
  removeCar?: (carIndex: number) => boolean;
  saveState?: () => Float32Array;
  saveStateSlot: (slot: number) => void;
  restoreStateSlot: (slot: number) => boolean | void;
  restoreState: (snapshot: Float32Array | number[]) => void;
}

export interface TelemetryRecorderPort {
  count: number;
  reset?: () => void;
  setSessionMetadata?: (
    mode: string,
    priority: string,
    params: PacingControllerParams | null
  ) => void;
  recordTick?: (entry: Record<string, unknown>) => void;
}

export interface TopologyPacketPort {
  serverTick?: number;
  stateSnapshot: Float32Array;
  activeCarMask?: number;
  acknowledgedControls?: Array<{ carIndex: number; controls?: unknown }>;
}

export interface LatencyBreakdownInput {
  channel: TelemetryChannelPort | null | undefined;
  baseMeasuredRtt?: number;
  measuredRtt?: number;
  hasServerReportedBuffer?: boolean;
  inputBufferSize?: number;
  inputBufferTarget?: number;
  tickDtMs?: number;
}

export interface LatencyBreakdownResult {
  rttMs: number;
  baseRttMs: number;
  uplinkMs: number;
  downlinkMs: number;
  extraUplinkMs: number;
  extraDownlinkMs: number;
  extraRttMs: number;
}

export interface PacingStepStatus {
  stepOut: PacingControllerStepResult;
  rawServerBuffer: number;
  stepCatchup: boolean;
  stepSkip: boolean;
  nowMs: number;
}

export class ReconcilerMetrics {
  [key: string]: number | boolean | unknown;
  clientTick = 0;
  serverTick = 0;
  leadTicks: number;
  rttMs = 0;
  uplinkMs = 0;
  downlinkMs = 0;
  extraUplinkMs = 0;
  extraDownlinkMs = 0;
  extraRttMs = 0;
  smoothRttMs = 0;
  measuredJitterMs = 0;
  inputBufferSize: number;
  effectiveInputBuffer: number;
  targetInputBuffer: number;
  pacingTier = 0;
  physicsRateHz = 120;
  reconcileTier = 1;
  historicalPosDelta = 0;
  totalCorrections = 0;
  skippedCorrections = 0;
  hardSnapCount = 0;
  lastCorrectionDelta = 0;
  maxCorrectionDelta = 0;
  smoothingMagnitude = 0;
  localCorrectionDelta?: number;
  ballCorrectionDelta?: number;
  remoteCorrectionDelta?: number;
  probeCorrectionDelta?: number;
  enableSmoothing?: boolean;
  rollbackWindow?: number;
  allUserRtt?: unknown;
  mispredictions?: number;

  constructor(leadTicks: number, inputBufferTarget: number) {
    this.leadTicks = leadTicks;
    this.inputBufferSize = inputBufferTarget;
    this.effectiveInputBuffer = inputBufferTarget;
    this.targetInputBuffer = inputBufferTarget;
  }

  applyLatencyBreakdown(
    b: LatencyBreakdownResult,
    enableSmoothing: boolean,
    rollbackWindow: number
  ): void {
    this.rttMs = b.rttMs;
    this.uplinkMs = b.uplinkMs;
    this.downlinkMs = b.downlinkMs;
    this.extraUplinkMs = b.extraUplinkMs;
    this.extraDownlinkMs = b.extraDownlinkMs;
    this.extraRttMs = b.extraRttMs;
    this.enableSmoothing = enableSmoothing;
    this.rollbackWindow = rollbackWindow;
  }

  applyPacingStep(
    s: PacingControllerStepResult,
    rawServerBuffer: number,
    hasServerBuf: boolean
  ): void {
    this.effectiveInputBuffer = Math.round(s.effectiveBuffer * 100) / 100;
    this.targetInputBuffer = Math.round(s.activeTarget * 100) / 100;
    this.pacingTier = s.tierState;
    this.physicsRateHz = s.physicsRateHz;
    this.smoothRttMs = Math.round(s.smoothRttMs * 10) / 10;
    this.measuredJitterMs = Math.round(s.jitterMs * 10) / 10;
    if (!hasServerBuf)
      this.inputBufferSize = Math.max(-64, Math.min(63, Math.round(rawServerBuffer)));
  }

  applySmoothingToggle(enabled: boolean): void {
    this.enableSmoothing = enabled;
    if (!enabled) this.smoothingMagnitude = 0;
  }

  applyHardSyncState(
    clientTick: number,
    serverTick: number,
    leadTicks: number,
    hardSnapCount: number
  ): void {
    this.reconcileTier = 3;
    this.hardSnapCount = hardSnapCount;
    this.clientTick = clientTick;
    this.serverTick = serverTick;
    this.leadTicks = leadTicks;
  }

  applyClientPredictionStep(clientTick: number, rttMs: number, leadTicks: number): void {
    this.clientTick = clientTick;
    this.rttMs = rttMs;
    this.leadTicks = leadTicks;
  }

  applyServerAck(serverTick: number, rttMs: number): void {
    this.serverTick = serverTick;
    this.rttMs = rttMs;
  }

  applyTier1Skip(
    localPosDelta: number,
    skippedCorrections: number,
    smoothingMagnitude: number
  ): void {
    this.historicalPosDelta = localPosDelta;
    this.skippedCorrections = skippedCorrections;
    this.reconcileTier = 1;
    this.lastCorrectionDelta = localPosDelta;
    this.localCorrectionDelta = localPosDelta || 0;
    this.ballCorrectionDelta = 0;
    this.remoteCorrectionDelta = 0;
    this.probeCorrectionDelta = 0;
    this.smoothingMagnitude = smoothingMagnitude;
  }

  applySmootherDiscrepancy(
    d: {
      localDelta: number;
      ballDelta: number;
      remoteMaxDelta: number;
      probeMaxDelta: number;
      isTier3HardSnap: boolean;
    },
    lastCorrectionDelta: number,
    smoothingMagnitude: number
  ): void {
    this.localCorrectionDelta = d.localDelta;
    this.ballCorrectionDelta = d.ballDelta;
    this.remoteCorrectionDelta = d.remoteMaxDelta;
    this.probeCorrectionDelta = d.probeMaxDelta;
    this.reconcileTier = d.isTier3HardSnap ? 3 : 2;
    this.lastCorrectionDelta = lastCorrectionDelta;
    this.smoothingMagnitude = smoothingMagnitude;
  }

  applyCorrectionCounters(
    hardSnapCount?: number,
    totalCorrections?: number,
    maxCorrectionDelta?: number
  ): void {
    if (hardSnapCount !== undefined) this.hardSnapCount = hardSnapCount;
    if (totalCorrections !== undefined) this.totalCorrections = totalCorrections;
    if (maxCorrectionDelta !== undefined) this.maxCorrectionDelta = maxCorrectionDelta;
  }

  resetCorrectionStats(): void {
    this.reconcileTier = 1;
    this.historicalPosDelta = 0;
    this.totalCorrections = 0;
    this.skippedCorrections = 0;
    this.hardSnapCount = 0;
    this.lastCorrectionDelta = 0;
    this.maxCorrectionDelta = 0;
    this.smoothingMagnitude = 0;
  }
}

export function createInitialReconcilerMetrics(
  leadTicks: number,
  inputBufferTarget: number
): ReconcilerMetrics {
  return new ReconcilerMetrics(leadTicks, inputBufferTarget);
}

export function resolveLatencyBreakdown(input: LatencyBreakdownInput): LatencyBreakdownResult {
  const ch = input.channel;
  const sim = ch?.simulator ?? ch;
  const extraUplinkMs = Math.max(
    0,
    Math.round(
      Number(
        sim?.extraUplinkMs ?? sim?.extraLatencyMs ?? ch?.extraUplinkMs ?? ch?.extraLatencyMs ?? 0
      ) || 0
    )
  );
  const extraDownlinkMs = Math.max(
    0,
    Math.round(
      Number(
        sim?.extraDownlinkMs ??
          sim?.extraLatencyMs ??
          ch?.extraDownlinkMs ??
          ch?.extraLatencyMs ??
          0
      ) || 0
    )
  );
  const extraRttMs = extraUplinkMs + extraDownlinkMs;

  if (ch?.isLoopback || sim?.isLoopback) {
    return {
      rttMs: extraRttMs,
      baseRttMs: 0,
      uplinkMs: extraUplinkMs,
      downlinkMs: extraDownlinkMs,
      extraUplinkMs,
      extraDownlinkMs,
      extraRttMs,
    };
  }

  let baseRttMs = 0;
  const simBaseRtt = sim?.baseMeasuredRttMs ?? ch?.baseMeasuredRttMs;
  if (Number.isFinite(input.baseMeasuredRtt) && (input.baseMeasuredRtt as number) > 0) {
    baseRttMs = Math.round(input.baseMeasuredRtt as number);
  } else if (typeof simBaseRtt === 'number' && Number.isFinite(simBaseRtt) && simBaseRtt > 0) {
    baseRttMs = Math.round(simBaseRtt);
  } else if (Number.isFinite(input.measuredRtt) && (input.measuredRtt as number) > 0) {
    baseRttMs = Math.max(0, Math.round((input.measuredRtt as number) - extraRttMs));
  } else {
    const rawRtt = sim?.rttMs ?? ch?.rttMs;
    const rawMeasured = sim?.measuredRttMs ?? ch?.measuredRttMs;
    const chRtt =
      typeof rawRtt === 'number' && Number.isFinite(rawRtt)
        ? rawRtt
        : typeof rawMeasured === 'number' && Number.isFinite(rawMeasured)
          ? rawMeasured
          : 0;
    baseRttMs = Math.max(0, Math.round(chRtt - extraRttMs));
  }

  let bufferAsymmetryMs = 0;
  if (
    input.hasServerReportedBuffer &&
    typeof input.inputBufferSize === 'number' &&
    Number.isFinite(input.inputBufferSize) &&
    baseRttMs > 0
  ) {
    const bufferDeficitTicks = (input.inputBufferTarget ?? 3) - input.inputBufferSize;
    const maxShift = baseRttMs * 0.5;
    const tickDtMs = input.tickDtMs ?? 1000.0 / 120.0;
    bufferAsymmetryMs = Math.max(-maxShift, Math.min(maxShift, bufferDeficitTicks * tickDtMs));
  }

  const baseUplinkMs = Math.max(
    0,
    Math.min(baseRttMs, Math.round(baseRttMs * 0.5 + bufferAsymmetryMs))
  );
  const baseDownlinkMs = Math.max(0, baseRttMs - baseUplinkMs);
  const uplinkMs = baseUplinkMs + extraUplinkMs;
  const downlinkMs = baseDownlinkMs + extraDownlinkMs;

  return {
    rttMs: uplinkMs + downlinkMs,
    baseRttMs,
    uplinkMs,
    downlinkMs,
    extraUplinkMs,
    extraDownlinkMs,
    extraRttMs,
  };
}

export function computeLeadTicksFromBreakdown(
  b: LatencyBreakdownResult,
  inputBufferTarget: number,
  tickDtMs: number,
  maxLeadTicks: number,
  rttMs?: number
): number {
  const uplinkMs =
    rttMs === undefined || b.extraUplinkMs !== b.extraDownlinkMs
      ? b.uplinkMs
      : Math.max(0, rttMs * 0.5);
  if (uplinkMs <= 1 && (rttMs ?? b.rttMs) <= 2) return Math.max(1, inputBufferTarget);
  return Math.max(
    inputBufferTarget,
    Math.min(maxLeadTicks, Math.ceil(uplinkMs / tickDtMs) + inputBufferTarget)
  );
}

export function computeDownlinkTicksFromBreakdown(
  b: LatencyBreakdownResult,
  tickDtMs: number,
  rttMs?: number
): number {
  const downlinkMs =
    rttMs === undefined || b.extraUplinkMs !== b.extraDownlinkMs
      ? b.downlinkMs
      : Math.max(0, rttMs * 0.5);
  if (downlinkMs <= 1 && (rttMs ?? b.rttMs) <= 2) return 0;
  return Math.max(1, Math.min(64, Math.ceil(downlinkMs / tickDtMs)));
}

export type HandshakeResponsePayload = Record<string, unknown>;
export type RosterStatePayload = Record<string, unknown>;

export interface PredictionReconcilerOptions {
  localCarIndex?: number;
  redundantHistoryCount?: number;
  enableRedundantBuffer?: boolean;
  useBitPacking?: boolean;
  posTolerance?: number;
  velTolerance?: number;
  rotTolerance?: number;
  ballPosTolerance?: number;
  ballVelTolerance?: number;
  boostTolerance?: number;
  hardSnapThreshold?: number;
  inputBufferTarget?: number;
  catchupThresholdOffset?: number;
  skipThresholdOffset?: number;
  maxLeadTicks?: number;
  maxRollbackFrames?: number;
  enableSmoothing?: boolean;
  enableRedundantInputs?: boolean;
  redundantHistoryTicks?: number;
  interpolator?: {
    physicsRate?: number;
    setPhysicsRate?: (rateHz: number) => void;
    sync?: (nowMs: number) => void;
  } | null;
  clockPacingMode?: string;
  clockPacingPriority?: string;
  clockPacingParams?: PacingControllerParams | null;
  telemetryRecorder?: TelemetryRecorderPort | null;
  resetTelemetryOnStart?: boolean;
  onHardResync?: (() => void) | null;
  lobbyDualWorldMode?: boolean;
  hostLobbyMode?: boolean;
  isMatchTelemetryActive?: boolean;
}
