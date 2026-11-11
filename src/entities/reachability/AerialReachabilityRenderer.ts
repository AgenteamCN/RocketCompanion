/**
 * AerialReachabilityRenderer.ts
 * Zero-copy WASM HEAPF32 -> THREE.BufferAttribute view binder for Aerial 3D Spacetime Funnel / Horn
 * and Discrete Isochrone Bubbles computed by `rc_trajectory_mesh`.
 */

import * as THREE from 'three';
import type { RocketSimWasmModule } from '../../physics/RocketSimWasm.ts';
import { HORIZON_COLORS_HEX } from './groundReachabilityLut.ts';

const FUNNEL_RINGS = 16;
const FUNNEL_SECTORS = 24;
const FUNNEL_VERTS_COUNT = FUNNEL_RINGS * FUNNEL_SECTORS;
const FUNNEL_RING_LINE_VERTS = FUNNEL_SECTORS + 1;
const FUNNEL_RAIL_SEGMENTS_VERTS = 4 * (FUNNEL_RINGS - 1) * 2;

const BUBBLE_LAT = 12;
const BUBBLE_LON = 20;
const BUBBLE_VERTS_COUNT = (BUBBLE_LAT + 1) * BUBBLE_LON;
const BUBBLE_RIB_VERTS_COUNT = 3 * BUBBLE_LON * 2 + 4 * BUBBLE_LAT * 2;

export class AerialReachabilityRenderer {
  public bubbleMeshes: Array<THREE.Mesh<THREE.BufferGeometry, THREE.MeshBasicMaterial>>;
  public bubbleRibLines: Array<THREE.LineSegments<THREE.BufferGeometry, THREE.LineBasicMaterial>>;
  public bubblesSubGroup: THREE.Group;
  public funnelMat: THREE.MeshBasicMaterial;
  public funnelMesh: THREE.Mesh<THREE.BufferGeometry, THREE.MeshBasicMaterial>;
  public funnelRailsLine: THREE.LineSegments<THREE.BufferGeometry, THREE.LineBasicMaterial>;
  public funnelRingLines: Array<THREE.Line<THREE.BufferGeometry, THREE.LineBasicMaterial>>;
  public funnelSubGroup: THREE.Group;
  public group: THREE.Group;

  constructor(parentGroup: THREE.Object3D | null | undefined) {
    this.group = new THREE.Group();
    this.group.name = 'reachability-aerial-group';
    if (parentGroup) {
      parentGroup.add(this.group);
    }

    this.funnelSubGroup = new THREE.Group();
    this.bubblesSubGroup = new THREE.Group();
    this.group.add(this.funnelSubGroup);
    this.group.add(this.bubblesSubGroup);

    this.funnelMat = null!;
    this.funnelMesh = null!;
    this.funnelRailsLine = null!;
    this.funnelRingLines = [];
    this.bubbleMeshes = [];
    this.bubbleRibLines = [];

    this._initFunnelMeshes();
    this._initBubblesMeshes();
  }

  _initFunnelMeshes(): void {
    const numVerts = FUNNEL_VERTS_COUNT;
    const numTris = (FUNNEL_RINGS - 1) * FUNNEL_SECTORS * 2;

    const funnelGeom = new THREE.BufferGeometry();
    const funnelPos = new Float32Array(numVerts * 3);
    const funnelCol = new Float32Array(numVerts * 3);
    const indices = new Uint16Array(numTris * 3);

    let ptr = 0;
    for (let i = 0; i < FUNNEL_RINGS - 1; i++) {
      for (let j = 0; j < FUNNEL_SECTORS; j++) {
        const jn = (j + 1) % FUNNEL_SECTORS;
        const v00 = i * FUNNEL_SECTORS + j;
        const v01 = i * FUNNEL_SECTORS + jn;
        const v10 = (i + 1) * FUNNEL_SECTORS + j;
        const v11 = (i + 1) * FUNNEL_SECTORS + jn;
        indices[ptr++] = v00;
        indices[ptr++] = v10;
        indices[ptr++] = v11;
        indices[ptr++] = v00;
        indices[ptr++] = v11;
        indices[ptr++] = v01;
      }
    }

    funnelGeom.setAttribute('position', new THREE.BufferAttribute(funnelPos, 3));
    funnelGeom.setAttribute('color', new THREE.BufferAttribute(funnelCol, 3));
    funnelGeom.setIndex(new THREE.BufferAttribute(indices, 1));

    this.funnelMat = new THREE.MeshBasicMaterial({
      vertexColors: true,
      transparent: true,
      opacity: 0.22,
      side: THREE.DoubleSide,
      depthTest: true,
      depthWrite: false,
    });
    this.funnelMesh = new THREE.Mesh(funnelGeom, this.funnelMat);
    this.funnelMesh.frustumCulled = false;
    this.funnelMesh.renderOrder = 20;
    this.funnelSubGroup.add(this.funnelMesh);

    // 1s, 2s, 3s Isochrone Rings on Funnel
    this.funnelRingLines = [];
    for (let h = 0; h < 3; h++) {
      const rGeom = new THREE.BufferGeometry();
      const rPos = new Float32Array(FUNNEL_RING_LINE_VERTS * 3);
      rGeom.setAttribute('position', new THREE.BufferAttribute(rPos, 3));
      const rMat = new THREE.LineBasicMaterial({
        color: HORIZON_COLORS_HEX[h],
        transparent: true,
        opacity: 0.88 - h * 0.06,
        depthTest: true,
        depthWrite: false,
      });
      const rLine = new THREE.Line(rGeom, rMat);
      rLine.frustumCulled = false;
      rLine.renderOrder = 22;
      this.funnelSubGroup.add(rLine);
      this.funnelRingLines.push(rLine);
    }

    // 4 Longitudinal Guide Rails
    const railGeom = new THREE.BufferGeometry();
    railGeom.setAttribute(
      'position',
      new THREE.BufferAttribute(new Float32Array(FUNNEL_RAIL_SEGMENTS_VERTS * 3), 3)
    );
    const railMat = new THREE.LineBasicMaterial({
      color: 0xdceeff,
      transparent: true,
      opacity: 0.38,
      depthTest: true,
      depthWrite: false,
    });
    this.funnelRailsLine = new THREE.LineSegments(railGeom, railMat);
    this.funnelRailsLine.frustumCulled = false;
    this.funnelRailsLine.renderOrder = 21;
    this.funnelSubGroup.add(this.funnelRailsLine);
  }

  _initBubblesMeshes(): void {
    this.bubbleMeshes = [];
    this.bubbleRibLines = [];

    const triList: number[] = [];
    for (let i = 0; i < BUBBLE_LAT; i++) {
      for (let j = 0; j < BUBBLE_LON; j++) {
        const jn = (j + 1) % BUBBLE_LON;
        const v00 = i * BUBBLE_LON + j;
        const v01 = i * BUBBLE_LON + jn;
        const v10 = (i + 1) * BUBBLE_LON + j;
        const v11 = (i + 1) * BUBBLE_LON + jn;
        if (i > 0) triList.push(v00, v10, v11);
        if (i < BUBBLE_LAT - 1) triList.push(v00, v11, v01);
      }
    }
    const sharedBubbleIndices = new Uint16Array(triList);

    for (let h = 0; h < 3; h++) {
      const bGeom = new THREE.BufferGeometry();
      bGeom.setAttribute(
        'position',
        new THREE.BufferAttribute(new Float32Array(BUBBLE_VERTS_COUNT * 3), 3)
      );
      bGeom.setAttribute(
        'color',
        new THREE.BufferAttribute(new Float32Array(BUBBLE_VERTS_COUNT * 3), 3)
      );
      bGeom.setIndex(new THREE.BufferAttribute(sharedBubbleIndices, 1));

      const bMat = new THREE.MeshBasicMaterial({
        vertexColors: true,
        transparent: true,
        opacity: 0.2 - h * 0.04,
        side: THREE.DoubleSide,
        depthTest: true,
        depthWrite: false,
      });
      const bMesh = new THREE.Mesh(bGeom, bMat);
      bMesh.frustumCulled = false;
      bMesh.renderOrder = 20 + h;
      this.bubblesSubGroup.add(bMesh);
      this.bubbleMeshes.push(bMesh);

      const ribGeom = new THREE.BufferGeometry();
      ribGeom.setAttribute(
        'position',
        new THREE.BufferAttribute(new Float32Array(BUBBLE_RIB_VERTS_COUNT * 3), 3)
      );
      const ribMat = new THREE.LineBasicMaterial({
        color: HORIZON_COLORS_HEX[h],
        transparent: true,
        opacity: 0.78 - h * 0.08,
        depthTest: true,
        depthWrite: false,
      });
      const ribLine = new THREE.LineSegments(ribGeom, ribMat);
      ribLine.frustumCulled = false;
      ribLine.renderOrder = 23 + h;
      this.bubblesSubGroup.add(ribLine);
      this.bubbleRibLines.push(ribLine);
    }
  }

  updateFromWasm(
    wasmModule: RocketSimWasmModule,
    aerialVisible: boolean,
    aerialMode: number,
    config: {
      aerialOpacity?: unknown;
      aerialShowRings?: unknown;
      aerialShowRails?: unknown;
    }
  ): void {
    if (!aerialVisible) {
      this.group.visible = false;
      return;
    }
    this.group.visible = true;

    const heapF32 = wasmModule.HEAPF32;
    const baseOpacity = Math.max(0.04, Math.min(0.75, Number(config.aerialOpacity) || 0.22));
    const showRings = Boolean(config.aerialShowRings);
    const showRails = Boolean(config.aerialShowRails);

    if (aerialMode === 1) {
      this.funnelSubGroup.visible = false;
      this.bubblesSubGroup.visible = true;

      const bubbleFloats = BUBBLE_VERTS_COUNT * 3;
      const ribFloats = BUBBLE_RIB_VERTS_COUNT * 3;

      for (let h = 0; h < 3; h++) {
        const bMesh = this.bubbleMeshes[h];
        bMesh.material.opacity = Math.max(0.03, baseOpacity * (1.0 - h * 0.22));

        const posPtr = wasmModule._physics_getAerialBubblePositionsPtr(h) >> 2;
        const colPtr = wasmModule._physics_getAerialBubbleColorsPtr(h) >> 2;
        const posAttr = bMesh.geometry.attributes.position as THREE.BufferAttribute;
        const colAttr = bMesh.geometry.attributes.color as THREE.BufferAttribute;
        (posAttr.array as Float32Array).set(heapF32.subarray(posPtr, posPtr + bubbleFloats));
        (colAttr.array as Float32Array).set(heapF32.subarray(colPtr, colPtr + bubbleFloats));
        posAttr.needsUpdate = true;
        colAttr.needsUpdate = true;

        const ribLine = this.bubbleRibLines[h];
        ribLine.visible = showRings;
        if (showRings) {
          const ribPtr = wasmModule._physics_getAerialBubbleRibsPtr(h) >> 2;
          const ribAttr = ribLine.geometry.attributes.position as THREE.BufferAttribute;
          (ribAttr.array as Float32Array).set(heapF32.subarray(ribPtr, ribPtr + ribFloats));
          ribAttr.needsUpdate = true;
        }
      }
      return;
    }

    this.funnelSubGroup.visible = true;
    this.bubblesSubGroup.visible = false;
    this.funnelMat.opacity = baseOpacity;

    const funnelFloats = FUNNEL_VERTS_COUNT * 3;
    const posPtr = wasmModule._physics_getAerialFunnelPositionsPtr() >> 2;
    const colPtr = wasmModule._physics_getAerialFunnelColorsPtr() >> 2;
    const posAttr = this.funnelMesh.geometry.attributes.position as THREE.BufferAttribute;
    const colAttr = this.funnelMesh.geometry.attributes.color as THREE.BufferAttribute;
    (posAttr.array as Float32Array).set(heapF32.subarray(posPtr, posPtr + funnelFloats));
    (colAttr.array as Float32Array).set(heapF32.subarray(colPtr, colPtr + funnelFloats));
    posAttr.needsUpdate = true;
    colAttr.needsUpdate = true;

    const ringFloats = FUNNEL_RING_LINE_VERTS * 3;
    for (let h = 0; h < 3; h++) {
      const rLine = this.funnelRingLines[h];
      rLine.visible = showRings;
      if (showRings) {
        const ringPtr = wasmModule._physics_getAerialFunnelRingLinePtr(h) >> 2;
        const rAttr = rLine.geometry.attributes.position as THREE.BufferAttribute;
        (rAttr.array as Float32Array).set(heapF32.subarray(ringPtr, ringPtr + ringFloats));
        rAttr.needsUpdate = true;
      }
    }

    this.funnelRailsLine.visible = showRails;
    if (showRails) {
      const railFloats = FUNNEL_RAIL_SEGMENTS_VERTS * 3;
      const railPtr = wasmModule._physics_getAerialFunnelRailsPtr() >> 2;
      const railAttr = this.funnelRailsLine.geometry.attributes.position as THREE.BufferAttribute;
      (railAttr.array as Float32Array).set(heapF32.subarray(railPtr, railPtr + railFloats));
      railAttr.needsUpdate = true;
    }
  }
}
