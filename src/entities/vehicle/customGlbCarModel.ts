import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import {
  FENNEC_DESCRIPTOR,
  getVehicleDescriptor,
  vehicleTunerRuntimeFlags,
  wheelModifierRuntimeConfig,
  recomputeDescriptorBoostOutlets,
} from '../../ui-core/config/vehicleTunerConfig.ts';
import { resolveAssetPath } from '../../utils/AssetResponseValidator.ts';
import { createProceduralSportWheel } from './vehicleWheelsAndLamps.ts';

export interface UnscaledGlbBounds {
  min: [number, number, number];
  max: [number, number, number];
  length: number;
  height: number;
  width: number;
  center: [number, number, number];
  roofTopY: number;
}

export interface CustomGlbVehicleAsset {
  id: string;
  scene: THREE.Group;
  fileName?: string;
  alignPreset?: string;
  appliedGeometryScale?: number;
  unscaledBounds?: UnscaledGlbBounds;
}

const cachedCustomAssets = new Map<string, CustomGlbVehicleAsset>();

export function getCachedCustomVehicleAsset(vehicleId: string): CustomGlbVehicleAsset | undefined {
  return cachedCustomAssets.get(String(vehicleId || '').toLowerCase());
}

export function setCachedCustomVehicleAsset(vehicleId: string, asset: CustomGlbVehicleAsset): void {
  const id = String(vehicleId || '').toLowerCase();
  if (id && asset) {
    cachedCustomAssets.set(id, asset);
  }
}

export function computeObject3DBounds(object: THREE.Object3D): UnscaledGlbBounds {
  const box = new THREE.Box3().setFromObject(object);
  if (box.isEmpty()) {
    return {
      min: [-60, -15, -35],
      max: [80, 35, 35],
      length: 140,
      height: 50,
      width: 70,
      center: [10, 10, 0],
      roofTopY: 35,
    };
  }
  const size = new THREE.Vector3();
  const center = new THREE.Vector3();
  box.getSize(size);
  box.getCenter(center);
  const r = (n: number) => Number(n.toFixed(4));
  return {
    min: [r(box.min.x), r(box.min.y), r(box.min.z)],
    max: [r(box.max.x), r(box.max.y), r(box.max.z)],
    length: r(size.x),
    height: r(size.y),
    width: r(size.z),
    center: [r(center.x), r(center.y), r(center.z)],
    roofTopY: r(box.max.y),
  };
}

export function scaleSceneGeometries(scene: THREE.Object3D, factor: number): void {
  if (!Number.isFinite(factor) || factor <= 0 || Math.abs(factor - 1) < 1e-6) return;
  const scaledGeometries = new Set<THREE.BufferGeometry>();
  scene.traverse?.(
    (node: THREE.Object3D & { isMesh?: boolean; geometry?: THREE.BufferGeometry }) => {
      if (node.isMesh && node.geometry && !scaledGeometries.has(node.geometry)) {
        scaledGeometries.add(node.geometry);
        node.geometry.scale(factor, factor, factor);
        node.geometry.computeBoundingBox?.();
        node.geometry.computeBoundingSphere?.();
      }
    }
  );
}

/**
 * Normalizes a loaded GLTF scene for custom vehicles:
 * - Scales scene geometries to match target vehicle units.
 * - Preserves original material slot names on every Mesh.
 */
export function normalizeCustomVehicleScene(
  scene: THREE.Object3D,
  vehicleId: string,
  explicitUnitScale?: number
): { unscaledBounds: UnscaledGlbBounds; appliedGeometryScale: number } {
  const unscaledBounds = computeObject3DBounds(scene);
  const descriptor = getVehicleDescriptor(vehicleId);
  let targetUnitScale = explicitUnitScale ?? descriptor?.unitScale ?? 1;
  if (explicitUnitScale === undefined && descriptor?.unitScale === undefined) {
    const diag = Math.hypot(unscaledBounds.length, unscaledBounds.height, unscaledBounds.width);
    if (diag > 0 && diag < 10) {
      targetUnitScale = 100;
    }
  }
  scaleSceneGeometries(scene, targetUnitScale);

  scene.traverse?.(
    (node: THREE.Object3D & { isMesh?: boolean; material?: THREE.Material | THREE.Material[] }) => {
      if (!node.isMesh) return;
      const matName = Array.isArray(node.material)
        ? node.material[0]?.name || ''
        : node.material?.name || '';
      node.userData.originalMaterialName = matName;
      node.userData.vehicleId = vehicleId;
    }
  );

  return { unscaledBounds, appliedGeometryScale: targetUnitScale };
}

const inflightCustomAssetLoads = new Map<string, Promise<CustomGlbVehicleAsset>>();

/**
 * Loads a custom GLB vehicle asset registered in vehicleDescriptors,
 * deduplicating concurrent in-flight requests for the same vehicle ID.
 */
export async function loadCustomGlbCarAsset(vehicleId: string): Promise<CustomGlbVehicleAsset> {
  const id = String(vehicleId || '').toLowerCase();
  if (cachedCustomAssets.has(id)) {
    return cachedCustomAssets.get(id)!;
  }
  const existingInflight = inflightCustomAssetLoads.get(id);
  if (existingInflight) {
    return existingInflight;
  }
  const descriptor = getVehicleDescriptor(id);
  if (!descriptor || !descriptor.modelUrl) {
    throw new Error(`Unknown custom GLB vehicle descriptor for "${vehicleId}"`);
  }

  const loadPromise = (async (): Promise<CustomGlbVehicleAsset> => {
    const loader = new GLTFLoader();
    const gltf = await loader.loadAsync(resolveAssetPath(descriptor.modelUrl));
    gltf.scene.updateMatrixWorld?.(true);
    const { unscaledBounds, appliedGeometryScale } = normalizeCustomVehicleScene(
      gltf.scene,
      id,
      descriptor.unitScale
    );

    const asset: CustomGlbVehicleAsset = {
      id,
      scene: gltf.scene,
      appliedGeometryScale,
      unscaledBounds,
    };
    cachedCustomAssets.set(id, asset);
    return asset;
  })();

  inflightCustomAssetLoads.set(id, loadPromise);
  try {
    return await loadPromise;
  } finally {
    inflightCustomAssetLoads.delete(id);
  }
}

import { applyCustomGlbVehicleMaterials } from './customGlbVehicleMaterials.ts';
import { getPhysicsWheelSpecsForHitbox } from '../VehicleSuspensionSystem.ts';

/**
 * Updates boost nozzle gizmo positions on a custom vehicle model.
 */
export function syncCustomVehicleNozzleGizmos(carModelRoot, descriptor) {
  if (!carModelRoot || !descriptor) return;
  let gizmoGroup = carModelRoot.getObjectByName?.('boost-nozzle-gizmos');
  if (!gizmoGroup) {
    gizmoGroup = new THREE.Group();
    gizmoGroup.name = 'boost-nozzle-gizmos';
    const sphereGeom = new THREE.SphereGeometry(2.2, 12, 12);
    const sphereMat = new THREE.MeshBasicMaterial({
      color: 0x00ffcc,
      wireframe: true,
      toneMapped: false,
      depthTest: false,
    });
    for (let i = 0; i < 2; i++) {
      const m = new THREE.Mesh(sphereGeom, sphereMat);
      m.name = 'boost-nozzle-gizmo';
      m.renderOrder = 120;
      gizmoGroup.add(m);
    }
    carModelRoot.add(gizmoGroup);
  }

  gizmoGroup.visible = Boolean(vehicleTunerRuntimeFlags.showNozzleGizmos);
  const outlets = descriptor.boostOutlets || [];
  for (let i = 0; i < gizmoGroup.children.length; i++) {
    const child = gizmoGroup.children[i];
    const coord = outlets[i];
    if (coord) {
      child.position.set(coord[0], coord[1], coord[2]);
      child.visible = Boolean(vehicleTunerRuntimeFlags.showNozzleGizmos);
    } else {
      child.visible = false;
    }
  }
}

/**
 * Updates physics engine wheel wireframe circles on a custom vehicle model.
 * Uses the actual RocketSim physics wheel offsets and radii for the active hitbox preset.
 */
export function syncCustomVehicleWheelWireGizmos(carModelRoot, descriptor) {
  if (!carModelRoot || !descriptor) return;
  let wireGroup = carModelRoot.getObjectByName?.('wheel-wire-gizmos');
  if (!wireGroup) {
    wireGroup = new THREE.Group();
    wireGroup.name = 'wheel-wire-gizmos';
    const segments = 36;
    const pts: THREE.Vector3[] = [];
    for (let s = 0; s < segments; s++) {
      const theta = (s / segments) * Math.PI * 2;
      pts.push(new THREE.Vector3(Math.cos(theta), Math.sin(theta), 0));
    }
    const circleGeom = new THREE.BufferGeometry().setFromPoints(pts);
    const circleMat = new THREE.LineBasicMaterial({
      color: 0x38bdf8,
      transparent: true,
      opacity: 0.95,
      toneMapped: false,
      depthTest: false,
      depthWrite: false,
    });
    for (let i = 0; i < 4; i++) {
      const loop = new THREE.LineLoop(circleGeom, circleMat);
      loop.name = `wheel-wire-gizmo-${i}`;
      loop.renderOrder = 115;
      wireGroup.add(loop);
    }
    carModelRoot.add(wireGroup);
  }

  const showWire = Boolean(vehicleTunerRuntimeFlags.showWheelWire);
  wireGroup.visible = showWire;
  const isThreeWheels = Boolean(
    descriptor.threeWheels || descriptor.hitboxPreset === 'hitbox-psyclops'
  );
  const physicsSpecs = getPhysicsWheelSpecsForHitbox(
    descriptor.hitboxPreset || 'hitbox-octane',
    isThreeWheels
  );
  for (let i = 0; i < wireGroup.children.length; i++) {
    const child = wireGroup.children[i];
    const spec = physicsSpecs[i];
    if (spec && !(isThreeWheels && i === 1)) {
      const [wx, wz, wr] = spec;
      child.position.set(wx, wr - 17, wz);
      child.scale.set(wr, wr, 1);
      child.visible = showWire;
    } else {
      child.visible = false;
    }
  }
}

/**
 * Instantiates a Fennec or Insidio 3D model hierarchy with alignment transforms and materials.
 */
export function createCustomGlbCarModel(vehicleId, asset, teamColor) {
  const descriptor = getVehicleDescriptor(vehicleId) || FENNEC_DESCRIPTOR;
  const root = new THREE.Group();
  root.name = descriptor.id;
  root.userData.vehicleId = descriptor.id;

  const shell = new THREE.Group();
  shell.name = `${descriptor.id}-shell`;

  const align = descriptor.alignment || {
    scale: 1,
    scaleX: 1,
    scaleY: 1,
    scaleZ: 1,
    centerOffset: [0, 0, 0],
  };
  const s = align.scale ?? 1;
  shell.scale.set(s * (align.scaleX ?? 1), s * (align.scaleY ?? 1), s * (align.scaleZ ?? 1));
  const [ox = 0, oy = 0, oz = 0] = align.centerOffset || [0, 0, 0];
  shell.position.set(ox, oy, oz);

  if (asset && asset.scene) {
    const clonedScene = asset.scene.clone(true);
    // Preserve userData across clone
    const srcMeshes: THREE.Object3D[] = [];
    const dstMeshes: THREE.Object3D[] = [];
    asset.scene.traverse?.((n: THREE.Object3D & { isMesh?: boolean }) => {
      if (n.isMesh) srcMeshes.push(n);
    });
    clonedScene.traverse?.((n: THREE.Object3D & { isMesh?: boolean }) => {
      if (n.isMesh) dstMeshes.push(n);
    });
    for (let i = 0; i < dstMeshes.length && i < srcMeshes.length; i++) {
      dstMeshes[i].userData = { ...srcMeshes[i].userData };
    }
    shell.add(clonedScene);
  }

  root.add(shell);
  recomputeDescriptorBoostOutlets(descriptor);
  syncCustomVehicleNozzleGizmos(root, descriptor);
  syncCustomVehicleWheelWireGizmos(root, descriptor);
  applyCustomGlbVehicleMaterials(root, descriptor.id, teamColor);
  return root;
}

/**
 * Live-updates an instantiated carRoot in the Arena when parameters are tweaked in the Floating Window.
 */
export function applyLiveVehicleDescriptorUpdate(
  carRoot,
  carHitbox,
  carWheels,
  carBoosts,
  descriptor,
  teamColor,
  paintFinish: string | null = null
) {
  if (!carRoot || !descriptor) return;

  const bodyMesh = carRoot.children?.find((c) => c.name === 'car-body-mesh');
  const resolvedColor = teamColor ?? bodyMesh?.userData?.teamColor ?? 0x42a5f5;
  if (bodyMesh) {
    const shell = bodyMesh.getObjectByName?.(`${descriptor.id}-shell`) || bodyMesh.children?.[0];
    if (shell && descriptor.alignment) {
      const s = descriptor.alignment.scale ?? 1;
      shell.scale.set(
        s * (descriptor.alignment.scaleX ?? 1),
        s * (descriptor.alignment.scaleY ?? 1),
        s * (descriptor.alignment.scaleZ ?? 1)
      );
      const [ox = 0, oy = 0, oz = 0] = descriptor.alignment.centerOffset || [0, 0, 0];
      shell.position.set(ox, oy, oz);
    }
    recomputeDescriptorBoostOutlets(descriptor);
    syncCustomVehicleNozzleGizmos(bodyMesh, descriptor);
    syncCustomVehicleWheelWireGizmos(bodyMesh, descriptor);
    applyCustomGlbVehicleMaterials(bodyMesh, descriptor.id, resolvedColor, paintFinish);
  }

  if (Array.isArray(carBoosts) && Array.isArray(descriptor.boostOutlets)) {
    for (let i = 0; i < carBoosts.length && i < descriptor.boostOutlets.length; i++) {
      const [bx, by, bz] = descriptor.boostOutlets[i];
      if (carBoosts[i]?.setNozzleOffset) {
        carBoosts[i].setNozzleOffset(bx, by, bz);
      } else if (carBoosts[i]?.offset) {
        carBoosts[i].offset.set(bx, by, bz);
      }
    }
  }

  if (Array.isArray(carWheels) && Array.isArray(descriptor.wheelAnchors)) {
    const extraY = Number(wheelModifierRuntimeConfig.verticalOffsetY) || 0;
    for (let i = 0; i < carWheels.length && i < descriptor.wheelAnchors.length; i++) {
      const [wx, wz, wr] = descriptor.wheelAnchors[i];
      const customRestY = descriptor.suspensionHeights?.[i];
      const restYDelta = typeof customRestY === 'number' ? customRestY - (wr - 17) : 0;
      const restY = -4.5 + restYDelta + extraY;
      if (carWheels[i]?.steer) {
        carWheels[i].steer.position.set(wx, restY, wz);
      }
      if (carWheels[i]?.spin) {
        const spinGroup = carWheels[i].spin;
        while (spinGroup.children.length > 0) {
          const oldChild = spinGroup.children[0];
          spinGroup.remove(oldChild);
          oldChild.traverse?.((n) => {
            n.geometry?.dispose?.();
            if (n.material) {
              const mats = Array.isArray(n.material) ? n.material : [n.material];
              mats.forEach((m) => m?.dispose?.());
            }
          });
        }
        spinGroup.add(createProceduralSportWheel(wr || 13.5, resolvedColor, i));
      }
    }
  }
}
