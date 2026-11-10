import * as THREE from 'three';
import type { SupersonicTrailConfig } from '../../../ui-core/config/supersonicTrailConfig.ts';

export const MAX_WHEEL_TRAIL_SAMPLES = 160;
export const MAX_RIBBON_RESAMPLED_NODES = 128;

export interface WheelTrailSample {
  x: number;
  y: number;
  z: number;
  nx: number;
  ny: number;
  nz: number;
  ageTicks: number;
  valid: boolean;
}

export interface RibbonGeometryBuffers {
  positions: Float32Array;
  progress: Float32Array;
  alphaAttr: Float32Array;
  indices: Uint16Array;
}

interface EvaluatedTrailPoint {
  x: number;
  y: number;
  z: number;
  nx: number;
  ny: number;
  nz: number;
}

function evaluateStrokeAtAge(
  samples: WheelTrailSample[],
  sStart: number,
  sEnd: number,
  targetAge: number,
  cursorHint: number,
  out: EvaluatedTrailPoint
): number {
  let c = Math.max(sStart, Math.min(sEnd - 1, cursorHint));
  while (c < sEnd - 1 && samples[c + 1].ageTicks < targetAge) {
    c++;
  }
  while (c > sStart && samples[c].ageTicks > targetAge) {
    c--;
  }

  const s0 = samples[c];
  const s1 = samples[Math.min(sEnd, c + 1)];
  const span = s1.ageTicks - s0.ageTicks;
  const t = span > 1e-4 ? THREE.MathUtils.clamp((targetAge - s0.ageTicks) / span, 0, 1) : 0;

  out.x = s0.x + (s1.x - s0.x) * t;
  out.y = s0.y + (s1.y - s0.y) * t;
  out.z = s0.z + (s1.z - s0.z) * t;
  out.nx = s0.nx + (s1.nx - s0.nx) * t;
  out.ny = s0.ny + (s1.ny - s0.ny) * t;
  out.nz = s0.nz + (s1.nz - s0.nz) * t;
  return c;
}

export class SupersonicWheelTrailGeometryBuilder {
  private readonly _ptCurr: EvaluatedTrailPoint = { x: 0, y: 0, z: 0, nx: 0, ny: 1, nz: 0 };
  private readonly _ptPrev: EvaluatedTrailPoint = { x: 0, y: 0, z: 0, nx: 0, ny: 1, nz: 0 };
  private readonly _ptNext: EvaluatedTrailPoint = { x: 0, y: 0, z: 0, nx: 0, ny: 1, nz: 0 };

  private readonly _tangent = new THREE.Vector3();
  private readonly _normal = new THREE.Vector3();
  private readonly _normalPerp = new THREE.Vector3();
  private readonly _surfSide = new THREE.Vector3();
  private readonly _side = new THREE.Vector3();
  private readonly _viewDir = new THREE.Vector3();
  private readonly _fallbackUp = new THREE.Vector3(0, 1, 0);

  public build(
    samples: WheelTrailSample[],
    activeSampleCount: number,
    cameraPos: THREE.Vector3 | null,
    wheelSideSign: number,
    isFocusedPovCar: boolean,
    cfg: SupersonicTrailConfig,
    buffers: RibbonGeometryBuffers
  ): number {
    if (!cfg.enabled || activeSampleCount < 2) {
      return 0;
    }

    const startAge = Math.max(0, cfg.startAgeTicks);
    const endAge = Math.max(startAge + 1, cfg.endAgeTicks);
    const spanAge = endAge - startAge;
    const baseLift = cfg.surfaceLiftUu;
    const mode = cfg.orientationMode || 'surface-aligned';
    const tiltStrength = THREE.MathUtils.clamp(cfg.cameraTiltStrength ?? 0.8, 0, 1);
    const uprightHeightScale = Math.max(0.25, cfg.uprightHeightScale ?? 1.35);
    const uprightHingeLift = Math.max(0, cfg.uprightGroundHingeLift ?? 1.0);
    const forcePovUpright = Boolean(isFocusedPovCar && cfg.povForceUprightPreview);

    let vertexPairCount = 0;
    let indexCount = 0;

    let idx = 0;
    while (idx < activeSampleCount) {
      if (!samples[idx].valid) {
        idx++;
        continue;
      }

      const sStart = idx;
      while (idx + 1 < activeSampleCount && samples[idx + 1].valid) {
        idx++;
      }
      const sEnd = idx;
      idx++;

      if (sEnd <= sStart) continue;

      const aMin = samples[sStart].ageTicks;
      const aMax = samples[sEnd].ageTicks;
      const clipStart = Math.max(startAge, aMin);
      const clipEnd = Math.min(endAge, aMax);
      const clipSpan = clipEnd - clipStart;

      if (clipSpan < 0.12) continue;

      const remainingPairs = MAX_RIBBON_RESAMPLED_NODES - vertexPairCount;
      if (remainingPairs < 2) break;

      const desiredSteps = Math.ceil(clipSpan / 0.5) + 1;
      const nodeCount = Math.max(2, Math.min(remainingPairs, Math.min(64, desiredSteps)));
      const ageStep = clipSpan / (nodeCount - 1);
      const tangentDelta = Math.max(0.35, Math.min(1.0, ageStep));

      let cursor = sStart;
      for (let j = 0; j < nodeCount; j++) {
        const tau = j === nodeCount - 1 ? clipEnd : clipStart + j * ageStep;
        cursor = evaluateStrokeAtAge(samples, sStart, sEnd, tau, cursor, this._ptCurr);

        const tauAhead = Math.max(aMin, tau - tangentDelta);
        const tauBehind = Math.min(aMax, tau + tangentDelta);
        evaluateStrokeAtAge(samples, sStart, sEnd, tauAhead, cursor, this._ptPrev);
        evaluateStrokeAtAge(samples, sStart, sEnd, tauBehind, cursor, this._ptNext);

        this._tangent.set(
          this._ptNext.x - this._ptPrev.x,
          this._ptNext.y - this._ptPrev.y,
          this._ptNext.z - this._ptPrev.z
        );
        if (this._tangent.lengthSq() < 1e-6) {
          this._tangent.set(1, 0, 0);
        } else {
          this._tangent.normalize();
        }

        this._normal.set(this._ptCurr.nx, this._ptCurr.ny, this._ptCurr.nz);
        if (this._normal.lengthSq() < 1e-4) {
          this._normal.copy(this._fallbackUp);
        } else {
          this._normal.normalize();
        }

        // Build orthonormal frame (surfSide, normalPerp, tangent)
        const nDotT = this._normal.dot(this._tangent);
        this._normalPerp.copy(this._normal).addScaledVector(this._tangent, -nDotT);
        if (this._normalPerp.lengthSq() < 1e-5) {
          this._normalPerp.copy(this._fallbackUp);
        } else {
          this._normalPerp.normalize();
        }

        this._surfSide.crossVectors(this._tangent, this._normalPerp);
        if (this._surfSide.lengthSq() < 1e-6) {
          this._surfSide.set(0, 0, 1);
        } else {
          this._surfSide.normalize();
        }

        const progress = THREE.MathUtils.clamp((tau - startAge) / spanAge, 0, 1);
        const widthFactor = Math.pow(1.0 - progress, Math.max(0.1, cfg.widthTaperCurve));
        const baseHalfWidth =
          0.5 * THREE.MathUtils.lerp(cfg.tailWidthUu, cfg.headWidthUu, widthFactor);

        // Compute view-adaptive tilt angle theta around tangent axis:
        // - Focused POV car: always flat on surface (sinTheta=0, cosTheta=1) UNLESS povForceUprightPreview is enabled
        // - Other cars / non-POV cameras: tilt toward camera based on cameraTiltStrength / orientationMode
        let sinTheta = 0;
        let cosTheta = 1;

        if (forcePovUpright) {
          // Force 90-degree vertical stand in POV for calibration preview
          sinTheta = 1;
          cosTheta = 0;
        } else if (!isFocusedPovCar && mode !== 'flat-ground' && cameraPos) {
          const dx = cameraPos.x - this._ptCurr.x;
          const dy = cameraPos.y - this._ptCurr.y;
          const dz = cameraPos.z - this._ptCurr.z;
          const dist = Math.hypot(dx, dy, dz);
          const invDist = 1 / Math.max(1, dist);
          this._viewDir.set(dx * invDist, dy * invDist, dz * invDist);

          let vS = this._viewDir.dot(this._surfSide);
          const vN = Math.abs(this._viewDir.dot(this._normalPerp));

          // At shallow grazing elevation when viewing a remote car nearly head-on or tail-on,
          // ensure a minimum lateral bias so distant straight-line trails still stand upright
          const shallowElevation = 1.0 - THREE.MathUtils.smoothstep(vN, 0.04, 0.32);
          if (Math.abs(vS) < 0.2 && shallowElevation > 0.01) {
            const sign = Math.abs(vS) > 0.02 ? Math.sign(vS) : wheelSideSign;
            vS = THREE.MathUtils.lerp(vS, sign * 0.28, shallowElevation);
          }

          const rawTheta = Math.atan2(-vS, Math.max(0.02, vN));
          const theta = mode === 'camera-facing' ? rawTheta : tiltStrength * rawTheta;
          sinTheta = Math.sin(theta);
          cosTheta = Math.cos(theta);
        }

        const uprightBlend = Math.abs(sinTheta);
        const effectiveHalfWidth =
          baseHalfWidth * THREE.MathUtils.lerp(1.0, uprightHeightScale, uprightBlend);

        this._side
          .copy(this._surfSide)
          .multiplyScalar(cosTheta)
          .addScaledVector(this._normalPerp, sinTheta)
          .normalize();

        // Ground-hinge lift: when rotated upright, shift the ribbon center upward along the surface normal
        // by effectiveHalfWidth * |sinTheta| * uprightHingeLift so the bottom edge hugs the surface
        // and the full vertical height extends upward past the wheel axle instead of sinking underground.
        const hingeLift = baseLift + effectiveHalfWidth * uprightBlend * uprightHingeLift;
        const px = this._ptCurr.x + this._normalPerp.x * hingeLift;
        const py = this._ptCurr.y + this._normalPerp.y * hingeLift;
        const pz = this._ptCurr.z + this._normalPerp.z * hingeLift;

        const alpha = Math.pow(1.0 - progress, Math.max(0.1, cfg.fadeCurve));

        const vLeft = vertexPairCount * 2;
        const vRight = vLeft + 1;

        buffers.positions[vLeft * 3] = px - this._side.x * effectiveHalfWidth;
        buffers.positions[vLeft * 3 + 1] = py - this._side.y * effectiveHalfWidth;
        buffers.positions[vLeft * 3 + 2] = pz - this._side.z * effectiveHalfWidth;
        buffers.progress[vLeft] = progress;
        buffers.alphaAttr[vLeft] = alpha;

        buffers.positions[vRight * 3] = px + this._side.x * effectiveHalfWidth;
        buffers.positions[vRight * 3 + 1] = py + this._side.y * effectiveHalfWidth;
        buffers.positions[vRight * 3 + 2] = pz + this._side.z * effectiveHalfWidth;
        buffers.progress[vRight] = progress;
        buffers.alphaAttr[vRight] = alpha;

        if (j > 0) {
          const prevLeft = (vertexPairCount - 1) * 2;
          const prevRight = prevLeft + 1;
          buffers.indices[indexCount++] = prevLeft;
          buffers.indices[indexCount++] = vLeft;
          buffers.indices[indexCount++] = prevRight;
          buffers.indices[indexCount++] = prevRight;
          buffers.indices[indexCount++] = vLeft;
          buffers.indices[indexCount++] = vRight;
        }

        vertexPairCount++;
      }
    }

    return indexCount;
  }
}
