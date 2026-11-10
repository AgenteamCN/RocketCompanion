import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { resolveAssetPath } from '../../utils/AssetResponseValidator.ts';
import { computeAllPadRotations } from '../../ui-core/config/boostPadGeometry.ts';
import {
  DEFAULT_BOOST_PAD_TUNER,
  prepareGlowGeometry,
  createUpwardGlowMaterial,
  createBigOrbShadowMesh,
  createFallbackPadMeshes,
  cloneModelWithMaterials,
} from './BoostPadShadersAndMeshes.ts';

export interface BoostPadDefinition {
  isBig: boolean;
  pos: [number, number] | number[] | Float32Array;
}

export interface BoostPadTemplates {
  bigFull: THREE.Object3D;
  bigBase: THREE.Object3D;
  bigGlow?: THREE.Object3D;
  smallFull: THREE.Object3D;
  smallBase: THREE.Object3D;
  smallGlow?: THREE.Object3D;
}

export interface BoostPadInstance {
  id: number;
  full: THREE.Object3D;
  base: THREE.Object3D;
  glowMesh: THREE.Mesh | null;
  glowMaterial: THREE.ShaderMaterial;
  orbMesh: THREE.Mesh | null;
  shadowMesh: THREE.Mesh | null;
  group: THREE.Group;
  isBig: boolean;
  pos: [number, number] | number[] | Float32Array;
  angleDeg: number;
}

export type BoostPadTunerConfig = typeof DEFAULT_BOOST_PAD_TUNER;

export const BOOST_PAD_ASSET_URLS = Object.freeze({
  smallBase: '/assets/arena/pads/BoostPad_Small_Base.glb',
  smallGlow: '/assets/arena/pads/BoostPad_Small_Glow.glb',
  largeBase: '/assets/arena/pads/BoostPad_Large_Base.glb',
  largeGlow: '/assets/arena/pads/BoostPad_Large_Glow.glb',
});

/**
 * Loads authentic GLTF/GLB models, supporting decoupled Base + Glow architecture
 * with discrete material slots for Top, Side, and Base surfaces.
 */
export async function loadBoostPadTemplates(system: {
  padPeakY: number;
  sharedOrbMaterial: THREE.Material;
  tunerConfig: BoostPadTunerConfig & Record<string, number | string | boolean | undefined>;
  padTemplates: BoostPadTemplates | null;
}): Promise<BoostPadTemplates | null> {
  const loader = new GLTFLoader();
  const padPaths = {
    smallBase: [BOOST_PAD_ASSET_URLS.smallBase],
    smallGlow: [BOOST_PAD_ASSET_URLS.smallGlow],
    bigBase: [BOOST_PAD_ASSET_URLS.largeBase],
    bigGlow: [BOOST_PAD_ASSET_URLS.largeGlow],
  };

  const loadCandidate = async (candidates: string[]) => {
    for (const p of candidates) {
      try {
        const gltf = await loader.loadAsync(resolveAssetPath(p));
        if (gltf?.scene) return gltf.scene;
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.warn('[BoostPadSystem] Candidate pad GLB load skipped:', p, msg);
      }
    }
    return null;
  };

  try {
    const [smallBase, smallGlow, bigBase, bigGlow] = await Promise.all([
      loadCandidate(padPaths.smallBase),
      loadCandidate(padPaths.smallGlow),
      loadCandidate(padPaths.bigBase),
      loadCandidate(padPaths.bigGlow),
    ]);

    if (!smallBase || !smallGlow || !bigBase || !bigGlow) {
      console.warn('[BoostPadSystem] Decoupled pad GLBs missing, checking legacy containers');
      return null;
    }

    for (const model of [smallBase, smallGlow, bigBase, bigGlow]) {
      model.scale.setScalar(100);
    }

    let measuredPeakY = 6.6614;
    bigBase.traverse(
      (child: THREE.Object3D & { isMesh?: boolean; geometry?: THREE.BufferGeometry }) => {
        if (child.isMesh) {
          child.castShadow = false;
          child.receiveShadow = true;
          if (child.name === 'BoostPad_Large' && child.geometry) {
            child.geometry.computeBoundingBox();
            if (child.geometry.boundingBox) {
              measuredPeakY = child.geometry.boundingBox.max.y * 100;
            }
          }
        }
      }
    );
    system.padPeakY = measuredPeakY;

    const orbGeo = new THREE.SphereGeometry(1, 32, 24);
    const orbMesh = new THREE.Mesh(orbGeo, system.sharedOrbMaterial);
    orbMesh.name = 'BoostFloatingOrb';
    orbMesh.scale.setScalar(system.tunerConfig.orbRadius);
    orbMesh.position.set(0, system.padPeakY + system.tunerConfig.orbHeightOffset, 0);

    const bigFull = new THREE.Group();
    bigFull.add(bigBase.clone(true), bigGlow.clone(true), orbMesh);

    const smallFull = new THREE.Group();
    smallFull.add(smallBase.clone(true), smallGlow.clone(true));

    system.padTemplates = {
      bigFull,
      bigBase,
      bigGlow,
      smallFull,
      smallBase,
      smallGlow,
    };

    return system.padTemplates;
  } catch (err) {
    console.warn('[BoostPadSystem] Failed to load GLB pad templates:', err);
    return null;
  }
}

export function buildBoostPadInstances(
  system: {
    pads: BoostPadInstance[];
    bigOrbs: THREE.Mesh[];
    bigShadows: THREE.Mesh[];
    padTemplates: BoostPadTemplates | null;
    padPeakY: number;
    tunerConfig: BoostPadTunerConfig & Record<string, number | string | boolean | undefined>;
  },
  padsData: Array<{ isBig: boolean; pos: number[] | Float32Array }>,
  padTemplates: BoostPadTemplates | null = null,
  scene: THREE.Scene | THREE.Object3D | null = null,
  onPadMeshAdded: ((padGroup: THREE.Group) => void) | null = null
): void {
  const templates = padTemplates || system.padTemplates;
  if (!templates && padsData.length > 0) {
    console.warn(
      `[BoostPadSystem] GLB boost pad templates are unavailable; falling back to procedural whitebox pad meshes for ${padsData.length} pads.`
    );
  }
  const computedAngles = computeAllPadRotations(system.tunerConfig);

  for (let padIndex = 0; padIndex < padsData.length; padIndex++) {
    const data = padsData[padIndex];
    let fullMesh: THREE.Object3D;
    let baseMesh: THREE.Object3D;
    let glowMesh: THREE.Mesh | null = null;
    let orbMesh: THREE.Mesh | null = null;

    if (templates) {
      const srcFull = data.isBig ? templates.bigFull : templates.smallFull;
      const srcBase = data.isBig ? templates.bigBase : templates.smallBase;
      fullMesh = cloneModelWithMaterials(srcFull);
      baseMesh = cloneModelWithMaterials(srcBase);
    } else {
      const fallbacks = createFallbackPadMeshes(data.isBig);
      fullMesh = fallbacks.full;
      baseMesh = fallbacks.base;
    }

    const padGlowMaterial = createUpwardGlowMaterial(system.tunerConfig);

    fullMesh.traverse((child: THREE.Object3D & { isMesh?: boolean; material?: THREE.Material }) => {
      if (child.isMesh) {
        if (
          child.name.includes('Glow') ||
          child.name === 'Active_Glow_Overlay' ||
          child.name.includes('02_SM')
        ) {
          prepareGlowGeometry(child as THREE.Mesh);
          child.material = padGlowMaterial;
          child.castShadow = false;
          child.receiveShadow = false;
          glowMesh = child as THREE.Mesh;
        } else if (child.name === 'BoostFloatingOrb') {
          orbMesh = child as THREE.Mesh;
          system.bigOrbs.push(child as THREE.Mesh);
        }
      }
    });

    let shadowMesh: THREE.Mesh | null = null;
    if (data.isBig) {
      shadowMesh = createBigOrbShadowMesh(system.tunerConfig);
      shadowMesh.position.set(
        0,
        system.padPeakY + (Number(system.tunerConfig.orbHeightOffset) || 70),
        0
      );
      system.bigShadows.push(shadowMesh);
    }

    const padGroup = new THREE.Group();
    padGroup.position.set(
      data.pos[0],
      Number(system.tunerConfig.padHeightOffset) || 0,
      data.pos[1]
    );
    padGroup.rotation.y = (computedAngles[padIndex] || 0) * (Math.PI / 180);
    padGroup.add(fullMesh, baseMesh);
    if (shadowMesh) {
      padGroup.add(shadowMesh);
    }
    baseMesh.visible = false;

    if (typeof onPadMeshAdded === 'function') {
      onPadMeshAdded(padGroup);
    }

    system.pads.push({
      id: padIndex,
      full: fullMesh,
      base: baseMesh,
      glowMesh,
      glowMaterial: padGlowMaterial,
      orbMesh,
      shadowMesh,
      group: padGroup,
      isBig: data.isBig,
      pos: data.pos,
      angleDeg: computedAngles[padIndex] || 0,
    });

    if (scene && typeof scene.add === 'function') {
      scene.add(padGroup);
    }
  }
}

export function disposeBoostPadSystem(system: {
  collectAnimations: Map<number, unknown>;
  pads: BoostPadInstance[];
  bigOrbs: THREE.Mesh[];
  bigShadows: THREE.Mesh[];
}): void {
  system.collectAnimations.clear();
  for (const pad of system.pads) {
    if (pad.group?.parent) {
      pad.group.parent.remove(pad.group);
    }
    pad.full?.traverse?.(
      (
        obj: THREE.Object3D & {
          geometry?: THREE.BufferGeometry;
          material?: THREE.Material | THREE.Material[];
        }
      ) => {
        if (obj.geometry?.dispose) obj.geometry.dispose();
        if (obj.material) {
          if (Array.isArray(obj.material)) obj.material.forEach((m) => m?.dispose?.());
          else obj.material.dispose?.();
        }
      }
    );
    pad.base?.traverse?.(
      (
        obj: THREE.Object3D & {
          geometry?: THREE.BufferGeometry;
          material?: THREE.Material | THREE.Material[];
        }
      ) => {
        if (obj.geometry?.dispose) obj.geometry.dispose();
        if (obj.material) {
          if (Array.isArray(obj.material)) obj.material.forEach((m) => m?.dispose?.());
          else obj.material.dispose?.();
        }
      }
    );
    if (pad.glowMaterial?.dispose) pad.glowMaterial.dispose();
  }
  system.pads.length = 0;
  system.bigOrbs.length = 0;
  system.bigShadows.length = 0;
}
