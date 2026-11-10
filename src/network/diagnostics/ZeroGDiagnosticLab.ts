/**
 * ZeroGDiagnosticLab.ts
 * Pure, Worker-safe controller and telemetry evaluator for the In-Arena 2-Car Prediction Probe Lab
 * and Lobby Ghost Car collision isolation (aligned with Developer Test Lab).
 */

import { CarStateView } from '../../physics/RocketSimStateViews.ts';

export const ZERO_G_ANCHOR_MODES = Object.freeze({
  ZERO_G_LOCKED: '0g_locked',
  Z_HOVER: 'z_hover',
} as const);

export type ZeroGAnchorMode = (typeof ZERO_G_ANCHOR_MODES)[keyof typeof ZERO_G_ANCHOR_MODES];

export const DIAGNOSTIC_OBSERVATION_TARGETS = Object.freeze({
  PLAYER: 0,
  BOOST_PULSE: 6,
  QE_ROLL: 7,
} as const);

export interface DiagnosticVehicleSpawnPos {
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

export interface DiagnosticVehicleSpec {
  readonly carIndex: number;
  readonly team: number;
  readonly name: string;
  readonly profile: string;
  readonly label: string;
  readonly baseAltitudeZ?: number;
  readonly peakAltitudeZ?: number;
  readonly spawnPos?: DiagnosticVehicleSpawnPos;
}

export class ProbeAltitudeControllerState {
  mode: string;
  holdTicks: number;
  posZ: number;
  velZ: number;
  shouldBoost: boolean;

  constructor(mode = 'CLIMB_TO_PEAK', holdTicks = 0, posZ = 500, velZ = 0, shouldBoost = true) {
    this.mode = mode;
    this.holdTicks = holdTicks;
    this.posZ = posZ;
    this.velZ = velZ;
    this.shouldBoost = shouldBoost;
  }

  applyHoverStep(
    posZ: number,
    velZ: number,
    mode: string,
    holdTicks: number,
    shouldBoost: boolean
  ): void {
    this.posZ = posZ;
    this.velZ = velZ;
    this.mode = mode;
    this.holdTicks = holdTicks;
    this.shouldBoost = shouldBoost;
  }
}

export interface DiagnosticFleetTelemetrySample {
  carIndex: number;
  profile: string;
  label: string;
  pos: [number, number, number];
  angSpeedRad: number;
  isBoosting: boolean;
  posDriftUu: number;
  angVelErrorRad: number;
}

const _clientCarView = new CarStateView();
const _serverCarView = new CarStateView();
const _probeClimbState = new Map<number, ProbeAltitudeControllerState>();

export function getProbeAltitudeControllerState(carIndex = 6): ProbeAltitudeControllerState {
  let st = _probeClimbState.get(carIndex);
  if (!st) {
    st = new ProbeAltitudeControllerState('CLIMB_TO_PEAK', 0, 500, 0, true);
    _probeClimbState.set(carIndex, st);
  }
  return st;
}

export interface ZeroGPhysicsEnginePort {
  state?: Float32Array | null;
  numCars?: number;
  setCarLinearFactorAndGravity?: (
    carIndex: number,
    lx: number,
    ly: number,
    lz: number,
    gravityScale: number
  ) => void;
  isCarSlotActive?: (carIndex: number) => boolean;
  addCarAtSlot?: (carIndex: number, team: number, hitbox: string) => void;
  setCarTeam?: (carIndex: number, team: number) => void;
  addCar?: (team: number, hitbox: string) => void;
  removeCar?: (carIndex: number) => void;
  setCarState?: (carIndex: number, state: Record<string, unknown>) => void;
  setCarCollisionMask?: (
    carIndex: number,
    collideWithBall: boolean,
    collideWithCars: boolean
  ) => boolean | number | void;
  getCarStateView?: (carIndex: number) => CarStateView | null;
}

export interface ZeroGTargetPort extends ZeroGPhysicsEnginePort {
  sim?: ZeroGPhysicsEnginePort | null;
  fallbackSim?: ZeroGPhysicsEnginePort | null;
  ensureCar?: (carIndex: number, team: number, hitbox: string) => void;
  registerCarEntity?: (carIndex: number, team: number, hitbox: string) => void;
  unregisterCarEntity?: (carIndex: number) => void;
}

export function resolvePhysicsEngine(
  target: ZeroGTargetPort | null | undefined
): ZeroGPhysicsEnginePort | null {
  if (!target) return null;
  if (typeof target.setCarLinearFactorAndGravity === 'function') return target;
  if (target.sim && typeof target.sim.setCarLinearFactorAndGravity === 'function')
    return target.sim;
  if (target.fallbackSim && typeof target.fallbackSim.setCarLinearFactorAndGravity === 'function') {
    return target.fallbackSim;
  }
  return target.sim || null;
}

export function configureZeroGVehiclePhysics(
  targetSimOrAuthority: ZeroGTargetPort | null | undefined,
  fleet: readonly DiagnosticVehicleSpec[],
  anchorMode: string = ZERO_G_ANCHOR_MODES.Z_HOVER
): boolean {
  const sim = resolvePhysicsEngine(targetSimOrAuthority);
  if (!sim || !targetSimOrAuthority || !Array.isArray(fleet)) return false;

  for (let i = 0; i < fleet.length; i++) {
    const spec = fleet[i];
    if (typeof targetSimOrAuthority.ensureCar === 'function') {
      targetSimOrAuthority.ensureCar(spec.carIndex, spec.team, 'octane');
    } else if (typeof targetSimOrAuthority.registerCarEntity === 'function') {
      targetSimOrAuthority.registerCarEntity(spec.carIndex, spec.team, 'octane');
    } else if (typeof sim.addCarAtSlot === 'function') {
      const alreadyActive =
        typeof sim.isCarSlotActive === 'function' ? sim.isCarSlotActive(spec.carIndex) : false;
      if (!alreadyActive) {
        sim.addCarAtSlot(spec.carIndex, spec.team, 'octane');
      } else {
        sim.setCarTeam?.(spec.carIndex, spec.team);
      }
    } else if (typeof sim.addCar === 'function') {
      while ((sim.numCars ?? 0) <= spec.carIndex) {
        sim.addCar(spec.team, 'octane');
      }
    }

    const isBoostAltitudeProbe = spec.profile === 'boost_pulse' || spec.carIndex === 6;
    const pos = spec.spawnPos || {
      x: -2500,
      y: isBoostAltitudeProbe ? -400 : 400,
      z: isBoostAltitudeProbe ? 500 : 550,
    };

    if (isBoostAltitudeProbe) {
      _probeClimbState.set(
        spec.carIndex,
        new ProbeAltitudeControllerState('CLIMB_TO_PEAK', 0, pos.z, 0, true)
      );
    }

    const initialState = isBoostAltitudeProbe
      ? {
          pos: [pos.x, pos.y, pos.z],
          forward: [0, 0, 1],
          right: [0, 1, 0],
          up: [-1, 0, 0],
          vel: [0, 0, 0],
          angVel: [0, 0, 0],
          boost: 100,
          isOnGround: false,
        }
      : {
          pos: [pos.x, pos.y, pos.z],
          forward: [1, 0, 0],
          right: [0, 1, 0],
          up: [0, 0, 1],
          vel: [0, 0, 0],
          angVel: [0, 0, 0],
          boost: 100,
          isOnGround: false,
        };

    if (typeof sim.setCarState === 'function') {
      sim.setCarState(spec.carIndex, initialState);
    }

    if (typeof sim.setCarCollisionMask === 'function') {
      sim.setCarCollisionMask(spec.carIndex, false, false);
    }

    if (typeof sim.setCarLinearFactorAndGravity === 'function') {
      if (isBoostAltitudeProbe && anchorMode !== ZERO_G_ANCHOR_MODES.ZERO_G_LOCKED) {
        sim.setCarLinearFactorAndGravity(spec.carIndex, 0, 0, 1, 1.0);
      } else {
        sim.setCarLinearFactorAndGravity(spec.carIndex, 0, 0, 0, 0.0);
      }
    }
  }

  return true;
}

export function releaseZeroGVehiclePhysics(
  targetSimOrAuthority: ZeroGTargetPort | null | undefined,
  fleet: readonly DiagnosticVehicleSpec[]
): boolean {
  const sim = resolvePhysicsEngine(targetSimOrAuthority);
  if (!sim || !targetSimOrAuthority || !Array.isArray(fleet)) return false;

  for (let i = 0; i < fleet.length; i++) {
    const spec = fleet[i];
    _probeClimbState.delete(spec.carIndex);
    if (typeof targetSimOrAuthority.unregisterCarEntity === 'function') {
      targetSimOrAuthority.unregisterCarEntity(spec.carIndex);
      continue;
    }
    if (typeof sim.removeCar === 'function') {
      sim.removeCar(spec.carIndex);
    }
  }
  return true;
}

export function setLobbyGhostCarIsolation(
  targetSimOrAuthority: ZeroGTargetPort | null | undefined,
  carIndex = 0,
  isGhost = true,
  interactWithBallWhenGhost = false
): boolean {
  const sim = resolvePhysicsEngine(targetSimOrAuthority);
  if (!sim || typeof sim.setCarCollisionMask !== 'function') return false;
  if (isGhost) {
    return Boolean(sim.setCarCollisionMask(carIndex, Boolean(interactWithBallWhenGhost), false));
  }
  return Boolean(sim.setCarCollisionMask(carIndex, true, true));
}

export function enforceZeroGFleetConstraints(
  targetSimOrAuthority: ZeroGTargetPort | null | undefined,
  fleet: readonly DiagnosticVehicleSpec[],
  anchorMode: string = ZERO_G_ANCHOR_MODES.Z_HOVER
): void {
  const sim = resolvePhysicsEngine(targetSimOrAuthority);
  if (!sim || !sim.state || !Array.isArray(fleet)) return;

  for (let i = 0; i < fleet.length; i++) {
    const spec = fleet[i];
    if (sim.numCars !== undefined && spec.carIndex >= sim.numCars) continue;

    const view =
      typeof sim.getCarStateView === 'function'
        ? sim.getCarStateView(spec.carIndex)
        : _clientCarView.attachCar(sim.state, spec.carIndex);

    if (!view) continue;

    const isBoostAltitudeProbe = spec.profile === 'boost_pulse' || spec.carIndex === 6;
    if (isBoostAltitudeProbe && anchorMode !== ZERO_G_ANCHOR_MODES.ZERO_G_LOCKED) {
      const targetX = spec.spawnPos?.x ?? -2500;
      const targetY = spec.spawnPos?.y ?? -400;
      const z0 = spec.baseAltitudeZ ?? spec.spawnPos?.z ?? 500;
      const z1 = spec.peakAltitudeZ ?? 600;
      const tol = 10;
      const targetHoldTicks = 120;
      const curZ = view.posZ;
      const curVz = view.velZ;
      const st = getProbeAltitudeControllerState(spec.carIndex);
      let nextMode = st.mode;
      let nextHoldTicks = st.holdTicks;
      view.boost = 100;

      if (
        view.fwdZ < 0.995 ||
        Math.abs(view.posX - targetX) > 5 ||
        Math.abs(view.posY - targetY) > 5
      ) {
        sim.setCarState?.(spec.carIndex, {
          pos: [targetX, targetY, curZ],
          forward: [0, 0, 1],
          right: [0, 1, 0],
          up: [-1, 0, 0],
          vel: [0, 0, curVz],
          angVel: [0, 0, 0],
          boost: 100,
          isOnGround: false,
        });
      }

      let shouldBoost = false;
      if (nextMode === 'CLIMB_TO_PEAK' || nextMode === 'CLIMB_Z1') {
        if (curZ < z1) {
          shouldBoost = true;
        } else {
          shouldBoost = false;
          nextMode = 'FALL_BELOW_BASE';
          nextHoldTicks = 0;
        }
      } else if (nextMode === 'FALL_BELOW_BASE' || nextMode === 'FALL_Z0') {
        shouldBoost = false;
        if (curZ < z0) {
          nextMode = 'RECOVER_AND_HOLD';
          nextHoldTicks = 0;
          shouldBoost = true;
        }
      } else {
        if (curVz > 0) {
          const coastApexZ = curZ + (curVz * curVz) / (2 * 650.0);
          shouldBoost = coastApexZ < z0;
        } else {
          const predictedZ = curZ + curVz * 0.08;
          shouldBoost = predictedZ < z0;
        }

        if (Math.abs(curZ - z0) <= tol && Math.abs(curVz) <= 45) {
          nextHoldTicks++;
          if (nextHoldTicks >= targetHoldTicks) {
            sim.setCarState?.(spec.carIndex, {
              pos: [targetX, targetY, z0],
              forward: [0, 0, 1],
              right: [0, 1, 0],
              up: [-1, 0, 0],
              vel: [0, 0, 0],
              angVel: [0, 0, 0],
              boost: 100,
              isOnGround: false,
            });
            nextMode = 'CLIMB_TO_PEAK';
            nextHoldTicks = 0;
            shouldBoost = true;
          }
        } else if (Math.abs(curZ - z0) > tol * 1.5) {
          nextHoldTicks = 0;
        }
      }

      if (!Number.isFinite(curZ) || curZ < 80 || curZ > 1200) {
        sim.setCarState?.(spec.carIndex, {
          pos: [targetX, targetY, z0],
          forward: [0, 0, 1],
          right: [0, 1, 0],
          up: [-1, 0, 0],
          vel: [0, 0, 0],
          angVel: [0, 0, 0],
          boost: 100,
          isOnGround: false,
        });
        nextMode = 'CLIMB_TO_PEAK';
        nextHoldTicks = 0;
        shouldBoost = true;
      }

      st.applyHoverStep(curZ, curVz, nextMode, nextHoldTicks, shouldBoost);
    } else {
      const targetX = spec.spawnPos?.x ?? -2500;
      const targetY = spec.spawnPos?.y ?? 400;
      const targetZ = spec.spawnPos?.z ?? 550;
      if (
        Math.abs(view.posX - targetX) > 5 ||
        Math.abs(view.posY - targetY) > 5 ||
        Math.abs(view.posZ - targetZ) > 5
      ) {
        sim.setCarState?.(spec.carIndex, {
          pos: [targetX, targetY, targetZ],
          forward: [1, 0, 0],
          right: [0, 1, 0],
          up: [0, 0, 1],
          vel: [0, 0, 0],
          angVel: [view.angVelX, view.angVelY, view.angVelZ],
          boost: 100,
          isOnGround: false,
        });
      }
      if (view.boost < 80) {
        view.boost = 100;
      }
    }
  }
}

export function sampleDiagnosticFleetTelemetry(
  clientSim: ZeroGPhysicsEnginePort | null | undefined,
  serverStateBuffer: Float32Array | null = null,
  fleet: readonly DiagnosticVehicleSpec[] = []
): DiagnosticFleetTelemetrySample[] {
  if (!clientSim || !clientSim.state || !Array.isArray(fleet)) return [];
  const results: DiagnosticFleetTelemetrySample[] = [];
  const hasServerStateBuf =
    serverStateBuffer instanceof Float32Array &&
    serverStateBuffer.length === clientSim.state.length;

  for (let i = 0; i < fleet.length; i++) {
    const spec = fleet[i];
    if (clientSim.numCars !== undefined && spec.carIndex >= clientSim.numCars) continue;

    _clientCarView.attachCar(clientSim.state, spec.carIndex);
    const posX = _clientCarView.posX;
    const posY = _clientCarView.posY;
    const posZ = _clientCarView.posZ;
    const angSpeed = Math.hypot(
      _clientCarView.angVelX,
      _clientCarView.angVelY,
      _clientCarView.angVelZ
    );
    const isBoosting = Boolean(_clientCarView.isBoosting);

    let posDriftUu = 0;
    let angVelErrorRad = 0;
    if (hasServerStateBuf && serverStateBuffer) {
      _serverCarView.attachCar(serverStateBuffer, spec.carIndex);
      posDriftUu = Math.hypot(
        posX - _serverCarView.posX,
        posY - _serverCarView.posY,
        posZ - _serverCarView.posZ
      );
      angVelErrorRad = Math.hypot(
        _clientCarView.angVelX - _serverCarView.angVelX,
        _clientCarView.angVelY - _serverCarView.angVelY,
        _clientCarView.angVelZ - _serverCarView.angVelZ
      );
    } else if (spec.spawnPos) {
      posDriftUu = Math.hypot(posX - spec.spawnPos.x, posY - spec.spawnPos.y);
    }

    results.push({
      carIndex: spec.carIndex,
      profile: spec.profile,
      label: spec.label,
      pos: [Number(posX.toFixed(1)), Number(posY.toFixed(1)), Number(posZ.toFixed(1))],
      angSpeedRad: Number(angSpeed.toFixed(2)),
      isBoosting,
      posDriftUu: Number(posDriftUu.toFixed(2)),
      angVelErrorRad: Number(angVelErrorRad.toFixed(2)),
    });
  }

  return results;
}
