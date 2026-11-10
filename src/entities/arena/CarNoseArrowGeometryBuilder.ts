/**
 * CarNoseArrowGeometryBuilder.ts
 * Pure Three.js mesh bundle builder and per-frame geometry/material updater
 * for a single Custom-Training-Pack-style 3D arrow (cylinder shaft, cone head,
 * rounded tip sphere, back-side silhouette shadow shell, and contrast halo sprite).
 */

import * as THREE from 'three';
import type { KeyboardInputOverlayConfig } from '../../ui-core/config/keyboardInputOverlayConfig.ts';

export interface NoseArrowMeshBundle {
  group: THREE.Group;
  shaftMesh: THREE.Mesh<THREE.CylinderGeometry, THREE.MeshStandardMaterial>;
  shaftShadowMesh: THREE.Mesh<THREE.CylinderGeometry, THREE.MeshBasicMaterial>;
  headGroup: THREE.Group;
  headConeMesh: THREE.Mesh<THREE.CylinderGeometry, THREE.MeshStandardMaterial>;
  headTipCapMesh: THREE.Mesh<THREE.SphereGeometry, THREE.MeshStandardMaterial>;
  headShadowConeMesh: THREE.Mesh<THREE.CylinderGeometry, THREE.MeshBasicMaterial>;
  haloSprite: THREE.Sprite;
  bodyMat: THREE.MeshStandardMaterial;
  shadowMat: THREE.MeshBasicMaterial;
  haloMat: THREE.SpriteMaterial;
  lastConeRadius: number;
  lastTipRadius: number;
  lastHexColor: string;
}

const UP_UNIT = new THREE.Vector3(0, 1, 0);
const TMP_COLOR = new THREE.Color();

export function buildNoseConeUnitGeometry(
  coneRadius: number,
  tipRadius: number
): THREE.CylinderGeometry {
  const safeBase = Math.max(0.01, coneRadius);
  const safeTip = Math.max(0, tipRadius);
  const geo = new THREE.CylinderGeometry(safeTip, safeBase, 1, 24, 1, false);
  geo.translate(0, 0.5, 0);
  return geo;
}

export function createSingleNoseArrowBundle(
  parentGroup: THREE.Group,
  haloTexture: THREE.Texture | null,
  initHex: string,
  name: string
): NoseArrowMeshBundle {
  const group = new THREE.Group();
  group.name = name;

  const colorObj = new THREE.Color(initHex);
  const emissiveObj = colorObj.clone().multiplyScalar(0.45);

  const bodyMat = new THREE.MeshStandardMaterial({
    color: colorObj,
    emissive: emissiveObj,
    emissiveIntensity: 0.52,
    metalness: 0.14,
    roughness: 0.42,
    transparent: true,
    opacity: 0.88,
    depthTest: true,
    depthWrite: false,
  });

  const shadowMat = new THREE.MeshBasicMaterial({
    color: 0x05070c,
    side: THREE.BackSide,
    transparent: true,
    opacity: 0.55,
    depthTest: true,
    depthWrite: false,
  });

  const haloMat = new THREE.SpriteMaterial({
    map: haloTexture,
    transparent: true,
    opacity: 0.8,
    depthTest: false,
    depthWrite: false,
    toneMapped: false,
  });
  const haloSprite = new THREE.Sprite(haloMat);
  haloSprite.renderOrder = 12;
  group.add(haloSprite);

  const unitShaftGeo = new THREE.CylinderGeometry(1, 1, 1, 20);
  unitShaftGeo.translate(0, 0.5, 0);

  const shaftShadowMesh = new THREE.Mesh(unitShaftGeo, shadowMat);
  shaftShadowMesh.renderOrder = 13;
  group.add(shaftShadowMesh);

  const shaftMesh = new THREE.Mesh(unitShaftGeo, bodyMat);
  shaftMesh.renderOrder = 14;
  group.add(shaftMesh);

  const headGroup = new THREE.Group();
  const initConeGeo = buildNoseConeUnitGeometry(10, 1.5);

  const headShadowConeMesh = new THREE.Mesh(initConeGeo, shadowMat);
  headShadowConeMesh.renderOrder = 13;
  headGroup.add(headShadowConeMesh);

  const headConeMesh = new THREE.Mesh(initConeGeo, bodyMat);
  headConeMesh.renderOrder = 14;
  headGroup.add(headConeMesh);

  const headTipCapMesh = new THREE.Mesh(new THREE.SphereGeometry(1, 16, 12), bodyMat);
  headTipCapMesh.renderOrder = 14;
  headGroup.add(headTipCapMesh);

  group.add(headGroup);
  parentGroup.add(group);

  return {
    group,
    shaftMesh,
    shaftShadowMesh,
    headGroup,
    headConeMesh,
    headTipCapMesh,
    headShadowConeMesh,
    haloSprite,
    bodyMat,
    shadowMat,
    haloMat,
    lastConeRadius: 10,
    lastTipRadius: 1.5,
    lastHexColor: initHex,
  };
}

export function updateSingleNoseArrowBundle(
  bundle: NoseArrowMeshBundle,
  originWorld: THREE.Vector3,
  dirWorld: THREE.Vector3,
  hexColor: string,
  cfg: KeyboardInputOverlayConfig,
  isKeyHeld: boolean,
  arrowTotalLengthUu?: number
): void {
  const rawTotalLen = arrowTotalLengthUu ?? cfg.noseArrowTotalLengthUu;
  if (rawTotalLen <= 0) {
    bundle.group.visible = false;
    return;
  }
  bundle.group.visible = true;

  const scaleBoost = isKeyHeld ? (cfg.nosePressScaleMultiplier ?? 1.12) : 1.0;
  const coneRadius = Math.max(0.01, cfg.noseConeRadiusUu * scaleBoost);
  const totalLength = Math.max(0.01, rawTotalLen * scaleBoost);
  const coneLength = Math.max(0.01, Math.min(totalLength, cfg.noseConeLengthUu * scaleBoost));
  const tipRadius = Math.max(0, cfg.noseTipRadiusUu * scaleBoost);
  const shaftRadius = Math.max(0.01, cfg.noseShaftRadiusUu * scaleBoost);
  const shaftLen = Math.max(0, totalLength - coneLength);
  const shadowScale = Math.max(0, cfg.noseShadowScale);
  const arrowOpacity = THREE.MathUtils.clamp(
    cfg.noseArrowOpacity * (isKeyHeld ? 1.0 : 0.92),
    0.0,
    1.0
  );
  const shadowOpacity = THREE.MathUtils.clamp(cfg.noseShadowOpacity, 0.0, 1.0);
  const haloScale = Math.max(0, cfg.noseHaloScaleUu * scaleBoost);

  TMP_COLOR.set(hexColor);
  if (bundle.lastHexColor !== hexColor) {
    bundle.bodyMat.color.copy(TMP_COLOR);
    bundle.lastHexColor = hexColor;
  }
  bundle.bodyMat.emissive.copy(TMP_COLOR).multiplyScalar(isKeyHeld ? 0.68 : 0.45);

  if (
    Math.abs(bundle.lastConeRadius - coneRadius) > 0.02 ||
    Math.abs(bundle.lastTipRadius - tipRadius) > 0.02
  ) {
    const nextGeo = buildNoseConeUnitGeometry(coneRadius, tipRadius);
    bundle.headConeMesh.geometry.dispose();
    bundle.headConeMesh.geometry = nextGeo;
    bundle.headShadowConeMesh.geometry = nextGeo;
    bundle.lastConeRadius = coneRadius;
    bundle.lastTipRadius = tipRadius;
  }

  bundle.group.position.copy(originWorld);
  bundle.group.quaternion.setFromUnitVectors(UP_UNIT, dirWorld);

  if (shaftLen > 0.01) {
    bundle.shaftMesh.visible = true;
    bundle.shaftMesh.scale.set(shaftRadius, shaftLen, shaftRadius);
    bundle.shaftShadowMesh.scale.set(
      shaftRadius * shadowScale,
      shaftLen,
      shaftRadius * shadowScale
    );
    bundle.shaftShadowMesh.visible = shadowOpacity > 0.005;
  } else {
    bundle.shaftMesh.visible = false;
    bundle.shaftShadowMesh.visible = false;
  }

  bundle.headGroup.position.set(0, shaftLen, 0);
  bundle.headConeMesh.scale.set(1, coneLength, 1);
  bundle.headShadowConeMesh.scale.set(
    shadowScale,
    coneLength * (1 + (shadowScale - 1) * 0.35),
    shadowScale
  );
  bundle.headShadowConeMesh.position.set(0, -coneLength * 0.02, 0);
  bundle.headShadowConeMesh.visible = shadowOpacity > 0.005;

  if (tipRadius > 0.05) {
    bundle.headTipCapMesh.visible = true;
    bundle.headTipCapMesh.position.set(0, coneLength, 0);
    bundle.headTipCapMesh.scale.setScalar(tipRadius);
  } else {
    bundle.headTipCapMesh.visible = false;
  }

  if (haloScale > 0.1 && shadowOpacity > 0.005) {
    bundle.haloSprite.visible = true;
    bundle.haloSprite.position.set(0, shaftLen + coneLength * 0.25, 0);
    bundle.haloSprite.scale.setScalar(haloScale);
    bundle.haloMat.opacity = THREE.MathUtils.clamp(shadowOpacity * 1.25, 0, 0.92);
  } else {
    bundle.haloSprite.visible = false;
  }

  bundle.bodyMat.opacity = arrowOpacity;
  bundle.shadowMat.opacity = shadowOpacity;
}

export function disposeSingleNoseArrowBundle(bundle: NoseArrowMeshBundle): void {
  bundle.shaftMesh.geometry.dispose();
  bundle.headConeMesh.geometry.dispose();
  bundle.headTipCapMesh.geometry.dispose();
  bundle.bodyMat.dispose();
  bundle.shadowMat.dispose();
  bundle.haloMat.dispose();
}
