/**
 * PredictionHistoryBuffer.ts
 * Pure data structure and historical snapshot delta evaluator for client-side prediction.
 * Manages input ring buffer, per-tick multi-car control history, compact state snapshots,
 * remote control acknowledgement recording, and 3-tier reconciliation tolerance evaluation.
 */

const BALL_OFFSET = 4;
const CAR_BASE_OFFSET = 22;
const CAR_STRIDE = 40;

export interface CarControls {
  throttle: number;
  steer: number;
  pitch: number;
  yaw: number;
  roll: number;
  jump: boolean;
  boost: boolean;
  handbrake: boolean;
}

export const NEUTRAL_CAR_CONTROLS: Readonly<CarControls> = Object.freeze({
  throttle: 0,
  steer: 0,
  pitch: 0,
  yaw: 0,
  roll: 0,
  jump: false,
  boost: false,
  handbrake: false,
});

export function cloneCarControls(controls?: Partial<CarControls> | null): CarControls {
  if (!controls) return { ...NEUTRAL_CAR_CONTROLS };
  return {
    throttle: controls.throttle ?? 0,
    steer: controls.steer ?? 0,
    pitch: controls.pitch ?? 0,
    yaw: controls.yaw ?? 0,
    roll: controls.roll ?? 0,
    jump: Boolean(controls.jump),
    boost: Boolean(controls.boost),
    handbrake: Boolean(controls.handbrake),
  };
}

export interface ClientInputRingEntry {
  tick: number;
  carIndex: number;
  controls: CarControls;
}

export interface PredictionTickHistoryEntry {
  tick: number;
  controlsByCar: Record<number, CarControls>;
  snapshot: Float32Array | null;
}

export interface ReconciliationTolerances {
  posTolerance: number;
  velTolerance: number;
  rotTolerance: number;
  ballPosTolerance: number;
  ballVelTolerance: number;
  boostTolerance: number;
  hardSnapThreshold: number;
}

export interface SnapshotComparisonOptions {
  numCars: number;
  localCarIndex: number;
  isLobbyDualWorld: boolean;
  tolerances: ReconciliationTolerances;
  isCarSlotActive?: (carIndex: number) => boolean;
}

export interface HistoricalSnapshotDeltaResult {
  canCompare: boolean;
  withinTier1: boolean;
  exceedsHardSnap: boolean;
  localPosDelta: number;
  localVelDelta: number;
  localRotDelta: number;
  localBoostDelta: number;
  ballPosDelta: number;
  ballVelDelta: number;
  remoteMaxPosDelta: number;
  remoteMaxVelDelta: number;
  probeMaxPosDelta: number;
  probeMaxVelDelta: number;
}

export class LocalClientInputBuffer {
  readonly capacity: number;
  readonly mask: number;
  readonly buffer: Array<ClientInputRingEntry | null>;
  latestTick = -1;

  constructor(capacity = 256) {
    this.capacity = capacity;
    this.mask = capacity - 1;
    this.buffer = new Array(capacity).fill(null);
  }

  record(tick: number, carIndex: number, controls: CarControls): void {
    const slot = tick & this.mask;
    this.buffer[slot] = { tick, carIndex, controls: cloneCarControls(controls) };
    if (tick > this.latestTick) this.latestTick = tick;
  }

  getAtTick(tick: number): ClientInputRingEntry | null {
    if (tick < 0) return null;
    const entry = this.buffer[tick & this.mask];
    return entry && entry.tick === tick ? entry : null;
  }

  getRecentWindow(
    fromTick: number,
    count: number,
    carIndex = 0
  ): Array<{ tick: number; controls: CarControls }> {
    const window: Array<{ tick: number; controls: CarControls }> = [];
    const safeCount = Math.min(Math.max(1, count), 32);
    let lastValidControls: CarControls = { ...NEUTRAL_CAR_CONTROLS };

    const earliest = fromTick - safeCount + 1;
    for (let lookback = 1; lookback <= 16; lookback++) {
      const prior = this.getAtTick(earliest - lookback);
      if (prior && prior.carIndex === carIndex && prior.controls) {
        lastValidControls = prior.controls;
        break;
      }
    }

    for (let i = 0; i < safeCount; i++) {
      const t = fromTick - i;
      if (t < 0) break;
      const entry = this.getAtTick(t);
      if (entry && entry.carIndex === carIndex) {
        lastValidControls = entry.controls;
        window.push({ tick: t, controls: entry.controls });
      } else {
        window.push({ tick: t, controls: { ...lastValidControls } });
      }
    }
    return window;
  }

  clear(): void {
    this.buffer.fill(null);
    this.latestTick = -1;
  }
}

export class PredictionHistoryBuffer {
  readonly capacity: number;
  readonly mask: number;
  readonly slots: Array<PredictionTickHistoryEntry | undefined>;
  readonly clientInputRingBuffer: LocalClientInputBuffer;
  lastLocalControls: CarControls = { ...NEUTRAL_CAR_CONTROLS };
  readonly lastRemoteControls = new Map<number, CarControls>();

  constructor(capacity = 1024, inputRingCapacity = 256) {
    this.capacity = capacity;
    this.mask = capacity - 1;
    this.slots = new Array(capacity);
    this.clientInputRingBuffer = new LocalClientInputBuffer(inputRingCapacity);
  }

  getEntry(tick: number): PredictionTickHistoryEntry | null {
    if (tick < 0) return null;
    const entry = this.slots[tick & this.mask];
    return entry && entry.tick === tick ? entry : null;
  }

  ensureEntry(tick: number): PredictionTickHistoryEntry {
    const idx = tick & this.mask;
    const existing = this.slots[idx];
    if (existing && existing.tick === tick) return existing;
    const created: PredictionTickHistoryEntry = { tick, controlsByCar: {}, snapshot: null };
    this.slots[idx] = created;
    return created;
  }

  getCarControls(tick: number, carIndex: number): CarControls | null {
    return this.getEntry(tick)?.controlsByCar?.[carIndex] ?? null;
  }

  setCarControls(tick: number, carIndex: number, controls: CarControls): CarControls {
    const cloned = cloneCarControls(controls);
    this.ensureEntry(tick).controlsByCar[carIndex] = cloned;
    return cloned;
  }

  saveTickSnapshot(tick: number, sim: any): Float32Array | null {
    const snap =
      typeof sim?.saveCompactState === 'function'
        ? sim.saveCompactState()
        : typeof sim?.saveState === 'function'
          ? sim.saveState()
          : null;
    this.ensureEntry(tick).snapshot = snap;
    return snap;
  }

  getTickSnapshot(tick: number): Float32Array | null {
    return this.getEntry(tick)?.snapshot ?? null;
  }

  recordAcknowledgedRemoteControls(
    acknowledgedControls: any[] | null | undefined,
    localCarIndex: number
  ): number {
    let maxAckCarIndex = 0;
    if (!Array.isArray(acknowledgedControls)) return maxAckCarIndex;
    for (const item of acknowledgedControls) {
      if (!item) continue;
      const carIdx = typeof item.carIndex === 'number' ? item.carIndex : -1;
      if (carIdx > maxAckCarIndex) maxAckCarIndex = carIdx;
      const ctrl = item.controls || item;
      if (carIdx >= 0 && carIdx !== localCarIndex) {
        this.lastRemoteControls.set(carIdx, cloneCarControls(ctrl));
      }
    }
    return maxAckCarIndex;
  }

  getPreviousCommittedControls(tick: number, carIndex: number, localCarIndex: number): CarControls {
    for (let lookback = 1; lookback <= 16; lookback++) {
      const prevTick = tick - lookback;
      if (prevTick < 0) break;
      const ctrl = this.getCarControls(prevTick, carIndex);
      if (ctrl) return ctrl;
    }
    if (carIndex === localCarIndex && this.lastLocalControls) return this.lastLocalControls;
    return { ...NEUTRAL_CAR_CONTROLS };
  }

  backfillMissingLocalInputs(
    fromTick: number,
    toTick: number,
    localCarIndex: number,
    kickoffMaskUntilTick: number
  ): void {
    const startTick = Math.max(0, fromTick);
    for (let t = startTick; t < toTick; t++) {
      const isKickoffMasked = kickoffMaskUntilTick > 0 && t < kickoffMaskUntilTick;
      if (isKickoffMasked) {
        this.setCarControls(t, localCarIndex, NEUTRAL_CAR_CONTROLS);
      } else if (!this.getCarControls(t, localCarIndex)) {
        const fallback = this.getPreviousCommittedControls(t, localCarIndex, localCarIndex);
        this.setCarControls(t, localCarIndex, fallback);
      }
    }
  }

  resolveStepCarControls(
    tick: number,
    carIndex: number,
    localCarIndex: number,
    isKickoffMasked: boolean,
    zeroHoldOrderDuringResim = false
  ): CarControls {
    if (isKickoffMasked) return this.setCarControls(tick, carIndex, NEUTRAL_CAR_CONTROLS);
    const existing = this.getCarControls(tick, carIndex);
    if (existing) return existing;
    if (carIndex === localCarIndex) {
      const held = this.getPreviousCommittedControls(tick, carIndex, localCarIndex);
      return this.setCarControls(tick, carIndex, held);
    }
    const remoteCtrl = this.lastRemoteControls.get(carIndex);
    if (!remoteCtrl) return { ...NEUTRAL_CAR_CONTROLS };
    if (zeroHoldOrderDuringResim) {
      return { ...remoteCtrl, steer: 0, pitch: 0, yaw: 0, roll: 0, jump: false };
    }
    return remoteCtrl;
  }

  stepSimulationRange(
    sim: any,
    fromTick: number,
    toTick: number,
    localCarIndex: number,
    kickoffMaskUntilTick: number,
    useSilentStep: boolean,
    onTickStepped?: (tick: number, committedLocalCtrl: CarControls | null) => void
  ): number {
    const numCars = Math.min(sim.numCars, 8);
    const hasSlotCheck = typeof sim?.isCarSlotActive === 'function';
    let updatedTick = fromTick;
    for (let t = fromTick; t < toTick; t++) {
      const isKickoffMasked = kickoffMaskUntilTick > 0 && t < kickoffMaskUntilTick;
      let committedLocalCtrl: CarControls | null = null;
      for (let c = 0; c < numCars; c++) {
        if (hasSlotCheck && !sim.isCarSlotActive(c)) continue;
        const ctrl = this.resolveStepCarControls(t, c, localCarIndex, isKickoffMasked, false);
        if (c === localCarIndex) {
          committedLocalCtrl = ctrl;
          this.lastLocalControls = { ...ctrl };
        }
        sim.setControls(c, ctrl);
      }
      sim.saveStateSlot(t % 256);
      this.saveTickSnapshot(t, sim);
      if (useSilentStep) sim.stepSilent(1);
      else sim.step(1);
      updatedTick = Math.floor(sim.getHeaderView().tickCount);
      if (onTickStepped) onTickStepped(t, committedLocalCtrl);
    }
    return updatedTick;
  }

  resimulateSilentRange(
    sim: any,
    fromTick: number,
    toTick: number,
    numCars: number,
    localCarIndex: number,
    kickoffMaskUntilTick: number
  ): void {
    const hasSlotCheck = typeof sim?.isCarSlotActive === 'function';
    for (let t = fromTick; t < toTick; t++) {
      const isKickoffMasked = kickoffMaskUntilTick > 0 && t < kickoffMaskUntilTick;
      for (let c = 0; c < numCars; c++) {
        if (hasSlotCheck && !sim.isCarSlotActive(c)) continue;
        const ctrl = this.resolveStepCarControls(t, c, localCarIndex, isKickoffMasked, true);
        sim.setControls(c, ctrl);
      }
      sim.saveStateSlot(t % 256);
      this.saveTickSnapshot(t, sim);
      sim.stepSilent(1);
    }
  }

  clear(): void {
    this.slots.fill(undefined);
    this.clientInputRingBuffer.clear();
    this.lastRemoteControls.clear();
    this.lastLocalControls = { ...NEUTRAL_CAR_CONTROLS };
  }
}

export function evaluateHistoricalSnapshotDelta(
  serverSnap: Float32Array | null | undefined,
  histSnap: Float32Array | null | undefined,
  options: SnapshotComparisonOptions
): HistoricalSnapshotDeltaResult {
  const { numCars, localCarIndex, isLobbyDualWorld, tolerances, isCarSlotActive } = options;
  const minRequiredFloats = CAR_BASE_OFFSET + Math.max(1, numCars) * CAR_STRIDE;

  if (
    !histSnap ||
    !serverSnap ||
    histSnap.length < minRequiredFloats ||
    serverSnap.length < minRequiredFloats
  ) {
    return {
      canCompare: false,
      withinTier1: false,
      exceedsHardSnap: false,
      localPosDelta: 0,
      localVelDelta: 0,
      localRotDelta: 0,
      localBoostDelta: 0,
      ballPosDelta: 0,
      ballVelDelta: 0,
      remoteMaxPosDelta: 0,
      remoteMaxVelDelta: 0,
      probeMaxPosDelta: 0,
      probeMaxVelDelta: 0,
    };
  }

  const sOff = CAR_BASE_OFFSET + localCarIndex * CAR_STRIDE;
  const sPosDelta = Math.hypot(
    serverSnap[sOff] - histSnap[sOff],
    serverSnap[sOff + 1] - histSnap[sOff + 1],
    serverSnap[sOff + 2] - histSnap[sOff + 2]
  );
  const sVelDelta = Math.hypot(
    serverSnap[sOff + 12] - histSnap[sOff + 12],
    serverSnap[sOff + 13] - histSnap[sOff + 13],
    serverSnap[sOff + 14] - histSnap[sOff + 14]
  );
  const fwdDot =
    serverSnap[sOff + 3] * histSnap[sOff + 3] +
    serverSnap[sOff + 4] * histSnap[sOff + 4] +
    serverSnap[sOff + 5] * histSnap[sOff + 5];
  const upDot =
    serverSnap[sOff + 9] * histSnap[sOff + 9] +
    serverSnap[sOff + 10] * histSnap[sOff + 10] +
    serverSnap[sOff + 11] * histSnap[sOff + 11];
  const sRotDelta = Math.max(0, 1.0 - fwdDot) + Math.max(0, 1.0 - upDot);
  const sBoostDelta = Math.abs(serverSnap[sOff + 18] - histSnap[sOff + 18]);

  const sBallPosDelta = Math.hypot(
    serverSnap[BALL_OFFSET] - histSnap[BALL_OFFSET],
    serverSnap[BALL_OFFSET + 1] - histSnap[BALL_OFFSET + 1],
    serverSnap[BALL_OFFSET + 2] - histSnap[BALL_OFFSET + 2]
  );
  const sBallVelDelta = Math.hypot(
    serverSnap[BALL_OFFSET + 12] - histSnap[BALL_OFFSET + 12],
    serverSnap[BALL_OFFSET + 13] - histSnap[BALL_OFFSET + 13],
    serverSnap[BALL_OFFSET + 14] - histSnap[BALL_OFFSET + 14]
  );

  let sRemoteMaxPosDelta = 0,
    sRemoteMaxVelDelta = 0,
    sProbeMaxPosDelta = 0,
    sProbeMaxVelDelta = 0;

  for (let c = 0; c < numCars; c++) {
    if (c === localCarIndex) continue;
    if (isCarSlotActive && !isCarSlotActive(c)) continue;
    const rOff = CAR_BASE_OFFSET + c * CAR_STRIDE;
    const rPosD = Math.hypot(
      serverSnap[rOff] - histSnap[rOff],
      serverSnap[rOff + 1] - histSnap[rOff + 1],
      serverSnap[rOff + 2] - histSnap[rOff + 2]
    );
    const rVelD = Math.hypot(
      serverSnap[rOff + 12] - histSnap[rOff + 12],
      serverSnap[rOff + 13] - histSnap[rOff + 13],
      serverSnap[rOff + 14] - histSnap[rOff + 14]
    );
    if (c >= 6) {
      if (rPosD > sProbeMaxPosDelta) sProbeMaxPosDelta = rPosD;
      if (rVelD > sProbeMaxVelDelta) sProbeMaxVelDelta = rVelD;
    } else {
      if (rPosD > sRemoteMaxPosDelta) sRemoteMaxPosDelta = rPosD;
      if (rVelD > sRemoteMaxVelDelta) sRemoteMaxVelDelta = rVelD;
    }
  }

  const withinTier1 = isLobbyDualWorld
    ? sProbeMaxPosDelta <= tolerances.posTolerance && sProbeMaxVelDelta <= tolerances.velTolerance
    : sPosDelta <= tolerances.posTolerance &&
      sVelDelta <= tolerances.velTolerance &&
      sRotDelta <= tolerances.rotTolerance &&
      sBoostDelta <= tolerances.boostTolerance &&
      sBallPosDelta <= tolerances.ballPosTolerance &&
      sBallVelDelta <= tolerances.ballVelTolerance &&
      sRemoteMaxPosDelta <= tolerances.posTolerance * 2.0 &&
      sRemoteMaxVelDelta <= tolerances.velTolerance * 2.0 &&
      sProbeMaxPosDelta <= tolerances.posTolerance &&
      sProbeMaxVelDelta <= tolerances.velTolerance;

  const hardSnapThreshold = tolerances.hardSnapThreshold ?? 500.0;
  const exceedsHardSnap = isLobbyDualWorld
    ? sProbeMaxPosDelta >= hardSnapThreshold
    : sPosDelta >= hardSnapThreshold || sBallPosDelta >= hardSnapThreshold;

  return {
    canCompare: true,
    withinTier1,
    exceedsHardSnap,
    localPosDelta: isLobbyDualWorld ? sProbeMaxPosDelta : sPosDelta,
    localVelDelta: sVelDelta,
    localRotDelta: sRotDelta,
    localBoostDelta: sBoostDelta,
    ballPosDelta: sBallPosDelta,
    ballVelDelta: sBallVelDelta,
    remoteMaxPosDelta: sRemoteMaxPosDelta,
    remoteMaxVelDelta: sRemoteMaxVelDelta,
    probeMaxPosDelta: sProbeMaxPosDelta,
    probeMaxVelDelta: sProbeMaxVelDelta,
  };
}
