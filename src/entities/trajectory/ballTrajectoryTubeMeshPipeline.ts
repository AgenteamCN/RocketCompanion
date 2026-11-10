/**
 * ballTrajectoryTubeMeshPipeline.ts
 * Pure 3D volumetric tube extrusion, parallel-transport frame propagation,
 * radial trigonometry table generation, ground drop-line vertex buffer construction,
 * and GLSL shader definitions for BallTrajectoryTubeRenderer.
 */

import type { TrajectoryDashCapStyle } from '../../ui-core/config/trainingDefaults.ts';
import type {
  LiveBallPositionLike,
  TrajectoryDashRange,
} from './ballTrajectoryGeometryPipeline.ts';

export interface TubeRenderParams {
  color: string;
  opacity: number;
  worldRadius: number;
  dashCapStyle: TrajectoryDashCapStyle;
  sampleStride: number;
  radialSegments: number;
  shadingStrength: number;
  radiusTaper: number;
  horizonFade: number;
  showBounceMarkers: boolean;
  showGroundProjection: boolean;
  dropLineIntervalTicks: number;
}

export interface TubeExtrusionBuffers {
  positions: Float32Array;
  normals: Float32Array;
  uvs: Float32Array;
  indices: Uint16Array;
  cosTable: Float32Array;
  sinTable: Float32Array;
}

export interface TubeExtrusionInput {
  predictedPoints: Float32Array;
  predictionCount: number;
  startIndex: number;
  dashRanges: readonly TrajectoryDashRange[];
  rangeCount: number;
  liveBallPosition: LiveBallPositionLike | null | undefined;
  radialSegments: number;
  sampleStride: number;
  worldRadius: number;
  radiusTaper: number;
  dashCapStyle: TrajectoryDashCapStyle;
}

export const MAX_TUBE_RINGS = 800;
export const MAX_RADIAL_SEGMENTS = 8;
export const MAX_TUBE_VERTICES = MAX_TUBE_RINGS * MAX_RADIAL_SEGMENTS;
export const MAX_TUBE_INDICES = MAX_TUBE_RINGS * MAX_RADIAL_SEGMENTS * 6;
export const MAX_GROUND_DROP_FLOATS = 400 * 6;

export const TUBE_VERTEX_SHADER = /* glsl */ `
  varying vec3 vWorldNormal;
  varying vec3 vViewNormal;
  varying vec3 vViewDir;
  varying vec2 vUv;

  void main() {
    vUv = uv;
    vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
    vWorldNormal = normalize(mat3(modelMatrix) * normal);
    vViewNormal = normalize(normalMatrix * normal);
    vViewDir = normalize(-mvPosition.xyz);
    gl_Position = projectionMatrix * mvPosition;
  }
`;

export const TUBE_FRAGMENT_SHADER = /* glsl */ `
  uniform vec3 uColor;
  uniform float uOpacity;
  uniform float uShadingStrength;
  uniform float uHorizonFade;

  varying vec3 vWorldNormal;
  varying vec3 vViewNormal;
  varying vec3 vViewDir;
  varying vec2 vUv;

  void main() {
    float progress = clamp(vUv.x, 0.0, 1.0);
    float tipFactor = clamp(vUv.y, 0.0, 1.0);
    float s = clamp(uShadingStrength, 0.0, 1.0);

    vec3 wNorm = normalize(vWorldNormal);
    vec3 vNorm = normalize(vViewNormal);
    vec3 vDir = normalize(vViewDir);

    // 1. World-space sky-ground hemisphere + overhead stadium key light
    float hemi = wNorm.y * 0.5 + 0.5;
    // 2. View-space upper-left key light so vertical arcs also exhibit clear 3D relief
    float viewKey = dot(vNorm, normalize(vec3(-0.28, 0.80, 0.53))) * 0.5 + 0.5;
    // 3. Cylindrical view-facing core vs rim contour
    float coreFacing = abs(dot(vNorm, vDir));

    // Combine lighting cues into [0..1] without exceeding 1.0 (avoids flat white clipping on #ffffff)
    float diffuseTerm = clamp(0.42 * hemi + 0.33 * viewKey + 0.25 * pow(coreFacing, 0.6), 0.0, 1.0);
    float rimShadow = smoothstep(0.0, 0.55, coreFacing);
    float specSpine = pow(max(0.0, 0.45 * hemi + 0.35 * viewKey + 0.20 * coreFacing), 7.0);

    // Deep cool-tinted underbelly shadow -> lit base color -> crisp specular ridge
    vec3 shadowColor = uColor * vec3(0.18, 0.22, 0.30);
    vec3 litCylinder = mix(shadowColor, uColor, diffuseTerm * (0.35 + 0.65 * rimShadow));
    litCylinder = mix(litCylinder, vec3(1.0), specSpine * 0.35);

    vec3 shadedColor = mix(uColor, litCylinder, s);

    // Subtle opacity reinforcement on shadowed underside & specular spine so 3D shading
    // remains clearly visible even at 50% opacity against bright stadium turf.
    float shadeAlphaMod = mix(
      1.0,
      clamp(0.88 + 0.34 * (1.0 - diffuseTerm) + 0.18 * specSpine, 0.82, 1.32),
      s
    );

    float horizonAlpha = 1.0 - clamp(uHorizonFade, 0.0, 0.95) * pow(progress, 1.15);
    float finalAlpha = clamp(uOpacity * shadeAlphaMod * horizonAlpha * tipFactor, 0.0, 1.0);
    if (finalAlpha <= 0.01) discard;

    gl_FragColor = vec4(shadedColor, finalAlpha);
  }
`;

export function populateRadialTrigTable(
  radialSegments: number,
  cosTable: Float32Array,
  sinTable: Float32Array
): void {
  for (let s = 0; s < radialSegments; s++) {
    const angle = (s / radialSegments) * Math.PI * 2;
    cosTable[s] = Math.cos(angle);
    sinTable[s] = Math.sin(angle);
  }
}

/**
 * Populates line segment vertices for vertical ground altitude drop pillars
 * and a subtle floor shadow trace along the trajectory.
 * Returns the number of floats written to `outPositions`.
 */
export function buildGroundDropLineSegments(
  predictedPoints: Float32Array,
  predictionCount: number,
  startIndex: number,
  dropLineIntervalTicks: number,
  outPositions: Float32Array
): number {
  const interval = Math.max(15, Math.min(180, Math.round(dropLineIntervalTicks || 48)));
  const endIndex = predictionCount - 1;
  let floatIdx = 0;
  const floorY = 3.0; // Just above Z=0 floor in Three.js Y-up

  // Vertical altitude pillars every `interval` ticks
  for (let k = startIndex + interval; k <= endIndex; k += interval) {
    if (floatIdx + 6 > MAX_GROUND_DROP_FLOATS) break;
    const pOff = k * 3;
    const x = predictedPoints[pOff + 0];
    const y = predictedPoints[pOff + 1];
    const z = predictedPoints[pOff + 2];
    if (y <= 105.0) continue; // Skip when ball is already rolling on floor

    outPositions[floatIdx++] = x;
    outPositions[floatIdx++] = y;
    outPositions[floatIdx++] = z;

    outPositions[floatIdx++] = x;
    outPositions[floatIdx++] = floorY;
    outPositions[floatIdx++] = z;
  }

  // Subtle floor shadow trace every 8 ticks
  const shadowStep = 8;
  for (let k = startIndex; k < endIndex; k += shadowStep) {
    if (floatIdx + 6 > MAX_GROUND_DROP_FLOATS) break;
    const kNext = Math.min(endIndex, k + shadowStep);
    const off0 = k * 3;
    const off1 = kNext * 3;
    outPositions[floatIdx++] = predictedPoints[off0 + 0];
    outPositions[floatIdx++] = floorY;
    outPositions[floatIdx++] = predictedPoints[off0 + 2];

    outPositions[floatIdx++] = predictedPoints[off1 + 0];
    outPositions[floatIdx++] = floorY;
    outPositions[floatIdx++] = predictedPoints[off1 + 2];
  }

  return floatIdx;
}

interface CapRingStep {
  readonly axialOffsetScale: number;
  readonly radiusScale: number;
  readonly normalRadial: number;
  readonly normalAxial: number;
  readonly tipAlpha: number;
}

const ROUND_START_CAP_STEPS: readonly CapRingStep[] = [
  {
    axialOffsetScale: -0.92,
    radiusScale: 0.22,
    normalRadial: 0.22,
    normalAxial: -0.975,
    tipAlpha: 0.95,
  },
  {
    axialOffsetScale: -0.71,
    radiusScale: 0.71,
    normalRadial: 0.71,
    normalAxial: -0.71,
    tipAlpha: 1.0,
  },
  {
    axialOffsetScale: -0.38,
    radiusScale: 0.92,
    normalRadial: 0.92,
    normalAxial: -0.38,
    tipAlpha: 1.0,
  },
];

const ROUND_END_CAP_STEPS: readonly CapRingStep[] = [
  {
    axialOffsetScale: 0.38,
    radiusScale: 0.92,
    normalRadial: 0.92,
    normalAxial: 0.38,
    tipAlpha: 1.0,
  },
  {
    axialOffsetScale: 0.71,
    radiusScale: 0.71,
    normalRadial: 0.71,
    normalAxial: 0.71,
    tipAlpha: 1.0,
  },
  {
    axialOffsetScale: 0.92,
    radiusScale: 0.22,
    normalRadial: 0.22,
    normalAxial: 0.975,
    tipAlpha: 0.95,
  },
];

const CHAMFER_START_CAP_STEPS: readonly CapRingStep[] = [
  {
    axialOffsetScale: -0.38,
    radiusScale: 0.12,
    normalRadial: 0.24,
    normalAxial: -0.97,
    tipAlpha: 0.95,
  },
  {
    axialOffsetScale: -0.32,
    radiusScale: 0.68,
    normalRadial: 0.707,
    normalAxial: -0.707,
    tipAlpha: 1.0,
  },
];

const CHAMFER_END_CAP_STEPS: readonly CapRingStep[] = [
  {
    axialOffsetScale: 0.32,
    radiusScale: 0.68,
    normalRadial: 0.707,
    normalAxial: 0.707,
    tipAlpha: 1.0,
  },
  {
    axialOffsetScale: 0.38,
    radiusScale: 0.12,
    normalRadial: 0.24,
    normalAxial: 0.97,
    tipAlpha: 0.95,
  },
];

const CYLINDER_RING_STEP: CapRingStep = {
  axialOffsetScale: 0.0,
  radiusScale: 1.0,
  normalRadial: 1.0,
  normalAxial: 0.0,
  tipAlpha: 1.0,
};

/**
 * Extrudes a twist-free parallel-transport 3D tubular mesh across all solid dash ranges
 * with either rounded hemisphere capsule caps ('round') or 45-degree chamfered bevel caps ('chamfer').
 * Returns the total number of triangle indices written to `buffers.indices`.
 */
export function extrudeTrajectoryTubeDashRanges(
  input: TubeExtrusionInput,
  buffers: TubeExtrusionBuffers
): number {
  const {
    predictedPoints,
    predictionCount,
    startIndex,
    dashRanges,
    rangeCount,
    liveBallPosition,
    radialSegments,
    sampleStride,
    worldRadius,
    radiusTaper,
    dashCapStyle,
  } = input;
  const { positions, normals, uvs, indices, cosTable, sinTable } = buffers;

  const stride = Math.max(1, Math.min(8, Math.round(sampleStride || 1)));
  const baseRadius = Math.max(0.5, worldRadius);
  const clampedTaper = Math.max(0.0, Math.min(0.92, radiusTaper));
  const totalHorizonSpan = Math.max(1, predictionCount - 1 - startIndex);
  const startCapSteps =
    dashCapStyle === 'chamfer' ? CHAMFER_START_CAP_STEPS : ROUND_START_CAP_STEPS;
  const endCapSteps = dashCapStyle === 'chamfer' ? CHAMFER_END_CAP_STEPS : ROUND_END_CAP_STEPS;

  let vertexCount = 0;
  let indexCount = 0;

  for (let r = 0; r < rangeCount; r++) {
    const range = dashRanges[r];
    const dStart = range.startTick;
    const dEnd = range.endTick;
    if (dEnd <= dStart) continue;

    let prevRingBaseVertex = -1;

    // Maintain a stable parallel-transport reference frame along the dash
    let prevBx = 0;
    let prevBy = 0;
    let prevBz = 0;
    let hasFrame = false;

    let k = dStart;
    let reachedEnd = false;
    while (!reachedEnd) {
      if (k >= dEnd) {
        k = dEnd;
        reachedEnd = true;
      }

      let px: number;
      let py: number;
      let pz: number;
      const pOff = k * 3;
      if (k === startIndex && liveBallPosition) {
        const sx = predictedPoints[pOff + 0];
        const sy = predictedPoints[pOff + 1];
        const sz = predictedPoints[pOff + 2];
        const dx = liveBallPosition.x - sx;
        const dy = liveBallPosition.y - sy;
        const dz = liveBallPosition.z - sz;
        if (dx * dx + dy * dy + dz * dz <= 120 * 120) {
          px = liveBallPosition.x;
          py = liveBallPosition.y;
          pz = liveBallPosition.z;
        } else {
          px = sx;
          py = sy;
          pz = sz;
        }
      } else {
        px = predictedPoints[pOff + 0];
        py = predictedPoints[pOff + 1];
        pz = predictedPoints[pOff + 2];
      }

      // Compute tangent vector T
      const kPrev = Math.max(startIndex, k - 1);
      const kNext = Math.min(predictionCount - 1, k + 1);
      const offPrev = kPrev * 3;
      const offNext = kNext * 3;
      let tx = predictedPoints[offNext + 0] - predictedPoints[offPrev + 0];
      let ty = predictedPoints[offNext + 1] - predictedPoints[offPrev + 1];
      let tz = predictedPoints[offNext + 2] - predictedPoints[offPrev + 2];
      const tLen = Math.hypot(tx, ty, tz);
      if (tLen > 1e-5) {
        tx /= tLen;
        ty /= tLen;
        tz /= tLen;
      } else {
        tx = 0;
        ty = 0;
        tz = 1;
      }

      // Orthonormal frame (N, B) perpendicular to tangent T
      let bx: number;
      let by: number;
      let bz: number;
      if (!hasFrame) {
        if (Math.abs(ty) < 0.92) {
          bx = -tz;
          by = 0;
          bz = tx;
        } else {
          bx = 1;
          by = 0;
          bz = 0;
        }
        const bLen = Math.hypot(bx, by, bz) || 1;
        bx /= bLen;
        by /= bLen;
        bz /= bLen;
        hasFrame = true;
      } else {
        const dotTB = tx * prevBx + ty * prevBy + tz * prevBz;
        bx = prevBx - dotTB * tx;
        by = prevBy - dotTB * ty;
        bz = prevBz - dotTB * tz;
        const bLen = Math.hypot(bx, by, bz);
        if (bLen > 1e-5) {
          bx /= bLen;
          by /= bLen;
          bz /= bLen;
        } else {
          bx = prevBx;
          by = prevBy;
          bz = prevBz;
        }
      }
      prevBx = bx;
      prevBy = by;
      prevBz = bz;

      // N = Cross(B, T)
      const nxFrame = by * tz - bz * ty;
      const nyFrame = bz * tx - bx * tz;
      const nzFrame = bx * ty - by * tx;

      const horizonProgress = Math.min(1, Math.max(0, (k - startIndex) / totalHorizonSpan));
      const ringRadius = baseRadius * (1.0 - clampedTaper * horizonProgress);

      const emitStepRing = (step: CapRingStep): boolean => {
        if (
          vertexCount + radialSegments > MAX_TUBE_VERTICES ||
          indexCount + radialSegments * 6 > MAX_TUBE_INDICES
        ) {
          return false;
        }

        const axialOffset = step.axialOffsetScale * ringRadius;
        const cx = px + tx * axialOffset;
        const cy = py + ty * axialOffset;
        const cz = pz + tz * axialOffset;
        const r = ringRadius * step.radiusScale;
        const ringBaseVertex = vertexCount;

        for (let s = 0; s < radialSegments; s++) {
          const c = cosTable[s];
          const sn = sinTable[s];

          const rnx = c * bx + sn * nxFrame;
          const rny = c * by + sn * nyFrame;
          const rnz = c * bz + sn * nzFrame;

          const vOff3 = vertexCount * 3;
          positions[vOff3 + 0] = cx + rnx * r;
          positions[vOff3 + 1] = cy + rny * r;
          positions[vOff3 + 2] = cz + rnz * r;

          normals[vOff3 + 0] = rnx * step.normalRadial + tx * step.normalAxial;
          normals[vOff3 + 1] = rny * step.normalRadial + ty * step.normalAxial;
          normals[vOff3 + 2] = rnz * step.normalRadial + tz * step.normalAxial;

          const vOff2 = vertexCount * 2;
          uvs[vOff2 + 0] = horizonProgress;
          uvs[vOff2 + 1] = step.tipAlpha;

          vertexCount++;
        }

        if (prevRingBaseVertex >= 0) {
          for (let s = 0; s < radialSegments; s++) {
            const nextS = (s + 1) % radialSegments;
            const i00 = prevRingBaseVertex + s;
            const i01 = prevRingBaseVertex + nextS;
            const i10 = ringBaseVertex + s;
            const i11 = ringBaseVertex + nextS;

            indices[indexCount++] = i00;
            indices[indexCount++] = i10;
            indices[indexCount++] = i11;

            indices[indexCount++] = i00;
            indices[indexCount++] = i11;
            indices[indexCount++] = i01;
          }
        }

        prevRingBaseVertex = ringBaseVertex;
        return true;
      };

      let overflowed = false;
      if (k === dStart) {
        for (let cIdx = 0; cIdx < startCapSteps.length; cIdx++) {
          if (!emitStepRing(startCapSteps[cIdx])) {
            overflowed = true;
            break;
          }
        }
      }

      if (!overflowed && !emitStepRing(CYLINDER_RING_STEP)) {
        overflowed = true;
      }

      if (!overflowed && reachedEnd) {
        for (let cIdx = 0; cIdx < endCapSteps.length; cIdx++) {
          if (!emitStepRing(endCapSteps[cIdx])) {
            overflowed = true;
            break;
          }
        }
      }

      if (overflowed) break;
      k += stride;
    }
  }

  return indexCount;
}
