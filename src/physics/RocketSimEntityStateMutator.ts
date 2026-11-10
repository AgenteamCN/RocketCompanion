/**
 * RocketSimEntityStateMutator.ts
 * Pure WASM linear-memory entity state mutator for writing car controls,
 * applying ball/car state vectors, sanitizing car slices, and switching car teams.
 */

import {
  SIM_OFFSETS,
  MAX_CARS,
  CONTROLS_STRIDE,
  CONTROLS_OFFSETS,
  CAR_STATE_STRIDE,
  CAR_STATE_OFFSETS,
  BALL_STATE_STRIDE,
} from './RocketSimConstants.ts';
export interface RocketSimWasmModule {
  HEAPF32: Float32Array;
  _malloc(byteLength: number): number;
  _free?(bytePtr: number): void;
  _physics_addCarAtSlot?(slot: number, team: number, hitboxIndex: number): number;
  _physics_getCarThreeWheels?(carIndex: number): number;
  _physics_setCarThreeWheels?(carIndex: number, enabled: number): number;
  _physics_setBallState?(bytePtr: number): void;
  _physics_setCarState?(carIndex: number, bytePtr: number): void;
  _physics_setCarTeam?(carIndex: number, team: number): number;
  _physics_getStateSnapshotSize?(): number;
  _physics_saveState(bytePtr: number): void;
  _physics_restoreState(bytePtr: number): number;
  _physics_restoreCompactState?(bytePtr: number, floatCount: number): number;
  _physics_getPadInfoPtr(): number;
  _physics_isCarSlotActive?(slot: number): number;
  _physics_getActiveCarMask?(): number;
}

export interface RocketSimSnapshotMemoryViews {
  readonly statePtr: number;
  readonly stateLen: number;
  readonly controlsPtr: number;
  readonly state: Float32Array;
  controlsView: Float32Array | null;
  wasmStatePtr: number;
  wasmStateSize: number;
  cachedSnapshotBuffer: Float32Array | null;
  isCarSlotActive?: (carIndex: number) => boolean;
}

export interface CarControlsInput {
  throttle?: number;
  steer?: number;
  pitch?: number;
  yaw?: number;
  roll?: number;
  jump?: boolean | number;
  boost?: boolean | number;
  handbrake?: boolean | number;
}

export interface Vector3Like {
  0?: number;
  1?: number;
  2?: number;
  x?: number;
  y?: number;
  z?: number;
}

export interface EulerRotationLike extends Vector3Like {
  pitch?: number;
  yaw?: number;
  roll?: number;
}

export interface BallStateObjectInput {
  pos?: Vector3Like;
  vel?: Vector3Like;
  angVel?: Vector3Like;
}

export interface CarStateObjectInput {
  pos?: Vector3Like;
  posX?: number;
  posY?: number;
  posZ?: number;
  fwd?: Vector3Like;
  forward?: Vector3Like;
  fwdX?: number;
  fwdY?: number;
  fwdZ?: number;
  rot?: EulerRotationLike;
  right?: Vector3Like;
  up?: Vector3Like;
  vel?: Vector3Like;
  velX?: number;
  velY?: number;
  velZ?: number;
  angVel?: Vector3Like;
  boost?: number;
  isOnGround?: boolean | number;
  isSupersonic?: boolean | number;
  isDemoed?: boolean | number;
  demoRespawnTimer?: number;
  hasFlipOrJump?: boolean | number;
  flipsRemaining?: number;
  isBoosting?: boolean | number;
  isFlipping?: boolean | number;
}

export function writeCarControls(
  wasmModule: RocketSimWasmModule,
  memoryViews: RocketSimSnapshotMemoryViews,
  carIndex: number,
  controls: CarControlsInput
): void {
  const buffer = wasmModule.HEAPF32.buffer;
  if (!memoryViews.controlsView || memoryViews.controlsView.buffer !== buffer) {
    memoryViews.controlsView = new Float32Array(
      buffer,
      memoryViews.controlsPtr,
      MAX_CARS * CONTROLS_STRIDE
    );
  }
  const offset = carIndex * CONTROLS_STRIDE;
  const view = memoryViews.controlsView;

  view[offset + CONTROLS_OFFSETS.THROTTLE] = controls.throttle || 0;
  view[offset + CONTROLS_OFFSETS.STEER] = controls.steer || 0;
  view[offset + CONTROLS_OFFSETS.PITCH] = controls.pitch || 0;
  view[offset + CONTROLS_OFFSETS.YAW] = controls.yaw || 0;
  view[offset + CONTROLS_OFFSETS.ROLL] = controls.roll || 0;
  view[offset + CONTROLS_OFFSETS.JUMP] = controls.jump ? 1 : 0;
  view[offset + CONTROLS_OFFSETS.BOOST] = controls.boost ? 1 : 0;
  view[offset + CONTROLS_OFFSETS.HANDBRAKE] = controls.handbrake ? 1 : 0;
}

export function applyBallState(
  wasmModule: RocketSimWasmModule | null | undefined,
  memoryViews: RocketSimSnapshotMemoryViews,
  ballState: number | ArrayLike<number> | BallStateObjectInput | null | undefined
): boolean {
  if (typeof ballState === 'number') {
    if (typeof wasmModule?._physics_setBallState === 'function') {
      wasmModule._physics_setBallState(ballState);
      return true;
    }
    return false;
  }

  const target = memoryViews.state.subarray(SIM_OFFSETS.BALL, SIM_OFFSETS.BALL + BALL_STATE_STRIDE);

  if (ballState && typeof (ballState as ArrayLike<number>).length === 'number') {
    const seq = ballState as ArrayLike<number>;
    const count = Math.min(seq.length, BALL_STATE_STRIDE);
    for (let i = 0; i < count; i++) target[i] = seq[i];
    if (typeof wasmModule?._physics_setBallState === 'function') {
      wasmModule._physics_setBallState(memoryViews.statePtr + SIM_OFFSETS.BALL * 4);
    }
    return true;
  }

  if (ballState && typeof ballState === 'object') {
    const obj = ballState as BallStateObjectInput;
    if (obj.pos) {
      target[0] = Number(obj.pos[0] ?? obj.pos.x ?? 0);
      target[1] = Number(obj.pos[1] ?? obj.pos.y ?? 0);
      target[2] = Number(obj.pos[2] ?? obj.pos.z ?? 93.15);
    }
    if (obj.vel) {
      target[12] = Number(obj.vel[0] ?? obj.vel.x ?? 0);
      target[13] = Number(obj.vel[1] ?? obj.vel.y ?? 0);
      target[14] = Number(obj.vel[2] ?? obj.vel.z ?? 0);
    }
    if (obj.angVel) {
      target[15] = Number(obj.angVel[0] ?? obj.angVel.x ?? 0);
      target[16] = Number(obj.angVel[1] ?? obj.angVel.y ?? 0);
      target[17] = Number(obj.angVel[2] ?? obj.angVel.z ?? 0);
    }
    if (typeof wasmModule?._physics_setBallState === 'function') {
      wasmModule._physics_setBallState(memoryViews.statePtr + SIM_OFFSETS.BALL * 4);
    }
    return true;
  }
  return false;
}

export function sanitizeCarSliceInPlace(
  s: Float32Array | null | undefined,
  carIndex = 0,
  isTrailingSlot = false
): void {
  if (!s || s.length < 18) return;
  const O = CAR_STATE_OFFSETS;
  const px = s[O.POS],
    py = s[O.POS + 1],
    pz = s[O.POS + 2];
  if (isTrailingSlot) {
    s[O.POS] = -5500;
    s[O.POS + 1] = carIndex * 300;
    s[O.POS + 2] = -500;
    for (let k = O.VEL; k < O.ANG_VEL + 3; k++) s[k] = 0;
  } else if (
    !Number.isFinite(px) ||
    !Number.isFinite(py) ||
    !Number.isFinite(pz) ||
    Math.abs(px) > 4200 ||
    Math.abs(py) > 6100 ||
    pz < -50 ||
    pz > 2150
  ) {
    s[O.POS] = (carIndex >> 1) * 300 - 300;
    s[O.POS + 1] = carIndex % 2 === 1 ? 4608 : -4608;
    s[O.POS + 2] = 36;
    for (let k = O.VEL; k < O.ANG_VEL + 3; k++) s[k] = 0;
  } else {
    for (let k = O.VEL; k < O.ANG_VEL + 3; k++) {
      if (!Number.isFinite(s[k]) || Math.abs(s[k]) > 1e5) s[k] = 0;
    }
  }

  const fx = s[O.FWD],
    fy = s[O.FWD + 1],
    fz = s[O.FWD + 2];
  const rx = s[O.RIGHT],
    ry = s[O.RIGHT + 1],
    rz = s[O.RIGHT + 2];
  const ux = s[O.UP],
    uy = s[O.UP + 1],
    uz = s[O.UP + 2];
  const fSq = fx * fx + fy * fy + fz * fz;
  const rSq = rx * rx + ry * ry + rz * rz;
  const uSq = ux * ux + uy * uy + uz * uz;
  const det = fx * (ry * uz - rz * uy) - fy * (rx * uz - rz * ux) + fz * (rx * uy - ry * ux);

  if (
    !Number.isFinite(fSq) ||
    fSq < 0.5 ||
    fSq > 2.0 ||
    !Number.isFinite(rSq) ||
    rSq < 0.5 ||
    rSq > 2.0 ||
    !Number.isFinite(uSq) ||
    uSq < 0.5 ||
    uSq > 2.0 ||
    !Number.isFinite(det) ||
    Math.abs(det) < 0.2
  ) {
    s[O.FWD] = 1;
    s[O.FWD + 1] = 0;
    s[O.FWD + 2] = 0;
    s[O.RIGHT] = 0;
    s[O.RIGHT + 1] = 1;
    s[O.RIGHT + 2] = 0;
    s[O.UP] = 0;
    s[O.UP + 1] = 0;
    s[O.UP + 2] = 1;
  }

  for (let k = 18; k < s.length; k++) {
    if (!Number.isFinite(s[k])) s[k] = 0;
  }
}

export function applyCarState(
  wasmModule: RocketSimWasmModule | null | undefined,
  memoryViews: RocketSimSnapshotMemoryViews,
  carIndex: number,
  carState: number | ArrayLike<number> | CarStateObjectInput | null | undefined
): boolean {
  const offset = SIM_OFFSETS.CARS + carIndex * CAR_STATE_STRIDE;
  if (typeof carState === 'number') {
    if (typeof wasmModule?._physics_setCarState === 'function') {
      wasmModule._physics_setCarState(carIndex, carState);
      return true;
    }
    return false;
  }

  const target = memoryViews.state.subarray(offset, offset + CAR_STATE_STRIDE);

  if (carState && typeof (carState as ArrayLike<number>).length === 'number') {
    const seq = carState as ArrayLike<number>;
    const count = Math.min(seq.length, CAR_STATE_STRIDE);
    for (let i = 0; i < count; i++) target[i] = seq[i];
    sanitizeCarSliceInPlace(target, carIndex, false);
    wasmModule?._physics_setCarState?.(carIndex, memoryViews.statePtr + offset * 4);
    return true;
  }

  if (carState && typeof carState === 'object') {
    const obj = carState as CarStateObjectInput;
    const O = CAR_STATE_OFFSETS;
    const fin = (val: unknown, name: string): number => {
      if (typeof val !== 'number' || !Number.isFinite(val)) {
        throw new Error(
          `[RocketSimPhysicsEngine] setCarState non-finite or invalid number for ${name}: ${val}`
        );
      }
      return val;
    };
    const setVec = (
      base: number,
      v: Vector3Like,
      dx: number,
      dy: number,
      dz: number,
      label: string
    ) => {
      target[base] = fin(v[0] ?? v.x ?? dx, `${label}.x`);
      target[base + 1] = fin(v[1] ?? v.y ?? dy, `${label}.y`);
      target[base + 2] = fin(v[2] ?? v.z ?? dz, `${label}.z`);
    };

    if (obj.pos) setVec(O.POS, obj.pos, 0, 0, 0, 'pos');
    else {
      if ('posX' in obj) target[O.POS] = fin(obj.posX, 'posX');
      if ('posY' in obj) target[O.POS + 1] = fin(obj.posY, 'posY');
      if ('posZ' in obj) target[O.POS + 2] = fin(obj.posZ, 'posZ');
    }

    const fwdVec = obj.fwd || obj.forward;
    if (fwdVec) setVec(O.FWD, fwdVec, 1, 0, 0, 'fwd');
    else if ('fwdX' in obj || 'fwdY' in obj || 'fwdZ' in obj) {
      if ('fwdX' in obj) target[O.FWD] = fin(obj.fwdX, 'fwdX');
      if ('fwdY' in obj) target[O.FWD + 1] = fin(obj.fwdY, 'fwdY');
      if ('fwdZ' in obj) target[O.FWD + 2] = fin(obj.fwdZ, 'fwdZ');
    } else if (obj.rot) {
      const pitch = fin(obj.rot[0] ?? obj.rot.pitch ?? obj.rot.x ?? 0, 'rot.pitch');
      const yaw = fin(obj.rot[1] ?? obj.rot.yaw ?? obj.rot.y ?? 0, 'rot.yaw');
      const roll = fin(obj.rot[2] ?? obj.rot.roll ?? obj.rot.z ?? 0, 'rot.roll');
      const cp = Math.cos(pitch),
        sp = Math.sin(pitch);
      const cy = Math.cos(yaw),
        sy = Math.sin(yaw);
      const cr = Math.cos(roll),
        sr = Math.sin(roll);
      target[O.FWD] = cy * cp;
      target[O.FWD + 1] = sy * cp;
      target[O.FWD + 2] = sp;
      if (!obj.right) {
        target[O.RIGHT] = cy * sp * sr - sy * cr;
        target[O.RIGHT + 1] = sy * sp * sr + cy * cr;
        target[O.RIGHT + 2] = -cp * sr;
      }
      if (!obj.up) {
        target[O.UP] = -cy * sp * cr - sy * sr;
        target[O.UP + 1] = -sy * sp * cr + cy * sr;
        target[O.UP + 2] = cp * cr;
      }
    }

    if (obj.right) setVec(O.RIGHT, obj.right, 0, 1, 0, 'right');
    if (obj.up) setVec(O.UP, obj.up, 0, 0, 1, 'up');
    if (obj.vel) setVec(O.VEL, obj.vel, 0, 0, 0, 'vel');
    else {
      if ('velX' in obj) target[O.VEL] = fin(obj.velX, 'velX');
      if ('velY' in obj) target[O.VEL + 1] = fin(obj.velY, 'velY');
      if ('velZ' in obj) target[O.VEL + 2] = fin(obj.velZ, 'velZ');
    }
    if (obj.angVel) setVec(O.ANG_VEL, obj.angVel, 0, 0, 0, 'angVel');
    if ('boost' in obj) target[O.BOOST] = fin(obj.boost, 'boost');
    if ('isOnGround' in obj) target[19] = obj.isOnGround ? 1 : 0;
    if ('isSupersonic' in obj) target[20] = obj.isSupersonic ? 1 : 0;
    if ('isDemoed' in obj) {
      target[21] = obj.isDemoed
        ? typeof obj.demoRespawnTimer === 'number' && obj.demoRespawnTimer > 0
          ? obj.demoRespawnTimer
          : 3.0
        : 0;
    }
    if ('hasFlipOrJump' in obj) {
      target[22] =
        typeof obj.flipsRemaining === 'number' ? obj.flipsRemaining : obj.hasFlipOrJump ? 1 : 0;
    }
    if ('isBoosting' in obj) target[23] = obj.isBoosting ? 1 : 0;
    if ('isFlipping' in obj) target[24] = obj.isFlipping ? 1 : 0;

    sanitizeCarSliceInPlace(target, carIndex, false);
    wasmModule?._physics_setCarState?.(carIndex, memoryViews.statePtr + offset * 4);
    return true;
  }
  return false;
}

export function setCarTeamInWasm(
  wasmModule: RocketSimWasmModule | null | undefined,
  carIndex: number,
  team: number,
  hitboxIndex = 0,
  memoryViews?: Pick<RocketSimSnapshotMemoryViews, 'state' | 'statePtr'> | null
): boolean {
  if (!wasmModule || carIndex < 0 || carIndex >= MAX_CARS) return false;
  const normalizedTeam = team ? 1 : 0;
  if (typeof wasmModule._physics_setCarTeam === 'function') {
    return wasmModule._physics_setCarTeam(carIndex, normalizedTeam) === 1;
  }
  if (typeof wasmModule._physics_addCarAtSlot === 'function') {
    const offset = SIM_OFFSETS.CARS + carIndex * CAR_STATE_STRIDE;
    const savedSlice =
      memoryViews?.state && offset + CAR_STATE_STRIDE <= memoryViews.state.length
        ? memoryViews.state.slice(offset, offset + CAR_STATE_STRIDE)
        : null;
    const savedThreeWheels = wasmModule._physics_getCarThreeWheels?.(carIndex) === 1;
    if (wasmModule._physics_addCarAtSlot(carIndex, normalizedTeam, hitboxIndex) !== carIndex)
      return false;
    if (savedThreeWheels) wasmModule._physics_setCarThreeWheels?.(carIndex, 1);
    if (savedSlice && memoryViews?.state) {
      memoryViews.state.subarray(offset, offset + CAR_STATE_STRIDE).set(savedSlice);
      wasmModule._physics_setCarState?.(carIndex, memoryViews.statePtr + offset * 4);
    }
    return true;
  }
  return false;
}
