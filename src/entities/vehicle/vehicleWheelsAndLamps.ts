import * as THREE from 'three';
import {
  FENNEC_DESCRIPTOR,
  GLOBAL_VEHICLE_LAMPS_CONFIG,
  getVehicleDescriptor,
  vehicleTunerRuntimeFlags,
  wheelModifierRuntimeConfig,
} from '../../ui-core/config/vehicleTunerConfig.ts';
import {
  createCarPaintMaterial,
  getVehicleReceiveShadows,
  buildCustomToonRampTexture,
} from './vehiclePaintMaterial.ts';

function createWheelFaceMaterial(
  hexColor: string | number,
  shaderMode = 'standard',
  roughness = 1.0,
  metalness = 0.0
) {
  const col = new THREE.Color(hexColor || '#222222');
  const mode = shaderMode || 'standard';
  if (mode === 'basic') {
    return new THREE.MeshBasicMaterial({ color: col });
  }
  if (mode === 'toon') {
    if (col.r < 0.06 && col.g < 0.06 && col.b < 0.06) {
      col.setRGB(Math.max(col.r, 0.06), Math.max(col.g, 0.06), Math.max(col.b, 0.06));
    }
    const ramp = buildCustomToonRampTexture(4, 0.12, 1.0, false);
    return new THREE.MeshToonMaterial({ color: col, gradientMap: ramp });
  }
  const resolvedRoughness = Math.max(0, Math.min(1, Number(roughness ?? 1.0)));
  const resolvedMetalness = Math.max(0, Math.min(1, Number(metalness ?? 0.0)));
  // Lift minimum base albedo floor proportionally when roughness < 1 or metalness > 0 so #000000 tire rubber responds visibly.
  const floor = (1.0 - resolvedRoughness) * 0.035 + resolvedMetalness * 0.14;
  if (floor > 0 && col.r < floor && col.g < floor && col.b < floor) {
    col.setRGB(Math.max(col.r, floor), Math.max(col.g, floor), Math.max(col.b, floor));
  }
  return new THREE.MeshStandardMaterial({
    color: col,
    roughness: resolvedRoughness,
    metalness: resolvedMetalness,
    envMapIntensity: 1.35,
  });
}

function appendFaceAnnulus(
  positions: number[],
  normals: number[],
  uvs: number[],
  indices: number[],
  segments: number,
  radius: number,
  rimRadius: number,
  rimRatio: number,
  faceZ: number,
  faceNz: number
) {
  if (rimRatio >= 0.9999) return;
  const startIdx = positions.length / 3;
  for (let i = 0; i <= segments; i++) {
    const theta = (i / segments) * Math.PI * 2;
    const cosT = Math.cos(theta);
    const sinT = Math.sin(theta);
    positions.push(rimRadius * cosT, rimRadius * sinT, faceZ, radius * cosT, radius * sinT, faceZ);
    normals.push(0, 0, faceNz, 0, 0, faceNz);
    uvs.push(
      0.5 + 0.5 * rimRatio * cosT,
      0.5 + 0.5 * rimRatio * sinT,
      0.5 + 0.5 * cosT,
      0.5 + 0.5 * sinT
    );
  }
  for (let i = 0; i < segments; i++) {
    const innerCurr = startIdx + i * 2;
    const outerCurr = innerCurr + 1;
    const innerNext = startIdx + (i + 1) * 2;
    const outerNext = innerNext + 1;
    if (faceNz > 0) {
      indices.push(innerCurr, outerCurr, outerNext, innerCurr, outerNext, innerNext);
    } else {
      indices.push(innerCurr, outerNext, outerCurr, innerCurr, innerNext, outerNext);
    }
  }
}

function appendFaceDisc(
  positions: number[],
  normals: number[],
  uvs: number[],
  indices: number[],
  segments: number,
  rimRadius: number,
  rimRatio: number,
  faceZ: number,
  faceNz: number
) {
  if (rimRatio <= 0.0001) return;
  const centerIdx = positions.length / 3;
  positions.push(0, 0, faceZ);
  normals.push(0, 0, faceNz);
  uvs.push(0.5, 0.5);
  const ringStartIdx = positions.length / 3;
  for (let i = 0; i <= segments; i++) {
    const theta = (i / segments) * Math.PI * 2;
    const cosT = Math.cos(theta);
    const sinT = Math.sin(theta);
    positions.push(rimRadius * cosT, rimRadius * sinT, faceZ);
    normals.push(0, 0, faceNz);
    uvs.push(0.5 + 0.5 * rimRatio * cosT, 0.5 + 0.5 * rimRatio * sinT);
  }
  for (let i = 0; i < segments; i++) {
    const rimCurr = ringStartIdx + i;
    const rimNext = ringStartIdx + i + 1;
    if (faceNz > 0) {
      indices.push(centerIdx, rimCurr, rimNext);
    } else {
      indices.push(centerIdx, rimNext, rimCurr);
    }
  }
}

/**
 * Builds an indexed BufferGeometry for the solid-cylinder wheel with circular rim boundaries
 * on both the outer and inner circular faces:
 * - Group 0 (materialIndex 0): Cylindrical barrel / contact tread + Outer & Inner tire sidewall rings
 * - Group 1 (materialIndex 1): Outer circular face inner rim disc [0 .. R * outerPct]
 * - Group 2 (materialIndex 2): Inner circular face inner rim disc [0 .. R * innerPct]
 */
function buildSolidCylinderWheelGeometry(
  radius: number,
  width: number,
  outerRimRadiusPct: number,
  innerRimRadiusPct: number,
  isRightWheel: boolean
) {
  const segments = 48;
  const halfWidth = width * 0.5;
  const outerPct = Math.max(0, Math.min(100, Number(outerRimRadiusPct ?? 80)));
  const outerRimRatio = outerPct / 100;
  const outerRimRadius = radius * outerRimRatio;

  const innerPct = Math.max(0, Math.min(100, Number(innerRimRadiusPct ?? outerPct)));
  const innerRimRatio = innerPct / 100;
  const innerRimRadius = radius * innerRimRatio;

  const outerZ = isRightWheel ? halfWidth : -halfWidth;
  const outerNz = isRightWheel ? 1 : -1;
  const innerZ = isRightWheel ? -halfWidth : halfWidth;
  const innerNz = isRightWheel ? -1 : 1;

  const positions: number[] = [];
  const normals: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];

  const group0Start = indices.length;
  const barrelBaseIdx = positions.length / 3;
  for (let i = 0; i <= segments; i++) {
    const u = i / segments;
    const theta = u * Math.PI * 2;
    const cosT = Math.cos(theta);
    const sinT = Math.sin(theta);
    positions.push(
      radius * cosT,
      radius * sinT,
      -halfWidth,
      radius * cosT,
      radius * sinT,
      halfWidth
    );
    normals.push(cosT, sinT, 0, cosT, sinT, 0);
    uvs.push(u, 0, u, 1);
  }
  for (let i = 0; i < segments; i++) {
    const idxA = barrelBaseIdx + i * 2;
    const idxB = barrelBaseIdx + (i + 1) * 2;
    indices.push(idxA, idxB, idxB + 1, idxA, idxB + 1, idxA + 1);
  }

  appendFaceAnnulus(
    positions,
    normals,
    uvs,
    indices,
    segments,
    radius,
    outerRimRadius,
    outerRimRatio,
    outerZ,
    outerNz
  );
  appendFaceAnnulus(
    positions,
    normals,
    uvs,
    indices,
    segments,
    radius,
    innerRimRadius,
    innerRimRatio,
    innerZ,
    innerNz
  );
  const group0Count = indices.length - group0Start;

  const group1Start = indices.length;
  appendFaceDisc(
    positions,
    normals,
    uvs,
    indices,
    segments,
    outerRimRadius,
    outerRimRatio,
    outerZ,
    outerNz
  );
  const group1Count = indices.length - group1Start;

  const group2Start = indices.length;
  appendFaceDisc(
    positions,
    normals,
    uvs,
    indices,
    segments,
    innerRimRadius,
    innerRimRatio,
    innerZ,
    innerNz
  );
  const group2Count = indices.length - group2Start;

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  geometry.addGroup(group0Start, group0Count, 0);
  geometry.addGroup(group1Start, group1Count, 1);
  geometry.addGroup(group2Start, group2Count, 2);
  geometry.computeBoundingSphere();
  return geometry;
}

/**
 * Creates a procedural 3D wheel ('solid-cylinder' mode or 'default' sport wheel mode).
 */
export function createProceduralSportWheel(
  wheelRadius = 13.5,
  teamColor = 0x42a5f5,
  wheelIndex = 0
) {
  const group = new THREE.Group();
  const config = wheelModifierRuntimeConfig;
  const effectiveRadius = Math.max(
    4,
    (Number(wheelRadius) || 13.5) * (Number(config.radiusScale) || 1.0)
  );

  if (config.mode === 'solid-cylinder') {
    const width = Math.max(1.0, Number(config.width) || 6.0);
    const isRightWheel = wheelIndex % 2 === 0;
    const outerRimRadiusPct = config.outerRimRadiusPct ?? 80;
    const innerFollowsOuter = config.innerRimFollowsOuter !== false;
    const innerRimRadiusPct = innerFollowsOuter
      ? outerRimRadiusPct
      : (config.innerRimRadiusPct ?? outerRimRadiusPct);

    const cylinderGeometry = buildSolidCylinderWheelGeometry(
      effectiveRadius,
      width,
      outerRimRadiusPct,
      innerRimRadiusPct,
      isRightWheel
    );

    const sideShader = config.sideShaderMode ?? config.shaderMode ?? 'standard';
    const sideRoughness = config.sideRoughness ?? config.roughness ?? 0.5;
    const sideMetalness = config.sideMetalness ?? config.metalness ?? 0.7;

    const treadColor = config.treadColor || config.innerColor || '#000000';
    const treadShader =
      config.treadShaderMode ?? config.innerShaderMode ?? config.shaderMode ?? 'standard';
    const treadRoughness =
      config.treadRoughness ?? config.innerRoughness ?? config.roughness ?? 1.0;
    const treadMetalness =
      config.treadMetalness ?? config.innerMetalness ?? config.metalness ?? 0.0;

    const tireRubberMaterial = createWheelFaceMaterial(
      treadColor,
      treadShader,
      treadRoughness,
      treadMetalness
    );
    const outerRimMaterial = createWheelFaceMaterial(
      config.outerColor || '#737373',
      sideShader,
      sideRoughness,
      sideMetalness
    );
    const innerRimMaterial = innerFollowsOuter
      ? outerRimMaterial
      : createWheelFaceMaterial(
          config.innerRimColor || config.outerColor || '#737373',
          config.innerRimShaderMode ?? sideShader,
          config.innerRimRoughness ?? sideRoughness,
          config.innerRimMetalness ?? sideMetalness
        );

    const cylinderMesh = new THREE.Mesh(cylinderGeometry, [
      tireRubberMaterial,
      outerRimMaterial,
      innerRimMaterial,
    ]);
    cylinderMesh.name = 'solid-cylinder-wheel';
    cylinderMesh.castShadow = true;
    cylinderMesh.receiveShadow = getVehicleReceiveShadows();
    group.add(cylinderMesh);
    return group;
  }

  const palette = createCarPaintMaterial(teamColor);
  const tireWidth = config.width ? Math.max(2, Number(config.width)) : effectiveRadius * 0.68;
  const tireGeom = new THREE.CylinderGeometry(effectiveRadius, effectiveRadius, tireWidth, 24);
  tireGeom.rotateX(Math.PI / 2);
  const tireMesh = new THREE.Mesh(tireGeom, palette.tire);
  tireMesh.castShadow = true;
  group.add(tireMesh);

  const rimRadius = effectiveRadius * 0.72;
  const rimGeom = new THREE.CylinderGeometry(rimRadius, rimRadius, tireWidth * 1.04, 16);
  rimGeom.rotateX(Math.PI / 2);
  const rimMesh = new THREE.Mesh(rimGeom, palette.wheelMetal);
  rimMesh.castShadow = true;
  group.add(rimMesh);

  return group;
}

const tmpIdleColor = new THREE.Color();
const tmpBrakeColor = new THREE.Color();
const tmpFinalColor = new THREE.Color();

/**
 * Per-frame dynamic brake / tail lamp controller.
 */
export function updateVehicleBrakeLamps(
  carRoot: THREE.Object3D | null | undefined,
  presetId: string,
  forwardSpeed = 0,
  throttle = 0,
  isOnGround = true,
  isPowersliding = false,
  delta = 0.016
) {
  if (!carRoot) return;
  const bodyMesh = carRoot.children?.find((c) => c.name === 'car-body-mesh') || carRoot;
  const tailMats = bodyMesh.userData?.tailLampMaterials || carRoot.userData?.tailLampMaterials;
  if (!tailMats || tailMats.length === 0) return;

  const descriptor = getVehicleDescriptor(presetId) || FENNEC_DESCRIPTOR;
  const lampsCfg =
    GLOBAL_VEHICLE_LAMPS_CONFIG || descriptor.lampsConfig || FENNEC_DESCRIPTOR.lampsConfig;

  const minSpeed = Math.max(0, Number(lampsCfg.brakeMinSpeed ?? 30));
  const vFwd = Number(forwardSpeed) || 0;
  const thr = Number(throttle) || 0;

  const previewMode =
    vehicleTunerRuntimeFlags.brakePreviewMode ||
    (vehicleTunerRuntimeFlags.forceBrakeLightPreview ? 'force-on' : 'auto');

  let targetBrake = 0.0;
  if (previewMode === 'force-on') {
    targetBrake = 1.0;
  } else if (previewMode === 'force-off') {
    targetBrake = 0.0;
  } else {
    const canLightUp = Boolean(isOnGround) && !isPowersliding;
    const forwardNoThrottle = vFwd > minSpeed && thr <= 0;
    const backwardNoReverse = vFwd < -minSpeed && thr >= 0;
    const stationaryNoInput = Math.abs(vFwd) <= minSpeed && Math.abs(thr) <= 0.01;
    targetBrake =
      canLightUp && (forwardNoThrottle || backwardNoReverse || stationaryNoInput) ? 1.0 : 0.0;
  }

  const prevBlend =
    typeof bodyMesh.userData.brakeBlend === 'number' ? bodyMesh.userData.brakeBlend : targetBrake;
  const lerpFactor = Math.min(1.0, Math.max(0.18, (delta || 0.016) * 20.0));
  const nextBlend = prevBlend + (targetBrake - prevBlend) * lerpFactor;
  bodyMesh.userData.brakeBlend = nextBlend;

  tmpIdleColor
    .set(lampsCfg.tailIdleColor || '#5c0a0a')
    .multiplyScalar(lampsCfg.tailIdleIntensity ?? 0.85);
  tmpBrakeColor
    .set(lampsCfg.brakeColor || '#ff2200')
    .multiplyScalar(lampsCfg.brakeIntensity ?? 4.5);
  tmpFinalColor.copy(tmpIdleColor).lerp(tmpBrakeColor, nextBlend);

  for (const mat of tailMats) {
    if (mat && mat.color) {
      mat.color.copy(tmpFinalColor);
      mat.toneMapped = Boolean(lampsCfg.tailToneMapped);
    }
  }
}
