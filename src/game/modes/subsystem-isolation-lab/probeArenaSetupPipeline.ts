import { DEFAULT_CAR_CONTROLS } from '../../../ai/experimental/experimentalMultiCarObsPipeline.ts';
import type { LabArenaPort, LabPhysicsEnginePort, LabRuntimePort } from './LabTabTypes.ts';
import {
  PROBE_BOOST_SLOT,
  PROBE_QE_SLOT,
  type ProbeControllerState,
  createProbeControllerState,
  getProbeSpawnCoordinates,
} from './probeKinematicsPipeline.ts';

function resetArenaSinglePlayerVisibility(arena: LabArenaPort): void {
  if (arena.cars) {
    if (arena.cars[0]) {
      arena.cars[0].visible = true;
      arena.setCarTeam?.(0, 0);
    }
    for (let i = 1; i < arena.cars.length; i++) {
      if (arena.cars[i]) {
        arena.cars[i].visible = false;
      }
    }
    arena.clearAllGhostOpacities?.();
  }
  arena.resetAllCarEffects?.();
  arena.playerCarIndex = 0;
}

export function resetSinglePlayerLabBaseline(
  runtime: LabRuntimePort | null | undefined,
  resetKickoffState = true
): void {
  if (!runtime?.physics) return;
  const {
    physics,
    arena,
    neutralControls,
    flipResetVisuals,
    boostBloom,
    ballTrajectoryPredictor,
    simulationStage,
    interpolator,
  } = runtime;

  while (physics.numCars > 1 && typeof physics.removeCar === 'function') {
    physics.removeCar(physics.numCars - 1);
  }
  if (physics.numCars < 1) {
    physics.addCar(0, 'octane');
  }
  physics.setCarLinearFactorAndGravity?.(0, 1, 1, 1, 1);
  physics.setCarCollisionMask?.(0, true, true);
  physics.setSimulationFrozen?.(false, 0, false);
  physics.setPossessionReportingEnabled?.(false);
  physics.setUnlimitedBoost(true);

  const neutral = neutralControls || DEFAULT_CAR_CONTROLS;
  for (let slot = 0; slot < 8; slot++) {
    physics.setControls(slot, neutral);
  }

  if (resetKickoffState) {
    physics.resetGoalLatch?.();
    physics.resetKickoff(0, false);
    physics.clearEvents?.();
  }

  if (arena) {
    resetArenaSinglePlayerVisibility(arena);
  }
  if (Array.isArray(flipResetVisuals)) {
    for (const fx of flipResetVisuals) {
      fx?.stopVisual?.();
    }
  }
  boostBloom?.clear?.();
  ballTrajectoryPredictor?.clear?.();
  simulationStage?.resetActionStates?.();
  interpolator?.sync();
  runtime.playerCarIndex = 0;
}

export function parkDevTestLabProbes(
  physics: LabPhysicsEnginePort | null | undefined,
  arena?: LabArenaPort | null
): void {
  if (!physics) return;
  for (let slot = 1; slot < 8; slot++) {
    if (slot < physics.numCars) {
      physics.setCarLinearFactorAndGravity?.(slot, 1, 1, 1, 1);
      physics.setCarCollisionMask?.(slot, true, true);
      physics.setControls(slot, DEFAULT_CAR_CONTROLS);
    }
    if (arena?.cars?.[slot]) {
      arena.cars[slot].visible = false;
    }
    arena?.resetCarBoosts?.(slot);
    arena?.carDemolitions?.[slot]?.stop?.();
  }
  while (physics.numCars > 1 && typeof physics.removeCar === 'function') {
    physics.removeCar(physics.numCars - 1);
  }
}

export function setupDevTestLabProbes(
  physics: LabPhysicsEnginePort | null | undefined,
  arena: LabArenaPort | null | undefined,
  baseZ = 500,
  peakZ = 600,
  offsetX = 0,
  offsetY = 0,
  offsetZ = 0
): ProbeControllerState | null {
  if (!physics) return null;
  const coords = getProbeSpawnCoordinates(baseZ, offsetX, offsetY, offsetZ);

  while (physics.numCars <= PROBE_QE_SLOT) {
    physics.addCar(physics.numCars % 2, 'octane');
  }

  for (let idx = 1; idx < PROBE_BOOST_SLOT; idx++) {
    physics.setCarLinearFactorAndGravity?.(idx, 0, 0, 0, 0);
    physics.setCarCollisionMask?.(idx, false, false);
    physics.setCarState(idx, {
      pos: [-5500, idx * 300, -500],
      vel: [0, 0, 0],
      angVel: [0, 0, 0],
      boost: 0,
      isOnGround: false,
    });
    if (arena?.cars?.[idx]) {
      arena.cars[idx].visible = false;
    }
    arena?.resetCarBoosts?.(idx);
    arena?.carDemolitions?.[idx]?.stop?.();
  }

  if (arena) {
    arena.ensureCar?.(PROBE_BOOST_SLOT, 1, 'fennec');
    arena.ensureCar?.(PROBE_QE_SLOT, 0, 'fennec');
    if (arena.cars[PROBE_BOOST_SLOT]) arena.cars[PROBE_BOOST_SLOT].visible = true;
    if (arena.cars[PROBE_QE_SLOT]) arena.cars[PROBE_QE_SLOT].visible = true;
    arena.resetCarBoosts?.(PROBE_BOOST_SLOT);
    arena.resetCarBoosts?.(PROBE_QE_SLOT);
  }

  physics.setCarCollisionMask?.(PROBE_BOOST_SLOT, false, false);
  physics.setCarState(PROBE_BOOST_SLOT, {
    pos: [coords.boostPos.x, coords.boostPos.y, coords.boostPos.z],
    forward: [0, 0, 1],
    right: [0, 1, 0],
    up: [-1, 0, 0],
    vel: [0, 0, 0],
    angVel: [0, 0, 0],
    boost: 100,
    isOnGround: false,
  });
  physics.setCarLinearFactorAndGravity?.(PROBE_BOOST_SLOT, 0, 0, 1, 1.0);

  physics.setCarCollisionMask?.(PROBE_QE_SLOT, false, false);
  physics.setCarState(PROBE_QE_SLOT, {
    pos: [coords.qePos.x, coords.qePos.y, coords.qePos.z],
    forward: [1, 0, 0],
    right: [0, 1, 0],
    up: [0, 0, 1],
    vel: [0, 0, 0],
    angVel: [0, 0, 0],
    boost: 100,
    isOnGround: false,
  });
  physics.setCarLinearFactorAndGravity?.(PROBE_QE_SLOT, 0, 0, 0, 0.0);

  return createProbeControllerState(baseZ, peakZ, offsetX, offsetY, offsetZ);
}

export function updateDevTestLabProbeParameters(
  physics: LabPhysicsEnginePort | null | undefined,
  probeState: ProbeControllerState | null,
  baseZ = 500,
  peakZ = 600,
  offsetX = 0,
  offsetY = 0,
  offsetZ = 0,
  arena: LabArenaPort | null = null
): ProbeControllerState | null {
  if (!physics) return null;
  if (!probeState || physics.numCars <= PROBE_QE_SLOT) {
    return setupDevTestLabProbes(physics, arena, baseZ, peakZ, offsetX, offsetY, offsetZ);
  }

  const nextState = createProbeControllerState(baseZ, peakZ, offsetX, offsetY, offsetZ);
  nextState.tickCounter = probeState.tickCounter;
  nextState.rollDir = probeState.rollDir;

  const coords = getProbeSpawnCoordinates(
    nextState.baseZ,
    nextState.offsetX,
    nextState.offsetY,
    nextState.offsetZ
  );

  if (physics.numCars > PROBE_BOOST_SLOT) {
    physics.setCarState(PROBE_BOOST_SLOT, {
      pos: [coords.boostPos.x, coords.boostPos.y, coords.boostPos.z],
      forward: [0, 0, 1],
      right: [0, 1, 0],
      up: [-1, 0, 0],
      vel: [0, 0, 0],
      angVel: [0, 0, 0],
      boost: 100,
      isOnGround: false,
    });
    nextState.phase = 'CLIMB_TO_PEAK';
    nextState.holdCounter = 0;
    nextState.lastZ = coords.boostPos.z;
    nextState.lastVz = 0;
    arena?.resetCarBoosts?.(PROBE_BOOST_SLOT);
  }

  if (physics.numCars > PROBE_QE_SLOT) {
    const qeView = physics.getCarStateView(PROBE_QE_SLOT);
    physics.setCarState(PROBE_QE_SLOT, {
      pos: [coords.qePos.x, coords.qePos.y, coords.qePos.z],
      forward: qeView ? [qeView.fwdX, qeView.fwdY, qeView.fwdZ] : [1, 0, 0],
      right: qeView ? [qeView.rightX, qeView.rightY, qeView.rightZ] : [0, 1, 0],
      up: qeView ? [qeView.upX, qeView.upY, qeView.upZ] : [0, 0, 1],
      vel: [0, 0, 0],
      angVel: qeView ? [qeView.angVelX, qeView.angVelY, qeView.angVelZ] : [0, 0, 0],
      boost: 100,
      isOnGround: false,
    });
    arena?.resetCarBoosts?.(PROBE_QE_SLOT);
  }

  return nextState;
}
