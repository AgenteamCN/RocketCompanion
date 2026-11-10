/**
 * KickoffGhostVisuals.ts
 * Renders the isolated PPO AI Ghost Car, Ghost Ball, and Ghost Ball Trajectory inside the primary
 * Three.js arena scene without duplicating any stadium geometry or colliding with the player.
 */

import * as THREE from 'three';
import {
  type VehicleAssetStore,
  type VehicleLoaderCallbacks,
} from '../../entities/arena/VehicleFactory.ts';
import { updateCarSuspensionAndSteering } from '../../entities/VehicleSuspensionSystem.ts';
import { unrealToThreeCoords } from '../../entities/arena/ArenaMath.ts';
import { SpeedTrail } from '../../entities/SpeedTrail.ts';
import { CarStateView, BallStateView } from '../../physics/RocketSimStateViews.ts';
import {
  applyPaletteToGhostMaterials,
  buildHolographicGhostBallAndRing,
  buildHolographicGhostCarHierarchy,
  GHOST_WORLD_PALETTES,
  interpolateSignedTransform,
  type GhostSuspensionList,
  type GhostWheelMountList,
  type GhostWheelSpecList,
} from './shared/ghostWorldVisualsPipeline.ts';

const MAX_TRAJECTORY_POINTS = 240;

export type GhostPlacementMode = 'same' | 'opposite';
export type { GhostWheelMountList, GhostWheelSpecList, GhostSuspensionList };

export interface KickoffGhostArenaPort {
  scene?: THREE.Scene | null;
  camera?: THREE.Camera | null;
  vehicleRegistry?: {
    assets?: VehicleAssetStore;
    carLoaders?: VehicleLoaderCallbacks & {
      wheelSpecs?: { game?: GhostWheelSpecList };
    };
  } | null;
  onRenderTreeChanged?: () => void;
}

export class KickoffGhostVisuals {
  public arena: KickoffGhostArenaPort | null;
  public scene: THREE.Scene | null;

  public ghostCarRoot: THREE.Group | null = null;
  public ghostCarMaterials: THREE.MeshStandardMaterial[] = [];
  public ghostCarLineMaterials: THREE.LineBasicMaterial[] = [];
  public ghostCarWheels: GhostWheelMountList = [];
  public ghostCarWheelSpecs: GhostWheelSpecList = [];
  public ghostCarSuspension: GhostSuspensionList = [];
  public ghostWheelSpin: number[] = [0, 0, 0, 0];
  public ghostBoostPlume: THREE.Mesh<THREE.ConeGeometry, THREE.MeshBasicMaterial> | null = null;

  public ghostBallMesh: THREE.Mesh<THREE.BufferGeometry, THREE.MeshStandardMaterial> | null = null;
  public ghostBallRing: THREE.Mesh<THREE.RingGeometry, THREE.MeshBasicMaterial> | null = null;
  public ghostBallTrail: SpeedTrail | null = null;
  public ghostTrajectoryLine: THREE.Line<THREE.BufferGeometry, THREE.LineBasicMaterial> | null =
    null;
  public ghostTrajectoryPositions = new Float32Array(MAX_TRAJECTORY_POINTS * 3);
  public ghostTrajectoryCount = 0;
  public rawBallTrajectoryPoints: Array<[number, number, number]> = [];

  public ghostPlacement: GhostPlacementMode = 'same';
  public showCar = true;
  public showBall = true;
  public visible = false;

  private readonly _prevCarView = new CarStateView();
  private readonly _currCarView = new CarStateView();
  private readonly _prevBallView = new BallStateView();
  private readonly _currBallView = new BallStateView();
  private readonly _pA = new THREE.Vector3();
  private readonly _velVec = new THREE.Vector3();

  constructor(arena: KickoffGhostArenaPort | null) {
    this.arena = arena;
    this.scene = arena?.scene || null;
  }

  public ensureBuilt(): void {
    if (this.ghostCarRoot || !this.arena?.scene) return;
    const scene = this.arena.scene as THREE.Scene;
    this.scene = scene;
    const palette = GHOST_WORLD_PALETTES[0];

    const builtCar = buildHolographicGhostCarHierarchy({
      name: 'kickoff-ghost-car',
      visual: 'fennec',
      palette,
      opacity: 0.44,
      lineOpacity: 0.65,
      plumeOpacity: 0.65,
      registry: this.arena.vehicleRegistry,
    });
    this.ghostCarRoot = builtCar.root;
    this.ghostCarMaterials = builtCar.materials;
    this.ghostCarLineMaterials = builtCar.lineMaterials;
    this.ghostCarWheels = builtCar.wheels;
    this.ghostCarWheelSpecs = builtCar.wheelSpecs;
    this.ghostBoostPlume = builtCar.boostPlume;
    scene.add(this.ghostCarRoot);

    const builtBall = buildHolographicGhostBallAndRing({
      name: 'kickoff-ghost-ball',
      palette,
      ballOpacity: 0.38,
      ringOpacity: 0.42,
    });
    this.ghostBallMesh = builtBall.ballMesh;
    this.ghostBallRing = builtBall.ballRing;
    scene.add(this.ghostBallMesh, this.ghostBallRing);

    this.ghostBallTrail = new SpeedTrail();
    if (this.ghostBallTrail.material?.uniforms?.uColor) {
      this.ghostBallTrail.material.uniforms.uColor.value.setHex(palette.mainHex);
    }
    scene.add(this.ghostBallTrail.object);

    const lineGeo = new THREE.BufferGeometry();
    lineGeo.setAttribute('position', new THREE.BufferAttribute(this.ghostTrajectoryPositions, 3));
    lineGeo.setDrawRange(0, 0);
    const lineMat = new THREE.LineBasicMaterial({
      color: palette.mainHex,
      transparent: true,
      opacity: 0.72,
      depthTest: true,
      depthWrite: false,
    });
    this.ghostTrajectoryLine = new THREE.Line(lineGeo, lineMat);
    this.ghostTrajectoryLine.renderOrder = 0.05;
    this.ghostTrajectoryLine.frustumCulled = false;
    this.ghostTrajectoryLine.userData = { bloomOccluder: false };
    scene.add(this.ghostTrajectoryLine);

    this._applyPlacementTint();
    this.setVisible(this.visible);
    this.arena.onRenderTreeChanged?.();
  }

  private _applyPlacementTint(): void {
    const palette =
      this.ghostPlacement === 'opposite' ? GHOST_WORLD_PALETTES[1] : GHOST_WORLD_PALETTES[0];
    applyPaletteToGhostMaterials(
      palette,
      this.ghostCarMaterials,
      this.ghostCarLineMaterials,
      this.ghostBoostPlume,
      this.ghostBallMesh,
      this.ghostBallRing
    );
    if (this.ghostBallTrail?.material?.uniforms?.uColor) {
      this.ghostBallTrail.material.uniforms.uColor.value.setHex(palette.mainHex);
    }
    if (this.ghostTrajectoryLine?.material) {
      this.ghostTrajectoryLine.material.color.setHex(palette.mainHex);
    }
  }

  public setGhostPlacement(placement: string = 'same'): void {
    const next: GhostPlacementMode = placement === 'opposite' ? 'opposite' : 'same';
    if (this.ghostPlacement === next) return;
    this.ghostPlacement = next;
    this._applyPlacementTint();
    this.ghostBallTrail?.reset?.();
    this._rebuildTrajectoryBuffer();
  }

  public setVisible(visible: boolean): void {
    this.visible = Boolean(visible);
    const carVis = this.visible && this.showCar;
    const ballVis = this.visible && this.showBall;

    if (this.ghostCarRoot) this.ghostCarRoot.visible = carVis;
    if (this.ghostBallMesh) this.ghostBallMesh.visible = ballVis;
    if (this.ghostBallRing) this.ghostBallRing.visible = ballVis;
    if (this.ghostBallTrail?.object) this.ghostBallTrail.object.visible = ballVis;
    if (this.ghostTrajectoryLine) this.ghostTrajectoryLine.visible = ballVis;
  }

  public setEntityVisibility(showCar: boolean, showBall: boolean): void {
    this.showCar = Boolean(showCar);
    this.showBall = Boolean(showBall);
    this.setVisible(this.visible);
  }

  public resetTrail(): void {
    this.ghostBallTrail?.reset?.();
    this.ghostTrajectoryCount = 0;
    this.rawBallTrajectoryPoints = [];
    if (this.ghostTrajectoryLine?.geometry) {
      this.ghostTrajectoryLine.geometry.setDrawRange(0, 0);
    }
  }

  private _rebuildTrajectoryBuffer(): void {
    if (!this.ghostTrajectoryLine) return;
    const xySign = this.ghostPlacement === 'opposite' ? -1.0 : 1.0;
    const count = Math.min(this.rawBallTrajectoryPoints.length, MAX_TRAJECTORY_POINTS);
    for (let i = 0; i < count; i++) {
      const pt = this.rawBallTrajectoryPoints[i];
      unrealToThreeCoords(this._pA, pt[0] * xySign, pt[1] * xySign, pt[2]);
      const idx = i * 3;
      this.ghostTrajectoryPositions[idx] = this._pA.x;
      this.ghostTrajectoryPositions[idx + 1] = this._pA.y;
      this.ghostTrajectoryPositions[idx + 2] = this._pA.z;
    }
    this.ghostTrajectoryCount = count;
    const attr = this.ghostTrajectoryLine.geometry.getAttribute('position');
    if (attr) attr.needsUpdate = true;
    this.ghostTrajectoryLine.geometry.setDrawRange(0, this.ghostTrajectoryCount);
  }

  public recordBallTrajectoryPoint(ballStateView: BallStateView | null | undefined): void {
    if (!this.ghostTrajectoryLine || !ballStateView) return;
    const speed = Math.hypot(ballStateView.velX, ballStateView.velY, ballStateView.velZ);
    if (speed < 5.0 || this.ghostTrajectoryCount >= MAX_TRAJECTORY_POINTS) return;

    const xySign = this.ghostPlacement === 'opposite' ? -1.0 : 1.0;
    unrealToThreeCoords(
      this._pA,
      ballStateView.posX * xySign,
      ballStateView.posY * xySign,
      ballStateView.posZ
    );

    const idx = this.ghostTrajectoryCount * 3;
    if (this.ghostTrajectoryCount > 0) {
      const prevIdx = (this.ghostTrajectoryCount - 1) * 3;
      const dx = this._pA.x - this.ghostTrajectoryPositions[prevIdx];
      const dy = this._pA.y - this.ghostTrajectoryPositions[prevIdx + 1];
      const dz = this._pA.z - this.ghostTrajectoryPositions[prevIdx + 2];
      if (dx * dx + dy * dy + dz * dz < 900) return;
    }

    this.rawBallTrajectoryPoints.push([ballStateView.posX, ballStateView.posY, ballStateView.posZ]);
    this.ghostTrajectoryPositions[idx] = this._pA.x;
    this.ghostTrajectoryPositions[idx + 1] = this._pA.y;
    this.ghostTrajectoryPositions[idx + 2] = this._pA.z;
    this.ghostTrajectoryCount++;

    const attr = this.ghostTrajectoryLine.geometry.getAttribute('position');
    if (attr) attr.needsUpdate = true;
    this.ghostTrajectoryLine.geometry.setDrawRange(0, this.ghostTrajectoryCount);
  }

  public update(
    prevState: Float32Array | null | undefined,
    currState: Float32Array | null | undefined,
    alpha: number,
    dt: number,
    ghostControls?: { throttle?: number } | null
  ): void {
    this.ensureBuilt();
    if (!this.visible || !prevState || !currState) return;

    const xySign = this.ghostPlacement === 'opposite' ? -1.0 : 1.0;
    const prevCar = this._prevCarView.attachCar(prevState, 0);
    const currCar = this._currCarView.attachCar(currState, 0);
    const prevBall = this._prevBallView.attach(prevState);
    const currBall = this._currBallView.attach(currState);

    if (this.ghostCarRoot && this.showCar) {
      interpolateSignedTransform(this.ghostCarRoot, prevCar, currCar, alpha, xySign);

      updateCarSuspensionAndSteering(
        this.ghostCarWheels,
        this.ghostCarWheelSpecs,
        this.ghostCarSuspension,
        this.ghostWheelSpin,
        currCar,
        'fennec',
        dt,
        ghostControls?.throttle ?? 0
      );

      if (this.ghostBoostPlume) {
        const boosting = Boolean(currCar.isBoosting && currCar.boost > 0);
        this.ghostBoostPlume.visible = boosting;
        if (boosting) {
          const pulse = 0.85 + 0.3 * Math.sin(performance.now() * 0.04);
          this.ghostBoostPlume.scale.set(pulse, 1, pulse);
        }
      }
    }

    if (this.ghostBallMesh && this.showBall) {
      interpolateSignedTransform(this.ghostBallMesh, prevBall, currBall, alpha, xySign);

      const ballSpeed = Math.hypot(currBall.velX, currBall.velY, currBall.velZ);
      if (this.ghostBallMesh.material) {
        this.ghostBallMesh.material.opacity = ballSpeed > 10 ? 0.52 : 0.16;
      }

      if (this.ghostBallRing) {
        const bp = this.ghostBallMesh.position;
        this.ghostBallRing.position.set(bp.x, 2.2, bp.z);
        this.ghostBallRing.visible = this.showBall && ballSpeed > 10;
      }

      unrealToThreeCoords(
        this._velVec,
        currBall.velX * xySign,
        currBall.velY * xySign,
        currBall.velZ
      );
      this.ghostBallTrail?.update(this.ghostBallMesh.position, this._velVec, dt);
      this.ghostBallTrail?.prepare(this.arena?.camera);
    }
  }

  public dispose(): void {
    if (this.scene) {
      if (this.ghostCarRoot) this.scene.remove(this.ghostCarRoot);
      if (this.ghostBallMesh) this.scene.remove(this.ghostBallMesh);
      if (this.ghostBallRing) this.scene.remove(this.ghostBallRing);
      if (this.ghostBallTrail?.object) this.scene.remove(this.ghostBallTrail.object);
      if (this.ghostTrajectoryLine) this.scene.remove(this.ghostTrajectoryLine);
    }
  }
}
