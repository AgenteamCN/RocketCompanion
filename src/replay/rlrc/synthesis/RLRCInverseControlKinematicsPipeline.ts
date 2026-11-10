/**
 * RLRCInverseControlKinematicsPipeline.ts
 * Frame-to-frame inverse control inference for boost, handbrake, active flags, and analog controls at 120Hz.
 */

import {
  RLRC_FIXED_DT,
  type RLRCCarComponentActiveFlags,
  type RLRCCarFrameState120Hz,
  type RLRCSynthesizedCarControls,
} from '../RLRCReplayTypes.ts';
import {
  AERIAL_DAMPING_PITCH,
  AERIAL_DAMPING_ROLL,
  AERIAL_DAMPING_YAW,
  AERIAL_TORQUE_PITCH,
  AERIAL_TORQUE_ROLL,
  AERIAL_TORQUE_YAW,
  applyDeadzone,
  BOOST_ACCEL_AIR_UU,
  BOOST_ACCEL_GROUND_UU,
  BRAKE_DECEL_GROUND_UU,
  clampUnit,
  COAST_DECEL_GROUND_UU,
  computeFrameKinematics,
  distVec3,
  evaluateGroundSteerCurvature,
  evaluateGroundThrottleMaxAccel,
  NEUTRAL_ACTIVE_FLAGS,
  NEUTRAL_SYNTHESIZED_CONTROLS,
  solveAerialAxisWithDamping,
  THROTTLE_AIR_ACCEL_UU,
  type FrameKinematicsSample,
} from './RLRCCarKinematicsMathPipeline.ts';

export interface RLRCControlSynthesisOptions {
  readonly dtSeconds?: number;
  readonly preferReplicatedGroundControls?: boolean;
  readonly smoothWindowRadius?: 0 | 1 | 2;
  readonly deadzone?: number;
  readonly allowZeroDrainKinematicBoost?: boolean;
}

export function inferBoostStateFromKinematics(
  prevCar: RLRCCarFrameState120Hz | null | undefined,
  currCar: RLRCCarFrameState120Hz,
  nextCar: RLRCCarFrameState120Hz | null | undefined,
  kin: FrameKinematicsSample,
  dt: number,
  allowZeroDrainBoost = false
): boolean {
  const hasReserve =
    currCar.boostAmount > 0.05 || Boolean(prevCar?.entityActive && prevCar.boostAmount > 0.15);
  if (!hasReserve) return false;
  if (currCar.activeFlags.boostActive || currCar.controls.boost) return true;

  if (!kin.teleported && prevCar?.entityActive) {
    const drop = prevCar.boostAmount - currCar.boostAmount;
    const rate = drop / Math.max(dt, 1e-4);
    if (drop > 0 && drop <= 6.0 && rate >= 8.5 && rate <= 120.0) return true;
  }
  if (
    !kin.teleported &&
    prevCar?.entityActive &&
    nextCar?.entityActive &&
    distVec3(nextCar.rigidBody.position, currCar.rigidBody.position) <= 360
  ) {
    const drop = prevCar.boostAmount - nextCar.boostAmount;
    const rate = drop / Math.max(2 * dt, 1e-4);
    if (drop > 0 && drop <= 10.0 && rate >= 8.5 && rate <= 120.0) return true;
  }
  if (!allowZeroDrainBoost) return false;

  if (currCar.isOnGround) {
    const maxDrive = evaluateGroundThrottleMaxAccel(Math.abs(kin.localForwardVel));
    return (
      currCar.boostAmount > 0.5 &&
      kin.localForwardVel > 100 &&
      kin.nonGravityForwardAccel > maxDrive + 520
    );
  }
  const dodgeImp =
    kin.angAccelMag > 18.0 &&
    kin.flipOmegaMag > 3.5 &&
    (kin.planarAccelMag > 1350 || kin.angAccelMag > 25.0);
  return (
    currCar.boostAmount > 0.5 &&
    !currCar.activeFlags.dodgeActive &&
    !dodgeImp &&
    kin.nonGravityForwardAccel > 560
  );
}

export function inferHandbrakeFromKinematics(
  prevCar: RLRCCarFrameState120Hz | null | undefined,
  currCar: RLRCCarFrameState120Hz,
  kin: FrameKinematicsSample,
  synthesizedRoll: number,
  framesSinceLanding = 999
): boolean {
  const repHb = Boolean(currCar.controls.handbrake);
  if (!currCar.isOnGround) return repHb && Math.abs(synthesizedRoll) > 0.22;
  if (repHb) return true;

  if (kin.planarSpeed > 180) {
    const slip = Math.abs(kin.localRightVel) / kin.planarSpeed;
    if (slip > 0.22 && (Math.abs(kin.omegaYaw) > 0.85 || Math.abs(kin.localRightVel) > 155)) {
      return true;
    }
    if (
      (framesSinceLanding <= 12 || (prevCar?.entityActive && !prevCar.isOnGround)) &&
      kin.planarSpeed > 200 &&
      slip > 0.16
    ) {
      return true;
    }
  }
  if (kin.planarSpeed > 140 && Math.abs(kin.omegaYaw) > 1.5) {
    const maxYaw = evaluateGroundSteerCurvature(kin.planarSpeed) * Math.abs(kin.localForwardVel);
    if (Math.abs(kin.omegaYaw) > maxYaw * 1.25 + 0.35) return true;
  }
  return false;
}

export function synthesizeCarActiveFlagsBetweenFrames(
  prevCar: RLRCCarFrameState120Hz | null | undefined,
  currCar: RLRCCarFrameState120Hz,
  nextCar?: RLRCCarFrameState120Hz | null,
  options?: RLRCControlSynthesisOptions
): RLRCCarComponentActiveFlags {
  if (!currCar.entityActive) return NEUTRAL_ACTIVE_FLAGS;

  const dt = Math.max(1e-4, options?.dtSeconds ?? RLRC_FIXED_DT);
  const kin = computeFrameKinematics(prevCar, currCar, nextCar, dt);
  const boostActive = inferBoostStateFromKinematics(
    prevCar,
    currCar,
    nextCar,
    kin,
    dt,
    options?.allowZeroDrainKinematicBoost ?? false
  );

  if (currCar.isOnGround) {
    const jRise =
      currCar.activeFlags.jumpActive && !(prevCar?.entityActive && prevCar.activeFlags.jumpActive);
    const lifts =
      Boolean(nextCar?.entityActive && !nextCar.isOnGround) &&
      kin.basis.up.z > 0.25 &&
      (kin.localUpVel > 130 || kin.nonGravityUpAccel > 550);
    return {
      boostActive,
      jumpActive: jRise || lifts,
      doubleJumpActive: false,
      dodgeActive: false,
    };
  }

  const airSec = Math.max(0, currCar.airTimeSinceJump);
  const wasGnd = Boolean(prevCar?.entityActive && prevCar.isOnGround);
  const pJmp = Boolean(prevCar?.entityActive && prevCar.activeFlags.jumpActive);
  const pDj = Boolean(prevCar?.entityActive && prevCar.activeFlags.doubleJumpActive);
  const pDg = Boolean(prevCar?.entityActive && prevCar.activeFlags.dodgeActive);

  const rawDg = currCar.activeFlags.dodgeActive && (!pDg || (!wasGnd && airSec <= 0.72));
  const kinDg =
    airSec >= 0.035 &&
    airSec <= 1.45 &&
    kin.angAccelMag > 18.0 &&
    kin.flipOmegaMag > 3.5 &&
    (kin.planarAccelMag > 1350 || kin.angAccelMag > 25.0);
  const dodgeActive = rawDg || kinDg;

  const netUp =
    kin.nonGravityUpAccel -
    (boostActive ? BOOST_ACCEL_AIR_UU * Math.max(0, kin.basis.forward.z) : 0);
  const rawDj =
    !dodgeActive && currCar.activeFlags.doubleJumpActive && (!pDj || (!wasGnd && airSec <= 0.35));
  const kinDj =
    !dodgeActive &&
    airSec >= 0.045 &&
    airSec <= 1.45 &&
    netUp > 1050 &&
    kin.localUpVel > 150 &&
    kin.flipOmegaMag < 3.4;
  const doubleJumpActive = rawDj || kinDj;

  const rawJmp =
    currCar.activeFlags.jumpActive &&
    (!pJmp || (!wasGnd && airSec <= 0.21) || (wasGnd && kin.localUpVel > 90));
  const kinJmp =
    (wasGnd && kin.basis.up.z > 0.25 && (kin.localUpVel > 135 || netUp > 600)) ||
    (airSec > 0 && airSec <= 0.2 && netUp > 550 && kin.localUpVel > 120);
  const jumpActive = !dodgeActive && !doubleJumpActive && airSec <= 0.22 && (rawJmp || kinJmp);

  return {
    boostActive: dodgeActive && !currCar.activeFlags.boostActive ? false : boostActive,
    jumpActive,
    doubleJumpActive,
    dodgeActive,
  };
}

export function synthesizeCarControlsBetweenFrames(
  prevCar: RLRCCarFrameState120Hz | null | undefined,
  currCar: RLRCCarFrameState120Hz,
  nextCar?: RLRCCarFrameState120Hz | null,
  options?: RLRCControlSynthesisOptions
): RLRCSynthesizedCarControls {
  if (!currCar.entityActive) return NEUTRAL_SYNTHESIZED_CONTROLS;

  const dt = Math.max(1e-4, options?.dtSeconds ?? RLRC_FIXED_DT);
  const preferReplicated = options?.preferReplicatedGroundControls ?? true;
  const dz = options?.deadzone ?? 0.04;

  const kin = computeFrameKinematics(prevCar, currCar, nextCar, dt);
  const flags = synthesizeCarActiveFlagsBetweenFrames(prevCar, currCar, nextCar, options);
  const boost = flags.boostActive;
  const prevFlags = prevCar?.entityActive
    ? synthesizeCarActiveFlagsBetweenFrames(null, prevCar, currCar, options)
    : NEUTRAL_ACTIVE_FLAGS;
  const jump =
    flags.jumpActive ||
    (flags.dodgeActive && !prevFlags.dodgeActive) ||
    (flags.doubleJumpActive && !prevFlags.doubleJumpActive);

  let throttle = 0;
  let steer = 0;
  let pitch = 0;
  let yaw = 0;
  let roll = 0;

  if (currCar.isOnGround) {
    const netAccel = kin.nonGravityForwardAccel - (boost ? BOOST_ACCEL_GROUND_UU : 0);
    if (preferReplicated && Math.abs(currCar.controls.throttle) > 0.01) {
      throttle = clampUnit(currCar.controls.throttle);
    } else if (boost) {
      throttle = 1;
    } else if (
      Math.abs(kin.localForwardVel) > 40 &&
      kin.localForwardVel * netAccel < 0 &&
      Math.abs(netAccel) > COAST_DECEL_GROUND_UU * 1.65
    ) {
      throttle =
        -Math.sign(kin.localForwardVel) * Math.min(1, Math.abs(netAccel) / BRAKE_DECEL_GROUND_UU);
    } else {
      const maxAccel = evaluateGroundThrottleMaxAccel(Math.abs(kin.localForwardVel));
      if (maxAccel > 60) {
        throttle = applyDeadzone(netAccel / maxAccel, dz);
      } else if (Math.abs(kin.localForwardVel) > 1380 && netAccel > -200) {
        throttle = Math.sign(kin.localForwardVel);
      }
    }

    if (preferReplicated && Math.abs(currCar.controls.steer) > 0.01) {
      steer = clampUnit(currCar.controls.steer);
    } else if (Math.abs(kin.localForwardVel) > 25) {
      const maxYaw = Math.max(
        0.15,
        evaluateGroundSteerCurvature(kin.planarSpeed) * Math.abs(kin.localForwardVel)
      );
      steer = applyDeadzone((kin.omegaYaw * (kin.localForwardVel >= 0 ? 1 : -1)) / maxYaw, dz);
    }
  } else {
    pitch = applyDeadzone(
      solveAerialAxisWithDamping(
        kin.alphaPitch,
        kin.omegaPitch,
        AERIAL_TORQUE_PITCH,
        AERIAL_DAMPING_PITCH
      ),
      dz
    );
    yaw = applyDeadzone(
      solveAerialAxisWithDamping(kin.alphaYaw, kin.omegaYaw, AERIAL_TORQUE_YAW, AERIAL_DAMPING_YAW),
      dz
    );
    roll = applyDeadzone(
      solveAerialAxisWithDamping(
        kin.alphaRoll,
        kin.omegaRoll,
        AERIAL_TORQUE_ROLL,
        AERIAL_DAMPING_ROLL
      ),
      dz
    );

    if (preferReplicated && Math.abs(currCar.controls.throttle) > 0.01) {
      throttle = clampUnit(currCar.controls.throttle);
    } else if (boost) {
      throttle = 1;
    } else {
      const airDrive = kin.nonGravityForwardAccel - (boost ? BOOST_ACCEL_AIR_UU : 0);
      throttle = applyDeadzone(airDrive / THROTTLE_AIR_ACCEL_UU, 0.15);
    }

    steer =
      preferReplicated && Math.abs(currCar.controls.steer) > 0.01
        ? clampUnit(currCar.controls.steer)
        : yaw;
  }

  return {
    throttle,
    steer,
    pitch,
    yaw,
    roll,
    jump,
    boost,
    handbrake: inferHandbrakeFromKinematics(prevCar, currCar, kin, roll),
  };
}
