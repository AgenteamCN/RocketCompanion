import * as THREE from 'three';
import type { PerformanceBoostConfig } from '../../../ui-core/config/performanceBoostConfig.ts';

export const PERFORMANCE_BOOST_ATTACH_VERTEX_SHADER = `
  attribute float aAcross;
  attribute float aProgress;
  uniform vec2 uSpan;
  uniform vec3 uNozzleOffset;
  uniform float uLengthUu;
  uniform float uHeadWidthUu;
  uniform float uTailWidthUu;
  uniform float uWidthTaperCurve;
  uniform float uFadeCurve;
  varying float vAcross;
  varying float vProgress;
  varying float vAlpha;

  void main() {
    vAcross = aAcross;
    float uStart = clamp(uSpan.x, 0.0, 1.0);
    float uEnd = clamp(uSpan.y, uStart, 1.0);
    float spanLen = max(0.0, uEnd - uStart);
    float activeT = mix(uStart, uEnd, aProgress);
    vProgress = activeT;

    vec3 centerLocal = uNozzleOffset + vec3(-activeT * uLengthUu, 0.0, 0.0);
    vec4 centerView = modelViewMatrix * vec4(centerLocal, 1.0);
    vec3 axisView = normalize((modelViewMatrix * vec4(-1.0, 0.0, 0.0, 0.0)).xyz);
    vec3 viewDir = normalize(-centerView.xyz);
    vec3 sideView = cross(axisView, viewDir);
    float sideLen = length(sideView);
    sideView = sideLen > 1e-4 ? (sideView / sideLen) : vec3(0.0, 1.0, 0.0);

    float widthFactor = pow(max(0.0, 1.0 - activeT), max(0.1, uWidthTaperCurve));
    float halfWidth = 0.5 * mix(uTailWidthUu, uHeadWidthUu, widthFactor);

    // Smooth cap taper when detaching from nozzle or at far tip
    float detachPinch = uStart > 0.005 ? smoothstep(0.0, 0.14, aProgress) : 1.0;
    float tipPinch = 1.0 - 0.35 * smoothstep(0.85, 1.0, aProgress);
    halfWidth *= detachPinch * tipPinch * smoothstep(0.0, 0.06, spanLen);

    float baseFade = pow(max(0.0, 1.0 - activeT), max(0.1, uFadeCurve));
    float detachEdgeFade = uStart > 0.005 ? smoothstep(0.0, 0.18, aProgress) : 1.0;
    float tipEdgeFade = 1.0 - smoothstep(0.88, 1.0, aProgress);
    float spanEnvelope = smoothstep(0.0, 0.08, spanLen);
    vAlpha = baseFade * detachEdgeFade * tipEdgeFade * spanEnvelope;

    centerView.xyz += sideView * (aAcross * halfWidth);
    gl_Position = projectionMatrix * centerView;
  }
`;

export const PERFORMANCE_BOOST_TRAIL_VERTEX_SHADER = `
  attribute float aAcross;
  attribute float aProgress;
  attribute float aAlpha;
  varying float vAcross;
  varying float vProgress;
  varying float vAlpha;

  void main() {
    vAcross = aAcross;
    vProgress = aProgress;
    vAlpha = aAlpha;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

export const PERFORMANCE_BOOST_FRAGMENT_SHADER = `
  uniform float uColorMode;
  uniform vec3 uSolidColor;
  uniform vec3 uHeadColor;
  uniform vec3 uMidColor;
  uniform vec3 uTailColor;
  uniform float uMidColorPos;
  uniform vec4 uHeadToMidBezier;
  uniform vec4 uMidToTailBezier;
  uniform float uHeadGlowStrength;
  uniform float uCoreSharpness;
  uniform float uOpacity;
  varying float vAcross;
  varying float vProgress;
  varying float vAlpha;

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

  void main() {
    float crossDist = abs(vAcross);
    float edgeMask = 1.0 - smoothstep(0.38, 1.0, crossDist);
    float coreSharp = clamp(uCoreSharpness, 0.05, 0.95);
    float coreHighlight = 1.0 - smoothstep(0.0, coreSharp, crossDist);

    float p = clamp(vProgress, 0.0, 1.0);
    vec3 finalCol;

    if (uColorMode < 0.5) {
      vec3 baseSolid = uSolidColor * max(0.25, uHeadGlowStrength * (1.0 - 0.35 * p));
      vec3 hotCore = mix(baseSolid, vec3(1.0), 0.55);
      finalCol = mix(baseSolid, hotCore, coreHighlight * (1.0 - 0.5 * p));
    } else {
      float midP = clamp(uMidColorPos, 0.01, 0.99);
      vec3 headLuminous = uHeadColor * uHeadGlowStrength;
      vec3 baseCol;
      float headCoreWeight;
      if (p <= midP) {
        float t1 = clamp(p / midP, 0.0, 1.0);
        float k1 = clamp(evalCubicBezier01(t1, uHeadToMidBezier), 0.0, 1.0);
        baseCol = mix(headLuminous, uMidColor, k1);
        headCoreWeight = (1.0 - k1) * 0.55;
      } else {
        float t2 = clamp((p - midP) / max(0.01, 1.0 - midP), 0.0, 1.0);
        float k2 = clamp(evalCubicBezier01(t2, uMidToTailBezier), 0.0, 1.0);
        baseCol = mix(uMidColor, uTailColor, k2);
        headCoreWeight = 0.0;
      }
      finalCol = mix(baseCol, headLuminous, coreHighlight * headCoreWeight);
    }

    float alpha = uOpacity * vAlpha * edgeMask;
    if (alpha < 0.003) discard;
    gl_FragColor = vec4(finalCol, alpha);
  }
`;

export function createPerformanceBoostMaterial(
  cfg: PerformanceBoostConfig,
  isAttachMode: boolean
): THREE.ShaderMaterial {
  const midPos = Math.max(0.01, Math.min(0.99, (Number(cfg.midColorPosPct) || 28) / 100));
  return new THREE.ShaderMaterial({
    vertexShader: isAttachMode
      ? PERFORMANCE_BOOST_ATTACH_VERTEX_SHADER
      : PERFORMANCE_BOOST_TRAIL_VERTEX_SHADER,
    fragmentShader: PERFORMANCE_BOOST_FRAGMENT_SHADER,
    transparent: true,
    depthWrite: false,
    depthTest: true,
    side: THREE.DoubleSide,
    blending: cfg.blendingMode === 'normal' ? THREE.NormalBlending : THREE.AdditiveBlending,
    toneMapped: false,
    uniforms: {
      uSpan: { value: new THREE.Vector2(0, 0) },
      uNozzleOffset: { value: new THREE.Vector3(-58, 10.5, 0) },
      uLengthUu: { value: cfg.attachLengthUu ?? 185 },
      uHeadWidthUu: { value: cfg.headWidthUu ?? 16 },
      uTailWidthUu: { value: cfg.tailWidthUu ?? 2.5 },
      uWidthTaperCurve: { value: cfg.widthTaperCurve ?? 1.05 },
      uFadeCurve: { value: cfg.fadeCurve ?? 1.25 },
      uColorMode: { value: cfg.colorMode === 'solid' ? 0.0 : 1.0 },
      uSolidColor: { value: new THREE.Color(cfg.solidColor || '#ff9914') },
      uHeadColor: { value: new THREE.Color(cfg.headColor || '#ffffff') },
      uMidColor: { value: new THREE.Color(cfg.midColor || '#ff8811') },
      uTailColor: { value: new THREE.Color(cfg.tailColor || '#ff2200') },
      uMidColorPos: { value: midPos },
      uHeadToMidBezier: {
        value: new THREE.Vector4(
          cfg.headToMidBezierP1X ?? 0.55,
          cfg.headToMidBezierP1Y ?? 0.25,
          cfg.headToMidBezierP2X ?? 0.62,
          cfg.headToMidBezierP2Y ?? 0.92
        ),
      },
      uMidToTailBezier: {
        value: new THREE.Vector4(
          cfg.midToTailBezierP1X ?? 0.15,
          cfg.midToTailBezierP1Y ?? 0.72,
          cfg.midToTailBezierP2X ?? 0.25,
          cfg.midToTailBezierP2Y ?? 0.68
        ),
      },
      uHeadGlowStrength: { value: cfg.headGlowStrength ?? 1.25 },
      uCoreSharpness: { value: cfg.coreSharpness ?? 0.45 },
      uOpacity: { value: cfg.opacity ?? 0.9 },
    },
  });
}

export function syncPerformanceBoostMaterial(
  material: THREE.ShaderMaterial,
  cfg: PerformanceBoostConfig
): void {
  const u = material.uniforms;
  u.uLengthUu.value = cfg.attachLengthUu ?? 185;
  u.uHeadWidthUu.value = cfg.headWidthUu ?? 16;
  u.uTailWidthUu.value = cfg.tailWidthUu ?? 2.5;
  u.uWidthTaperCurve.value = cfg.widthTaperCurve ?? 1.05;
  u.uFadeCurve.value = cfg.fadeCurve ?? 1.25;
  u.uColorMode.value = cfg.colorMode === 'solid' ? 0.0 : 1.0;
  u.uSolidColor.value.set(cfg.solidColor || '#ff9914');
  u.uHeadColor.value.set(cfg.headColor || '#ffffff');
  u.uMidColor.value.set(cfg.midColor || '#ff8811');
  u.uTailColor.value.set(cfg.tailColor || '#ff2200');
  u.uMidColorPos.value = Math.max(0.01, Math.min(0.99, (Number(cfg.midColorPosPct) || 28) / 100));
  u.uHeadToMidBezier.value.set(
    cfg.headToMidBezierP1X ?? 0.55,
    cfg.headToMidBezierP1Y ?? 0.25,
    cfg.headToMidBezierP2X ?? 0.62,
    cfg.headToMidBezierP2Y ?? 0.92
  );
  u.uMidToTailBezier.value.set(
    cfg.midToTailBezierP1X ?? 0.15,
    cfg.midToTailBezierP1Y ?? 0.72,
    cfg.midToTailBezierP2X ?? 0.25,
    cfg.midToTailBezierP2Y ?? 0.68
  );
  u.uHeadGlowStrength.value = cfg.headGlowStrength ?? 1.25;
  u.uCoreSharpness.value = cfg.coreSharpness ?? 0.45;
  u.uOpacity.value = cfg.opacity ?? 0.9;

  const nextBlending =
    cfg.blendingMode === 'normal' ? THREE.NormalBlending : THREE.AdditiveBlending;
  if (material.blending !== nextBlending) {
    material.blending = nextBlending;
    material.needsUpdate = true;
  }
}
