/**
 * SkyboxCommonShader.ts
 * Shared vertex shader and common GLSL functions / auxiliary FX layer samplers
 * used by both HemisphereSkyShader and FullSphereSkyShader.
 */

export const SKYBOX_VERTEX_SHADER = /* glsl */ `
  varying vec3 vSkyDirection;
  void main() {
    vSkyDirection = position;
    // Lock sky dome center to camera eye in view space so translation never causes parallax
    vec4 viewPos = modelViewMatrix * vec4(position, 0.0);
    gl_Position = projectionMatrix * vec4(viewPos.xyz, 1.0);
    gl_Position.z = gl_Position.w;
  }
`;

export const SKYBOX_COMMON_GLSL_HEADER = /* glsl */ `
  varying vec3 vSkyDirection;
  uniform sampler2D uSkyMap;
  uniform float uSkyCategory; // 0.0 = hemisphere, 1.0 = full-sphere
  uniform float uUseTexture;
  uniform float uTextureScaleU;
  uniform float uRotationRad;
  uniform float uExposure;
  uniform float uUpperVerticalStretch;
  uniform float uContrastBalance;
  uniform float uContrastMidpoint;
  uniform float uHorizonOffset;
  uniform float uHorizonBlendWidth;
  uniform float uHorizonHazeStrength;
  uniform float uGroundSampleHorizon;
  uniform float uGroundGradientRange;
  uniform float uGroundHorizonStrength;
  uniform vec3 uHorizonColor;
  uniform vec3 uGroundColor;
  uniform vec3 uZenithColor;
  uniform vec3 uMiddleColor;

  // Full-sphere lower-hemisphere vertical V-offset, cutoff, fade & dimming uniforms
  uniform float uFullSphereLowerVOffset;
  uniform float uFullSphereLowerVerticalStretch;
  uniform float uFullSphereLowerCutoffElev;
  uniform float uFullSphereLowerFadeRange;
  uniform float uFullSphereLowerDimming;
  uniform float uFullSphereLowerSampleHorizon;

  // Auxiliary Layer 1: Sun Corona & Glow
  uniform float uCoronaEnabled;
  uniform sampler2D uCoronaMap;
  uniform sampler2D uSunGlowMap;
  uniform vec3 uSunDir;
  uniform vec3 uSunRight;
  uniform vec3 uSunUp;
  uniform float uCoronaSize;
  uniform float uCoronaIntensity;
  uniform float uSunGlowSize;
  uniform float uSunGlowIntensity;
  uniform vec3 uSunGlowColor;

  // Auxiliary Layer 2: Horizon Cumulus Overlay
  uniform float uCloudOverlayEnabled;
  uniform sampler2D uCloudOverlayMap;
  uniform float uCloudOverlayOpacity;
  uniform float uCloudOverlayScaleU;
  uniform float uCloudOverlayElevationOffset;
  uniform float uCloudScrollRad;

  // Auxiliary Layer 3: OOB Cloud-Sea Normal
  uniform float uOobNormalEnabled;
  uniform sampler2D uOobNormalMap;
  uniform float uOobNormalStrength;
  uniform float uOobNormalTileScale;
  uniform float uOobScrollOffset;

  const float INV_TWO_PI = 0.15915494309189535;
  const float INV_PI = 0.3183098861837907;
  const float INV_HALF_PI = 0.6366197723675814;

  // Soft azimuthal contrast balancer: lifts dark shadow hemisphere & compresses bright sun-side glare
  vec3 applySkyContrastBalance(vec3 col, float balance, float midpoint) {
    if (balance <= 0.001) return col;
    float lum = max(0.001, dot(col, vec3(0.2126, 0.7152, 0.0722)));
    float exponent = mix(1.0, 0.38, balance);
    float targetLum = midpoint * pow(lum / max(0.02, midpoint), exponent);
    targetLum = targetLum / (1.0 + balance * 0.45 * max(0.0, targetLum - midpoint));
    vec3 balanced = col * (targetLum / lum);
    float finalLum = dot(balanced, vec3(0.2126, 0.7152, 0.0722));
    return mix(balanced, vec3(finalLum), balance * 0.15);
  }

  // Applies optional Horizon Cumulus Cloud Overlay & Farmstead Sun Corona / Glow to upper sky color
  vec3 applyAuxiliaryUpperSkyLayers(vec3 skyCol, vec3 dir, float elev, float bw) {
    // Optional Layer 2: Forbidden Temple Cumulus Cloud Overlay
    if (uCloudOverlayEnabled > 0.5 && elev > -bw) {
      float cloudElev = clamp(max(0.0, elev - uCloudOverlayElevationOffset), 0.0, 1.0);
      float cloudTheta = asin(cloudElev);
      float cloudV = clamp(cloudTheta * INV_HALF_PI, 0.02, 0.995);
      float cloudU = (atan(dir.z, dir.x) + uRotationRad + uCloudScrollRad) * INV_TWO_PI * uCloudOverlayScaleU + 0.5;
      vec3 cloudTex = texture2D(uCloudOverlayMap, vec2(cloudU, cloudV)).rgb;
      float cloudMask = smoothstep(0.04, 0.32, cloudTex.r - cloudTex.b * 0.58) * smoothstep(0.55, 0.02, cloudV);
      skyCol = mix(skyCol, cloudTex * max(0.75, uExposure * 1.15), clamp(cloudMask * uCloudOverlayOpacity, 0.0, 1.0));
    }

    // Optional Layer 1: Farmstead Sun Corona (6-ray starburst) & Radial Sun Glow
    if (uCoronaEnabled > 0.5) {
      float cosAngle = dot(dir, uSunDir);
      if (cosAngle > 0.0) {
        float projX = dot(dir, uSunRight);
        float projY = dot(dir, uSunUp);

        vec2 glowUv = vec2(projX, projY) / max(0.04, uSunGlowSize) + 0.5;
        if (glowUv.x > 0.0 && glowUv.x < 1.0 && glowUv.y > 0.0 && glowUv.y < 1.0) {
          vec3 glowSample = texture2D(uSunGlowMap, glowUv).rgb;
          float haloMask = glowSample.g;
          float coreMask = glowSample.r;
          vec3 glowContrib = (uSunGlowColor * haloMask + vec3(1.0, 0.96, 0.88) * coreMask * 0.65) * uSunGlowIntensity;
          skyCol += glowContrib;
        }

        vec2 coronaUv = vec2(projX, projY) / max(0.02, uCoronaSize) + 0.5;
        if (coronaUv.x > 0.0 && coronaUv.x < 1.0 && coronaUv.y > 0.0 && coronaUv.y < 1.0) {
          vec3 coronaSample = texture2D(uCoronaMap, coronaUv).rgb;
          vec3 coronaTint = mix(uSunGlowColor, vec3(1.0, 0.98, 0.92), 0.55);
          skyCol += coronaSample * coronaTint * uCoronaIntensity;
        }
      }
    }
    return skyCol;
  }

  // Applies optional OOB Cloud-Sea normal map ripples to the lower hemisphere
  vec3 applyAuxiliaryLowerOobNormal(vec3 lowerCol, vec3 horizonRingCol, vec3 dir, float elev, float bw) {
    if (uOobNormalEnabled > 0.5 && elev < bw) {
      float planeDist = 1.0 / (abs(elev) + 0.16);
      vec2 seaUv1 = dir.xz * planeDist * (uOobNormalTileScale * 0.12) + vec2(uOobScrollOffset, uOobScrollOffset * 0.6);
      vec2 seaUv2 = dir.xz * planeDist * (uOobNormalTileScale * 0.23) - vec2(uOobScrollOffset * 0.7, -uOobScrollOffset * 0.5);
      vec3 n1 = texture2D(uOobNormalMap, seaUv1).xyz * 2.0 - 1.0;
      vec3 n2 = texture2D(uOobNormalMap, seaUv2).xyz * 2.0 - 1.0;
      vec3 seaNormal = normalize(vec3((n1.xy + n2.xy) * uOobNormalStrength, 1.0));
      vec3 lightHorizontal = normalize(vec3(uSunDir.x, max(0.15, uSunDir.y), uSunDir.z));
      float seaDiff = clamp(dot(seaNormal, lightHorizontal), 0.0, 1.0);
      float distanceFade = smoothstep(0.92, 0.02, abs(elev));
      vec3 seaHighlight = mix(horizonRingCol, uSunGlowColor, 0.25) * pow(seaDiff, 2.2) * uOobNormalStrength * 0.85;
      lowerCol += seaHighlight * distanceFade;
    }
    return lowerCol;
  }
`;

import * as THREE from 'three';
import {
  SKYBOX_TEXTURE_PATH,
  CORONA_TEXTURE_PATH,
  SUN_GLOW_TEXTURE_PATH,
  CLOUD_OVERLAY_TEXTURE_PATH,
  OOB_NORMAL_TEXTURE_PATH,
  type SkyboxConfig,
} from '../../../ui-core/config/skyboxConfig.ts';
import { resolveAssetPath } from '../../../utils/AssetResponseValidator.ts';

const cachedSkyTexturesByPath = new Map<string, THREE.Texture>();
let cachedCoronaTexture: THREE.Texture | null = null;
let cachedSunGlowTexture: THREE.Texture | null = null;
let cachedCloudOverlayTexture: THREE.Texture | null = null;
let cachedOobNormalTexture: THREE.Texture | null = null;

export function loadSkyboxTexture(path = SKYBOX_TEXTURE_PATH): THREE.Texture {
  const resolvedPath = resolveAssetPath(path || SKYBOX_TEXTURE_PATH);
  const existing = cachedSkyTexturesByPath.get(resolvedPath);
  if (existing) return existing;
  const loader = new THREE.TextureLoader();
  const tex = loader.load(
    resolvedPath,
    (loaded) => {
      loaded.needsUpdate = true;
    },
    undefined,
    (err) => {
      console.warn(`[ArenaSky] Failed to load skybox texture (${resolvedPath}):`, err);
    }
  );
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.ClampToEdgeWrapping;
  tex.generateMipmaps = false;
  tex.minFilter = THREE.LinearFilter;
  tex.magFilter = THREE.LinearFilter;
  cachedSkyTexturesByPath.set(resolvedPath, tex);
  return tex;
}

export function loadCoronaTexture(): THREE.Texture {
  if (cachedCoronaTexture) return cachedCoronaTexture;
  const loader = new THREE.TextureLoader();
  const tex = loader.load(resolveAssetPath(CORONA_TEXTURE_PATH));
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.ClampToEdgeWrapping;
  tex.wrapT = THREE.ClampToEdgeWrapping;
  tex.minFilter = THREE.LinearFilter;
  tex.magFilter = THREE.LinearFilter;
  cachedCoronaTexture = tex;
  return tex;
}

export function loadSunGlowTexture(): THREE.Texture {
  if (cachedSunGlowTexture) return cachedSunGlowTexture;
  const loader = new THREE.TextureLoader();
  const tex = loader.load(resolveAssetPath(SUN_GLOW_TEXTURE_PATH));
  tex.colorSpace = THREE.NoColorSpace;
  tex.wrapS = THREE.ClampToEdgeWrapping;
  tex.wrapT = THREE.ClampToEdgeWrapping;
  tex.minFilter = THREE.LinearFilter;
  tex.magFilter = THREE.LinearFilter;
  cachedSunGlowTexture = tex;
  return tex;
}

export function loadCloudOverlayTexture(): THREE.Texture {
  if (cachedCloudOverlayTexture) return cachedCloudOverlayTexture;
  cachedCloudOverlayTexture = loadSkyboxTexture(CLOUD_OVERLAY_TEXTURE_PATH);
  return cachedCloudOverlayTexture;
}

export function loadOobNormalTexture(): THREE.Texture {
  if (cachedOobNormalTexture) return cachedOobNormalTexture;
  const loader = new THREE.TextureLoader();
  const tex = loader.load(resolveAssetPath(OOB_NORMAL_TEXTURE_PATH));
  tex.colorSpace = THREE.NoColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.generateMipmaps = true;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.magFilter = THREE.LinearFilter;
  cachedOobNormalTexture = tex;
  return tex;
}

export function updateCoronaSunBasisUniforms(
  uniforms: {
    uSunDir: { value: THREE.Vector3 };
    uSunRight: { value: THREE.Vector3 };
    uSunUp: { value: THREE.Vector3 };
  } | null,
  c: Partial<SkyboxConfig> & { textureRotationDeg?: number },
  sceneSunDir: THREE.Vector3
): void {
  if (!uniforms) return;
  const sunDir = uniforms.uSunDir.value;
  if (c.coronaFollowSceneSun) {
    sunDir.copy(sceneSunDir).normalize();
  } else {
    const rotDeg = Number(c.rotationDeg ?? c.textureRotationDeg ?? 0) || 0;
    const azDeg = (Number(c.coronaAzimuthDeg) || 0) - rotDeg;
    const elDeg = Number(c.coronaElevationDeg) ?? 3.5;
    const azRad = (azDeg * Math.PI) / 180;
    const elRad = (elDeg * Math.PI) / 180;
    const cosEl = Math.cos(elRad);
    sunDir.set(cosEl * Math.cos(azRad), Math.sin(elRad), cosEl * Math.sin(azRad)).normalize();
  }
  const worldUp =
    Math.abs(sunDir.y) < 0.98 ? new THREE.Vector3(0, 1, 0) : new THREE.Vector3(1, 0, 0);
  const sunRight = uniforms.uSunRight.value.crossVectors(worldUp, sunDir).normalize();
  const sunUp = uniforms.uSunUp.value.crossVectors(sunDir, sunRight).normalize();

  const rotRad = ((Number(c.coronaRotationDeg) || 0) * Math.PI) / 180;
  if (Math.abs(rotRad) > 1e-4) {
    const cosR = Math.cos(rotRad);
    const sinR = Math.sin(rotRad);
    const rx = sunRight.x * cosR + sunUp.x * sinR;
    const ry = sunRight.y * cosR + sunUp.y * sinR;
    const rz = sunRight.z * cosR + sunUp.z * sinR;
    const ux = -sunRight.x * sinR + sunUp.x * cosR;
    const uy = -sunRight.y * sinR + sunUp.y * cosR;
    const uz = -sunRight.z * sinR + sunUp.z * cosR;
    sunRight.set(rx, ry, rz).normalize();
    sunUp.set(ux, uy, uz).normalize();
  }
}
