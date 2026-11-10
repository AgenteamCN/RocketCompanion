import { DEFAULT_CAR_CONTROLS } from '../../../ai/experimental/experimentalMultiCarObsPipeline.ts';
import type { LabPhysicsEnginePort } from './LabTabTypes.ts';

export const PROBE_BOOST_SLOT = 6;
export const PROBE_QE_SLOT = 7;

export const DEFAULT_PROBE_ANCHOR_X = -2500;
export const DEFAULT_PROBE_BOOST_Y = -400;
export const DEFAULT_PROBE_QE_Y = 400;

export type ProbeBoostPhase = 'CLIMB_TO_PEAK' | 'FALL_BELOW_BASE' | 'RECOVER_AND_HOLD';
export type ProbePhase = ProbeBoostPhase | string;

export interface ProbeControllerState {
  phase: ProbeBoostPhase;
  baseZ: number;
  peakZ: number;
  baseAltitudeZ: number;
  peakAltitudeZ: number;
  offsetX: number;
  offsetY: number;
  offsetZ: number;
  boostProbePosX: number;
  boostProbePosY: number;
  qeProbePosX: number;
  qeProbePosY: number;
  effectiveBaseZ: number;
  effectivePeakZ: number;
  toleranceZ: number;
  targetHoldTicks: number;
  holdCounter: number;
  lastZ: number;
  lastVz: number;
  rollDir: number;
  tickCounter: number;
}

export interface ProbeSpawnCoordinates {
  boostPos: { x: number; y: number; z: number };
  qePos: { x: number; y: number; z: number };
}

export interface ProbeKinematicsStepInput {
  curZ: number;
  curVz: number;
  effectiveBaseZ: number;
  effectivePeakZ: number;
  toleranceZ: number;
  targetHoldTicks: number;
  phase: ProbeBoostPhase;
  holdCounter: number;
}

export interface ProbeKinematicsStepOutput {
  nextPhase: ProbeBoostPhase;
  nextHoldCounter: number;
  shouldBoost: boolean;
  reanchorAtBase: boolean;
}

export interface ProbeTelemetrySnapshot {
  posX: number;
  posY: number;
  posZ: number;
  velZ: number;
  phase: ProbeBoostPhase;
  holdCounter: number;
  rollDir: number;
}

export interface ProbeStepResult {
  nextState: ProbeControllerState;
  telemetry: ProbeTelemetrySnapshot;
}

export function getProbeSpawnCoordinates(
  baseZ = 500,
  offsetX = 0,
  offsetY = 0,
  offsetZ = 0
): ProbeSpawnCoordinates {
  const ox = Number.isFinite(offsetX) ? offsetX : 0;
  const oy = Number.isFinite(offsetY) ? offsetY : 0;
  const oz = Number.isFinite(offsetZ) ? offsetZ : 0;
  const z0 = (Number.isFinite(baseZ) ? baseZ : 500) + oz;
  return {
    boostPos: {
      x: DEFAULT_PROBE_ANCHOR_X + ox,
      y: DEFAULT_PROBE_BOOST_Y + oy,
      z: z0,
    },
    qePos: {
      x: DEFAULT_PROBE_ANCHOR_X + ox,
      y: DEFAULT_PROBE_QE_Y + oy,
      z: z0 + 50,
    },
  };
}

export function createProbeControllerState(
  baseZ = 500,
  peakZ = 600,
  offsetX = 0,
  offsetY = 0,
  offsetZ = 0
): ProbeControllerState {
  const safeBaseZ = Number.isFinite(baseZ) ? baseZ : 500;
  const safePeakZ = Number.isFinite(peakZ) ? peakZ : 600;
  const ox = Number.isFinite(offsetX) ? offsetX : 0;
  const oy = Number.isFinite(offsetY) ? offsetY : 0;
  const oz = Number.isFinite(offsetZ) ? offsetZ : 0;
  const effectiveBaseZ = safeBaseZ + oz;
  const effectivePeakZ = Math.max(effectiveBaseZ + 20, safePeakZ + oz);
  const coords = getProbeSpawnCoordinates(safeBaseZ, ox, oy, oz);
  return {
    phase: 'CLIMB_TO_PEAK',
    baseZ: safeBaseZ,
    peakZ: safePeakZ,
    baseAltitudeZ: safeBaseZ,
    peakAltitudeZ: safePeakZ,
    offsetX: ox,
    offsetY: oy,
    offsetZ: oz,
    boostProbePosX: coords.boostPos.x,
    boostProbePosY: coords.boostPos.y,
    qeProbePosX: coords.qePos.x,
    qeProbePosY: coords.qePos.y,
    effectiveBaseZ,
    effectivePeakZ,
    toleranceZ: 10,
    targetHoldTicks: 120,
    holdCounter: 0,
    lastZ: effectiveBaseZ,
    lastVz: 0,
    rollDir: 1,
    tickCounter: 0,
  };
}

export const computeDevTestLabProbeSpawn = createProbeControllerState;

export function evaluateBoostProbeKinematics(
  input: ProbeKinematicsStepInput
): ProbeKinematicsStepOutput {
  const {
    curZ,
    curVz,
    effectiveBaseZ: z0,
    effectivePeakZ: z1,
    toleranceZ: tol,
    targetHoldTicks,
  } = input;

  let nextPhase: ProbeBoostPhase = input.phase;
  let nextHoldCounter = input.holdCounter;
  let shouldBoost = false;
  let reanchorAtBase = false;

  if (nextPhase === 'CLIMB_TO_PEAK') {
    if (curZ < z1) {
      shouldBoost = true;
    } else {
      shouldBoost = false;
      nextPhase = 'FALL_BELOW_BASE';
      nextHoldCounter = 0;
    }
  } else if (nextPhase === 'FALL_BELOW_BASE') {
    shouldBoost = false;
    if (curZ < z0) {
      nextPhase = 'RECOVER_AND_HOLD';
      nextHoldCounter = 0;
      shouldBoost = true;
    }
  } else if (nextPhase === 'RECOVER_AND_HOLD') {
    if (curVz > 0) {
      const coastApexZ = curZ + (curVz * curVz) / (2 * 650.0);
      shouldBoost = coastApexZ < z0;
    } else {
      const predictedZ = curZ + curVz * 0.08;
      shouldBoost = predictedZ < z0;
    }

    if (Math.abs(curZ - z0) <= tol && Math.abs(curVz) <= 45) {
      nextHoldCounter++;
      if (nextHoldCounter >= targetHoldTicks) {
        reanchorAtBase = true;
        nextPhase = 'CLIMB_TO_PEAK';
        nextHoldCounter = 0;
        shouldBoost = true;
      }
    } else if (Math.abs(curZ - z0) > tol * 1.5) {
      nextHoldCounter = 0;
    }
  }

  return {
    nextPhase,
    nextHoldCounter,
    shouldBoost,
    reanchorAtBase,
  };
}

export function stepDevTestLabProbes(
  physics: LabPhysicsEnginePort | null | undefined,
  probeState: ProbeControllerState | null
): ProbeStepResult | null {
  if (!physics || !probeState || physics.numCars <= PROBE_QE_SLOT) return null;

  const coords = getProbeSpawnCoordinates(
    probeState.baseZ,
    probeState.offsetX,
    probeState.offsetY,
    probeState.offsetZ
  );
  const boostView = physics.getCarStateView(PROBE_BOOST_SLOT);
  const qeView = physics.getCarStateView(PROBE_QE_SLOT);
  if (!boostView || !qeView) return null;

  const tickCounter = probeState.tickCounter + 1;
  const curZ = boostView.posZ;
  const curVz = boostView.velZ;

  boostView.boost = 100;
  qeView.boost = 100;

  if (
    boostView.fwdZ < 0.995 ||
    Math.abs(boostView.posX - coords.boostPos.x) > 5 ||
    Math.abs(boostView.posY - coords.boostPos.y) > 5
  ) {
    physics.setCarState(PROBE_BOOST_SLOT, {
      pos: [coords.boostPos.x, coords.boostPos.y, curZ],
      forward: [0, 0, 1],
      right: [0, 1, 0],
      up: [-1, 0, 0],
      vel: [0, 0, curVz],
      angVel: [0, 0, 0],
      boost: 100,
      isOnGround: false,
    });
  }

  if (
    Math.abs(qeView.posX - coords.qePos.x) > 5 ||
    Math.abs(qeView.posY - coords.qePos.y) > 5 ||
    Math.abs(qeView.posZ - coords.qePos.z) > 5
  ) {
    physics.setCarState(PROBE_QE_SLOT, {
      pos: [coords.qePos.x, coords.qePos.y, coords.qePos.z],
      forward: [qeView.fwdX, qeView.fwdY, qeView.fwdZ],
      right: [qeView.rightX, qeView.rightY, qeView.rightZ],
      up: [qeView.upX, qeView.upY, qeView.upZ],
      vel: [0, 0, 0],
      angVel: [qeView.angVelX, qeView.angVelY, qeView.angVelZ],
      boost: 100,
      isOnGround: false,
    });
  }

  const z0 = probeState.baseZ + probeState.offsetZ;
  const z1 = probeState.peakZ + probeState.offsetZ;

  const evalOut = evaluateBoostProbeKinematics({
    curZ,
    curVz,
    effectiveBaseZ: z0,
    effectivePeakZ: z1,
    toleranceZ: probeState.toleranceZ,
    targetHoldTicks: probeState.targetHoldTicks,
    phase: probeState.phase,
    holdCounter: probeState.holdCounter,
  });

  let nextPhase = evalOut.nextPhase;
  let nextHoldCounter = evalOut.nextHoldCounter;
  const shouldBoost = evalOut.shouldBoost;

  if (evalOut.reanchorAtBase || !Number.isFinite(curZ)) {
    physics.setCarState(PROBE_BOOST_SLOT, {
      pos: [coords.boostPos.x, coords.boostPos.y, z0],
      forward: [0, 0, 1],
      right: [0, 1, 0],
      up: [-1, 0, 0],
      vel: [0, 0, 0],
      angVel: [0, 0, 0],
      boost: 100,
      isOnGround: false,
    });
    if (!Number.isFinite(curZ)) {
      nextPhase = 'CLIMB_TO_PEAK';
      nextHoldCounter = 0;
    }
  }

  physics.setControls(PROBE_BOOST_SLOT, {
    ...DEFAULT_CAR_CONTROLS,
    throttle: shouldBoost ? 1.0 : 0.0,
    boost: shouldBoost,
  });

  const rollDir = Math.floor(tickCounter / 240) % 2 === 0 ? 1.0 : -1.0;
  physics.setControls(PROBE_QE_SLOT, {
    ...DEFAULT_CAR_CONTROLS,
    roll: rollDir,
    boost: false,
  });

  const nextState: ProbeControllerState = {
    ...probeState,
    phase: nextPhase,
    holdCounter: nextHoldCounter,
    effectiveBaseZ: z0,
    effectivePeakZ: z1,
    lastZ: curZ,
    lastVz: curVz,
    rollDir,
    tickCounter,
  };

  return {
    nextState,
    telemetry: {
      posX: boostView.posX,
      posY: boostView.posY,
      posZ: Number(curZ.toFixed(1)),
      velZ: Number(curVz.toFixed(1)),
      phase: nextPhase,
      holdCounter: nextHoldCounter,
      rollDir,
    },
  };
}
