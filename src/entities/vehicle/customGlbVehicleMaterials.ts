/**
 * customGlbVehicleMaterials.ts
 * Builds and applies surface slot materials (Standard, Toon, PBR Multi-Layer)
 * and front/rear lamp materials to custom GLB vehicle hierarchies (Fennec, Insidio).
 */

import * as THREE from 'three';
import {
  DEFAULT_BORDER_OVERRIDE_COLOR,
  FENNEC_DESCRIPTOR,
  GLOBAL_VEHICLE_LAMPS_CONFIG,
  GLOBAL_VEHICLE_SURFACE_MATERIALS,
  getVehicleDescriptor,
  vehicleTunerRuntimeFlags,
} from '../../ui-core/config/vehicleTunerConfig.ts';
import { createCarPaintMaterial, getVehicleReceiveShadows } from './vehiclePaintMaterial.ts';
import { buildCustomToonRampTexture } from './vehiclePaintMaterial.ts';

function resolveSurfaceSlotColor(
  slotConfig: { slotName?: string; color?: string | number },
  teamColor: number | string | null | undefined
): string | number {
  const slotLower = String(slotConfig.slotName || '').toLowerCase();
  if (slotLower === 'border' && vehicleTunerRuntimeFlags.borderColorOverride) {
    return vehicleTunerRuntimeFlags.borderOverrideColor || DEFAULT_BORDER_OVERRIDE_COLOR;
  }
  const isBodySlot = slotLower === 'body' || slotLower === 'body-shell';
  const useDirectColor =
    Boolean(vehicleTunerRuntimeFlags.colorOverride) || !isBodySlot || typeof teamColor !== 'number';
  return useDirectColor ? slotConfig.color || '#42a5f5' : teamColor;
}

export function buildSurfaceSlotMaterial(slotConfig, teamColor) {
  const rawMode = slotConfig.mode || 'standard';
  const mode =
    rawMode === 'standard' || rawMode === 'toon' || rawMode === 'pbr' ? rawMode : 'standard';

  const resolvedColor = new THREE.Color(resolveSurfaceSlotColor(slotConfig, teamColor));

  if (mode === 'toon') {
    const rampTex = buildCustomToonRampTexture(
      slotConfig.toonSteps ?? 4,
      slotConfig.toonShadowMin ?? 0.11,
      slotConfig.toonHighlightMax ?? 1.0,
      Boolean(slotConfig.toonSmooth)
    );
    return new THREE.MeshToonMaterial({
      name: `Toon / ${slotConfig.slotName}`,
      color: resolvedColor,
      gradientMap: rampTex,
    });
  }

  if (mode === 'pbr') {
    const pearlColor = new THREE.Color(slotConfig.pearlColor || slotConfig.color || '#ffffff');
    const pearlUniforms = {
      pearlColor: { value: pearlColor },
      uPearlFresnelPower: { value: 1.35 },
      uPearlBlendStrength: { value: 0.82 },
    };
    const pbrMat = new THREE.MeshPhysicalMaterial({
      name: `PBR Multi-Layer / ${slotConfig.slotName}`,
      color: resolvedColor,
      metalness: slotConfig.metalness ?? 0.76,
      roughness: slotConfig.roughness ?? 0.17,
      clearcoat: slotConfig.clearcoat ?? 1.0,
      clearcoatRoughness: slotConfig.clearcoatRoughness ?? 0.11,
      sheen: slotConfig.sheen ?? 0.7,
      sheenColor: pearlColor,
      sheenRoughness: 0.24,
      envMapIntensity: slotConfig.envMapIntensity ?? 1.4,
    });

    pbrMat.onBeforeCompile = (shader) => {
      shader.uniforms.pearlColor = pearlUniforms.pearlColor;
      shader.uniforms.uPearlFresnelPower = pearlUniforms.uPearlFresnelPower;
      shader.uniforms.uPearlBlendStrength = pearlUniforms.uPearlBlendStrength;
      shader.fragmentShader = shader.fragmentShader
        .replace(
          '#include <normal_fragment_maps>',
          `#include <normal_fragment_maps>
          float pearlFresnel = pow(
            1.0 - clamp(dot(normalize(normal), normalize(vViewPosition)), 0.0, 1.0), max(0.1, uPearlFresnelPower)
          );
          float pearlBlend = uPearlBlendStrength * smoothstep(0.12, 0.72, pearlFresnel);
          diffuseColor.rgb = mix(diffuseColor.rgb, pearlColor, pearlBlend);`
        )
        .replace(
          'uniform vec3 diffuse;',
          'uniform vec3 diffuse;\nuniform vec3 pearlColor;\nuniform float uPearlFresnelPower;\nuniform float uPearlBlendStrength;'
        );
    };
    pbrMat.customProgramCacheKey = () => `custom-vehicle-pbr-pearl-${slotConfig.slotName}`;
    pbrMat.userData._slotMode = 'pbr';
    pbrMat.userData._pearlUniforms = pearlUniforms;
    return pbrMat;
  }

  const stdMat = new THREE.MeshStandardMaterial({
    name: `Standard Single-Layer / ${slotConfig.slotName}`,
    color: resolvedColor,
    metalness: slotConfig.metalness ?? 0.0,
    roughness: slotConfig.roughness ?? 0.5,
    envMapIntensity: slotConfig.envMapIntensity ?? 1.0,
  });
  stdMat.userData._slotMode = 'standard';
  return stdMat;
}

export interface SurfaceSlotConfig {
  mode?: string;
  slotName?: string;
  color?: string | number;
  toonSteps?: number;
  toonShadowMin?: number;
  toonHighlightMax?: number;
  toonSmooth?: boolean;
  pearlColor?: string | number;
  metalness?: number;
  roughness?: number;
  clearcoat?: number;
  clearcoatRoughness?: number;
  sheen?: number;
  envMapIntensity?: number;
}

type UpdatableSlotMaterial = THREE.Material & {
  color?: THREE.Color;
  metalness?: number;
  roughness?: number;
  clearcoat?: number;
  clearcoatRoughness?: number;
  sheen?: number;
  sheenColor?: THREE.Color;
  sheenRoughness?: number;
  envMapIntensity?: number;
  userData: {
    _slotMode?: string;
    _pearlUniforms?: {
      pearlColor?: { value?: THREE.Color };
    };
    [key: string]: unknown;
  };
};

function updateExistingSurfaceSlotMaterial(
  existingMat: UpdatableSlotMaterial | null | undefined,
  slotConfig: SurfaceSlotConfig,
  teamColor: number | string | null | undefined
): boolean {
  if (!existingMat) return false;
  const rawMode = slotConfig.mode || 'standard';
  const mode =
    rawMode === 'standard' || rawMode === 'toon' || rawMode === 'pbr' ? rawMode : 'standard';
  if (existingMat.userData?._slotMode !== mode) return false;

  existingMat.color?.set?.(resolveSurfaceSlotColor(slotConfig, teamColor));

  if (mode === 'pbr') {
    const pearlHex = slotConfig.pearlColor || slotConfig.color || '#ffffff';
    existingMat.metalness = slotConfig.metalness ?? 0.76;
    existingMat.roughness = slotConfig.roughness ?? 0.17;
    existingMat.clearcoat = slotConfig.clearcoat ?? 1.0;
    existingMat.clearcoatRoughness = slotConfig.clearcoatRoughness ?? 0.11;
    existingMat.sheen = slotConfig.sheen ?? 0.7;
    existingMat.sheenColor?.set?.(pearlHex);
    existingMat.sheenRoughness = 0.24;
    existingMat.envMapIntensity = slotConfig.envMapIntensity ?? 1.4;
    existingMat.userData?._pearlUniforms?.pearlColor?.value?.set?.(pearlHex);
    return true;
  }

  if (mode === 'standard') {
    existingMat.metalness = slotConfig.metalness ?? 0.0;
    existingMat.roughness = slotConfig.roughness ?? 0.5;
    existingMat.envMapIntensity = slotConfig.envMapIntensity ?? 1.0;
    return true;
  }

  return false;
}

export type StandardVehicleMaterialSlot =
  'body' | 'window' | 'border' | 'bottom' | 'metal' | 'FrontBulb' | 'BackBulb';

export interface MaterialSlotClassification {
  slot: StandardVehicleMaterialSlot;
  isFallback: boolean;
}

const warnedFallbackMaterials = new Set<string>();

/**
 * Classifies a GLB material name into one of the 7 standard vehicle material slots
 * (`body`, `window`, `border`, `bottom`, `metal`, `FrontBulb`, `BackBulb`) via
 * case-insensitive substring matching. Unrecognized names fall back to `body`.
 */
export function classifyCustomVehicleMaterialSlot(
  rawMaterialName: string
): MaterialSlotClassification {
  const lower = String(rawMaterialName || '')
    .trim()
    .toLowerCase();
  if (lower.includes('front')) return { slot: 'FrontBulb', isFallback: false };
  if (lower.includes('back')) return { slot: 'BackBulb', isFallback: false };
  if (lower.includes('body') || lower.includes('dummy')) return { slot: 'body', isFallback: false };
  if (lower.includes('window')) return { slot: 'window', isFallback: false };
  if (lower.includes('border')) return { slot: 'border', isFallback: false };
  if (lower.includes('bottom') || lower.includes('chassis'))
    return { slot: 'bottom', isFallback: false };
  if (lower.includes('metal')) return { slot: 'metal', isFallback: false };
  return { slot: 'body', isFallback: true };
}

export function applyCustomGlbVehicleMaterials(
  root: THREE.Object3D,
  vehicleId: string,
  teamColor: number,
  paintFinish: string | null = null
) {
  const descriptor = getVehicleDescriptor(vehicleId) || FENNEC_DESCRIPTOR;
  const palette = createCarPaintMaterial(teamColor, descriptor.colors?.default);
  const finishPreset =
    paintFinish === 'metallic'
      ? { metalness: 0.7, roughness: 0.45 }
      : paintFinish === 'matte'
        ? { metalness: 0.5, roughness: 0.85 }
        : null;
  if (finishPreset && palette?.body) {
    palette.body.metalness = finishPreset.metalness;
    palette.body.roughness = finishPreset.roughness;
  }
  const surfaceConfigs = GLOBAL_VEHICLE_SURFACE_MATERIALS || descriptor.surfaceMaterials || {};
  const lampsCfg =
    GLOBAL_VEHICLE_LAMPS_CONFIG || descriptor.lampsConfig || FENNEC_DESCRIPTOR.lampsConfig;

  const frontBaseColor = new THREE.Color(lampsCfg.frontColor || '#d8eeff').multiplyScalar(
    lampsCfg.frontIntensity ?? 2.5
  );
  let frontLampMaterial = root.userData.frontLampMaterial;
  if (frontLampMaterial && frontLampMaterial.isMeshBasicMaterial) {
    frontLampMaterial.color.copy(frontBaseColor);
    frontLampMaterial.toneMapped = Boolean(lampsCfg.frontToneMapped);
  } else {
    frontLampMaterial = new THREE.MeshBasicMaterial({
      name: 'FrontBulb',
      color: frontBaseColor,
      toneMapped: Boolean(lampsCfg.frontToneMapped),
    });
  }

  const tailIdleColor = new THREE.Color(lampsCfg.tailIdleColor || '#5c0a0a').multiplyScalar(
    lampsCfg.tailIdleIntensity ?? 0.85
  );
  let tailLampMaterial = root.userData.tailLampMaterials?.[0];
  if (tailLampMaterial && tailLampMaterial.isMeshBasicMaterial) {
    tailLampMaterial.color.copy(tailIdleColor);
    tailLampMaterial.toneMapped = Boolean(lampsCfg.tailToneMapped);
  } else {
    tailLampMaterial = new THREE.MeshBasicMaterial({
      name: 'BackBulb',
      color: tailIdleColor,
      toneMapped: Boolean(lampsCfg.tailToneMapped),
    });
  }

  const prevCustomMats: THREE.Material[] = Array.isArray(root.userData.customDisposables)
    ? root.userData.customDisposables
    : [];
  const prevSlotMap: Map<string, UpdatableSlotMaterial> | null =
    root.userData.vehicleId === descriptor.id && root.userData.slotMaterialMap instanceof Map
      ? root.userData.slotMaterialMap
      : null;

  const slotMaterialMap = new Map<string, THREE.Material>();
  for (const [slotKey, slotCfg] of Object.entries(surfaceConfigs)) {
    const lowerKey = slotKey.toLowerCase();
    const isBodySlot = lowerKey === 'body' || lowerKey === 'body-shell';
    const effectiveCfg =
      isBodySlot && finishPreset
        ? { ...slotCfg, metalness: finishPreset.metalness, roughness: finishPreset.roughness }
        : slotCfg;
    const existingSlotMat = prevSlotMap?.get(lowerKey);
    if (
      existingSlotMat &&
      updateExistingSurfaceSlotMaterial(existingSlotMat, effectiveCfg, teamColor)
    ) {
      slotMaterialMap.set(lowerKey, existingSlotMat);
    } else {
      slotMaterialMap.set(lowerKey, buildSurfaceSlotMaterial(effectiveCfg, teamColor));
    }
  }
  if (!slotMaterialMap.has('bottom') && FENNEC_DESCRIPTOR.surfaceMaterials?.bottom) {
    slotMaterialMap.set(
      'bottom',
      buildSurfaceSlotMaterial(FENNEC_DESCRIPTOR.surfaceMaterials.bottom, teamColor)
    );
  }

  const tailLampMaterials: THREE.MeshBasicMaterial[] = [];

  root.traverse?.(
    (node: THREE.Object3D & { isMesh?: boolean; material?: THREE.Material | THREE.Material[] }) => {
      if (!node.isMesh) return;
      if (
        node.name === 'boost-nozzle-gizmo' ||
        node.name === 'car-hitbox' ||
        node.name === 'car-hitbox-wireframe'
      ) {
        return;
      }

      const origMatName = (
        node.userData.originalMaterialName ||
        (Array.isArray(node.material) ? node.material[0]?.name : node.material?.name) ||
        ''
      ).trim();
      node.userData.originalMaterialName = origMatName;

      const classification = classifyCustomVehicleMaterialSlot(origMatName);
      if (classification.isFallback) {
        const warnKey = `${descriptor.id}::${node.name || 'mesh'}::${origMatName || '<unnamed>'}`;
        if (!warnedFallbackMaterials.has(warnKey)) {
          warnedFallbackMaterials.add(warnKey);
          console.warn(
            `[CustomGlbMaterial] Unrecognized material "${origMatName || '<unnamed>'}" on mesh "${node.name || 'unnamed'}" in vehicle "${descriptor.id}"; falling back to default "body" slot.`
          );
        }
      }

      if (classification.slot === 'FrontBulb') {
        node.material = frontLampMaterial;
        node.castShadow = false;
        node.receiveShadow = false;
        return;
      }

      if (classification.slot === 'BackBulb') {
        node.material = tailLampMaterial;
        node.castShadow = false;
        node.receiveShadow = false;
        if (!tailLampMaterials.includes(tailLampMaterial)) {
          tailLampMaterials.push(tailLampMaterial);
        }
        return;
      }

      const slotMat = slotMaterialMap.get(classification.slot);
      node.material = slotMat || slotMaterialMap.get('body') || palette.body;
      node.castShadow = true;
      node.receiveShadow = getVehicleReceiveShadows();
    }
  );

  const nextDisposables = [frontLampMaterial, tailLampMaterial, ...slotMaterialMap.values()];
  const retainedSet = new Set(nextDisposables);
  for (const oldMat of prevCustomMats) {
    if (oldMat && !retainedSet.has(oldMat)) {
      oldMat.dispose?.();
    }
  }

  Object.assign(root.userData, {
    vehicleId: descriptor.id,
    slotMaterialMap,
    tailLampMaterials,
    frontLampMaterial,
    customDisposables: nextDisposables,
    ...(typeof teamColor === 'number' ? { teamColor } : {}),
  });
}
