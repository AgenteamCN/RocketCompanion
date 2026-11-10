/**
 * StaticTrainingVisuals.ts
 * 3D visual overlays for Static Training Pack Mode (Play & Edit):
 * - Car Speed Direction Arrow (visible during Play pre-launch & Edit Mode)
 * - Car Heading Arrow (visible during Edit Mode to distinguish nose heading from velocity direction)
 * - Ball Velocity Arrow & Kickoff-State Halo Ring
 * - Ground Drop-Lines & Target Rings (for Free Camera inspection)
 */

import * as THREE from 'three';
import { createBallLocatorHaloTexture } from '../../../entities/BallLocatorArrow.ts';
import {
  useStaticTrainingBallCamTunerStore,
  DEFAULT_STATIC_TRAINING_BALL_CAM_CONFIG,
} from '../../runtimeUiPort.ts';

interface ArrowUserData {
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
  scaleFactor: number;
  lastConeRadius: number;
  lastTipRadius: number;
}

let sharedHaloTexture: THREE.Texture | null = null;
function getSharedHaloTexture(): THREE.Texture | null {
  if (!sharedHaloTexture) {
    sharedHaloTexture = createBallLocatorHaloTexture();
  }
  return sharedHaloTexture;
}

function buildConeUnitGeometry(coneRadius: number, tipRadius: number): THREE.CylinderGeometry {
  const safeBase = Math.max(1, coneRadius);
  const safeTip = Math.max(0, Math.min(safeBase * 0.9, tipRadius));
  const geo = new THREE.CylinderGeometry(safeTip, safeBase, 1, 24, 1, false);
  geo.translate(0, 0.5, 0);
  return geo;
}

function createGroundRingMesh(
  innerR: number,
  outerR: number,
  segments: number,
  color: number,
  opacity: number,
  renderOrder: number
): THREE.Mesh<THREE.RingGeometry, THREE.MeshBasicMaterial> {
  const geo = new THREE.RingGeometry(innerR, outerR, segments);
  geo.rotateX(-Math.PI / 2);
  const mesh = new THREE.Mesh(
    geo,
    new THREE.MeshBasicMaterial({
      color,
      side: THREE.DoubleSide,
      transparent: true,
      opacity,
      depthWrite: false,
    })
  );
  mesh.renderOrder = renderOrder;
  return mesh;
}

function create3DArrowMesh(colorHex: number, emissiveHex: number, scaleFactor = 1.0): THREE.Group {
  const group = new THREE.Group();
  const d = DEFAULT_STATIC_TRAINING_BALL_CAM_CONFIG;

  const bodyMat = new THREE.MeshStandardMaterial({
    color: colorHex,
    emissive: emissiveHex,
    emissiveIntensity: 0.48,
    metalness: 0.14,
    roughness: 0.45,
    transparent: true,
    opacity: d.arrowOpacity,
    depthTest: true,
    depthWrite: false,
  });

  const shadowMat = new THREE.MeshBasicMaterial({
    color: 0x05070c,
    side: THREE.BackSide,
    transparent: true,
    opacity: d.shadowOpacity,
    depthTest: true,
    depthWrite: false,
  });

  const haloMat = new THREE.SpriteMaterial({
    map: getSharedHaloTexture(),
    transparent: true,
    opacity: 0.85,
    depthTest: false,
    depthWrite: false,
    toneMapped: false,
  });
  const haloSprite = new THREE.Sprite(haloMat);
  haloSprite.name = 'direction-arrow-clarity-halo';
  haloSprite.scale.setScalar(d.haloScale * scaleFactor);
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
  const initConeGeo = buildConeUnitGeometry(d.coneRadius * scaleFactor, d.tipRadius * scaleFactor);

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

  group.userData = {
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
    scaleFactor,
    lastConeRadius: d.coneRadius * scaleFactor,
    lastTipRadius: d.tipRadius * scaleFactor,
  } satisfies ArrowUserData;

  return group;
}

function update3DArrowMesh(
  arrowGroup: THREE.Group | null,
  originThree: THREE.Vector3,
  dirThree: THREE.Vector3,
  totalLength: number,
  highlight = false
): void {
  if (!arrowGroup) return;

  const tuner =
    useStaticTrainingBallCamTunerStore?.getState?.() ?? DEFAULT_STATIC_TRAINING_BALL_CAM_CONFIG;

  const ud = arrowGroup.userData as ArrowUserData;
  const sf = ud.scaleFactor * (highlight ? 1.08 : 1.0);

  const coneRadius = Math.max(4, (tuner.coneRadius ?? 20) * sf);
  const coneLength = Math.max(12, (tuner.coneLength ?? 58) * sf);
  const tipRadius = Math.max(0, Math.min(coneRadius * 0.85, (tuner.tipRadius ?? 2.5) * sf));
  const shaftRadius = Math.max(1.5, (tuner.shaftRadius ?? 7.0) * sf);
  const shadowScale = Math.max(1.02, tuner.shadowScale ?? 1.18);
  const arrowOpacity = THREE.MathUtils.clamp(
    (tuner.arrowOpacity ?? 0.78) * (highlight ? 1.0 : 0.88),
    0.1,
    1.0
  );
  const shadowOpacity = THREE.MathUtils.clamp(
    (tuner.shadowOpacity ?? 0.52) * (highlight ? 1.0 : 0.85),
    0.0,
    1.0
  );
  const haloScale = Math.max(0, (tuner.haloScale ?? 95) * sf);

  if (
    Math.abs(ud.lastConeRadius - coneRadius) > 0.05 ||
    Math.abs(ud.lastTipRadius - tipRadius) > 0.05
  ) {
    const nextGeo = buildConeUnitGeometry(coneRadius, tipRadius);
    ud.headConeMesh.geometry.dispose();
    ud.headConeMesh.geometry = nextGeo;
    ud.headShadowConeMesh.geometry = nextGeo;
    ud.lastConeRadius = coneRadius;
    ud.lastTipRadius = tipRadius;
  }

  const normDir = dirThree.clone();
  if (normDir.lengthSq() < 1e-6) normDir.set(0, 0, 1);
  else normDir.normalize();

  arrowGroup.position.copy(originThree);
  arrowGroup.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), normDir);

  const len = Math.max(coneLength + 24, totalLength);
  const shaftLen = Math.max(18, len - coneLength);

  ud.shaftMesh.scale.set(shaftRadius, shaftLen, shaftRadius);
  ud.shaftShadowMesh.scale.set(shaftRadius * shadowScale, shaftLen, shaftRadius * shadowScale);
  ud.shaftShadowMesh.visible = shadowOpacity > 0.01;

  ud.headGroup.position.set(0, shaftLen, 0);
  ud.headConeMesh.scale.set(1, coneLength, 1);
  ud.headShadowConeMesh.scale.set(
    shadowScale,
    coneLength * (1 + (shadowScale - 1) * 0.35),
    shadowScale
  );
  ud.headShadowConeMesh.position.set(0, -coneLength * 0.02, 0);
  ud.headShadowConeMesh.visible = shadowOpacity > 0.01;

  if (tipRadius > 0.25) {
    ud.headTipCapMesh.visible = true;
    ud.headTipCapMesh.position.set(0, coneLength, 0);
    ud.headTipCapMesh.scale.setScalar(tipRadius);
  } else {
    ud.headTipCapMesh.visible = false;
  }

  if (haloScale > 1 && shadowOpacity > 0.01) {
    ud.haloSprite.visible = true;
    ud.haloSprite.position.set(0, shaftLen + coneLength * 0.25, 0);
    ud.haloSprite.scale.setScalar(haloScale);
    ud.haloMat.opacity = THREE.MathUtils.clamp(shadowOpacity * 1.35, 0, 0.95);
  } else {
    ud.haloSprite.visible = false;
  }

  ud.bodyMat.opacity = arrowOpacity;
  ud.shadowMat.opacity = shadowOpacity;
}

export interface StaticTrainingVisualUpdateOptions {
  isEditMode?: boolean;
  editSubMode?: string;
  showPlayArrows?: boolean;
}

export class StaticTrainingVisuals {
  public scene: THREE.Scene | null;
  public root: THREE.Group;
  public carSpeedArrow: THREE.Group;
  public carHeadingArrow: THREE.Group;
  public ballSpeedArrow: THREE.Group;
  public ballKickoffHalo: THREE.Mesh<THREE.RingGeometry, THREE.MeshBasicMaterial>;
  public carGroundRing: THREE.Mesh<THREE.RingGeometry, THREE.MeshBasicMaterial>;
  public ballGroundRing: THREE.Mesh<THREE.RingGeometry, THREE.MeshBasicMaterial>;
  public carDropLineGeo: THREE.BufferGeometry;
  public carDropLine: THREE.Line<THREE.BufferGeometry, THREE.LineBasicMaterial>;
  public ballDropLineGeo: THREE.BufferGeometry;
  public ballDropLine: THREE.Line<THREE.BufferGeometry, THREE.LineBasicMaterial>;

  constructor(scene: THREE.Scene | null) {
    this.scene = scene;
    this.root = new THREE.Group();
    this.root.name = 'static-training-pack-visuals';
    this.root.visible = false;

    this.carSpeedArrow = create3DArrowMesh(0xf59e0b, 0x78350f, 1.0);
    this.carHeadingArrow = create3DArrowMesh(0x38bdf8, 0x0c4a6e, 0.84);
    this.ballSpeedArrow = create3DArrowMesh(0x10b981, 0x064e3b, 1.0);
    this.ballKickoffHalo = createGroundRingMesh(108, 124, 36, 0x22d3ee, 0.85, 14);
    this.carGroundRing = createGroundRingMesh(68, 80, 32, 0x38bdf8, 0.65, 13);
    this.ballGroundRing = createGroundRingMesh(82, 96, 32, 0x10b981, 0.65, 13);

    const dropLineMat = new THREE.LineBasicMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 0.45,
      depthWrite: false,
    });
    this.carDropLineGeo = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(),
      new THREE.Vector3(),
    ]);
    this.carDropLine = new THREE.Line(this.carDropLineGeo, dropLineMat);
    this.carDropLine.renderOrder = 13;

    this.ballDropLineGeo = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(),
      new THREE.Vector3(),
    ]);
    this.ballDropLine = new THREE.Line(this.ballDropLineGeo, dropLineMat);
    this.ballDropLine.renderOrder = 13;

    this.root.add(
      this.carSpeedArrow,
      this.carHeadingArrow,
      this.ballSpeedArrow,
      this.ballKickoffHalo,
      this.carGroundRing,
      this.ballGroundRing,
      this.carDropLine,
      this.ballDropLine
    );

    if (this.scene) this.scene.add(this.root);
  }

  public setVisible(visible: boolean): void {
    if (this.root) this.root.visible = Boolean(visible);
  }

  public update(shot: any, editSubMode = 'car-heading', isPlayPreLaunch = false): void {
    this.updateFromShot(shot, {
      isEditMode: !isPlayPreLaunch && editSubMode !== 'play',
      editSubMode: editSubMode === 'play' ? 'car-heading' : editSubMode,
      showPlayArrows: Boolean(isPlayPreLaunch),
    });
  }

  public updateFromShot(shot: any, options: StaticTrainingVisualUpdateOptions = {}): void {
    if (!shot || !this.root) {
      this.setVisible(false);
      return;
    }

    const { isEditMode = false, editSubMode = 'car-heading', showPlayArrows = false } = options;
    if (!isEditMode && !showPlayArrows) {
      this.setVisible(false);
      return;
    }

    this.setVisible(true);

    const tuner =
      useStaticTrainingBallCamTunerStore?.getState?.() ?? DEFAULT_STATIC_TRAINING_BALL_CAM_CONFIG;

    const car = shot.car || {};
    const ball = shot.ball || {};
    const carLoc = car.location || car.pos || [0, -2400, 17.05];
    const ballLoc = ball.location || ball.pos || [0, 0, 93.15];

    const heightOffset = tuner.arrowHeightOffset ?? 32;
    const forwardOffset = tuner.arrowForwardOffset ?? 18;
    const baseLength = tuner.arrowBaseLength ?? 155;
    const maxExtraLength = tuner.arrowMaxExtraLength ?? 300;

    const carBasePosThree = new THREE.Vector3(carLoc[0], carLoc[2] + heightOffset, carLoc[1]);
    const ballPosThree = new THREE.Vector3(ballLoc[0], ballLoc[2], ballLoc[1]);

    const chPitch = car.snapToGround ? 0 : Number(car.headingPitch) || 0;
    const chYaw = Number(car.headingYaw) || 0;
    const carHeadingDirThree = new THREE.Vector3(
      Math.cos(chPitch) * Math.cos(chYaw),
      Math.sin(chPitch),
      Math.cos(chPitch) * Math.sin(chYaw)
    );

    const followsHeading = car.speedFollowsHeading !== false;
    const csPitch = followsHeading ? chPitch : Number(car.speedPitch ?? car.headingPitch) || 0;
    const csYaw = followsHeading ? chYaw : Number(car.speedYaw ?? car.headingYaw) || 0;
    const carSpeedDirThree = new THREE.Vector3(
      Math.cos(csPitch) * Math.cos(csYaw),
      Math.sin(csPitch),
      Math.cos(csPitch) * Math.sin(csYaw)
    );

    const bsPitch = Number(ball.speedPitch) || 0;
    const bsYaw = Number(ball.speedYaw) || 0;
    const ballSpeedDirThree = new THREE.Vector3(
      Math.cos(bsPitch) * Math.cos(bsYaw),
      Math.sin(bsPitch),
      Math.cos(bsPitch) * Math.sin(bsYaw)
    );

    const carSpeedVal = Number(car.speed) || 0;
    if (isEditMode) {
      this.carSpeedArrow.visible =
        carSpeedVal > 0 || editSubMode === 'car-speed' || editSubMode === 'free-cam';
      const speedOrigin = carBasePosThree.clone().addScaledVector(carSpeedDirThree, forwardOffset);
      const arrowLen = baseLength + (carSpeedVal / 2300) * maxExtraLength;
      update3DArrowMesh(
        this.carSpeedArrow,
        speedOrigin,
        carSpeedDirThree,
        arrowLen,
        editSubMode === 'car-speed' || (editSubMode === 'car-heading' && carSpeedVal > 0)
      );
    } else if (showPlayArrows) {
      this.carSpeedArrow.visible = true;
      const effectiveDir = carSpeedVal > 1 ? carSpeedDirThree : carHeadingDirThree;
      const speedOrigin = carBasePosThree.clone().addScaledVector(effectiveDir, forwardOffset);
      const arrowLen =
        carSpeedVal > 1 ? baseLength + (carSpeedVal / 2300) * maxExtraLength : baseLength + 15;
      update3DArrowMesh(this.carSpeedArrow, speedOrigin, effectiveDir, arrowLen, true);
    } else {
      this.carSpeedArrow.visible = false;
    }

    if (isEditMode) {
      this.carHeadingArrow.visible = true;
      const headingOrigin = carBasePosThree
        .clone()
        .addScaledVector(carHeadingDirThree, forwardOffset);
      update3DArrowMesh(
        this.carHeadingArrow,
        headingOrigin,
        carHeadingDirThree,
        baseLength + 30,
        editSubMode === 'car-heading'
      );
    } else {
      this.carHeadingArrow.visible = false;
    }

    const ballSpeedVal = Number(ball.speed) || 0;
    if (isEditMode) {
      this.ballSpeedArrow.visible =
        !ball.kickoffState && (ballSpeedVal > 0 || editSubMode === 'ball-speed');
      const bLen = baseLength + (ballSpeedVal / 4000) * (maxExtraLength + 60);
      update3DArrowMesh(
        this.ballSpeedArrow,
        ballPosThree,
        ballSpeedDirThree,
        bLen,
        editSubMode === 'ball-speed'
      );
    } else {
      this.ballSpeedArrow.visible = false;
    }

    this.ballKickoffHalo.visible = Boolean(ball.kickoffState);
    if (this.ballKickoffHalo.visible) this.ballKickoffHalo.position.copy(ballPosThree);

    const showFootprints = Boolean(isEditMode);
    this.carGroundRing.visible = showFootprints;
    this.ballGroundRing.visible = showFootprints;
    this.carDropLine.visible = showFootprints;
    this.ballDropLine.visible = showFootprints;

    if (showFootprints) {
      this.carGroundRing.position.set(carLoc[0], 3, carLoc[1]);
      this.ballGroundRing.position.set(ballLoc[0], 3, ballLoc[1]);

      const carLinePos = this.carDropLineGeo.attributes.position as THREE.BufferAttribute;
      carLinePos.setXYZ(0, carLoc[0], 3, carLoc[1]);
      carLinePos.setXYZ(1, carLoc[0], carLoc[2], carLoc[1]);
      carLinePos.needsUpdate = true;

      const ballLinePos = this.ballDropLineGeo.attributes.position as THREE.BufferAttribute;
      ballLinePos.setXYZ(0, ballLoc[0], 3, ballLoc[1]);
      ballLinePos.setXYZ(1, ballLoc[0], ballLoc[2], ballLoc[1]);
      ballLinePos.needsUpdate = true;
    }
  }

  public dispose(): void {
    if (this.root && this.scene) this.scene.remove(this.root);
  }
}
