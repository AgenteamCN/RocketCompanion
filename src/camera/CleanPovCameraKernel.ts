/**
 * CleanPovCameraKernel.ts
 * Native TypeScript implementation of the Rocket League POV & Ball-Cam camera state machine.
 * Reconstructed from the standalone POV camera microkernel (camera.wasm) with full semantic naming.
 */

import {
  MAX_SWIVEL_PITCH_RAD,
  VIEW_BUFFER_FLOATS,
  quantizeAngleRadiansToUrot16,
  wrapRadiansPi,
  createSpringFilter,
  createCameraPoseSnapshot,
  copyCameraPoseSnapshot,
  computeTransitionDelta,
  applyQuadraticTransitionBlend,
  stepSpringFilter3D,
  stepSwivelOffsets,
  packCameraViewBufferOutput,
  projectFocusPointAlongViewRay,
  blendGroundAndAirCandidatePoses,
  initPrimaryCameraPose,
  type Vec3State,
  type EulerAnglesState,
  type SpringFilter3DState,
  type CameraPoseSnapshot,
  type PoseTransitionDelta,
  type PovCameraSettingsState,
} from './povCameraFixedPointMath.ts';
import {
  unpackPovStepFrameInput,
  computeBallCamRotation,
  computeAirCarCamRotation,
  computeGroundCarCamRotation,
} from './povCameraRotationSolvers.ts';

const f32 = Math.fround;
const isFin = Number.isFinite;

export class CleanPovCameraKernel {
  activeBallCam = true;
  requestedBallCam = true;
  snapOrientationNextStep = true;
  prevGroundedState = true;
  isGroundedState = true;
  isInitialized = false;
  isSupersonic = false;
  hasPrevCarPos = false;
  groundBlendWeight = 1.0;
  transitionRemainingTime = 0.0;
  transitionTotalDuration = 0.5;
  swivelYawOffset = 0.0;
  swivelPitchOffset = 0.0;
  carForwardX = 0.0;
  carForwardY = 0.0;
  carForwardZ = 0.0;
  carRightX = 0.0;
  carRightY = 0.0;
  carRightZ = 0.0;
  carUpX = 0.0;
  carUpY = 0.0;
  carUpZ = 0.0;
  carVelX = 0.0;
  carVelY = 0.0;
  carVelZ = 0.0;
  prevCarPosX = 0.0;
  prevCarPosY = 0.0;
  prevCarPosZ = 0.0;
  surfaceNormalX = 0.0;
  surfaceNormalY = 1.0;
  surfaceNormalZ = 0.0;
  smoothedNormalX = 0.0;
  smoothedNormalY = 1.0;
  smoothedNormalZ = 0.0;
  finalCameraPosX = 0.0;
  finalCameraPosY = 0.0;
  finalCameraPosZ = 0.0;
  focusSpring!: SpringFilter3DState;
  heightSpring!: SpringFilter3DState;
  distanceSpring!: SpringFilter3DState;
  primaryPose!: CameraPoseSnapshot;
  blendedPose!: CameraPoseSnapshot;
  transitionFromPose!: CameraPoseSnapshot;
  transitionToPose!: CameraPoseSnapshot;
  groundCandidatePose!: CameraPoseSnapshot;
  airCandidatePose!: CameraPoseSnapshot;
  workingPose!: CameraPoseSnapshot;
  settings!: PovCameraSettingsState;
  transitionDelta!: PoseTransitionDelta;
  scratchVecA!: Vec3State;
  scratchVecB!: Vec3State;
  scratchTarget!: Vec3State;
  scratchProjected!: Vec3State;
  scratchCarPos!: Vec3State;
  scratchBallPos!: Vec3State;
  scratchEulerA!: EulerAnglesState;
  scratchEulerB!: EulerAnglesState;
  scratchEulerC!: EulerAnglesState;
  viewBuffer: Float64Array;

  constructor() {
    this.viewBuffer = new Float64Array(VIEW_BUFFER_FLOATS);
    this.resetView();
  }

  resetView(): void {
    const v3 = (): Vec3State => ({ x: 0, y: 0, z: 0 }),
      eu = (): EulerAnglesState => ({ pitch: 0, yaw: 0, roll: 0 }),
      ps = createCameraPoseSnapshot;
    this.settings = {
      fov: 110.0,
      distance: 270.0,
      height: 100.0,
      angleDeg: -3.0,
      stiffness: 0.35,
      transitionSpeed: 1.0,
    };
    this.requestedBallCam = true;
    this.activeBallCam = true;
    this.focusSpring = createSpringFilter(6.32, 0.0);
    this.heightSpring = createSpringFilter(2.03, 0.0);
    this.distanceSpring = createSpringFilter(4.14, 0.0);
    this.snapOrientationNextStep = true;
    this.prevGroundedState = true;
    this.isGroundedState = true;
    this.groundBlendWeight = 1.0;
    this.smoothedNormalX = 0.0;
    this.smoothedNormalY = 1.0;
    this.smoothedNormalZ = 0.0;
    this.primaryPose = ps();
    this.blendedPose = ps();
    this.transitionFromPose = ps();
    this.transitionToPose = ps();
    this.groundCandidatePose = ps();
    this.airCandidatePose = ps();
    this.workingPose = ps();
    this.finalCameraPosX = 0.0;
    this.finalCameraPosY = 0.0;
    this.finalCameraPosZ = 0.0;
    this.isInitialized = false;
    this.transitionRemainingTime = 0.0;
    this.transitionTotalDuration = 0.5;
    this.swivelYawOffset = 0.0;
    this.swivelPitchOffset = 0.0;
    this.transitionDelta = {
      focusX: 0,
      focusY: 0,
      focusZ: 0,
      pitch: 0,
      yaw: 0,
      roll: 0,
      distance: 0,
      fov: 0,
    };
    this.prevCarPosX = 0.0;
    this.prevCarPosY = 0.0;
    this.prevCarPosZ = 0.0;
    this.hasPrevCarPos = false;
    this.carVelX = 0.0;
    this.carVelY = 0.0;
    this.carVelZ = 0.0;
    this.surfaceNormalX = 0.0;
    this.surfaceNormalY = 1.0;
    this.surfaceNormalZ = 0.0;
    this.isSupersonic = false;
    this.carForwardX = 0.0;
    this.carForwardY = 0.0;
    this.carForwardZ = 0.0;
    this.carRightX = 0.0;
    this.carRightY = 0.0;
    this.carRightZ = 0.0;
    this.carUpX = 0.0;
    this.carUpY = 0.0;
    this.carUpZ = 0.0;
    this.scratchVecA = v3();
    this.scratchVecB = v3();
    this.scratchTarget = v3();
    this.scratchProjected = v3();
    this.scratchCarPos = v3();
    this.scratchBallPos = v3();
    this.scratchEulerA = eu();
    this.scratchEulerB = eu();
    this.scratchEulerC = eu();
    this.viewBuffer.fill(0);
  }

  _stepSpringFilter(spring: SpringFilter3DState, dt: number): void {
    stepSpringFilter3D(spring, this.scratchTarget, dt, this.scratchVecB);
  }

  _computeAirCarCamRotation(pose: CameraPoseSnapshot): void {
    computeAirCarCamRotation(
      {
        snapOrientation: this.snapOrientationNextStep,
        carForwardX: this.carForwardX,
        carForwardY: this.carForwardY,
        carForwardZ: this.carForwardZ,
        carVelX: this.carVelX,
        carVelY: this.carVelY,
        carVelZ: this.carVelZ,
        angleDeg: this.settings.angleDeg,
        scratchVecA: this.scratchVecA,
        scratchEulerA: this.scratchEulerA,
        scratchEulerB: this.scratchEulerB,
        scratchEulerC: this.scratchEulerC,
      },
      pose
    );
  }

  _computeGroundCarCamRotation(dt: number, pose: CameraPoseSnapshot): void {
    const n = computeGroundCarCamRotation(
      {
        snapOrientation: this.snapOrientationNextStep,
        dt,
        surfaceNormalX: this.surfaceNormalX,
        surfaceNormalY: this.surfaceNormalY,
        surfaceNormalZ: this.surfaceNormalZ,
        smoothedNormalX: this.smoothedNormalX,
        smoothedNormalY: this.smoothedNormalY,
        smoothedNormalZ: this.smoothedNormalZ,
        carForwardX: this.carForwardX,
        carForwardY: this.carForwardY,
        carForwardZ: this.carForwardZ,
        angleDeg: this.settings.angleDeg,
        stiffness: this.settings.stiffness,
        scratchTarget: this.scratchTarget,
        scratchProjected: this.scratchProjected,
        scratchVecA: this.scratchVecA,
        scratchVecB: this.scratchVecB,
        scratchEulerA: this.scratchEulerA,
        scratchEulerB: this.scratchEulerB,
        scratchEulerC: this.scratchEulerC,
      },
      pose
    );
    this.smoothedNormalX = n.smoothedNormalX;
    this.smoothedNormalY = n.smoothedNormalY;
    this.smoothedNormalZ = n.smoothedNormalZ;
  }

  _stepCameraPose(
    isBallCam: boolean,
    carPos: Vec3State,
    ballPos: Vec3State,
    dt: number,
    pose: CameraPoseSnapshot
  ): void {
    const groundRate = this.isGroundedState ? 2.0 : -4.0;
    if (this.isGroundedState !== this.prevGroundedState) {
      this.prevGroundedState = this.isGroundedState;
      if (this.isGroundedState) {
        this.smoothedNormalX = this.surfaceNormalX;
        this.smoothedNormalY = this.surfaceNormalY;
        this.smoothedNormalZ = this.surfaceNormalZ;
      }
    }
    this.groundBlendWeight = Math.max(
      0.0,
      Math.min(1.0, f32(f32(this.groundBlendWeight) + f32(groundRate * f32(dt))))
    );
    let hOffX = 0.0,
      hOffY = 0.0,
      hOffZ = 0.0,
      focusLagLimit = 100.0;
    const h = this.settings.height,
      hS = this.heightSpring,
      fS = this.focusSpring,
      sT = this.scratchTarget;
    if (isBallCam) {
      hS.initialized = true;
      hS.posZ = 0.0;
      hS.posX = 0.0;
      hS.posY = h;
      hOffY = h;
      focusLagLimit = 0.001;
    } else {
      const fullGnd = this.groundBlendWeight >= 1.0;
      sT.z = fullGnd ? this.carUpZ * h : 0.0;
      sT.y = fullGnd ? this.carUpY * h : h;
      sT.x = fullGnd ? this.carUpX * h : 0.0;
      this._stepSpringFilter(hS, dt);
      hOffZ = hS.posZ;
      hOffY = hS.posY;
      hOffX = hS.posX;
    }

    sT.x = carPos.x + hOffX;
    sT.y = carPos.y + hOffY;
    sT.z = carPos.z + hOffZ;
    fS.maxLagDistance = focusLagLimit;
    this._stepSpringFilter(fS, dt);
    const vA = this.scratchVecA;
    projectFocusPointAlongViewRay(
      pose,
      fS,
      sT,
      this.settings.stiffness,
      vA,
      this.scratchVecB,
      this.scratchProjected
    );

    if (isBallCam) {
      computeBallCamRotation(
        ballPos,
        pose,
        this.settings.angleDeg,
        this.snapOrientationNextStep,
        dt,
        vA,
        this.scratchEulerA
      );
    } else if (this.groundBlendWeight >= 1.0) {
      this._computeGroundCarCamRotation(dt, pose);
    } else if (this.groundBlendWeight <= 0.0) {
      this._computeAirCarCamRotation(pose);
    } else {
      const gP = this.groundCandidatePose,
        aP = this.airCandidatePose;
      copyCameraPoseSnapshot(gP, pose);
      copyCameraPoseSnapshot(aP, pose);
      this._computeGroundCarCamRotation(dt, gP);
      this._computeAirCarCamRotation(aP);
      blendGroundAndAirCandidatePoses(pose, gP, aP, this.groundBlendWeight, vA);
    }

    const sinP = f32(Math.sin(pose.pitch)),
      cosP = f32(Math.cos(pose.pitch));
    const dirY = sinP,
      dirZ = f32(cosP * f32(Math.cos(pose.yaw))),
      dirX = f32(cosP * f32(Math.sin(pose.yaw)));
    vA.x = dirX;
    vA.y = dirY;
    vA.z = dirZ;
    const fwdSpeed = this.carVelZ * dirZ + (this.carVelX * dirX + this.carVelY * dirY);
    const stretch = (1.0 - this.settings.stiffness) * (fwdSpeed * 0.05);
    sT.x = this.settings.distance + (stretch < -50.0 ? -50.0 : stretch);
    sT.y = 0.0;
    sT.z = 0.0;
    this._stepSpringFilter(this.distanceSpring, dt);
    const curDistF32 = f32(this.distanceSpring.posX);
    pose.distance = curDistF32;

    const carSpeed = this.isSupersonic
      ? 0.0
      : Math.sqrt(
          this.carVelZ * this.carVelZ + this.carVelX * this.carVelX + this.carVelY * this.carVelY
        );
    const targetFov = this.settings.fov + (this.isSupersonic ? 10.0 : (carSpeed / 2300.0) * 5.0);
    const fovRate = this.isSupersonic ? 40.0 : 25.0;
    if (this.snapOrientationNextStep) {
      pose.fov = targetFov;
    } else {
      const maxDelta = dt * fovRate,
        fovDiff = targetFov - pose.fov;
      pose.fov =
        Math.abs(fovDiff) <= maxDelta
          ? targetFov
          : pose.fov + (fovDiff < 0.0 ? -maxDelta : maxDelta);
    }

    if (!isBallCam && this.groundBlendWeight > 0.0) {
      pose.roll = quantizeAngleRadiansToUrot16(
        this.groundBlendWeight *
          (Math.atan2(this.carRightY, Math.hypot(this.carRightX, this.carRightZ)) * -0.1)
      );
    }

    const fSinP = f32(Math.sin(pose.pitch)),
      fCosP = f32(Math.cos(pose.pitch));
    pose.cameraPosZ = f32(pose.focusZ - f32(f32(fCosP * f32(Math.cos(pose.yaw))) * curDistF32));
    pose.cameraPosX = f32(pose.focusX - f32(f32(fCosP * f32(Math.sin(pose.yaw))) * curDistF32));
    const fCamY = f32(pose.focusY - f32(curDistF32 * fSinP));
    pose.cameraPosY = fCamY < 10.0 ? 10.0 : fCamY;
    this.snapOrientationNextStep = false;
  }

  _resetSpringsAndGroundState(isGrounded: boolean): void {
    this.smoothedNormalX = this.surfaceNormalX;
    this.smoothedNormalY = this.surfaceNormalY;
    this.smoothedNormalZ = this.surfaceNormalZ;
    this.groundBlendWeight = isGrounded ? 1.0 : 0.0;
    this.prevGroundedState = isGrounded;
    this.snapOrientationNextStep = true;
    this.distanceSpring.initialized = false;
    this.heightSpring.initialized = false;
    this.focusSpring.initialized = false;
  }

  stepView(inputView?: ArrayLike<number> | null): Float64Array {
    if (inputView) this.viewBuffer.set(inputView, 0);
    const v = this.viewBuffer,
      pPose = this.primaryPose,
      fS = this.focusSpring;
    if (
      !isFin(fS.posX) ||
      !isFin(fS.posY) ||
      !isFin(fS.posZ) ||
      !isFin(pPose.cameraPosX) ||
      !isFin(pPose.cameraPosY) ||
      !isFin(pPose.cameraPosZ) ||
      !isFin(pPose.yaw) ||
      !isFin(pPose.pitch)
    ) {
      const savedView = new Float64Array(v);
      this.resetView();
      this.viewBuffer.set(savedView, 0);
    }

    const carPos = this.scratchCarPos,
      ballPos = this.scratchBallPos;
    const f = unpackPovStepFrameInput(
      v,
      this.hasPrevCarPos,
      this.prevCarPosX,
      this.prevCarPosY,
      this.prevCarPosZ,
      carPos,
      ballPos,
      this.settings
    );
    this.carUpX = f.carUpX;
    this.carUpY = f.carUpY;
    this.carUpZ = f.carUpZ;
    this.carRightX = f.carRightX;
    this.carRightY = f.carRightY;
    this.carRightZ = f.carRightZ;
    this.carForwardX = f.carForwardX;
    this.carForwardY = f.carForwardY;
    this.carForwardZ = f.carForwardZ;
    this.carVelX = f.carVelX;
    this.carVelY = f.carVelY;
    this.carVelZ = f.carVelZ;
    this.hasPrevCarPos = true;
    this.prevCarPosX = carPos.x;
    this.prevCarPosY = carPos.y;
    this.prevCarPosZ = carPos.z;
    this.isGroundedState = f.isGrounded;
    this.surfaceNormalX = f.surfaceNormalX;
    this.surfaceNormalY = f.surfaceNormalY;
    this.surfaceNormalZ = f.surfaceNormalZ;
    this.isSupersonic = f.isSupersonic;

    const dt = f.dt,
      wantBallCam = f.wantBallCam,
      prevRequested = this.requestedBallCam,
      bPose = this.blendedPose;
    this.requestedBallCam = wantBallCam;
    if (f.didTeleport && this.isInitialized) fS.initialized = false;

    if (!this.isInitialized) {
      initPrimaryCameraPose(
        pPose,
        carPos,
        this.carForwardX,
        this.carForwardY,
        this.carForwardZ,
        this.carUpX,
        this.carUpY,
        this.carUpZ,
        this.settings
      );
      copyCameraPoseSnapshot(bPose, pPose);
      this.activeBallCam = wantBallCam;
      this._resetSpringsAndGroundState(f.isGrounded);
      this._stepCameraPose(wantBallCam, carPos, ballPos, dt, pPose);
      copyCameraPoseSnapshot(bPose, pPose);
      this.isInitialized = true;
      this.transitionRemainingTime = 0.0;
    } else if (wantBallCam !== prevRequested) {
      const fromP = this.transitionFromPose,
        toP = this.transitionToPose;
      copyCameraPoseSnapshot(fromP, pPose);
      this._stepCameraPose(this.activeBallCam, carPos, ballPos, dt, fromP);
      this.activeBallCam = this.requestedBallCam;
      this._resetSpringsAndGroundState(this.isGroundedState);
      copyCameraPoseSnapshot(toP, pPose);
      this._stepCameraPose(this.activeBallCam, carPos, ballPos, dt, toP);
      copyCameraPoseSnapshot(pPose, toP);
      computeTransitionDelta(this.transitionDelta, fromP, toP);
      const duration = 0.5 / Math.max(0.1, Math.min(10.0, this.settings.transitionSpeed));
      this.transitionTotalDuration = duration;
      this.transitionRemainingTime = duration;
      copyCameraPoseSnapshot(bPose, toP);
      applyQuadraticTransitionBlend(bPose, this.transitionDelta, duration, duration, true);
    } else {
      const wPose = this.workingPose;
      copyCameraPoseSnapshot(wPose, pPose);
      this._stepCameraPose(this.activeBallCam, carPos, ballPos, dt, wPose);
      copyCameraPoseSnapshot(pPose, wPose);
      copyCameraPoseSnapshot(bPose, wPose);
      applyQuadraticTransitionBlend(
        bPose,
        this.transitionDelta,
        this.transitionRemainingTime,
        this.transitionTotalDuration,
        false
      );
      this.transitionRemainingTime = Math.max(0.0, this.transitionRemainingTime - dt);
    }

    const sw = stepSwivelOffsets(
      this.swivelYawOffset,
      this.swivelPitchOffset,
      dt,
      f.lookXInput,
      f.lookYInput,
      f.swivelSpeedInput,
      f.invertSwivelInput
    );
    this.swivelPitchOffset = sw.swivelPitch;
    this.swivelYawOffset = sw.swivelYaw;
    if (sw.swivelYaw !== 0.0 || sw.swivelPitch !== 0.0) {
      bPose.yaw = wrapRadiansPi(bPose.yaw + sw.swivelYaw);
      bPose.pitch = Math.max(
        -MAX_SWIVEL_PITCH_RAD,
        Math.min(MAX_SWIVEL_PITCH_RAD, bPose.pitch + sw.swivelPitch)
      );
    }

    const cp = packCameraViewBufferOutput(v, bPose, f.aspectInput);
    this.finalCameraPosX = cp.camPosX;
    this.finalCameraPosY = cp.camPosY;
    this.finalCameraPosZ = cp.camPosZ;
    return v;
  }

  getViewArray(): Float64Array {
    return this.viewBuffer;
  }
}

export default CleanPovCameraKernel;
