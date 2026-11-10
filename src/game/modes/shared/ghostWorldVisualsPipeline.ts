/**
 * ghostWorldVisualsPipeline.ts
 * Shared holographic mesh construction, material tinting, and signed-coordinate
 * transform interpolation primitives for KickoffGhostVisuals and MultiWorldGhostRenderer.
 */

import * as THREE from 'three';
import {
  buildVehicleModel,
  buildVehicleWheels,
  type VehicleAssetStore,
  type VehicleLoaderCallbacks,
} from '../../../entities/arena/VehicleFactory.ts';
import {
  getWheelSpecsForVisual,
  updateCarSuspensionAndSteering,
} from '../../../entities/VehicleSuspensionSystem.ts';
import { unrealToThreeCoords } from '../../../entities/arena/ArenaMath.ts';
import { createGeodesicBallGeometry } from '../../../entities/BallVisual.ts';
import { CarStateView, BallStateView } from '../../../physics/RocketSimStateViews.ts';

export type GhostWheelMountList = ReturnType<typeof buildVehicleWheels>;
export type GhostWheelSpecList = ReturnType<typeof getWheelSpecsForVisual>;
export type GhostSuspensionList = Parameters<typeof updateCarSuspensionAndSteering>[2];

export interface GhostWorldPalette {
  mainHex: number;
  emissiveHex: number;
  wireHex: number;
}

export const GHOST_WORLD_PALETTES: readonly GhostWorldPalette[] = Object.freeze([
  { mainHex: 0x38bdf8, emissiveHex: 0x0284c7, wireHex: 0x7dd3fc }, // World 1: Holographic Cyan
  { mainHex: 0xfb923c, emissiveHex: 0xea580c, wireHex: 0xfdba74 }, // World 2: Holographic Orange
  { mainHex: 0x34d399, emissiveHex: 0x059669, wireHex: 0x6ee7b7 }, // World 3: Holographic Emerald
  { mainHex: 0xa78bfa, emissiveHex: 0x7c3aed, wireHex: 0xc4b5fd }, // World 4: Holographic Violet
  { mainHex: 0xf43f5e, emissiveHex: 0xe11d48, wireHex: 0xfda4af }, // World 5: Holographic Rose
  { mainHex: 0xfbbf24, emissiveHex: 0xd97706, wireHex: 0xfde68a }, // World 6: Holographic Amber
  { mainHex: 0x818cf8, emissiveHex: 0x4f46e5, wireHex: 0xa5b4fc }, // World 7: Holographic Indigo
  { mainHex: 0xa3e635, emissiveHex: 0x65a30d, wireHex: 0xbef264 }, // World 8: Holographic Lime
]);

export interface GhostVehicleRegistryPort {
  assets?: VehicleAssetStore;
  carLoaders?: VehicleLoaderCallbacks & {
    wheelSpecs?: { game?: GhostWheelSpecList };
  };
}

export interface BuiltGhostCarHierarchy {
  root: THREE.Group;
  materials: THREE.MeshStandardMaterial[];
  lineMaterials: THREE.LineBasicMaterial[];
  wheels: GhostWheelMountList;
  wheelSpecs: GhostWheelSpecList;
  boostPlume: THREE.Mesh<THREE.ConeGeometry, THREE.MeshBasicMaterial>;
}

export interface BuiltGhostBallAndRing {
  ballMesh: THREE.Mesh<THREE.BufferGeometry, THREE.MeshStandardMaterial>;
  ballRing: THREE.Mesh<THREE.RingGeometry, THREE.MeshBasicMaterial>;
}

const _pA = new THREE.Vector3();
const _pB = new THREE.Vector3();
const _qA = new THREE.Quaternion();
const _qB = new THREE.Quaternion();
const _basisFwd = new THREE.Vector3();
const _basisRight = new THREE.Vector3();
const _basisUp = new THREE.Vector3();
const _basisMat = new THREE.Matrix4();

export function resolveGhostWorldPalette(
  worldIndex = 0,
  placement: 'same' | 'opposite' | string = 'same'
): GhostWorldPalette {
  if (placement === 'opposite' && worldIndex === 0) return GHOST_WORLD_PALETTES[1];
  return GHOST_WORLD_PALETTES[Math.abs(worldIndex) % GHOST_WORLD_PALETTES.length];
}

export function buildHolographicGhostCarHierarchy(params: {
  name: string;
  visual?: string;
  palette: GhostWorldPalette;
  opacity: number;
  lineOpacity?: number;
  plumeOpacity?: number;
  registry?: GhostVehicleRegistryPort | null;
}): BuiltGhostCarHierarchy {
  const visual = params.visual || 'fennec';
  const { palette, opacity, registry } = params;
  const lineOpacity = params.lineOpacity ?? Math.min(0.95, opacity + 0.2);
  const plumeOpacity = params.plumeOpacity ?? Math.min(0.9, opacity + 0.2);

  const root = new THREE.Group();
  root.name = params.name;

  const { carModel, carHitbox } = buildVehicleModel(
    visual,
    palette.mainHex,
    true,
    registry?.assets || {},
    registry?.carLoaders || {},
    true
  );
  root.add(carModel);
  if (carHitbox) {
    carHitbox.visible = true;
    root.add(carHitbox);
  }

  const wheelSpecs = registry?.carLoaders?.wheelSpecs?.game || getWheelSpecsForVisual(visual);
  const wheels = buildVehicleWheels(
    root,
    visual,
    palette.mainHex,
    wheelSpecs,
    registry?.assets || {},
    registry?.carLoaders || {}
  );

  const materials: THREE.MeshStandardMaterial[] = [];
  const lineMaterials: THREE.LineBasicMaterial[] = [];

  root.traverse((obj: THREE.Object3D) => {
    const meshObj = obj as THREE.Mesh;
    const lineObj = obj as THREE.Line & THREE.LineSegments;
    if (meshObj.isMesh) {
      meshObj.castShadow = false;
      meshObj.receiveShadow = false;
      meshObj.renderOrder = 11;
      const mat = new THREE.MeshStandardMaterial({
        color: palette.mainHex,
        emissive: palette.emissiveHex,
        emissiveIntensity: 0.55,
        roughness: 0.25,
        metalness: 0.2,
        transparent: true,
        opacity,
        depthWrite: false,
      });
      meshObj.material = mat;
      materials.push(mat);
    } else if (lineObj.isLineSegments || lineObj.isLine) {
      lineObj.renderOrder = 12;
      const lmat = new THREE.LineBasicMaterial({
        color: palette.wireHex,
        transparent: true,
        opacity: lineOpacity,
        depthWrite: false,
      });
      lineObj.material = lmat;
      lineMaterials.push(lmat);
    }
  });

  const coneGeo = new THREE.ConeGeometry(10, 48, 12, 1, true);
  coneGeo.rotateZ(Math.PI / 2);
  coneGeo.translate(-74, 14, 0);
  const coneMat = new THREE.MeshBasicMaterial({
    color: palette.mainHex,
    transparent: true,
    opacity: plumeOpacity,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
    depthWrite: false,
  });
  const boostPlume = new THREE.Mesh(coneGeo, coneMat);
  boostPlume.renderOrder = 12;
  boostPlume.visible = false;
  root.add(boostPlume);

  return { root, materials, lineMaterials, wheels, wheelSpecs, boostPlume };
}

export function buildHolographicGhostBallAndRing(params: {
  name: string;
  palette: GhostWorldPalette;
  ballOpacity: number;
  ringOpacity: number;
}): BuiltGhostBallAndRing {
  const { palette, ballOpacity, ringOpacity } = params;
  const ballGeo = createGeodesicBallGeometry(palette.emissiveHex);
  const ballMat = new THREE.MeshStandardMaterial({
    vertexColors: true,
    color: palette.wireHex,
    emissive: palette.emissiveHex,
    emissiveIntensity: 0.45,
    roughness: 0.3,
    metalness: 0.15,
    transparent: true,
    opacity: ballOpacity,
    depthWrite: false,
  });
  const ballMesh = new THREE.Mesh(ballGeo, ballMat);
  ballMesh.name = params.name;
  ballMesh.castShadow = false;
  ballMesh.receiveShadow = false;
  ballMesh.renderOrder = 11;

  const ringGeo = new THREE.RingGeometry(82, 96, 36);
  ringGeo.rotateX(-Math.PI / 2);
  const ringMat = new THREE.MeshBasicMaterial({
    color: palette.mainHex,
    transparent: true,
    opacity: ringOpacity,
    side: THREE.DoubleSide,
    depthWrite: false,
  });
  const ballRing = new THREE.Mesh(ringGeo, ringMat);
  ballRing.renderOrder = 11;

  return { ballMesh, ballRing };
}

export function applyPaletteToGhostMaterials(
  palette: GhostWorldPalette,
  carMaterials: readonly THREE.MeshStandardMaterial[],
  lineMaterials: readonly THREE.LineBasicMaterial[],
  boostPlume?: THREE.Mesh<THREE.ConeGeometry, THREE.MeshBasicMaterial> | null,
  ballMesh?: THREE.Mesh<THREE.BufferGeometry, THREE.MeshStandardMaterial> | null,
  ballRing?: THREE.Mesh<THREE.RingGeometry, THREE.MeshBasicMaterial> | null
): void {
  for (const mat of carMaterials) {
    mat.color.setHex(palette.mainHex);
    mat.emissive.setHex(palette.emissiveHex);
  }
  for (const lmat of lineMaterials) {
    lmat.color.setHex(palette.wireHex);
  }
  if (boostPlume?.material) {
    boostPlume.material.color.setHex(palette.mainHex);
  }
  if (ballMesh?.material) {
    ballMesh.material.color.setHex(palette.wireHex);
    ballMesh.material.emissive.setHex(palette.emissiveHex);
  }
  if (ballRing?.material) {
    ballRing.material.color.setHex(palette.mainHex);
  }
}

export function viewBasisToQuatSigned(
  targetQuat: THREE.Quaternion,
  view: CarStateView | BallStateView,
  xySign: number
): THREE.Quaternion {
  unrealToThreeCoords(_basisFwd, view.fwdX * xySign, view.fwdY * xySign, view.fwdZ);
  unrealToThreeCoords(_basisRight, view.rightX * xySign, view.rightY * xySign, view.rightZ);
  unrealToThreeCoords(_basisUp, view.upX * xySign, view.upY * xySign, view.upZ);

  if (_basisFwd.lengthSq() < 1e-6 || _basisUp.lengthSq() < 1e-6 || _basisRight.lengthSq() < 1e-6) {
    targetQuat.set(0, 0, 0, 1);
    return targetQuat;
  }

  _basisMat.makeBasis(_basisFwd, _basisUp, _basisRight);
  targetQuat.setFromRotationMatrix(_basisMat);
  targetQuat.normalize();
  return targetQuat;
}

export function interpolateSignedTransform(
  targetMesh: THREE.Object3D,
  prevView: CarStateView | BallStateView,
  currView: CarStateView | BallStateView,
  alpha: number,
  xySign: number
): void {
  unrealToThreeCoords(_pA, prevView.posX * xySign, prevView.posY * xySign, prevView.posZ);
  unrealToThreeCoords(_pB, currView.posX * xySign, currView.posY * xySign, currView.posZ);
  targetMesh.position.lerpVectors(_pA, _pB, alpha);

  viewBasisToQuatSigned(_qA, prevView, xySign);
  viewBasisToQuatSigned(_qB, currView, xySign);
  targetMesh.quaternion.slerpQuaternions(_qA, _qB, alpha);
}
