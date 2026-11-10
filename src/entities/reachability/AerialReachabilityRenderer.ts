/**
 * AerialReachabilityRenderer.ts
 * Three.js visual renderer for Aerial 3D Spacetime Funnel / Horn and Discrete Isochrone Bubbles.
 */

import * as THREE from 'three';
import {
  FUNNEL_RINGS,
  FUNNEL_SECTORS,
  FUNNEL_TIMES,
  FUNNEL_COS,
  FUNNEL_SIN,
  FUNNEL_IDX_1S,
  FUNNEL_IDX_2S,
  FUNNEL_IDX_3S,
  BUBBLE_LAT,
  BUBBLE_LON,
  BUBBLE_VERTS_COUNT,
  BUBBLE_UNIT_DIRS,
  HORIZON_COLORS_HEX,
  HORIZON_RGB,
  clipArenaRocketSimXYZ,
} from './ReachabilityConstants.ts';
import {
  computeAerialTurnLatency,
  computeBallisticCenter,
  computeDirectionalBoostReach,
} from './AerialReachabilityMath.ts';

export class AerialReachabilityRenderer {
  public _bubbleRibIdx: Uint16Array;
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
    this._bubbleRibIdx = new Uint16Array(0);

    this._initFunnelMeshes();
    this._initBubblesMeshes();
  }

  _initFunnelMeshes() {
    const numVerts = FUNNEL_RINGS * FUNNEL_SECTORS;
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
      const rPos = new Float32Array((FUNNEL_SECTORS + 1) * 3);
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
    const railSegmentsCount = 4 * (FUNNEL_RINGS - 1) * 2;
    const railGeom = new THREE.BufferGeometry();
    railGeom.setAttribute(
      'position',
      new THREE.BufferAttribute(new Float32Array(railSegmentsCount * 3), 3)
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

  _initBubblesMeshes() {
    this.bubbleMeshes = [];
    this.bubbleRibLines = [];

    // Precompute sphere triangle indices and rib segment vertex pairs
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

    const ribPairs: number[] = [];
    for (const i of [3, 6, 9]) {
      for (let j = 0; j < BUBBLE_LON; j++) {
        ribPairs.push(i * BUBBLE_LON + j, i * BUBBLE_LON + ((j + 1) % BUBBLE_LON));
      }
    }
    for (let j = 0; j < BUBBLE_LON; j += 5) {
      for (let i = 0; i < BUBBLE_LAT; i++) {
        ribPairs.push(i * BUBBLE_LON + j, (i + 1) * BUBBLE_LON + j);
      }
    }
    this._bubbleRibIdx = new Uint16Array(ribPairs);

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
        new THREE.BufferAttribute(new Float32Array(this._bubbleRibIdx.length * 3), 3)
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

  update(carState, config) {
    if (!config.showAerial) {
      this.group.visible = false;
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
      boost,
      isOnGround,
    } = carState;

    const includeJump = Boolean(config.includeJumpImpulse);
    const baseOpacity = Math.max(0.04, Math.min(0.75, Number(config.aerialOpacity) || 0.22));

    if (config.aerialMode === 'bubbles') {
      this.funnelSubGroup.visible = false;
      this.bubblesSubGroup.visible = true;

      const horizons = [1.0, 2.0, 3.0];
      for (let h = 0; h < 3; h++) {
        const T = horizons[h];
        const c = computeBallisticCenter(
          posX,
          posY,
          posZ,
          velX,
          velY,
          velZ,
          upX,
          upY,
          upZ,
          T,
          includeJump,
          isOnGround
        );

        const bMesh = this.bubbleMeshes[h];
        bMesh.material.opacity = Math.max(0.03, baseOpacity * (1.0 - h * 0.22));
        const posAttr = bMesh.geometry.attributes.position;
        const colAttr = bMesh.geometry.attributes.color;
        const posArr = posAttr.array;
        const colArr = colAttr.array;
        const rgb = HORIZON_RGB[h];

        for (let v = 0; v < BUBBLE_VERTS_COUNT; v++) {
          const v3 = v * 3;
          const dx = BUBBLE_UNIT_DIRS[v3 + 0];
          const dy = BUBBLE_UNIT_DIRS[v3 + 1];
          const dz = BUBBLE_UNIT_DIRS[v3 + 2];

          const tTurn = computeAerialTurnLatency(
            fwdX,
            fwdY,
            fwdZ,
            dx,
            dy,
            dz,
            angVelX,
            angVelY,
            angVelZ
          );
          const velAlongD = c.ivx * dx + c.ivy * dy + c.ivz * dz;
          const sThrust = computeDirectionalBoostReach(T, boost, tTurn, velAlongD);
          const rTotal = sThrust + 65.0 + 30.0 * T;

          const wx = c.x + dx * rTotal;
          const wy = c.y + dy * rTotal;
          const wzCoord = c.z + dz * rTotal;
          const clipped = clipArenaRocketSimXYZ(wx, wy, wzCoord, 36.0);

          // RocketSim -> Three.js (x, z, y)
          posArr[v3 + 0] = clipped.x;
          posArr[v3 + 1] = clipped.z;
          posArr[v3 + 2] = clipped.y;

          // Directional + hemisphere shading
          const shade =
            0.45 + 0.35 * Math.max(0, 0.45 * dx - 0.5 * dy + 0.74 * dz) + 0.2 * (0.5 * (dz + 1.0));
          colArr[v3 + 0] = rgb[0] * shade;
          colArr[v3 + 1] = rgb[1] * shade;
          colArr[v3 + 2] = rgb[2] * shade;
        }
        posAttr.needsUpdate = true;
        colAttr.needsUpdate = true;

        // Update rib lines
        const ribLine = this.bubbleRibLines[h];
        ribLine.visible = Boolean(config.aerialShowRings);
        if (ribLine.visible) {
          const ribAttr = ribLine.geometry.attributes.position;
          const ribArr = ribAttr.array;
          const ribIdx = this._bubbleRibIdx;
          for (let r = 0; r < ribIdx.length; r++) {
            const vIdx3 = ribIdx[r] * 3;
            const dst3 = r * 3;
            ribArr[dst3 + 0] = posArr[vIdx3 + 0];
            ribArr[dst3 + 1] = posArr[vIdx3 + 1];
            ribArr[dst3 + 2] = posArr[vIdx3 + 2];
          }
          ribAttr.needsUpdate = true;
        }
      }
      return;
    }

    // Default: Continuous 3D Spacetime Funnel / Horn
    this.funnelSubGroup.visible = true;
    this.bubblesSubGroup.visible = false;
    this.funnelMat.opacity = baseOpacity;

    const posAttr = this.funnelMesh.geometry.attributes.position;
    const colAttr = this.funnelMesh.geometry.attributes.color;
    const posArr = posAttr.array;
    const colArr = colAttr.array;

    for (let i = 0; i < FUNNEL_RINGS; i++) {
      const t = FUNNEL_TIMES[i];
      const c = computeBallisticCenter(
        posX,
        posY,
        posZ,
        velX,
        velY,
        velZ,
        upX,
        upY,
        upZ,
        t,
        includeJump,
        isOnGround
      );

      const rgb = t <= 1.05 ? HORIZON_RGB[0] : t <= 2.05 ? HORIZON_RGB[1] : HORIZON_RGB[2];

      for (let j = 0; j < FUNNEL_SECTORS; j++) {
        const cosPhi = FUNNEL_COS[j];
        const sinPhi = FUNNEL_SIN[j];

        // Radial direction in car's (right, up) cross-plane
        const dirX = rightX * cosPhi + upX * sinPhi;
        const dirY = rightY * cosPhi + upY * sinPhi;
        const dirZ = rightZ * cosPhi + upZ * sinPhi;

        const tTurn = computeAerialTurnLatency(
          fwdX,
          fwdY,
          fwdZ,
          dirX,
          dirY,
          dirZ,
          angVelX,
          angVelY,
          angVelZ
        );
        const velAlongD = c.ivx * dirX + c.ivy * dirY + c.ivz * dirZ;
        const sThrust = computeDirectionalBoostReach(t, boost, tTurn, velAlongD);

        const rLat = sThrust * 0.92 + 35.0 + 28.0 * t;
        const rVert = rLat;

        const wx = c.x + rightX * (rLat * cosPhi) + upX * (rVert * sinPhi);
        const wy = c.y + rightY * (rLat * cosPhi) + upY * (rVert * sinPhi);
        const wzCoord = c.z + rightZ * (rLat * cosPhi) + upZ * (rVert * sinPhi);
        const clipped = clipArenaRocketSimXYZ(wx, wy, wzCoord, 32.0);

        const vIdx3 = (i * FUNNEL_SECTORS + j) * 3;
        posArr[vIdx3 + 0] = clipped.x;
        posArr[vIdx3 + 1] = clipped.z;
        posArr[vIdx3 + 2] = clipped.y;

        const shade =
          0.5 +
          0.3 * Math.max(0, 0.4 * dirX - 0.4 * dirY + 0.8 * dirZ) +
          0.2 * (0.5 * (dirZ + 1.0));
        colArr[vIdx3 + 0] = rgb[0] * shade;
        colArr[vIdx3 + 1] = rgb[1] * shade;
        colArr[vIdx3 + 2] = rgb[2] * shade;
      }
    }
    posAttr.needsUpdate = true;
    colAttr.needsUpdate = true;

    // Update 1s, 2s, 3s Isochrone Rings
    const ringIndices = [FUNNEL_IDX_1S, FUNNEL_IDX_2S, FUNNEL_IDX_3S];
    for (let h = 0; h < 3; h++) {
      const rLine = this.funnelRingLines[h];
      rLine.visible = Boolean(config.aerialShowRings);
      if (rLine.visible) {
        const ringI = ringIndices[h];
        const rAttr = rLine.geometry.attributes.position;
        const rArr = rAttr.array;
        const baseV3 = ringI * FUNNEL_SECTORS * 3;
        for (let j = 0; j < FUNNEL_SECTORS; j++) {
          const src = baseV3 + j * 3;
          const dst = j * 3;
          rArr[dst + 0] = posArr[src + 0];
          rArr[dst + 1] = posArr[src + 1];
          rArr[dst + 2] = posArr[src + 2];
        }
        const lastDst = FUNNEL_SECTORS * 3;
        rArr[lastDst + 0] = posArr[baseV3 + 0];
        rArr[lastDst + 1] = posArr[baseV3 + 1];
        rArr[lastDst + 2] = posArr[baseV3 + 2];
        rAttr.needsUpdate = true;
      }
    }

    // Update 4 Longitudinal Rails
    this.funnelRailsLine.visible = Boolean(config.aerialShowRails);
    if (this.funnelRailsLine.visible) {
      const railAttr = this.funnelRailsLine.geometry.attributes.position;
      const railArr = railAttr.array;
      const quarterSectors = [
        0,
        FUNNEL_SECTORS >> 2,
        FUNNEL_SECTORS >> 1,
        (3 * FUNNEL_SECTORS) >> 2,
      ];
      let ptr = 0;
      for (const secJ of quarterSectors) {
        for (let i = 0; i < FUNNEL_RINGS - 1; i++) {
          const v0 = (i * FUNNEL_SECTORS + secJ) * 3;
          const v1 = ((i + 1) * FUNNEL_SECTORS + secJ) * 3;
          railArr[ptr++] = posArr[v0 + 0];
          railArr[ptr++] = posArr[v0 + 1];
          railArr[ptr++] = posArr[v0 + 2];
          railArr[ptr++] = posArr[v1 + 0];
          railArr[ptr++] = posArr[v1 + 1];
          railArr[ptr++] = posArr[v1 + 2];
        }
      }
      railAttr.needsUpdate = true;
    }
  }
}
