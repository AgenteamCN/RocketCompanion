/**
 * BallTrajectoryTubeRenderer.ts
 * High-performance, zero-GC 3D volumetric tube & spatial depth anchor renderer
 * for BallTrajectoryPredictor.
 *
 * Solves two core visual & performance problems of flat 1-tick LineSegments2:
 * 1. Eliminates 600-segment round-cap alpha overdraw ("overlapping flat dots") by generating
 *    a single indexed 3D tubular mesh with tapered capsule tips and configurable tick stride.
 * 2. Restores 3D spatial depth perception via:
 *    - 3D Hemisphere + View-Space Core/Rim Normal Shading (bright top, shaded underbelly)
 *    - Near-to-Far Horizon Radius Taper & Opacity Attenuation
 *    - 3D Surface-Normal-Aligned Bounce Contact Rings (floor, wall, corner, backboard)
 *    - Optional Vertical Ground Altitude Drop Lines & Floor Shadow Trace
 */

import * as THREE from 'three';
import {
  BOUNCE_MARKER_STRIDE,
  MAX_BOUNCE_MARKERS,
  buildTrajectoryDashRanges,
  type LiveBallPositionLike,
  type TrajectoryDashRange,
} from './ballTrajectoryGeometryPipeline.ts';
import {
  MAX_GROUND_DROP_FLOATS,
  MAX_RADIAL_SEGMENTS,
  MAX_TUBE_INDICES,
  MAX_TUBE_VERTICES,
  TUBE_FRAGMENT_SHADER,
  TUBE_VERTEX_SHADER,
  buildGroundDropLineSegments,
  extrudeTrajectoryTubeDashRanges,
  populateRadialTrigTable,
  type TubeExtrusionBuffers,
  type TubeRenderParams,
} from './ballTrajectoryTubeMeshPipeline.ts';

export type { TubeRenderParams };

export class BallTrajectoryTubeRenderer {
  public readonly group: THREE.Group;
  public readonly tubeGeometry: THREE.BufferGeometry;
  public readonly preOcclusionMaterial: THREE.ShaderMaterial;
  public readonly foregroundMaterial: THREE.ShaderMaterial;
  public readonly preOcclusionMesh: THREE.Mesh;
  public readonly foregroundMesh: THREE.Mesh;

  public readonly bounceInstancedMesh: THREE.InstancedMesh;
  public readonly bounceMaterial: THREE.MeshBasicMaterial;
  public readonly groundDropGeometry: THREE.BufferGeometry;
  public readonly groundDropMaterial: THREE.LineBasicMaterial;
  public readonly groundDropLines: THREE.LineSegments;

  private readonly _positions: Float32Array;
  private readonly _normals: Float32Array;
  private readonly _uvs: Float32Array;
  private readonly _indices: Uint16Array;
  private readonly _posAttr: THREE.BufferAttribute;
  private readonly _normAttr: THREE.BufferAttribute;
  private readonly _uvAttr: THREE.BufferAttribute;
  private readonly _indexAttr: THREE.BufferAttribute;
  private readonly _extrusionBuffers: TubeExtrusionBuffers;

  private readonly _dashRanges: TrajectoryDashRange[] = [];
  private readonly _groundDropPositions: Float32Array;
  private readonly _groundDropAttr: THREE.BufferAttribute;
  private readonly _dummyMatrix = new THREE.Matrix4();
  private readonly _dummyPos = new THREE.Vector3();
  private readonly _dummyQuat = new THREE.Quaternion();
  private readonly _dummyScale = new THREE.Vector3();
  private readonly _upVec = new THREE.Vector3(0, 0, 1);
  private readonly _normVec = new THREE.Vector3();

  private readonly _cosTable = new Float32Array(MAX_RADIAL_SEGMENTS);
  private readonly _sinTable = new Float32Array(MAX_RADIAL_SEGMENTS);
  private _lastRadialSegments = 0;

  public activeTriangleCount = 0;

  constructor(scene: THREE.Scene | null | undefined) {
    this.group = new THREE.Group();
    this.group.name = 'ball-trajectory-3d-tube-group';

    this._positions = new Float32Array(MAX_TUBE_VERTICES * 3);
    this._normals = new Float32Array(MAX_TUBE_VERTICES * 3);
    this._uvs = new Float32Array(MAX_TUBE_VERTICES * 2);
    this._indices = new Uint16Array(MAX_TUBE_INDICES);
    this._extrusionBuffers = {
      positions: this._positions,
      normals: this._normals,
      uvs: this._uvs,
      indices: this._indices,
      cosTable: this._cosTable,
      sinTable: this._sinTable,
    };

    this.tubeGeometry = new THREE.BufferGeometry();
    this._posAttr = new THREE.BufferAttribute(this._positions, 3);
    this._posAttr.setUsage(THREE.DynamicDrawUsage);
    this._normAttr = new THREE.BufferAttribute(this._normals, 3);
    this._normAttr.setUsage(THREE.DynamicDrawUsage);
    this._uvAttr = new THREE.BufferAttribute(this._uvs, 2);
    this._uvAttr.setUsage(THREE.DynamicDrawUsage);
    this._indexAttr = new THREE.BufferAttribute(this._indices, 1);
    this._indexAttr.setUsage(THREE.DynamicDrawUsage);

    this.tubeGeometry.setAttribute('position', this._posAttr);
    this.tubeGeometry.setAttribute('normal', this._normAttr);
    this.tubeGeometry.setAttribute('uv', this._uvAttr);
    this.tubeGeometry.setIndex(this._indexAttr);
    this.tubeGeometry.setDrawRange(0, 0);

    const baseUniforms = {
      uColor: { value: new THREE.Color('#ffffff') },
      uOpacity: { value: 0.5 },
      uShadingStrength: { value: 0.0 },
      uHorizonFade: { value: 0.0 },
    };

    // Pass A (renderOrder 0.05): renders before semi-transparent goalpost overlays
    this.preOcclusionMaterial = new THREE.ShaderMaterial({
      vertexShader: TUBE_VERTEX_SHADER,
      fragmentShader: TUBE_FRAGMENT_SHADER,
      uniforms: THREE.UniformsUtils.clone(baseUniforms),
      transparent: true,
      depthTest: true,
      depthWrite: false,
      side: THREE.FrontSide,
    });

    this.preOcclusionMesh = new THREE.Mesh(this.tubeGeometry, this.preOcclusionMaterial);
    this.preOcclusionMesh.name = 'ball-trajectory-tube-pre-occlusion';
    this.preOcclusionMesh.renderOrder = 0.05;
    this.preOcclusionMesh.frustumCulled = false;
    this.preOcclusionMesh.visible = false;
    this.preOcclusionMesh.userData = { bloomOccluder: false };

    // Pass B (renderOrder 14): stencil-gated foreground pass over semi-transparent goalpost overlays
    this.foregroundMaterial = new THREE.ShaderMaterial({
      vertexShader: TUBE_VERTEX_SHADER,
      fragmentShader: TUBE_FRAGMENT_SHADER,
      uniforms: THREE.UniformsUtils.clone(baseUniforms),
      transparent: true,
      depthTest: true,
      depthWrite: false,
      side: THREE.FrontSide,
    });
    this.foregroundMaterial.stencilWrite = true;
    this.foregroundMaterial.stencilFunc = THREE.EqualStencilFunc;
    this.foregroundMaterial.stencilRef = 2;
    this.foregroundMaterial.stencilFuncMask = 0x02;
    this.foregroundMaterial.stencilWriteMask = 0x00;
    this.foregroundMaterial.stencilZPass = THREE.KeepStencilOp;
    this.foregroundMaterial.stencilFail = THREE.KeepStencilOp;
    this.foregroundMaterial.stencilZFail = THREE.KeepStencilOp;

    this.foregroundMesh = new THREE.Mesh(this.tubeGeometry, this.foregroundMaterial);
    this.foregroundMesh.name = 'ball-trajectory-tube-foreground';
    this.foregroundMesh.renderOrder = 14;
    this.foregroundMesh.frustumCulled = false;
    this.foregroundMesh.visible = false;
    this.foregroundMesh.userData = { bloomOccluder: false };

    // 3D Surface Bounce Ring Markers (Torus aligned in XY plane so +Z is ring normal)
    const ringGeo = new THREE.RingGeometry(42, 64, 24);
    this.bounceMaterial = new THREE.MeshBasicMaterial({
      color: new THREE.Color('#fbbf24'),
      transparent: true,
      opacity: 0.65,
      side: THREE.DoubleSide,
      depthTest: true,
      depthWrite: false,
    });
    this.bounceInstancedMesh = new THREE.InstancedMesh(
      ringGeo,
      this.bounceMaterial,
      MAX_BOUNCE_MARKERS
    );
    this.bounceInstancedMesh.name = 'ball-trajectory-bounce-markers';
    this.bounceInstancedMesh.renderOrder = 14;
    this.bounceInstancedMesh.frustumCulled = false;
    this.bounceInstancedMesh.visible = false;
    this.bounceInstancedMesh.count = 0;
    this.bounceInstancedMesh.userData = { bloomOccluder: false };

    // Optional Vertical Ground Drop Lines + Floor Shadow Anchor
    this._groundDropPositions = new Float32Array(MAX_GROUND_DROP_FLOATS);
    this.groundDropGeometry = new THREE.BufferGeometry();
    this._groundDropAttr = new THREE.BufferAttribute(this._groundDropPositions, 3);
    this._groundDropAttr.setUsage(THREE.DynamicDrawUsage);
    this.groundDropGeometry.setAttribute('position', this._groundDropAttr);
    this.groundDropGeometry.setDrawRange(0, 0);

    this.groundDropMaterial = new THREE.LineBasicMaterial({
      color: new THREE.Color('#fbbf24'),
      transparent: true,
      opacity: 0.28,
      depthTest: true,
      depthWrite: false,
    });
    this.groundDropLines = new THREE.LineSegments(this.groundDropGeometry, this.groundDropMaterial);
    this.groundDropLines.name = 'ball-trajectory-ground-drop-lines';
    this.groundDropLines.renderOrder = 0.05;
    this.groundDropLines.frustumCulled = false;
    this.groundDropLines.visible = false;
    this.groundDropLines.userData = { bloomOccluder: false };

    this.group.add(this.preOcclusionMesh);
    this.group.add(this.foregroundMesh);
    this.group.add(this.bounceInstancedMesh);
    this.group.add(this.groundDropLines);

    if (scene) {
      scene.add(this.group);
    }
  }

  private _ensureTrigTable(radialSegments: number): void {
    if (this._lastRadialSegments === radialSegments) return;
    this._lastRadialSegments = radialSegments;
    populateRadialTrigTable(radialSegments, this._cosTable, this._sinTable);
  }

  public syncUniforms(params: TubeRenderParams): void {
    for (const mat of [this.preOcclusionMaterial, this.foregroundMaterial]) {
      mat.uniforms.uColor.value.set(params.color);
      mat.uniforms.uOpacity.value = params.opacity;
      mat.uniforms.uShadingStrength.value = params.shadingStrength;
      mat.uniforms.uHorizonFade.value = params.horizonFade;
    }
    this.bounceMaterial.color.set(params.color);
    this.bounceMaterial.opacity = Math.min(0.9, params.opacity * 1.25);
    this.groundDropMaterial.color.set(params.color);
    this.groundDropMaterial.opacity = Math.min(0.55, params.opacity * 0.55);
  }

  public hideAll(): void {
    if (this.preOcclusionMesh.visible) this.preOcclusionMesh.visible = false;
    if (this.foregroundMesh.visible) this.foregroundMesh.visible = false;
    if (this.bounceInstancedMesh.visible) this.bounceInstancedMesh.visible = false;
    if (this.groundDropLines.visible) this.groundDropLines.visible = false;
    this.activeTriangleCount = 0;
  }

  public hideTubeOnly(): void {
    if (this.preOcclusionMesh.visible) this.preOcclusionMesh.visible = false;
    if (this.foregroundMesh.visible) this.foregroundMesh.visible = false;
    this.activeTriangleCount = 0;
  }

  public updateBounceAndGroundAnchors(
    predictedPoints: Float32Array,
    predictionCount: number,
    startIndex: number,
    bounceBuffer: Float32Array,
    bounceCount: number,
    params: TubeRenderParams
  ): void {
    // 1. Update 3D Bounce Contact Rings
    if (params.showBounceMarkers && bounceCount > 0) {
      const count = Math.min(bounceCount, MAX_BOUNCE_MARKERS);
      for (let i = 0; i < count; i++) {
        const bOff = i * BOUNCE_MARKER_STRIDE;
        const bx = bounceBuffer[bOff + 0];
        const by = bounceBuffer[bOff + 1];
        const bz = bounceBuffer[bOff + 2];
        const nx = bounceBuffer[bOff + 3];
        const ny = bounceBuffer[bOff + 4];
        const nz = bounceBuffer[bOff + 5];
        const progress = bounceBuffer[bOff + 6];

        // Offset slightly along surface normal (2.5 UU) to avoid Z-fighting with stadium floor/wall
        this._dummyPos.set(bx + nx * 2.5, by + ny * 2.5, bz + nz * 2.5);
        this._normVec.set(nx, ny, nz).normalize();
        this._dummyQuat.setFromUnitVectors(this._upVec, this._normVec);

        const ringScale = Math.max(0.35, 1.0 - 0.45 * progress);
        this._dummyScale.set(ringScale, ringScale, ringScale);
        this._dummyMatrix.compose(this._dummyPos, this._dummyQuat, this._dummyScale);
        this.bounceInstancedMesh.setMatrixAt(i, this._dummyMatrix);
      }
      this.bounceInstancedMesh.count = count;
      this.bounceInstancedMesh.instanceMatrix.needsUpdate = true;
      this.bounceInstancedMesh.visible = true;
    } else if (this.bounceInstancedMesh.visible) {
      this.bounceInstancedMesh.visible = false;
      this.bounceInstancedMesh.count = 0;
    }

    // 2. Update Vertical Ground Altitude Drop Lines & Floor Shadow Trace
    if (params.showGroundProjection && predictionCount - startIndex > 2) {
      const floatCount = buildGroundDropLineSegments(
        predictedPoints,
        predictionCount,
        startIndex,
        params.dropLineIntervalTicks,
        this._groundDropPositions
      );
      const vertCount = floatCount / 3;
      if (vertCount > 0) {
        this._groundDropAttr.needsUpdate = true;
        this.groundDropGeometry.setDrawRange(0, vertCount);
        this.groundDropLines.visible = true;
      } else {
        this.groundDropLines.visible = false;
      }
    } else if (this.groundDropLines.visible) {
      this.groundDropLines.visible = false;
    }
  }

  /**
   * Builds the 3D volumetric tube geometry across all solid dashes for the current frame.
   */
  public updateTubeGeometry(
    predictedPoints: Float32Array,
    predictionCount: number,
    startIndex: number,
    solidTicks: number,
    transparentTicks: number,
    phaseOffsetTicks: number,
    liveBallPosition: LiveBallPositionLike | null | undefined,
    params: TubeRenderParams
  ): number {
    const radialSegments = Math.max(
      4,
      Math.min(MAX_RADIAL_SEGMENTS, Math.round(params.radialSegments || 6))
    );
    this._ensureTrigTable(radialSegments);

    const rangeCount = buildTrajectoryDashRanges(
      predictionCount,
      startIndex,
      solidTicks,
      transparentTicks,
      phaseOffsetTicks,
      this._dashRanges
    );

    if (rangeCount <= 0) {
      this.hideTubeOnly();
      return 0;
    }

    const indexCount = extrudeTrajectoryTubeDashRanges(
      {
        predictedPoints,
        predictionCount,
        startIndex,
        dashRanges: this._dashRanges,
        rangeCount,
        liveBallPosition,
        radialSegments,
        sampleStride: params.sampleStride,
        worldRadius: params.worldRadius,
        radiusTaper: params.radiusTaper,
        dashCapStyle: params.dashCapStyle,
      },
      this._extrusionBuffers
    );

    if (indexCount > 0) {
      this._posAttr.needsUpdate = true;
      this._normAttr.needsUpdate = true;
      this._uvAttr.needsUpdate = true;
      this._indexAttr.needsUpdate = true;
      this.tubeGeometry.setDrawRange(0, indexCount);
      this.preOcclusionMesh.visible = true;
      this.foregroundMesh.visible = true;
      this.activeTriangleCount = indexCount / 3;
    } else {
      this.hideTubeOnly();
    }

    return this.activeTriangleCount;
  }

  public dispose(scene: THREE.Scene | null | undefined): void {
    this.hideAll();
    if (scene && this.group) {
      scene.remove(this.group);
    }
    this.tubeGeometry.dispose();
    this.preOcclusionMaterial.dispose();
    this.foregroundMaterial.dispose();
    this.bounceInstancedMesh.geometry.dispose();
    this.bounceMaterial.dispose();
    this.groundDropGeometry.dispose();
    this.groundDropMaterial.dispose();
  }
}
