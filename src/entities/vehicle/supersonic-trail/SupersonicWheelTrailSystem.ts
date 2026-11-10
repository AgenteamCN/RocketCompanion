import * as THREE from 'three';
import { MAX_CARS } from '../../../physics/RocketSimConstants.ts';
import type { CarStateView } from '../../../physics/RocketSimStateViews.ts';
import { getCarRestHeight, getWheelSpecsForVisual } from '../../VehicleSuspensionSystem.ts';
import { supersonicTrailRuntimeConfig } from '../../../ui-core/config/supersonicTrailConfig.ts';
import { wheelModifierRuntimeConfig } from '../../../ui-core/config/vehicleTunerConfig.ts';
import {
  SupersonicWheelRibbon,
  registerSupersonicWheelRibbonConfigSync,
} from './SupersonicWheelRibbon.ts';
import {
  resolveCarStepTicks,
  type CarPoseKinematicState,
  type VehicleWheelRigLike,
  type VehicleWheelSetLike,
  type WheelSpecTupleLike,
} from './SupersonicWheelTrailReplaySync.ts';

export type { VehicleWheelRigLike, VehicleWheelSetLike, WheelSpecTupleLike };
export interface SupersonicTrailCameraContext {
  isPovCamera?: boolean;
  cameraMode?: string;
  focusedCarIndex?: number;
  playerCarIndex?: number;
}

function resolveIsPovCamera(ctx?: SupersonicTrailCameraContext | null): boolean {
  if (!ctx) return true;
  if (
    ctx.cameraMode === 'director' ||
    ctx.cameraMode === 'free' ||
    ctx.cameraMode === 'podium' ||
    ctx.cameraMode === 'editor'
  ) {
    return false;
  }
  if (typeof ctx.isPovCamera === 'boolean') {
    return ctx.isPovCamera;
  }
  if (typeof ctx.cameraMode === 'string') {
    return (
      ctx.cameraMode === 'pov' ||
      ctx.cameraMode === 'wasmPov' ||
      ctx.cameraMode === 'rearView' ||
      ctx.cameraMode === 'ball'
    );
  }
  return true;
}

interface CarRearTrailPair {
  left: SupersonicWheelRibbon;
  right: SupersonicWheelRibbon;
  leftContactGraceTicks: number;
  rightContactGraceTicks: number;
  poseState: CarPoseKinematicState;
}

const CONTACT_DEBOUNCE_GRACE_TICKS = 2.5;

export class SupersonicWheelTrailSystem {
  public readonly group: THREE.Group;
  private readonly carTrails: CarRearTrailPair[];
  private readonly _unsubConfig: () => void;
  private readonly _wheelLocalPos = new THREE.Vector3();
  private readonly _wheelWorldPos = new THREE.Vector3();
  private readonly _carUpWorld = new THREE.Vector3();
  private readonly _contactNormal = new THREE.Vector3();
  private readonly _cameraWorldPos = new THREE.Vector3();

  constructor(scene: THREE.Scene) {
    this.group = new THREE.Group();
    this.group.name = 'SupersonicWheelTrails';
    this.carTrails = [];

    const allRibbons: SupersonicWheelRibbon[] = [];
    for (let i = 0; i < MAX_CARS; i++) {
      const left = new SupersonicWheelRibbon(`Car${i}_RearLeftSupersonicTrail`, -1);
      const right = new SupersonicWheelRibbon(`Car${i}_RearRightSupersonicTrail`, 1);
      this.group.add(
        left.preOcclusionMesh,
        left.foregroundMesh,
        right.preOcclusionMesh,
        right.foregroundMesh
      );
      this.carTrails.push({
        left,
        right,
        leftContactGraceTicks: 0,
        rightContactGraceTicks: 0,
        poseState: {
          lastPos: new THREE.Vector3(),
          lastQuat: new THREE.Quaternion(),
          hasLastPose: false,
        },
      });
      allRibbons.push(left, right);
    }

    scene.add(this.group);
    this._unsubConfig = registerSupersonicWheelRibbonConfigSync(allRibbons);
  }

  public hasActiveTrail(carIndex: number): boolean {
    if (carIndex < 0 || carIndex >= this.carTrails.length) return false;
    const pair = this.carTrails[carIndex];
    return pair.left.hasActiveTrail() || pair.right.hasActiveTrail();
  }

  public resetCar(carIndex: number | null = null): void {
    if (typeof carIndex === 'number' && carIndex >= 0 && carIndex < this.carTrails.length) {
      const pair = this.carTrails[carIndex];
      pair.left.reset();
      pair.right.reset();
      pair.leftContactGraceTicks = 0;
      pair.rightContactGraceTicks = 0;
      pair.poseState.hasLastPose = false;
      return;
    }
    for (const pair of this.carTrails) {
      pair.left.reset();
      pair.right.reset();
      pair.leftContactGraceTicks = 0;
      pair.rightContactGraceTicks = 0;
      pair.poseState.hasLastPose = false;
    }
  }

  public updateCar(
    carIndex: number,
    carRoot: THREE.Object3D | null | undefined,
    wheels: VehicleWheelSetLike | null | undefined,
    wheelSpecs: WheelSpecTupleLike[] | null | undefined,
    currCar: CarStateView | null | undefined,
    vehiclePreset: string | null | undefined,
    dt: number,
    activeVisuals = true,
    prevCar: CarStateView | null | undefined = null,
    alpha = 1.0
  ): void {
    if (carIndex < 0 || carIndex >= this.carTrails.length) return;
    const pair = this.carTrails[carIndex];
    const cfg = supersonicTrailRuntimeConfig;
    const rawDtTicks = Math.max(0.15, Math.min(12, (dt || 0.008333) * 120));

    if (
      !cfg.enabled ||
      !carRoot ||
      !carRoot.visible ||
      !currCar ||
      currCar.isDemoed ||
      !activeVisuals
    ) {
      pair.leftContactGraceTicks = 0;
      pair.rightContactGraceTicks = 0;
      pair.poseState.hasLastPose = false;
      pair.left.stepSample(rawDtTicks, false, 0, 0, 0, 0, 1, 0, cfg);
      pair.right.stepSample(rawDtTicks, false, 0, 0, 0, 0, 1, 0, cfg);
      return;
    }

    const isSupersonicOrForced = Boolean(currCar.isSupersonic || cfg.forceActive);
    const { dtTicks, isPausedFreeze } = resolveCarStepTicks(
      pair.poseState,
      carRoot,
      currCar,
      dt,
      isSupersonicOrForced,
      cfg.maxStepBreakDistUu
    );
    const interpAlpha = THREE.MathUtils.clamp(Number.isFinite(alpha) ? alpha : 1.0, 0, 1);
    const hasPrev = Boolean(prevCar && !prevCar.isDemoed);

    const resolvedPreset = vehiclePreset || 'fennec';
    const specs = wheelSpecs || getWheelSpecsForVisual(resolvedPreset);
    const restHeight = getCarRestHeight(resolvedPreset);
    const isThreeWheels = Boolean(
      wheels?.threeWheels ||
      resolvedPreset === 'hitbox-psyclops' ||
      resolvedPreset === 'trioctane-threewheel' ||
      (currCar.getWheelSusLength(3) === 0 &&
        currCar.getWheelSusLength(0) > 0 &&
        currCar.getWheelSusLength(1) > 0)
    );

    // Resolve car local up vector in Three.js world space
    this._carUpWorld.set(0, 1, 0).applyQuaternion(carRoot.quaternion).normalize();

    // Interpolate surface contact normal in Three.js world space (Unreal X,Y,Z -> Three X,Z,Y)
    const cGnx = currCar.groundNormalX;
    const cGny = currCar.groundNormalZ;
    const cGnz = currCar.groundNormalY;
    let gnx = cGnx;
    let gny = cGny;
    let gnz = cGnz;
    if (hasPrev && prevCar) {
      const pGnx = prevCar.groundNormalX;
      const pGny = prevCar.groundNormalZ;
      const pGnz = prevCar.groundNormalY;
      if (pGnx * pGnx + pGny * pGny + pGnz * pGnz > 0.01) {
        gnx = THREE.MathUtils.lerp(pGnx, cGnx, interpAlpha);
        gny = THREE.MathUtils.lerp(pGny, cGny, interpAlpha);
        gnz = THREE.MathUtils.lerp(pGnz, cGnz, interpAlpha);
      }
    }
    if (gnx * gnx + gny * gny + gnz * gnz > 0.01) {
      this._contactNormal.set(gnx, gny, gnz).normalize();
    } else {
      this._contactNormal.copy(this._carUpWorld);
    }

    const radiusScale = Math.max(0.2, Number(wheelModifierRuntimeConfig.radiusScale) || 1.0);
    const extraY = Number(wheelModifierRuntimeConfig.verticalOffsetY) || 0;

    // Rear wheels are visual indices 2 (Left rear) and 3 (Right rear)
    for (let rearSlot = 0; rearSlot < 2; rearSlot++) {
      const visualWheelIdx = rearSlot === 0 ? 2 : 3;
      const wasmWheelIdx = isThreeWheels ? visualWheelIdx - 1 : visualWheelIdx;
      const ribbon = rearSlot === 0 ? pair.left : pair.right;

      let currSus = currCar.getWheelSusLength(wasmWheelIdx);
      if (currSus > 0 && currSus < 2.0) currSus *= 50.0;

      let susLength = currSus;
      if (hasPrev && prevCar) {
        let prevSus = prevCar.getWheelSusLength(wasmWheelIdx);
        if (prevSus > 0 && prevSus < 2.0) prevSus *= 50.0;
        if (prevSus > 0 && currSus > 0) {
          susLength = THREE.MathUtils.lerp(prevSus, currSus, interpAlpha);
        }
      }

      const hasDirectContact =
        currCar.getWheelContact(wasmWheelIdx) ||
        Boolean(hasPrev && prevCar?.getWheelContact(wasmWheelIdx));
      const restSusLength = restHeight + 6.0;
      const isCompressed =
        cfg.useSuspensionCompression && susLength > 0.01 && susLength < restSusLength - 0.35;

      const rawWheelTouching = !cfg.requireWheelContact || hasDirectContact || isCompressed;
      if (rawWheelTouching) {
        if (rearSlot === 0) pair.leftContactGraceTicks = CONTACT_DEBOUNCE_GRACE_TICKS;
        else pair.rightContactGraceTicks = CONTACT_DEBOUNCE_GRACE_TICKS;
      } else {
        if (rearSlot === 0) {
          pair.leftContactGraceTicks = Math.max(0, pair.leftContactGraceTicks - dtTicks);
        } else {
          pair.rightContactGraceTicks = Math.max(0, pair.rightContactGraceTicks - dtTicks);
        }
      }

      const graceRemaining =
        rearSlot === 0 ? pair.leftContactGraceTicks : pair.rightContactGraceTicks;
      const wheelTouching = rawWheelTouching || graceRemaining > 0;
      const shouldEmit = isSupersonicOrForced && wheelTouching;

      if (!shouldEmit) {
        ribbon.stepSample(dtTicks, false, 0, 0, 0, 0, 1, 0, cfg);
        continue;
      }

      const spec = specs?.[visualWheelIdx] || [-33.75, rearSlot === 0 ? 29.5 : -29.5, 15.0];
      const [specX, specZ, rawRadius] = spec;
      const wheelRadius = (Number(rawRadius) || 15.0) * radiusScale;

      const effectiveSus = susLength > 0 ? susLength : restSusLength;
      const mountY = restHeight - effectiveSus + extraY;
      this._wheelLocalPos.set(specX, mountY, specZ);

      // Compute sub-tick interpolated world position of the bottom tire contact patch
      this._wheelWorldPos
        .copy(this._wheelLocalPos)
        .applyQuaternion(carRoot.quaternion)
        .add(carRoot.position);
      this._wheelWorldPos.addScaledVector(this._carUpWorld, -wheelRadius);

      if (isPausedFreeze && !ribbon.hasActiveTrail()) {
        ribbon.seedFromStationaryVelocity(
          this._wheelWorldPos.x,
          this._wheelWorldPos.y,
          this._wheelWorldPos.z,
          this._contactNormal.x,
          this._contactNormal.y,
          this._contactNormal.z,
          currCar.velX,
          currCar.velZ,
          currCar.velY,
          cfg
        );
      }

      ribbon.stepSample(
        dtTicks,
        true,
        this._wheelWorldPos.x,
        this._wheelWorldPos.y,
        this._wheelWorldPos.z,
        this._contactNormal.x,
        this._contactNormal.y,
        this._contactNormal.z,
        cfg
      );
    }
  }

  public prepare(
    camera: THREE.Camera | null | undefined,
    cameraContext?: SupersonicTrailCameraContext | null
  ): void {
    const cfg = supersonicTrailRuntimeConfig;
    let camPos: THREE.Vector3 | null = null;
    if (camera?.getWorldPosition) {
      camera.getWorldPosition(this._cameraWorldPos);
      camPos = this._cameraWorldPos;
    }
    const isPov = resolveIsPovCamera(cameraContext);
    const focusedCarIndex =
      typeof cameraContext?.focusedCarIndex === 'number' && cameraContext.focusedCarIndex >= 0
        ? cameraContext.focusedCarIndex
        : typeof cameraContext?.playerCarIndex === 'number' && cameraContext.playerCarIndex >= 0
          ? cameraContext.playerCarIndex
          : 0;
    for (let i = 0; i < this.carTrails.length; i++) {
      const isFocusedPovCar = isPov && i === focusedCarIndex;
      this.carTrails[i].left.rebuildGeometry(camPos, isFocusedPovCar, cfg);
      this.carTrails[i].right.rebuildGeometry(camPos, isFocusedPovCar, cfg);
    }
  }

  public dispose(): void {
    this._unsubConfig?.();
    for (const pair of this.carTrails) {
      pair.left.dispose();
      pair.right.dispose();
    }
    this.group.removeFromParent();
  }
}
