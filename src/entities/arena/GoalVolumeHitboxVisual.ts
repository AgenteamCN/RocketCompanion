import * as THREE from 'three';
import { BALL_COLLISION_RADIUS } from '../../physics/RocketSimConstants.ts';
import {
  getGoalVolumeTunerConfig,
  getGoalVolumeBoxForPreset,
  registerGoalVolumeTunerApplier,
} from '../../ui-core/config/goalVolumeTunerConfig.ts';

const BLUE_OUTER_COLOR = 0x38bdf8;
const BLUE_INNER_COLOR = 0x22d3ee;
const ORANGE_OUTER_COLOR = 0xfb923c;
const ORANGE_INNER_COLOR = 0xfacc15;

function createGoalBoxObjects(signY, outerHex, innerHex) {
  const root = new THREE.Group();

  const unitBoxGeom = new THREE.BoxGeometry(1, 1, 1);
  const unitEdgesGeom = new THREE.EdgesGeometry(unitBoxGeom);

  const outerVolumeMat = new THREE.MeshBasicMaterial({
    color: outerHex,
    transparent: true,
    opacity: 0.08,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
  const outerWireMat = new THREE.LineBasicMaterial({
    color: outerHex,
    transparent: true,
    opacity: 0.85,
    depthWrite: false,
  });

  const innerVolumeMat = new THREE.MeshBasicMaterial({
    color: innerHex,
    transparent: true,
    opacity: 0.14,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
  const innerWireMat = new THREE.LineBasicMaterial({
    color: innerHex,
    transparent: true,
    opacity: 0.95,
    depthWrite: false,
  });

  const outerMesh = new THREE.Mesh(unitBoxGeom, outerVolumeMat);
  const outerLines = new THREE.LineSegments(unitEdgesGeom, outerWireMat);
  outerMesh.renderOrder = 3;
  outerLines.renderOrder = 4;

  const innerMesh = new THREE.Mesh(unitBoxGeom, innerVolumeMat);
  const innerLines = new THREE.LineSegments(unitEdgesGeom, innerWireMat);
  innerMesh.renderOrder = 4;
  innerLines.renderOrder = 5;

  root.add(outerMesh, outerLines, innerMesh, innerLines);

  return {
    signY,
    root,
    unitBoxGeom,
    unitEdgesGeom,
    outerVolumeMat,
    outerWireMat,
    innerVolumeMat,
    innerWireMat,
    outerMesh,
    outerLines,
    innerMesh,
    innerLines,
  };
}

function updateGoalBoxTransform(goalObj, cfg) {
  const { signY, outerMesh, outerLines, innerMesh, innerLines } = goalObj;
  const r = cfg.ballRadius ?? BALL_COLLISION_RADIUS;
  const margin = cfg.isThrowback || cfg.enabled ? 0.25 * r : 0.0;

  const outerWidthX = cfg.halfWidthX * 2.0;
  const outerHeightY = Math.max(1.0, cfg.maxZ - cfg.minZ);
  const outerDepthZ = Math.max(1.0, cfg.maxY - cfg.minY);
  const outerCenterX = 0.0;
  const outerCenterY = (cfg.minZ + cfg.maxZ) * 0.5;
  const outerCenterZ = signY * ((cfg.minY + cfg.maxY) * 0.5);

  outerMesh.scale.set(outerWidthX, outerHeightY, outerDepthZ);
  outerMesh.position.set(outerCenterX, outerCenterY, outerCenterZ);
  outerLines.scale.copy(outerMesh.scale);
  outerLines.position.copy(outerMesh.position);

  const innerHalfWidthX = Math.max(10.0, cfg.halfWidthX - margin);
  const innerMinY = cfg.minY + r;
  const innerMaxY = Math.max(innerMinY + 10.0, cfg.maxY);
  const innerMinZ = cfg.minZ;
  const innerMaxZ = Math.max(innerMinZ + 10.0, cfg.maxZ - margin);

  const innerWidthX = innerHalfWidthX * 2.0;
  const innerHeightY = Math.max(1.0, innerMaxZ - innerMinZ);
  const innerDepthZ = Math.max(1.0, innerMaxY - innerMinY);
  const innerCenterX = 0.0;
  const innerCenterY = (innerMinZ + innerMaxZ) * 0.5;
  const innerCenterZ = signY * ((innerMinY + innerMaxY) * 0.5);

  innerMesh.scale.set(innerWidthX, innerHeightY, innerDepthZ);
  innerMesh.position.set(innerCenterX, innerCenterY, innerCenterZ);
  innerLines.scale.copy(innerMesh.scale);
  innerLines.position.copy(innerMesh.position);
}

export type GoalBoxObjects = ReturnType<typeof createGoalBoxObjects>;

export interface CustomGoalVolumeBox {
  enabled?: boolean;
  halfWidthX: number;
  minY: number;
  maxY: number;
  minZ?: number;
  maxZ: number;
}

export class GoalVolumeHitboxVisual {
  public isThrowback: boolean;
  public _unsubTuner: (() => void) | null;
  public blueGoal: GoalBoxObjects;
  public group: THREE.Group;
  public orangeGoal: GoalBoxObjects;

  constructor() {
    this.group = new THREE.Group();
    this.group.name = 'GoalVolumeHitboxVisual';
    this.group.visible = Boolean(getGoalVolumeTunerConfig().showHitboxVisual);

    this.isThrowback = false;
    this.blueGoal = createGoalBoxObjects(-1, BLUE_OUTER_COLOR, BLUE_INNER_COLOR);
    this.orangeGoal = createGoalBoxObjects(1, ORANGE_OUTER_COLOR, ORANGE_INNER_COLOR);

    this.group.add(this.blueGoal.root, this.orangeGoal.root);
    this.setArenaPreset(false);

    const weakThis = new WeakRef(this);
    this._unsubTuner = registerGoalVolumeTunerApplier((cfg) => {
      const self = weakThis.deref();
      if (!self) return;
      self.group.visible = Boolean(cfg.showHitboxVisual);
      self.setArenaPreset(self.isThrowback);
    });
  }

  setArenaPreset(isThrowback = false, customBox: CustomGoalVolumeBox | null = null) {
    this.isThrowback = Boolean(isThrowback);
    const base = customBox || getGoalVolumeBoxForPreset(this.isThrowback);
    const cfg = {
      isThrowback: this.isThrowback,
      enabled: Boolean(base.enabled),
      halfWidthX: base.halfWidthX,
      minY: base.minY,
      maxY: base.maxY,
      minZ: base.minZ ?? 0.0,
      maxZ: base.maxZ,
      ballRadius: BALL_COLLISION_RADIUS,
    };
    updateGoalBoxTransform(this.blueGoal, cfg);
    updateGoalBoxTransform(this.orangeGoal, cfg);
  }

  setVisible(visible) {
    this.group.visible = Boolean(visible);
  }

  dispose() {
    this._unsubTuner?.();
    this._unsubTuner = null;
    for (const g of [this.blueGoal, this.orangeGoal]) {
      if (!g) continue;
      g.unitBoxGeom?.dispose?.();
      g.unitEdgesGeom?.dispose?.();
      g.outerVolumeMat?.dispose?.();
      g.outerWireMat?.dispose?.();
      g.innerVolumeMat?.dispose?.();
      g.innerWireMat?.dispose?.();
    }
  }
}
