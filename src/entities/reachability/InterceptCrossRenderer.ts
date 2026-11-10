/**
 * InterceptCrossRenderer.ts
 * Three.js visual renderer for the 3D Orthogonal Intercept Cross (3 mutually perpendicular segments + core sphere)
 * synchronized against BallTrajectoryPredictor or physics ball prediction fallback.
 */

import * as THREE from 'three';
import { LineSegments2 } from 'three/addons/lines/LineSegments2.js';
import { LineSegmentsGeometry } from 'three/addons/lines/LineSegmentsGeometry.js';
import { LineMaterial } from 'three/addons/lines/LineMaterial.js';
import { solveOptimalIntercept } from './InterceptSolver.ts';

import type { BallTrajectoryPredictor } from '../BallTrajectoryPredictor.ts';

export class InterceptCrossRenderer {
  public _colCenter: THREE.Color;
  public _colEdge: THREE.Color;
  public _colMid: THREE.Color;
  public _colWork: THREE.Color;
  public _crossSegmentsBuf: Float32Array;
  public _fallbackBallPred: Float32Array;
  public _lastPredSource: string | undefined;
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

    this._fallbackBallPred = new Float32Array(360 * 3);
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

  _initMeshes() {
    // 3 Orthogonal segments = 6 endpoints = 18 floats
    this._crossSegmentsBuf = new Float32Array(18);
    this.crossGeometry = new LineSegmentsGeometry();
    this.crossGeometry.setPositions(this._crossSegmentsBuf);

    this.crossMaterial = new LineMaterial({
      color: new THREE.Color('#00f59b'),
      linewidth: 5.0,
      transparent: true,
      opacity: 0.96,
      depthTest: false, // Render clearly through ball/funnel translucency
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

    // Center core intersection sphere for spatial depth anchor
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

  update(carState, config, currentTick, renderWidth, renderHeight, phys) {
    if (!config.showIntercept) {
      this.group.visible = false;
      return {
        status: 'none',
        timeSec: 0,
        distance: 0,
        margin: 0,
        centrality: 0,
        paceStatus: 'none',
        minBoost: 0,
        rx: 0,
        ry: 0,
        rz: 0,
      };
    }

    if (renderWidth && renderHeight && this.crossMaterial) {
      this.crossMaterial.resolution.set(renderWidth, renderHeight);
    }

    // Retrieve predicted ball trajectory from BallTrajectoryPredictor or physics fallback
    let rawPoints: Float32Array | null = null;
    let predCount = 0;
    let elapsedTicks = 0;

    const btp = this.ballTrajectoryPredictor;
    if (btp?.isTemporarilySuppressed?.()) {
      this.group.visible = false;
      return {
        status: 'none',
        timeSec: 0,
        distance: 0,
        margin: 0,
        centrality: 0,
        paceStatus: 'none',
        minBoost: 0,
        rx: 0,
        ry: 0,
        rz: 0,
      };
    }
    if (btp && btp.isActive && btp.predictionCount > 1) {
      rawPoints = btp.rawPredictedPoints;
      predCount = btp.predictionCount;
      elapsedTicks = Math.max(0, Math.floor(currentTick - btp.impactTick));
      this._lastPredSource = 'btp';
    } else if (phys) {
      // Fallback: even if BallTrajectoryPredictor line is hidden or ball is slow/resting,
      // populate fallback buffer so intercept cross always works seamlessly.
      const bv = phys.getBallStateView?.();
      if (bv) {
        const bSpd = Math.hypot(bv.velX, bv.velY, bv.velZ);
        if (bSpd > 15.0 && typeof phys.updateBallPrediction === 'function') {
          const cnt =
            typeof phys.updateBallPredictionIncremental === 'function'
              ? phys.updateBallPredictionIncremental(5.0)
              : phys.updateBallPrediction(5.0);
          const wasmPred = phys.getBallPrediction?.();
          if (wasmPred && cnt > 1) {
            if (this._lastPredSource !== 'wasm-fallback') {
              this._lastPredSource = 'wasm-fallback';
              console.info(
                '[InterceptCrossRenderer] BallTrajectoryPredictor buffer inactive; using WASM ball prediction fallback.'
              );
            }
            const actual = Math.min(cnt, 360);
            for (let i = 0; i < actual; i++) {
              const sOff = i * 9;
              const dOff = i * 3;
              this._fallbackBallPred[dOff + 0] = wasmPred[sOff + 0];
              this._fallbackBallPred[dOff + 1] = wasmPred[sOff + 1];
              this._fallbackBallPred[dOff + 2] = wasmPred[sOff + 2];
            }
            rawPoints = this._fallbackBallPred;
            predCount = actual;
            elapsedTicks = 0;
          }
        }
        if (!rawPoints) {
          if (this._lastPredSource !== 'stationary-fallback') {
            this._lastPredSource = 'stationary-fallback';
            console.info(
              '[InterceptCrossRenderer] Ball is stationary or prediction unavailable; using constant-position trajectory fallback.'
            );
          }
          // Ball is resting/stationary: fill constant position across 360 ticks
          const bx = bv.posX,
            by = bv.posY,
            bz = bv.posZ;
          for (let i = 0; i < 360; i++) {
            const dOff = i * 3;
            this._fallbackBallPred[dOff + 0] = bx;
            this._fallbackBallPred[dOff + 1] = by;
            this._fallbackBallPred[dOff + 2] = bz;
          }
          rawPoints = this._fallbackBallPred;
          predCount = 360;
          elapsedTicks = 0;
        }
      }
    }

    const res = solveOptimalIntercept(rawPoints, predCount, elapsedTicks, carState, config);

    if (res.status === 'none') {
      this.group.visible = false;
      return res;
    }

    this.group.visible = true;
    const armLen = Math.max(15.0, Math.min(500.0, Number(config.crossArmLength) || 50.0));
    const thickness = Math.max(1.0, Math.min(45.0, Number(config.crossThickness) || 5.0));
    const isReachable = res.status === 'reachable';

    if (isReachable) {
      this._colEdge.set(config.edgeCrossColor || '#ff3b5c');
      this._colMid.set(config.midCrossColor || '#ffbe0b');
      this._colCenter.set(config.centerCrossColor || '#00f59b');
      const c = Math.max(0.0, Math.min(1.0, Number(res.centrality) || 0.0));
      if (c < 0.5) {
        this._colWork.copy(this._colEdge).lerp(this._colMid, c * 2.0);
      } else {
        this._colWork.copy(this._colMid).lerp(this._colCenter, (c - 0.5) * 2.0);
      }
    } else {
      this._colWork.set(config.unreachableCrossColor || '#ff3b5c');
    }

    this.crossMaterial.color.copy(this._colWork);
    this.crossMaterial.linewidth = thickness;
    this.crossMaterial.opacity = isReachable ? 0.96 : 0.52;

    this.coreMat.color.copy(this._colWork);
    this.coreMat.opacity = isReachable ? 0.92 : 0.48;
    this.coreSphere.position.set(res.tx, res.ty, res.tz);
    const coreScale = Math.max(0.25, thickness / 14.0);
    this.coreSphere.scale.set(coreScale, coreScale, coreScale);

    // Populate the 3 orthogonal line segments centered at (tx, ty, tz)
    const { tx, ty, tz, axis1, axis2, axis3 } = res;
    const buf = this._crossSegmentsBuf;

    // Segment 1 (Axis 1)
    buf[0] = tx - axis1[0] * armLen;
    buf[1] = ty - axis1[1] * armLen;
    buf[2] = tz - axis1[2] * armLen;
    buf[3] = tx + axis1[0] * armLen;
    buf[4] = ty + axis1[1] * armLen;
    buf[5] = tz + axis1[2] * armLen;

    // Segment 2 (Axis 2)
    buf[6] = tx - axis2[0] * armLen;
    buf[7] = ty - axis2[1] * armLen;
    buf[8] = tz - axis2[2] * armLen;
    buf[9] = tx + axis2[0] * armLen;
    buf[10] = ty + axis2[1] * armLen;
    buf[11] = tz + axis2[2] * armLen;

    // Segment 3 (Axis 3)
    buf[12] = tx - axis3[0] * armLen;
    buf[13] = ty - axis3[1] * armLen;
    buf[14] = tz - axis3[2] * armLen;
    buf[15] = tx + axis3[0] * armLen;
    buf[16] = ty + axis3[1] * armLen;
    buf[17] = tz + axis3[2] * armLen;

    const instStart = this.crossGeometry.attributes.instanceStart;
    if (instStart && instStart.data) {
      instStart.data.needsUpdate = true;
    } else {
      this.crossGeometry.setPositions(buf);
    }
    return res;
  }
}
