import * as THREE from 'three';
import { createCarPaintMaterial, applyVehicleMaterials } from '../vehicle/vehiclePaintMaterial.ts';
import { applyCustomGlbVehicleMaterials } from '../vehicle/customGlbVehicleMaterials.ts';
import {
  hasVehicleDescriptor,
  GLOBAL_VEHICLE_SURFACE_MATERIALS,
} from '../../ui-core/config/vehicleTunerConfig.ts';
import { normalizeVisualId } from '../../ui-core/config/vehicleConstants.ts';

export interface TraversableMaterialNode extends THREE.Object3D {
  isMesh?: boolean;
  castShadow?: boolean;
  receiveShadow?: boolean;
  geometry?: THREE.BufferGeometry;
  material?: THREE.Material | THREE.Material[];
}

export interface PaintableMaterial extends THREE.Material {
  name?: string;
  color?: THREE.Color;
  metalness?: number;
  roughness?: number;
  needsUpdate?: boolean;
}

export function applyVehiclePaint(
  carRoot: THREE.Object3D | null | undefined,
  rawPreset: string | null | undefined,
  colorVal: string | number | null | undefined,
  paintFinish: string | null = null
): void {
  if (!carRoot) return;
  const preset = rawPreset ? normalizeVisualId(rawPreset) : rawPreset;

  const num = typeof colorVal === 'string' ? parseInt(colorVal.replace('#', ''), 16) : colorVal;
  const finishPreset =
    paintFinish === 'metallic'
      ? { metalness: 0.7, roughness: 0.45 }
      : paintFinish === 'matte'
        ? { metalness: 0.5, roughness: 0.85 }
        : null;

  let isWhitebox = Boolean(
    preset?.startsWith('hitbox-') ||
    carRoot.name?.startsWith('whitebox-') ||
    carRoot.children?.some((c: THREE.Object3D) => c.name?.startsWith('whitebox-'))
  );

  if (!isWhitebox) {
    carRoot.traverse((node: TraversableMaterialNode) => {
      if (node.isMesh && node.material) {
        const mats = Array.isArray(node.material) ? node.material : [node.material];
        if (mats.some((m: THREE.Material) => m?.name === 'whitebox-rear')) isWhitebox = true;
      }
    });
  }

  if (isWhitebox) {
    const bodySlot = GLOBAL_VEHICLE_SURFACE_MATERIALS?.body;
    const metalness = finishPreset?.metalness ?? bodySlot?.metalness ?? 0.7;
    const roughness = finishPreset?.roughness ?? bodySlot?.roughness ?? 0.45;
    carRoot.traverse((node: TraversableMaterialNode) => {
      if (node.isMesh && node.material) {
        const materials = Array.isArray(node.material) ? node.material : [node.material];
        materials.forEach((material: PaintableMaterial) => {
          if (material && material.name === 'paint') {
            if (num !== undefined && num !== null) material.color?.set?.(num);
            if (bodySlot || finishPreset) {
              material.metalness = metalness;
              material.roughness = roughness;
              material.needsUpdate = true;
            }
          } else if (material && material.name === 'whitebox-rear' && (bodySlot || finishPreset)) {
            material.metalness = metalness;
            material.roughness = roughness;
            material.needsUpdate = true;
          }
        });
      }
    });
    return;
  }

  if (preset && hasVehicleDescriptor(preset)) {
    const bodyMesh =
      carRoot.children?.find((c: THREE.Object3D) => c.name === 'car-body-mesh') || carRoot;
    applyCustomGlbVehicleMaterials(bodyMesh, preset, num ?? 0x3b82f6, paintFinish);
    const palette = createCarPaintMaterial(num, undefined);
    if (finishPreset && palette?.body) {
      palette.body.metalness = finishPreset.metalness;
      palette.body.roughness = finishPreset.roughness;
      palette.body.needsUpdate = true;
    }
    for (const child of carRoot.children || []) {
      if (child.name === 'car-wheel-steer') {
        applyVehicleMaterials(child, palette);
      }
    }
    return;
  }

  const palette = createCarPaintMaterial(num, undefined);
  if (finishPreset && palette?.body) {
    palette.body.metalness = finishPreset.metalness;
    palette.body.roughness = finishPreset.roughness;
    palette.body.needsUpdate = true;
  }
  applyVehicleMaterials(carRoot, palette);
}
