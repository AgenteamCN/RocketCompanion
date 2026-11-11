/**
 * driftwoodsMeshMaterialPipeline.ts
 * Pure mesh traversal, classification, material pair instantiation (Standard + Lambert),
 * shader injection, and Pass-2 stencil occlusion overlay construction for Driftwoods Stadium.
 */

import {
  DoubleSide,
  FrontSide,
  type Group,
  LinearFilter,
  LinearMipmapLinearFilter,
  type Material,
  Mesh,
  MeshLambertMaterial,
  MeshStandardMaterial,
  NearestFilter,
  NearestMipmapLinearFilter,
  type Object3D,
  RepeatWrapping,
} from 'three';
import type {
  DriftwoodsGroundConfig,
  DriftwoodsTunerConfig,
} from '../../../ui-core/config/driftwoodsConfig.ts';
import {
  createDriftwoodsOcclusionOverlayPass,
  attachDriftwoodsOcclusionOverlayMesh,
  type DriftwoodsGroundUniforms,
  type DriftwoodsSpecularAAUniforms,
  type DriftwoodsOcclusionUniforms,
  type DriftwoodsGoalTeamUniforms,
} from './DriftwoodsMaterialPaletteSpecs.ts';
import { injectSpecularAAShader, injectGroundDetailShader } from './DriftwoodsGroundShader.ts';
import {
  injectGoalTeamShader,
  injectWallPostTrimOcclusionShader,
  injectRampsIndicatorRingShader,
} from './DriftwoodsGoalAndRampShader.ts';
import { injectWallFxShader, type WallFxUniforms } from './WallFxShaderInjector.ts';
import { prepareWoodsFieldHexRibbonAttributes } from './DriftwoodsHexGeometryProcessor.ts';

export type DriftwoodsWallFxUniforms = WallFxUniforms;

export interface DriftwoodsSharedUpperOuterMaterials {
  standardMat: MeshStandardMaterial;
  lambertMat: MeshLambertMaterial;
}

export interface DriftwoodsMeshSetupContext {
  fastDiffuse: boolean;
  groundUniforms: DriftwoodsGroundUniforms;
  wallFxUniforms: DriftwoodsWallFxUniforms;
  specularAAUniforms: DriftwoodsSpecularAAUniforms;
  occlusionUniforms: DriftwoodsOcclusionUniforms;
  goalTeamUniforms: DriftwoodsGoalTeamUniforms;
  sharedUpperOuterStandardMaterial: MeshStandardMaterial | null;
  sharedUpperOuterLambertMaterial: MeshLambertMaterial | null;
}

export interface DriftwoodsMeshRegistry {
  meshes: Record<string, Mesh>;
  standardMaterials: Record<string, MeshStandardMaterial>;
  lambertMaterials: Record<string, MeshLambertMaterial>;
  occlusionOverlayMeshes: Record<string, Mesh>;
  occlusionOverlayStandardMaterials: Record<string, MeshStandardMaterial>;
  occlusionOverlayLambertMaterials: Record<string, MeshLambertMaterial>;
  sharedUpperOuterStandardMaterial: MeshStandardMaterial | null;
  sharedUpperOuterLambertMaterial: MeshLambertMaterial | null;
}

type MaterialWithStandardFlag = Material & {
  isMeshStandardMaterial?: boolean;
};

export function collectDriftwoodsSceneMeshes(stadiumScene: Group): Mesh[] {
  const initialMeshes: Mesh[] = [];
  stadiumScene.traverse((obj: Object3D) => {
    if (obj.name === 'BoostPads_Combined_Base') {
      obj.visible = false;
      obj.removeFromParent?.();
      return;
    }

    const meshCandidate = obj as Object3D & { isMesh?: boolean };
    if (meshCandidate.isMesh && !obj.userData?.isOcclusionTransparentOverlay) {
      initialMeshes.push(obj as Mesh);
    }
  });
  return initialMeshes;
}

export function ensureDriftwoodsSharedUpperOuterMaterials(
  ctx: DriftwoodsMeshSetupContext,
  templateMat: MaterialWithStandardFlag | null | undefined
): DriftwoodsSharedUpperOuterMaterials {
  if (ctx.sharedUpperOuterStandardMaterial && ctx.sharedUpperOuterLambertMaterial) {
    return {
      standardMat: ctx.sharedUpperOuterStandardMaterial,
      lambertMat: ctx.sharedUpperOuterLambertMaterial,
    };
  }

  const standardMat: MeshStandardMaterial = templateMat?.isMeshStandardMaterial
    ? (templateMat as MeshStandardMaterial).clone()
    : new MeshStandardMaterial();
  standardMat.name = 'Woods_Field_Upper_Outer_Standard';
  standardMat.side = FrontSide;
  standardMat.transparent = false;
  standardMat.depthWrite = true;

  const lambertMat = new MeshLambertMaterial({
    name: 'Woods_Field_Upper_Outer_Lambert',
    map: standardMat.map || null,
    transparent: false,
    opacity: 1.0,
    depthWrite: true,
    side: FrontSide,
    wireframe: standardMat.wireframe,
    emissiveIntensity: 0,
  });

  injectGoalTeamShader(
    standardMat,
    ctx.goalTeamUniforms,
    ctx.specularAAUniforms,
    ctx.occlusionUniforms,
    'rampsUpperOuter',
    true,
    'all'
  );
  injectGoalTeamShader(
    lambertMat,
    ctx.goalTeamUniforms,
    ctx.specularAAUniforms,
    ctx.occlusionUniforms,
    'rampsUpperOuter',
    false,
    'all'
  );

  ctx.sharedUpperOuterStandardMaterial = standardMat;
  ctx.sharedUpperOuterLambertMaterial = lambertMat;

  return { standardMat, lambertMat };
}

export function setupDriftwoodsMeshMaterials(
  mesh: Mesh,
  ctx: DriftwoodsMeshSetupContext,
  registry: DriftwoodsMeshRegistry
): void {
  const name = mesh.name;
  const rawMaterial = Array.isArray(mesh.material) ? mesh.material[0] : mesh.material;
  const origMat = rawMaterial as MaterialWithStandardFlag;
  const matName = origMat?.name || '';

  const isUpperOrOuter =
    matName === 'Upper' ||
    matName === 'Outer' ||
    name === 'Woods_Field_Ramps_2' ||
    name === 'Woods_Field_Goal_Net_2';

  if (isUpperOrOuter) {
    const { standardMat, lambertMat } = ensureDriftwoodsSharedUpperOuterMaterials(ctx, origMat);
    registry.sharedUpperOuterStandardMaterial = standardMat;
    registry.sharedUpperOuterLambertMaterial = lambertMat;
    registry.standardMaterials[name] = standardMat;
    registry.lambertMaterials[name] = lambertMat;
    mesh.material = ctx.fastDiffuse ? lambertMat : standardMat;
    return;
  }

  const isTransparentEnclosure = name === 'Woods_Field_Walls' || name === 'Woods_Field_Walls_Hexes';
  const isGoalPostsMain =
    name === 'Woods_Field_Goal_Posts' ||
    name === 'Woods_Field_Goal_Posts_1' ||
    matName === 'Goal_Posts_Tintable';
  const isGoalPostsGlow = name === 'Woods_Field_Goal_Posts_2' || matName === 'Glow';
  const isGoalNetMain =
    name === 'Woods_Field_Goal_Net' ||
    name === 'Woods_Field_Goal_Net_1' ||
    matName === 'Goal_Net_Tintable';
  const isDynamicOcclusionMesh =
    name === 'Woods_Field_Ramps_Trim' ||
    name === 'Woods_Field_Wall_Posts' ||
    name === 'Woods_Field_Goal' ||
    isGoalPostsMain ||
    isGoalPostsGlow ||
    isGoalNetMain;

  const standardMat: MeshStandardMaterial = origMat?.isMeshStandardMaterial
    ? (origMat as MeshStandardMaterial).clone()
    : new MeshStandardMaterial();

  standardMat.name = `${name}_Standard`;
  if (isTransparentEnclosure) {
    standardMat.transparent = true;
    standardMat.depthWrite = false;
    standardMat.side = DoubleSide;
  } else if (isDynamicOcclusionMesh) {
    standardMat.transparent = false;
    standardMat.depthWrite = true;
  }

  const lambertMat = new MeshLambertMaterial({
    name: `${name}_Lambert`,
    map: standardMat.map || null,
    transparent: isTransparentEnclosure
      ? true
      : isDynamicOcclusionMesh
        ? false
        : Boolean(standardMat.transparent),
    opacity: standardMat.opacity,
    depthWrite: isTransparentEnclosure
      ? false
      : isDynamicOcclusionMesh
        ? true
        : !standardMat.transparent,
    side: isTransparentEnclosure ? DoubleSide : standardMat.side,
    wireframe: standardMat.wireframe,
    emissiveIntensity: 0,
  });

  let overlayOrder = 0;
  if (isGoalPostsGlow) {
    overlayOrder = 0.1;
  } else if (isGoalPostsMain) {
    overlayOrder = 0.2;
  } else if (name === 'Woods_Field_Ramps_Trim') {
    overlayOrder = 0.3;
  } else if (name === 'Woods_Field_Wall_Posts') {
    overlayOrder = 0.4;
  } else if (name === 'Woods_Field_Goal') {
    overlayOrder = 0.5;
  } else if (isGoalNetMain) {
    overlayOrder = 0.6;
  } else if (name === 'Woods_Field_Walls') {
    mesh.renderOrder = 1;
  } else if (name === 'Woods_Field_Walls_Hexes') {
    mesh.renderOrder = 2;
  }

  const injectGoalPair = (
    stdMat: MeshStandardMaterial,
    lamMat: MeshLambertMaterial,
    targetType: string,
    passMode: string
  ) => {
    injectGoalTeamShader(
      stdMat,
      ctx.goalTeamUniforms,
      ctx.specularAAUniforms,
      ctx.occlusionUniforms,
      targetType,
      true,
      passMode
    );
    injectGoalTeamShader(
      lamMat,
      ctx.goalTeamUniforms,
      ctx.specularAAUniforms,
      ctx.occlusionUniforms,
      targetType,
      false,
      passMode
    );
  };

  const injectOcclusionPair = (
    stdMat: MeshStandardMaterial,
    lamMat: MeshLambertMaterial,
    isRampsTrim: boolean,
    passMode: string
  ) => {
    injectWallPostTrimOcclusionShader(
      stdMat,
      ctx.occlusionUniforms,
      ctx.specularAAUniforms,
      isRampsTrim,
      true,
      passMode
    );
    injectWallPostTrimOcclusionShader(
      lamMat,
      ctx.occlusionUniforms,
      ctx.specularAAUniforms,
      isRampsTrim,
      false,
      passMode
    );
  };

  if (name === 'Woods_Field_Ground') {
    injectGroundDetailShader(standardMat, ctx.groundUniforms, ctx.wallFxUniforms);
    injectGroundDetailShader(lambertMat, ctx.groundUniforms, ctx.wallFxUniforms);

    for (const mat of [standardMat, lambertMat]) {
      const tex = mat.map;
      if (tex) {
        tex.wrapS = RepeatWrapping;
        tex.wrapT = RepeatWrapping;
        tex.generateMipmaps = true;
        tex.minFilter = LinearMipmapLinearFilter;
        tex.needsUpdate = true;
      }
    }
  } else if (name === 'Woods_Field_Walls_Hexes' || name === 'Woods_Field_Walls') {
    const isWallsMesh = name === 'Woods_Field_Walls';
    injectWallFxShader(standardMat, ctx.wallFxUniforms, isWallsMesh);
    injectWallFxShader(lambertMat, ctx.wallFxUniforms, isWallsMesh);
  } else if (name === 'Woods_Field_Goal') {
    injectGoalPair(standardMat, lambertMat, 'goalFrame', 'opaque');
  } else if (isGoalPostsMain) {
    injectGoalPair(standardMat, lambertMat, 'goalPosts', 'opaque');
  } else if (isGoalPostsGlow) {
    injectGoalPair(standardMat, lambertMat, 'goalPostsGlow', 'opaque');
  } else if (isGoalNetMain) {
    injectGoalPair(standardMat, lambertMat, 'goalNet', 'opaque');
  } else if (name === 'Woods_Field_Ramps_Trim') {
    injectOcclusionPair(standardMat, lambertMat, true, 'opaque');
  } else if (name === 'Woods_Field_Wall_Posts') {
    injectOcclusionPair(standardMat, lambertMat, false, 'opaque');
  } else if (
    name === 'Woods_Field_Ramps' ||
    name === 'Woods_Field_Ramps_1' ||
    matName === 'Ramps_Tintable'
  ) {
    injectRampsIndicatorRingShader(standardMat, ctx.groundUniforms, ctx.specularAAUniforms, true);
    injectRampsIndicatorRingShader(lambertMat, ctx.groundUniforms, ctx.specularAAUniforms, false);
  } else {
    injectSpecularAAShader(standardMat, ctx.specularAAUniforms);
  }

  registry.standardMaterials[name] = standardMat;
  registry.lambertMaterials[name] = lambertMat;
  mesh.material = ctx.fastDiffuse ? lambertMat : standardMat;

  if (isDynamicOcclusionMesh) {
    const { overlayStandardMat, overlayLambertMat } = createDriftwoodsOcclusionOverlayPass(
      mesh,
      origMat,
      overlayOrder
    );

    if (name === 'Woods_Field_Goal') {
      injectGoalPair(overlayStandardMat, overlayLambertMat, 'goalFrame', 'transparent');
    } else if (isGoalPostsMain) {
      injectGoalPair(overlayStandardMat, overlayLambertMat, 'goalPosts', 'transparent');
    } else if (isGoalPostsGlow) {
      injectGoalPair(overlayStandardMat, overlayLambertMat, 'goalPostsGlow', 'transparent');
    } else if (isGoalNetMain) {
      injectGoalPair(overlayStandardMat, overlayLambertMat, 'goalNet', 'transparent');
    } else if (name === 'Woods_Field_Ramps_Trim') {
      injectOcclusionPair(overlayStandardMat, overlayLambertMat, true, 'transparent');
    } else if (name === 'Woods_Field_Wall_Posts') {
      injectOcclusionPair(overlayStandardMat, overlayLambertMat, false, 'transparent');
    }

    const overlayMesh = attachDriftwoodsOcclusionOverlayMesh(
      mesh,
      ctx.fastDiffuse ? overlayLambertMat : overlayStandardMat,
      overlayOrder
    );

    registry.occlusionOverlayStandardMaterials[name] = overlayStandardMat;
    registry.occlusionOverlayLambertMaterials[name] = overlayLambertMat;
    registry.occlusionOverlayMeshes[name] = overlayMesh;
  }
}

export function applyGroundMaterialCommon(
  mat: MeshStandardMaterial | MeshLambertMaterial | undefined,
  groundConfig: Partial<DriftwoodsGroundConfig>
): void {
  if (!mat) return;
  if ('isMeshStandardMaterial' in mat && mat.isMeshStandardMaterial) {
    if (groundConfig.roughness !== undefined) mat.roughness = groundConfig.roughness;
    if (groundConfig.metalness !== undefined) mat.metalness = groundConfig.metalness;
  }
  if (groundConfig.wireframe !== undefined) {
    mat.wireframe = groundConfig.wireframe;
  }
}

export function resolveGroundTextureFiltering(groundConfig: Partial<DriftwoodsGroundConfig>) {
  const isNearest = groundConfig.magFilter === 'nearest';
  return {
    targetMag: isNearest ? NearestFilter : LinearFilter,
    targetMinMipmap: isNearest ? NearestMipmapLinearFilter : LinearMipmapLinearFilter,
    targetAnisotropy: Math.max(1, Math.min(16, groundConfig.anisotropy ?? 4)),
  };
}

export function syncDriftwoodsGlobalShaderUniforms(
  c: DriftwoodsTunerConfig,
  specularAAUniforms: DriftwoodsSpecularAAUniforms | null,
  occlusionUniforms: DriftwoodsOcclusionUniforms | null,
  goalTeamUniforms: DriftwoodsGoalTeamUniforms | null,
  wallFxUniforms: DriftwoodsWallFxUniforms | null
): void {
  if (specularAAUniforms?.uSpecularAAStrength) {
    specularAAUniforms.uSpecularAAStrength.value =
      c.specularAA !== false ? Number(c.specularAAStrength ?? 1.0) : 0.0;
  }

  if (occlusionUniforms) {
    occlusionUniforms.uOcclusionOpacity.value = Math.max(
      0.0,
      Math.min(1.0, Number(c.occlusionOpacity ?? 0.4))
    );
    occlusionUniforms.uWallExteriorOcclusionEnabled.value =
      c.wallExteriorOcclusion !== false ? 1.0 : 0.0;
    occlusionUniforms.uGoalDepthMaskEnabled.value = c.goalDepthMaskEnabled !== false ? 1.0 : 0.0;
    occlusionUniforms.uGoalMaskOffsetUu.value = Number(c.goalMaskOffsetUu ?? 250);
    occlusionUniforms.uGoalMaskGradientDistanceUu.value = Math.max(
      1.0,
      Number(c.goalMaskGradientDistanceUu ?? 500)
    );
    occlusionUniforms.uGoalMaskBezier.value.set(
      Number(c.goalMaskBezierP1X ?? 0.27),
      Number(c.goalMaskBezierP1Y ?? 0.06),
      Number(c.goalMaskBezierP2X ?? 0.26),
      Number(c.goalMaskBezierP2Y ?? 0.73)
    );
  }

  if (goalTeamUniforms) {
    goalTeamUniforms.uGoalFrameUseTeamColor.value = Boolean(c.goalFrame?.useTeamColor) ? 1.0 : 0.0;
    goalTeamUniforms.uGoalPostsUseTeamColor.value = Boolean(c.goalPosts?.useTeamColor) ? 1.0 : 0.0;
    goalTeamUniforms.uGoalPostsGlowUseTeamColor.value =
      c.goalPostsGlow?.useTeamColor !== false ? 1.0 : 0.0;
    goalTeamUniforms.uRampsUpperOuterUseTeamColor.value =
      c.rampsUpperOuter?.useTeamColor !== false ? 1.0 : 0.0;
  }

  if (wallFxUniforms) {
    const wallsVisible = c.walls?.visible !== false;
    if (wallFxUniforms.uWallBaseVisible) {
      wallFxUniforms.uWallBaseVisible.value = wallsVisible ? 1.0 : 0.0;
    }
    if (wallFxUniforms.uHexEmissiveColor && (c.hexes?.emissive || c.hexes?.color)) {
      wallFxUniforms.uHexEmissiveColor.value.set(c.hexes.emissive || c.hexes.color);
    }
    if (wallFxUniforms.uHexEmissiveIntensity) {
      wallFxUniforms.uHexEmissiveIntensity.value = Number(c.hexes?.emissiveIntensity ?? 0.0);
    }
    if (wallFxUniforms.uHexThicknessScale) {
      wallFxUniforms.uHexThicknessScale.value = Math.max(
        0.1,
        Number(c.hexes?.thicknessScale ?? 1.0)
      );
    }
    if (wallFxUniforms.uHexDepthScale) {
      wallFxUniforms.uHexDepthScale.value = Math.max(
        0.0,
        Number(c.hexes?.depthScale ?? c.hexes?.thicknessScale ?? 1.0)
      );
    }
  }
}
