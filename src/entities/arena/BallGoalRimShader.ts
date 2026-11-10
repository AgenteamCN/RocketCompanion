import * as THREE from 'three';
import { STANDARD_GOAL_VOLUME_BOX } from '../../physics/RocketSimConstants.ts';
import {
  getBallGoalRimFxConfig,
  getGoalVolumeBoxForPreset,
  registerGoalVolumeTunerApplier,
} from '../../ui-core/config/goalVolumeTunerConfig.ts';
import {
  ballVisualRuntimeConfig,
  type BallVisualConfig,
} from '../../ui-core/config/ballVisualConfig.ts';

export const CLASSIC_BALL_RADIUS = 95;

export const ballGoalUniforms = {
  uGoalEffectEnabled: { value: 1.0 },
  uGoalPlaneMinY: { value: Number(STANDARD_GOAL_VOLUME_BOX.minY) },
  uGoalPlaneMaxY: { value: Number(STANDARD_GOAL_VOLUME_BOX.maxY) },
  uGoalHalfWidthX: { value: Number(STANDARD_GOAL_VOLUME_BOX.halfWidthX) },
  uGoalMaxZ: { value: Number(STANDARD_GOAL_VOLUME_BOX.maxZ) },
  uGoalTime: { value: 0.0 },
  uGoalPenetration: { value: 0.0 },
  uGoalJitterWorldOffset: { value: new THREE.Vector3(0, 0, 0) },
  uGoalRimRange: { value: new THREE.Vector2(0.6, 1.0) },
  uGoalRimBezier: { value: new THREE.Vector4(0.75, 0.01, 1.0, 0.24) },
  uGoalRimColor: { value: new THREE.Color('#989898') },
  uGoalRimIntensity: { value: 1.0 },
  uGoalCoreColor: { value: new THREE.Color('#2d2d2d') },
  uGoalCoreBrightness: { value: 1.0 },
  uGoalSeamParams: { value: new THREE.Vector2(10.0, 0.8) },
};

export function syncBallGoalRimUniforms(): void {
  const rimCfg = getBallGoalRimFxConfig();
  if (!rimCfg) return;
  const innerFrac = Math.max(0.0, Math.min(0.999, (Number(rimCfg.innerStartPct) ?? 60) / 100));
  const outerFrac = Math.max(
    innerFrac + 0.001,
    Math.min(1.0, (Number(rimCfg.outerEndPct) ?? 100) / 100)
  );
  ballGoalUniforms.uGoalRimRange.value.set(innerFrac, outerFrac);
  ballGoalUniforms.uGoalRimBezier.value.set(
    Math.max(0.0, Math.min(1.0, Number(rimCfg.bezierP1X) ?? 0.75)),
    Number.isFinite(Number(rimCfg.bezierP1Y)) ? Number(rimCfg.bezierP1Y) : 0.01,
    Math.max(0.0, Math.min(1.0, Number(rimCfg.bezierP2X) ?? 1.0)),
    Number.isFinite(Number(rimCfg.bezierP2Y)) ? Number(rimCfg.bezierP2Y) : 0.24
  );
  try {
    ballGoalUniforms.uGoalRimColor.value.set(rimCfg.rimColor || '#989898');
  } catch {
    ballGoalUniforms.uGoalRimColor.value.set('#989898');
  }
  ballGoalUniforms.uGoalRimIntensity.value = Math.max(0.0, Number(rimCfg.rimIntensity) ?? 1.0);
  try {
    ballGoalUniforms.uGoalCoreColor.value.set(rimCfg.coreColor || '#2d2d2d');
  } catch {
    ballGoalUniforms.uGoalCoreColor.value.set('#2d2d2d');
  }
  ballGoalUniforms.uGoalCoreBrightness.value = Math.max(0.0, Number(rimCfg.coreBrightness) ?? 1.0);
  ballGoalUniforms.uGoalSeamParams.value.set(
    Math.max(0.0, Number(rimCfg.seamWidthUu) ?? 10.0),
    Math.max(0.0, Number(rimCfg.seamIntensity) ?? 0.8)
  );
}

syncBallGoalRimUniforms();
registerGoalVolumeTunerApplier(() => {
  syncBallGoalRimUniforms();
});

export function syncBallGoalEffectEnabledUniform(
  config: Partial<BallVisualConfig> = ballVisualRuntimeConfig
): void {
  const rimCfg = getBallGoalRimFxConfig();
  ballGoalUniforms.uGoalEffectEnabled.value =
    config.goalDarkenJitterEnabled !== false && rimCfg?.enabled !== false ? 1.0 : 0.0;
}

export function attachBallGoalShader(mat: THREE.Material | null | undefined): void {
  if (!mat || mat.userData?.hasBallGoalShader) return;
  mat.userData = mat.userData || {};
  mat.userData.hasBallGoalShader = true;

  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uGoalEffectEnabled = ballGoalUniforms.uGoalEffectEnabled;
    shader.uniforms.uGoalPlaneMinY = ballGoalUniforms.uGoalPlaneMinY;
    shader.uniforms.uGoalPlaneMaxY = ballGoalUniforms.uGoalPlaneMaxY;
    shader.uniforms.uGoalHalfWidthX = ballGoalUniforms.uGoalHalfWidthX;
    shader.uniforms.uGoalMaxZ = ballGoalUniforms.uGoalMaxZ;
    shader.uniforms.uGoalTime = ballGoalUniforms.uGoalTime;
    shader.uniforms.uGoalPenetration = ballGoalUniforms.uGoalPenetration;
    shader.uniforms.uGoalJitterWorldOffset = ballGoalUniforms.uGoalJitterWorldOffset;
    shader.uniforms.uGoalRimRange = ballGoalUniforms.uGoalRimRange;
    shader.uniforms.uGoalRimBezier = ballGoalUniforms.uGoalRimBezier;
    shader.uniforms.uGoalRimColor = ballGoalUniforms.uGoalRimColor;
    shader.uniforms.uGoalRimIntensity = ballGoalUniforms.uGoalRimIntensity;
    shader.uniforms.uGoalCoreColor = ballGoalUniforms.uGoalCoreColor;
    shader.uniforms.uGoalCoreBrightness = ballGoalUniforms.uGoalCoreBrightness;
    shader.uniforms.uGoalSeamParams = ballGoalUniforms.uGoalSeamParams;

    shader.vertexShader =
      `varying vec3 vBallWorldPos;\nvarying vec3 vBallViewNormal;\nvarying vec3 vBallViewDir;\nuniform vec3 uGoalJitterWorldOffset;\n` +
      shader.vertexShader.replace(
        '#include <project_vertex>',
        `vec4 mvPosition = vec4( transformed, 1.0 );
#ifdef USE_INSTANCING
  mvPosition = instanceMatrix * mvPosition;
#endif
vec4 ballWorldPosition = modelMatrix * mvPosition;
ballWorldPosition.xyz += uGoalJitterWorldOffset;
vBallWorldPos = ballWorldPosition.xyz;
mvPosition = viewMatrix * ballWorldPosition;
vBallViewNormal = normalize( normalMatrix * objectNormal );
vBallViewDir = normalize( -mvPosition.xyz );
gl_Position = projectionMatrix * mvPosition;`
      );

    shader.fragmentShader =
      `varying vec3 vBallWorldPos;
varying vec3 vBallViewNormal;
varying vec3 vBallViewDir;
uniform float uGoalEffectEnabled;
uniform float uGoalPlaneMinY;
uniform float uGoalPlaneMaxY;
uniform float uGoalHalfWidthX;
uniform float uGoalMaxZ;
uniform float uGoalTime;
uniform float uGoalPenetration;
uniform vec2 uGoalRimRange;
uniform vec4 uGoalRimBezier;
uniform vec3 uGoalRimColor;
uniform float uGoalRimIntensity;
uniform vec3 uGoalCoreColor;
uniform float uGoalCoreBrightness;
uniform vec2 uGoalSeamParams;

float evalGoalRimCubicBezier01(float t, vec4 bez) {
  float x = clamp(t, 0.0, 1.0);
  float x1 = clamp(bez.x, 0.0, 1.0);
  float y1 = bez.y;
  float x2 = clamp(bez.z, 0.0, 1.0);
  float y2 = bez.w;
  float u = x;
  for (int i = 0; i < 5; i++) {
    float om = 1.0 - u;
    float bx = 3.0 * om * om * u * x1 + 3.0 * om * u * u * x2 + u * u * u - x;
    float dbx = 3.0 * om * om * x1 + 6.0 * om * u * (x2 - x1) + 3.0 * u * u * (1.0 - x2);
    if (abs(dbx) < 1e-4) break;
    u = clamp(u - bx / dbx, 0.0, 1.0);
  }
  float om = 1.0 - u;
  return 3.0 * om * om * u * y1 + 3.0 * om * u * u * y2 + u * u * u;
}
` +
      shader.fragmentShader.replace(
        '#include <dithering_fragment>',
        `#include <dithering_fragment>
if (uGoalEffectEnabled > 0.5 && uGoalPenetration > 0.001) {
  float absZ = abs(vBallWorldPos.z);
  float inMouthX = 1.0 - smoothstep(uGoalHalfWidthX - 6.0, uGoalHalfWidthX + 6.0, abs(vBallWorldPos.x));
  float inMouthY = 1.0 - smoothstep(uGoalMaxZ - 6.0, uGoalMaxZ + 6.0, vBallWorldPos.y);
  float inDepthBack = 1.0 - smoothstep(uGoalPlaneMaxY - 8.0, uGoalPlaneMaxY + 8.0, absZ);
  float sliceDist = absZ - uGoalPlaneMinY;
  float insideMask = smoothstep(-2.0, 2.0, sliceDist) * inMouthX * inMouthY * inDepthBack;
  if (insideMask > 0.001) {
    vec3 viewDir = normalize(vBallViewDir);
    vec3 surfNormal = normalize(vBallViewNormal);
    float ndotv = clamp(abs(dot(surfNormal, viewDir)), 0.0, 1.0);
    float radialPct = sqrt(max(0.0, 1.0 - ndotv * ndotv));
    float innerStart = uGoalRimRange.x;
    float outerEnd = max(innerStart + 0.001, uGoalRimRange.y);
    float tRim = clamp((radialPct - innerStart) / (outerEnd - innerStart), 0.0, 1.0);
    float outerRim = clamp(evalGoalRimCubicBezier01(tRim, uGoalRimBezier), 0.0, 1.0);
    float planeSeam = (uGoalSeamParams.x > 0.01 && uGoalSeamParams.y > 0.001)
      ? exp(-abs(sliceDist) / max(0.1, uGoalSeamParams.x)) * uGoalSeamParams.y
      : 0.0;
    float rimGlow = clamp(max(outerRim, planeSeam), 0.0, 1.0);
    vec3 darkCore = uGoalCoreColor * uGoalCoreBrightness;
    vec3 brightRim = uGoalRimColor * uGoalRimIntensity;
    vec3 goalBallColor = mix(darkCore, brightRim, rimGlow);
    gl_FragColor.rgb = mix(gl_FragColor.rgb, goalBallColor, insideMask);
  }
}`
      );
  };
  mat.customProgramCacheKey = () => 'ball-goal-darken-jitter-v4';
  mat.needsUpdate = true;
}

export function updateBallGoalEffect(
  ballGroup: THREE.Object3D | null | undefined,
  isThrowback = false,
  delta = 0
): void {
  if (!ballGroup) return;
  const dt = Number.isFinite(delta) && delta > 0 ? Math.min(delta, 0.1) : 1 / 120;
  ballGoalUniforms.uGoalTime.value += dt;

  const box = getGoalVolumeBoxForPreset(isThrowback);
  ballGoalUniforms.uGoalPlaneMinY.value = box.minY;
  ballGoalUniforms.uGoalPlaneMaxY.value = box.maxY;
  ballGoalUniforms.uGoalHalfWidthX.value = box.halfWidthX;
  ballGoalUniforms.uGoalMaxZ.value = box.maxZ;

  syncBallGoalRimUniforms();
  const rimCfg = getBallGoalRimFxConfig();

  const enabled =
    ballVisualRuntimeConfig.goalDarkenJitterEnabled !== false && rimCfg?.enabled !== false;
  ballGoalUniforms.uGoalEffectEnabled.value = enabled ? 1.0 : 0.0;
  if (!enabled) {
    ballGoalUniforms.uGoalPenetration.value = 0.0;
    ballGoalUniforms.uGoalJitterWorldOffset.value.set(0, 0, 0);
    return;
  }

  const pos = ballGroup.position;
  const xUu = pos.x;
  const zUu = pos.y;
  const absYUu = Math.abs(pos.z);
  const r = CLASSIC_BALL_RADIUS;

  const inMouth =
    Math.abs(xUu) < box.halfWidthX + r * 0.35 &&
    zUu > (box.minZ ?? 0.0) - r * 0.25 &&
    zUu < box.maxZ + r * 0.35 &&
    absYUu < box.maxY + r * 0.25;

  if (!inMouth || absYUu <= box.minY - r) {
    ballGoalUniforms.uGoalPenetration.value = 0.0;
    ballGoalUniforms.uGoalJitterWorldOffset.value.set(0, 0, 0);
    return;
  }

  const penetration = Math.max(0.0, Math.min(1.0, (absYUu - (box.minY - r)) / (2.0 * r)));
  ballGoalUniforms.uGoalPenetration.value = penetration;

  const jitterScale = Math.max(0.0, Number(rimCfg?.jitterAmplitude) ?? 1.0);
  const t = ballGoalUniforms.uGoalTime.value;
  const amp = (1.6 + 4.2 * penetration) * penetration * jitterScale;
  const jx = Math.sin(t * 137.0) * Math.cos(t * 59.0) * amp;
  const jy = Math.cos(t * 151.0) * Math.sin(t * 73.0) * amp;
  const jz = Math.sin(t * 179.0 + 1.3) * amp * 0.85;
  ballGoalUniforms.uGoalJitterWorldOffset.value.set(jx, jy, jz);
}
