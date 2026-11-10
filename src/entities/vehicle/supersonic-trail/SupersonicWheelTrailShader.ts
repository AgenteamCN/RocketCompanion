import * as THREE from 'three';
import type { SupersonicTrailConfig } from '../../../ui-core/config/supersonicTrailConfig.ts';

export const SUPERSONIC_WHEEL_TRAIL_VERTEX_SHADER = `
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

export const SUPERSONIC_WHEEL_TRAIL_FRAGMENT_SHADER = `
  uniform vec3 uHeadColor;
  uniform vec3 uMidColor;
  uniform vec3 uTailColor;
  uniform float uMidColorPos;
  uniform vec4 uHeadToMidBezier;
  uniform vec4 uMidToTailBezier;
  uniform float uHeadGlowStrength;
  uniform float uOpacity;
  varying float vAcross;
  varying float vProgress;
  varying float vAlpha;

  // Evaluates 1D Cubic-Bezier y(t) for t in [0, 1] with control points P1(bez.x, bez.y), P2(bez.z, bez.w)
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
    float edgeMask = 1.0 - smoothstep(0.35, 1.0, crossDist);
    float coreHighlight = 1.0 - smoothstep(0.0, 0.42, crossDist);

    float p = clamp(vProgress, 0.0, 1.0);
    float midP = clamp(uMidColorPos, 0.01, 0.99);
    vec3 headLuminous = uHeadColor * uHeadGlowStrength;

    vec3 baseCol;
    float headCoreWeight;
    if (p <= midP) {
      float t1 = clamp(p / midP, 0.0, 1.0);
      float k1 = clamp(evalCubicBezier01(t1, uHeadToMidBezier), 0.0, 1.0);
      baseCol = mix(headLuminous, uMidColor, k1);
      headCoreWeight = (1.0 - k1) * 0.45;
    } else {
      float t2 = clamp((p - midP) / max(0.01, 1.0 - midP), 0.0, 1.0);
      float k2 = clamp(evalCubicBezier01(t2, uMidToTailBezier), 0.0, 1.0);
      baseCol = mix(uMidColor, uTailColor, k2);
      headCoreWeight = 0.0;
    }

    vec3 finalCol = mix(baseCol, headLuminous, coreHighlight * headCoreWeight);

    float alpha = uOpacity * vAlpha * edgeMask;
    if (alpha < 0.003) discard;
    gl_FragColor = vec4(finalCol, alpha);
  }
`;

export function createSupersonicWheelTrailMaterial(
  cfg: SupersonicTrailConfig,
  stencilForegroundPass = false
): THREE.ShaderMaterial {
  const midPos = Math.max(0.01, Math.min(0.99, (Number(cfg.midColorPosPct) || 24.1) / 100));
  const mat = new THREE.ShaderMaterial({
    vertexShader: SUPERSONIC_WHEEL_TRAIL_VERTEX_SHADER,
    fragmentShader: SUPERSONIC_WHEEL_TRAIL_FRAGMENT_SHADER,
    transparent: true,
    depthWrite: false,
    depthTest: true,
    side: THREE.DoubleSide,
    blending: cfg.blendingMode === 'normal' ? THREE.NormalBlending : THREE.AdditiveBlending,
    toneMapped: false,
    uniforms: {
      uHeadColor: { value: new THREE.Color(cfg.headColor || '#ffffff') },
      uMidColor: { value: new THREE.Color(cfg.midColor || '#ff4fd8') },
      uTailColor: { value: new THREE.Color(cfg.tailColor || '#8300ff') },
      uMidColorPos: { value: midPos },
      uHeadToMidBezier: {
        value: new THREE.Vector4(
          cfg.headToMidBezierP1X ?? 0.6,
          cfg.headToMidBezierP1Y ?? 0.25,
          cfg.headToMidBezierP2X ?? 0.62,
          cfg.headToMidBezierP2Y ?? 0.93
        ),
      },
      uMidToTailBezier: {
        value: new THREE.Vector4(
          cfg.midToTailBezierP1X ?? 0.1,
          cfg.midToTailBezierP1Y ?? 0.76,
          cfg.midToTailBezierP2X ?? 0.14,
          cfg.midToTailBezierP2Y ?? 0.63
        ),
      },
      uHeadGlowStrength: { value: cfg.headGlowStrength ?? 1.0 },
      uOpacity: { value: cfg.opacity ?? 0.65 },
    },
  });

  if (stencilForegroundPass) {
    mat.stencilWrite = true;
    mat.stencilFunc = THREE.EqualStencilFunc;
    mat.stencilRef = 2;
    mat.stencilFuncMask = 0x02;
    mat.stencilWriteMask = 0x00;
    mat.stencilZPass = THREE.KeepStencilOp;
    mat.stencilFail = THREE.KeepStencilOp;
    mat.stencilZFail = THREE.KeepStencilOp;
  }

  return mat;
}

export function syncSupersonicWheelTrailMaterial(
  material: THREE.ShaderMaterial,
  cfg: SupersonicTrailConfig
): void {
  const u = material.uniforms;
  u.uHeadColor.value.set(cfg.headColor || '#ffffff');
  u.uMidColor.value.set(cfg.midColor || '#ff4fd8');
  u.uTailColor.value.set(cfg.tailColor || '#8300ff');
  u.uMidColorPos.value = Math.max(0.01, Math.min(0.99, (Number(cfg.midColorPosPct) || 24.1) / 100));
  u.uHeadToMidBezier.value.set(
    cfg.headToMidBezierP1X ?? 0.6,
    cfg.headToMidBezierP1Y ?? 0.25,
    cfg.headToMidBezierP2X ?? 0.62,
    cfg.headToMidBezierP2Y ?? 0.93
  );
  u.uMidToTailBezier.value.set(
    cfg.midToTailBezierP1X ?? 0.1,
    cfg.midToTailBezierP1Y ?? 0.76,
    cfg.midToTailBezierP2X ?? 0.14,
    cfg.midToTailBezierP2Y ?? 0.63
  );
  u.uHeadGlowStrength.value = cfg.headGlowStrength ?? 1.0;
  u.uOpacity.value = cfg.opacity ?? 0.65;

  const nextBlending =
    cfg.blendingMode === 'normal' ? THREE.NormalBlending : THREE.AdditiveBlending;
  if (material.blending !== nextBlending) {
    material.blending = nextBlending;
    material.needsUpdate = true;
  }
}
