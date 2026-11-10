/**
 * GroundReachabilityRenderer.ts
 * Three.js visual renderer for ground/surface reachability isochrones (1s / 2s / 3s contours + translucent bands).
 * Automatically hides when the vehicle is not on the ground (!isOnGround).
 */

import * as THREE from 'three';
import { N_GROUND_BINS } from './groundReachabilityLut.ts';
import {
  HORIZON_COLORS_HEX,
  GROUND_COS,
  GROUND_SIN,
  clipArenaRocketSimXYZ,
} from './ReachabilityConstants.ts';
import { predictGroundRadiiLUT, predictGroundRadiiAnalytical } from './GroundReachabilityMath.ts';

export class GroundReachabilityRenderer {
  public _groundWorldRings: [Float32Array, Float32Array, Float32Array];
  public _hasPrevRadii: boolean;
  public _rawRadii: Float32Array;
  public _smoothedRadii: Float32Array;
  public groundFills: Array<THREE.Mesh<THREE.BufferGeometry, THREE.MeshBasicMaterial>>;
  public groundLines: Array<THREE.Line<THREE.BufferGeometry, THREE.LineBasicMaterial>>;
  public group: THREE.Group;

  constructor(parentGroup: THREE.Object3D | null | undefined) {
    this.group = new THREE.Group();
    this.group.name = 'reachability-ground-group';
    if (parentGroup) {
      parentGroup.add(this.group);
    }

    this._rawRadii = new Float32Array(3 * N_GROUND_BINS);
    this._smoothedRadii = new Float32Array(3 * N_GROUND_BINS);
    this._hasPrevRadii = false;
    this._groundWorldRings = [
      new Float32Array(N_GROUND_BINS * 3),
      new Float32Array(N_GROUND_BINS * 3),
      new Float32Array(N_GROUND_BINS * 3),
    ];

    this.groundLines = [];
    this.groundFills = [];
    this._initMeshes();
  }

  _initMeshes() {
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

  update(carState, config) {
    // Requirement: Ground reachability area automatically hides when the vehicle is not on the ground.
    if (!config.showGround || !carState.isOnGround) {
      this.group.visible = false;
      this._hasPrevRadii = false;
      return;
    }
    this.group.visible = true;

    const {
      posX,
      posY,
      posZ,
      velX,
      velY,
      velZ,
      fwdX,
      fwdY,
      fwdZ,
      rightX,
      rightY,
      rightZ,
      upX,
      upY,
      upZ,
      angVelX,
      angVelY,
      angVelZ,
    } = carState;

    // Project 3D velocity & angular velocity onto current driving surface frame
    const vf = velX * fwdX + velY * fwdY + velZ * fwdZ;
    const vr = velX * rightX + velY * rightY + velZ * rightZ;
    const wz = angVelX * upX + angVelY * upY + angVelZ * upZ;

    if (config.groundMode === 'analytical') {
      predictGroundRadiiAnalytical(vf, vr, wz, this._rawRadii);
    } else {
      predictGroundRadiiLUT(vf, vr, wz, this._rawRadii);
    }

    // Temporal EMA filter to keep contours rock-solid at 120Hz
    const carSpd = Math.hypot(vf, vr);
    const alpha = carSpd > 30.0 ? 0.42 : 0.85;
    const totalBins = 3 * N_GROUND_BINS;
    if (!this._hasPrevRadii) {
      this._smoothedRadii.set(this._rawRadii);
      this._hasPrevRadii = true;
    } else {
      const oneMinusAlpha = 1.0 - alpha;
      for (let i = 0; i < totalBins; i++) {
        this._smoothedRadii[i] = alpha * this._rawRadii[i] + oneMinusAlpha * this._smoothedRadii[i];
      }
    }

    const normalOffsets = [7.0, 9.5, 12.0];
    const baseFillOpacity = Math.max(0.02, Math.min(0.6, Number(config.groundFillOpacity) || 0.16));

    // Car origin in Three.js coords lifted slightly along surface normal
    const carLiftRx = posX + upX * 6.0;
    const carLiftRy = posY + upY * 6.0;
    const carLiftRz = posZ + upZ * 6.0;
    const carThreeX = carLiftRx;
    const carThreeY = carLiftRz;
    const carThreeZ = carLiftRy;

    for (let h = 0; h < 3; h++) {
      const base = h * N_GROUND_BINS;
      const nLift = normalOffsets[h];
      const ringThree = this._groundWorldRings[h];
      const lineAttr = this.groundLines[h].geometry.attributes.position;
      const lineArr = lineAttr.array;

      for (let i = 0; i < N_GROUND_BINS; i++) {
        const r = this._smoothedRadii[base + i];
        const lu = r * GROUND_COS[i];
        const lv = r * GROUND_SIN[i];

        const wx = posX + lu * fwdX + lv * rightX + nLift * upX;
        const wy = posY + lu * fwdY + lv * rightY + nLift * upY;
        const wzCoord = posZ + lu * fwdZ + lv * rightZ + nLift * upZ;

        const clipped = clipArenaRocketSimXYZ(wx, wy, wzCoord, 44.0);
        // Convert RocketSim (x, y, z) -> Three.js (x, z, y)
        const tx = clipped.x;
        const ty = clipped.z;
        const tz = clipped.y;

        const idx3 = i * 3;
        ringThree[idx3 + 0] = tx;
        ringThree[idx3 + 1] = ty;
        ringThree[idx3 + 2] = tz;

        lineArr[idx3 + 0] = tx;
        lineArr[idx3 + 1] = ty;
        lineArr[idx3 + 2] = tz;
      }

      // Close contour loop
      const lastIdx = N_GROUND_BINS * 3;
      lineArr[lastIdx + 0] = ringThree[0];
      lineArr[lastIdx + 1] = ringThree[1];
      lineArr[lastIdx + 2] = ringThree[2];
      lineAttr.needsUpdate = true;

      // Update fill geometry
      const fillMesh = this.groundFills[h];
      fillMesh.material.opacity = Math.max(0.02, baseFillOpacity * (1.0 - h * 0.22));
      const fillAttr = fillMesh.geometry.attributes.position;
      const fillArr = fillAttr.array;

      if (h === 0) {
        fillArr[0] = carThreeX;
        fillArr[1] = carThreeY;
        fillArr[2] = carThreeZ;
        fillArr.set(ringThree, 3);
      } else {
        const prevRingThree = this._groundWorldRings[h - 1];
        fillArr.set(prevRingThree, 0);
        fillArr.set(ringThree, N_GROUND_BINS * 3);
      }
      fillAttr.needsUpdate = true;
    }
  }
}
