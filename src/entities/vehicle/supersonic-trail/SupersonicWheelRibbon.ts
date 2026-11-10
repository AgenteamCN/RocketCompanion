import * as THREE from 'three';
import {
  supersonicTrailRuntimeConfig,
  subscribeSupersonicTrailConfig,
  type SupersonicTrailConfig,
} from '../../../ui-core/config/supersonicTrailConfig.ts';
import {
  createSupersonicWheelTrailMaterial,
  syncSupersonicWheelTrailMaterial,
} from './SupersonicWheelTrailShader.ts';
import {
  MAX_WHEEL_TRAIL_SAMPLES,
  MAX_RIBBON_RESAMPLED_NODES,
  SupersonicWheelTrailGeometryBuilder,
  type WheelTrailSample,
  type RibbonGeometryBuffers,
} from './SupersonicWheelTrailGeometry.ts';

export type { WheelTrailSample };

export class SupersonicWheelRibbon {
  public readonly geometry: THREE.BufferGeometry;
  public readonly preOcclusionMaterial: THREE.ShaderMaterial;
  public readonly foregroundMaterial: THREE.ShaderMaterial;
  public readonly material: THREE.ShaderMaterial;
  public readonly preOcclusionMesh: THREE.Mesh;
  public readonly foregroundMesh: THREE.Mesh;
  public readonly mesh: THREE.Mesh;
  public readonly wheelSideSign: number;

  private readonly buffers: RibbonGeometryBuffers;
  private readonly across: Float32Array;
  private readonly positionAttribute: THREE.BufferAttribute;
  private readonly progressAttribute: THREE.BufferAttribute;
  private readonly alphaAttribute: THREE.BufferAttribute;

  private readonly samples: WheelTrailSample[];
  private activeSampleCount = 0;
  private lastSampleValid = false;
  private readonly geometryBuilder = new SupersonicWheelTrailGeometryBuilder();

  constructor(name = 'SupersonicWheelRibbon', wheelSideSign = 1) {
    this.wheelSideSign = wheelSideSign >= 0 ? 1 : -1;

    const maxVerts = MAX_RIBBON_RESAMPLED_NODES * 2;
    this.buffers = {
      positions: new Float32Array(maxVerts * 3),
      progress: new Float32Array(maxVerts),
      alphaAttr: new Float32Array(maxVerts),
      indices: new Uint16Array((MAX_RIBBON_RESAMPLED_NODES - 1) * 6),
    };
    this.across = new Float32Array(maxVerts);

    for (let i = 0; i < MAX_RIBBON_RESAMPLED_NODES; i++) {
      this.across[i * 2] = -1;
      this.across[i * 2 + 1] = 1;
    }

    this.positionAttribute = new THREE.BufferAttribute(this.buffers.positions, 3);
    this.positionAttribute.setUsage(THREE.DynamicDrawUsage);
    this.progressAttribute = new THREE.BufferAttribute(this.buffers.progress, 1);
    this.progressAttribute.setUsage(THREE.DynamicDrawUsage);
    this.alphaAttribute = new THREE.BufferAttribute(this.buffers.alphaAttr, 1);
    this.alphaAttribute.setUsage(THREE.DynamicDrawUsage);

    this.geometry = new THREE.BufferGeometry();
    this.geometry.setAttribute('position', this.positionAttribute);
    this.geometry.setAttribute('aAcross', new THREE.BufferAttribute(this.across, 1));
    this.geometry.setAttribute('aProgress', this.progressAttribute);
    this.geometry.setAttribute('aAlpha', this.alphaAttribute);
    this.geometry.setIndex(new THREE.BufferAttribute(this.buffers.indices, 1));
    this.geometry.setDrawRange(0, 0);

    const cfg = supersonicTrailRuntimeConfig;
    this.preOcclusionMaterial = createSupersonicWheelTrailMaterial(cfg, false);
    this.foregroundMaterial = createSupersonicWheelTrailMaterial(cfg, true);
    this.material = this.preOcclusionMaterial;

    // Pass A (renderOrder 0.05): renders before semi-transparent stadium border/goalpost overlays (0.1..0.6)
    // so semi-transparent borders blend over the trail with clear depth layering instead of occluding it.
    this.preOcclusionMesh = new THREE.Mesh(this.geometry, this.preOcclusionMaterial);
    this.preOcclusionMesh.name = `${name}_PreOcclusion`;
    this.preOcclusionMesh.frustumCulled = false;
    this.preOcclusionMesh.renderOrder = 0.05;
    this.preOcclusionMesh.visible = false;
    this.preOcclusionMesh.userData = { bloomOccluder: false };
    this.mesh = this.preOcclusionMesh;

    // Pass B (renderOrder 14): stencil-gated foreground pass (stencilRef = 2, mask = 0x02)
    // that renders over semi-transparent stadium border overlays only when the trail is closer to the camera.
    this.foregroundMesh = new THREE.Mesh(this.geometry, this.foregroundMaterial);
    this.foregroundMesh.name = `${name}_Foreground`;
    this.foregroundMesh.frustumCulled = false;
    this.foregroundMesh.renderOrder = 14;
    this.foregroundMesh.visible = false;
    this.foregroundMesh.userData = { bloomOccluder: false };

    this.samples = Array.from({ length: MAX_WHEEL_TRAIL_SAMPLES }, () => ({
      x: 0,
      y: 0,
      z: 0,
      nx: 0,
      ny: 1,
      nz: 0,
      ageTicks: 0,
      valid: false,
    }));
  }

  public syncMaterialConfig(cfg: SupersonicTrailConfig): void {
    syncSupersonicWheelTrailMaterial(this.preOcclusionMaterial, cfg);
    syncSupersonicWheelTrailMaterial(this.foregroundMaterial, cfg);
  }

  public reset(): void {
    this.activeSampleCount = 0;
    this.lastSampleValid = false;
    this.geometry.setDrawRange(0, 0);
    this.preOcclusionMesh.visible = false;
    this.foregroundMesh.visible = false;
  }

  public hasActiveTrail(): boolean {
    return this.activeSampleCount >= 2 && Boolean(this.samples[0]?.valid || this.samples[1]?.valid);
  }

  public seedFromStationaryVelocity(
    x: number,
    y: number,
    z: number,
    nx: number,
    ny: number,
    nz: number,
    velX: number,
    velY: number,
    velZ: number,
    cfg: SupersonicTrailConfig
  ): void {
    const speed = Math.hypot(velX, velY, velZ);
    if (!cfg.enabled || speed < 100) return;

    // Project velocity onto contact surface plane so seeded ribbon hugs the ground/wall
    const vDotN = velX * nx + velY * ny + velZ * nz;
    let tx = velX - nx * vDotN;
    let ty = velY - ny * vDotN;
    let tz = velZ - nz * vDotN;
    const tLen = Math.hypot(tx, ty, tz);
    if (tLen > 1e-3) {
      tx /= tLen;
      ty /= tLen;
      tz /= tLen;
    } else {
      tx = velX / speed;
      ty = velY / speed;
      tz = velZ / speed;
    }

    this.activeSampleCount = 0;
    const endTicks = Math.max(4, Math.min(60, Math.ceil(cfg.endAgeTicks + 4)));
    const stepUuPerTick = speed / 120;
    for (let age = endTicks; age >= 0; age--) {
      const distBack = age * stepUuPerTick;
      this._unshiftSample(
        x - tx * distBack,
        y - ty * distBack,
        z - tz * distBack,
        nx,
        ny,
        nz,
        age,
        true
      );
    }
    this._unshiftSample(x, y, z, nx, ny, nz, 0, true);
    this.lastSampleValid = true;
  }

  /**
   * Advances sample ages by dtTicks and maintains a continuous Live Head (samples[0], age=0)
   * paired with committed historical knots (samples[1..]) so sub-tick interpolation at
   * startAgeTicks..endAgeTicks has zero 120Hz quantization jump.
   */
  public stepSample(
    dtTicks: number,
    isEmitting: boolean,
    x: number,
    y: number,
    z: number,
    nx: number,
    ny: number,
    nz: number,
    cfg: SupersonicTrailConfig
  ): void {
    if (!cfg.enabled) {
      if (this.activeSampleCount > 0) this.reset();
      return;
    }

    if (!isEmitting && this.activeSampleCount === 0 && !this.lastSampleValid) {
      return;
    }

    // When paused (dtTicks <= 0), preserve all committed sample ages so the trail does not vanish
    if (dtTicks <= 0) {
      if (
        isEmitting &&
        this.lastSampleValid &&
        this.activeSampleCount > 0 &&
        this.samples[0].valid
      ) {
        const liveHead = this.samples[0];
        liveHead.x = x;
        liveHead.y = y;
        liveHead.z = z;
        liveHead.nx = nx;
        liveHead.ny = ny;
        liveHead.nz = nz;
        liveHead.ageTicks = 0;
      }
      return;
    }

    const maxAge = Math.max(cfg.endAgeTicks + 12, cfg.maxHistoryTicks || 120);

    // Age all existing samples; if we have an active live head at samples[0], keep samples[0] at age 0 while aging samples[1..]
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

    if (!isEmitting) {
      if (this.lastSampleValid) {
        if (this.activeSampleCount > 0 && this.samples[0].valid) {
          this.samples[0].ageTicks += dtTicks;
        }
        this._unshiftSample(0, 0, 0, 0, 1, 0, 0, false);
        this.lastSampleValid = false;
      }
      return;
    }

    // Starting a new stroke: push initial committed knot and live head
    if (!this.lastSampleValid || this.activeSampleCount === 0 || !this.samples[0].valid) {
      this._unshiftSample(x, y, z, nx, ny, nz, 0, true);
      this._unshiftSample(x, y, z, nx, ny, nz, 0, true);
      this.lastSampleValid = true;
      return;
    }

    const liveHead = this.samples[0];
    const lastCommitted =
      this.activeSampleCount > 1 && this.samples[1].valid ? this.samples[1] : liveHead;

    const dx = x - lastCommitted.x;
    const dy = y - lastCommitted.y;
    const dz = z - lastCommitted.z;
    const distSq = dx * dx + dy * dy + dz * dz;
    const maxBreakSq = cfg.maxStepBreakDistUu * cfg.maxStepBreakDistUu;

    if (distSq > maxBreakSq) {
      liveHead.ageTicks += dtTicks;
      this._unshiftSample(0, 0, 0, 0, 1, 0, 0, false);
      this._unshiftSample(x, y, z, nx, ny, nz, 0, true);
      this._unshiftSample(x, y, z, nx, ny, nz, 0, true);
      this.lastSampleValid = true;
      return;
    }

    // Always update liveHead (samples[0]) to exact current sub-tick wheel contact position at age 0
    liveHead.x = x;
    liveHead.y = y;
    liveHead.z = z;
    liveHead.nx = nx;
    liveHead.ny = ny;
    liveHead.nz = nz;
    liveHead.ageTicks = 0;
    liveHead.valid = true;

    // Commit a new history knot once enough distance and sub-tick age have accumulated since lastCommitted
    const minDistSq = cfg.minSampleDistUu * cfg.minSampleDistUu;
    if (distSq >= minDistSq && lastCommitted.ageTicks >= 0.65) {
      this._unshiftSample(x, y, z, nx, ny, nz, 0, true);
    }

    this.lastSampleValid = true;
  }

  private _unshiftSample(
    x: number,
    y: number,
    z: number,
    nx: number,
    ny: number,
    nz: number,
    ageTicks: number,
    valid: boolean
  ): void {
    const recycled = this.samples.pop()!;
    recycled.x = x;
    recycled.y = y;
    recycled.z = z;
    recycled.nx = nx;
    recycled.ny = ny;
    recycled.nz = nz;
    recycled.ageTicks = ageTicks;
    recycled.valid = valid;
    this.samples.unshift(recycled);
    if (this.activeSampleCount < MAX_WHEEL_TRAIL_SAMPLES) {
      this.activeSampleCount++;
    }
  }

  public rebuildGeometry(
    cameraPos: THREE.Vector3 | null,
    isFocusedPovCar: boolean,
    cfg: SupersonicTrailConfig
  ): void {
    if (
      this.activeSampleCount < 2 &&
      !this.preOcclusionMesh.visible &&
      !this.foregroundMesh.visible
    ) {
      return;
    }
    const indexCount = this.geometryBuilder.build(
      this.samples,
      this.activeSampleCount,
      cameraPos,
      this.wheelSideSign,
      isFocusedPovCar,
      cfg,
      this.buffers
    );

    if (indexCount === 0) {
      this.preOcclusionMesh.visible = false;
      this.foregroundMesh.visible = false;
      this.geometry.setDrawRange(0, 0);
      return;
    }

    this.positionAttribute.needsUpdate = true;
    this.progressAttribute.needsUpdate = true;
    this.alphaAttribute.needsUpdate = true;
    this.geometry.index!.needsUpdate = true;
    this.geometry.setDrawRange(0, indexCount);
    this.preOcclusionMesh.visible = true;
    this.foregroundMesh.visible = true;
  }

  public dispose(): void {
    this.geometry.dispose();
    this.preOcclusionMaterial.dispose();
    this.foregroundMaterial.dispose();
    this.preOcclusionMesh.removeFromParent();
    this.foregroundMesh.removeFromParent();
  }
}

export function registerSupersonicWheelRibbonConfigSync(
  ribbons: SupersonicWheelRibbon[]
): () => void {
  return subscribeSupersonicTrailConfig((cfg) => {
    for (const r of ribbons) {
      r.syncMaterialConfig(cfg);
    }
  });
}
