import { Color, type Material, Vector3, Vector4 } from 'three';

import {
  experimentalWallFxRuntimeConfig,
  type ExperimentalWallFxConfig,
} from '../../../ui-core/config/atmosphereFxConfig.ts';

export const PULSE_STEADY_MODE_MAP: Record<string, number> = {
  wave: 0,
  'solid-override': 1,
  'static-ring': 2,
};

export const PULSE_DIRECTION_MAP: Record<string, number> = {
  outward: 0,
  inward: 1,
};

export type WallFxUniforms = ReturnType<typeof createWallFxUniforms>;

export function createWallFxUniforms(
  cfg: Partial<ExperimentalWallFxConfig> = experimentalWallFxRuntimeConfig
) {
  return {
    uCircleBallPos: { value: new Vector3(0, 93, 0) },
    uPulseBallPos: { value: new Vector3(0, 93, 0) },
    uTime: { value: 0 },
    uWallBaseVisible: { value: 1.0 },
    uHexEmissiveColor: { value: new Color('#ffffff') },
    uHexEmissiveIntensity: { value: 0.0 },

    uCircleEnabled: { value: cfg.circleEnabled ? 1.0 : 0.0 },
    uCircleRadius: { value: Number(cfg.circleRadius) || 500 },
    uCircleVerticalExtendUu: { value: Number(cfg.circleVerticalExtendUu) || 0 },
    uCircleThickness: { value: Number(cfg.circleThickness) || 5 },
    uCircleColor: { value: new Color(cfg.circleColor || '#ffffff') },
    uCircleUseTeamColor: { value: cfg.circleUseTeamColor ? 1.0 : 0.0 },
    uCircleOpacity: { value: Number(cfg.circleOpacity ?? 0.75) },

    uPulseEnabled: { value: cfg.pulseEnabled ? 1.0 : 0.0 },
    uPulseApplyToHexes: { value: cfg.pulseApplyToHexes !== false ? 1.0 : 0.0 },
    uPulseApplyToWalls: { value: cfg.pulseApplyToWalls ? 1.0 : 0.0 },
    uPulseSphereRadius: { value: Number(cfg.pulseSphereRadius) || 4000 },
    uPulseVerticalExtendUu: { value: Number(cfg.pulseVerticalExtendUu) || 0 },
    uPulseDirection: { value: PULSE_DIRECTION_MAP[cfg.pulseDirection || 'inward'] ?? 1 },
    uPulseFadeShrinkPct: { value: Number(cfg.pulseFadeShrinkPct ?? 50) },
    uPulseFadeBezier: {
      value: new Vector4(
        Number(cfg.pulseFadeBezierP1X ?? 0.5),
        Number(cfg.pulseFadeBezierP1Y ?? 0.0),
        Number(cfg.pulseFadeBezierP2X ?? 1.0),
        Number(cfg.pulseFadeBezierP2Y ?? 0.0)
      ),
    },
    uPulseSteadyMode: { value: PULSE_STEADY_MODE_MAP[cfg.pulseSteadyMode || 'wave'] ?? 0 },
    uPulseStaticPositionPct: { value: Number(cfg.pulseStaticPositionPct ?? 47) },
    uPulseStaticBandWidthPct: { value: Number(cfg.pulseStaticBandWidthPct ?? 5) },
    uPulseIntervalSec: { value: Number(cfg.pulseIntervalSec) || 1.0 },
    uPulseRiseDurationSec: { value: Number(cfg.pulseRiseDurationSec ?? 0.01) },
    uPulseFallDurationSec: { value: Number(cfg.pulseFallDurationSec ?? 0.2) },
    uPulseSpeedRadiusPct: { value: Number(cfg.pulseSpeedRadiusPct) || 50 },
    uPulseRiseBezier: {
      value: new Vector4(
        Number(cfg.pulseRiseBezierP1X ?? 0.33),
        Number(cfg.pulseRiseBezierP1Y ?? 0.33),
        Number(cfg.pulseRiseBezierP2X ?? 0.67),
        Number(cfg.pulseRiseBezierP2Y ?? 0.67)
      ),
    },
    uPulseFallBezier: {
      value: new Vector4(
        Number(cfg.pulseFallBezierP1X ?? 0.0),
        Number(cfg.pulseFallBezierP1Y ?? 0.5),
        Number(cfg.pulseFallBezierP2X ?? 0.0),
        Number(cfg.pulseFallBezierP2Y ?? 1.01)
      ),
    },
    uPulseIntensity: { value: Number(cfg.pulseIntensity ?? 1.0) },
    uPulseColor: { value: new Color(cfg.pulseColor || '#ffffff') },
    uPulseMultiplyTeamColor: { value: cfg.pulseMultiplyTeamColor ? 1.0 : 0.0 },
    uPulseOpacity: { value: Number(cfg.pulseOpacity ?? 0.92) },

    uTeamGradientEnabled: { value: cfg.teamGradientEnabled ? 1.0 : 0.0 },
    uCenterLineWidth: { value: Number(cfg.centerLineWidth ?? 5) },
    uTeamTransitionWidth: { value: Number(cfg.teamTransitionWidth ?? 1000) },
    uTeamColorStrength: { value: Number(cfg.teamColorStrength ?? 0.8) },
    uBlueTeamColor: { value: new Color(cfg.blueTeamColor || '#0089ff') },
    uBlueTeamAlpha: { value: Number(cfg.blueTeamAlpha ?? 0.85) },
    uOrangeTeamColor: { value: new Color(cfg.orangeTeamColor || '#ff5200') },
    uOrangeTeamAlpha: { value: Number(cfg.orangeTeamAlpha ?? 0.85) },
    uCenterLineColor: { value: new Color(cfg.centerLineColor || '#ffffff') },
    uCenterLineAlpha: { value: Number(cfg.centerLineAlpha ?? 0.0) },
  };
}

const WALL_FX_FRAGMENT_PREAMBLE = `#include <common>
varying vec3 vExpWorldPos;
uniform vec3 uCircleBallPos, uPulseBallPos, uHexEmissiveColor, uCircleColor, uPulseColor;
uniform vec3 uBlueTeamColor, uOrangeTeamColor, uCenterLineColor;
uniform vec4 uPulseFadeBezier, uPulseRiseBezier, uPulseFallBezier;
uniform float uTime, uWallBaseVisible, uHexEmissiveIntensity;
uniform float uCircleEnabled, uCircleRadius, uCircleVerticalExtendUu, uCircleThickness, uCircleUseTeamColor, uCircleOpacity;
uniform float uPulseEnabled, uPulseApplyToHexes, uPulseApplyToWalls, uPulseSphereRadius, uPulseVerticalExtendUu;
uniform float uPulseDirection, uPulseFadeShrinkPct, uPulseSteadyMode, uPulseStaticPositionPct, uPulseStaticBandWidthPct;
uniform float uPulseIntervalSec, uPulseRiseDurationSec, uPulseFallDurationSec, uPulseSpeedRadiusPct;
uniform float uPulseIntensity, uPulseMultiplyTeamColor, uPulseOpacity;
uniform float uTeamGradientEnabled, uCenterLineWidth, uTeamTransitionWidth, uTeamColorStrength;
uniform float uBlueTeamAlpha, uOrangeTeamAlpha, uCenterLineAlpha, uIsWallsMesh;

float calcSpheroidDistance(vec3 worldPos, vec3 centerPos, float radius, float verticalExtendUu) {
  vec3 d = worldPos - centerPos;
  float rX = max(1.0, radius);
  float rY = max(1.0, radius + verticalExtendUu);
  return length(vec3(d.x, d.y * (rX / rY), d.z));
}

float evalCubicBezier01(float t, vec4 bez) {
  if (t <= 0.0) return 0.0;
  if (t >= 1.0) return 1.0;
  float p1x = clamp(bez.x, 0.0, 1.0);
  float p1y = bez.y;
  float p2x = clamp(bez.z, 0.0, 1.0);
  float p2y = bez.w;
  float u = t;
  for (int i = 0; i < 5; i++) {
    float om = 1.0 - u;
    float x = 3.0 * om * om * u * p1x + 3.0 * om * u * u * p2x + u * u * u - t;
    float dx = 3.0 * om * om * p1x + 6.0 * om * u * (p2x - p1x) + 3.0 * u * u * (1.0 - p2x);
    if (abs(dx) < 1e-4) break;
    u = clamp(u - x / dx, 0.0, 1.0);
  }
  float om = 1.0 - u;
  return 3.0 * om * om * u * p1y + 3.0 * om * u * u * p2y + u * u * u;
}

float evalTwoPartPulseWave(float ageSec, float riseSec, float fallSec, vec4 riseBez, vec4 fallBez) {
  if (ageSec < riseSec) {
    float tRise = clamp(ageSec / max(0.0001, riseSec), 0.0, 1.0);
    return clamp(evalCubicBezier01(tRise, riseBez), 0.0, 1.5);
  }
  float tFall = clamp((ageSec - riseSec) / max(0.0001, fallSec), 0.0, 1.0);
  return clamp(1.0 - evalCubicBezier01(tFall, fallBez), 0.0, 1.5);
}`;

const WALL_FX_FRAGMENT_BODY = `#include <dithering_fragment>
bool isWall = (uIsWallsMesh > 0.5);

float zCoord = vExpWorldPos.z;
float absZ = abs(zCoord);
vec3 sideColor = zCoord < 0.0 ? uBlueTeamColor : uOrangeTeamColor;
float sideAlpha = zCoord < 0.0 ? uBlueTeamAlpha : uOrangeTeamAlpha;
float centerAa = max(4.0, fwidth(absZ) * 1.5);
float centerLineFactor = 1.0 - smoothstep(max(0.0, uCenterLineWidth - centerAa), uCenterLineWidth + centerAa, absZ);
float teamBlend = smoothstep(uCenterLineWidth, uCenterLineWidth + max(10.0, uTeamTransitionWidth), absZ);
vec3 baseTeamTint = mix(uCenterLineColor, sideColor, teamBlend);
float baseTeamAlpha = mix(uCenterLineAlpha, sideAlpha, teamBlend);

float baseMeshAlpha = gl_FragColor.a;
vec3 wallRgb = gl_FragColor.rgb;
float wallAlpha = isWall ? ((uWallBaseVisible > 0.5) ? baseMeshAlpha : 0.0) : baseMeshAlpha;

vec3 hexRgb = gl_FragColor.rgb + uHexEmissiveColor * uHexEmissiveIntensity;
float hexAlphaGain = 1.0;

if (!isWall && uTeamGradientEnabled > 0.5) {
  float blendFactor = clamp(uTeamColorStrength, 0.0, 1.0);
  float hdrMultiplier = max(1.0, uTeamColorStrength);
  vec3 fieldTint = mix(uCenterLineColor, sideColor * hdrMultiplier, teamBlend);
  hexRgb = mix(hexRgb, fieldTint + uHexEmissiveColor * uHexEmissiveIntensity, blendFactor);
  if (uCenterLineAlpha > 0.001) {
    hexRgb = mix(hexRgb, uCenterLineColor * hdrMultiplier, centerLineFactor * uCenterLineAlpha);
  }
  hexAlphaGain = mix(1.0, baseTeamAlpha * (0.6 + 0.4 * blendFactor), blendFactor);
}

bool wantWallPulse = isWall && (uPulseApplyToWalls > 0.5);
bool wantHexPulse = (!isWall) && (uPulseApplyToHexes > 0.5);
if (uPulseEnabled > 0.5 && (wantWallPulse || wantHexPulse)) {
  float distPulse = calcSpheroidDistance(vExpWorldPos, uPulseBallPos, uPulseSphereRadius, uPulseVerticalExtendUu);
  if (distPulse <= uPulseSphereRadius) {
    float sphereEdgeFade = 1.0;
    float shrinkFrac = clamp(uPulseFadeShrinkPct * 0.01, 0.0, 1.0);
    if (shrinkFrac > 0.001) {
      float fadeSpan = max(1.0, uPulseSphereRadius * shrinkFrac);
      float linearFade = clamp((uPulseSphereRadius - distPulse) / fadeSpan, 0.0, 1.0);
      sphereEdgeFade = clamp(evalCubicBezier01(linearFade, uPulseFadeBezier), 0.0, 1.5);
    }

    float shapeVal = 0.0;
    bool isPulseActiveAtFrag = false;

    float riseSec = max(0.0001, uPulseRiseDurationSec);
    float fallSec = max(0.0001, uPulseFallDurationSec);
    float totalDurationSec = riseSec + fallSec;
    float speedUuPerSec = max(10.0, uPulseSphereRadius * (uPulseSpeedRadiusPct * 0.01));

    if (uPulseSteadyMode > 0.5 && uPulseSteadyMode < 1.5) {
      shapeVal = 1.0;
      isPulseActiveAtFrag = true;
    } else if (uPulseSteadyMode >= 1.5) {
      float targetRadiusUu = clamp(uPulseStaticPositionPct * 0.01, 0.0, 1.0) * uPulseSphereRadius;
      float distFromLeadingUu = (uPulseDirection > 0.5)
        ? (distPulse - targetRadiusUu)
        : (targetRadiusUu - distPulse);
      float synthAge = distFromLeadingUu / speedUuPerSec;
      if (synthAge >= 0.0 && synthAge <= totalDurationSec) {
        shapeVal = evalTwoPartPulseWave(synthAge, riseSec, fallSec, uPulseRiseBezier, uPulseFallBezier);
        isPulseActiveAtFrag = true;
      }
    } else {
      float travelDist = (uPulseDirection > 0.5)
        ? max(0.0, uPulseSphereRadius - distPulse)
        : distPulse;
      float travelSec = travelDist / speedUuPerSec;
      float intervalSec = max(0.1, uPulseIntervalSec);
      float clampedTotalDur = min(totalDurationSec, intervalSec * 0.98);
      float durScale = clampedTotalDur / max(0.0001, totalDurationSec);
      float effRiseSec = riseSec * durScale;
      float effFallSec = fallSec * durScale;

      float ageSec = mod(uTime - travelSec, intervalSec);
      if (ageSec < 0.0) ageSec += intervalSec;

      if (ageSec <= clampedTotalDur) {
        shapeVal = evalTwoPartPulseWave(ageSec, effRiseSec, effFallSec, uPulseRiseBezier, uPulseFallBezier);
        isPulseActiveAtFrag = true;
      }
    }

    if (isPulseActiveAtFrag) {
      float pulseMask = clamp(shapeVal * sphereEdgeFade, 0.0, 1.0);
      if (pulseMask > 0.0005) {
        float pulseBlend = clamp(pulseMask * min(1.0, uPulseIntensity), 0.0, 1.0);
        float pulseHdr = max(1.0, uPulseIntensity);
        vec3 targetPulseCol = uPulseColor;
        if (uPulseMultiplyTeamColor > 0.5) {
          targetPulseCol *= baseTeamTint;
        }
        if (wantWallPulse) {
          wallRgb = mix(wallRgb, targetPulseCol * 1.35 * pulseHdr, pulseBlend);
          wallAlpha = max(wallAlpha, clamp(pulseMask * uPulseOpacity, 0.0, 1.0));
        }
        if (wantHexPulse) {
          hexRgb = mix(hexRgb, targetPulseCol * 1.35 * pulseHdr, pulseBlend);
          hexAlphaGain = mix(hexAlphaGain, max(hexAlphaGain, 1.0 + uPulseOpacity * 8.0 * pulseHdr), pulseMask);
        }
      }
    }
  }
}

if (isWall) {
  vec3 outRgb = wallRgb;
  float outAlpha = wallAlpha;

  if (uCircleEnabled > 0.5) {
    float distCircle = calcSpheroidDistance(vExpWorldPos, uCircleBallPos, uCircleRadius, uCircleVerticalExtendUu);
    float aa = max(fwidth(distCircle) * 1.25, 2.0);
    if (distCircle <= uCircleRadius + uCircleThickness + aa * 2.0) {
      float ringDelta = abs(distCircle - uCircleRadius);
      float energyScale = clamp(uCircleThickness / max(0.001, aa), 0.15, 1.0);
      float ringMask = (1.0 - smoothstep(max(0.0, uCircleThickness - aa), uCircleThickness + aa, ringDelta)) * energyScale;
      if (ringMask > 0.001) {
        vec3 activeRingColor = uCircleUseTeamColor > 0.5 ? baseTeamTint : uCircleColor;
        outRgb = mix(outRgb, activeRingColor * 1.25, ringMask);
        outAlpha = max(outAlpha, ringMask * uCircleOpacity);
      }
    }
  }

  if (outAlpha <= 0.001) {
    discard;
  }
  gl_FragColor.rgb = outRgb;
  gl_FragColor.a = outAlpha;
} else {
  vec3 toCam = cameraPosition - vExpWorldPos;
  float camDist = length(toCam);
  vec3 viewDir = toCam / max(1.0, camDist);

  vec3 inwardSpine = vec3(0.0, min(vExpWorldPos.y, 1000.0), clamp(vExpWorldPos.z, -3500.0, 3500.0));
  vec3 wallNormal = normalize(inwardSpine - vExpWorldPos);
  float ndotv = abs(dot(wallNormal, viewDir));

  float pixelFootprintUu = max(length(dFdx(vExpWorldPos)), length(dFdy(vExpWorldPos)));
  float subpixelEnergy = clamp(18.0 / max(18.0, pixelFootprintUu * 0.85), 0.38, 1.0);
  float grazingFactor = 0.55 + 0.45 * smoothstep(0.02, 0.22, ndotv);
  float antiShimmerGain = mix(subpixelEnergy * grazingFactor, 1.0, clamp((hexAlphaGain - 1.0) * 0.5, 0.0, 1.0));

  gl_FragColor.rgb = hexRgb;
  gl_FragColor.a = clamp(baseMeshAlpha * hexAlphaGain * antiShimmerGain, 0.0, 1.0);
}`;

/**
 * Injects 3D sphere-wall outer ring, independent 3D pulse sphere (with inward/outward direction,
 * 3D sphere outer boundary fade-in / fade-out shrink %, and 2-part split Cubic-Bezier wave gradient),
 * half-field team gradient shader, and 3D GLB Hexagon Mesh anti-shimmer filtering.
 */
export function injectWallFxShader(
  material: Material & { isMeshLambertMaterial?: boolean },
  wallFxUniforms: WallFxUniforms,
  isWallsMesh = false
): void {
  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, wallFxUniforms);
    shader.uniforms.uIsWallsMesh = { value: isWallsMesh ? 1.0 : 0.0 };

    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vExpWorldPos;')
      .replace(
        '#include <worldpos_vertex>',
        '#include <worldpos_vertex>\nvExpWorldPos = (modelMatrix * vec4(transformed, 1.0)).xyz;'
      );

    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', WALL_FX_FRAGMENT_PREAMBLE)
      .replace('#include <dithering_fragment>', WALL_FX_FRAGMENT_BODY);
  };

  material.customProgramCacheKey = () =>
    `${material.isMeshLambertMaterial ? 'lambert' : 'standard'}-wall-fx-${isWallsMesh ? 'walls' : 'hexes'}-v9-3d-hex-aa`;
}
