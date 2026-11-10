import {
  AlwaysStencilFunc,
  Color,
  type DataTexture,
  DoubleSide,
  FrontSide,
  KeepStencilOp,
  type Material,
  Mesh,
  MeshLambertMaterial,
  MeshStandardMaterial,
  ReplaceStencilOp,
  type Texture,
  Vector2,
  Vector3,
  Vector4,
} from 'three';
import {
  DEFAULT_Q1_LAYER_COLORS,
  type DriftwoodsLayerConfig,
  type DriftwoodsTunerConfig,
} from '../../../ui-core/config/driftwoodsConfig.ts';

export type DriftwoodsShaderUniforms = ReturnType<typeof createDriftwoodsShaderUniforms>;
export type DriftwoodsGroundUniforms = DriftwoodsShaderUniforms['groundUniforms'];
export type DriftwoodsGoalTeamUniforms = DriftwoodsShaderUniforms['goalTeamUniforms'];
export type DriftwoodsSpecularAAUniforms = DriftwoodsShaderUniforms['specularAAUniforms'];
export type DriftwoodsOcclusionUniforms = DriftwoodsShaderUniforms['occlusionUniforms'];

export interface DriftwoodsOcclusionOverlayPass {
  overlayStandardMat: MeshStandardMaterial;
  overlayLambertMat: MeshLambertMaterial;
  overlayOrder: number;
}

export type DriftwoodsSurfaceMaterial = MeshStandardMaterial | MeshLambertMaterial;

export const DRIFTWOODS_TRANSPARENT_ENCLOSURE_MESH_NAMES: ReadonlySet<string> = new Set([
  'Woods_Field_Walls',
  'Woods_Field_Walls_Hexes',
]);

export const DRIFTWOODS_DYNAMIC_OCCLUSION_MESH_NAMES: ReadonlySet<string> = new Set([
  'Woods_Field_Ramps_Trim',
  'Woods_Field_Wall_Posts',
  'Woods_Field_Goal',
  'Woods_Field_Goal_Posts',
  'Woods_Field_Goal_Posts_1',
  'Woods_Field_Goal_Posts_2',
  'Woods_Field_Goal_Net',
  'Woods_Field_Goal_Net_1',
]);

export const DRIFTWOODS_EMISSIVE_MESH_NAMES: ReadonlySet<string> = new Set([
  'Woods_Field_Walls_Hexes',
  'Woods_Field_Goal_Posts_2',
]);

export const DRIFTWOODS_UPPER_OUTER_MESH_NAMES: ReadonlySet<string> = new Set([
  'Woods_Field_Ramps_2',
  'Woods_Field_Goal_Net_2',
]);

export function createDriftwoodsShaderUniforms(
  config: Partial<DriftwoodsTunerConfig>,
  bakedBlueGroundTexture: DataTexture,
  bakedOrangeGroundTexture: DataTexture,
  q1GroundTexture: Texture | null
) {
  const q1Colors = {
    ...DEFAULT_Q1_LAYER_COLORS,
    ...(config.ground?.q1Colors || {}),
  };

  const groundUniforms = {
    uGroundMode: { value: config.ground?.textureMode === 'original' ? 0.0 : 1.0 },
    uQ1BakedReady: { value: 0.0 },
    uBakedBlueGroundMap: { value: bakedBlueGroundTexture },
    uBakedOrangeGroundMap: { value: bakedOrangeGroundTexture },
    uQ1GroundMap: { value: q1GroundTexture },
    uQ1UvScale: {
      value: new Vector2(config.ground?.q1ScaleX ?? 1.0, config.ground?.q1ScaleY ?? 1.0),
    },
    uQ1UvOffset: {
      value: new Vector2(config.ground?.q1OffsetX ?? 0.0, config.ground?.q1OffsetY ?? 0.0),
    },
    uGroundColor: { value: new Color(config.ground?.groundColor || '#18441c') },
    uLineColor: { value: new Color(config.ground?.lineColor || '#e1e6eb') },
    uLineThreshold: { value: config.ground?.lineThreshold ?? 0.35 },
    uLineSmoothness: { value: config.ground?.lineSmoothness ?? 0.15 },
    uOrigLineThreshold: { value: config.ground?.originalLineThreshold ?? 0.0921 },
    uOrigLineSmoothness: { value: config.ground?.originalLineSmoothness ?? 0.0364 },
    uL0Color: { value: new Color(q1Colors.L0) },
    uL1Color: { value: new Color(q1Colors.L1) },
    uL2Color: { value: new Color(q1Colors.L2) },
    uL3Color: { value: new Color(q1Colors.L3) },
    uL4Color: { value: new Color(q1Colors.L4) },
    uL5Color: { value: new Color(q1Colors.L5) },
    uL6Color: { value: new Color(q1Colors.L6) },
    uL4UseTeamColor: { value: config.ground?.l4UseTeamColor !== false ? 1.0 : 0.0 },
    uL5UseTeamColor: { value: config.ground?.l5UseTeamColor !== false ? 1.0 : 0.0 },
    uL6UseTeamColor: { value: config.ground?.l6UseTeamColor !== false ? 1.0 : 0.0 },
    uBallRingPos: { value: new Vector3(0, 95, 0) },
    uBallRingRadii: { value: new Vector4(100.51, 109.25, 86.44, 93.96) },
    uBallRingOpacity: { value: 0.2 },
  };

  const specularAAUniforms = {
    uSpecularAAStrength: {
      value: config.specularAA !== false ? Number(config.specularAAStrength ?? 1.0) : 0.0,
    },
  };

  const occlusionUniforms = {
    uOcclusionOpacity: {
      value: Number(config.occlusionOpacity ?? 0.4),
    },
    uWallExteriorOcclusionEnabled: {
      value: config.wallExteriorOcclusion !== false ? 1.0 : 0.0,
    },
    uGoalDepthMaskEnabled: {
      value: config.goalDepthMaskEnabled !== false ? 1.0 : 0.0,
    },
    uGoalMaskOffsetUu: {
      value: Number(config.goalMaskOffsetUu ?? 250),
    },
    uGoalMaskGradientDistanceUu: {
      value: Math.max(1.0, Number(config.goalMaskGradientDistanceUu ?? 500)),
    },
    uGoalMaskBezier: {
      value: new Vector4(
        Number(config.goalMaskBezierP1X ?? 0.27),
        Number(config.goalMaskBezierP1Y ?? 0.06),
        Number(config.goalMaskBezierP2X ?? 0.26),
        Number(config.goalMaskBezierP2Y ?? 0.73)
      ),
    },
  };

  const goalTeamUniforms = {
    uGoalFrameUseTeamColor: {
      value: Boolean(config.goalFrame?.useTeamColor) ? 1.0 : 0.0,
    },
    uGoalPostsUseTeamColor: {
      value: Boolean(config.goalPosts?.useTeamColor) ? 1.0 : 0.0,
    },
    uGoalPostsGlowUseTeamColor: {
      value: config.goalPostsGlow?.useTeamColor !== false ? 1.0 : 0.0,
    },
    uRampsUpperOuterUseTeamColor: {
      value: config.rampsUpperOuter?.useTeamColor !== false ? 1.0 : 0.0,
    },
    uGoalNetUseTeamColor: { value: 0.0 },
    uGoalBlueColor: { value: new Color('#1982e6') },
    uGoalOrangeColor: { value: new Color('#e05d09') },
    uGoalPostsGlowBlueColor: { value: new Color('#7ec6ff') },
    uGoalPostsGlowOrangeColor: { value: new Color('#ffab6e') },
    uRampsUpperOuterBlueColor: { value: new Color('#1374d1') },
    uRampsUpperOuterOrangeColor: { value: new Color('#c95104') },
  };

  return {
    groundUniforms,
    specularAAUniforms,
    occlusionUniforms,
    goalTeamUniforms,
  };
}

/**
 * Creates the transparent occlusion overlay materials and mesh for Pass 2 stencil-masked rendering.
 */
export function createDriftwoodsOcclusionOverlayPass(
  mesh: Mesh,
  origMat: Material & { isMeshStandardMaterial?: boolean },
  overlayOrder: number
): DriftwoodsOcclusionOverlayPass {
  const name = mesh.name;
  const overlayStandardMat: MeshStandardMaterial = origMat.isMeshStandardMaterial
    ? (origMat as MeshStandardMaterial).clone()
    : new MeshStandardMaterial();
  overlayStandardMat.name = `${name}_OcclusionTransparent_Standard`;
  overlayStandardMat.transparent = true;
  overlayStandardMat.depthWrite = true;
  overlayStandardMat.stencilWrite = true;
  overlayStandardMat.stencilFunc = AlwaysStencilFunc;
  overlayStandardMat.stencilRef = 2;
  overlayStandardMat.stencilFuncMask = 0x02;
  overlayStandardMat.stencilWriteMask = 0x02;
  overlayStandardMat.stencilZPass = ReplaceStencilOp;
  overlayStandardMat.stencilFail = KeepStencilOp;
  overlayStandardMat.stencilZFail = KeepStencilOp;

  const overlayLambertMat = new MeshLambertMaterial({
    name: `${name}_OcclusionTransparent_Lambert`,
    map: overlayStandardMat.map || null,
    transparent: true,
    opacity: overlayStandardMat.opacity,
    depthWrite: true,
    side: overlayStandardMat.side,
    wireframe: overlayStandardMat.wireframe,
    emissiveIntensity: 0,
  });
  overlayLambertMat.stencilWrite = true;
  overlayLambertMat.stencilFunc = AlwaysStencilFunc;
  overlayLambertMat.stencilRef = 2;
  overlayLambertMat.stencilFuncMask = 0x02;
  overlayLambertMat.stencilWriteMask = 0x02;
  overlayLambertMat.stencilZPass = ReplaceStencilOp;
  overlayLambertMat.stencilFail = KeepStencilOp;
  overlayLambertMat.stencilZFail = KeepStencilOp;

  return { overlayStandardMat, overlayLambertMat, overlayOrder };
}

export function attachDriftwoodsOcclusionOverlayMesh(
  mesh: Mesh,
  activeOverlayMat: Material,
  overlayOrder: number
): Mesh {
  const overlayMesh = new Mesh(mesh.geometry, activeOverlayMat);
  overlayMesh.name = `${mesh.name}_OcclusionTransparentOverlay`;
  overlayMesh.userData = { isOcclusionTransparentOverlay: true, bloomOccluder: false };
  overlayMesh.frustumCulled = false;
  overlayMesh.position.copy(mesh.position);
  overlayMesh.quaternion.copy(mesh.quaternion);
  overlayMesh.scale.copy(mesh.scale);
  overlayMesh.renderOrder = overlayOrder;
  overlayMesh.visible = mesh.visible;

  if (mesh.parent) {
    mesh.parent.add(overlayMesh);
  }
  return overlayMesh;
}

/**
 * Pure material property applicator for a single stadium mesh layer configuration.
 */
export function applyDriftwoodsLayerMaterials(
  meshName: string,
  layerConfig: Partial<DriftwoodsLayerConfig>,
  std: DriftwoodsSurfaceMaterial | null | undefined,
  lam: DriftwoodsSurfaceMaterial | null | undefined,
  overlayStd: DriftwoodsSurfaceMaterial | null | undefined,
  overlayLam: DriftwoodsSurfaceMaterial | null | undefined
): void {
  const keepTransparent = DRIFTWOODS_TRANSPARENT_ENCLOSURE_MESH_NAMES.has(meshName);
  const isDynamicOcclusionMesh = DRIFTWOODS_DYNAMIC_OCCLUSION_MESH_NAMES.has(meshName);
  const isEmissiveMesh = DRIFTWOODS_EMISSIVE_MESH_NAMES.has(meshName);
  const isUpperOuterMesh = DRIFTWOODS_UPPER_OUTER_MESH_NAMES.has(meshName);

  for (const mat of [std, lam, overlayStd, overlayLam]) {
    if (!mat) continue;
    const isOverlayMat = mat === overlayStd || mat === overlayLam;
    if (layerConfig.color) mat.color.set(layerConfig.color);
    if ('isMeshStandardMaterial' in mat && mat.isMeshStandardMaterial) {
      if (layerConfig.roughness !== undefined) mat.roughness = layerConfig.roughness;
      if (layerConfig.metalness !== undefined) mat.metalness = layerConfig.metalness;
    }
    if (isUpperOuterMesh) {
      const targetSide = layerConfig.oneWaySeeThrough !== false ? FrontSide : DoubleSide;
      if (mat.side !== targetSide) {
        mat.side = targetSide;
        mat.needsUpdate = true;
      }
    }
    if (isDynamicOcclusionMesh) {
      if (layerConfig.opacity !== undefined) {
        mat.opacity = layerConfig.opacity;
      }
      mat.transparent = isOverlayMat;
      mat.depthWrite = true;
      if (isOverlayMat) {
        mat.stencilWrite = true;
        mat.stencilFunc = AlwaysStencilFunc;
        mat.stencilRef = 2;
        mat.stencilFuncMask = 0x02;
        mat.stencilWriteMask = 0x02;
        mat.stencilZPass = ReplaceStencilOp;
        mat.stencilFail = KeepStencilOp;
        mat.stencilZFail = KeepStencilOp;
      }
    } else if (layerConfig.opacity !== undefined) {
      mat.opacity = layerConfig.opacity;
      mat.transparent = keepTransparent || layerConfig.opacity < 0.999;
      mat.depthWrite = !mat.transparent;
    } else if (keepTransparent) {
      mat.transparent = true;
      mat.depthWrite = false;
    }
    if (isEmissiveMesh) {
      if (layerConfig.emissive || layerConfig.color) {
        mat.emissive.set(layerConfig.emissive || layerConfig.color!);
      }
      mat.emissiveIntensity = Number(layerConfig.emissiveIntensity ?? 0);
    } else {
      mat.emissive.set('#000000');
      mat.emissiveIntensity = 0;
    }
    if (layerConfig.wireframe !== undefined) {
      mat.wireframe = layerConfig.wireframe;
    }
  }
}
