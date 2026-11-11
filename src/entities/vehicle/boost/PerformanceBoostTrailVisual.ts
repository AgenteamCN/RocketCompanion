import * as THREE from 'three';
import {
  performanceBoostRuntimeConfig,
  type PerformanceBoostConfig,
} from '../../../ui-core/config/performanceBoostConfig.ts';
import {
  createPerformanceBoostMaterial,
  syncPerformanceBoostMaterial,
} from './PerformanceBoostShader.ts';

const MAX_TRAIL_SAMPLES = 96;
const MAX_TRAIL_NODES = 64;

interface BoostTrailSample {
  x: number;
  y: number;
  z: number;
  ageTicks: number;
  valid: boolean;
}

interface EvaluatedPoint {
  x: number;
  y: number;
  z: number;
}

function evaluateBoostStrokeAtAge(
  samples: BoostTrailSample[],
  sStart: number,
  sEnd: number,
  targetAge: number,
  cursorHint: number,
  out: EvaluatedPoint
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
  return c;
}

export class PerformanceBoostTrailVisual {
  public readonly geometry: THREE.BufferGeometry;
  public readonly material: THREE.ShaderMaterial;
  public readonly mesh: THREE.Mesh;

  private readonly positions: Float32Array;
  private readonly progress: Float32Array;
  private readonly alphaAttr: Float32Array;
  private readonly indices: Uint16Array;
  private readonly positionAttribute: THREE.BufferAttribute;
  private readonly progressAttribute: THREE.BufferAttribute;
  private readonly alphaAttribute: THREE.BufferAttribute;

  private readonly samples: BoostTrailSample[];
  private activeSampleCount = 0;
  private lastSampleValid = false;

  private readonly _ptCurr: EvaluatedPoint = { x: 0, y: 0, z: 0 };
  private readonly _ptPrev: EvaluatedPoint = { x: 0, y: 0, z: 0 };
  private readonly _ptNext: EvaluatedPoint = { x: 0, y: 0, z: 0 };
  private readonly _tangent = new THREE.Vector3();
  private readonly _viewDir = new THREE.Vector3();
  private readonly _side = new THREE.Vector3();

  constructor(private readonly scene: THREE.Scene) {
    const maxVerts = MAX_TRAIL_NODES * 2;
    this.positions = new Float32Array(maxVerts * 3);
    this.progress = new Float32Array(maxVerts);
    this.alphaAttr = new Float32Array(maxVerts);
    this.indices = new Uint16Array((MAX_TRAIL_NODES - 1) * 6);
    const across = new Float32Array(maxVerts);

    for (let i = 0; i < MAX_TRAIL_NODES; i++) {
      across[i * 2] = -1;
      across[i * 2 + 1] = 1;
    }

    this.positionAttribute = new THREE.BufferAttribute(this.positions, 3);
    this.positionAttribute.setUsage(THREE.DynamicDrawUsage);
    this.progressAttribute = new THREE.BufferAttribute(this.progress, 1);
    this.progressAttribute.setUsage(THREE.DynamicDrawUsage);
    this.alphaAttribute = new THREE.BufferAttribute(this.alphaAttr, 1);
    this.alphaAttribute.setUsage(THREE.DynamicDrawUsage);

    this.geometry = new THREE.BufferGeometry();
    this.geometry.setAttribute('position', this.positionAttribute);
    this.geometry.setAttribute('aAcross', new THREE.BufferAttribute(across, 1));
    this.geometry.setAttribute('aProgress', this.progressAttribute);
    this.geometry.setAttribute('aAlpha', this.alphaAttribute);
    this.geometry.setIndex(new THREE.BufferAttribute(this.indices, 1));
    this.geometry.setDrawRange(0, 0);

    this.material = createPerformanceBoostMaterial(performanceBoostRuntimeConfig, false);
    this.mesh = new THREE.Mesh(this.geometry, this.material);
    this.mesh.name = 'PerformanceBoostTrailRibbon';
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 10;
    this.mesh.visible = false;
    this.mesh.userData = { bloomOccluder: false };
    this.scene.add(this.mesh);

    this.samples = Array.from({ length: MAX_TRAIL_SAMPLES }, () => ({
      x: 0,
      y: 0,
      z: 0,
      ageTicks: 0,
      valid: false,
    }));
  }

  public syncConfig(cfg: PerformanceBoostConfig): void {
    syncPerformanceBoostMaterial(this.material, cfg);
  }

  public reset(): void {
    this.activeSampleCount = 0;
    this.lastSampleValid = false;
    this.geometry.setDrawRange(0, 0);
    this.mesh.visible = false;
  }

  private _unshiftSample(x: number, y: number, z: number, ageTicks: number, valid: boolean): void {
    const limit = Math.min(this.activeSampleCount, MAX_TRAIL_SAMPLES - 1);
    for (let i = limit; i > 0; i--) {
      const dst = this.samples[i];
      const src = this.samples[i - 1];
      dst.x = src.x;
      dst.y = src.y;
      dst.z = src.z;
      dst.ageTicks = src.ageTicks;
      dst.valid = src.valid;
    }
    const head = this.samples[0];
    head.x = x;
    head.y = y;
    head.z = z;
    head.ageTicks = ageTicks;
    head.valid = valid;
    if (this.activeSampleCount < MAX_TRAIL_SAMPLES) {
      this.activeSampleCount++;
    }
  }

  public step(
    dt: number,
    isBoosting: boolean,
    worldPos: THREE.Vector3,
    cameraPos: THREE.Vector3 | null,
    cfg: PerformanceBoostConfig
  ): void {
    const dtTicks = Math.max(0, dt * 120);
    const x = worldPos.x;
    const y = worldPos.y;
    const z = worldPos.z;

    if (!isBoosting && this.activeSampleCount === 0 && !this.lastSampleValid) {
      this.mesh.visible = false;
      return;
    }

    if (dtTicks > 0) {
      const maxAge = Math.max(cfg.endAgeTicks + 12, 120);
      const startAgingIdx =
        this.lastSampleValid && this.activeSampleCount > 0 && this.samples[0].valid ? 1 : 0;
      for (let i = startAgingIdx; i < this.activeSampleCount; i++) {
        this.samples[i].ageTicks += dtTicks;
      }
      while (
        this.activeSampleCount > 0 &&
        this.samples[this.activeSampleCount - 1].ageTicks > maxAge
      ) {
        this.activeSampleCount--;
      }

      if (!isBoosting) {
        if (this.lastSampleValid) {
          if (this.activeSampleCount > 0 && this.samples[0].valid) {
            this.samples[0].ageTicks += dtTicks;
          }
          this._unshiftSample(0, 0, 0, 0, false);
          this.lastSampleValid = false;
        }
      } else if (!this.lastSampleValid || this.activeSampleCount < 2 || !this.samples[0].valid) {
        this._unshiftSample(x, y, z, dtTicks, true);
        this._unshiftSample(x, y, z, 0, true);
        this.lastSampleValid = true;
      } else {
        const liveHead = this.samples[0];
        const lastKnot = this.samples[1];
        const distFromKnot = Math.hypot(x - lastKnot.x, y - lastKnot.y, z - lastKnot.z);
        const maxBreak = Math.max(60, cfg.maxStepBreakDistUu || 260);

        if (distFromKnot > maxBreak) {
          liveHead.ageTicks += dtTicks;
          this._unshiftSample(0, 0, 0, 0, false);
          this._unshiftSample(x, y, z, dtTicks, true);
          this._unshiftSample(x, y, z, 0, true);
        } else {
          liveHead.x = x;
          liveHead.y = y;
          liveHead.z = z;
          liveHead.ageTicks = 0;
          liveHead.valid = true;
          if (distFromKnot >= Math.max(1.5, cfg.minSampleDistUu || 10) || lastKnot.ageTicks >= 2.0) {
            this._unshiftSample(x, y, z, 0, true);
          }
        }
      }
    } else if (isBoosting && this.lastSampleValid && this.activeSampleCount > 0 && this.samples[0].valid) {
      this.samples[0].x = x;
      this.samples[0].y = y;
      this.samples[0].z = z;
    }

    this._rebuildRibbonGeometry(cameraPos, cfg);
  }

  private _rebuildRibbonGeometry(
    cameraPos: THREE.Vector3 | null,
    cfg: PerformanceBoostConfig
  ): void {
    if (this.activeSampleCount < 2) {
      this.geometry.setDrawRange(0, 0);
      this.mesh.visible = false;
      return;
    }

    const startAge = Math.max(0, cfg.startAgeTicks || 0);
    const endAge = Math.max(startAge + 2, cfg.endAgeTicks || 38);
    const spanAge = endAge - startAge;

    let vertexPairCount = 0;
    let indexCount = 0;
    let idx = 0;

    while (idx < this.activeSampleCount) {
      if (!this.samples[idx].valid) {
        idx++;
        continue;
      }
      const sStart = idx;
      while (idx + 1 < this.activeSampleCount && this.samples[idx + 1].valid) {
        idx++;
      }
      const sEnd = idx;
      idx++;
      if (sEnd <= sStart) continue;

      const aMin = this.samples[sStart].ageTicks;
      const aMax = this.samples[sEnd].ageTicks;
      const clipStart = Math.max(startAge, aMin);
      const clipEnd = Math.min(endAge, aMax);
      const clipSpan = clipEnd - clipStart;
      if (clipSpan < 0.15) continue;

      const remainingPairs = MAX_TRAIL_NODES - vertexPairCount;
      if (remainingPairs < 2) break;

      const desiredSteps = Math.ceil(clipSpan / 0.8) + 1;
      const nodeCount = Math.max(2, Math.min(remainingPairs, Math.min(48, desiredSteps)));
      const ageStep = clipSpan / (nodeCount - 1);
      const tangentDelta = Math.max(0.4, Math.min(1.2, ageStep));

      let cursor = sStart;
      for (let j = 0; j < nodeCount; j++) {
        const tau = j === nodeCount - 1 ? clipEnd : clipStart + j * ageStep;
        cursor = evaluateBoostStrokeAtAge(this.samples, sStart, sEnd, tau, cursor, this._ptCurr);

        const tauAhead = Math.max(aMin, tau - tangentDelta);
        const tauBehind = Math.min(aMax, tau + tangentDelta);
        evaluateBoostStrokeAtAge(this.samples, sStart, sEnd, tauAhead, cursor, this._ptPrev);
        evaluateBoostStrokeAtAge(this.samples, sStart, sEnd, tauBehind, cursor, this._ptNext);

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

        if (cameraPos) {
          this._viewDir.set(
            cameraPos.x - this._ptCurr.x,
            cameraPos.y - this._ptCurr.y,
            cameraPos.z - this._ptCurr.z
          );
          if (this._viewDir.lengthSq() < 1e-4) {
            this._viewDir.set(0, 1, 0);
          } else {
            this._viewDir.normalize();
          }
        } else {
          this._viewDir.set(0, 1, 0);
        }

        this._side.crossVectors(this._tangent, this._viewDir);
        if (this._side.lengthSq() < 1e-5) {
          this._side.set(0, 1, 0);
        } else {
          this._side.normalize();
        }

        const progress = THREE.MathUtils.clamp((tau - startAge) / spanAge, 0, 1);
        const strokeRel = THREE.MathUtils.clamp((tau - clipStart) / Math.max(0.15, clipSpan), 0, 1);
        const widthFactor = Math.pow(1.0 - progress, Math.max(0.1, cfg.widthTaperCurve));
        let halfWidth = 0.5 * THREE.MathUtils.lerp(cfg.tailWidthUu, cfg.headWidthUu, widthFactor);

        // Smooth detached head & tip feathering so the ribbon never cuts off abruptly
        const detachedHeadFeather = aMin > startAge + 0.25 ? THREE.MathUtils.smoothstep(strokeRel, 0, 0.16) : 1.0;
        const tipFeather = 1.0 - THREE.MathUtils.smoothstep(progress, 0.86, 1.0);
        halfWidth *= 0.35 + 0.65 * detachedHeadFeather;

        const alpha =
          Math.pow(1.0 - progress, Math.max(0.1, cfg.fadeCurve)) *
          detachedHeadFeather *
          tipFeather;

        const vLeft = vertexPairCount * 2;
        const vRight = vLeft + 1;

        this.positions[vLeft * 3] = this._ptCurr.x - this._side.x * halfWidth;
        this.positions[vLeft * 3 + 1] = this._ptCurr.y - this._side.y * halfWidth;
        this.positions[vLeft * 3 + 2] = this._ptCurr.z - this._side.z * halfWidth;
        this.progress[vLeft] = progress;
        this.alphaAttr[vLeft] = alpha;

        this.positions[vRight * 3] = this._ptCurr.x + this._side.x * halfWidth;
        this.positions[vRight * 3 + 1] = this._ptCurr.y + this._side.y * halfWidth;
        this.positions[vRight * 3 + 2] = this._ptCurr.z + this._side.z * halfWidth;
        this.progress[vRight] = progress;
        this.alphaAttr[vRight] = alpha;

        if (j > 0) {
          const b0 = (vertexPairCount - 1) * 2;
          const b1 = b0 + 1;
          const b2 = vertexPairCount * 2;
          const b3 = b2 + 1;
          this.indices[indexCount++] = b0;
          this.indices[indexCount++] = b2;
          this.indices[indexCount++] = b1;
          this.indices[indexCount++] = b1;
          this.indices[indexCount++] = b2;
          this.indices[indexCount++] = b3;
        }
        vertexPairCount++;
      }
    }

    if (indexCount > 0) {
      this.positionAttribute.needsUpdate = true;
      this.progressAttribute.needsUpdate = true;
      this.alphaAttribute.needsUpdate = true;
      const idxAttr = this.geometry.getIndex();
      if (idxAttr) idxAttr.needsUpdate = true;
      this.geometry.setDrawRange(0, indexCount);
      this.mesh.visible = true;
    } else {
      this.geometry.setDrawRange(0, 0);
      this.mesh.visible = false;
    }
  }

  public dispose(): void {
    this.scene.remove(this.mesh);
    this.geometry.dispose();
    this.material.dispose();
  }
}
