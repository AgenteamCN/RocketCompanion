import * as THREE from 'three';
import {
  GOAL_BARRIER_HALF_WIDTH_UU,
  GOAL_BARRIER_HEIGHT_UU,
  GOAL_BARRIER_PLANE_Y_UU,
  GOAL_BARRIER_CORNER_RADIUS_UU,
  normalizedUtoWorldX,
  normalizedVtoWorldZ,
} from '../../ui-core/config/goalBarrierConfig.ts';

const SURFACE_VERTEX_SHADER = /* glsl */ `
  attribute vec4 aRectBounds;
  varying vec3 vWorldPos;
  varying vec4 vRectBounds;

  void main() {
    vRectBounds = aRectBounds;
    vec4 worldPosition = modelMatrix * vec4(position, 1.0);
    vWorldPos = worldPosition.xyz;
    gl_Position = projectionMatrix * viewMatrix * worldPosition;
  }
`;

const SURFACE_FRAGMENT_SHADER = /* glsl */ `
  uniform float uTime;
  uniform float uOpacity;
  uniform vec3 uBlueColor;
  uniform vec3 uOrangeColor;
  uniform vec3 uImpactPos;
  uniform float uImpactAge;
  uniform float uHalfWidth;
  uniform float uHeight;
  uniform float uCornerRadius;

  varying vec3 vWorldPos;
  varying vec4 vRectBounds;

  float sdRoundedGoalAperture(vec2 p, float halfW, float height, float r) {
    vec2 center = vec2(0.0, height * 0.5);
    vec2 halfSize = vec2(halfW, height * 0.5);
    vec2 q = abs(p - center) - (halfSize - vec2(r));
    return length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - r;
  }

  void main() {
    float apertureSdf = sdRoundedGoalAperture(vec2(vWorldPos.x, vWorldPos.y), uHalfWidth, uHeight, uCornerRadius);
    if (apertureSdf > 2.0) {
      discard;
    }
    float apertureMask = 1.0 - smoothstep(-2.0, 2.0, apertureSdf);

    vec3 baseTeamColor = vWorldPos.z >= 0.0 ? uOrangeColor : uBlueColor;

    // Tactical grid pattern in Unreal units (vWorldPos.x = X_uu, vWorldPos.y = Z_uu)
    // with per-axis Nyquist frequency energy conservation so oblique camera angles never blank out both axes
    vec2 majorUv = vec2(vWorldPos.x, vWorldPos.y) / 112.0;
    vec2 majorFw = max(fwidth(majorUv), vec2(1e-4));
    vec2 majorGrid = abs(fract(majorUv - 0.5) - 0.5) / majorFw;
    vec2 majorFade = mix(vec2(1.0), vec2(0.28), smoothstep(vec2(0.32), vec2(0.85), majorFw));
    float majorLineX = (1.0 - min(majorGrid.x, 1.0)) * majorFade.x;
    float majorLineY = (1.0 - min(majorGrid.y, 1.0)) * majorFade.y;
    float majorLine = max(majorLineX, majorLineY);

    vec2 minorUv = vec2(vWorldPos.x, vWorldPos.y) / 28.0;
    vec2 minorFw = max(fwidth(minorUv), vec2(1e-4));
    vec2 minorGrid = abs(fract(minorUv - 0.5) - 0.5) / minorFw;
    vec2 minorFade = mix(vec2(1.0), vec2(0.15), smoothstep(vec2(0.24), vec2(0.68), minorFw));
    float minorLineX = (1.0 - min(minorGrid.x, 1.0)) * minorFade.x;
    float minorLineY = (1.0 - min(minorGrid.y, 1.0)) * minorFade.y;
    float minorLine = max(minorLineX, minorLineY);

    // Subtle diagonal scanband
    float diagPhase = (vWorldPos.x * 0.006 + vWorldPos.y * 0.009) - uTime * 0.85;
    float scanBand = 0.5 + 0.5 * sin(diagPhase * 6.2831853);
    scanBand = smoothstep(0.65, 0.98, scanBand) * 0.18;

    // Distance to local rectangle edge for soft rim glow
    float dLeft = abs(vWorldPos.x - vRectBounds.x);
    float dRight = abs(vWorldPos.x - vRectBounds.z);
    float dBottom = abs(vWorldPos.y - vRectBounds.y);
    float dTop = abs(vWorldPos.y - vRectBounds.w);
    float edgeDist = min(min(dLeft, dRight), min(dBottom, dTop));
    float apertureEdgeDist = abs(apertureSdf);
    float minEdgeDist = min(edgeDist, apertureEdgeDist);
    float edgeGlow = exp(-minEdgeDist * 0.045) * 0.65;

    // Ball impact shockwave ring
    float impactFlash = 0.0;
    if (uImpactAge >= 0.0 && uImpactAge < 0.65 && sign(vWorldPos.z) == sign(uImpactPos.z)) {
      float distToImpact = length(vWorldPos.xy - uImpactPos.xy);
      float ringRadius = uImpactAge * 1350.0;
      float ringBand = exp(-abs(distToImpact - ringRadius) * 0.032);
      float coreFlash = exp(-distToImpact * 0.008) * (1.0 - uImpactAge / 0.65);
      float fade = 1.0 - smoothstep(0.0, 0.65, uImpactAge);
      impactFlash = (ringBand * 0.95 + coreFlash * 0.75) * fade;
    }

    vec3 highlightColor = mix(baseTeamColor, vec3(1.0), 0.55);
    vec3 finalColor = baseTeamColor * (0.68 + scanBand)
      + highlightColor * (majorLine * 0.42 + minorLine * 0.14 + edgeGlow * 0.85 + impactFlash * 1.35);

    float alpha = (0.34 + majorLine * 0.36 + minorLine * 0.10 + scanBand + edgeGlow * 0.52) * uOpacity;
    alpha = clamp(alpha + impactFlash * 0.55, 0.0, 0.96) * apertureMask;

    gl_FragColor = vec4(finalColor, alpha);
  }
`;

const CONTOUR_VERTEX_SHADER = /* glsl */ `
  varying vec3 vWorldPos;
  void main() {
    vec4 worldPosition = modelMatrix * vec4(position, 1.0);
    vWorldPos = worldPosition.xyz;
    gl_Position = projectionMatrix * viewMatrix * worldPosition;
  }
`;

const CONTOUR_FRAGMENT_SHADER = /* glsl */ `
  uniform float uOpacity;
  uniform vec3 uBlueColor;
  uniform vec3 uOrangeColor;
  uniform float uHalfWidth;
  uniform float uHeight;
  uniform float uCornerRadius;

  varying vec3 vWorldPos;

  float sdRoundedGoalAperture(vec2 p, float halfW, float height, float r) {
    vec2 center = vec2(0.0, height * 0.5);
    vec2 halfSize = vec2(halfW, height * 0.5);
    vec2 q = abs(p - center) - (halfSize - vec2(r));
    return length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - r;
  }

  void main() {
    float apertureSdf = sdRoundedGoalAperture(vec2(vWorldPos.x, vWorldPos.y), uHalfWidth, uHeight, uCornerRadius);
    if (apertureSdf > 4.0) {
      discard;
    }
    vec3 baseColor = vWorldPos.z >= 0.0 ? uOrangeColor : uBlueColor;
    vec3 rimColor = mix(baseColor, vec3(1.0), 0.65);
    gl_FragColor = vec4(rimColor, clamp(uOpacity * 1.35, 0.25, 1.0));
  }
`;

export interface GoalBarrierUniforms {
  [uniform: string]: THREE.IUniform;
  uTime: { value: number };
  uOpacity: { value: number };
  uBlueColor: { value: THREE.Color };
  uOrangeColor: { value: THREE.Color };
  uImpactPos: { value: THREE.Vector3 };
  uImpactAge: { value: number };
  uHalfWidth: { value: number };
  uHeight: { value: number };
  uCornerRadius: { value: number };
}

export class GoalBarrierVisual {
  public uniforms: GoalBarrierUniforms;
  public contourGeometry: THREE.BufferGeometry;
  public contourLines: THREE.LineSegments<THREE.BufferGeometry, THREE.ShaderMaterial>;
  public contourMaterial: THREE.ShaderMaterial;
  public group: THREE.Group;
  public surfaceGeometry: THREE.BufferGeometry;
  public surfaceMaterial: THREE.ShaderMaterial;
  public surfaceMesh: THREE.Mesh<THREE.BufferGeometry, THREE.ShaderMaterial>;

  constructor() {
    this.group = new THREE.Group();
    this.group.name = 'GoalBarrierGroup';
    this.group.visible = false;
    this.group.frustumCulled = false;

    this.uniforms = {
      uTime: { value: 0 },
      uOpacity: { value: 0.55 },
      uBlueColor: { value: new THREE.Color(0x38bdf8) },
      uOrangeColor: { value: new THREE.Color(0xfb923c) },
      uImpactPos: { value: new THREE.Vector3(0, -10000, 0) },
      uImpactAge: { value: 10.0 },
      uHalfWidth: { value: GOAL_BARRIER_HALF_WIDTH_UU },
      uHeight: { value: GOAL_BARRIER_HEIGHT_UU },
      uCornerRadius: { value: GOAL_BARRIER_CORNER_RADIUS_UU },
    };

    this.surfaceMaterial = new THREE.ShaderMaterial({
      uniforms: this.uniforms,
      vertexShader: SURFACE_VERTEX_SHADER,
      fragmentShader: SURFACE_FRAGMENT_SHADER,
      transparent: true,
      depthWrite: false,
      depthTest: true,
      side: THREE.DoubleSide,
    });

    this.contourMaterial = new THREE.ShaderMaterial({
      uniforms: this.uniforms,
      vertexShader: CONTOUR_VERTEX_SHADER,
      fragmentShader: CONTOUR_FRAGMENT_SHADER,
      transparent: true,
      depthWrite: false,
      depthTest: true,
      blending: THREE.AdditiveBlending,
    });

    this.surfaceGeometry = new THREE.BufferGeometry();
    this.contourGeometry = new THREE.BufferGeometry();

    this.surfaceMesh = new THREE.Mesh(this.surfaceGeometry, this.surfaceMaterial);
    this.surfaceMesh.name = 'GoalBarrierSurface';
    this.surfaceMesh.castShadow = false;
    this.surfaceMesh.receiveShadow = false;
    this.surfaceMesh.renderOrder = 5;
    this.surfaceMesh.frustumCulled = false;

    this.contourLines = new THREE.LineSegments(this.contourGeometry, this.contourMaterial);
    this.contourLines.name = 'GoalBarrierContour';
    this.contourLines.castShadow = false;
    this.contourLines.receiveShadow = false;
    this.contourLines.renderOrder = 6;
    this.contourLines.frustumCulled = false;

    this.group.add(this.surfaceMesh, this.contourLines);
  }

  setTeamColors(
    blueHex: THREE.ColorRepresentation | null | undefined,
    orangeHex: THREE.ColorRepresentation | null | undefined
  ) {
    if (blueHex) this.uniforms.uBlueColor.value.set(blueHex);
    if (orangeHex) this.uniforms.uOrangeColor.value.set(orangeHex);
  }

  updateConfig(
    decomposition:
      | {
          mergedRects?: Array<{ u0: number; u1: number; v0: number; v1: number }>;
          contourSegments?: Array<{ u0: number; u1: number; v0: number; v1: number }>;
        }
      | null
      | undefined,
    targetGoal = 'both',
    enabled = false,
    opacity = 0.55
  ) {
    this.uniforms.uOpacity.value = Math.max(0.1, Math.min(1.0, Number(opacity) || 0.55));

    const rects = decomposition?.mergedRects || [];
    const contours = decomposition?.contourSegments || [];
    if (!enabled || rects.length === 0) {
      this.group.visible = false;
      return;
    }

    const goalSigns: Array<1 | -1> = [];
    if (targetGoal === 'both' || targetGoal === 'orange') goalSigns.push(1);
    if (targetGoal === 'both' || targetGoal === 'blue') goalSigns.push(-1);

    const totalQuads = rects.length * goalSigns.length;
    const positions = new Float32Array(totalQuads * 4 * 3);
    const rectBounds = new Float32Array(totalQuads * 4 * 4);
    const indices = new Uint16Array(totalQuads * 6);

    let vCursor = 0;
    let iCursor = 0;

    for (const signY of goalSigns) {
      const threeZ = signY * GOAL_BARRIER_PLANE_Y_UU;
      for (const r of rects) {
        const xA = normalizedUtoWorldX(r.u0, signY);
        const xB = normalizedUtoWorldX(r.u1, signY);
        const xMin = Math.min(xA, xB);
        const xMax = Math.max(xA, xB);
        const yMin = normalizedVtoWorldZ(r.v1);
        const yMax = normalizedVtoWorldZ(r.v0);

        const baseVertex = vCursor;
        const quadVerts = [
          [xMin, yMin, threeZ],
          [xMax, yMin, threeZ],
          [xMax, yMax, threeZ],
          [xMin, yMax, threeZ],
        ];

        for (let k = 0; k < 4; k++) {
          const pOff = (baseVertex + k) * 3;
          positions[pOff] = quadVerts[k][0];
          positions[pOff + 1] = quadVerts[k][1];
          positions[pOff + 2] = quadVerts[k][2];

          const bOff = (baseVertex + k) * 4;
          rectBounds[bOff] = xMin;
          rectBounds[bOff + 1] = yMin;
          rectBounds[bOff + 2] = xMax;
          rectBounds[bOff + 3] = yMax;
        }

        indices[iCursor++] = baseVertex;
        indices[iCursor++] = baseVertex + 1;
        indices[iCursor++] = baseVertex + 2;
        indices[iCursor++] = baseVertex;
        indices[iCursor++] = baseVertex + 2;
        indices[iCursor++] = baseVertex + 3;

        vCursor += 4;
      }
    }

    this.surfaceGeometry.dispose();
    this.surfaceGeometry = new THREE.BufferGeometry();
    this.surfaceGeometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    this.surfaceGeometry.setAttribute('aRectBounds', new THREE.BufferAttribute(rectBounds, 4));
    this.surfaceGeometry.setIndex(new THREE.BufferAttribute(indices, 1));
    this.surfaceGeometry.computeBoundingSphere();
    this.surfaceMesh.geometry = this.surfaceGeometry;

    const totalSegments = contours.length * goalSigns.length;
    const linePositions = new Float32Array(totalSegments * 2 * 3);
    let lCursor = 0;
    for (const signY of goalSigns) {
      const threeZ = signY * (GOAL_BARRIER_PLANE_Y_UU - signY * 0.5);
      for (const seg of contours) {
        const x0 = normalizedUtoWorldX(seg.u0, signY);
        const y0 = normalizedVtoWorldZ(seg.v0);
        const x1 = normalizedUtoWorldX(seg.u1, signY);
        const y1 = normalizedVtoWorldZ(seg.v1);

        linePositions[lCursor++] = x0;
        linePositions[lCursor++] = y0;
        linePositions[lCursor++] = threeZ;
        linePositions[lCursor++] = x1;
        linePositions[lCursor++] = y1;
        linePositions[lCursor++] = threeZ;
      }
    }

    this.contourGeometry.dispose();
    this.contourGeometry = new THREE.BufferGeometry();
    this.contourGeometry.setAttribute('position', new THREE.BufferAttribute(linePositions, 3));
    this.contourGeometry.computeBoundingSphere();
    this.contourLines.geometry = this.contourGeometry;

    this.group.visible = true;
  }

  triggerImpact(xUu, yUu, zUu) {
    if (!this.group.visible) return;
    this.uniforms.uImpactPos.value.set(xUu || 0, zUu || 0, yUu || 0);
    this.uniforms.uImpactAge.value = 0.0;
  }

  update(delta = 0.016) {
    if (!this.group.visible) return;
    const dt = Math.max(0, Math.min(0.1, delta || 0.016));
    this.uniforms.uTime.value += dt;
    if (this.uniforms.uImpactAge.value < 2.0) {
      this.uniforms.uImpactAge.value += dt;
    }
  }

  dispose() {
    this.surfaceGeometry?.dispose?.();
    this.contourGeometry?.dispose?.();
    this.surfaceMaterial?.dispose?.();
    this.contourMaterial?.dispose?.();
  }
}
