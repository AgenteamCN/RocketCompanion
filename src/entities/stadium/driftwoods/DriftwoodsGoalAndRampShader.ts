/**
 * DriftwoodsGoalAndRampShader
 * GLSL shader injection routines for Driftwoods goal team coloring,
 * exterior wall/corner occlusion masking, and ramp ball indicator rings.
 */

import type { Material } from 'three';
import { SPECULAR_AA_ROUGHNESS_FRAGMENT_CHUNK } from './DriftwoodsGroundShader.ts';
import type {
  DriftwoodsGoalTeamUniforms,
  DriftwoodsGroundUniforms,
  DriftwoodsOcclusionUniforms,
  DriftwoodsSpecularAAUniforms,
} from './DriftwoodsMaterialPaletteSpecs.ts';

const GOAL_DEPTH_MASK_GLSL_HELPERS = `
float evalGoalMaskCubicBezier01(float x, vec4 bz) {
  float cx = clamp(x, 0.0, 1.0);
  float p1x = clamp(bz.x, 0.0, 1.0);
  float p1y = bz.y;
  float p2x = clamp(bz.z, 0.0, 1.0);
  float p2y = bz.w;
  float t = cx;
  for (int i = 0; i < 5; i++) {
    float inv = 1.0 - t;
    float bx = 3.0 * inv * inv * t * p1x + 3.0 * inv * t * t * p2x + t * t * t - cx;
    float dbx = 3.0 * inv * inv * p1x + 6.0 * inv * t * (p2x - p1x) + 3.0 * t * t * (1.0 - p2x);
    if (abs(dbx) < 0.0001) break;
    t = clamp(t - bx / dbx, 0.0, 1.0);
  }
  float inv = 1.0 - t;
  return 3.0 * inv * inv * t * p1y + 3.0 * inv * t * t * p2y + t * t * t;
}

float computeGoalDepthMask(
  vec3 worldPos,
  vec3 camPos,
  float offsetUu,
  float gradDistUu,
  vec4 bezier
) {
  float sz = worldPos.z < 0.0 ? -1.0 : 1.0;
  float camDepth = camPos.z * sz;
  float fragDepth = abs(worldPos.z);
  float maskReachZ = camDepth + offsetUu;
  float rawT = clamp((maskReachZ - fragDepth) / max(1.0, gradDistUu), 0.0, 1.0);
  return clamp(evalGoalMaskCubicBezier01(rawT, bezier), 0.0, 1.0);
}
`;

export function injectGoalTeamShader(
  material: Material & { isMeshLambertMaterial?: boolean },
  goalTeamUniforms: DriftwoodsGoalTeamUniforms,
  specularAAUniforms: DriftwoodsSpecularAAUniforms,
  occlusionUniforms: DriftwoodsOcclusionUniforms | null | undefined,
  targetType = 'goalFrame',
  includeSpecularAA = false,
  occlusionPassMode = 'all'
): void {
  const applyGoalOcclusion = targetType !== 'rampsUpperOuter' && Boolean(occlusionUniforms);

  material.onBeforeCompile = (shader) => {
    if (targetType === 'goalPosts') {
      shader.uniforms.uGoalUseTeamColor = goalTeamUniforms.uGoalPostsUseTeamColor;
      shader.uniforms.uGoalBlueColor = goalTeamUniforms.uGoalBlueColor;
      shader.uniforms.uGoalOrangeColor = goalTeamUniforms.uGoalOrangeColor;
    } else if (targetType === 'goalPostsGlow') {
      shader.uniforms.uGoalUseTeamColor = goalTeamUniforms.uGoalPostsGlowUseTeamColor;
      shader.uniforms.uGoalBlueColor = goalTeamUniforms.uGoalPostsGlowBlueColor;
      shader.uniforms.uGoalOrangeColor = goalTeamUniforms.uGoalPostsGlowOrangeColor;
    } else if (targetType === 'rampsUpperOuter') {
      shader.uniforms.uGoalUseTeamColor = goalTeamUniforms.uRampsUpperOuterUseTeamColor;
      shader.uniforms.uGoalBlueColor = goalTeamUniforms.uRampsUpperOuterBlueColor;
      shader.uniforms.uGoalOrangeColor = goalTeamUniforms.uRampsUpperOuterOrangeColor;
    } else if (targetType === 'goalNet') {
      shader.uniforms.uGoalUseTeamColor = goalTeamUniforms.uGoalNetUseTeamColor;
      shader.uniforms.uGoalBlueColor = goalTeamUniforms.uGoalBlueColor;
      shader.uniforms.uGoalOrangeColor = goalTeamUniforms.uGoalOrangeColor;
    } else {
      shader.uniforms.uGoalUseTeamColor = goalTeamUniforms.uGoalFrameUseTeamColor;
      shader.uniforms.uGoalBlueColor = goalTeamUniforms.uGoalBlueColor;
      shader.uniforms.uGoalOrangeColor = goalTeamUniforms.uGoalOrangeColor;
    }
    if (applyGoalOcclusion && occlusionUniforms) {
      shader.uniforms.uOcclusionOpacity = occlusionUniforms.uOcclusionOpacity;
      shader.uniforms.uGoalDepthMaskEnabled = occlusionUniforms.uGoalDepthMaskEnabled;
      shader.uniforms.uGoalMaskOffsetUu = occlusionUniforms.uGoalMaskOffsetUu;
      shader.uniforms.uGoalMaskGradientDistanceUu = occlusionUniforms.uGoalMaskGradientDistanceUu;
      shader.uniforms.uGoalMaskBezier = occlusionUniforms.uGoalMaskBezier;
    }
    if (includeSpecularAA) {
      shader.uniforms.uSpecularAAStrength = specularAAUniforms.uSpecularAAStrength;
    }

    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vGoalWorldPos;')
      .replace(
        '#include <worldpos_vertex>',
        `#include <worldpos_vertex>
        vGoalWorldPos = (modelMatrix * vec4(transformed, 1.0)).xyz;`
      );

    shader.fragmentShader = shader.fragmentShader
      .replace(
        'uniform vec3 diffuse;',
        `uniform vec3 diffuse;
        varying vec3 vGoalWorldPos;
        uniform float uGoalUseTeamColor;
        uniform vec3 uGoalBlueColor;
        uniform vec3 uGoalOrangeColor;
        ${
          applyGoalOcclusion
            ? `uniform float uOcclusionOpacity;
        uniform float uGoalDepthMaskEnabled;
        uniform float uGoalMaskOffsetUu;
        uniform float uGoalMaskGradientDistanceUu;
        uniform vec4 uGoalMaskBezier;
        ${GOAL_DEPTH_MASK_GLSL_HELPERS}`
            : ''
        }
        ${includeSpecularAA ? 'uniform float uSpecularAAStrength;' : ''}`
      )
      .replace(
        'vec4 diffuseColor = vec4( diffuse, opacity );',
        `vec3 goalBaseCol = (uGoalUseTeamColor > 0.5)
          ? (vGoalWorldPos.z < 0.0 ? uGoalBlueColor : uGoalOrangeColor)
          : diffuse;
        float goalEffectiveOpacity = opacity;
        ${
          applyGoalOcclusion
            ? `if (uGoalDepthMaskEnabled > 0.5) {
          float goalDepthMask = computeGoalDepthMask(
            vGoalWorldPos,
            cameraPosition,
            uGoalMaskOffsetUu,
            uGoalMaskGradientDistanceUu,
            uGoalMaskBezier
          );
          goalEffectiveOpacity *= mix(1.0, uOcclusionOpacity, goalDepthMask);
        }`
            : ''
        }
        ${
          applyGoalOcclusion && occlusionPassMode === 'opaque'
            ? 'if (goalEffectiveOpacity < 0.999) discard;'
            : applyGoalOcclusion && occlusionPassMode === 'transparent'
              ? 'if (goalEffectiveOpacity >= 0.999 || goalEffectiveOpacity <= 0.001) discard;'
              : ''
        }
        vec4 diffuseColor = vec4( goalBaseCol, goalEffectiveOpacity );`
      );

    if (targetType === 'goalPostsGlow') {
      shader.fragmentShader = shader.fragmentShader.replace(
        'vec3 totalEmissiveRadiance = emissive;',
        `vec3 totalEmissiveRadiance = (uGoalUseTeamColor > 0.5)
          ? (vGoalWorldPos.z < 0.0 ? uGoalBlueColor : uGoalOrangeColor) * emissive
          : emissive;`
      );
    }

    if (includeSpecularAA) {
      shader.fragmentShader = shader.fragmentShader.replace(
        '#include <roughnessmap_fragment>',
        SPECULAR_AA_ROUGHNESS_FRAGMENT_CHUNK
      );
    }
  };

  material.customProgramCacheKey = () =>
    `driftwoods-goal-team-${targetType}-${occlusionPassMode}-${
      material.isMeshLambertMaterial ? 'lambert' : 'standard'
    }-v6`;
}

export function injectWallPostTrimOcclusionShader(
  material: Material & { isMeshLambertMaterial?: boolean },
  occlusionUniforms: DriftwoodsOcclusionUniforms,
  specularAAUniforms: DriftwoodsSpecularAAUniforms,
  isRampsTrim = false,
  includeSpecularAA = false,
  occlusionPassMode = 'all'
): void {
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uOcclusionOpacity = occlusionUniforms.uOcclusionOpacity;
    shader.uniforms.uWallExteriorOcclusionEnabled = occlusionUniforms.uWallExteriorOcclusionEnabled;
    shader.uniforms.uGoalDepthMaskEnabled = occlusionUniforms.uGoalDepthMaskEnabled;
    shader.uniforms.uGoalMaskOffsetUu = occlusionUniforms.uGoalMaskOffsetUu;
    shader.uniforms.uGoalMaskGradientDistanceUu = occlusionUniforms.uGoalMaskGradientDistanceUu;
    shader.uniforms.uGoalMaskBezier = occlusionUniforms.uGoalMaskBezier;
    if (includeSpecularAA) {
      shader.uniforms.uSpecularAAStrength = specularAAUniforms.uSpecularAAStrength;
    }

    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vOcclusionWorldPos;')
      .replace(
        '#include <worldpos_vertex>',
        `#include <worldpos_vertex>
        vOcclusionWorldPos = (modelMatrix * vec4(transformed, 1.0)).xyz;`
      );

    shader.fragmentShader = shader.fragmentShader
      .replace(
        'uniform vec3 diffuse;',
        `uniform vec3 diffuse;
        varying vec3 vOcclusionWorldPos;
        uniform float uOcclusionOpacity;
        uniform float uWallExteriorOcclusionEnabled;
        uniform float uGoalDepthMaskEnabled;
        uniform float uGoalMaskOffsetUu;
        uniform float uGoalMaskGradientDistanceUu;
        uniform vec4 uGoalMaskBezier;
        ${isRampsTrim ? GOAL_DEPTH_MASK_GLSL_HELPERS : ''}
        ${includeSpecularAA ? 'uniform float uSpecularAAStrength;' : ''}`
      )
      .replace(
        'vec4 diffuseColor = vec4( diffuse, opacity );',
        `float occlusionFactor = 0.0;
        vec3 P = vOcclusionWorldPos;
        float ax = abs(P.x);
        float az = abs(P.z);
        if (uWallExteriorOcclusionEnabled > 0.5) {
          vec3 camPos = cameraPosition;
          float sx = P.x < 0.0 ? -1.0 : 1.0;
          float sz = P.z < 0.0 ? -1.0 : 1.0;
          float camY = camPos.y;

          float sideWallLimit = 4035.0 - max(0.0, camY - 1538.0) * 0.95 - max(0.0, 160.0 - camY) * 1.3;
          float sideOccluded = smoothstep(sideWallLimit - 30.0, sideWallLimit + 20.0, camPos.x * sx);

          float backWallLimit = 5060.0 - max(0.0, camY - 1538.0) * 0.95 - max(0.0, 160.0 - camY) * 1.3;
          float backOccluded = smoothstep(backWallLimit - 30.0, backWallLimit + 20.0, camPos.z * sz);

          float cornerWallLimit = 7970.0 - max(0.0, camY - 1538.0) * 1.35 - max(0.0, 160.0 - camY) * 1.8;
          float inCornerQuad = smoothstep(2000.0, 2400.0, camPos.x * sx) * smoothstep(3000.0, 3400.0, camPos.z * sz);
          float cornerDirect = inCornerQuad * smoothstep(cornerWallLimit - 40.0, cornerWallLimit + 20.0, camPos.x * sx + camPos.z * sz);
          float cornerFromSide = sideOccluded * smoothstep(2800.0, 3400.0, camPos.z * sz);
          float cornerFromBack = backOccluded * smoothstep(1800.0, 2400.0, camPos.x * sx);
          float cornerOccluded = max(cornerDirect, max(cornerFromSide, cornerFromBack));

          sideOccluded = max(sideOccluded, cornerDirect * smoothstep(2800.0, 3400.0, az));
          backOccluded = max(backOccluded, cornerDirect * smoothstep(1800.0, 2400.0, ax));

          float wCorner = smoothstep(2560.0, 2600.0, ax) * smoothstep(3580.0, 3620.0, az);
          float wBack = smoothstep(3580.0, 3620.0, az);
          float wallOccluded = mix(mix(sideOccluded, backOccluded, wBack), cornerOccluded, wCorner);

          float ceilOccluded = smoothstep(2000.0, 2035.0, camY) * smoothstep(2020.0, 2040.0, P.y);
          occlusionFactor = max(wallOccluded, ceilOccluded);
        }
        ${
          isRampsTrim
            ? `if (uGoalDepthMaskEnabled > 0.5 && ax < 1000.0 && az > 4930.0) {
          float goalTrimRegion = smoothstep(995.0, 975.0, ax) * smoothstep(4930.0, 4950.0, az);
          float goalDepthMask = computeGoalDepthMask(
            P,
            cameraPosition,
            uGoalMaskOffsetUu,
            uGoalMaskGradientDistanceUu,
            uGoalMaskBezier
          );
          occlusionFactor = max(occlusionFactor, goalDepthMask * goalTrimRegion);
        }`
            : ''
        }
        float effectiveOpacity = opacity * mix(1.0, uOcclusionOpacity, clamp(occlusionFactor, 0.0, 1.0));
        ${
          occlusionPassMode === 'opaque'
            ? 'if (effectiveOpacity < 0.999) discard;'
            : occlusionPassMode === 'transparent'
              ? 'if (effectiveOpacity >= 0.999 || effectiveOpacity <= 0.001) discard;'
              : ''
        }
        vec4 diffuseColor = vec4( diffuse, effectiveOpacity );`
      );

    if (includeSpecularAA) {
      shader.fragmentShader = shader.fragmentShader.replace(
        '#include <roughnessmap_fragment>',
        SPECULAR_AA_ROUGHNESS_FRAGMENT_CHUNK
      );
    }
  };

  material.customProgramCacheKey = () =>
    `driftwoods-wall-occlusion-${isRampsTrim ? 'trim' : 'posts'}-${occlusionPassMode}-${
      material.isMeshLambertMaterial ? 'lambert' : 'standard'
    }-v3`;
}

export function injectRampsIndicatorRingShader(
  material: Material & { isMeshLambertMaterial?: boolean },
  groundUniforms: DriftwoodsGroundUniforms,
  specularAAUniforms: DriftwoodsSpecularAAUniforms,
  includeSpecularAA = false
): void {
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uBallRingPos = groundUniforms.uBallRingPos;
    shader.uniforms.uBallRingRadii = groundUniforms.uBallRingRadii;
    shader.uniforms.uBallRingOpacity = groundUniforms.uBallRingOpacity;
    if (includeSpecularAA) {
      shader.uniforms.uSpecularAAStrength = specularAAUniforms.uSpecularAAStrength;
    }

    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vRampWorldPos;')
      .replace(
        '#include <worldpos_vertex>',
        `#include <worldpos_vertex>
        vRampWorldPos = (modelMatrix * vec4(transformed, 1.0)).xyz;`
      );

    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
        varying vec3 vRampWorldPos;
        uniform vec3 uBallRingPos;
        uniform vec4 uBallRingRadii;
        uniform float uBallRingOpacity;
        ${includeSpecularAA ? 'uniform float uSpecularAAStrength;' : ''}`
      )
      .replace(
        '#include <dithering_fragment>',
        `#include <dithering_fragment>
        if (uBallRingOpacity > 0.001 && vRampWorldPos.y > 1.8) {
          float horizDist = length(vRampWorldPos.xz - uBallRingPos.xz);
          if (horizDist <= uBallRingRadii.y + 8.0) {
            float aa = max(fwidth(horizDist) * 0.85, 0.75);
            float outerRing = smoothstep(uBallRingRadii.x - aa, uBallRingRadii.x + aa, horizDist)
              * (1.0 - smoothstep(uBallRingRadii.y - aa, uBallRingRadii.y + aa, horizDist));
            float innerRing = smoothstep(uBallRingRadii.z - aa, uBallRingRadii.z + aa, horizDist)
              * (1.0 - smoothstep(uBallRingRadii.w - aa, uBallRingRadii.w + aa, horizDist));
            float rampTakeover = smoothstep(1.8, 2.3, vRampWorldPos.y);
            float ringAlpha = clamp(max(outerRing, innerRing) * rampTakeover * uBallRingOpacity, 0.0, 1.0);
            gl_FragColor.rgb = mix(gl_FragColor.rgb, vec3(1.0), ringAlpha);
          }
        }`
      );

    if (includeSpecularAA) {
      shader.fragmentShader = shader.fragmentShader.replace(
        '#include <roughnessmap_fragment>',
        SPECULAR_AA_ROUGHNESS_FRAGMENT_CHUNK
      );
    }
  };

  material.customProgramCacheKey = () =>
    `driftwoods-ramps-ring-${material.isMeshLambertMaterial ? 'lambert' : 'standard'}-v1`;
}
