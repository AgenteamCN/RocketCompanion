import type {
  EngineAudioTuningConfig,
  EngineDriveDirection,
} from '../ui-core/config/engineAudioConfig.ts';
import {
  computeVelocityCoupledGearRPM,
  evaluatePowertrainKinetics,
  resolveTouchdownState,
  computeDecelerationTargetRPM,
  type PowertrainTelemetryInput,
} from './EnginePhysicsKinematics.ts';

export type { PowertrainTelemetryInput };

export interface DrivetrainStepResult {
  currentRPM: number;
  targetRPM: number;
  currentGear: number;
  isNeutral: boolean;
  isOnGround: boolean;
  driveDirection: EngineDriveDirection;
  smoothThrottle: number;
  forwardAccelUU: number;
  airborneRevQuotaRemainingSec: number;
  isShiftLocked: boolean;
  isUnderStrain: boolean;
  isInOverdrive: boolean;
  isBoosting: boolean;
  isRevLimiting: boolean;
  shouldTriggerBackfire: boolean;
}

/**
 * Physics-coupled & virtual overdrive drivetrain state machine for Turtle Modem powertrain synthesis.
 */
export class TurtleModemDrivetrainModel {
  currentRPM: number = 900;
  targetRPM: number = 900;
  currentGear: number = 0;
  isNeutral: boolean = true;
  isOnGround: boolean = true;
  wasOnGround: boolean = true;
  driveDirection: EngineDriveDirection = 'stopped';
  smoothThrottle: number = 0;
  wasAccelerating: boolean = false;
  wasActivelyDrivingOnGround: boolean = false;
  wasInOverdrive: boolean = false;
  isInOverdrive: boolean = false;
  isBoosting: boolean = false;
  wasBrakingAgainstMotion: boolean = false;
  revLimiterTimer: number = 0;
  backfireCooldownTimer: number = 0;
  airborneThrottleQuotaSec: number = 1.25;
  prevForwardSpeedUU: number = 0;
  smoothForwardAccelUU: number = 0;
  isShiftLocked: boolean = false;
  isUnderStrain: boolean = false;
  landingRecoveryTimer: number = 0;

  constructor(initialIdleRPM: number = 900) {
    this.currentRPM = initialIdleRPM;
    this.targetRPM = initialIdleRPM;
  }

  resetToZeroSpeedState(idleRPM: number = 900): void {
    this.currentGear = 0;
    this.targetRPM = idleRPM;
    this.currentRPM = idleRPM;
    this.revLimiterTimer = 0;
    this.backfireCooldownTimer = 0;
    this.airborneThrottleQuotaSec = 1.25;
    this.driveDirection = 'stopped';
    this.isNeutral = true;
    this.wasAccelerating = false;
    this.wasActivelyDrivingOnGround = false;
    this.wasInOverdrive = false;
    this.isInOverdrive = false;
    this.isBoosting = false;
    this.wasBrakingAgainstMotion = false;
    this.prevForwardSpeedUU = 0;
    this.smoothForwardAccelUU = 0;
    this.isShiftLocked = false;
    this.isUnderStrain = false;
    this.landingRecoveryTimer = 0;
  }

  private _applyBackfireDrop(cfg: EngineAudioTuningConfig): boolean {
    if (this.backfireCooldownTimer > 0) return false;
    const dropAmount = Math.max(400, cfg.backfireRpmDrop ?? 1650);
    const floorRPM = Math.max(cfg.idleRPM + 150, cfg.downshiftTriggerRPM - 200);
    this.currentRPM = Math.max(floorRPM, this.currentRPM - dropAmount);
    this.targetRPM = Math.min(this.targetRPM, this.currentRPM);
    this.backfireCooldownTimer = Math.max(0.15, cfg.backfireCooldownSec ?? 0.65);
    return true;
  }

  step(
    cfg: EngineAudioTuningConfig,
    rawSpeedUU: number,
    forwardSpeedUU: number,
    rawThrottleInput: number,
    isOnGround: boolean,
    dt: number,
    extra?: {
      steerInput?: number;
      handbrakeInput?: boolean;
      isBoosting?: boolean;
      surfaceUpZ?: number;
    }
  ): DrivetrainStepResult {
    const steerInput = extra?.steerInput ?? 0;
    const handbrakeInput = Boolean(extra?.handbrakeInput);
    const isBoosting = Boolean(extra?.isBoosting);
    this.isBoosting = isBoosting;
    const throttleInput =
      isBoosting && rawThrottleInput >= -0.05 ? Math.max(rawThrottleInput, 1.0) : rawThrottleInput;
    const surfaceUpZ = extra?.surfaceUpZ ?? 1.0;

    if (this.backfireCooldownTimer > 0) {
      this.backfireCooldownTimer = Math.max(0, this.backfireCooldownTimer - dt);
    }

    const kinetics = evaluatePowertrainKinetics(
      cfg,
      forwardSpeedUU,
      this.prevForwardSpeedUU,
      this.smoothForwardAccelUU,
      throttleInput,
      steerInput,
      handbrakeInput,
      isBoosting,
      isOnGround,
      surfaceUpZ,
      dt
    );
    this.prevForwardSpeedUU = forwardSpeedUU;
    this.smoothForwardAccelUU = kinetics.smoothForwardAccelUU;
    this.isShiftLocked = kinetics.isShiftLocked;
    this.isUnderStrain = kinetics.isUnderStrain;

    const justLanded = !this.wasOnGround && isOnGround;
    const justLeftGround = this.wasOnGround && !isOnGround;
    this.wasOnGround = isOnGround;
    this.isOnGround = isOnGround;

    if (isOnGround || justLeftGround) {
      this.airborneThrottleQuotaSec = Math.max(0.1, cfg.airborneRevQuotaDurationSec);
    }

    let shouldTriggerBackfire = false;
    const isStopped = rawSpeedUU <= cfg.zeroSpeedThresholdUU;
    const absThrottle = Math.abs(throttleInput);
    const isStationaryOnGround = isOnGround && isStopped && absThrottle < 0.05;

    let nextDirection: EngineDriveDirection = this.driveDirection;
    if (!isOnGround) {
      nextDirection = 'forward';
    } else if (isStationaryOnGround) {
      nextDirection = 'stopped';
    } else if (forwardSpeedUU < -cfg.zeroSpeedThresholdUU || (isStopped && throttleInput < -0.05)) {
      nextDirection = 'reverse';
    } else if (forwardSpeedUU > cfg.zeroSpeedThresholdUU || (isStopped && throttleInput > 0.05)) {
      nextDirection = 'forward';
    }

    if (cfg.zeroSpeedResetEnabled && isOnGround) {
      const crossedDirection =
        (this.driveDirection === 'forward' && nextDirection === 'reverse') ||
        (this.driveDirection === 'reverse' && nextDirection === 'forward');
      if (isStationaryOnGround || crossedDirection) {
        this.currentGear = isStationaryOnGround ? 0 : 1;
        this.targetRPM = cfg.idleRPM;
        this.currentRPM = cfg.idleRPM;
        this.revLimiterTimer = 0;
        this.isInOverdrive = false;
      }
    }
    this.driveDirection = nextDirection;

    if (isOnGround && !isStationaryOnGround && this.currentGear <= 0) {
      this.currentGear = 1;
    }

    const inAirborneNeutral = cfg.airborneAutoNeutralEnabled && !isOnGround;
    this.isNeutral = inAirborneNeutral || isStationaryOnGround;

    if (justLanded && !isStopped) {
      this.revLimiterTimer = 0;
      const td = resolveTouchdownState(
        cfg,
        kinetics.absForwardSpeedUU,
        Math.max(1, this.currentGear),
        this.currentRPM,
        nextDirection
      );
      this.currentGear = td.gear;
      this.currentRPM = td.currentRPM;
      this.targetRPM = td.targetRPM;
      this.landingRecoveryTimer = td.recoveryTimer;
    }

    if (this.landingRecoveryTimer > 0) {
      this.landingRecoveryTimer = Math.max(0, this.landingRecoveryTimer - dt);
    }

    const isDrivingForward =
      !inAirborneNeutral && throttleInput > 0.05 && forwardSpeedUU >= -cfg.zeroSpeedThresholdUU;
    const isDrivingReverse =
      !inAirborneNeutral && throttleInput < -0.05 && forwardSpeedUU <= cfg.zeroSpeedThresholdUU;
    const isActivelyDrivingOnGround = isDrivingForward || isDrivingReverse;
    const isAirborneRevving =
      inAirborneNeutral && absThrottle > 0.05 && this.airborneThrottleQuotaSec > 0;
    const isEngineUnderThrottle = isActivelyDrivingOnGround || isAirborneRevving;

    if (
      isOnGround &&
      kinetics.isBrakingAgainstMotion &&
      !this.wasBrakingAgainstMotion &&
      this.currentRPM >= Math.min(cfg.backfireTriggerRPM, 2800)
    ) {
      if (this._applyBackfireDrop(cfg)) shouldTriggerBackfire = true;
      this.revLimiterTimer = 0;
    }
    this.wasBrakingAgainstMotion = kinetics.isBrakingAgainstMotion;

    if (this.wasActivelyDrivingOnGround && !isActivelyDrivingOnGround && isOnGround) {
      if (this.wasInOverdrive && this.currentRPM >= cfg.backfireTriggerRPM) {
        if (this._applyBackfireDrop(cfg)) shouldTriggerBackfire = true;
      }
      this.revLimiterTimer = 0;
    } else if (!this.wasActivelyDrivingOnGround && isActivelyDrivingOnGround) {
      this.targetRPM = Math.max(cfg.idleRPM, this.currentRPM);
    }
    this.wasActivelyDrivingOnGround = isActivelyDrivingOnGround;
    this.wasAccelerating = isEngineUnderThrottle;

    if (inAirborneNeutral) {
      this.isInOverdrive = false;
      if (absThrottle > 0.05 && this.airborneThrottleQuotaSec > 0) {
        this.airborneThrottleQuotaSec = Math.max(0, this.airborneThrottleQuotaSec - dt);
        if (this.revLimiterTimer > 0) {
          this.revLimiterTimer -= dt;
          this.targetRPM = Math.max(cfg.idleRPM, cfg.revLimitCutoffRPM - cfg.revLimiterBounceDrop);
        } else {
          this.targetRPM = cfg.revLimitCutoffRPM;
          if (this.currentRPM >= cfg.revLimitCutoffRPM - 15) {
            this.revLimiterTimer = cfg.revLimiterBounceDuration;
            this.targetRPM = Math.max(
              cfg.idleRPM,
              cfg.revLimitCutoffRPM - cfg.revLimiterBounceDrop
            );
          }
        }
      } else {
        this.revLimiterTimer = 0;
        this.targetRPM = Math.max(cfg.idleRPM, this.targetRPM - cfg.rpmDropRate * dt);
      }
    } else if (isStationaryOnGround) {
      this.isInOverdrive = false;
      this.revLimiterTimer = 0;
      this.targetRPM = cfg.idleRPM;
      this.currentRPM = cfg.idleRPM;
    } else if (this.revLimiterTimer > 0) {
      this.revLimiterTimer -= dt;
      this.targetRPM = Math.max(cfg.idleRPM, cfg.revLimitCutoffRPM - cfg.revLimiterBounceDrop);
    } else if (isActivelyDrivingOnGround) {
      const absFwd = kinetics.absForwardSpeedUU;
      const isRev = isDrivingReverse;
      const activeGear = Math.max(1, this.currentGear);
      this.currentGear = activeGear;
      const baseRiseRate = isRev ? cfg.reverseAccelRiseRate : cfg.baseAccelRiseRate;
      const boostMult =
        !isRev && isBoosting ? Math.max(1.0, cfg.boostOverdriveMultiplier ?? 1.85) : 1.0;
      const effectiveRiseRate = baseRiseRate * boostMult;
      const decayBase = isRev ? cfg.reverseGearDecayFactorBase : cfg.gearDecayFactorBase;
      const gearDecay = Math.pow(decayBase, Math.max(0, activeGear - 1));
      const signedAccel = kinetics.smoothForwardAccelUU * (isRev ? -1 : 1);

      const speedCoupledFloorRPM = computeVelocityCoupledGearRPM(
        cfg,
        absFwd,
        activeGear,
        this.driveDirection
      );

      const atMaxSpeedCeiling = isRev
        ? absFwd >= cfg.maxThrottleSpeedUU * 0.96
        : absFwd >= cfg.maxThrottleSpeedUU * 0.97;
      const isVelocityFloorGear = cfg.velocityCoupledGearsEnabled && activeGear === 1;

      if (kinetics.isSevereSpeedCollapse) {
        this.isInOverdrive = false;
        const speedBaseRPM = computeVelocityCoupledGearRPM(cfg, absFwd, 1, this.driveDirection);
        if (absFwd < 360 && this.currentGear > 1) this.currentGear = 1;
        this.targetRPM += (speedBaseRPM - this.targetRPM) * Math.min(1, 14 * dt);
      } else if (kinetics.isDeceleratingOnWallOrBevel) {
        const dipRate = Math.min(1800, Math.abs(signedAccel) * 2.2);
        const minGearFloorRPM =
          this.currentGear > 1 ? cfg.downshiftTriggerRPM + 220 : cfg.idleRPM + 300;
        this.targetRPM = Math.max(minGearFloorRPM, this.targetRPM - dipRate * dt);
      } else {
        let nextTarget = this.targetRPM + effectiveRiseRate * gearDecay * absThrottle * dt;
        if (isVelocityFloorGear && signedAccel > -20) {
          if (speedCoupledFloorRPM >= nextTarget) {
            nextTarget = speedCoupledFloorRPM;
            this.isInOverdrive = atMaxSpeedCeiling;
          } else {
            this.isInOverdrive = atMaxSpeedCeiling || nextTarget - speedCoupledFloorRPM > 260;
          }
        } else {
          this.isInOverdrive = activeGear >= 2 || atMaxSpeedCeiling;
        }
        this.targetRPM = nextTarget;
      }

      if (this.currentRPM >= cfg.revLimitCutoffRPM || this.targetRPM >= cfg.revLimitCutoffRPM) {
        const withinGearCap = cfg.maxGears <= 0 || this.currentGear < cfg.maxGears;
        if (cfg.autoUpshiftEnabled && withinGearCap && !kinetics.isShiftLocked) {
          if (this.isInOverdrive && this.currentRPM >= cfg.backfireTriggerRPM) {
            if (this._applyBackfireDrop(cfg)) shouldTriggerBackfire = true;
          }
          this.currentGear += 1;
          this.targetRPM = cfg.upshiftLandingRPM;
          this.currentRPM = cfg.upshiftLandingRPM;
          this.isInOverdrive = true;
        } else if (this.currentRPM >= cfg.revLimitCutoffRPM) {
          this.revLimiterTimer = cfg.revLimiterBounceDuration;
          this.targetRPM = Math.max(cfg.idleRPM, cfg.revLimitCutoffRPM - cfg.revLimiterBounceDrop);
        }
      }
    } else {
      this.isInOverdrive = false;
      this.targetRPM = computeDecelerationTargetRPM(
        cfg,
        kinetics,
        Math.max(1, this.currentGear),
        this.targetRPM,
        this.driveDirection,
        dt
      );
      if (
        cfg.autoDownshiftEnabled &&
        this.currentGear > 1 &&
        this.currentRPM <= cfg.downshiftTriggerRPM
      ) {
        this.currentGear -= 1;
        const revMatched = cfg.velocityCoupledGearsEnabled
          ? Math.min(
              cfg.downshiftRevMatchPeakRPM,
              Math.max(
                cfg.upshiftLandingRPM,
                computeVelocityCoupledGearRPM(
                  cfg,
                  kinetics.absForwardSpeedUU,
                  this.currentGear,
                  this.driveDirection
                )
              )
            )
          : cfg.downshiftRevMatchPeakRPM;
        this.targetRPM = revMatched;
        this.currentRPM = revMatched;
      }
    }

    this.wasInOverdrive = this.isInOverdrive;
    this.targetRPM = Math.max(cfg.idleRPM, Math.min(cfg.redlineRPM, this.targetRPM));

    const agility = isAirborneRevving
      ? 55
      : isEngineUnderThrottle || this.revLimiterTimer > 0 || this.landingRecoveryTimer > 0
        ? this.landingRecoveryTimer > 0
          ? Math.max(24, cfg.flywheelAgility * 1.5)
          : cfg.flywheelAgility
        : kinetics.isBrakingAgainstMotion
          ? 45
          : Math.max(24, cfg.flywheelAgility * 1.4);
    if (isStationaryOnGround) {
      this.currentRPM = cfg.idleRPM;
    } else {
      this.currentRPM += (this.targetRPM - this.currentRPM) * (1 - Math.exp(-agility * dt));
      this.currentRPM = Math.max(cfg.idleRPM, Math.min(cfg.redlineRPM, this.currentRPM));
    }

    const targetThrottleLoad = isEngineUnderThrottle
      ? Math.min(1.0, absThrottle + (kinetics.isUnderStrain ? 0.15 : 0))
      : 0;
    if (isStationaryOnGround) {
      this.smoothThrottle = 0;
    } else {
      this.smoothThrottle += (targetThrottleLoad - this.smoothThrottle) * Math.min(1, 15 * dt);
    }

    return {
      currentRPM: this.currentRPM,
      targetRPM: this.targetRPM,
      currentGear: this.currentGear,
      isNeutral: this.isNeutral,
      isOnGround: this.isOnGround,
      driveDirection: this.driveDirection,
      smoothThrottle: this.smoothThrottle,
      forwardAccelUU: kinetics.forwardAccelUU,
      airborneRevQuotaRemainingSec: this.airborneThrottleQuotaSec,
      isShiftLocked: this.isShiftLocked,
      isUnderStrain: this.isUnderStrain,
      isInOverdrive: this.isInOverdrive,
      isBoosting: this.isBoosting,
      isRevLimiting: this.revLimiterTimer > 0,
      shouldTriggerBackfire,
    };
  }
}
