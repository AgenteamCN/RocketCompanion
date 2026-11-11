/**
 * GroundReachabilityRenderer.ts
 * Zero-copy WASM HEAPF32 -> THREE.BufferAttribute view binder for ground/surface reachability
 * isochrones (1s / 2s / 3s contours + translucent bands) computed by `rc_trajectory_mesh`.
 */

import * as THREE from 'three';
import type { RocketSimWasmModule } from '../../physics/RocketSimWasm.ts';
import { N_GROUND_BINS, HORIZON_COLORS_HEX } from './groundReachabilityLut.ts';

export class GroundReachabilityRenderer {
  public groundFills: Array<THREE.Mesh<THREE.BufferGeometry, THREE.MeshBasicMaterial>>;
  public groundLines: Array<THREE.Line<THREE.BufferGeometry, THREE.LineBasicMaterial>>;
  public group: THREE.Group;

  constructor(parentGroup: THREE.Object3D | null | undefined) {
    this.group = new THREE.Group();
    this.group.name = 'reachability-ground-group';
    if (parentGroup) {
      parentGroup.add(this.group);
    }

    this.groundLines = [];
    this.groundFills = [];
    this._initMeshes();
  }

  _initMeshes(): void {
    for (let h = 0; h < 3; h++) {
      // Closed contour line (N_GROUND_BINS + 1 vertices)
      const lineGeom = new THREE.BufferGeometry();
      const linePos = new Float32Array((N_GROUND_BINS + 1) * 3);
      lineGeom.setAttribute('position', new THREE.BufferAttribute(linePos, 3));
      const lineMat = new THREE.LineBasicMaterial({
        color: HORIZON_COLORS_HEX[h],
        transparent: true,
        opacity: 0.92 - h * 0.04,
        depthTest: true,
        depthWrite: false,
      });
      const lineLoop = new THREE.Line(lineGeom, lineMat);
      lineLoop.frustumCulled = false;
      lineLoop.renderOrder = 18;
      this.group.add(lineLoop);
      this.groundLines.push(lineLoop);

      // Translucent fill mesh
      const fillGeom = new THREE.BufferGeometry();
      if (h === 0) {
        // Inner fan: center (index 0) + N_GROUND_BINS ring points
        const fillPos = new Float32Array((N_GROUND_BINS + 1) * 3);
        const indices = new Uint16Array(N_GROUND_BINS * 3);
        for (let i = 0; i < N_GROUND_BINS; i++) {
          const next = ((i + 1) % N_GROUND_BINS) + 1;
          indices[i * 3 + 0] = 0;
          indices[i * 3 + 1] = i + 1;
          indices[i * 3 + 2] = next;
        }
        fillGeom.setAttribute('position', new THREE.BufferAttribute(fillPos, 3));
        fillGeom.setIndex(new THREE.BufferAttribute(indices, 1));
      } else {
        // Annular strip between ring (h - 1) and ring h: 2 * N_GROUND_BINS vertices
        const fillPos = new Float32Array(2 * N_GROUND_BINS * 3);
        const indices = new Uint16Array(2 * N_GROUND_BINS * 3);
        for (let i = 0; i < N_GROUND_BINS; i++) {
          const i1 = (i + 1) % N_GROUND_BINS;
          const j0 = i + N_GROUND_BINS;
          const j1 = i1 + N_GROUND_BINS;
          const base = i * 6;
          indices[base + 0] = i;
          indices[base + 1] = j0;
          indices[base + 2] = j1;
          indices[base + 3] = i;
          indices[base + 4] = j1;
          indices[base + 5] = i1;
        }
        fillGeom.setAttribute('position', new THREE.BufferAttribute(fillPos, 3));
        fillGeom.setIndex(new THREE.BufferAttribute(indices, 1));
      }

      const fillMat = new THREE.MeshBasicMaterial({
        color: HORIZON_COLORS_HEX[h],
        transparent: true,
        opacity: 0.16 - h * 0.035,
        side: THREE.DoubleSide,
        depthTest: true,
        depthWrite: false,
      });
      const fillMesh = new THREE.Mesh(fillGeom, fillMat);
      fillMesh.frustumCulled = false;
      fillMesh.renderOrder = 15 + h;
      this.group.add(fillMesh);
      this.groundFills.push(fillMesh);
    }
  }

  updateFromWasm(
    wasmModule: RocketSimWasmModule,
    groundVisible: boolean,
    config: { groundFillOpacity?: unknown }
  ): void {
    if (!groundVisible) {
      this.group.visible = false;
      return;
    }
    this.group.visible = true;

    const heapF32 = wasmModule.HEAPF32;
    const baseFillOpacity = Math.max(0.02, Math.min(0.6, Number(config.groundFillOpacity) || 0.16));
    const lineFloats = (N_GROUND_BINS + 1) * 3;

    for (let h = 0; h < 3; h++) {
      const linePtr = wasmModule._physics_getGroundReachabilityLinePtr(h) >> 2;
      const lineAttr = this.groundLines[h].geometry.attributes.position as THREE.BufferAttribute;
      (lineAttr.array as Float32Array).set(heapF32.subarray(linePtr, linePtr + lineFloats));
      lineAttr.needsUpdate = true;

      const fillMesh = this.groundFills[h];
      fillMesh.material.opacity = Math.max(0.02, baseFillOpacity * (1.0 - h * 0.22));
      const fillAttr = fillMesh.geometry.attributes.position as THREE.BufferAttribute;
      const fillPtr = wasmModule._physics_getGroundReachabilityFillPtr(h) >> 2;
      const fillFloats = h === 0 ? (N_GROUND_BINS + 1) * 3 : 2 * N_GROUND_BINS * 3;
      (fillAttr.array as Float32Array).set(heapF32.subarray(fillPtr, fillPtr + fillFloats));
      fillAttr.needsUpdate = true;
    }
  }
}
