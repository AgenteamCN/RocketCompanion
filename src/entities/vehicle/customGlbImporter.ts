/**
 * customGlbImporter.ts
 * Runtime custom GLB parser, material slot inspector, and Align Preset applicator
 * for the experimental GLB import workflow in Vehicle Offsets & Hitbox tuner.
 */

import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { HITBOX_PRESETS } from '../../ui-core/config/vehiclePresets.ts';
import {
  FENNEC_DESCRIPTOR,
  getVehicleDescriptor,
  hasVehicleDescriptor,
  recomputeDescriptorBoostOutlets,
  registerVehicleDescriptor,
  type VehicleDescriptor,
} from '../../ui-core/config/vehicleTunerConfig.ts';
import {
  INSIDIO_DESCRIPTOR,
  RYZA_DESCRIPTOR,
} from '../../ui-core/config/vehicleDescriptorsConfig.ts';
import {
  OCTANE_DESCRIPTOR,
  DOMINUS_DESCRIPTOR,
  BREAKOUT_MINI_DESCRIPTOR,
  SENTINEL_DESCRIPTOR,
  MERC_DESCRIPTOR,
  TRIOCTANE_DESCRIPTOR,
  TRIOCTANE_THREEWHEEL_DESCRIPTOR,
} from '../../ui-core/config/vehicleExtendedDescriptorsConfig.ts';
import {
  computeObject3DBounds,
  getCachedCustomVehicleAsset,
  normalizeCustomVehicleScene,
  scaleSceneGeometries,
  setCachedCustomVehicleAsset,
  type CustomGlbVehicleAsset,
  type UnscaledGlbBounds,
} from './customGlbCarModel.ts';
import {
  classifyCustomVehicleMaterialSlot,
  type StandardVehicleMaterialSlot,
} from './customGlbVehicleMaterials.ts';

export interface CustomGlbMaterialBindingEntry {
  meshName: string;
  materialName: string;
  boundSlot: StandardVehicleMaterialSlot;
  isFallback: boolean;
}

export interface CustomGlbImportResult {
  vehicleId: string;
  label: string;
  fileName: string;
  alignPreset: string;
  appliedGeometryScale: number;
  unscaledBounds: UnscaledGlbBounds;
  scaledBounds: UnscaledGlbBounds;
  bindings: CustomGlbMaterialBindingEntry[];
  fallbackMaterials: string[];
}

function cloneDescriptorSnapshot(desc: VehicleDescriptor): VehicleDescriptor {
  return {
    ...desc,
    rawBounds: {
      ...desc.rawBounds,
      min: [...desc.rawBounds.min] as [number, number, number],
      max: [...desc.rawBounds.max] as [number, number, number],
      center: [...desc.rawBounds.center] as [number, number, number],
    },
    alignment: {
      ...desc.alignment,
      centerOffset: [...desc.alignment.centerOffset] as [number, number, number],
    },
    wheelNames: [...desc.wheelNames],
    wheelAnchors: desc.wheelAnchors.map((w) => [...w] as [number, number, number]),
    suspensionHeights: [...desc.suspensionHeights] as [number, number, number, number],
    boostOutlets: desc.boostOutlets.map((b) => [...b] as [number, number, number]),
    boostNozzleParams: { ...desc.boostNozzleParams },
  };
}

export const CANONICAL_VEHICLE_PRESET_TEMPLATES: Readonly<Record<string, VehicleDescriptor>> =
  Object.freeze({
    fennec: cloneDescriptorSnapshot(FENNEC_DESCRIPTOR),
    octane: cloneDescriptorSnapshot(OCTANE_DESCRIPTOR),
    insidio: cloneDescriptorSnapshot(INSIDIO_DESCRIPTOR),
    ryza: cloneDescriptorSnapshot(RYZA_DESCRIPTOR),
    dominus: cloneDescriptorSnapshot(DOMINUS_DESCRIPTOR),
    'breakout-mini': cloneDescriptorSnapshot(BREAKOUT_MINI_DESCRIPTOR),
    sentinel: cloneDescriptorSnapshot(SENTINEL_DESCRIPTOR),
    merc: cloneDescriptorSnapshot(MERC_DESCRIPTOR),
    trioctane: cloneDescriptorSnapshot(TRIOCTANE_DESCRIPTOR),
    'trioctane-threewheel': cloneDescriptorSnapshot(TRIOCTANE_THREEWHEEL_DESCRIPTOR),
  });

export function getCanonicalVehiclePresetTemplate(presetId: string): VehicleDescriptor | null {
  const key = String(presetId || '')
    .toLowerCase()
    .trim();
  return CANONICAL_VEHICLE_PRESET_TEMPLATES[key] || null;
}

export function inspectGlbMaterialsAndLogFallbacks(
  scene: CustomGlbVehicleAsset['scene'],
  vehicleId: string,
  fileName: string
): { bindings: CustomGlbMaterialBindingEntry[]; fallbackMaterials: string[] } {
  const bindings: CustomGlbMaterialBindingEntry[] = [];
  const fallbackSet = new Set<string>();

  scene.traverse?.(
    (node: {
      isMesh?: boolean;
      name?: string;
      userData?: Record<string, unknown>;
      material?: { name?: string } | Array<{ name?: string }>;
    }) => {
      if (!node.isMesh) return;
      if (
        node.name === 'boost-nozzle-gizmo' ||
        node.name === 'car-hitbox' ||
        node.name === 'car-hitbox-wireframe'
      ) {
        return;
      }
      const rawMatName = String(
        node.userData?.originalMaterialName ||
          (Array.isArray(node.material) ? node.material[0]?.name : node.material?.name) ||
          ''
      ).trim();
      const { slot, isFallback } = classifyCustomVehicleMaterialSlot(rawMatName);
      bindings.push({
        meshName: node.name || 'unnamed-mesh',
        materialName: rawMatName || '<unnamed>',
        boundSlot: slot,
        isFallback,
      });
      if (isFallback) {
        fallbackSet.add(rawMatName || '<unnamed>');
        console.warn(
          `[CustomGlbImport] Unrecognized material "${rawMatName || '<unnamed>'}" on mesh "${node.name || 'unnamed-mesh'}" in "${fileName}" (target "${vehicleId}"); falling back to default "body" slot.`
        );
      }
    }
  );

  return {
    bindings,
    fallbackMaterials: Array.from(fallbackSet),
  };
}

/**
 * Applies either `'auto'` (Auto-Fit bounds to ~140 UU length and center on hitbox)
 * or a known vehicle preset (`fennec`, `insidio`, `ryza`, `dominus`, `breakout-mini`,
 * `sentinel`, `merc`, `trioctane`, `trioctane-threewheel`) to the target vehicle descriptor
 * and its loaded GLB asset.
 */
export function applyVehicleAlignPresetToDescriptor(
  targetVehicleId: string,
  alignPreset: string
): { appliedGeometryScale: number; scaledBounds: UnscaledGlbBounds } | null {
  const targetId = String(targetVehicleId || '')
    .toLowerCase()
    .trim();
  const descriptor = getVehicleDescriptor(targetId);
  if (!descriptor) return null;

  const asset = getCachedCustomVehicleAsset(targetId);
  const presetKey = String(alignPreset || 'auto')
    .toLowerCase()
    .trim();
  const template = presetKey !== 'auto' ? getCanonicalVehiclePresetTemplate(presetKey) : null;

  const canonicalSelfTemplate = getCanonicalVehiclePresetTemplate(targetId);
  const isImportedCustomGlb = !descriptor.modelUrl && !canonicalSelfTemplate;
  const nativeUnitScale = canonicalSelfTemplate?.unitScale ?? descriptor.unitScale ?? 1;
  const unscaledLen = asset?.unscaledBounds?.length || descriptor.rawBounds.length || 140;

  let targetGeometryScale = nativeUnitScale;
  if (isImportedCustomGlb) {
    if (presetKey === 'auto') {
      targetGeometryScale = unscaledLen > 0.0001 ? Number((140.0 / unscaledLen).toFixed(6)) : 1;
    } else if (template && unscaledLen > 0.0001) {
      const targetLen = template.rawBounds.length || 140.0;
      targetGeometryScale = Number((targetLen / unscaledLen).toFixed(6));
    }
  } else {
    // Built-in GLB models have a fixed authoring export scale (1 for UU exports like Fennec/Insidio/Sentinel,
    // 100 for meter exports like Octane/Merc/Dominus/Breakout/Ryza/TriOctane).
    // Never overwrite a built-in vehicle's geometry scale with another vehicle's export unitScale.
    targetGeometryScale = nativeUnitScale;
  }

  if (asset && asset.scene) {
    const prevScale =
      asset.appliedGeometryScale && asset.appliedGeometryScale > 0 ? asset.appliedGeometryScale : 1;
    const deltaFactor = targetGeometryScale / prevScale;
    scaleSceneGeometries(asset.scene, deltaFactor);
    Object.assign(asset, {
      appliedGeometryScale: targetGeometryScale,
      alignPreset: presetKey,
    });
  }

  const scaledBounds = asset?.scene
    ? computeObject3DBounds(asset.scene)
    : {
        min: [...descriptor.rawBounds.min] as [number, number, number],
        max: [...descriptor.rawBounds.max] as [number, number, number],
        length: descriptor.rawBounds.length,
        height: descriptor.rawBounds.height,
        width: descriptor.rawBounds.width,
        center: [...descriptor.rawBounds.center] as [number, number, number],
        roofTopY: descriptor.rawBounds.roofTopY,
      };

  const r2 = (n: number) => Number(n.toFixed(2));

  if (presetKey === 'auto' || !template) {
    const activeHitboxKey = descriptor.hitboxPreset || 'hitbox-octane';
    const hitboxSpec = HITBOX_PRESETS[activeHitboxKey] || HITBOX_PRESETS['hitbox-octane'];
    const rlTopY = Number((hitboxSpec.up + hitboxSpec.height * 0.5).toFixed(4));
    Object.assign(descriptor, {
      unitScale: targetGeometryScale,
      rawBounds: {
        ...scaledBounds,
        rlHitboxTopY: rlTopY,
      },
      alignment: {
        scale: 1.0,
        scaleX: 1.0,
        scaleY: 1.0,
        scaleZ: 1.0,
        centerOffset: [
          r2(hitboxSpec.forward - scaledBounds.center[0]),
          r2(hitboxSpec.up - scaledBounds.center[1]),
          r2(-scaledBounds.center[2]),
        ] as [number, number, number],
      },
    });
    recomputeDescriptorBoostOutlets(descriptor);
    return { appliedGeometryScale: targetGeometryScale, scaledBounds };
  }

  const hitboxSpec = HITBOX_PRESETS[template.hitboxPreset] || HITBOX_PRESETS['hitbox-octane'];
  const rlTopY = Number((hitboxSpec.up + hitboxSpec.height * 0.5).toFixed(4));
  const isCrossTemplate = isImportedCustomGlb || presetKey !== targetId;
  const resolvedCenterOffset: [number, number, number] = isCrossTemplate
    ? [
        r2(
          template.rawBounds.center[0] - scaledBounds.center[0] + template.alignment.centerOffset[0]
        ),
        r2(
          template.rawBounds.center[1] - scaledBounds.center[1] + template.alignment.centerOffset[1]
        ),
        r2(
          template.rawBounds.center[2] - scaledBounds.center[2] + template.alignment.centerOffset[2]
        ),
      ]
    : ([...template.alignment.centerOffset] as [number, number, number]);

  Object.assign(descriptor, {
    unitScale: targetGeometryScale,
    hitboxPreset: template.hitboxPreset,
    threeWheels: Boolean(template.threeWheels),
    rawBounds: {
      ...scaledBounds,
      rlHitboxTopY: template.rawBounds.rlHitboxTopY || rlTopY,
    },
    alignment: {
      scale: template.alignment.scale,
      scaleX: template.alignment.scaleX,
      scaleY: template.alignment.scaleY,
      scaleZ: template.alignment.scaleZ,
      centerOffset: resolvedCenterOffset,
    },
    wheelAnchors: template.wheelAnchors.map((w) => [...w] as [number, number, number]),
    suspensionHeights: [...template.suspensionHeights] as [number, number, number, number],
    boostNozzleParams: { ...template.boostNozzleParams },
  });
  recomputeDescriptorBoostOutlets(descriptor);

  return { appliedGeometryScale: targetGeometryScale, scaledBounds };
}

function allocateImportedGlbDescriptor(
  requestedId: string,
  fileName: string,
  alignPreset: string
): VehicleDescriptor {
  const rawBase =
    String(fileName || 'Custom')
      .replace(/\.(glb|gltf)$/i, '')
      .trim() || 'Custom';
  const slug =
    rawBase
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'model';

  const normalizedReq = String(requestedId || '')
    .toLowerCase()
    .trim();
  const isCanonicalPreset = Boolean(CANONICAL_VEHICLE_PRESET_TEMPLATES[normalizedReq]);

  let resolvedId: string;
  let resolvedLabel = rawBase;

  if (
    normalizedReq &&
    normalizedReq !== 'new' &&
    !isCanonicalPreset &&
    !hasVehicleDescriptor(normalizedReq)
  ) {
    resolvedId = normalizedReq;
  } else {
    const baseCandidate = slug.startsWith('custom-') ? slug : `custom-${slug}`;
    if (
      !hasVehicleDescriptor(baseCandidate) &&
      !CANONICAL_VEHICLE_PRESET_TEMPLATES[baseCandidate]
    ) {
      resolvedId = baseCandidate;
    } else {
      let suffix = 2;
      while (
        hasVehicleDescriptor(`${baseCandidate}-${suffix}`) ||
        CANONICAL_VEHICLE_PRESET_TEMPLATES[`${baseCandidate}-${suffix}`]
      ) {
        suffix++;
      }
      resolvedId = `${baseCandidate}-${suffix}`;
      resolvedLabel = `${rawBase} #${suffix}`;
    }
  }

  const presetKey = String(alignPreset || 'auto')
    .toLowerCase()
    .trim();
  const baseTemplate =
    (presetKey !== 'auto' ? getCanonicalVehiclePresetTemplate(presetKey) : null) ||
    getCanonicalVehiclePresetTemplate(normalizedReq) ||
    getVehicleDescriptor(normalizedReq) ||
    FENNEC_DESCRIPTOR;

  const newDescriptor: VehicleDescriptor = {
    ...cloneDescriptorSnapshot(baseTemplate),
    id: resolvedId,
    name: resolvedLabel,
    aliases: [],
    modelUrl: '',
  };
  registerVehicleDescriptor(newDescriptor);
  return newDescriptor;
}

/**
 * Parses an uploaded `.glb` ArrayBuffer, registers a new selectable custom vehicle descriptor,
 * normalizes its lamp meshes, logs any unrecognized material names to `console.warn`
 * (falling back to `body`), caches the asset, and applies the requested `alignPreset` (`'auto'` by default).
 */
export async function importCustomVehicleGlbBuffer(
  targetVehicleId: string,
  arrayBuffer: ArrayBuffer,
  fileName = 'custom.glb',
  alignPreset = 'auto'
): Promise<CustomGlbImportResult> {
  const descriptor = allocateImportedGlbDescriptor(targetVehicleId, fileName, alignPreset);
  const targetId = descriptor.id;
  const loader = new GLTFLoader();
  const gltf = await loader.parseAsync(arrayBuffer, '');
  gltf.scene.updateMatrixWorld?.(true);

  const { unscaledBounds } = normalizeCustomVehicleScene(gltf.scene, targetId, 1);
  const { bindings, fallbackMaterials } = inspectGlbMaterialsAndLogFallbacks(
    gltf.scene,
    targetId,
    fileName
  );

  const asset: CustomGlbVehicleAsset = {
    id: targetId,
    scene: gltf.scene,
    fileName,
    alignPreset,
    appliedGeometryScale: 1,
    unscaledBounds,
  };
  setCachedCustomVehicleAsset(targetId, asset);

  const presetResult = applyVehicleAlignPresetToDescriptor(targetId, alignPreset);
  const scaledBounds = presetResult?.scaledBounds || computeObject3DBounds(gltf.scene);
  const appliedGeometryScale = presetResult?.appliedGeometryScale ?? 1;

  return {
    vehicleId: targetId,
    label: descriptor.name,
    fileName,
    alignPreset,
    appliedGeometryScale,
    unscaledBounds,
    scaledBounds,
    bindings,
    fallbackMaterials,
  };
}
