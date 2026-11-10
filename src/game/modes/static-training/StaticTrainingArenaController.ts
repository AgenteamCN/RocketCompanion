import * as THREE from 'three';
import {
  useStaticTrainingPackStore,
  useStaticTrainingBallCamTunerStore,
  hudStore,
} from '../../runtimeUiPort.ts';
import { setTemporaryBallOpacityOverride } from '../../../ui-core/config/ballVisualConfig.ts';
import {
  getPreferredFreeplayTeam,
  getPreferredColorHex,
} from '../../../ui-core/config/vehiclePresets.ts';
import {
  CAR_GROUND_MIN_Z,
  BALL_GROUND_MIN_Z,
  StaticTrainingShotConfig,
  computeEffectiveBallAngVel,
  computeLaunchVelocity,
  computeCarLaunchKinematics,
  computeBallSpinAxisAngle,
} from './ShotGizmoMath.ts';

const _spinAxis = new THREE.Vector3();
const _spinDeltaQuat = new THREE.Quaternion();

export class StaticTrainingArenaController {
  private readonly runtime: Record<string, any> | null;
  public stagedShot: StaticTrainingShotConfig | null = null;
  public effectiveBallAngVel: [number, number, number] = [0, 0, 0];
  public kickoffBallFrozen = false;
  public hasBallMoved = false;
  public lastKickoffStartTick = 0;
  public isBallExpired = false;

  private lastSettledCarKey: string | null = null;
  private lastSettledCarZ: number | null = null;
  private lastBallPreviewKey: string | null = null;
  private lastAppliedEditBallOpacityOverride: number | null | undefined = undefined;

  constructor(runtime: Record<string, any> | null) {
    this.runtime = runtime;
  }

  setBallExpired(expired: boolean): void {
    if (this.isBallExpired !== expired) {
      this.isBallExpired = expired;
      this.syncEditBallOpacityOverride(false, false, true);
    }
  }

  ensureSinglePlayerCar(): void {
    const r = this.runtime;
    const sim = r?.physics;
    if (!sim) return;

    const preferredTeam = getPreferredFreeplayTeam();
    while (sim.numCars > 1 && typeof sim.removeCar === 'function') {
      sim.removeCar(sim.numCars - 1);
    }
    if (sim.numCars < 1 && typeof sim.addCar === 'function') {
      sim.addCar(preferredTeam, r.arena?.carVisual || 'octane');
    }
    sim.setCarTeam?.(0, preferredTeam);
    r.playerCarIndex = 0;
    if (r.teamAssignment) {
      r.teamAssignment.playerTeam = preferredTeam;
    }
    if (r.arena) {
      r.arena.playerCarIndex = 0;
      if (r.arena.cars) {
        if (r.arena.cars[0]) {
          r.arena.cars[0].visible = true;
          r.arena.setCarTeam?.(0, preferredTeam);
        }
        for (let i = 1; i < r.arena.cars.length; i++) {
          if (r.arena.cars[i]) r.arena.cars[i].visible = false;
        }
      }
    }
    const targetHex = getPreferredColorHex(null, preferredTeam);
    if (targetHex) {
      r.setCarColor?.(0, targetHex, false);
    }
    hudStore.getState().setMatchState({ localTeam: preferredTeam });
  }

  syncEditBallOpacityOverride(
    isTestingSingleShot: boolean,
    isReplayActive: boolean,
    force = false
  ): void {
    const r = this.runtime;
    const store = useStaticTrainingPackStore.getState();
    const tuner = useStaticTrainingBallCamTunerStore.getState();
    const isEditNonPlayable =
      store.sessionMode === 'edit' && !isTestingSingleShot && !isReplayActive;

    let desiredOverride: number | null = null;
    if (this.isBallExpired && !isReplayActive) {
      desiredOverride = tuner.expiredBallOpacity ?? 0.7;
    } else if (isEditNonPlayable) {
      desiredOverride = tuner.enableEditOpacityOverride ? tuner.editBallOpacity : null;
    }

    if (force || this.lastAppliedEditBallOpacityOverride !== desiredOverride) {
      this.lastAppliedEditBallOpacityOverride = desiredOverride;
      setTemporaryBallOpacityOverride(desiredOverride, r?.arena?.ball);
    }
  }

  clearEditBallOpacityOverride(): void {
    this.isBallExpired = false;
    this.lastAppliedEditBallOpacityOverride = null;
    setTemporaryBallOpacityOverride(null, this.runtime?.arena?.ball);
  }

  applyStagedShot(
    shot: StaticTrainingShotConfig,
    isLiveEditUpdate: boolean,
    isLeftMouseDragging: boolean,
    replayRingBuffer: {
      clear?: () => void;
      currentRecordTick?: number;
      recordFrame?: (
        tick: number,
        state: Float32Array
      ) => { snapshot?: Float32Array | null } | null | undefined;
    } | null
  ): void {
    const r = this.runtime;
    const sim = r?.physics;
    if (!sim || !shot) return;

    this.stagedShot = shot;
    if (this.isBallExpired) {
      this.isBallExpired = false;
      this.syncEditBallOpacityOverride(false, false, true);
    }
    const { car, ball } = shot;
    const carLoc = car.location || car.pos || [0, -2400, CAR_GROUND_MIN_Z];
    const ballLoc = ball.location || ball.pos || [0, 0, BALL_GROUND_MIN_Z];

    const neutral = r.neutralControls || {
      throttle: 0,
      steer: 0,
      pitch: 0,
      yaw: 0,
      roll: 0,
      jump: false,
      boost: false,
      handbrake: false,
    };
    sim.setControls?.(0, neutral);
    sim.resetGoalLatch?.();
    sim.clearEvents?.();

    const boostVal = car.unlimitedBoost
      ? 100
      : Math.max(0, Math.min(100, Number(car.initialBoost) || 0));
    sim.setUnlimitedBoost?.(Boolean(car.unlimitedBoost));

    const hasFlip = Boolean(car.snapToGround || car.hasFlip !== false);

    if (car.snapToGround) {
      const carSettleKey = `${Number(carLoc[0]).toFixed(2)}:${Number(carLoc[1]).toFixed(2)}:${Number(
        car.headingYaw
      ).toFixed(4)}`;
      const needsSettle =
        !isLiveEditUpdate ||
        (!isLeftMouseDragging &&
          (this.lastSettledCarKey !== carSettleKey || typeof this.lastSettledCarZ !== 'number'));

      if (needsSettle) {
        sim.setBallState({
          pos: [0, 0, 1850],
          vel: [0, 0, 0],
          angVel: [0, 0, 0],
        });
        sim.setCarState(0, {
          pos: [carLoc[0], carLoc[1], Math.max(CAR_GROUND_MIN_Z + 4, 24)],
          rot: [0, car.headingYaw, 0],
          vel: [0, 0, 0],
          angVel: [0, 0, 0],
          boost: boostVal,
          isOnGround: true,
          hasFlipOrJump: true,
        });
        sim.stepSilent?.(60);
        const settledView = sim.getCarStateView?.(0);
        this.lastSettledCarZ = settledView
          ? Math.max(CAR_GROUND_MIN_Z, settledView.posZ)
          : CAR_GROUND_MIN_Z;
        this.lastSettledCarKey = carSettleKey;
      }

      if (!isLiveEditUpdate) {
        sim.resetKickoff?.(0, false);
        sim.setUnlimitedBoost?.(Boolean(car.unlimitedBoost));
        sim.setControls?.(0, neutral);
      }

      const settledZ =
        typeof this.lastSettledCarZ === 'number' ? this.lastSettledCarZ : CAR_GROUND_MIN_Z;
      sim.setCarState(0, {
        pos: [carLoc[0], carLoc[1], settledZ],
        rot: [0, car.headingYaw, 0],
        vel: [0, 0, 0],
        angVel: [0, 0, 0],
        boost: boostVal,
        isOnGround: true,
        hasFlipOrJump: true,
      });
    } else {
      this.lastSettledCarKey = null;
      if (!isLiveEditUpdate) {
        sim.resetKickoff?.(0, false);
        sim.setUnlimitedBoost?.(Boolean(car.unlimitedBoost));
        sim.setControls?.(0, neutral);
      }
      const isGroundAlt = carLoc[2] <= CAR_GROUND_MIN_Z + 1.5;
      sim.setCarState(0, {
        pos: [carLoc[0], carLoc[1], Math.max(CAR_GROUND_MIN_Z, carLoc[2])],
        rot: [car.headingPitch, car.headingYaw, car.airRoll],
        vel: [0, 0, 0],
        angVel: [0, 0, 0],
        boost: boostVal,
        isOnGround: isGroundAlt,
        hasFlipOrJump: hasFlip,
      });
    }

    this.effectiveBallAngVel = computeEffectiveBallAngVel(ball);
    this.kickoffBallFrozen = Boolean(ball.kickoffState);
    this.hasBallMoved = false;

    sim.setBallState({
      pos: [ballLoc[0], ballLoc[1], Math.max(BALL_GROUND_MIN_Z, ballLoc[2])],
      vel: [0, 0, 0],
      angVel: [0, 0, 0],
    });

    this.lastKickoffStartTick = 1;
    r.simulationStage?.resetActionStates?.();
    r.interpolator?.sync?.();
    if (!isLiveEditUpdate) {
      r.arena?.resetBoostPads?.();
      r.arena?.resetBallTrail?.();
      r.audioSubsystem?.resetAudio?.();
      replayRingBuffer?.clear?.();
      if (replayRingBuffer) {
        replayRingBuffer.currentRecordTick = 1;
      }
      const initSlot = replayRingBuffer?.recordFrame?.(1, sim.state);
      if (initSlot?.snapshot) {
        initSlot.snapshot[0] = 1;
      }
    }

    const launchBallVel = ball.kickoffState
      ? [0, 0, 0]
      : computeLaunchVelocity(ball.speed, ball.speedYaw, ball.speedPitch);

    if (r.ballTrajectoryPredictor) {
      r.ballTrajectoryPredictor.releaseTemporarySuppression?.('static-training-replay');
      r.ballTrajectoryPredictor.setSceneContext?.({
        isGoalReplayActive: false,
      });
      r.ballTrajectoryPredictor.forcePredictAnyMovement = true;
      const ballPreviewKey = `${Number(ballLoc[0]).toFixed(2)}:${Number(ballLoc[1]).toFixed(
        2
      )}:${Number(ballLoc[2]).toFixed(2)}:${Number(ball.speed).toFixed(2)}:${Number(
        ball.speedYaw
      ).toFixed(4)}:${Number(ball.speedPitch).toFixed(4)}:${Boolean(
        ball.kickoffState
      )}:${this.effectiveBallAngVel.join(',')}`;

      if (!isLiveEditUpdate || this.lastBallPreviewKey !== ballPreviewKey) {
        const count = r.ballTrajectoryPredictor.setStaticPreviewTrajectory(sim, {
          pos: [ballLoc[0], ballLoc[1], Math.max(BALL_GROUND_MIN_Z, ballLoc[2])],
          vel: launchBallVel,
          angVel: this.effectiveBallAngVel,
          kickoffState: ball.kickoffState,
        });
        if (count > 0 || ball.kickoffState) {
          this.lastBallPreviewKey = ballPreviewKey;
        }
      }
    }

    const hud = hudStore.getState();
    hud.setBoost(boostVal, false, Boolean(car.unlimitedBoost));
    hud.setCarSpeed(Math.max(0, Number(car.speed) || 0));
  }

  private applyLaunchedEntitiesToSim(): void {
    const r = this.runtime;
    const sim = r?.physics;
    const shot = this.stagedShot;
    if (!sim || !shot) return;

    const { car, ball } = shot;
    const ballLoc = ball.location || ball.pos || [0, 0, BALL_GROUND_MIN_Z];
    const currentCarView = sim.getCarStateView?.(0);
    const carKinematics = computeCarLaunchKinematics(car, currentCarView?.posZ);

    sim.setCarState(0, {
      pos: carKinematics.pos,
      rot: carKinematics.rot,
      vel: carKinematics.vel,
      angVel: [0, 0, 0],
      boost: carKinematics.boost,
      isOnGround: carKinematics.isOnGround,
      hasFlipOrJump: carKinematics.hasFlipOrJump,
    });

    this.effectiveBallAngVel = computeEffectiveBallAngVel(ball);
    if (ball.kickoffState) {
      this.kickoffBallFrozen = true;
      this.hasBallMoved = false;
      sim.setBallState({
        pos: [ballLoc[0], ballLoc[1], Math.max(BALL_GROUND_MIN_Z, ballLoc[2])],
        vel: [0, 0, 0],
        angVel: [0, 0, 0],
      });
    } else {
      this.kickoffBallFrozen = false;
      this.hasBallMoved = Number(ball.speed) > 0.5 || (ballLoc[2] || 0) > BALL_GROUND_MIN_Z + 5.5;
      const ballVel = computeLaunchVelocity(ball.speed, ball.speedYaw, ball.speedPitch);
      sim.setBallState({
        pos: [ballLoc[0], ballLoc[1], Math.max(BALL_GROUND_MIN_Z, ballLoc[2])],
        vel: ballVel,
        angVel: this.effectiveBallAngVel,
      });
    }

    const innerBallMesh = r?.arena?.ball?.children?.[0];
    if (innerBallMesh) {
      innerBallMesh.quaternion.identity();
    }

    if (r.ballTrajectoryPredictor) {
      this.lastBallPreviewKey = null;
      r.ballTrajectoryPredictor.clearStaticPreview?.();
      r.ballTrajectoryPredictor.forcePredictAnyMovement = true;
    }
  }

  launchShotNow(): void {
    if (!this.runtime?.physics || !this.stagedShot) return;
    this.applyLaunchedEntitiesToSim();
    useStaticTrainingPackStore.getState().updateLiveTelemetry({
      activeCountdownSec: 0,
      isShotLaunched: true,
    });
  }

  launchFreeCamTrajectoryPreview(
    isLeftMouseDragging: boolean,
    replayRingBuffer: {
      clear?: () => void;
      currentRecordTick?: number;
      recordFrame?: (
        tick: number,
        state: Float32Array
      ) => { snapshot?: Float32Array | null } | null | undefined;
    } | null
  ): void {
    if (!this.runtime?.physics || !this.stagedShot) return;
    this.applyStagedShot(this.stagedShot, true, isLeftMouseDragging, replayRingBuffer);
    this.applyLaunchedEntitiesToSim();
  }

  spinBallMeshInPlace(dt: number): void {
    const ballGroup = this.runtime?.arena?.ball;
    if (!ballGroup || !this.stagedShot) return;

    const targetMesh = ballGroup.children?.[0] || ballGroup;
    const spin = computeBallSpinAxisAngle(this.effectiveBallAngVel, dt);
    if (spin) {
      _spinAxis.set(spin.axis[0], spin.axis[1], spin.axis[2]);
      _spinDeltaQuat.setFromAxisAngle(_spinAxis, spin.angle);
      targetMesh.quaternion.premultiply(_spinDeltaQuat);
    }
  }

  teardownRuntimeModeExit(): void {
    const r = this.runtime;
    this.clearEditBallOpacityOverride();
    if (!r) return;
    r.camera?.setEditorOverride?.(false);
    r.releaseGoalReplayCameraOverride();
    if (r.ballTrajectoryPredictor) {
      r.ballTrajectoryPredictor.forcePredictAnyMovement = false;
      r.ballTrajectoryPredictor.clearStaticPreview?.();
      r.ballTrajectoryPredictor.clear?.();
    }
    if (r.camera?.isFreeCam) r.camera.setFreeCam(false);
    if (r.keyboard) r.keyboard.ballControlEnabled = true;
    r.arena?.ball?.children?.[0]?.quaternion?.identity?.();
  }

  applyPreLaunchCarHudOverride(
    context: { overrideCarSpeed?: number; isSupersonic?: boolean },
    shot: StaticTrainingShotConfig | null,
    dt: number,
    syncBoostToHud = false
  ): void {
    this.spinBallMeshInPlace(dt);
    if (!shot) return;
    const configuredCarSpeed = Math.max(0, Number(shot.car?.speed) || 0);
    context.overrideCarSpeed = configuredCarSpeed;
    context.isSupersonic = configuredCarSpeed >= 2200;
    if (syncBoostToHud) {
      const boostVal = shot.car?.unlimitedBoost
        ? 100
        : Math.max(0, Math.min(100, Number(shot.car?.initialBoost) || 0));
      hudStore.getState().setBoost(boostVal, false, Boolean(shot.car?.unlimitedBoost));
    }
  }
}
