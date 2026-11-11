import * as THREE from 'three';
import {
  performanceBoostRuntimeConfig,
  type PerformanceBoostConfig,
} from '../../../ui-core/config/performanceBoostConfig.ts';
import {
  createPerformanceBoostMaterial,
  syncPerformanceBoostMaterial,
} from './PerformanceBoostShader.ts';

const ATTACH_SEGMENTS = 16;

let sharedAttachGeometry: THREE.BufferGeometry | null = null;

function getSharedAttachGeometry(): THREE.BufferGeometry {
  if (sharedAttachGeometry) return sharedAttachGeometry;

  const nodeCount = ATTACH_SEGMENTS + 1;
  const vertCount = nodeCount * 2;
  const positions = new Float32Array(vertCount * 3);
  const across = new Float32Array(vertCount);
  const progress = new Float32Array(vertCount);
  const indices = new Uint16Array(ATTACH_SEGMENTS * 6);

  for (let i = 0; i < nodeCount; i++) {
    const t = i / ATTACH_SEGMENTS;
    const vLeft = i * 2;
    const vRight = vLeft + 1;

    across[vLeft] = -1;
    across[vRight] = 1;
    progress[vLeft] = t;
    progress[vRight] = t;
  }

  let idx = 0;
  for (let i = 0; i < ATTACH_SEGMENTS; i++) {
    const b0 = i * 2;
    const b1 = b0 + 1;
    const b2 = b0 + 2;
    const b3 = b0 + 3;
    indices[idx++] = b0;
    indices[idx++] = b2;
    indices[idx++] = b1;
    indices[idx++] = b1;
    indices[idx++] = b2;
    indices[idx++] = b3;
  }

  const geom = new THREE.BufferGeometry();
  geom.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geom.setAttribute('aAcross', new THREE.BufferAttribute(across, 1));
  geom.setAttribute('aProgress', new THREE.BufferAttribute(progress, 1));
  geom.setIndex(new THREE.BufferAttribute(indices, 1));

  sharedAttachGeometry = geom;
  return geom;
}

export class PerformanceBoostAttachVisual {
  public readonly mesh: THREE.Mesh;
  public readonly material: THREE.ShaderMaterial;

  public uStart = 0;
  public uEnd = 0;

  constructor(private readonly carRoot: THREE.Object3D) {
    const cfg = performanceBoostRuntimeConfig;
    this.material = createPerformanceBoostMaterial(cfg, true);
    this.mesh = new THREE.Mesh(getSharedAttachGeometry(), this.material);
    this.mesh.name = 'PerformanceBoostAttachBeam';
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 10;
    this.mesh.visible = false;
    this.mesh.userData = { bloomOccluder: false };
    this.carRoot.add(this.mesh);
  }

  public syncConfig(cfg: PerformanceBoostConfig): void {
    syncPerformanceBoostMaterial(this.material, cfg);
  }

  public reset(): void {
    this.uStart = 0;
    this.uEnd = 0;
    this.mesh.visible = false;
    this.material.uniforms.uSpan.value.set(0, 0);
  }

  public step(
    dt: number,
    isBoosting: boolean,
    nozzleLocal: THREE.Vector3,
    cfg: PerformanceBoostConfig
  ): void {
    const startDur = Math.max(0.015, cfg.attachStartDurationSec || 0.12);
    const endDur = Math.max(0.015, cfg.attachEndDurationSec || 0.18);

    if (dt > 0) {
      if (isBoosting) {
        this.uStart = 0;
        this.uEnd = Math.min(1.0, this.uEnd + dt / startDur);
      } else if (this.uEnd > this.uStart) {
        this.uStart = Math.min(this.uEnd, this.uStart + dt / endDur);
        if (this.uEnd < 1.0) {
          this.uEnd = Math.min(1.0, this.uEnd + (dt / startDur) * 0.65);
        }
        if (this.uEnd - this.uStart <= 0.008) {
          this.uStart = 0;
          this.uEnd = 0;
        }
      } else {
        this.uStart = 0;
        this.uEnd = 0;
      }
    }

    const active = this.uEnd - this.uStart > 0.008;
    this.mesh.visible = active;
    if (!active) return;

    const u = this.material.uniforms;
    u.uSpan.value.set(this.uStart, this.uEnd);
    const nz = cfg.mergeCenterNozzle ? 0 : nozzleLocal.z;
    u.uNozzleOffset.value.set(nozzleLocal.x, nozzleLocal.y, nz);
  }

  public dispose(): void {
    this.carRoot.remove(this.mesh);
    this.material.dispose();
  }
}
