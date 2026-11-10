/**
 * DiagnosticsTestVehicles.ts
 * Pure, zero-dependency deterministic control generators and coordinator
 * for the 2 In-Arena Lobby Network Quality Prediction Probes (matching Developer Test Lab).
 */

import {
  ZERO_G_ANCHOR_MODES,
  getProbeAltitudeControllerState,
  configureZeroGVehiclePhysics,
  releaseZeroGVehiclePhysics,
  enforceZeroGFleetConstraints,
  type DiagnosticVehicleSpec,
} from './ZeroGDiagnosticLab.ts';

export type { DiagnosticVehicleSpec };

export type DiagnosticFleetEntry = DiagnosticVehicleSpec;

export const DIAGNOSTIC_VEHICLE_PROFILES = Object.freeze({
  BOOST_PULSE: 'boost_pulse',
  QE_ROLL: 'qe_roll',
  SINE_STEER: 'sine_steer',
} as const);

export const DEFAULT_DIAGNOSTIC_FLEET: readonly DiagnosticVehicleSpec[] = Object.freeze([
  Object.freeze({
    carIndex: 6,
    team: 0,
    name: 'Boost',
    profile: DIAGNOSTIC_VEHICLE_PROFILES.BOOST_PULSE,
    label: 'Boost',
    baseAltitudeZ: 500,
    peakAltitudeZ: 600,
    spawnPos: Object.freeze({ x: -2500, y: -400, z: 500 }),
  }),
  Object.freeze({
    carIndex: 7,
    team: 1,
    name: 'Roll',
    profile: DIAGNOSTIC_VEHICLE_PROFILES.QE_ROLL,
    label: 'Roll',
    spawnPos: Object.freeze({ x: -2500, y: 400, z: 550 }),
  }),
]);

export interface DiagnosticControlsOptions {
  carIndex?: number;
  baseAltitudeZ?: number;
  peakAltitudeZ?: number;
  posZ?: number;
  velZ?: number;
  climbMode?: string;
  anchorMode?: string;
  periodTicks?: number;
  dutyTicks?: number;
  reverseEveryTicks?: number;
  throttle?: number;
}

export interface DiagnosticCarControls {
  throttle: number;
  steer: number;
  pitch: number;
  yaw: number;
  roll: number;
  jump: boolean;
  boost: boolean;
  handbrake: boolean;
}

export interface DiagnosticVehicleTickOutput {
  carIndex: number;
  team: number;
  profile: string;
  controls: DiagnosticCarControls;
}

export function computeDiagnosticVehicleControls(
  profile: string,
  tick: number,
  options: DiagnosticControlsOptions = {}
): DiagnosticCarControls {
  const safeTick = Math.max(0, Math.floor(tick || 0));

  switch (profile) {
    case DIAGNOSTIC_VEHICLE_PROFILES.BOOST_PULSE: {
      const z0 = options.baseAltitudeZ ?? 500;
      const z1 = options.peakAltitudeZ ?? 600;
      const st = getProbeAltitudeControllerState(options.carIndex ?? 6);
      const posZ =
        typeof options.posZ === 'number' && Number.isFinite(options.posZ) ? options.posZ : st.posZ;
      const velZ =
        typeof options.velZ === 'number' && Number.isFinite(options.velZ) ? options.velZ : st.velZ;
      const mode = options.climbMode || st.mode;

      let isBoosting = false;
      if (options.anchorMode === ZERO_G_ANCHOR_MODES.ZERO_G_LOCKED) {
        const periodTicks = options.periodTicks || 60;
        const dutyTicks = options.dutyTicks || 15;
        isBoosting = safeTick % periodTicks < dutyTicks;
      } else if (typeof st.shouldBoost === 'boolean') {
        isBoosting = st.shouldBoost;
      } else if (mode === 'CLIMB_TO_PEAK' || mode === 'CLIMB_Z1') {
        isBoosting = posZ < z1;
      } else if (mode === 'FALL_BELOW_BASE' || mode === 'FALL_Z0') {
        isBoosting = false;
      } else {
        if (velZ > 0) {
          const coastApexZ = posZ + (velZ * velZ) / (2 * 650.0);
          isBoosting = coastApexZ < z0;
        } else {
          const predictedZ = posZ + velZ * 0.08;
          isBoosting = predictedZ < z0;
        }
      }

      return {
        throttle: isBoosting ? 1.0 : 0.0,
        steer: 0.0,
        pitch: 0.0,
        yaw: 0.0,
        roll: 0.0,
        jump: false,
        boost: isBoosting,
        handbrake: false,
      };
    }

    case DIAGNOSTIC_VEHICLE_PROFILES.QE_ROLL: {
      const reverseEveryTicks = options.reverseEveryTicks || 240;
      const rollDir = Math.floor(safeTick / reverseEveryTicks) % 2 === 0 ? 1.0 : -1.0;
      return {
        throttle: 0.0,
        steer: 0.0,
        pitch: 0.0,
        yaw: 0.0,
        roll: rollDir,
        jump: false,
        boost: false,
        handbrake: false,
      };
    }

    case DIAGNOSTIC_VEHICLE_PROFILES.SINE_STEER: {
      const periodTicks = options.periodTicks || 120;
      const angle = (safeTick * 2 * Math.PI) / periodTicks;
      const steerVal = Number(Math.sin(angle).toFixed(4));
      const pitchVal = Number((0.45 * Math.cos(angle * 0.5)).toFixed(4));
      return {
        throttle: options.throttle ?? 0.6,
        steer: steerVal,
        pitch: pitchVal,
        yaw: steerVal,
        roll: 0.0,
        jump: false,
        boost: false,
        handbrake: false,
      };
    }

    default:
      console.warn(
        `[DiagnosticsTestVehicles:Fallback] Unknown profile "${profile}", returning neutral controls.`
      );
      return {
        throttle: 0.0,
        steer: 0.0,
        pitch: 0.0,
        yaw: 0.0,
        roll: 0.0,
        jump: false,
        boost: false,
        handbrake: false,
      };
  }
}

export class DiagnosticsTestVehicleController {
  fleet: readonly DiagnosticVehicleSpec[];
  enabled = false;
  anchorMode: string;

  constructor(
    fleet: readonly DiagnosticVehicleSpec[] = DEFAULT_DIAGNOSTIC_FLEET,
    options: { anchorMode?: string } = {}
  ) {
    this.fleet = fleet;
    this.anchorMode = options.anchorMode || ZERO_G_ANCHOR_MODES.Z_HOVER;
  }

  configurePhysics(target: any, anchorMode = this.anchorMode): boolean {
    this.anchorMode = anchorMode || ZERO_G_ANCHOR_MODES.Z_HOVER;
    return configureZeroGVehiclePhysics(target, this.fleet, this.anchorMode);
  }

  releasePhysics(target: any): boolean {
    return releaseZeroGVehiclePhysics(target, this.fleet);
  }

  stepTick(tick: number): DiagnosticVehicleTickOutput[] {
    const outputs: DiagnosticVehicleTickOutput[] = [];
    for (let i = 0; i < this.fleet.length; i++) {
      const spec = this.fleet[i];
      const controls = computeDiagnosticVehicleControls(spec.profile, tick, {
        carIndex: spec.carIndex,
        baseAltitudeZ: spec.baseAltitudeZ ?? 500,
        peakAltitudeZ: spec.peakAltitudeZ ?? 600,
        anchorMode: this.anchorMode,
      });
      outputs.push({
        carIndex: spec.carIndex,
        team: spec.team,
        profile: spec.profile,
        controls,
      });
    }
    return outputs;
  }

  enforceConstraints(target: any): void {
    if (!target) return;
    enforceZeroGFleetConstraints(target, this.fleet, this.anchorMode);
  }

  applyToAuthority(target: any, tick: number): DiagnosticVehicleTickOutput[] {
    if (!target) return [];
    enforceZeroGFleetConstraints(target, this.fleet, this.anchorMode);
    const batch = this.stepTick(tick);
    for (let i = 0; i < batch.length; i++) {
      const item = batch[i];
      if (typeof target.setDirectCarControls === 'function') {
        target.setDirectCarControls(item.carIndex, item.controls);
      } else if (typeof target.setCarControls === 'function') {
        target.setCarControls(item.carIndex, item.controls);
      } else if (typeof target.setControls === 'function') {
        target.setControls(item.carIndex, item.controls);
      }
    }
    return batch;
  }
}
