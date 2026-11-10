import * as THREE from 'three';
import {
  getVehicleDescriptor,
  hasVehicleDescriptor,
  wheelModifierRuntimeConfig,
} from '../ui-core/config/vehicleTunerConfig.ts';
import { normalizeVisualId } from '../ui-core/config/vehicleConstants.ts';
/**
 * src/entities/VehicleSuspensionSystem.ts
 * High-performance Vehicle Suspension, Steering & Reaction Control Thruster Subsystem.
 * Modernized extraction from ArenaWorld.js and VehicleAssembly.js (Phase 10.2).
 */

/**
 * Resolves vertical chassis connection height (Unreal Units) for the vehicle preset.
 * Values precisely match RocketSim CarConfig.cpp connectionPointOffset.z
 * @param {string} vehiclePreset
 * @returns {number}
 */
export function getCarRestHeight(vehiclePreset) {
  const canonical = normalizeVisualId(vehiclePreset);
  const desc = hasVehicleDescriptor(canonical) ? getVehicleDescriptor(canonical) : null;
  const preset = desc?.hitboxPreset || canonical;
  switch (preset) {
    case 'hitbox-octane':
      return 20.755;
    case 'hitbox-dominus':
      return 15.75;
    case 'hitbox-plank':
      return 12.0942;
    case 'hitbox-breakout':
      return 11.75;
    case 'hitbox-hybrid':
      return 20.755;
    case 'hitbox-merc':
      return 21.505;
    default:
      return 20.755;
  }
}

/**
 * Standard RocketSim CarConfig.cpp physics wheel placement specifications [x, z, radius] per hitbox preset.
 */
export function getPhysicsWheelSpecsForHitbox(
  hitboxPreset: string,
  threeWheels = false
): Array<[number, number, number]> {
  if (threeWheels || hitboxPreset === 'hitbox-psyclops') {
    return [
      [51.25, 0.0, 12.5],
      [51.25, 0.0, 12.5],
      [-33.75, 29.5, 15.0],
      [-33.75, -29.5, 15.0],
    ];
  }
  switch (hitboxPreset) {
    case 'hitbox-octane':
      return [
        [51.25, 25.9, 12.5],
        [51.25, -25.9, 12.5],
        [-33.75, 29.5, 15.0],
        [-33.75, -29.5, 15.0],
      ];
    case 'hitbox-dominus':
      return [
        [50.3, 31.1, 12.0],
        [50.3, -31.1, 12.0],
        [-34.75, 33.0, 13.5],
        [-34.75, -33.0, 13.5],
      ];
    case 'hitbox-plank':
      return [
        [49.97, 27.8, 12.5],
        [49.97, -27.8, 12.5],
        [-35.43, 20.28, 17.0],
        [-35.43, -20.28, 17.0],
      ];
    case 'hitbox-breakout':
      return [
        [51.5, 26.67, 13.5],
        [51.5, -26.67, 13.5],
        [-35.75, 35.0, 15.0],
        [-35.75, -35.0, 15.0],
      ];
    case 'hitbox-hybrid':
      return [
        [51.25, 25.9, 12.5],
        [51.25, -25.9, 12.5],
        [-34.0, 29.5, 15.0],
        [-34.0, -29.5, 15.0],
      ];
    case 'hitbox-merc':
      return [
        [51.25, 25.9, 15.0],
        [51.25, -25.9, 15.0],
        [-33.75, 29.5, 15.0],
        [-33.75, -29.5, 15.0],
      ];
    default:
      return DEFAULT_WHEEL_SPECS.game.map((w) => [...w] as [number, number, number]);
  }
}

/**
 * Standard wheel physical placement specifications [x, z, radius] for each vehicle preset.
 * Values precisely match RocketSim CarConfig.cpp FRONT_WHEELS_OFFSET / BACK_WHEELS_OFFSET.
 * @param {string} vehiclePreset
 * @returns {Array<[number, number, number]>}
 */
export function getWheelSpecsForVisual(vehiclePreset) {
  const canonical = normalizeVisualId(vehiclePreset);
  const desc = hasVehicleDescriptor(canonical) ? getVehicleDescriptor(canonical) : null;
  if (desc?.wheelAnchors) {
    return desc.wheelAnchors.map((w) => [...w]);
  }
  const preset = desc?.hitboxPreset || canonical;
  return getPhysicsWheelSpecsForHitbox(preset, Boolean(desc?.threeWheels));
}

export const DEFAULT_WHEEL_SPECS = Object.freeze({
  game: [
    [45.5, 30.5, 13.5],
    [45.5, -30.5, 13.5],
    [-35.5, 30.5, 13.5],
    [-35.5, -30.5, 13.5],
  ],
});

const _scratchMid = new THREE.Vector3();
const _scratchArmDir = new THREE.Vector3();
const _scratchUpY = new THREE.Vector3(0, 1, 0);
const _scratchDownY = new THREE.Vector3(0, -1, 0);
const _scratchSpringDir = new THREE.Vector3();
const _scratchAxisY = new THREE.Vector3(0, 1, 0);
const _scratchKnucklePos = new THREE.Vector3();
const _scratchWheelMount = new THREE.Vector3();

/**
 * Updates a suspension wishbone arm mesh orientation between its chassis root and the wheel knuckle hub.
 */
export function updateSuspensionArm(armMesh, rootPosOrMesh, knucklePos) {
  if (!armMesh || !rootPosOrMesh || !knucklePos) return;
  const rootPos = rootPosOrMesh.position || rootPosOrMesh;
  _scratchMid.copy(rootPos).add(knucklePos).multiplyScalar(0.5);
  armMesh.position.copy(_scratchMid);
  _scratchArmDir.copy(knucklePos).sub(rootPos);
  const len = _scratchArmDir.length();
  _scratchArmDir.divideScalar(len || 1);
  armMesh.quaternion.setFromUnitVectors(_scratchUpY, _scratchArmDir);
  armMesh.scale.set(1, len, 1);
}

/**
 * Updates suspension coil spring scale and damper rod height.
 */
export function updateSuspensionUnitSpring(susUnit, knucklePos) {
  if (!susUnit || !susUnit.group || !knucklePos) return;

  // Support both 3D knuckle vector or scalar Y coordinate
  const top = susUnit.top || susUnit.group.position;
  const isScalarY = typeof knucklePos === 'number';
  const knuckleY = isScalarY ? knucklePos : knucklePos.y;
  const knuckleX = isScalarY ? susUnit.group.position.x || 0 : knucklePos.x;
  const knuckleZ = isScalarY ? (susUnit.botZ !== undefined ? susUnit.botZ : top.z) : knucklePos.z;

  _scratchSpringDir.set(knuckleX - top.x, knuckleY - top.y, knuckleZ - top.z);
  const len = _scratchSpringDir.length();
  _scratchSpringDir.divideScalar(len || 1);
  susUnit.group.quaternion.setFromUnitVectors(_scratchDownY, _scratchSpringDir);
  if (susUnit.spring) susUnit.spring.scale.y = len / susUnit.built;
  const shaftLen = Math.max(1, len - susUnit.bodyLen * 0.5);
  if (susUnit.shaft) {
    susUnit.shaft.scale.y = shaftLen;
    susUnit.shaft.position.y = -shaftLen / 2;
  }
  if (susUnit.body) {
    susUnit.body.position.y = -(len - susUnit.bodyLen / 2);
  }
}

/**
 * Solves and animates the 4-wheel (or 3-wheel Tricycle) suspension, steering angle, and tire rotation for a vehicle.
 */
export function updateCarSuspensionAndSteering(
  wheels,
  wheelSpecs,
  suspension,
  spin,
  currCar,
  vehiclePreset,
  actualDelta,
  carThrottle
) {
  if (!wheels || !wheelSpecs || !spin || !currCar) return;
  const forwardSpeed = currCar.forwardSpeed !== undefined ? currCar.forwardSpeed : 0;
  const restHeight = getCarRestHeight(vehiclePreset);

  // Detect 3-wheel mode from descriptor or WASM state (in 3-wheel mode, WASM has 3 wheels [0=front-center, 1=back-L, 2=back-R] and slot 3 is 0)
  const desc = hasVehicleDescriptor(vehiclePreset) ? getVehicleDescriptor(vehiclePreset) : null;
  const isThreeWheels = Boolean(
    wheels.threeWheels ||
    desc?.threeWheels ||
    vehiclePreset === 'hitbox-psyclops' ||
    vehiclePreset === 'trioctane-threewheel' ||
    (currCar.getWheelSusLength(3) === 0 &&
      currCar.getWheelSusLength(0) > 0 &&
      currCar.getWheelSusLength(1) > 0)
  );

  for (let wheelIndex = 0; wheelIndex < 4; wheelIndex++) {
    if (!wheelSpecs[wheelIndex] || !wheels[wheelIndex]) continue;

    if (isThreeWheels && wheelIndex === 1) {
      if (wheels[1].steer) wheels[1].steer.visible = false;
      if (suspension?.[1]?.group) suspension[1].group.visible = false;
      continue;
    } else if (wheelIndex === 1) {
      if (wheels[1].steer) wheels[1].steer.visible = true;
      if (suspension?.[1]?.group) suspension[1].group.visible = true;
    }

    const wasmWheelIdx = isThreeWheels
      ? wheelIndex === 0
        ? 0
        : wheelIndex === 2
          ? 2
          : 1
      : wheelIndex;

    let susLength = currCar.getWheelSusLength(wasmWheelIdx);
    const isSteerableWheel = isThreeWheels ? wheelIndex === 0 : wheelIndex < 2;
    const steerAngle = isSteerableWheel ? currCar.getWheelSteerAngle(wasmWheelIdx) : 0;
    const hasContact = currCar.getWheelContact(wasmWheelIdx);
    const [specX, rawSpecZ, wheelRadius] = wheelSpecs[wheelIndex];
    const specZ = isThreeWheels && wheelIndex === 0 ? 0.0 : rawSpecZ;

    // Scale guard: if susLength is in Bullet units (meters, < 2.0), scale to UU (50.0)
    if (susLength > 0 && susLength < 2.0) {
      susLength *= 50.0;
    }

    // Default resting height places wheels resting on the ground (-6.0 UU under chassis origin)
    const effectiveSusLength = susLength > 0 ? susLength : restHeight + 6.0;
    const extraY = Number(wheelModifierRuntimeConfig.verticalOffsetY) || 0;
    const customRestY = desc?.suspensionHeights?.[wheelIndex];
    const restYDelta = typeof customRestY === 'number' ? customRestY - (wheelRadius - 17) : 0;
    const mountY = restHeight - effectiveSusLength + extraY + restYDelta;

    if (wheels[wheelIndex].steer) {
      wheels[wheelIndex].steer.position.set(specX, mountY, specZ);
      wheels[wheelIndex].steer.rotation.y = -steerAngle;
    }

    const sus = suspension?.[wheelIndex];
    if (sus) {
      _scratchWheelMount.set(specX, mountY, specZ);
      _scratchKnucklePos
        .set(0, 0, sus.innerZ - specZ)
        .applyAxisAngle(_scratchAxisY, -steerAngle)
        .add(_scratchWheelMount);

      updateSuspensionUnitSpring(sus, _scratchKnucklePos);
      if (sus.armFore && sus.foreRoot)
        updateSuspensionArm(sus.armFore, sus.foreRoot, _scratchKnucklePos);
      if (sus.armAft && sus.aftRoot)
        updateSuspensionArm(sus.armAft, sus.aftRoot, _scratchKnucklePos);
    }

    const spinDelta = hasContact ? forwardSpeed / wheelRadius : (carThrottle * 1410) / wheelRadius;

    spin[wheelIndex] += spinDelta * actualDelta;
    if (wheels[wheelIndex].spin) {
      wheels[wheelIndex].spin.rotation.z = -spin[wheelIndex];
    }
  }
}
