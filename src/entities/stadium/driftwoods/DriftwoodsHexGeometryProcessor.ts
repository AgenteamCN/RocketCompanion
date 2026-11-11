/**
 * DriftwoodsHexGeometryProcessor.ts
 * Precomputes per-vertex ribbon half-width offset vectors (`aHexWidthOffset`)
 * and ribbon orientation masks (`aHexIsDepthRibbon`) for `Woods_Field_Walls_Hexes`.
 *
 * The Driftwoods GLB hexagon mesh (16,004 vertices, 8,048 triangles) models every
 * honeycomb segment as a cruciform (+) pair of orthogonal 8.0 UU wide ribbon quads:
 *   1. Wall-parallel ribbon (width = 8.0 UU, `aHexIsDepthRibbon = 0.0`)
 *   2. Wall-perpendicular fin ribbon (depth = 8.0 UU, `aHexIsDepthRibbon = 1.0`)
 *
 * Storing the half-width offset vector from each ribbon's centerline allows the
 * vertex shader to scale width and depth independently in real time with zero CPU
 * overhead and without modifying the GLB asset.
 */

import { BufferAttribute, type Mesh } from 'three';

const LOCAL_TO_UU = 100.0;
const SHORT_EDGE_MAX_UU = 12.0;

/**
 * Computes inward stadium core normal at a given UU coordinate to distinguish
 * wall-perpendicular fin ribbons from wall-parallel surface ribbons.
 */
function computeArenaCoreInwardNormalUu(
  qx: number,
  qy: number,
  qz: number
): [number, number, number] {
  let cx = Math.max(-3700.0, Math.min(3700.0, qx));
  const cy = Math.max(300.0, Math.min(1750.0, qy));
  let cz = Math.max(-4700.0, Math.min(4700.0, qz));

  const cornerExcess = Math.max(0.0, Math.abs(cx) + Math.abs(cz) - 7400.0) * 0.5;
  if (cornerExcess > 0.0) {
    cx -= Math.sign(cx) * cornerExcess;
    cz -= Math.sign(cz) * cornerExcess;
  }

  const nx = cx - qx;
  const ny = cy - qy;
  const nz = cz - qz;
  const len = Math.hypot(nx, ny, nz);
  if (len > 1e-5) {
    return [nx / len, ny / len, nz / len];
  }
  return [0.0, -1.0, 0.0];
}

/**
 * Populates `aHexWidthOffset` (vec3, in local GLB coordinates) and
 * `aHexIsDepthRibbon` (float, 0.0 = wall-parallel width, 1.0 = wall-perpendicular depth)
 * on `Woods_Field_Walls_Hexes`.
 */
export function prepareWoodsFieldHexRibbonAttributes(mesh: Mesh | null | undefined): void {
  const geometry = mesh?.geometry;
  const posAttr = geometry?.attributes?.position;
  if (!geometry || !posAttr) return;

  if (geometry.attributes.aHexWidthOffset && geometry.attributes.aHexIsDepthRibbon) {
    return;
  }

  const vertexCount = posAttr.count;
  const widthOffsets = new Float32Array(vertexCount * 3);
  const isDepthRibbon = new Float32Array(vertexCount);
  const pairedFlags = new Uint8Array(vertexCount);

  const indexAttr = geometry.index;
  const triCount = indexAttr ? Math.floor(indexAttr.count / 3) : Math.floor(vertexCount / 3);

  const quadCentersUu = new Float32Array(triCount * 3);
  const triWidthUnit = new Float32Array(triCount * 3);
  const triNormalDot = new Float32Array(triCount);

  for (let t = 0; t < triCount; t++) {
    const i0 = indexAttr ? indexAttr.getX(t * 3) : t * 3;
    const i1 = indexAttr ? indexAttr.getX(t * 3 + 1) : t * 3 + 1;
    const i2 = indexAttr ? indexAttr.getX(t * 3 + 2) : t * 3 + 2;

    const x0 = posAttr.getX(i0);
    const y0 = posAttr.getY(i0);
    const z0 = posAttr.getZ(i0);
    const x1 = posAttr.getX(i1);
    const y1 = posAttr.getY(i1);
    const z1 = posAttr.getZ(i1);
    const x2 = posAttr.getX(i2);
    const y2 = posAttr.getY(i2);
    const z2 = posAttr.getZ(i2);

    const d01 = Math.hypot(x1 - x0, y1 - y0, z1 - z0) * LOCAL_TO_UU;
    const d12 = Math.hypot(x2 - x1, y2 - y1, z2 - z1) * LOCAL_TO_UU;
    const d20 = Math.hypot(x0 - x2, y0 - y2, z0 - z2) * LOCAL_TO_UU;

    let shortA = i0;
    let shortB = i1;
    let shortDistUu = d01;
    if (d12 <= d01 && d12 <= d20) {
      shortA = i1;
      shortB = i2;
      shortDistUu = d12;
    } else if (d20 <= d01 && d20 <= d12) {
      shortA = i2;
      shortB = i0;
      shortDistUu = d20;
    }

    let longC = i0;
    let longD = i1;
    if (d12 >= d01 && d12 >= d20) {
      longC = i1;
      longD = i2;
    } else if (d20 >= d01 && d20 >= d12) {
      longC = i2;
      longD = i0;
    }

    const ax = posAttr.getX(shortA);
    const ay = posAttr.getY(shortA);
    const az = posAttr.getZ(shortA);
    const bx = posAttr.getX(shortB);
    const by = posAttr.getY(shortB);
    const bz = posAttr.getZ(shortB);

    const dx = (ax - bx) * 0.5;
    const dy = (ay - by) * 0.5;
    const dz = (az - bz) * 0.5;

    if (shortDistUu <= SHORT_EDGE_MAX_UU) {
      const a3 = shortA * 3;
      widthOffsets[a3] = dx;
      widthOffsets[a3 + 1] = dy;
      widthOffsets[a3 + 2] = dz;
      pairedFlags[shortA] = 1;

      const b3 = shortB * 3;
      widthOffsets[b3] = -dx;
      widthOffsets[b3 + 1] = -dy;
      widthOffsets[b3 + 2] = -dz;
      pairedFlags[shortB] = 1;
    }

    const qx = (posAttr.getX(longC) + posAttr.getX(longD)) * 0.5 * LOCAL_TO_UU;
    const qy = (posAttr.getY(longC) + posAttr.getY(longD)) * 0.5 * LOCAL_TO_UU;
    const qz = (posAttr.getZ(longC) + posAttr.getZ(longD)) * 0.5 * LOCAL_TO_UU;
    const t3 = t * 3;
    quadCentersUu[t3] = qx;
    quadCentersUu[t3 + 1] = qy;
    quadCentersUu[t3 + 2] = qz;

    const wLen = Math.hypot(dx, dy, dz);
    const ux = wLen > 1e-6 ? dx / wLen : 1.0;
    const uy = wLen > 1e-6 ? dy / wLen : 0.0;
    const uz = wLen > 1e-6 ? dz / wLen : 0.0;
    triWidthUnit[t3] = ux;
    triWidthUnit[t3 + 1] = uy;
    triWidthUnit[t3 + 2] = uz;

    const [wnx, wny, wnz] = computeArenaCoreInwardNormalUu(qx, qy, qz);
    triNormalDot[t] = Math.abs(ux * wnx + uy * wny + uz * wnz);
  }

  // Fill any single-triangle quad corner vertices from their coincident paired twin
  const posBucket = new Map<string, number>();
  for (let i = 0; i < vertexCount; i++) {
    if (pairedFlags[i]) {
      const key = `${Math.round(posAttr.getX(i) * 200)},${Math.round(posAttr.getY(i) * 200)},${Math.round(posAttr.getZ(i) * 200)}`;
      posBucket.set(key, i);
    }
  }
  for (let i = 0; i < vertexCount; i++) {
    if (!pairedFlags[i]) {
      const key = `${Math.round(posAttr.getX(i) * 200)},${Math.round(posAttr.getY(i) * 200)},${Math.round(posAttr.getZ(i) * 200)}`;
      const twin = posBucket.get(key);
      if (twin !== undefined) {
        const i3 = i * 3;
        const t3 = twin * 3;
        widthOffsets[i3] = widthOffsets[t3];
        widthOffsets[i3 + 1] = widthOffsets[t3 + 1];
        widthOffsets[i3 + 2] = widthOffsets[t3 + 2];
        pairedFlags[i] = 1;
      }
    }
  }

  // Classify each cruciform ribbon pair into wall-parallel (width) vs wall-perpendicular (depth)
  const quadBuckets = new Map<string, number[]>();
  for (let t = 0; t < triCount; t++) {
    const t3 = t * 3;
    const kx = Math.round(quadCentersUu[t3] / 5.0);
    const ky = Math.round(quadCentersUu[t3 + 1] / 5.0);
    const kz = Math.round(quadCentersUu[t3 + 2] / 5.0);
    const key = `${kx},${ky},${kz}`;
    let list = quadBuckets.get(key);
    if (!list) {
      list = [];
      quadBuckets.set(key, list);
    }
    list.push(t);
  }

  for (const [key, group] of quadBuckets.entries()) {
    const [kxStr, kyStr, kzStr] = key.split(',');
    const kx = Number(kxStr);
    const ky = Number(kyStr);
    const kz = Number(kzStr);

    const neighbors: number[] = [];
    for (let dx = -1; dx <= 1; dx++) {
      for (let dy = -1; dy <= 1; dy++) {
        for (let dz = -1; dz <= 1; dz++) {
          const nList = quadBuckets.get(`${kx + dx},${ky + dy},${kz + dz}`);
          if (nList) neighbors.push(...nList);
        }
      }
    }

    for (const t of group) {
      const t3 = t * 3;
      const qx = quadCentersUu[t3];
      const qy = quadCentersUu[t3 + 1];
      const qz = quadCentersUu[t3 + 2];
      const ux = triWidthUnit[t3];
      const uy = triWidthUnit[t3 + 1];
      const uz = triWidthUnit[t3 + 2];

      let orthPartnerDot = -1.0;
      for (const t2 of neighbors) {
        const t2_3 = t2 * 3;
        const distUu = Math.hypot(
          quadCentersUu[t2_3] - qx,
          quadCentersUu[t2_3 + 1] - qy,
          quadCentersUu[t2_3 + 2] - qz
        );
        if (distUu < 5.0) {
          const dotUnit = Math.abs(
            ux * triWidthUnit[t2_3] + uy * triWidthUnit[t2_3 + 1] + uz * triWidthUnit[t2_3 + 2]
          );
          if (dotUnit < 0.25) {
            orthPartnerDot = triNormalDot[t2];
            break;
          }
        }
      }

      const isDepth =
        orthPartnerDot >= 0.0 ? triNormalDot[t] > orthPartnerDot : triNormalDot[t] > 0.7;
      if (isDepth) {
        const i0 = indexAttr ? indexAttr.getX(t * 3) : t * 3;
        const i1 = indexAttr ? indexAttr.getX(t * 3 + 1) : t * 3 + 1;
        const i2 = indexAttr ? indexAttr.getX(t * 3 + 2) : t * 3 + 2;
        isDepthRibbon[i0] = 1.0;
        isDepthRibbon[i1] = 1.0;
        isDepthRibbon[i2] = 1.0;
      }
    }
  }

  geometry.setAttribute('aHexWidthOffset', new BufferAttribute(widthOffsets, 3));
  geometry.setAttribute('aHexIsDepthRibbon', new BufferAttribute(isDepthRibbon, 1));
}
