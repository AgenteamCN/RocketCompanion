import * as THREE from 'three';
import type {
  ArenaHeaderView,
  CarStateView,
  NumericStateBuffer,
} from '../../physics/RocketSimStateViews.ts';
import { interpolatePhysicsTransform } from './ArenaMath.ts';
import { updateCarSuspensionAndSteering } from '../VehicleSuspensionSystem.ts';
import { updateVehicleBrakeLamps } from '../vehicle/vehicleWheelsAndLamps.ts';
import { getNameTagConfig } from '../../game/runtimeUiPort.ts';
import { vehicleTunerRuntimeFlags } from '../../ui-core/config/vehicleTunerConfig.ts';
import {
  getDemolishShockwaveConfig,
  getDemolishShockwaveSimState,
  updateDemolishLiveAnchors,
} from '../../ui-core/config/demolishShockwaveConfig.ts';
import type { VehicleBoostEmitter } from '../vehicle/boost/vehicleBoostEmitter.ts';
import type { DemolitionEffect } from '../DemolitionEffect.ts';
import type { SupersonicWheelTrailSystem } from '../vehicle/supersonic-trail/SupersonicWheelTrailSystem.ts';
import type { VehicleAerialClimbTracker } from './VehicleAerialClimbTracker.ts';
import type { ArenaVehicleRegistry } from './ArenaVehicleRegistry.ts';
import type { VehicleWheelSet } from './ArenaVehicleLoadoutManager.ts';

export interface CarControlInput {
  throttle?: number;
  steer?: number;
  pitch?: number;
  yaw?: number;
  roll?: number;
  jump?: boolean | number;
  boost?: boolean | number;
  handbrake?: boolean | number;
}

export type CarControlsResolver = (carIndex: number) => CarControlInput | null | undefined;

export interface ArenaVehicleStepTarget {
  ball?: THREE.Group;
  cars: Array<THREE.Group | null>;
  vehiclePresets: Array<string | null>;
  carWheels: Array<VehicleWheelSet | null>;
  carBoosts: Array<VehicleBoostEmitter[] | null>;
  carDemolitions: Array<DemolitionEffect | null>;
  vehicleRegistry: ArenaVehicleRegistry;
  aerialClimbTracker: VehicleAerialClimbTracker;
  supersonicWheelTrailSystem: SupersonicWheelTrailSystem;
  playerCarIndex: number;
  carVisual: string;
  isLobbyMode?: boolean;
  pA: THREE.Vector3;
  pB: THREE.Vector3;
  qA: THREE.Quaternion;
  qB: THREE.Quaternion;
  _headerView: ArenaHeaderView;
  _currCarView: CarStateView;
  _prevCarView: CarStateView;
}

export function updateBoostVisuals(
  cars: Array<THREE.Group | null>,
  carBoosts: Array<VehicleBoostEmitter[] | null>,
  currState: NumericStateBuffer | null,
  throttle: number,
  delta: number,
  opponentThrottle = 0,
  activeVisuals = true,
  controls: CarControlInput | null | undefined = null,
  opponentControls: CarControlInput | null | undefined = null,
  playerCarIndex = 0,
  headerView: ArenaHeaderView | null = null,
  currCarView: CarStateView | null = null,
  carControlsResolver: CarControlsResolver | null = null
): void {
  const header = headerView?.attach(currState);
  const numCars = header ? header.numCars : cars.length;
  const localCarIdx = playerCarIndex ?? 0;
  const maxSlots = Math.max(cars?.length ?? 0, carBoosts?.length ?? 0);

  for (let carIndex = 0; carIndex < maxSlots; carIndex++) {
    const carGroup = cars[carIndex];
    if (!carGroup || carIndex >= numCars || !carGroup.visible) {
      if (carIndex >= numCars || !carGroup) {
        for (const emitter of carBoosts?.[carIndex] ?? []) {
          emitter?.resetVisual?.();
        }
        continue;
      }
    }
    const carView = currCarView?.attachCar(currState, carIndex);
    const isLocalCar = carIndex === localCarIdx;
    const carCtrl =
      typeof carControlsResolver === 'function'
        ? carControlsResolver(carIndex)
        : carIndex === 0
          ? controls
          : opponentControls;
    const forcePreview = isLocalCar && Boolean(vehicleTunerRuntimeFlags.forceBoostPreview);
    const isBoosting =
      activeVisuals &&
      (forcePreview ||
        Boolean(carView && carView.isBoosting) ||
        Boolean(carCtrl?.boost && carView && carView.boost > 0));
    const isAudibleActive = isLocalCar;
    const currentThrottle = isLocalCar ? throttle : (carCtrl?.throttle ?? opponentThrottle);
    for (const emitter of carBoosts[carIndex] ?? []) {
      emitter.setSpatial?.(!isAudibleActive);
      emitter.update?.(
        isBoosting,
        activeVisuals && (forcePreview || currentThrottle > 0.01),
        carGroup.visible,
        delta,
        activeVisuals
      );
    }
  }
}

export function stepArenaVehiclesFrame(
  arena: ArenaVehicleStepTarget,
  prevState: NumericStateBuffer | null,
  currState: NumericStateBuffer | null,
  numCars: number,
  alpha: number,
  actualDelta: number,
  actualThrottle: number,
  controls?: CarControlInput | null,
  opponentControls?: CarControlInput | null,
  activeVisuals = true,
  carControlsResolver: CarControlsResolver | null = null
): void {
  const nameTagConfig = getNameTagConfig();
  const vr = arena.vehicleRegistry;
  const maxCars = Math.max(arena.cars.length, Math.min(8, numCars || 0));
  vr.syncCarHitboxesVisibility(arena.playerCarIndex ?? 0);

  for (let carIndex = 0; carIndex < maxCars; carIndex++) {
    if (carIndex >= numCars) {
      if (arena.cars[carIndex]) {
        arena.cars[carIndex]!.visible = false;
        arena.carDemolitions[carIndex]?.update(
          actualDelta,
          false,
          arena.cars[carIndex]!.position,
          false
        );
      }
      arena.supersonicWheelTrailSystem?.updateCar(
        carIndex,
        null,
        null,
        null,
        null,
        null,
        actualDelta,
        false
      );
      continue;
    }

    const currCar = arena._currCarView.attachCar(currState, carIndex);
    const prevCar = arena._prevCarView.attachCar(prevState, carIndex);
    arena.aerialClimbTracker?.stepCarFromView(carIndex, currCar, nameTagConfig);

    const isZeroedSlot =
      currCar.fwdX * currCar.fwdX + currCar.fwdY * currCar.fwdY + currCar.fwdZ * currCar.fwdZ <
      0.01;
    const isParkedInactive = isZeroedSlot || (currCar.posX < -5000 && currCar.posZ < -200);
    if (isParkedInactive) {
      if (arena.cars[carIndex]) {
        arena.cars[carIndex]!.visible = false;
        arena.carDemolitions[carIndex]?.update(
          actualDelta,
          false,
          arena.cars[carIndex]!.position,
          false
        );
      }
      arena.supersonicWheelTrailSystem?.updateCar(
        carIndex,
        null,
        null,
        null,
        null,
        null,
        actualDelta,
        false
      );
      continue;
    }

    const isLocalCar = carIndex === (arena.playerCarIndex ?? 0);
    if (arena.isLobbyMode) {
      const isLobbyDiagCar = carIndex === 6 || carIndex === 7;
      if (!isLocalCar && !isLobbyDiagCar) {
        if (arena.cars[carIndex]) arena.cars[carIndex]!.visible = false;
        arena.supersonicWheelTrailSystem?.updateCar(
          carIndex,
          null,
          null,
          null,
          null,
          null,
          actualDelta,
          false
        );
        continue;
      }
    }

    if (!arena.cars[carIndex]) {
      const defaultTeam = carIndex === 6 ? 0 : carIndex === 7 ? 1 : carIndex % 2;
      vr.ensureCar(carIndex, defaultTeam, arena.carVisual || 'fennec');
    }
    if (!arena.cars[carIndex]) continue;

    const carControls =
      typeof carControlsResolver === 'function'
        ? carControlsResolver(carIndex)
        : carIndex === 0
          ? controls
          : opponentControls;
    const carThrottle = isLocalCar ? actualThrottle : (carControls?.throttle ?? 0);

    const isRespawning = prevCar.isDemoed && !currCar.isDemoed;
    if (isRespawning) {
      arena.supersonicWheelTrailSystem?.resetCar(carIndex);
    }
    interpolatePhysicsTransform(
      arena.cars[carIndex]!,
      isRespawning ? currCar : prevCar,
      currCar,
      alpha,
      undefined,
      arena.pA,
      arena.pB,
      arena.qA,
      arena.qB
    );

    if (isLocalCar) {
      const carPos = arena.cars[carIndex]!.position;
      const ballPos = arena.ball?.position;
      updateDemolishLiveAnchors(
        carPos.x,
        carPos.z,
        carPos.y,
        currCar.fwdX || 0,
        currCar.fwdY || 1,
        ballPos?.x ?? 0,
        ballPos?.z ?? 0,
        ballPos?.y ?? 93
      );
    }

    const isAlive = !currCar.isDemoed;
    arena.carDemolitions[carIndex]?.update(
      actualDelta,
      !isAlive,
      arena.cars[carIndex]!.position,
      activeVisuals
    );
    const demoSimCfg = isLocalCar ? getDemolishShockwaveConfig() : null;
    const hideForSim = Boolean(
      demoSimCfg &&
      demoSimCfg.simHideTargetCar &&
      demoSimCfg.simAnchorMode === 'local-car' &&
      getDemolishShockwaveSimState().activeIn3d
    );
    arena.cars[carIndex]!.visible = isAlive && !hideForSim;

    const forwardSpeed = currCar.forwardSpeed ?? 0;
    const isOnGround = Boolean(currCar.isOnGround);
    const isPowersliding = Boolean(carControls?.handbrake);
    updateVehicleBrakeLamps(
      arena.cars[carIndex]!,
      arena.vehiclePresets[carIndex]!,
      forwardSpeed,
      carThrottle,
      isOnGround,
      isPowersliding,
      actualDelta
    );

    updateCarSuspensionAndSteering(
      arena.carWheels[carIndex],
      vr.carWheelSpecs[carIndex],
      vr.carSuspension[carIndex],
      vr.wheelSpin[carIndex],
      currCar,
      arena.vehiclePresets[carIndex]!,
      actualDelta,
      carThrottle
    );

    arena.supersonicWheelTrailSystem?.updateCar(
      carIndex,
      arena.cars[carIndex],
      arena.carWheels[carIndex],
      vr.carWheelSpecs[carIndex],
      currCar,
      arena.vehiclePresets[carIndex],
      actualDelta,
      activeVisuals,
      isRespawning ? currCar : prevCar,
      alpha
    );
  }
}
