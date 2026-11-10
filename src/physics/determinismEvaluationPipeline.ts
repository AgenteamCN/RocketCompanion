/**
 * determinismEvaluationPipeline.ts
 * Pure data pipeline for DeterminismHarness state comparison, snapshot slot priming,
 * and control ring-buffer management.
 */

import type { RocketSimPhysicsEngine } from './RocketSimPhysicsEngine.ts';
import type { CarControlsInput } from './RocketSimSnapshotSerializer.ts';

export interface DeterminismMetrics {
  tickA: number;
  tickB: number;
  totalRollbacks: number;
  currentDepth: number;
  lastRollbackDurationMs: number;
  carDeltaPos: number;
  carDeltaVel: number;
  carDeltaAngVel: number;
  ballDeltaPos: number;
  maxDeltaPos: number;
  maxDeltaVel: number;
  maxDeltaBall: number;
  isBitExact: boolean;
}

export interface DeterminismTickHistorySlot {
  tick: number;
  controls: Record<number, CarControlsInput>;
}

export function createInitialDeterminismMetrics(): DeterminismMetrics {
  return {
    tickA: 0,
    tickB: 0,
    totalRollbacks: 0,
    currentDepth: 0,
    lastRollbackDurationMs: 0,
    carDeltaPos: 0,
    carDeltaVel: 0,
    carDeltaAngVel: 0,
    ballDeltaPos: 0,
    maxDeltaPos: 0,
    maxDeltaVel: 0,
    maxDeltaBall: 0,
    isBitExact: true,
  };
}

export function primeAllSimStateSlots(sim: RocketSimPhysicsEngine, totalSlots = 256): void {
  for (let s = 0; s < totalSlots; s++) {
    sim.saveStateSlot(s);
  }
}

export function pruneControlsHistoryBeforeTick(
  controlsHistory: Array<DeterminismTickHistorySlot | null | undefined>,
  minTick: number
): void {
  const len = controlsHistory.length;
  for (let i = 0; i < len; i++) {
    const entry = controlsHistory[i];
    if (entry && entry.tick < minTick) {
      controlsHistory[i] = null;
    }
  }
}

export function recordTickCarControls(
  controlsHistory: Array<DeterminismTickHistorySlot | null | undefined>,
  historyMask: number,
  lastKnownControls: Map<number, CarControlsInput>,
  currentTick: number,
  carIndex: number,
  controls: CarControlsInput
): void {
  lastKnownControls.set(carIndex, { ...controls });
  const slot = currentTick & historyMask;
  const existing = controlsHistory[slot];
  if (!existing || existing.tick !== currentTick) {
    controlsHistory[slot] = { tick: currentTick, controls: { [carIndex]: { ...controls } } };
  } else {
    existing.controls[carIndex] = { ...controls };
  }
}

export function ensureTickControlsMap(
  controlsHistory: Array<DeterminismTickHistorySlot | null | undefined>,
  historyMask: number,
  lastKnownControls: ReadonlyMap<number, CarControlsInput>,
  tick: number
): Record<number, CarControlsInput> {
  const slot = tick & historyMask;
  const existing = controlsHistory[slot];
  if (!existing || existing.tick !== tick) {
    const controlsMap: Record<number, CarControlsInput> = {};
    for (const [cIdx, ctrl] of lastKnownControls.entries()) {
      controlsMap[cIdx] = { ...ctrl };
    }
    controlsHistory[slot] = { tick, controls: controlsMap };
    return controlsMap;
  }
  return existing.controls;
}

export function evaluateDualArenaStateDelta(
  simA: RocketSimPhysicsEngine,
  simB: RocketSimPhysicsEngine,
  prevMetrics: Readonly<DeterminismMetrics>
): Partial<DeterminismMetrics> {
  const tickA = Math.floor(simA.getHeaderView().tickCount);
  const tickB = Math.floor(simB.getHeaderView().tickCount);

  let carDeltaPos = 0;
  let carDeltaVel = 0;
  let carDeltaAngVel = 0;

  const count = Math.min(simA.numCars || 0, simB.numCars || 0);
  for (let c = 0; c < count; c++) {
    const carA = simA.getCarStateView(c);
    const carB = simB.getCarStateView(c);

    const dPos = Math.hypot(carA.posX - carB.posX, carA.posY - carB.posY, carA.posZ - carB.posZ);
    const dVel = Math.hypot(carA.velX - carB.velX, carA.velY - carB.velY, carA.velZ - carB.velZ);
    const dAng = Math.hypot(
      carA.angVelX - carB.angVelX,
      carA.angVelY - carB.angVelY,
      carA.angVelZ - carB.angVelZ
    );
    if (dPos > carDeltaPos) carDeltaPos = dPos;
    if (dVel > carDeltaVel) carDeltaVel = dVel;
    if (dAng > carDeltaAngVel) carDeltaAngVel = dAng;
  }

  const ballA = simA.getBallStateView();
  const ballB = simB.getBallStateView();
  const ballDeltaPos = Math.hypot(
    ballA.posX - ballB.posX,
    ballA.posY - ballB.posY,
    ballA.posZ - ballB.posZ
  );

  return {
    tickA,
    tickB,
    carDeltaPos,
    carDeltaVel,
    carDeltaAngVel,
    ballDeltaPos,
    maxDeltaPos: Math.max(prevMetrics.maxDeltaPos, carDeltaPos),
    maxDeltaVel: Math.max(prevMetrics.maxDeltaVel, carDeltaVel),
    maxDeltaBall: Math.max(prevMetrics.maxDeltaBall, ballDeltaPos),
    isBitExact: carDeltaPos === 0 && ballDeltaPos === 0,
  };
}
