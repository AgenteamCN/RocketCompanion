/**
 * ArenaMath.ts
 * Coordinate space transforms, basis orientation unpackers,
 * and visual hitbox wireframe generation for ArenaWorld entities.
 */

import * as THREE from 'three';
import { OCTANE_HITBOX_PRESET, type HitboxPresetDimensions } from './ArenaConstants.ts';

export interface OrientationBasisSource {
  fwdX: number;
  fwdY: number;
  fwdZ: number;
  rightX: number;
  rightY: number;
  rightZ: number;
  upX: number;
  upY: number;
  upZ: number;
}

export interface PhysicsBasisView extends OrientationBasisSource {
  posX: number;
  posY: number;
  posZ: number;
}

export type PhysicsTransformSource = PhysicsBasisView | Float32Array | ArrayLike<number>;

export function unrealToThreeCoords(target: THREE.Vector3, x = 0, y = 0, z = 0): THREE.Vector3 {
  return target.set(x || 0, z || 0, y || 0);
}

let basisFwd: THREE.Vector3 | null = null;
let basisRight: THREE.Vector3 | null = null;
let basisUp: THREE.Vector3 | null = null;
let basisMatrix: THREE.Matrix4 | null = null;

function ensureBasisHelpers(): void {
  if (!basisFwd) basisFwd = new THREE.Vector3();
  if (!basisRight) basisRight = new THREE.Vector3();
  if (!basisUp) basisUp = new THREE.Vector3();
  if (!basisMatrix) basisMatrix = new THREE.Matrix4();
}

/**
 * Converts 3-axis basis vectors from state view to Three.js Quaternion.
 */
export function viewBasisToQuaternion(
  targetQuat: THREE.Quaternion,
  view: OrientationBasisSource
): THREE.Quaternion {
  ensureBasisHelpers();

  unrealToThreeCoords(basisFwd!, view.fwdX, view.fwdY, view.fwdZ);
  unrealToThreeCoords(basisRight!, view.rightX, view.rightY, view.rightZ);
  unrealToThreeCoords(basisUp!, view.upX, view.upY, view.upZ);

  if (basisFwd!.lengthSq() < 1e-6 || basisUp!.lengthSq() < 1e-6 || basisRight!.lengthSq() < 1e-6) {
    targetQuat.set(0, 0, 0, 1);
    return targetQuat;
  }

  basisMatrix!.makeBasis(basisFwd!, basisUp!, basisRight!);
  targetQuat.setFromRotationMatrix(basisMatrix!);
  return targetQuat;
}

export function bufferBasisToQuaternion(
  targetQuat: THREE.Quaternion,
  buffer: ArrayLike<number>,
  offset: number
): THREE.Quaternion {
  ensureBasisHelpers();

  unrealToThreeCoords(basisFwd!, buffer[offset], buffer[offset + 1], buffer[offset + 2]);
  unrealToThreeCoords(basisRight!, buffer[offset + 3], buffer[offset + 4], buffer[offset + 5]);
  unrealToThreeCoords(basisUp!, buffer[offset + 6], buffer[offset + 7], buffer[offset + 8]);

  if (basisFwd!.lengthSq() < 1e-6 || basisUp!.lengthSq() < 1e-6 || basisRight!.lengthSq() < 1e-6) {
    targetQuat.set(0, 0, 0, 1);
    return targetQuat;
  }

  basisMatrix!.makeBasis(basisFwd!, basisUp!, basisRight!);
  targetQuat.setFromRotationMatrix(basisMatrix!);
  return targetQuat;
}

/**
 * Backward compatibility quaternion unpacker: supports either 9-float basis vector extraction
 * or fallback 4-float quaternion unpacking.
 */
export function unpackBufferQuaternion(
  targetQuat: THREE.Quaternion,
  buffer: ArrayLike<number> | null | undefined,
  offset: number
): THREE.Quaternion {
  if (!buffer || buffer.length < offset + 9) {
    if (
      buffer &&
      buffer.length >= offset + 4 &&
      (buffer[offset] || buffer[offset + 1] || buffer[offset + 2] || buffer[offset + 3])
    ) {
      targetQuat.set(buffer[offset], buffer[offset + 2], buffer[offset + 1], buffer[offset + 3]);
      return targetQuat;
    }
    targetQuat.set(0, 0, 0, 1);
    return targetQuat;
  }
  return bufferBasisToQuaternion(targetQuat, buffer, offset);
}

/**
 * Generates procedural wireframe box for visual hitbox debugging.
 */
export function createCarHitboxWireframe(
  preset: HitboxPresetDimensions = OCTANE_HITBOX_PRESET
): THREE.LineSegments {
  const boxGeom = new THREE.BoxGeometry(preset.length, preset.height, preset.width);
  const edgesGeom = new THREE.EdgesGeometry(boxGeom);
  const lineMat = new THREE.LineBasicMaterial({
    color: 16777215,
    transparent: true,
    opacity: 0.9,
    depthTest: true,
    depthWrite: false,
  });
  const hitboxMesh = new THREE.LineSegments(edgesGeom, lineMat);
  hitboxMesh.name = 'car-hitbox';
  hitboxMesh.position.set(preset.forward, preset.up, 0);
  hitboxMesh.renderOrder = 100;
  hitboxMesh.visible = false;
  return hitboxMesh;
}

/**
 * Interpolates physics transform (position and orientation) between previous and current state.
 */
export function interpolatePhysicsTransform(
  targetMesh: THREE.Object3D,
  prevViewOrState: PhysicsTransformSource,
  currViewOrState: PhysicsTransformSource,
  offsetOrAlpha: number,
  alphaParam: number | THREE.Vector3 | undefined,
  pA: THREE.Vector3,
  pB: THREE.Vector3 | THREE.Quaternion,
  qA: THREE.Quaternion,
  qB?: THREE.Quaternion
): void {
  if (typeof offsetOrAlpha === 'number' && typeof alphaParam === 'number') {
    const prevState = prevViewOrState as ArrayLike<number>;
    const currState = currViewOrState as ArrayLike<number>;
    const offset = offsetOrAlpha;
    const alpha = alphaParam;
    const vecB = pB as THREE.Vector3;
    unrealToThreeCoords(pA, prevState[offset], prevState[offset + 1], prevState[offset + 2]);
    unrealToThreeCoords(vecB, currState[offset], currState[offset + 1], currState[offset + 2]);
    targetMesh.position.lerpVectors(pA, vecB, alpha);

    unpackBufferQuaternion(qA, prevState, offset + 3);
    unpackBufferQuaternion(qB!, currState, offset + 3);
    targetMesh.quaternion.slerpQuaternions(qA, qB!, alpha);
    return;
  }

  const prevView = prevViewOrState as PhysicsBasisView;
  const currView = currViewOrState as PhysicsBasisView;
  const alpha = offsetOrAlpha;
  const vecA = alphaParam !== undefined ? (alphaParam as THREE.Vector3) : pA;
  const vecB = alphaParam !== undefined ? pA : (pB as THREE.Vector3);
  const quatA = alphaParam !== undefined ? (pB as THREE.Quaternion) : qA;
  const quatB = alphaParam !== undefined ? qA : qB!;
  unrealToThreeCoords(vecA, prevView.posX, prevView.posY, prevView.posZ);
  unrealToThreeCoords(vecB, currView.posX, currView.posY, currView.posZ);
  targetMesh.position.lerpVectors(vecA, vecB, alpha);

  viewBasisToQuaternion(quatA, prevView);
  viewBasisToQuaternion(quatB, currView);
  targetMesh.quaternion.slerpQuaternions(quatA, quatB, alpha);
}
