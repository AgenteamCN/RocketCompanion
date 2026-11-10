import { FENNEC_DESCRIPTOR } from '../../ui-core/config/vehicleTunerConfig.ts';
const DEFAULT_CAR_COLORS = FENNEC_DESCRIPTOR.colors.default;
import * as THREE from 'three';
import {
  createMultiThemeMaterial,
  registerThemeSubtree,
  createCelShadedToonMaterial,
} from '../../effects/ThemeMaterialPipeline.ts';

import {
  anodizedPaintTuning,
  subscribeAnodizedPaintTuning,
} from '../../ui-core/config/vehicleTunerConfig.ts';

const customToonRampCache = new Map();

/**
 * Generates a customizable 1D cel-shading gradient DataTexture for Toon surfaces.
 */
export function buildCustomToonRampTexture(
  steps = 4,
  shadowMin = 0.11,
  highlightMax = 1.0,
  smooth = false
) {
  const clampedSteps = Math.max(2, Math.min(8, Math.round(steps || 4)));
  const minVal = Math.max(0, Math.min(1, Number(shadowMin ?? 0.11)));
  const maxVal = Math.max(minVal, Math.min(1.5, Number(highlightMax ?? 1.0)));
  const isSmooth = Boolean(smooth);
  const key = `${clampedSteps}:${minVal.toFixed(3)}:${maxVal.toFixed(3)}:${isSmooth ? 1 : 0}`;
  if (customToonRampCache.has(key)) {
    return customToonRampCache.get(key);
  }

  const { DataTexture, RedFormat, NearestFilter, LinearFilter } = THREE;
  const data = new Uint8Array(clampedSteps);
  for (let i = 0; i < clampedSteps; i++) {
    const t = clampedSteps === 1 ? 1 : i / (clampedSteps - 1);
    const val = minVal + (maxVal - minVal) * t;
    data[i] = Math.max(0, Math.min(255, Math.round(val * 255)));
  }

  const format = RedFormat ?? 1028;
  const tex = new DataTexture(data, clampedSteps, 1, format);
  tex.name = `CustomToonRamp(${key})`;
  tex.minFilter = isSmooth ? LinearFilter : NearestFilter;
  tex.magFilter = isSmooth ? LinearFilter : NearestFilter;
  tex.needsUpdate = true;
  customToonRampCache.set(key, tex);
  return tex;
}

const carPaintCache = new Map<any, any>();
const activeAnodizedMaterials = new Set<any>();

subscribeAnodizedPaintTuning((patch) => {
  for (const entry of activeAnodizedMaterials) {
    const { mat, uniforms } = entry;
    if (!mat) continue;
    if (patch.roughness !== undefined) mat.roughness = patch.roughness;
    if (patch.metalness !== undefined) mat.metalness = patch.metalness;
    if (patch.clearcoat !== undefined) mat.clearcoat = patch.clearcoat;
    if (patch.clearcoatRoughness !== undefined) mat.clearcoatRoughness = patch.clearcoatRoughness;
    if (patch.sheen !== undefined) mat.sheen = patch.sheen;
    if (patch.sheenRoughness !== undefined) mat.sheenRoughness = patch.sheenRoughness;
    if (patch.envMapIntensity !== undefined) mat.envMapIntensity = patch.envMapIntensity;
    if (uniforms) {
      if (patch.pearlFresnelPower !== undefined && uniforms.uPearlFresnelPower) {
        uniforms.uPearlFresnelPower.value = patch.pearlFresnelPower;
      }
      if (patch.pearlBlendStrength !== undefined && uniforms.uPearlBlendStrength) {
        uniforms.uPearlBlendStrength.value = patch.pearlBlendStrength;
      }
    }
    mat.needsUpdate = true;
  }
});

/**
 * Creates dual-theme vehicle paint and hardware materials.
 * Includes anodized pearl clearcoat shader and cartoon toon material.
 */
export function createCarPaintMaterial(teamColor, options = DEFAULT_CAR_COLORS) {
  let opts = options;
  let color = teamColor;

  if (typeof color === 'number' && (!opts || opts === DEFAULT_CAR_COLORS)) {
    opts = { primary: color, realisticPrimary: color, pearl: color };
  } else if (
    typeof color === 'object' &&
    color !== null &&
    (!opts || opts === DEFAULT_CAR_COLORS)
  ) {
    opts = color;
  }
  if (!opts) opts = DEFAULT_CAR_COLORS;

  const primary = opts.primary;
  const realisticPrimary = opts.realisticPrimary ?? primary;
  const pearl = opts.pearl ?? primary;
  const cacheKey = `${primary}/${realisticPrimary}/${pearl}`;

  const cached = carPaintCache.get(cacheKey);
  if (cached) return cached;

  const { Color, MeshPhysicalMaterial, MeshStandardMaterial, MeshBasicMaterial } = THREE;
  const multiThemeMaterial = createMultiThemeMaterial;
  const cloneMaterial = createCelShadedToonMaterial;

  const pearlColor = new Color(pearl);
  const anodizedPearlPaint = new MeshPhysicalMaterial({
    name: 'Anodized / pearl paint',
    color: realisticPrimary,
    roughness: anodizedPaintTuning.roughness,
    metalness: anodizedPaintTuning.metalness,
    clearcoat: anodizedPaintTuning.clearcoat,
    clearcoatRoughness: anodizedPaintTuning.clearcoatRoughness,
    sheen: anodizedPaintTuning.sheen,
    sheenColor: pearlColor,
    sheenRoughness: anodizedPaintTuning.sheenRoughness,
    envMapIntensity: anodizedPaintTuning.envMapIntensity,
  });

  const pearlUniforms = {
    pearlColor: { value: pearlColor },
    uPearlFresnelPower: { value: anodizedPaintTuning.pearlFresnelPower },
    uPearlBlendStrength: { value: anodizedPaintTuning.pearlBlendStrength },
  };

  anodizedPearlPaint.onBeforeCompile = (shader) => {
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
        `uniform vec3 diffuse;\nuniform vec3 pearlColor;\nuniform float uPearlFresnelPower;\nuniform float uPearlBlendStrength;`
      );
  };
  anodizedPearlPaint.customProgramCacheKey = () => 'game-car-anodized-pearl-v2';
  activeAnodizedMaterials.add({ mat: anodizedPearlPaint, uniforms: pearlUniforms });

  const cartoonPaint = cloneMaterial
    ? cloneMaterial({
        name: 'Cartoon / body paint',
        color: primary,
      })
    : new MeshStandardMaterial({
        name: 'Cartoon / body paint',
        color: primary,
      });

  const bodyMaterial =
    typeof multiThemeMaterial === 'function'
      ? multiThemeMaterial(cartoonPaint, anodizedPearlPaint)
      : anodizedPearlPaint;

  const cartoonWheelMetal = cloneMaterial
    ? cloneMaterial({ color: 3754339 })
    : new MeshStandardMaterial({ color: 3754339 });
  const anodizedWheelMetal = new MeshPhysicalMaterial({
    color: 2435633,
    roughness: 0.24,
    metalness: 0.94,
    clearcoat: 0.32,
    clearcoatRoughness: 0.18,
  });

  const cartoonTire = cloneMaterial
    ? cloneMaterial({ color: 1119000 })
    : new MeshStandardMaterial({ color: 1119000 });
  const anodizedTire = new MeshStandardMaterial({
    color: 1119000,
    roughness: 0.92,
    metalness: 0.02,
  });

  const cartoonLowerDetail = cloneMaterial
    ? cloneMaterial({ color: 1514274 })
    : new MeshStandardMaterial({ color: 1514274 });
  const anodizedLowerDetail = new MeshStandardMaterial({
    color: 1514274,
    roughness: 0.4,
    metalness: 0.78,
  });

  const palette = {
    wheelMetal:
      typeof multiThemeMaterial === 'function'
        ? multiThemeMaterial(cartoonWheelMetal, anodizedWheelMetal)
        : anodizedWheelMetal,
    tire:
      typeof multiThemeMaterial === 'function'
        ? multiThemeMaterial(cartoonTire, anodizedTire)
        : anodizedTire,
    lowerDetail:
      typeof multiThemeMaterial === 'function'
        ? multiThemeMaterial(cartoonLowerDetail, anodizedLowerDetail)
        : anodizedLowerDetail,
    lamps: new MeshBasicMaterial({ color: 14153727, toneMapped: false }),
    tailLamps: new MeshBasicMaterial({ color: 13970226, toneMapped: false }),
    body: bodyMaterial,
  };

  carPaintCache.set(cacheKey, palette);
  return palette;
}

/**
 * Maps original submesh material name to the themed vehicle palette.
 */
export function mapVehicleMaterial(mat, palette, mesh) {
  const name = mesh?.userData?.originalMaterialName || mat?.name || '';
  switch (name) {
    case 'wheel-metal':
    case 'Arcade / wheel metal':
    case 'Realistic / wheel metal':
      return palette.wheelMetal;
    case 'tire':
    case 'Arcade / tire':
    case 'Realistic / tire':
      return palette.tire;
    case 'lower-detail':
    case 'Arcade / lower detail':
    case 'Realistic / lower detail':
    case 'glass':
      return palette.lowerDetail;
    case 'lamps':
      return palette.lamps;
    case 'tail-lamps':
      return palette.tailLamps;
    case 'body-shell':
    case 'body-fill':
    case 'paint':
    case 'Arcade / body paint':
    case 'Cartoon / body paint':
    case 'Realistic / anodized pearl paint':
    case 'Anodized / pearl paint':
      return palette.body;
    default:
      if (
        mesh?.name &&
        (mesh.name.includes('body') || mesh.name.includes('shell') || mesh.name.includes('paint'))
      ) {
        return palette.body;
      }
      if (
        name.startsWith('Arcade / reset') ||
        name.startsWith('Realistic / reset') ||
        mat?.uniforms
      ) {
        return mat;
      }
      return palette.lowerDetail;
  }
}

let _vehicleReceiveShadows = false;

export function getVehicleReceiveShadows() {
  return _vehicleReceiveShadows;
}

export function setVehicleReceiveShadows(enabled) {
  _vehicleReceiveShadows = Boolean(enabled);
}

/**
 * Recursively applies vehicle paint & hardware materials across a submesh hierarchy.
 * Skips boost flames, particle puffs, hitboxes, and reset indicators so they never cast shadows.
 */
export function applyVehicleMaterials(root, palette) {
  const { Mesh } = THREE;
  const markMatrixDirty = registerThemeSubtree;
  root.traverse?.((node) => {
    let parent = node;
    while (parent) {
      const pname = parent.name || '';
      if (
        pname === 'flip-reset-indicator' ||
        pname === 'realistic-reset-pulse' ||
        pname === 'car-hitbox' ||
        pname === 'car-hitbox-wireframe' ||
        pname === 'solid-cylinder-wheel' ||
        pname.includes('boost') ||
        pname.includes('flame') ||
        pname.includes('puff') ||
        pname.includes('flare') ||
        pname.includes('flash') ||
        pname.startsWith('whitebox-')
      ) {
        return;
      }
      parent = parent.parent;
    }
    if (node instanceof Mesh || node.isMesh) {
      if (node.layers && node.layers.isEnabled(1) && !node.layers.isEnabled(0)) {
        return;
      }
      if (Array.isArray(node.material) && node.material.some((m) => m?.name === 'whitebox-rear')) {
        return;
      }
      if (!node.userData.originalMaterialName && node.material) {
        node.userData.originalMaterialName = Array.isArray(node.material)
          ? node.material[0]?.name || ''
          : node.material.name || '';
      }
      node.material = Array.isArray(node.material)
        ? node.material.map((mat) => mapVehicleMaterial(mat, palette, node))
        : mapVehicleMaterial(node.material, palette, node);
      node.castShadow = true;
      node.receiveShadow = _vehicleReceiveShadows;
    }
  });
  if (typeof markMatrixDirty === 'function') {
    markMatrixDirty(root);
  }
}

/**
 * Deep clones a vehicle mesh hierarchy and applies custom paint.
 */
export function cloneVehicleMeshWithPaint(mesh, teamColor, colorOptions) {
  const cloned = mesh.clone ? mesh.clone(true) : mesh;
  const palette = createCarPaintMaterial(teamColor, colorOptions);
  applyVehicleMaterials(cloned, palette);
  return cloned;
}
