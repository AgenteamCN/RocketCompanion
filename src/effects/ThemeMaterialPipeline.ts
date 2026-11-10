import * as THREE from 'three';
/**
 * src/effects/ThemeMaterialPipeline.ts
 * Dual-Theme Material & Cel-Shading Pipeline (Phase 7.6 Deobfuscation)
 *
 * Provides reactive multi-theme material pairing (Arcade cel-shading toon ramp vs Realistic PBR),
 * material conversion for arcade rendering, and automatic scene hierarchy tracking synchronized
 * with ThemeManager.
 *
 * Module exports:
 * - createMultiThemeMaterial
 * - getThemeMaterial
 * - isMultiThemeMaterial
 * - resolveThemeMaterial
 * - registerThemeSubtree
 * - getArcadeLightRampTexture
 * - createCelShadedToonMaterial
 * - applyArcadeCelShading
 */

import { getTheme, onThemeChange } from '../ui-core/config/themeConfig.ts';
import { getMaterialsConfig } from '../ui-core/config/materialsConfig.ts';

export type ThemeVariantKey = 'arcade' | 'cartoon' | 'realistic' | 'anodized' | string;

export interface MultiThemeMaterialPair {
  arcade: THREE.Material;
  cartoon: THREE.Material;
  realistic: THREE.Material;
  anodized: THREE.Material;
  [themeKey: string]: THREE.Material | undefined;
}

export interface VisualMaterialsConfigLike {
  carPaint?: string;
}

export interface ThemeSyncArenaPort {
  refreshCustomVehicle?: () => void;
  markRenderTreeChanged?: () => void;
}

export interface ThemeSyncRuntimePort {
  applyVisualMaterialsConfig?: ((config: VisualMaterialsConfigLike) => void) | unknown;
  syncPlayerMaterialsLoadout?: ((config: VisualMaterialsConfigLike) => void) | unknown;
  arena?: ThemeSyncArenaPort | null | unknown;
}

// Multi-theme material registry
// Maps material variant -> { arcade: Material, realistic: Material }
const multiThemeMaterialMap = new WeakMap<object, MultiThemeMaterialPair>();

// Tracked scene meshes with WeakRef to prevent memory leaks
const trackedThemeMeshes = new Set<WeakRef<THREE.Mesh>>();
const visitedMeshes = new WeakSet<object>();

/**
 * Pairs an arcade-styled material and a realistic material together.
 * Returns the material variant corresponding to the currently active theme.
 *
 * @param {object} arcadeMat
 * @param {object} realisticMat
 * @returns {object} The active theme's material variant
 */
export function createMultiThemeMaterial(
  arcadeMat: THREE.Material,
  realisticMat: THREE.Material
): THREE.Material {
  const pair: MultiThemeMaterialPair = {
    arcade: arcadeMat,
    cartoon: arcadeMat,
    realistic: realisticMat,
    anodized: realisticMat,
  };
  if (arcadeMat && typeof arcadeMat === 'object') multiThemeMaterialMap.set(arcadeMat, pair);
  if (realisticMat && typeof realisticMat === 'object')
    multiThemeMaterialMap.set(realisticMat, pair);

  const activeTheme = getTheme();
  return pair[activeTheme] || realisticMat || arcadeMat;
}

/**
 * Returns the requested theme's material variant from a multi-theme material pair.
 * If material is not registered as a multi-theme material, returns the original material.
 *
 * @param {object} material
 * @param {string} themeName 'cartoon' | 'anodized' | 'arcade' | 'realistic'
 * @returns {object}
 */
export function getThemeMaterial<TMat extends THREE.Material | null | undefined>(
  material: TMat,
  themeName: ThemeVariantKey
): TMat {
  if (!material || typeof material !== 'object') return material;
  const pair = multiThemeMaterialMap.get(material);
  return pair && pair[themeName] ? (pair[themeName] as TMat) : material;
}

/**
 * Checks whether the given material is registered as a multi-theme material.
 *
 * @param {object} material
 * @returns {boolean}
 */
export function isMultiThemeMaterial(material: THREE.Material | null | undefined): boolean {
  return material && typeof material === 'object' ? multiThemeMaterialMap.has(material) : false;
}

/**
 * Resolves a material or an array of materials to the specified theme variant.
 *
 * @param {object|object[]} materialOrArray
 * @param {string} themeName 'arcade' | 'realistic'
 * @returns {object|object[]}
 */
export function resolveThemeMaterial(
  materialOrArray: THREE.Material | THREE.Material[],
  themeName: ThemeVariantKey
): THREE.Material | THREE.Material[] {
  if (!Array.isArray(materialOrArray)) {
    return getThemeMaterial(materialOrArray, themeName);
  }
  const resolved: THREE.Material[] = [];
  for (let i = 0; i < materialOrArray.length; i++) {
    resolved.push(getThemeMaterial(materialOrArray[i], themeName));
  }
  return resolved;
}

/**
 * Traverses an Object3D hierarchy and registers all meshes that have multi-theme materials.
 * Ignores UI indicators and hitboxes.
 * Updates material on initial registration and tracks mesh via WeakRef for subsequent theme changes.
 *
 * @param {object} rootObject
 */
export function registerThemeSubtree(rootObject: THREE.Object3D | null | undefined): void {
  if (!rootObject || typeof rootObject.traverse !== 'function') return;

  const { Mesh } = THREE;
  const currentTheme = getTheme();

  rootObject.traverse((node) => {
    // Skip special non-theme visual meshes
    let p: THREE.Object3D | null = node;
    while (p) {
      if (
        p.name === 'flip-reset-indicator' ||
        p.name === 'realistic-reset-pulse' ||
        p.name === 'car-hitbox' ||
        p.name === 'solid-cylinder-wheel'
      ) {
        return;
      }
      p = p.parent;
    }

    const meshNode = node as THREE.Mesh;
    const isMeshNode = node instanceof Mesh || meshNode.isMesh;
    if (!isMeshNode || visitedMeshes.has(meshNode)) return;

    const materials = Array.isArray(meshNode.material) ? meshNode.material : [meshNode.material];
    const hasMultiTheme = materials.some(isMultiThemeMaterial);

    if (hasMultiTheme) {
      visitedMeshes.add(meshNode);
      trackedThemeMeshes.add(new WeakRef(meshNode));
      meshNode.material = resolveThemeMaterial(meshNode.material, currentTheme);
    }
  });
}

// Subscribe to global theme change events to hot-swap materials on all live meshes
onThemeChange((newTheme) => {
  for (const weakRef of trackedThemeMeshes) {
    const mesh = weakRef.deref();
    if (mesh) {
      mesh.material = resolveThemeMaterial(mesh.material, newTheme);
    } else {
      trackedThemeMeshes.delete(weakRef);
    }
  }
});

// Cached 4-pixel cel-shading light ramp gradient texture
let cachedLightRamp: THREE.DataTexture | null = null;

/**
 * Returns the singleton 4-pixel arcade cel-shading ramp DataTexture.
 * RGBA values: [28, 90, 170, 255]
 */
export function getArcadeLightRampTexture(): THREE.DataTexture {
  if (!cachedLightRamp) {
    const { DataTexture, RedFormat, NearestFilter } = THREE;
    const data = new Uint8Array([28, 90, 170, 255]);
    const format = (RedFormat ?? 1028) as THREE.PixelFormat;
    cachedLightRamp = new DataTexture(data, 4, 1, format);
    cachedLightRamp.name = 'Arcade / painted light ramp';
    cachedLightRamp.minFilter = NearestFilter;
    cachedLightRamp.magFilter = NearestFilter;
    cachedLightRamp.generateMipmaps = false;
    cachedLightRamp.needsUpdate = true;
  }
  return cachedLightRamp;
}

/**
 * Creates a MeshToonMaterial with the arcade cel light ramp assigned as its gradientMap.
 *
 * @param {object} params
 * @returns {object} MeshToonMaterial instance
 */
export function createCelShadedToonMaterial(
  params: THREE.MeshToonMaterialParameters = {}
): THREE.MeshToonMaterial {
  return new THREE.MeshToonMaterial({
    ...params,
    gradientMap: getArcadeLightRampTexture(),
  });
}

/**
 * Traverses a 3D hierarchy and automatically converts standard PBR materials into
 * paired dual-theme (Arcade cel-shading Toon / Realistic Standard) materials.
 *
 * @param {object} rootObject
 */
export function applyArcadeCelShading(rootObject: THREE.Object3D | null | undefined): void {
  if (!rootObject || typeof rootObject.traverse !== 'function') return;

  const { Mesh, MeshStandardMaterial, MeshPhysicalMaterial, Material } = THREE;

  const convertMaterial = (mat: THREE.Material): THREE.Material => {
    if (!mat) return mat;
    if (isMultiThemeMaterial(mat)) {
      return getThemeMaterial(mat, getTheme());
    }

    const stdMat = mat as THREE.MeshStandardMaterial & { isMeshStandardMaterial?: boolean };
    const physMat = mat as THREE.MeshPhysicalMaterial & { isMeshPhysicalMaterial?: boolean };
    const isStandard =
      mat instanceof MeshStandardMaterial || Boolean(stdMat.isMeshStandardMaterial);
    const isPhysical =
      mat instanceof MeshPhysicalMaterial || Boolean(physMat.isMeshPhysicalMaterial);

    // Do not convert transparent, transmission glass, or custom shader materials
    if (!isStandard || mat.transparent) return mat;
    if (isPhysical && physMat.transmission > 0) return mat;
    if (Material.prototype && mat.onBeforeCompile !== Material.prototype.onBeforeCompile)
      return mat;

    const toonMat = createCelShadedToonMaterial({});

    // Copy core standard material properties
    if (Material.prototype && typeof Material.prototype.copy === 'function') {
      Material.prototype.copy.call(toonMat, mat);
    } else if (typeof toonMat.copy === 'function') {
      toonMat.copy(mat);
    }

    if (stdMat.color && toonMat.color && typeof toonMat.color.copy === 'function')
      toonMat.color.copy(stdMat.color);
    if (stdMat.emissive && toonMat.emissive && typeof toonMat.emissive.copy === 'function')
      toonMat.emissive.copy(stdMat.emissive);
    toonMat.emissiveIntensity = stdMat.emissiveIntensity;
    toonMat.map = stdMat.map;
    toonMat.alphaMap = stdMat.alphaMap;
    toonMat.aoMap = stdMat.aoMap;
    toonMat.aoMapIntensity = stdMat.aoMapIntensity;
    toonMat.lightMap = stdMat.lightMap;
    toonMat.lightMapIntensity = stdMat.lightMapIntensity;
    toonMat.emissiveMap = stdMat.emissiveMap;
    toonMat.normalMap = stdMat.normalMap;
    toonMat.normalMapType = stdMat.normalMapType;
    if (
      stdMat.normalScale &&
      toonMat.normalScale &&
      typeof toonMat.normalScale.copy === 'function'
    ) {
      toonMat.normalScale.copy(stdMat.normalScale);
      if (typeof toonMat.normalScale.multiplyScalar === 'function') {
        toonMat.normalScale.multiplyScalar(0.2);
      }
    }
    (toonMat as THREE.MeshToonMaterial & { flatShading?: boolean }).flatShading =
      stdMat.flatShading;
    toonMat.fog = stdMat.fog;
    toonMat.wireframe = stdMat.wireframe;
    toonMat.wireframeLinewidth = stdMat.wireframeLinewidth;

    return createMultiThemeMaterial(toonMat, mat);
  };

  rootObject.traverse((node) => {
    // Skip special non-theme subtrees (indicators, hitboxes)
    let p: THREE.Object3D | null = node;
    while (p) {
      if (
        p.name === 'flip-reset-indicator' ||
        p.name === 'realistic-reset-pulse' ||
        p.name === 'car-hitbox' ||
        p.name === 'solid-cylinder-wheel'
      ) {
        return;
      }
      p = p.parent;
    }

    const meshNode = node as THREE.Mesh;
    const isMeshNode = node instanceof Mesh || meshNode.isMesh;
    if (isMeshNode && meshNode.material) {
      meshNode.material = Array.isArray(meshNode.material)
        ? meshNode.material.map(convertMaterial)
        : convertMaterial(meshNode.material);
    }
  });

  registerThemeSubtree(rootObject);
}

export function cloneMaterial(
  params:
    (THREE.MeshToonMaterialParameters & { clone?: () => THREE.Material }) | THREE.Material = {}
): THREE.Material {
  if (params && typeof (params as THREE.Material).clone === 'function') {
    return (params as THREE.Material).clone();
  }
  return createCelShadedToonMaterial(params as THREE.MeshToonMaterialParameters);
}

function isVehicleMesh(mesh: THREE.Object3D | null | undefined): boolean {
  let curr: THREE.Object3D | null | undefined = mesh;
  while (curr) {
    if (curr.userData?.vehicleId) {
      return true;
    }
    const n = (curr.name || '').toLowerCase();
    if (
      n.includes('car') ||
      n.includes('chassis') ||
      n.includes('vehicle') ||
      n.includes('body') ||
      n.includes('shell') ||
      n.includes('octane') ||
      n.includes('dominus') ||
      n.includes('breakout') ||
      n.includes('hybrid') ||
      n.includes('plank') ||
      n.includes('merc')
    ) {
      if (!n.includes('stadium') && !n.includes('arena')) {
        return true;
      }
    }
    curr = curr.parent;
  }
  return false;
}

/**
 * Updates tracked meshes according to fine-grained visual materials configuration
 * (carPaint: 'cartoon' | 'anodized'; wheels fixed to cartoon).
 */
export function applyVisualMaterialsConfig(
  materialsConfig: VisualMaterialsConfigLike | null | undefined
): void {
  if (!materialsConfig) return;
  for (const weakRef of trackedThemeMeshes) {
    const mesh = weakRef.deref();
    if (!mesh) {
      trackedThemeMeshes.delete(weakRef);
      continue;
    }
    const name = ((mesh.name || '') + ' ' + (mesh.parent?.name || '')).toLowerCase();
    let themeToUse = 'cartoon';
    if (name.includes('wheel') || name.includes('tire') || name.includes('rim')) {
      // Wheels are locked to cartoon styling
      themeToUse = 'cartoon';
    } else if (isVehicleMesh(mesh)) {
      themeToUse = materialsConfig.carPaint || 'cartoon';
    } else {
      themeToUse = 'realistic';
    }
    mesh.material = resolveThemeMaterial(mesh.material, themeToUse);
  }
}

export function syncMaterialsToGame(
  gameRuntime: ThemeSyncRuntimePort | null | undefined,
  materialsConfig?: VisualMaterialsConfigLike | null
): void {
  if (!gameRuntime) return;
  const config = materialsConfig || getMaterialsConfig();
  if (typeof gameRuntime.applyVisualMaterialsConfig === 'function') {
    gameRuntime.applyVisualMaterialsConfig(config);
  }
  if (typeof gameRuntime.syncPlayerMaterialsLoadout === 'function') {
    gameRuntime.syncPlayerMaterialsLoadout(config);
  }
  const arena = gameRuntime.arena as ThemeSyncArenaPort | null | undefined;
  arena?.refreshCustomVehicle?.();
  if (arena?.markRenderTreeChanged) {
    arena.markRenderTreeChanged();
  }
}
