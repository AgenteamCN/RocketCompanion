/**
 * InterceptCrossRenderer.ts
 * Zero-copy WASM HEAPF32 -> Three.js LineSegments2 + Sphere binder for the 3D Orthogonal Intercept Cross
 * computed by `rc_trajectory_mesh`.
 */

import * as THREE from 'three';
import { LineSegments2 } from 'three/addons/lines/LineSegments2.js';
import { LineSegmentsGeometry } from 'three/addons/lines/LineSegmentsGeometry.js';
import { LineMaterial } from 'three/addons/lines/LineMaterial.js';
import type { RocketSimWasmModule } from '../../physics/RocketSimWasm.ts';
import type { BallTrajectoryPredictor } from '../BallTrajectoryPredictor.ts';

export interface InterceptSolutionView {
  status: 'none' | 'reachable' | 'closest-fallback';
  paceStatus: 'none' | 'sweet-spot' | 'catching' | 'overshoot' | 'unreachable';
  targetTick: number;
  timeSec: number;
  distance: number;
  margin: number;
  centrality: number;
  minBoost: number;
  rx: number;
  ry: number;
  rz: number;
  tx: number;
  ty: number;
  tz: number;
}

const PACE_STATUS_MAP: ReadonlyArray<InterceptSolutionView['paceStatus']> = [
  'none',
  'sweet-spot',
  'catching',
  'overshoot',
  'unreachable',
];

export class InterceptCrossRenderer {
  public _colCenter: THREE.Color;
  public _colEdge: THREE.Color;
  public _colMid: THREE.Color;
  public _colWork: THREE.Color;
  public _crossSegmentsBuf: Float32Array;
  public ballTrajectoryPredictor: BallTrajectoryPredictor | null;
  public coreMat: THREE.MeshBasicMaterial;
  public coreSphere: THREE.Mesh<THREE.SphereGeometry, THREE.MeshBasicMaterial>;
  public crossGeometry: LineSegmentsGeometry;
  public crossMaterial: LineMaterial;
  public crossMesh: LineSegments2;
  public group: THREE.Group;

  constructor(
    parentGroup: THREE.Object3D | null | undefined,
    ballTrajectoryPredictor: BallTrajectoryPredictor | null = null
  ) {
    this.ballTrajectoryPredictor = ballTrajectoryPredictor;
    this.group = new THREE.Group();
    this.group.name = 'reachability-intercept-group';
    if (parentGroup) {
      parentGroup.add(this.group);
    }

    this._colEdge = new THREE.Color('#ff3b5c');
    this._colMid = new THREE.Color('#ffbe0b');
    this._colCenter = new THREE.Color('#00f59b');
    this._colWork = new THREE.Color('#00f59b');
    this._crossSegmentsBuf = new Float32Array(18);
    this.crossGeometry = null!;
    this.crossMaterial = null!;
    this.crossMesh = null!;
    this.coreMat = null!;
    this.coreSphere = null!;
    this._initMeshes();
  }

  _initMeshes(): void {
    this._crossSegmentsBuf = new Float32Array(18);
    this.crossGeometry = new LineSegmentsGeometry();
    this.crossGeometry.setPositions(this._crossSegmentsBuf);

    this.crossMaterial = new LineMaterial({
      color: new THREE.Color('#00f59b'),
      linewidth: 5.0,
      transparent: true,
      opacity: 0.96,
      depthTest: false,
      depthWrite: false,
      worldUnits: true,
    });
    this.crossMaterial.resolution.set(
      typeof window !== 'undefined' ? window.innerWidth : 1920,
      typeof window !== 'undefined' ? window.innerHeight : 1080
    );

    this.crossMesh = new LineSegments2(this.crossGeometry, this.crossMaterial);
    this.crossMesh.name = 'reachability-intercept-orthogonal-cross';
    this.crossMesh.frustumCulled = false;
    this.crossMesh.renderOrder = 95;
    this.group.add(this.crossMesh);

    const coreGeom = new THREE.SphereGeometry(18, 12, 12);
    this.coreMat = new THREE.MeshBasicMaterial({
      color: 0x00f59b,
      transparent: true,
      opacity: 0.9,
      depthTest: false,
      depthWrite: false,
    });
    this.coreSphere = new THREE.Mesh(coreGeom, this.coreMat);
    this.coreSphere.renderOrder = 96;
    this.group.add(this.coreSphere);
  }

  updateFromWasm(
    wasmModule: RocketSimWasmModule,
    headerBaseWord: number,
    config: {
      showIntercept?: unknown;
      crossThickness?: unknown;
      edgeCrossColor?: unknown;
      midCrossColor?: unknown;
      centerCrossColor?: unknown;
      unreachableCrossColor?: unknown;
    },
    renderWidth: number,
    renderHeight: number
  ): InterceptSolutionView {
    const emptyRes: InterceptSolutionView = {
      status: 'none',
      paceStatus: 'none',
      targetTick: -1,
      timeSec: 0,
      distance: 0,
      margin: 0,
      centrality: 0,
      minBoost: 0,
      rx: 0,
      ry: 0,
      rz: 0,
      tx: 0,
      ty: 0,
      tz: 0,
    };

    if (!config.showIntercept || this.ballTrajectoryPredictor?.isTemporarilySuppressed?.()) {
      this.group.visible = false;
      return emptyRes;
    }

    if (renderWidth && renderHeight && this.crossMaterial) {
      this.crossMaterial.resolution.set(renderWidth, renderHeight);
    }

    const heapU32 = wasmModule.HEAPU32;
    const heapI32 = wasmModule.HEAP32;
    const heapF32 = wasmModule.HEAPF32;

    // InterceptSolutionPod starts at word offset 6 inside ReachabilityOutputHeaderPod
    const icBase = headerBaseWord + 6;
    const statusRaw = heapU32[icBase];
    const paceRaw = heapU32[icBase + 1];

    if (statusRaw === 0) {
      this.group.visible = false;
      return emptyRes;
    }

    const status: InterceptSolutionView['status'] =
      statusRaw === 1 ? 'reachable' : 'closest-fallback';
    const paceStatus = PACE_STATUS_MAP[paceRaw] ?? 'none';
    const targetTick = heapI32[icBase + 2];
    const timeSec = heapF32[icBase + 3];
    const distance = heapF32[icBase + 4];
    const margin = heapF32[icBase + 5];
    const centrality = heapF32[icBase + 6];
    const minBoost = heapF32[icBase + 7];
    const rx = heapF32[icBase + 8];
    const ry = heapF32[icBase + 9];
    const rz = heapF32[icBase + 10];
    const tx = heapF32[icBase + 11];
    const ty = heapF32[icBase + 12];
    const tz = heapF32[icBase + 13];

    this.group.visible = true;
    const thickness = Math.max(1.0, Math.min(45.0, Number(config.crossThickness) || 5.0));
    const isReachable = status === 'reachable';

    if (isReachable) {
      this._colEdge.set((config.edgeCrossColor as string) || '#ff3b5c');
      this._colMid.set((config.midCrossColor as string) || '#ffbe0b');
      this._colCenter.set((config.centerCrossColor as string) || '#00f59b');
      const c = Math.max(0.0, Math.min(1.0, centrality));
      if (c < 0.5) {
        this._colWork.copy(this._colEdge).lerp(this._colMid, c * 2.0);
      } else {
        this._colWork.copy(this._colMid).lerp(this._colCenter, (c - 0.5) * 2.0);
      }
    } else {
      this._colWork.set((config.unreachableCrossColor as string) || '#ff3b5c');
    }

    this.crossMaterial.color.copy(this._colWork);
    this.crossMaterial.linewidth = thickness;
    this.crossMaterial.opacity = isReachable ? 0.96 : 0.52;

    this.coreMat.color.copy(this._colWork);
    this.coreMat.opacity = isReachable ? 0.92 : 0.48;
    this.coreSphere.position.set(tx, ty, tz);
    const coreScale = Math.max(0.25, thickness / 14.0);
    this.coreSphere.scale.set(coreScale, coreScale, coreScale);

    const segsPtr = wasmModule._physics_getInterceptCrossSegmentsPtr() >> 2;
    this._crossSegmentsBuf.set(heapF32.subarray(segsPtr, segsPtr + 18));

    const instStart = this.crossGeometry.attributes.instanceStart as
      { data?: { needsUpdate: boolean } } | undefined;
    if (instStart && instStart.data) {
      instStart.data.needsUpdate = true;
    } else {
      this.crossGeometry.setPositions(this._crossSegmentsBuf);
    }

    return {
      status,
      paceStatus,
      targetTick,
      timeSec,
      distance,
      margin,
      centrality,
      minBoost,
      rx,
      ry,
      rz,
      tx,
      ty,
      tz,
    };
  }
}
