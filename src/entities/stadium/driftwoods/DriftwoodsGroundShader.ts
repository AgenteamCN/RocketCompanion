/**
 * DriftwoodsGroundShader
 * GLSL shader injection routines for Driftwoods ground turf/decal texture blending
 * and Kaplanyan 2016 Geometric Specular Anti-Aliasing.
 */

import type { Material } from 'three';
import type {
  DriftwoodsGroundUniforms,
  DriftwoodsSpecularAAUniforms,
} from './DriftwoodsMaterialPaletteSpecs.ts';
import type { WallFxUniforms } from './WallFxShaderInjector.ts';

export const SPECULAR_AA_ROUGHNESS_FRAGMENT_CHUNK = `#include <roughnessmap_fragment>
        if (uSpecularAAStrength > 0.001) {
          vec3 dndu = dFdx(vNormal);
          vec3 dndv = dFdy(vNormal);
          float variance = uSpecularAAStrength * (dot(dndu, dndu) + dot(dndv, dndv));
          float kernelRoughness2 = min(2.0 * variance, 0.18);
          float filteredRoughness2 = clamp(roughnessFactor * roughnessFactor + kernelRoughness2, 0.0, 1.0);
          roughnessFactor = sqrt(filteredRoughness2);
        }`;

export function injectSpecularAAShader(
  material: Material,
  specularAAUniforms: DriftwoodsSpecularAAUniforms
): void {
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uSpecularAAStrength = specularAAUniforms.uSpecularAAStrength;
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform float uSpecularAAStrength;')
      .replace('#include <roughnessmap_fragment>', SPECULAR_AA_ROUGHNESS_FRAGMENT_CHUNK);
  };
  material.customProgramCacheKey = () => 'driftwoods-standard-specular-aa-v1';
}

export function injectGroundDetailShader(
  material: Material & { isMeshLambertMaterial?: boolean },
  groundUniforms: DriftwoodsGroundUniforms,
  wallFxUniforms: WallFxUniforms
): void {
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uGroundMode = groundUniforms.uGroundMode;
    shader.uniforms.uQ1BakedReady = groundUniforms.uQ1BakedReady;
    shader.uniforms.uBakedBlueGroundMap = groundUniforms.uBakedBlueGroundMap;
    shader.uniforms.uBakedOrangeGroundMap = groundUniforms.uBakedOrangeGroundMap;
    shader.uniforms.uQ1GroundMap = groundUniforms.uQ1GroundMap;
    shader.uniforms.uQ1UvScale = groundUniforms.uQ1UvScale;
    shader.uniforms.uQ1UvOffset = groundUniforms.uQ1UvOffset;
    shader.uniforms.uGroundColor = groundUniforms.uGroundColor;
    shader.uniforms.uLineColor = groundUniforms.uLineColor;
    shader.uniforms.uLineThreshold = groundUniforms.uLineThreshold;
    shader.uniforms.uLineSmoothness = groundUniforms.uLineSmoothness;
    shader.uniforms.uOrigLineThreshold = groundUniforms.uOrigLineThreshold;
    shader.uniforms.uOrigLineSmoothness = groundUniforms.uOrigLineSmoothness;
    shader.uniforms.uL0Color = groundUniforms.uL0Color;
    shader.uniforms.uL1Color = groundUniforms.uL1Color;
    shader.uniforms.uL2Color = groundUniforms.uL2Color;
    shader.uniforms.uL3Color = groundUniforms.uL3Color;
    shader.uniforms.uL4Color = groundUniforms.uL4Color;
    shader.uniforms.uL5Color = groundUniforms.uL5Color;
    shader.uniforms.uL6Color = groundUniforms.uL6Color;
    shader.uniforms.uL4UseTeamColor = groundUniforms.uL4UseTeamColor;
    shader.uniforms.uL5UseTeamColor = groundUniforms.uL5UseTeamColor;
    shader.uniforms.uL6UseTeamColor = groundUniforms.uL6UseTeamColor;
    shader.uniforms.uBlueTeamColor = wallFxUniforms.uBlueTeamColor;
    shader.uniforms.uOrangeTeamColor = wallFxUniforms.uOrangeTeamColor;

    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vGroundWorldPos;')
      .replace(
        '#include <worldpos_vertex>',
        `#include <worldpos_vertex>
        vGroundWorldPos = (modelMatrix * vec4(transformed, 1.0)).xyz;`
      );

    shader.fragmentShader = shader.fragmentShader
      .replace(
        'uniform vec3 diffuse;',
        `uniform vec3 diffuse;
        varying vec3 vGroundWorldPos;
        uniform float uGroundMode;
        uniform float uQ1BakedReady;
        uniform sampler2D uBakedBlueGroundMap;
        uniform sampler2D uBakedOrangeGroundMap;
        uniform sampler2D uQ1GroundMap;
        uniform vec2 uQ1UvScale;
        uniform vec2 uQ1UvOffset;
        uniform vec3 uGroundColor;
        uniform vec3 uLineColor;
        uniform float uLineThreshold;
        uniform float uLineSmoothness;
        uniform float uOrigLineThreshold;
        uniform float uOrigLineSmoothness;
        uniform vec3 uL0Color;
        uniform vec3 uL1Color;
        uniform vec3 uL2Color;
        uniform vec3 uL3Color;
        uniform vec3 uL4Color;
        uniform vec3 uL5Color;
        uniform vec3 uL6Color;
        uniform float uL4UseTeamColor;
        uniform float uL5UseTeamColor;
        uniform float uL6UseTeamColor;
        uniform vec3 uBlueTeamColor;
        uniform vec3 uOrangeTeamColor;`
      )
      .replace(
        '#include <map_fragment>',
        `#ifdef USE_MAP
          if (uGroundMode > 0.5) {
            vec2 q1Uv = vec2(vGroundWorldPos.x / 4096.0, vGroundWorldPos.z / 6000.0) * uQ1UvScale + uQ1UvOffset;
            const vec2 Q1_TEX_SIZE = vec2(2048.0, 3000.0);
            vec2 uvDx = dFdx(q1Uv * Q1_TEX_SIZE);
            vec2 uvDy = dFdy(q1Uv * Q1_TEX_SIZE);
            float footprintTexels = max(length(uvDx), length(uvDy));

            if (uQ1BakedReady > 0.5) {
              vec4 bakedDecal;
              if (vGroundWorldPos.z < -40.0) {
                bakedDecal = texture2D(uBakedBlueGroundMap, q1Uv);
              } else if (vGroundWorldPos.z > 40.0) {
                bakedDecal = texture2D(uBakedOrangeGroundMap, q1Uv);
              } else {
                vec4 blueSample = texture2D(uBakedBlueGroundMap, q1Uv);
                vec4 orangeSample = texture2D(uBakedOrangeGroundMap, q1Uv);
                bakedDecal = mix(blueSample, orangeSample, smoothstep(-40.0, 40.0, vGroundWorldPos.z));
              }
              float rawCov = bakedDecal.a;
              float aaHalfWidth = max(uLineSmoothness, fwidth(rawCov) * 0.75);
              float sharpCov = smoothstep(
                clamp(uLineThreshold - aaHalfWidth, 0.0, 0.98),
                clamp(uLineThreshold + aaHalfWidth, 0.02, 1.0),
                rawCov
              );
              float minificationBlend = smoothstep(0.75, 1.85, footprintTexels);
              float thresholdScale = clamp((0.5 - uLineThreshold) * 1.15 + 1.0, 0.35, 1.85);
              float integratedCov = clamp(rawCov * thresholdScale, 0.0, 1.0);
              float finalMask = mix(sharpCov, integratedCov, minificationBlend);
              diffuseColor.rgb = mix(uL0Color, bakedDecal.rgb, finalMask);
            } else {
              float smoothGray = texture2D(uQ1GroundMap, q1Uv).r;
              if (smoothGray <= 0.002) {
                diffuseColor.rgb = uL0Color;
              } else {
                const vec2 Q1_INV_SIZE = vec2(1.0 / 2048.0, 1.0 / 3000.0);
                vec2 baseTexelUv = (floor(fract(abs(q1Uv)) * Q1_TEX_SIZE) + 0.5) * Q1_INV_SIZE;
                float peakGray = smoothGray;
                if (peakGray < 0.788235) {
                  for (int dy = -1; dy <= 1; dy++) {
                    for (int dx = -1; dx <= 1; dx++) {
                      float g = texture2D(uQ1GroundMap, baseTexelUv + vec2(float(dx), float(dy)) * Q1_INV_SIZE).r;
                      peakGray = max(peakGray, g);
                    }
                  }
                }
                vec3 layerColor = uL0Color;
                if (peakGray < 0.070588) {
                  layerColor = uL0Color;
                } else if (peakGray < 0.215686) {
                  layerColor = uL1Color;
                } else if (peakGray < 0.356863) {
                  layerColor = uL2Color;
                } else if (peakGray < 0.501961) {
                  layerColor = uL3Color;
                } else if (peakGray < 0.643137) {
                  layerColor = uL4Color;
                } else if (peakGray < 0.788235) {
                  layerColor = uL5Color;
                } else {
                  layerColor = uL6Color;
                }
                float coverage = clamp(smoothGray / max(0.0001, peakGray), 0.0, 1.0);
                float halfWidth = max(uLineSmoothness, fwidth(coverage) * 0.75);
                float lineMask = smoothstep(uLineThreshold - halfWidth, uLineThreshold + halfWidth, coverage);
                diffuseColor.rgb = mix(uL0Color, layerColor, lineMask);
              }
            }
          } else {
            vec4 sampledDiffuseColor = texture2D(map, vMapUv);
            #ifdef DECODE_VIDEO_TEXTURE
              sampledDiffuseColor = sRGBTransferEOTF(sampledDiffuseColor);
            #endif
            float lineLum = dot(sampledDiffuseColor.rgb, vec3(0.2126, 0.7152, 0.0722));
            float halfWidth = max(uOrigLineSmoothness, fwidth(lineLum) * 0.75);
            float isLine = smoothstep(uOrigLineThreshold - halfWidth, uOrigLineThreshold + halfWidth, lineLum);
            diffuseColor.rgb = mix(uGroundColor, uLineColor, isLine);
          }
        #endif`
      );
  };

  material.customProgramCacheKey = () =>
    material.isMeshLambertMaterial
      ? 'driftwoods-ground-tint-lambert-v10-q1-baked-af16'
      : 'driftwoods-ground-tint-standard-v10-q1-baked-af16';
}
