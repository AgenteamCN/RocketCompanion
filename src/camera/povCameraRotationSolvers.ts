/**
 * povCameraRotationSolvers.ts
 * Ball-Cam, Air Car-Cam, and Ground Car-Cam rotation solvers, plus deterministic
 * input frame buffer unpacking and surface normal sanitization.
 */

import {
  UROT_PER_RAD,
  DEG_TO_RAD,
  HALF_PI,
  saturateInt32,
  extendInt16,
  quantizeAngleRadiansToUrot16,
  radiansToRoundedUrotInt,
  interpolateUrot16Angle,
  computeUrotYawRadians,
  wrapRadiansPi,
  extractCarBasisFromQuaternion,
  type Vec3State,
  type EulerAnglesState,
  type CameraPoseSnapshot,
  type PovCameraSettingsState,
} from './povCameraFixedPointMath.ts';

const f32 = Math.fround;
const isFin = Number.isFinite;

export interface AirCarCamRotationInput {
  snapOrientation: boolean;
  carForwardX: number;
  carForwardY: number;
  carForwardZ: number;
  carVelX: number;
  carVelY: number;
  carVelZ: number;
  angleDeg: number;
  scratchVecA: Vec3State;
  scratchEulerA: EulerAnglesState;
  scratchEulerB: EulerAnglesState;
  scratchEulerC: EulerAnglesState;
}

export interface GroundCarCamRotationInput {
  snapOrientation: boolean;
  dt: number;
  surfaceNormalX: number;
  surfaceNormalY: number;
  surfaceNormalZ: number;
  smoothedNormalX: number;
  smoothedNormalY: number;
  smoothedNormalZ: number;
  carForwardX: number;
  carForwardY: number;
  carForwardZ: number;
  angleDeg: number;
  stiffness: number;
  scratchTarget: Vec3State;
  scratchProjected: Vec3State;
  scratchVecA: Vec3State;
  scratchVecB: Vec3State;
  scratchEulerA: EulerAnglesState;
  scratchEulerB: EulerAnglesState;
  scratchEulerC: EulerAnglesState;
}

export interface UnpackedPovStepFrame {
  dt: number;
  wantBallCam: boolean;
  didTeleport: boolean;
  isGrounded: boolean;
  isSupersonic: boolean;
  carUpX: number;
  carUpY: number;
  carUpZ: number;
  carRightX: number;
  carRightY: number;
  carRightZ: number;
  carForwardX: number;
  carForwardY: number;
  carForwardZ: number;
  carVelX: number;
  carVelY: number;
  carVelZ: number;
  surfaceNormalX: number;
  surfaceNormalY: number;
  surfaceNormalZ: number;
  aspectInput: number;
  lookXInput: number;
  lookYInput: number;
  swivelSpeedInput: number;
  invertSwivelInput: number;
}

export function unpackPovStepFrameInput(
  v: Float64Array,
  hasPrevCarPos: boolean,
  prevCarPosX: number,
  prevCarPosY: number,
  prevCarPosZ: number,
  carPos: Vec3State,
  ballPos: Vec3State,
  target: PovCameraSettingsState
): UnpackedPovStepFrame {
  const rawDt = isFin(v[0]) ? v[0] : 0.0;
  const ballCamInput = isFin(v[1]) ? v[1] : 1.0;
  carPos.x = isFin(v[2]) ? v[2] : isFin(prevCarPosX) ? prevCarPosX : 0.0;
  carPos.y = isFin(v[3]) ? v[3] : isFin(prevCarPosY) ? prevCarPosY : 17.0;
  carPos.z = isFin(v[4]) ? v[4] : isFin(prevCarPosZ) ? prevCarPosZ : 0.0;
  const rQx = v[5],
    rQy = v[6],
    rQz = v[7],
    rQw = v[8];
  const quatOk =
    isFin(rQx) &&
    isFin(rQy) &&
    isFin(rQz) &&
    isFin(rQw) &&
    rQx * rQx + rQy * rQy + rQz * rQz + rQw * rQw > 1e-8;
  const basis = extractCarBasisFromQuaternion(
    quatOk ? rQx : 0.0,
    quatOk ? rQy : 0.0,
    quatOk ? rQz : 0.0,
    quatOk ? rQw : 1.0
  );

  ballPos.x = isFin(v[9]) ? v[9] : 0.0;
  ballPos.y = isFin(v[10]) ? v[10] : 93.15;
  ballPos.z = isFin(v[11]) ? v[11] : 0.0;
  const flags = saturateInt32(v[12]);
  const onGroundInput = isFin(v[13]) ? v[13] : 1.0;
  let nx = isFin(v[14]) ? v[14] : 0.0,
    ny = isFin(v[15]) ? v[15] : 1.0,
    nz = isFin(v[16]) ? v[16] : 0.0;
  let vx = isFin(v[17]) ? v[17] : 0.0,
    vy = isFin(v[18]) ? v[18] : 0.0,
    vz = isFin(v[19]) ? v[19] : 0.0;
  const supersonicInput = isFin(v[20]) ? v[20] : 0.0;

  target.fov = isFin(v[21]) && v[21] > 10 ? v[21] : 110.0;
  target.distance = isFin(v[22]) ? v[22] : 270.0;
  target.height = isFin(v[23]) ? v[23] : 100.0;
  target.angleDeg = isFin(v[24]) ? v[24] : -3.0;
  target.stiffness = isFin(v[25]) ? v[25] : 0.35;
  target.transitionSpeed = isFin(v[26]) ? v[26] : 1.0;

  const clampedDt = rawDt < 0.05 ? rawDt : 0.05;
  const dt = clampedDt > 0.0 ? clampedDt : 0.0;
  let didTeleport = false;
  if (hasPrevCarPos) {
    const dx = prevCarPosX - carPos.x,
      dy = prevCarPosY - carPos.y,
      dz = prevCarPosZ - carPos.z;
    didTeleport = Math.sqrt(dz * dz + dx * dx + dy * dy) > 1000.0;
  }

  let carVelX = 0.0,
    carVelY = 0.0,
    carVelZ = 0.0;
  if ((flags & 4) !== 0) {
    carVelX = vx;
    carVelY = vy;
    carVelZ = vz;
  } else if (!didTeleport && dt > 0.0 && hasPrevCarPos) {
    const invDt = 1.0 / dt;
    carVelZ = (carPos.z - prevCarPosZ) * invDt;
    carVelY = (carPos.y - prevCarPosY) * invDt;
    carVelX = (carPos.x - prevCarPosX) * invDt;
    vx = carVelX;
    vy = carVelY;
    vz = carVelZ;
  } else {
    vx = 0.0;
    vy = 0.0;
    vz = 0.0;
  }

  const isGrounded =
    (flags & 1) !== 0 ? onGroundInput !== 0.0 : carPos.y < 40.0 && basis.upY > 0.45;
  if ((flags & 2) === 0) {
    const flatFloor = isGrounded && carPos.y < 60.0 && basis.upY > 0.7;
    nx = flatFloor ? 0.0 : basis.upX;
    ny = flatFloor ? 1.0 : basis.upY;
    nz = flatFloor ? 0.0 : basis.upZ;
  }

  const isDegen = nz * nz + nx * nx + ny * ny < 1e-8;
  const sNX = isDegen ? 0.0 : nx,
    sNY = isDegen ? 1.0 : ny,
    sNZ = isDegen ? 0.0 : nz;
  const sNLenSq = sNZ * sNZ + sNX * sNX + sNY * sNY;
  const invNLen = sNLenSq === 0.0 ? 1.0 : 1.0 / Math.sqrt(sNLenSq);
  const isSupersonic =
    (flags & 8) !== 0 ? supersonicInput !== 0.0 : Math.sqrt(vz * vz + vx * vx + vy * vy) >= 2200.0;

  return {
    dt,
    wantBallCam: ballCamInput !== 0.0,
    didTeleport,
    isGrounded,
    isSupersonic,
    carUpX: basis.upX,
    carUpY: basis.upY,
    carUpZ: basis.upZ,
    carRightX: basis.rightX,
    carRightY: basis.rightY,
    carRightZ: basis.rightZ,
    carForwardX: basis.fwdX,
    carForwardY: basis.fwdY,
    carForwardZ: basis.fwdZ,
    carVelX,
    carVelY,
    carVelZ,
    surfaceNormalX: sNX * invNLen,
    surfaceNormalY: sNY * invNLen,
    surfaceNormalZ: sNZ * invNLen,
    aspectInput: isFin(v[27]) && v[27] > 0 ? v[27] : 16 / 9,
    lookXInput: isFin(v[28]) ? v[28] : 0.0,
    lookYInput: isFin(v[29]) ? v[29] : 0.0,
    swivelSpeedInput: isFin(v[30]) ? v[30] : 4.0,
    invertSwivelInput: isFin(v[31]) ? v[31] : 0.0,
  };
}

export function computeBallCamRotation(
  ballPos: Vec3State,
  out: CameraPoseSnapshot,
  angleDeg: number,
  snapOrientation: boolean,
  dt: number,
  dstVecA: Vec3State,
  dstEulerA: EulerAnglesState
): void {
  const toBallX = ballPos.x - out.focusX,
    toBallY = ballPos.y - out.focusY,
    toBallZ = ballPos.z - out.focusZ;
  const elevToBall = quantizeAngleRadiansToUrot16(
    Math.atan2(toBallY, Math.hypot(toBallX, toBallZ))
  );
  out.focusY += Math.abs(elevToBall * UROT_PER_RAD) * 0.005;

  const lookBallX = ballPos.x - out.focusX,
    lookBallY = ballPos.y - out.focusY,
    lookBallZ = ballPos.z - out.focusZ;
  dstVecA.x = lookBallX;
  dstVecA.y = lookBallY;
  dstVecA.z = lookBallZ;

  const horizBallDist = Math.hypot(lookBallX, lookBallZ);
  const ballYaw = computeUrotYawRadians(lookBallX, lookBallZ, horizBallDist);
  dstEulerA.roll = 0.0;
  dstEulerA.yaw = ballYaw;

  const rawBallPitch = quantizeAngleRadiansToUrot16(Math.atan2(lookBallY, horizBallDist));
  const baseAnglePitch = quantizeAngleRadiansToUrot16(angleDeg * DEG_TO_RAD);
  const highAngleFactor = Math.max(
    0.0,
    Math.min(1.0, (Math.abs(rawBallPitch * UROT_PER_RAD) - 4000.0) / 4000.0)
  );
  const ballPitch = quantizeAngleRadiansToUrot16(
    (rawBallPitch - baseAnglePitch) * 0.8 * highAngleFactor + baseAnglePitch
  );
  dstEulerA.pitch = ballPitch;

  if (snapOrientation) {
    out.roll = dstEulerA.roll;
    out.yaw = dstEulerA.yaw;
    out.pitch = dstEulerA.pitch;
  } else {
    const ballCamAlpha = 1.0 - Math.exp(dt * -8.59);
    out.roll = wrapRadiansPi(out.roll + wrapRadiansPi(0.0 - out.roll) * ballCamAlpha);
    out.yaw = wrapRadiansPi(out.yaw + wrapRadiansPi(ballYaw - out.yaw) * ballCamAlpha);
    out.pitch = wrapRadiansPi(out.pitch + wrapRadiansPi(ballPitch - out.pitch) * ballCamAlpha);
  }
}

export function computeAirCarCamRotation(
  inp: AirCarCamRotationInput,
  out: CameraPoseSnapshot
): void {
  const { scratchEulerA: eA, scratchEulerB: eB, scratchEulerC: eC, scratchVecA: vA } = inp;
  if (inp.snapOrientation) {
    const horizMag = Math.hypot(inp.carForwardX, inp.carForwardZ);
    const forwardYaw = computeUrotYawRadians(inp.carForwardX, inp.carForwardZ, horizMag);
    const forwardPitch = quantizeAngleRadiansToUrot16(Math.atan2(inp.carForwardY, horizMag));
    eA.roll = 0.0;
    eA.yaw = forwardYaw;
    eA.pitch = forwardPitch;

    const velX = inp.carVelX,
      velY = inp.carVelY,
      velZ = inp.carVelZ;
    let velYaw: number, velPitch: number, velRoll: number, velHorizMag: number;
    if (velZ * velZ + velX * velX + velY * velY > 1e-8) {
      velHorizMag = Math.hypot(velX, velZ);
      velRoll = 0.0;
      velYaw = computeUrotYawRadians(velX, velZ, velHorizMag);
      velPitch = quantizeAngleRadiansToUrot16(Math.atan2(velY, velHorizMag));
      eB.roll = velRoll;
      eB.yaw = velYaw;
      eB.pitch = velPitch;
    } else {
      velRoll = eA.roll;
      velYaw = eA.yaw;
      velPitch = eA.pitch;
      eB.roll = velRoll;
      eB.yaw = velYaw;
      eB.pitch = velPitch;
      velHorizMag = Math.hypot(velX, velZ);
    }

    const speedBlend = Math.min(1.0, velHorizMag / 500.0);
    eC.roll = wrapRadiansPi(wrapRadiansPi(velRoll) * speedBlend);
    const blendedYaw = wrapRadiansPi(wrapRadiansPi(velYaw - forwardYaw) * speedBlend + forwardYaw);
    eC.yaw = blendedYaw;
    eC.pitch = wrapRadiansPi(wrapRadiansPi(velPitch - forwardPitch) * speedBlend + forwardPitch);

    out.yaw = blendedYaw;
    out.roll = 0.0;
    out.pitch = quantizeAngleRadiansToUrot16(inp.angleDeg * DEG_TO_RAD);
    return;
  }

  const dirX = out.focusX - out.cameraPosX,
    dirY = out.focusY - out.cameraPosY,
    dirZ = out.focusZ - out.cameraPosZ;
  vA.x = dirX;
  vA.y = dirY;
  vA.z = dirZ;

  const vxF32 = f32(inp.carVelX),
    vyF32 = f32(inp.carVelY),
    vzF32 = f32(inp.carVelZ);
  const vxSqF32 = f32(vxF32 * vxF32),
    vySqF32 = f32(vyF32 * vyF32),
    vzSqF32 = f32(vzF32 * vzF32);
  const speedRatio = Math.min(
    1.0,
    f32(f32(Math.sqrt(f32(f32(vxSqF32 + vySqF32) + vzSqF32))) / f32(2300.0))
  );
  const stiffnessFactor = f32(f32(speedRatio * -25.0) + f32(35.0));

  const horizDist = Math.hypot(dirX, dirZ);
  const targetYaw = computeUrotYawRadians(dirX, dirZ, horizDist);
  const targetPitch = quantizeAngleRadiansToUrot16(Math.atan2(dirY, horizDist));
  eA.roll = 0.0;
  eA.yaw = targetYaw;
  eA.pitch = targetPitch;

  const blendAlphaF32 = f32(Math.min(1.0, stiffnessFactor / 60.0));
  out.yaw = interpolateUrot16Angle(out.yaw, targetYaw, blendAlphaF32);
  out.pitch = interpolateUrot16Angle(out.pitch, targetPitch, blendAlphaF32);
  out.roll = interpolateUrot16Angle(out.roll, 0.0, blendAlphaF32);

  const sinPitch = f32(Math.sin(out.pitch)),
    cosPitch = f32(Math.cos(out.pitch));
  const cosYaw = f32(Math.cos(out.yaw)),
    sinYaw = f32(Math.sin(out.yaw));
  const lookY = sinPitch,
    lookZ = f32(cosPitch * cosYaw),
    lookX = f32(cosPitch * sinYaw);
  vA.x = lookX;
  vA.y = lookY;
  vA.z = lookZ;

  if (inp.carVelZ * lookZ + (inp.carVelX * lookX + inp.carVelY * lookY) < 0.0) {
    const horizSpeedRatio = Math.min(
      1.0,
      f32(f32(Math.sqrt(f32(vxSqF32 + vzSqF32))) / f32(2300.0))
    );
    const dampScaleF32 = f32(1.0 - horizSpeedRatio);
    const pitchUrot = radiansToRoundedUrotInt(out.pitch);
    out.pitch =
      extendInt16(saturateInt32(Math.trunc(f32(dampScaleF32 * f32(pitchUrot))))) / UROT_PER_RAD;
  }
}

export function computeGroundCarCamRotation(
  inp: GroundCarCamRotationInput,
  out: CameraPoseSnapshot
): { smoothedNormalX: number; smoothedNormalY: number; smoothedNormalZ: number } {
  const {
    scratchEulerA: eA,
    scratchEulerB: eB,
    scratchEulerC: eC,
    scratchVecA: vA,
    scratchVecB: vB,
  } = inp;
  const blendAlpha = 1.0 - Math.exp(inp.dt * -10.46);
  let nx = inp.smoothedNormalX + (inp.surfaceNormalX - inp.smoothedNormalX) * blendAlpha;
  let ny = inp.smoothedNormalY + (inp.surfaceNormalY - inp.smoothedNormalY) * blendAlpha;
  let nz = inp.smoothedNormalZ + (inp.surfaceNormalZ - inp.smoothedNormalZ) * blendAlpha;
  const nLenSq = nz * nz + nx * nx + ny * ny;
  const invNLen = nLenSq === 0.0 ? 1.0 : 1.0 / Math.sqrt(nLenSq);
  nx *= invNLen;
  ny *= invNLen;
  nz *= invNLen;

  const c1Z = nx * inp.carForwardY - ny * inp.carForwardX;
  const c1Y = nz * inp.carForwardX - nx * inp.carForwardZ;
  const c1X = ny * inp.carForwardZ - nz * inp.carForwardY;
  inp.scratchTarget.x = c1X;
  inp.scratchTarget.y = c1Y;
  inp.scratchTarget.z = c1Z;

  const projZ = c1X * ny - c1Y * nx,
    projY = c1Z * nx - c1X * nz,
    projX = c1Y * nz - c1Z * ny;
  inp.scratchProjected.x = projX;
  inp.scratchProjected.y = projY;
  inp.scratchProjected.z = projZ;

  const elevAngle = Math.atan2(projY, Math.hypot(projX, projZ));
  const slopeBlend = Math.min(1.0, Math.abs(elevAngle * UROT_PER_RAD) / 48000.0);

  let targetNormalX = nx,
    targetNormalY = ny,
    targetNormalZ = nz;
  if (elevAngle > 0.0) {
    targetNormalX = -nx;
    targetNormalY = -ny;
    targetNormalZ = -nz;
    vB.x = targetNormalX;
    vB.y = targetNormalY;
    vB.z = targetNormalZ;
  }

  const blendedDirZ = projZ + (targetNormalZ - projZ) * slopeBlend;
  const blendedDirY = projY + (targetNormalY - projY) * slopeBlend;
  const blendedDirX = projX + (targetNormalX - projX) * slopeBlend;
  vA.x = blendedDirX;
  vA.y = blendedDirY;
  vA.z = blendedDirZ;

  const horizLen = Math.hypot(blendedDirX, blendedDirZ);
  const baseYaw = computeUrotYawRadians(blendedDirX, blendedDirZ, horizLen);
  eA.roll = 0.0;
  eA.yaw = baseYaw;

  const basePitchRaw = quantizeAngleRadiansToUrot16(Math.atan2(blendedDirY, horizLen));
  const maxPitchRoom = HALF_PI - basePitchRaw;
  const settingPitchRad = quantizeAngleRadiansToUrot16(inp.angleDeg * DEG_TO_RAD);
  const clampedOffsetPitch = settingPitchRad > maxPitchRoom ? maxPitchRoom : settingPitchRad;
  const basePitch = quantizeAngleRadiansToUrot16(basePitchRaw + clampedOffsetPitch);
  eA.pitch = basePitch;

  if (inp.snapOrientation) {
    out.roll = eA.roll;
    out.yaw = eA.yaw;
    out.pitch = eA.pitch;
    return { smoothedNormalX: nx, smoothedNormalY: ny, smoothedNormalZ: nz };
  }

  const stiffness = inp.stiffness,
    stiffnessScale = stiffness * 2.427 + 1.0;
  let fastYaw: number, fastPitch: number, fastRoll: number;
  if (stiffness < 1.0) {
    const fastAlphaF32 = f32(1.0 - Math.exp(inp.dt * (stiffnessScale * -13.39)));
    fastYaw = interpolateUrot16Angle(out.yaw, baseYaw, fastAlphaF32);
    fastPitch = interpolateUrot16Angle(out.pitch, basePitch, fastAlphaF32);
    fastRoll = interpolateUrot16Angle(out.roll, 0.0, fastAlphaF32);
    eB.yaw = fastYaw;
    eB.pitch = fastPitch;
    eB.roll = fastRoll;
  } else {
    fastRoll = eA.roll;
    fastYaw = eA.yaw;
    fastPitch = eA.pitch;
    eB.roll = fastRoll;
    eB.yaw = fastYaw;
    eB.pitch = fastPitch;
  }

  const slowAlphaF32 = f32(1.0 - Math.exp(inp.dt * (stiffnessScale * -2.03)));
  const slowYaw = interpolateUrot16Angle(out.yaw, baseYaw, slowAlphaF32);
  const slowPitch = interpolateUrot16Angle(out.pitch, basePitch, slowAlphaF32);
  const slowRoll = interpolateUrot16Angle(out.roll, 0.0, slowAlphaF32);
  eC.yaw = slowYaw;
  eC.pitch = slowPitch;
  eC.roll = slowRoll;

  const wallBlendF32 = f32(1.0 - Math.abs(ny));
  out.yaw = interpolateUrot16Angle(fastYaw, slowYaw, wallBlendF32);
  out.pitch = interpolateUrot16Angle(fastPitch, slowPitch, wallBlendF32);
  out.roll = interpolateUrot16Angle(fastRoll, slowRoll, wallBlendF32);
  return { smoothedNormalX: nx, smoothedNormalY: ny, smoothedNormalZ: nz };
}
