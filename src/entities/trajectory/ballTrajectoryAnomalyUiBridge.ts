import { SIM_OFFSETS } from '../../physics/RocketSimConstants.ts';
import type {
  BallState18Snapshot,
  BallTrajectoryAnomalySummary,
  PredictionSpaceSnapshot,
  TrajectoryAnomalyBufferGroup,
  TrajectoryAnomalySample,
  TrajectoryAnomalyTriggerKind,
  TrajectoryArenaSeamRegion,
} from './ballTrajectoryAnomalyTypes.ts';

function round4(n: number): number {
  return Number.isFinite(n) ? Math.round(n * 10000) / 10000 : 0;
}

function classifyArenaSeamRegion(
  posX: number,
  posY: number,
  posZ: number
): TrajectoryArenaSeamRegion {
  const absX = Math.abs(posX);
  const absY = Math.abs(posY);
  if (absY >= 4920 && absX <= 1050 && posZ <= 780) return 'goal-mouth-lip';
  if (absX + absY >= 7680) return 'corner-curve';
  if (absX >= 3780 && posZ >= 1760) return 'ceiling-sidewall-seam';
  if (absX >= 3780 && posZ <= 285) return 'floor-sidewall-seam';
  if (absY >= 4800 && posZ >= 1760) return 'backwall-ceiling-seam';
  if (absY >= 4800 && posZ <= 285) return 'backwall-floor-seam';
  if (absX >= 3780) return 'sidewall-flat';
  if (absY >= 4800) return 'backwall-flat';
  if (posZ <= 140) return 'floor-flat';
  if (posZ >= 1900) return 'ceiling-flat';
  return 'mid-air';
}

function readBallState18(statePtr: Float32Array): BallState18Snapshot {
  const b = SIM_OFFSETS.BALL;
  const vx = statePtr[b + 12] ?? 0;
  const vy = statePtr[b + 13] ?? 0;
  const vz = statePtr[b + 14] ?? 0;
  const wx = statePtr[b + 15] ?? 0;
  const wy = statePtr[b + 16] ?? 0;
  const wz = statePtr[b + 17] ?? 0;
  return {
    pos: [round4(statePtr[b] ?? 0), round4(statePtr[b + 1] ?? 0), round4(statePtr[b + 2] ?? 0)],
    rotMat: [1, 0, 0, 0, 1, 0, 0, 0, 1],
    vel: [round4(vx), round4(vy), round4(vz)],
    angVel: [round4(wx), round4(wy), round4(wz)],
    speedUuPerSec: round4(Math.hypot(vx, vy, vz)),
    angSpeedRadPerSec: round4(Math.hypot(wx, wy, wz)),
  };
}

function buildCompactSpaceSnapshot(
  spaceId: PredictionSpaceSnapshot['spaceId'],
  anchorTick: number,
  anchorUpdateKind: string,
  ballState: BallState18Snapshot,
  sliceCount: number
): PredictionSpaceSnapshot {
  return {
    spaceId,
    anchorTick,
    anchorUpdateKind,
    anchorBallState18: ballState,
    sliceCount,
    nearSlices: [],
    horizonSlices: [],
  };
}

export class ResidentTrajectoryAnomalyLatch implements TrajectoryAnomalyUiBridgeRecorderPort {
  public activeBufferGroup: TrajectoryAnomalyBufferGroup = 'alpha';
  public alphaSample: TrajectoryAnomalySample | null = null;
  public bravoSample: TrajectoryAnomalySample | null = null;
  public latchedSample: TrajectoryAnomalySample | null = null;
  public sequenceCounter = 0;
  public totalNonCarRecomputes = 0;
  public totalWasmSeamResyncs = 0;
  public spaceATick = -1;
  public spaceAUpdateKind = 'idle';
  public readonly tickHistory: readonly unknown[] = [];

  private _expectedPos: [number, number, number] = [0, 0, 0];
  private _expectedVel: [number, number, number] = [0, 0, 0];
  private _hasExpected = false;
  private _onCaptured: ((sample: TrajectoryAnomalySample) => void) | null = null;

  public setOnAnomalyCaptured(cb: ((sample: TrajectoryAnomalySample) => void) | null): void {
    this._onCaptured = cb;
  }

  public snapshotExpectedFromPredBuffer(
    rawSlices: Float32Array,
    sliceCount: number,
    deltaTicks: number
  ): void {
    if (sliceCount <= 1) {
      this._hasExpected = false;
      return;
    }
    const idx = Math.max(0, Math.min(sliceCount - 1, Math.max(0, deltaTicks))) * 9;
    this._expectedPos = [rawSlices[idx] ?? 0, rawSlices[idx + 1] ?? 0, rawSlices[idx + 2] ?? 0];
    this._expectedVel = [rawSlices[idx + 3] ?? 0, rawSlices[idx + 4] ?? 0, rawSlices[idx + 5] ?? 0];
    this._hasExpected = true;
  }

  public evaluateTick(params: {
    statePtr: Float32Array;
    currentTick: number;
    lastCarBallHitTick: number;
    updateKind: string;
    needFull: boolean;
    wasIncrementalShift: boolean;
    carBallHitEvent: boolean;
    intentionalReset: boolean;
    deviationThresholdUu: number;
    actualSliceCount: number;
    closestSurfaceGapUu: number;
  }): void {
    const {
      statePtr,
      currentTick,
      lastCarBallHitTick,
      updateKind,
      needFull,
      wasIncrementalShift,
      carBallHitEvent,
      intentionalReset,
      deviationThresholdUu,
      actualSliceCount,
      closestSurfaceGapUu,
    } = params;

    const ticksSinceLastCarHit =
      lastCarBallHitTick >= 0 ? Math.max(0, currentTick - lastCarBallHitTick) : 99999;
    const isCarHitOrLaunch =
      carBallHitEvent ||
      intentionalReset ||
      updateKind === 'full-car-hit' ||
      updateKind === 'full-initial' ||
      this.spaceATick < 0 ||
      closestSurfaceGapUu <= 24.0 ||
      (ticksSinceLastCarHit <= 10 && closestSurfaceGapUu <= 32.0);

    if (isCarHitOrLaunch) {
      this.spaceATick = currentTick;
      this.spaceAUpdateKind = updateKind;
      return;
    }

    const isSeamResync = updateKind === 'wasm-seam-resync' || (!needFull && !wasIncrementalShift);
    if (isSeamResync) this.totalWasmSeamResyncs += 1;

    const liveBall = readBallState18(statePtr);
    const posErrorUu = this._hasExpected
      ? round4(
          Math.hypot(
            liveBall.pos[0] - this._expectedPos[0],
            liveBall.pos[1] - this._expectedPos[1],
            liveBall.pos[2] - this._expectedPos[2]
          )
        )
      : 0;
    const velErrorUuPerSec = this._hasExpected
      ? round4(
          Math.hypot(
            liveBall.vel[0] - this._expectedVel[0],
            liveBall.vel[1] - this._expectedVel[1],
            liveBall.vel[2] - this._expectedVel[2]
          )
        )
      : 0;

    const isDeviation = updateKind === 'full-deviation';
    const isWorldBounce = updateKind === 'full-world-bounce';
    const isVelMismatch = this._hasExpected && velErrorUuPerSec >= 18.0 && closestSurfaceGapUu > 45;
    if (
      !isDeviation &&
      !isWorldBounce &&
      !isVelMismatch &&
      !(isSeamResync && velErrorUuPerSec >= 0.35)
    ) {
      return;
    }

    this.totalNonCarRecomputes += 1;
    this.sequenceCounter += 1;
    const group = this.activeBufferGroup;
    const triggerKind: TrajectoryAnomalyTriggerKind = isDeviation
      ? 'full-deviation'
      : isWorldBounce
        ? 'full-world-bounce'
        : isSeamResync
          ? 'wasm-seam-resync'
          : 'velocity-step-mismatch';
    const seamRegion = classifyArenaSeamRegion(liveBall.pos[0], liveBall.pos[1], liveBall.pos[2]);
    const ticksSinceSpaceAAnchor =
      this.spaceATick >= 0 ? Math.max(0, currentTick - this.spaceATick) : 0;

    const sample: TrajectoryAnomalySample = {
      id: `traj-anomaly-${this.sequenceCounter}-${group}-t${currentTick}`,
      sequenceNumber: this.sequenceCounter,
      bufferGroup: group,
      capturedAtIso: new Date().toISOString(),
      triggerKind,
      seamRegion,
      anomalyTick: currentTick,
      ticksSinceLastCarHit,
      ticksSinceSpaceAAnchor,
      closestCarSurfaceGapUu: closestSurfaceGapUu,
      deviationThresholdUu,
      metrics: {
        posErrorUu,
        velErrorUuPerSec,
        angVelErrorRadPerSec: 0,
        wasmSlice0PosErrorUu: 0,
        wasmSlice0VelErrorUuPerSec: 0,
        wasmSlice0AngVelErrorRadPerSec: 0,
        tailContinuityErrorUu: 0,
        spaceADirectOffsetIndex: ticksSinceSpaceAAnchor,
        spaceADirectPosErrorUu: posErrorUu,
        spaceADirectVelErrorUuPerSec: velErrorUuPerSec,
        spaceADirectAngVelErrorRadPerSec: 0,
        posDeltaVec: [0, 0, 0],
        velDeltaVec: [0, 0, 0],
        angVelDeltaVec: [0, 0, 0],
      },
      liveBallAtAnomaly: liveBall,
      carsAtAnomaly: [],
      spaceA: buildCompactSpaceSnapshot(
        'space-a-baseline',
        this.spaceATick,
        this.spaceAUpdateKind,
        liveBall,
        actualSliceCount
      ),
      previousTickSpace: buildCompactSpaceSnapshot(
        'prev-tick-expected',
        currentTick - 1,
        updateKind,
        liveBall,
        actualSliceCount
      ),
      spaceB: buildCompactSpaceSnapshot(
        'space-b-recomputed',
        currentTick,
        updateKind,
        liveBall,
        actualSliceCount
      ),
      recentTickHistory: [],
    };

    if (group === 'alpha') {
      this.alphaSample = sample;
      this.activeBufferGroup = 'bravo';
    } else {
      this.bravoSample = sample;
      this.activeBufferGroup = 'alpha';
    }
    this.latchedSample = sample;
    this._onCaptured?.(sample);
  }

  private _retainedSamples(): TrajectoryAnomalySample[] {
    const out: TrajectoryAnomalySample[] = [];
    if (this.alphaSample) out.push(this.alphaSample);
    if (this.bravoSample) out.push(this.bravoSample);
    out.sort((a, b) => a.sequenceNumber - b.sequenceNumber);
    return out;
  }

  public getSummary(): BallTrajectoryAnomalySummary {
    const samples = this._retainedSamples();
    const active = this.latchedSample ?? samples[samples.length - 1] ?? null;
    return {
      armed: true,
      hasLatchedAnomaly: this.latchedSample !== null,
      activeBufferGroup: this.activeBufferGroup,
      alphaSampleId: this.alphaSample?.id ?? null,
      bravoSampleId: this.bravoSample?.id ?? null,
      capturedCount: samples.length,
      totalNonCarRecomputes: this.totalNonCarRecomputes,
      totalWasmSeamResyncs: this.totalWasmSeamResyncs,
      spaceAAnchorTick: this.spaceATick,
      spaceAUpdateKind: this.spaceAUpdateKind,
      latestSample: active
        ? {
            id: active.id,
            sequenceNumber: active.sequenceNumber,
            bufferGroup: active.bufferGroup,
            capturedAtIso: active.capturedAtIso,
            triggerKind: active.triggerKind,
            seamRegion: active.seamRegion,
            anomalyTick: active.anomalyTick,
            ticksSinceLastCarHit: active.ticksSinceLastCarHit,
            ticksSinceSpaceAAnchor: active.ticksSinceSpaceAAnchor,
            closestCarSurfaceGapUu: active.closestCarSurfaceGapUu,
            posErrorUu: active.metrics.posErrorUu,
            velErrorUuPerSec: active.metrics.velErrorUuPerSec,
            angVelErrorRadPerSec: active.metrics.angVelErrorRadPerSec,
            spaceADirectPosErrorUu: active.metrics.spaceADirectPosErrorUu,
            spaceADirectVelErrorUuPerSec: active.metrics.spaceADirectVelErrorUuPerSec,
            tailContinuityErrorUu: active.metrics.tailContinuityErrorUu,
            livePos: active.liveBallAtAnomaly.pos,
            liveVel: active.liveBallAtAnomaly.vel,
            liveSpeedUuPerSec: active.liveBallAtAnomaly.speedUuPerSec,
          }
        : null,
    };
  }

  public resetLatchedAnomaly(): void {
    this.latchedSample = null;
  }

  public clearAllSamples(): void {
    this.latchedSample = null;
    this.alphaSample = null;
    this.bravoSample = null;
    this.activeBufferGroup = 'alpha';
    this.totalNonCarRecomputes = 0;
    this.totalWasmSeamResyncs = 0;
  }

  public buildExportBundle(includeAllSamples = true): Record<string, unknown> {
    const samples = this._retainedSamples();
    const primary = this.latchedSample ?? samples[samples.length - 1] ?? null;
    return {
      schema: 'rocket-companion.ball-trajectory-anomaly-debug.v2',
      exportedAtIso: new Date().toISOString(),
      summary: this.getSummary(),
      bufferGroups: {
        activeArmedGroup: this.activeBufferGroup,
        alpha: this.alphaSample,
        bravo: this.bravoSample,
      },
      latchedSample: primary,
      samples: includeAllSamples ? samples : primary ? [primary] : [],
      currentRollingTickHistory: [],
    };
  }
}

export interface TrajectoryAnomalyUiBridgeRecorderPort {
  buildExportBundle(includeAllSamples?: boolean): Record<string, unknown>;
  getSummary(): BallTrajectoryAnomalySummary;
  resetLatchedAnomaly(): void;
  clearAllSamples(): void;
  setOnAnomalyCaptured(cb: ((sample: TrajectoryAnomalySample) => void) | null): void;
}

export interface TrajectoryAnomalyUiBridgeTunerStore {
  publishTelemetry(telemetry: unknown): void;
  getNotifyAnomalyAlerts?(): boolean;
  registerAnomalyHandlers?(
    handlers: {
      exportJson: (includeAll?: boolean) => void;
      copyJson: (includeAll?: boolean) => Promise<boolean>;
      resetAndArmNext: () => void;
      clearSamples: () => void;
    } | null
  ): void;
}

export function bindBallTrajectoryAnomalyUiBridge(
  recorder: TrajectoryAnomalyUiBridgeRecorderPort,
  tunerStore: TrajectoryAnomalyUiBridgeTunerStore,
  pushNotification?: (config: Record<string, unknown>) => unknown,
  dismissNotification?: (id: string) => unknown
): void {
  const notifId = 'traj-anomaly-captured';

  const exportJson = (includeAll = true): void => {
    const bundle = recorder.buildExportBundle(includeAll);
    const json = JSON.stringify(bundle, null, 2);
    if (typeof document === 'undefined') return;
    const summary = recorder.getSummary();
    const tag = summary.latestSample
      ? `${summary.latestSample.seamRegion}-t${summary.latestSample.anomalyTick}`
      : `samples-${summary.capturedCount}`;
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `ball-trajectory-anomaly-${tag}-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const copyJson = async (includeAll = true): Promise<boolean> => {
    const bundle = recorder.buildExportBundle(includeAll);
    const json = JSON.stringify(bundle, null, 2);
    if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(json);
      return true;
    }
    return false;
  };

  const resetAndArmNext = (): void => {
    recorder.resetLatchedAnomaly();
    dismissNotification?.(notifId);
    tunerStore.publishTelemetry({ anomalySummary: recorder.getSummary() });
  };

  const clearSamples = (): void => {
    recorder.clearAllSamples();
    dismissNotification?.(notifId);
    tunerStore.publishTelemetry({ anomalySummary: recorder.getSummary() });
  };

  tunerStore.registerAnomalyHandlers?.({
    exportJson,
    copyJson,
    resetAndArmNext,
    clearSamples,
  });

  recorder.setOnAnomalyCaptured((sample) => {
    tunerStore.publishTelemetry({ anomalySummary: recorder.getSummary() });
    if (tunerStore.getNotifyAnomalyAlerts?.() === false) return;
    dismissNotification?.(notifId);
    const groupLabel = (sample.bufferGroup ?? 'alpha').toUpperCase();
    pushNotification?.({
      id: notifId,
      type: 'temporary',
      tone: 'warning',
      icon: 'alert-triangle',
      duration: 1000,
      content: `Trajectory Anomaly #${sample.sequenceNumber} [${groupLabel} · ${sample.triggerKind}] @ ${sample.seamRegion} (posErr ${sample.metrics.posErrorUu.toFixed(2)} UU, dVel ${sample.metrics.velErrorUuPerSec.toFixed(1)} UU/s)`,
      buttons: [
        { label: 'Export JSON', color: 'green', onClick: () => exportJson(true) },
        { label: 'Reset & Arm Next', color: 'amber', onClick: () => resetAndArmNext() },
      ],
    });
  });
}
