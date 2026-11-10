/**
 * povCameraFixedPointMath.ts
 * Pure mathematical primitives, 16-bit Unreal Rotator (UROT16) quantization,
 * quaternion basis extraction, exponential 3D spring filters, and pose blending.
 */

export const UROT_PER_RAD = 10430.378350470453; // 32768 / Math.PI
export const UROT_PER_RAD_F32 = Math.fround(10430.3779296875);
export const DEG_TO_RAD = 0.017453292519943295; // Math.PI / 180
export const RAD_TO_DEG = 57.29577951308232; // 180 / Math.PI
export const HALF_PI = 1.5707963267948966;
export const MAX_SWIVEL_PITCH_RAD = 1.4835298641951802; // 85 degrees in radians
export const VIEW_BUFFER_FLOATS = 42;

const f32 = Math.fround;
const isFin = Number.isFinite;

export interface Vec3State {
  x: number;
  y: number;
  z: number;
}
export interface EulerAnglesState {
  pitch: number;
  yaw: number;
  roll: number;
}
export interface PovCameraSettingsState {
  fov: number;
  distance: number;
  height: number;
  angleDeg: number;
  stiffness: number;
  transitionSpeed: number;
}

export interface SpringFilter3DState {
  rate: number;
  maxLagDistance: number;
  scale: number;
  posX: number;
  posY: number;
  posZ: number;
  velX: number;
  velY: number;
  velZ: number;
  initialized: boolean;
}

export interface CameraPoseSnapshot {
  focusX: number;
  focusY: number;
  focusZ: number;
  pitch: number;
  yaw: number;
  roll: number;
  distance: number;
  fov: number;
  cameraPosX: number;
  cameraPosY: number;
  cameraPosZ: number;
}

export interface PoseTransitionDelta {
  focusX: number;
  focusY: number;
  focusZ: number;
  pitch: number;
  yaw: number;
  roll: number;
  distance: number;
  fov: number;
}

export function roundToNearestEven(value: number): number {
  const absVal = Math.abs(value);
  if (absVal >= 4503599627370496.0) return value;
  const rounded = absVal + 4503599627370496.0 - 4503599627370496.0;
  return value < 0 ? -rounded : rounded;
}

export function saturateInt32(value: number): number {
  if (Number.isNaN(value)) return 0;
  if (value >= 2147483647.0) return 2147483647;
  if (value <= -2147483648.0) return -2147483648;
  return Math.trunc(value) | 0;
}

export function extendInt16(value: number): number {
  return (value << 16) >> 16;
}

export function quantizeAngleRadiansToUrot16(radians: number): number {
  const scaled = f32(f32(radians) * UROT_PER_RAD_F32);
  return extendInt16(saturateInt32(Math.trunc(scaled))) / UROT_PER_RAD;
}

export function radiansToRoundedUrotInt(radians: number): number {
  return saturateInt32(roundToNearestEven(radians * UROT_PER_RAD));
}

export function interpolateUrot16Angle(
  currentRad: number,
  targetRad: number,
  alphaF32: number
): number {
  const currentUrot = radiansToRoundedUrotInt(currentRad);
  const targetUrot = radiansToRoundedUrotInt(targetRad);
  const deltaUrot = extendInt16((targetUrot - currentUrot) | 0);
  const stepUrot = saturateInt32(Math.trunc(f32(alphaF32 * f32(deltaUrot))));
  return extendInt16((currentUrot + stepUrot) | 0) / UROT_PER_RAD;
}

export function computeUrotYawRadians(dirX: number, dirZ: number, horizLen: number): number {
  let yawUnits = 16384.0;
  if (horizLen > 1e-9) {
    const raw = saturateInt32(Math.trunc(f32(f32(Math.atan2(dirZ, dirX)) * UROT_PER_RAD_F32)));
    yawUnits = extendInt16((1073741824 - (raw << 16)) >> 16);
  }
  return yawUnits / UROT_PER_RAD;
}

export function wrapRadiansPi(radians: number): number {
  return Math.atan2(Math.sin(radians), Math.cos(radians));
}

export function createSpringFilter(rate: number, maxLagDistance = 0): SpringFilter3DState {
  return {
    rate,
    maxLagDistance,
    scale: 0,
    posX: 0,
    posY: 0,
    posZ: 0,
    velX: 0,
    velY: 0,
    velZ: 0,
    initialized: false,
  };
}

export function createCameraPoseSnapshot(): CameraPoseSnapshot {
  return {
    focusX: 0,
    focusY: 0,
    focusZ: 0,
    pitch: 0,
    yaw: 0,
    roll: 0,
    distance: 270.0,
    fov: 110.0,
    cameraPosX: 0,
    cameraPosY: 0,
    cameraPosZ: 0,
  };
}

export function copyCameraPoseSnapshot(dst: CameraPoseSnapshot, src: CameraPoseSnapshot): void {
  dst.focusX = src.focusX;
  dst.focusY = src.focusY;
  dst.focusZ = src.focusZ;
  dst.pitch = src.pitch;
  dst.yaw = src.yaw;
  dst.roll = src.roll;
  dst.distance = src.distance;
  dst.fov = src.fov;
  dst.cameraPosX = src.cameraPosX;
  dst.cameraPosY = src.cameraPosY;
  dst.cameraPosZ = src.cameraPosZ;
}

export function computeTransitionDelta(
  out: PoseTransitionDelta,
  fromP: CameraPoseSnapshot,
  toP: CameraPoseSnapshot
): void {
  out.focusX = fromP.focusX - toP.focusX;
  out.focusY = fromP.focusY - toP.focusY;
  out.focusZ = fromP.focusZ - toP.focusZ;
  out.pitch = wrapRadiansPi(fromP.pitch - toP.pitch);
  out.yaw = wrapRadiansPi(fromP.yaw - toP.yaw);
  out.roll = wrapRadiansPi(fromP.roll - toP.roll);
  out.distance = fromP.distance - toP.distance;
  out.fov = fromP.fov - toP.fov;
}

export function applyQuadraticTransitionBlend(
  out: CameraPoseSnapshot,
  d: PoseTransitionDelta,
  remTime: number,
  totalDur: number,
  distFirst: boolean
): void {
  if (remTime <= 0.0 || totalDur <= 0.0) return;
  const r = Math.max(0.0, Math.min(1.0, remTime / totalDur)),
    w = r * r;
  out.focusX += d.focusX * w;
  out.focusY += d.focusY * w;
  out.focusZ += d.focusZ * w;
  if (distFirst) {
    out.distance += d.distance * w;
    out.fov += d.fov * w;
    out.pitch = wrapRadiansPi(out.pitch + d.pitch * w);
    out.yaw = wrapRadiansPi(out.yaw + d.yaw * w);
    out.roll = wrapRadiansPi(out.roll + d.roll * w);
  } else {
    out.pitch = wrapRadiansPi(out.pitch + d.pitch * w);
    out.yaw = wrapRadiansPi(out.yaw + d.yaw * w);
    out.roll = wrapRadiansPi(out.roll + d.roll * w);
    out.distance += d.distance * w;
    out.fov += d.fov * w;
  }
}

export function stepSpringFilter3D(
  out: SpringFilter3DState,
  target: Vec3State,
  dt: number,
  outDiff: Vec3State
): void {
  const tX = target.x,
    tY = target.y,
    tZ = target.z;
  if (!out.initialized) {
    out.initialized = true;
    out.posX = tX;
    out.posY = tY;
    out.posZ = tZ;
    out.velX = 0.0;
    out.velY = 0.0;
    out.velZ = 0.0;
    return;
  }
  const alpha = 1.0 - Math.exp(dt * -out.rate);
  out.posX += (tX - out.posX) * alpha;
  out.posY += (tY - out.posY) * alpha;
  out.posZ += (tZ - out.posZ) * alpha;
  const dX = tX - out.posX,
    dY = tY - out.posY,
    dZ = tZ - out.posZ;
  outDiff.x = dX;
  outDiff.y = dY;
  outDiff.z = dZ;
  const maxLag = out.maxLagDistance;
  if (maxLag > 0.0) {
    const distSq = dZ * dZ + dX * dX + dY * dY;
    if (distSq > maxLag * maxLag) {
      const invD = distSq === 0.0 ? 1.0 : 1.0 / Math.sqrt(distSq);
      const cZ = maxLag * (dZ * invD),
        cY = maxLag * (dY * invD),
        cX = maxLag * (dX * invD);
      outDiff.z = cZ;
      outDiff.y = cY;
      outDiff.x = cX;
      out.posZ = tZ - cZ;
      out.posY = tY - cY;
      out.posX = tX - cX;
    }
  }
  out.posZ = f32(out.posZ);
  out.posY = f32(out.posY);
  out.posX = f32(out.posX);
  const sc = out.scale;
  out.velZ = f32(outDiff.z * sc);
  out.velY = f32(outDiff.y * sc);
  out.velX = f32(outDiff.x * sc);
}

export function stepSwivelOffsets(
  swivelYaw: number,
  swivelPitch: number,
  dt: number,
  lookXInput: number,
  lookYInput: number,
  swivelSpeedInput: number,
  invertSwivelInput: number
): { swivelYaw: number; swivelPitch: number } {
  if (dt <= 0.0) return { swivelYaw, swivelPitch };
  const dtF32 = f32(dt);
  const safeSpd = isFin(swivelSpeedInput) ? Math.max(1.0, Math.min(10.0, swivelSpeedInput)) : 4.0;
  const fastRate = safeSpd * 3.0;

  const curPU = radiansToRoundedUrotInt(swivelPitch);
  const safeLY = isFin(lookYInput) ? Math.max(-1.0, Math.min(1.0, lookYInput)) : 0.0;
  const sigLY = invertSwivelInput !== 0.0 ? safeLY : -safeLY;
  const tgtPU = saturateInt32(Math.trunc(f32(f32(sigLY * 1.0471975511965976) * UROT_PER_RAD_F32)));
  const pAlpha = Math.min(
    1.0,
    f32(dtF32 * f32(Math.abs(tgtPU) < Math.abs(curPU) ? fastRate : safeSpd))
  );
  const nextPitch = saturateInt32(f32(curPU + f32((tgtPU - curPU) * pAlpha))) / UROT_PER_RAD;

  const curYU = radiansToRoundedUrotInt(swivelYaw);
  const safeLX = isFin(lookXInput) ? Math.max(-1.0, Math.min(1.0, lookXInput)) : 0.0;
  const tgtYU = saturateInt32(
    Math.trunc(f32(f32(safeLX * -2.2689280275926285) * UROT_PER_RAD_F32))
  );
  const yAlpha = Math.min(
    1.0,
    f32(dtF32 * f32(Math.abs(tgtYU) < Math.abs(curYU) ? fastRate : safeSpd))
  );
  const nextYaw = saturateInt32(f32(curYU + f32((tgtYU - curYU) * yAlpha))) / UROT_PER_RAD;
  return { swivelYaw: nextYaw, swivelPitch: nextPitch };
}

export function extractCarBasisFromQuaternion(
  qx: number,
  qy: number,
  qz: number,
  qw: number
): {
  upX: number;
  upY: number;
  upZ: number;
  rightX: number;
  rightY: number;
  rightZ: number;
  fwdX: number;
  fwdY: number;
  fwdZ: number;
} {
  const uX = 2.0 * (qx * qy - qw * qz),
    uY = qw * qw - qx * qx + qy * qy - qz * qz,
    uZ = 2.0 * (qy * qz + qw * qx);
  const uLenSq = uZ * uZ + uX * uX + uY * uY,
    invU = uLenSq === 0.0 ? 1.0 : 1.0 / Math.sqrt(uLenSq);
  const rX = 2.0 * (qx * qz + qw * qy),
    rY = 2.0 * (qy * qz - qw * qx),
    rZ = qw * qw - qx * qx - qy * qy + qz * qz;
  const rLenSq = rZ * rZ + rX * rX + rY * rY,
    invR = rLenSq === 0.0 ? 1.0 : 1.0 / Math.sqrt(rLenSq);
  const fX = qw * qw + qx * qx - qy * qy - qz * qz,
    fY = 2.0 * (qx * qy + qw * qz),
    fZ = 2.0 * (qx * qz - qw * qy);
  const fLenSq = fZ * fZ + fX * fX + fY * fY,
    invF = fLenSq === 0.0 ? 1.0 : 1.0 / Math.sqrt(fLenSq);
  return {
    upX: uX * invU,
    upY: uY * invU,
    upZ: uZ * invU,
    rightX: rX * invR,
    rightY: rY * invR,
    rightZ: rZ * invR,
    fwdX: fX * invF,
    fwdY: fY * invF,
    fwdZ: fZ * invF,
  };
}

export function packCameraViewBufferOutput(
  v: Float64Array,
  bp: CameraPoseSnapshot,
  aspectInput: number
): { camPosX: number; camPosY: number; camPosZ: number } {
  const sinP = f32(Math.sin(bp.pitch)),
    cosP = f32(Math.cos(bp.pitch));
  const dirY = sinP,
    dirZ = f32(f32(Math.cos(bp.yaw)) * cosP),
    dirX = f32(f32(Math.sin(bp.yaw)) * cosP);
  const distF32 = f32(bp.distance);
  const camPosZ = f32(bp.focusZ - f32(dirZ * distF32));
  const camPosX = f32(bp.focusX - f32(dirX * distF32));
  const rawCamY = f32(bp.focusY - f32(sinP * distF32));
  const camPosY = rawCamY < 10.0 ? 10.0 : rawCamY;

  let outUpX = 0.0,
    outUpY = 1.0,
    outUpZ = 0.0;
  const roll = bp.roll;
  if (Math.abs(roll) > 1e-8) {
    const cR = Math.cos(roll),
      sR = Math.sin(roll),
      omc = 1.0 - cR;
    outUpZ = dirY * dirZ * omc + dirX * sR;
    outUpY = dirY * dirY * omc + cR;
    outUpX = dirY * dirX * omc - dirZ * sR;
  }
  v[32] = camPosX;
  v[33] = camPosY;
  v[34] = camPosZ;
  v[35] = dirX;
  v[36] = dirY;
  v[37] = dirZ;
  v[38] = outUpX;
  v[39] = outUpY;
  v[40] = outUpZ;
  const halfFov = bp.fov * DEG_TO_RAD * 0.5;
  const aspect = aspectInput < 1.0 ? 1.7777777777777777 : aspectInput;
  const vHalf = Math.atan(Math.tan(halfFov) / aspect);
  v[41] = (vHalf + vHalf) * RAD_TO_DEG;
  return { camPosX, camPosY, camPosZ };
}

export function projectFocusPointAlongViewRay(
  out: CameraPoseSnapshot,
  fS: SpringFilter3DState,
  targetFocus: Vec3State,
  stiffness: number,
  dstDir: Vec3State,
  resProj: Vec3State,
  resultBf: Vec3State
): void {
  const sinP = f32(Math.sin(out.pitch)),
    cosP = f32(Math.cos(out.pitch));
  const pDirY = sinP,
    pDirZ = f32(cosP * f32(Math.cos(out.yaw))),
    pDirX = f32(cosP * f32(Math.sin(out.yaw)));
  dstDir.x = pDirX;
  dstDir.y = pDirY;
  dstDir.z = pDirZ;

  const relSZ = f32(fS.posZ - out.cameraPosZ),
    relSY = f32(fS.posY - out.cameraPosY),
    relSX = f32(fS.posX - out.cameraPosX);
  const dotS = f32(f32(f32(pDirY * relSY) + f32(pDirX * relSX)) + f32(pDirZ * relSZ));
  const perpZ = f32(relSZ - f32(pDirZ * dotS)),
    perpY = f32(relSY - f32(pDirY * dotS)),
    perpX = f32(relSX - f32(pDirX * dotS));

  const tfX = targetFocus.x,
    tfY = targetFocus.y,
    tfZ = targetFocus.z;
  const relTX = f32(tfX - out.cameraPosX),
    relTY = f32(tfY - out.cameraPosY),
    relTZ = f32(tfZ - out.cameraPosZ);
  const dotT = f32(f32(f32(pDirY * relTY) + f32(pDirX * relTX)) + f32(pDirZ * relTZ));

  const projZ = f32(perpZ + f32(pDirZ * dotT)),
    projY = f32(perpY + f32(pDirY * dotT)),
    projX = f32(perpX + f32(pDirX * dotT));
  resProj.x = projX;
  resProj.y = projY;
  resProj.z = projZ;
  const bfZ = f32(out.cameraPosZ + projZ),
    bfY = f32(out.cameraPosY + projY),
    bfX = f32(out.cameraPosX + projX);
  resultBf.x = bfX;
  resultBf.y = bfY;
  resultBf.z = bfZ;

  const stiffF32 = f32(stiffness);
  out.focusY = f32(f32(f32(tfY - bfY) * stiffF32) + bfY);
  out.focusZ = f32(f32(f32(tfZ - bfZ) * stiffF32) + bfZ);
  out.focusX = f32(f32(f32(tfX - bfX) * stiffF32) + bfX);
}

export function blendGroundAndAirCandidatePoses(
  out: CameraPoseSnapshot,
  gP: CameraPoseSnapshot,
  aP: CameraPoseSnapshot,
  w: number,
  dstDir: Vec3State
): void {
  const wF32 = f32(w);
  out.focusX = aP.focusX + (gP.focusX - aP.focusX) * w;
  out.focusY = aP.focusY + (gP.focusY - aP.focusY) * w;
  out.focusZ = aP.focusZ + (gP.focusZ - aP.focusZ) * w;
  out.pitch = interpolateUrot16Angle(aP.pitch, gP.pitch, wF32);
  out.yaw = interpolateUrot16Angle(aP.yaw, gP.yaw, wF32);
  out.roll = interpolateUrot16Angle(aP.roll, gP.roll, wF32);
  out.distance = aP.distance + (gP.distance - aP.distance) * w;
  out.fov = aP.fov + (gP.fov - aP.fov) * w;
  const cP = f32(Math.cos(out.pitch)),
    sP = f32(Math.sin(out.pitch));
  const dZ = f32(cP * f32(Math.cos(out.yaw))),
    dY = sP,
    dX = f32(cP * f32(Math.sin(out.yaw)));
  dstDir.x = dX;
  dstDir.y = dY;
  dstDir.z = dZ;
  const distF32 = f32(out.distance);
  out.cameraPosZ = f32(out.focusZ - f32(dZ * distF32));
  out.cameraPosX = f32(out.focusX - f32(dX * distF32));
  const rCamY = f32(out.focusY - f32(distF32 * dY));
  out.cameraPosY = rCamY < 10.0 ? 10.0 : rCamY;
}

export function initPrimaryCameraPose(
  out: CameraPoseSnapshot,
  carPos: Vec3State,
  fwdX: number,
  fwdY: number,
  fwdZ: number,
  upX: number,
  upY: number,
  upZ: number,
  s: PovCameraSettingsState
): void {
  const fwdH = Math.hypot(fwdX, fwdZ);
  const initYaw = computeUrotYawRadians(fwdX, fwdZ, fwdH);
  const fwdPitch = quantizeAngleRadiansToUrot16(Math.atan2(fwdY, fwdH));
  const initPitch = quantizeAngleRadiansToUrot16(
    fwdPitch + quantizeAngleRadiansToUrot16(s.angleDeg * DEG_TO_RAD)
  );
  const h = s.height,
    distF32 = f32(s.distance);
  out.fov = s.fov;
  out.distance = s.distance;
  out.roll = 0.0;
  out.yaw = initYaw;
  out.pitch = initPitch;
  out.focusZ = carPos.z + upZ * h;
  out.focusY = carPos.y + upY * h;
  out.focusX = carPos.x + upX * h;
  const sinP = f32(Math.sin(initPitch)),
    cosP = f32(Math.cos(initPitch));
  out.cameraPosZ = f32(out.focusZ - f32(f32(cosP * f32(Math.cos(initYaw))) * distF32));
  out.cameraPosX = f32(out.focusX - f32(f32(cosP * f32(Math.sin(initYaw))) * distF32));
  const rawCamY = f32(out.focusY - f32(distF32 * sinP));
  out.cameraPosY = rawCamY < 10.0 ? 10.0 : rawCamY;
}
