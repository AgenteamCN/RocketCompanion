import * as THREE from 'three';
import {
  ArenaHeaderView,
  BallStateView,
  CarStateView,
  type NumericStateBuffer,
} from '../../../physics/RocketSimStateViews.ts';
import { interpolatePhysicsTransform, unrealToThreeCoords } from '../../arena/ArenaMath.ts';
import { supersonicTrailRuntimeConfig } from '../../../ui-core/config/supersonicTrailConfig.ts';

export interface VehicleWheelRigLike {
  steer: THREE.Object3D;
  spin?: THREE.Object3D;
}
export type VehicleWheelSetLike = VehicleWheelRigLike[] & { threeWheels?: boolean };
export type WheelSpecTupleLike = [number, number, number] | number[];

export interface CarPoseKinematicState {
  lastPos: THREE.Vector3;
  lastQuat: THREE.Quaternion;
  hasLastPose: boolean;
}

export interface CarStepTicksResult {
  dtTicks: number;
  isPausedFreeze: boolean;
}

/**
 * Resolves the effective simulation tick advance for a vehicle's supersonic trail.
 * - When the car has non-zero physics velocity (or forced supersonic state) yet its 3D pose
 *   has not moved between render frames, the simulation/replay is paused -> returns dtTicks = 0.
 * - During slow-mo or fast-forward replay, scales dtTicks by actual kinematic displacement
 *   relative to the car's velocity vector so the ribbon maintains its physical length.
 */
export function resolveCarStepTicks(
  poseState: CarPoseKinematicState,
  carRoot: THREE.Object3D,
  currCar: CarStateView,
  dt: number,
  isSupersonicOrForced: boolean,
  maxStepBreakDistUu: number
): CarStepTicksResult {
  const posDeltaSq = poseState.hasLastPose
    ? poseState.lastPos.distanceToSquared(carRoot.position)
    : Infinity;
  const quatDot = poseState.hasLastPose ? Math.abs(poseState.lastQuat.dot(carRoot.quaternion)) : 0;
  const isPoseStationary = poseState.hasLastPose && posDeltaSq < 1e-4 && quatDot > 0.999999;

  poseState.lastPos.copy(carRoot.position);
  poseState.lastQuat.copy(carRoot.quaternion);
  poseState.hasLastPose = true;

  const speedUu = Math.hypot(currCar.velX, currCar.velY, currCar.velZ);
  const rawDtTicks = Math.max(0.15, Math.min(12, (dt || 0.008333) * 120));

  if (dt <= 0 || (isPoseStationary && (speedUu > 5.0 || isSupersonicOrForced))) {
    return { dtTicks: 0, isPausedFreeze: true };
  }

  const maxBreakSq = maxStepBreakDistUu * maxStepBreakDistUu;
  if (!isPoseStationary && speedUu > 100 && posDeltaSq > 1e-4 && posDeltaSq < maxBreakSq) {
    const kinematicSec = Math.sqrt(posDeltaSq) / speedUu;
    const kinematicTicks = THREE.MathUtils.clamp(kinematicSec * 120, 0.05, 12);
    return { dtTicks: kinematicTicks, isPausedFreeze: false };
  }

  return { dtTicks: rawDtTicks, isPausedFreeze: false };
}

export interface ReplayTrailWarmupArenaPort {
  cars?: ArrayLike<unknown> | null;
  carWheels?: ArrayLike<VehicleWheelSetLike | null | undefined> | null;
  vehiclePresets?: ArrayLike<string | null | undefined> | null;
  carVisual?: string;
  vehicleRegistry?: {
    carWheelSpecs?: ArrayLike<WheelSpecTupleLike[] | null | undefined> | null;
  } | null;
  supersonicWheelTrailSystem?: {
    resetCar?: (carIndex?: number | null) => void;
    updateCar?: (
      carIndex: number,
      carRoot: THREE.Object3D | null | undefined,
      wheels: VehicleWheelSetLike | null | undefined,
      wheelSpecs: WheelSpecTupleLike[] | null | undefined,
      currCar: CarStateView | null | undefined,
      vehiclePreset: string | null | undefined,
      dt: number,
      activeVisuals?: boolean,
      prevCar?: CarStateView | null,
      alpha?: number
    ) => void;
  } | null;
  ballSpeedTrail?: {
    reset?: () => void;
    update?: (pos: THREE.Vector3, vel: THREE.Vector3, dt: number) => void;
  } | null;
}

const _headerView = new ArenaHeaderView();
const _currCarView = new CarStateView();
const _prevCarView = new CarStateView();
const _currBallView = new BallStateView();
const _prevBallView = new BallStateView();
const _scratchCarObj = new THREE.Object3D();
const _scratchBallObj = new THREE.Object3D();
const _scratchBallVel = new THREE.Vector3();
const _pA = new THREE.Vector3();
const _pB = new THREE.Vector3();
const _qA = new THREE.Quaternion();
const _qB = new THREE.Quaternion();

/**
 * Reconstructs supersonic wheel ribbons and ball speed trails up to `targetCursorFloat`
 * by stepping historical snapshots from `[max(0, baseIdx - lookbackTicks) .. targetCursorFloat]`.
 * Allows paused imports (`.rcgr.gz`), Reference FreeCam, and timeline scrubbing to display
 * full multi-frame curved trails without modifying the RCGR container format.
 */
export function warmupArenaTrailsFromReplayWindow(
  arena: ReplayTrailWarmupArenaPort | null | undefined,
  getFrameBufferByIndex:
    ((index: number) => NumericStateBuffer | null | undefined) | null | undefined,
  targetCursorFloat: number,
  lookbackTicks?: number
): void {
  const trailSys = arena?.supersonicWheelTrailSystem;
  if (!arena || !trailSys?.updateCar || typeof getFrameBufferByIndex !== 'function') return;

  const cfg = supersonicTrailRuntimeConfig;
  const effectiveLookback =
    typeof lookbackTicks === 'number' && lookbackTicks > 0
      ? Math.floor(lookbackTicks)
      : Math.max(48, Math.ceil((cfg.endAgeTicks || 30) + 12));

  const clampedCursor = Math.max(0, Number.isFinite(targetCursorFloat) ? targetCursorFloat : 0);
  const baseIdx = Math.floor(clampedCursor);
  const fracAlpha = THREE.MathUtils.clamp(clampedCursor - baseIdx, 0, 1);
  const startIdx = Math.max(0, baseIdx - effectiveLookback);

  trailSys.resetCar?.(null);
  arena.ballSpeedTrail?.reset?.();

  const stepSnapshotPair = (
    prevSnap: NumericStateBuffer,
    currSnap: NumericStateBuffer,
    alpha: number,
    dtSec: number
  ): void => {
    const header = _headerView.attach(currSnap);
    const numCars = Math.min(8, Math.max(0, header.numCars || 0));

    if (arena.ballSpeedTrail?.update) {
      const prevBall = _prevBallView.attach(prevSnap);
      const currBall = _currBallView.attach(currSnap);
      interpolatePhysicsTransform(
        _scratchBallObj,
        prevBall,
        currBall,
        alpha,
        undefined,
        _pA,
        _pB,
        _qA,
        _qB
      );
      unrealToThreeCoords(_scratchBallVel, currBall.velX, currBall.velY, currBall.velZ);
      arena.ballSpeedTrail.update(_scratchBallObj.position, _scratchBallVel, dtSec);
    }

    for (let c = 0; c < numCars; c++) {
      const currCar = _currCarView.attachCar(currSnap, c);
      const prevCar = _prevCarView.attachCar(prevSnap, c);
      const isZeroed =
        currCar.fwdX * currCar.fwdX + currCar.fwdY * currCar.fwdY + currCar.fwdZ * currCar.fwdZ <
        0.01;
      const isParked = isZeroed || (currCar.posX < -5000 && currCar.posZ < -200);
      if (isParked || currCar.isDemoed) {
        trailSys.updateCar?.(c, null, null, null, null, null, dtSec, false);
        continue;
      }

      const isRespawning = prevCar.isDemoed && !currCar.isDemoed;
      if (isRespawning) {
        trailSys.resetCar?.(c);
      }

      interpolatePhysicsTransform(
        _scratchCarObj,
        isRespawning ? currCar : prevCar,
        currCar,
        alpha,
        undefined,
        _pA,
        _pB,
        _qA,
        _qB
      );
      _scratchCarObj.visible = true;

      trailSys.updateCar?.(
        c,
        _scratchCarObj,
        arena.carWheels?.[c] ?? null,
        arena.vehicleRegistry?.carWheelSpecs?.[c] ?? null,
        currCar,
        arena.vehiclePresets?.[c] || arena.carVisual || 'fennec',
        dtSec,
        true,
        isRespawning ? currCar : prevCar,
        alpha
      );
    }
  };

  let prevSnap: NumericStateBuffer | null | undefined = null;
  for (let idx = startIdx; idx <= baseIdx; idx++) {
    const snap = getFrameBufferByIndex(idx);
    if (!snap || snap.length < 410) continue;
    stepSnapshotPair(prevSnap || snap, snap, 1.0, 1 / 120);
    prevSnap = snap;
  }

  if (fracAlpha > 1e-3) {
    const nextSnap = getFrameBufferByIndex(baseIdx + 1);
    const currBaseSnap = prevSnap || getFrameBufferByIndex(baseIdx);
    if (currBaseSnap && nextSnap && nextSnap.length >= 410) {
      stepSnapshotPair(currBaseSnap, nextSnap, fracAlpha, fracAlpha / 120);
    }
  }
}
