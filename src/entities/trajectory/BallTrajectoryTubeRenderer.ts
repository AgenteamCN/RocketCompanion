/**
 * BallTrajectoryTubeRenderer.ts
 * High-performance, zero-copy WASM `HEAPF32` / `HEAPU16` -> `THREE.BufferAttribute` binder
 * for 3D volumetric ball trajectory tubes, surface bounce rings, and ground drop lines.
 */

import * as THREE from 'three';
import type { RocketSimWasmModule } from '../../physics/RocketSimWasm.ts';
import type { TrajectoryDashCapStyle } from '../../ui-core/config/trainingDefaults.ts';
import {
  BOUNCE_MARKER_STRIDE,
  MAX_BOUNCE_MARKERS,
  type LiveBallPositionLike,
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

export const MAX_TUBE_RINGS = 800;
export const MAX_RADIAL_SEGMENTS = 8;
export const MAX_TUBE_VERTICES = MAX_TUBE_RINGS * MAX_RADIAL_SEGMENTS;
export const MAX_TUBE_INDICES = MAX_TUBE_RINGS * MAX_RADIAL_SEGMENTS * 6;
export const MAX_GROUND_DROP_FLOATS = 400 * 6;

const FLAG_SHOW_BOUNCE_MARKERS = 0x01;
const FLAG_SHOW_GROUND_PROJECTION = 0x02;

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

    float hemi = wNorm.y * 0.5 + 0.5;
    float viewKey = dot(vNorm, normalize(vec3(-0.28, 0.80, 0.53))) * 0.5 + 0.5;
    float coreFacing = abs(dot(vNorm, vDir));

    float diffuseTerm = clamp(0.42 * hemi + 0.33 * viewKey + 0.25 * pow(coreFacing, 0.6), 0.0, 1.0);
    float rimShadow = smoothstep(0.0, 0.55, coreFacing);
    float specSpine = pow(max(0.0, 0.45 * hemi + 0.35 * viewKey + 0.20 * coreFacing), 7.0);

    vec3 shadowColor = uColor * vec3(0.18, 0.22, 0.30);
    vec3 litCylinder = mix(shadowColor, uColor, diffuseTerm * (0.35 + 0.65 * rimShadow));
    litCylinder = mix(litCylinder, vec3(1.0), specSpine * 0.35);

    vec3 shadedColor = mix(uColor, litCylinder, s);

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

  private readonly _positions = new Float32Array(MAX_TUBE_VERTICES * 3);
  private readonly _normals = new Float32Array(MAX_TUBE_VERTICES * 3);
  private readonly _uvs = new Float32Array(MAX_TUBE_VERTICES * 2);
  private readonly _indices = new Uint16Array(MAX_TUBE_INDICES);
  private readonly _groundDropPositions = new Float32Array(MAX_GROUND_DROP_FLOATS);

  private readonly _posAttr: THREE.BufferAttribute;
  private readonly _normAttr: THREE.BufferAttribute;
  private readonly _uvAttr: THREE.BufferAttribute;
  private readonly _indexAttr: THREE.BufferAttribute;
  private readonly _groundDropAttr: THREE.BufferAttribute;

  private readonly _dummyMatrix = new THREE.Matrix4();
  private readonly _dummyPos = new THREE.Vector3();
  private readonly _dummyQuat = new THREE.Quaternion();
  private readonly _dummyScale = new THREE.Vector3();
  private readonly _upVec = new THREE.Vector3(0, 0, 1);
  private readonly _normVec = new THREE.Vector3();

  private _boundHeapBuffer: ArrayBufferLike | null = null;
  private _wasmHeaderU32: Uint32Array | null = null;
  private _wasmHeaderF32: Float32Array | null = null;
  private _wasmPositions: Float32Array | null = null;
  private _wasmNormals: Float32Array | null = null;
  private _wasmUvs: Float32Array | null = null;
  private _wasmIndices: Uint16Array | null = null;
  private _wasmBounces: Float32Array | null = null;
  private _wasmGroundDrops: Float32Array | null = null;

  public activeTriangleCount = 0;
  public lastBounceCount = 0;
  public lastMaxHeightUu = 0;

  constructor(scene: THREE.Scene | null | undefined) {
    this.group = new THREE.Group();
    this.group.name = 'ball-trajectory-3d-tube-group';

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

  private _ensureWasmViews(wasmModule: RocketSimWasmModule): boolean {
    const buf = wasmModule.HEAPF32?.buffer;
    if (!buf) return false;
    if (this._boundHeapBuffer === buf && this._wasmHeaderU32) {
      return true;
    }

    const headerPtr = wasmModule._physics_getTrajectoryMeshHeaderPtr();
    const posPtr = wasmModule._physics_getTrajectoryPositionsPtr();
    const normPtr = wasmModule._physics_getTrajectoryNormalsPtr();
    const uvPtr = wasmModule._physics_getTrajectoryUvsPtr();
    const idxPtr = wasmModule._physics_getTrajectoryIndicesPtr();
    const bouncePtr = wasmModule._physics_getTrajectoryBounceMarkersPtr();
    const dropsPtr = wasmModule._physics_getTrajectoryGroundDropsPtr();
    if (!headerPtr || !posPtr || !normPtr || !uvPtr || !idxPtr || !bouncePtr || !dropsPtr) {
      return false;
    }

    this._boundHeapBuffer = buf;
    this._wasmHeaderU32 = new Uint32Array(buf, headerPtr, 8);
    this._wasmHeaderF32 = new Float32Array(buf, headerPtr, 8);
    this._wasmPositions = new Float32Array(buf, posPtr, MAX_TUBE_VERTICES * 3);
    this._wasmNormals = new Float32Array(buf, normPtr, MAX_TUBE_VERTICES * 3);
    this._wasmUvs = new Float32Array(buf, uvPtr, MAX_TUBE_VERTICES * 2);
    this._wasmIndices = new Uint16Array(buf, idxPtr, MAX_TUBE_INDICES);
    this._wasmBounces = new Float32Array(buf, bouncePtr, MAX_BOUNCE_MARKERS * BOUNCE_MARKER_STRIDE);
    this._wasmGroundDrops = new Float32Array(buf, dropsPtr, MAX_GROUND_DROP_FLOATS);
    return true;
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

  /**
   * Invokes `_physics_buildTrajectoryMesh` in Rust/WASM and binds the resulting
   * vertex/index/bounce/ground-drop buffers directly into Three.js attributes.
   */
  public buildAndBindFromWasm(
    wasmModule: RocketSimWasmModule | null | undefined,
    startIndex: number,
    solidTicks: number,
    transparentTicks: number,
    phaseOffsetTicks: number,
    liveBallPosition: LiveBallPositionLike | null | undefined,
    params: TubeRenderParams
  ): number {
    if (!wasmModule || typeof wasmModule._physics_buildTrajectoryMesh !== 'function') {
      this.hideAll();
      return 0;
    }

    const flags =
      (params.showBounceMarkers ? FLAG_SHOW_BOUNCE_MARKERS : 0) |
      (params.showGroundProjection ? FLAG_SHOW_GROUND_PROJECTION : 0);
    const capStyle = params.dashCapStyle === 'chamfer' ? 1 : 0;
    const hasLivePos = Boolean(liveBallPosition);
    const lx = hasLivePos ? liveBallPosition!.x : 0;
    const ly = hasLivePos ? liveBallPosition!.y : 0;
    const lz = hasLivePos ? liveBallPosition!.z : 0;

    const indexCount = wasmModule._physics_buildTrajectoryMesh(
      startIndex,
      solidTicks,
      transparentTicks,
      phaseOffsetTicks,
      params.worldRadius,
      params.radiusTaper,
      params.radialSegments,
      params.sampleStride,
      capStyle,
      params.dropLineIntervalTicks,
      flags,
      hasLivePos ? 1 : 0,
      lx,
      ly,
      lz
    );

    if (!this._ensureWasmViews(wasmModule)) {
      this.hideAll();
      return 0;
    }

    const headerU32 = this._wasmHeaderU32!;
    const headerF32 = this._wasmHeaderF32!;
    const vertexCount = headerU32[0];
    const bounceCount = headerU32[2];
    const groundDropFloatCount = headerU32[3];
    this.lastBounceCount = bounceCount;
    this.lastMaxHeightUu = headerF32[4];

    // 1. Bind 3D Bounce Contact Rings
    if (params.showBounceMarkers && bounceCount > 0) {
      const bounceBuf = this._wasmBounces!;
      const count = Math.min(bounceCount, MAX_BOUNCE_MARKERS);
      for (let i = 0; i < count; i++) {
        const bOff = i * BOUNCE_MARKER_STRIDE;
        const bx = bounceBuf[bOff + 0];
        const by = bounceBuf[bOff + 1];
        const bz = bounceBuf[bOff + 2];
        const nx = bounceBuf[bOff + 3];
        const ny = bounceBuf[bOff + 4];
        const nz = bounceBuf[bOff + 5];
        const progress = bounceBuf[bOff + 6];

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

    // 2. Bind Vertical Ground Altitude Drop Lines & Floor Shadow Trace
    if (params.showGroundProjection && groundDropFloatCount > 0) {
      const clampedFloats = Math.min(groundDropFloatCount, MAX_GROUND_DROP_FLOATS);
      this._groundDropPositions.set(this._wasmGroundDrops!.subarray(0, clampedFloats), 0);
      this._groundDropAttr.needsUpdate = true;
      this.groundDropGeometry.setDrawRange(0, clampedFloats / 3);
      this.groundDropLines.visible = true;
    } else if (this.groundDropLines.visible) {
      this.groundDropLines.visible = false;
    }

    // 3. Bind 3D Tube Extrusion Buffers
    if (indexCount > 0 && vertexCount > 0) {
      const v3 = Math.min(vertexCount * 3, MAX_TUBE_VERTICES * 3);
      const v2 = Math.min(vertexCount * 2, MAX_TUBE_VERTICES * 2);
      const ic = Math.min(indexCount, MAX_TUBE_INDICES);

      this._positions.set(this._wasmPositions!.subarray(0, v3), 0);
      this._normals.set(this._wasmNormals!.subarray(0, v3), 0);
      this._uvs.set(this._wasmUvs!.subarray(0, v2), 0);
      this._indices.set(this._wasmIndices!.subarray(0, ic), 0);

      this._posAttr.needsUpdate = true;
      this._normAttr.needsUpdate = true;
      this._uvAttr.needsUpdate = true;
      this._indexAttr.needsUpdate = true;
      this.tubeGeometry.setDrawRange(0, ic);
      this.preOcclusionMesh.visible = true;
      this.foregroundMesh.visible = true;
      this.activeTriangleCount = ic / 3;
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
