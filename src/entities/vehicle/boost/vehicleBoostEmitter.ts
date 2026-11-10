import * as THREE from 'three';
import { boostParticleRuntimeConfig } from '../../../ui-core/config/vehicleTunerConfig.ts';
import { ARCADE_DRIVE_COUNT, ARCADE_TRAIL_COUNT, ARCADE_BOOST_COLOR_HEX } from './boostCurves.ts';
import { ArcadeBoostParticleMesh } from './ArcadeBoostParticleMesh.ts';
import {
  createArcadeBoostFlameConeGeometry,
  createArcadeBoostFlameConeMaterial,
  createNozzleFlash,
} from './arcadeConeVisual.ts';
import { RealisticBoostEmitter } from './realisticBoostEmitter.ts';
import { ArcadeParticlePhysics } from './arcadeParticlePhysics.ts';
import {
  applyNozzleOffsetToVector,
  cloneOrCreateNozzleVector,
  disposeBoostSceneObject,
  resolveActiveBoostTheme,
  stepEmitterParticlePhysics,
  syncBoostNozzleAttachments,
  updateBoostConeMaterials,
  updateBoostGlintMesh,
  type NozzleOffsetInput,
} from './boostEmitterPipeline.ts';

export class VehicleBoostEmitter {
  public _scratchWorldNozzle: THREE.Vector3;
  public boostVisualOverride: string | null;
  public car: THREE.Object3D;
  public cone: THREE.Group;
  public coneMaterials: THREE.ShaderMaterial[];
  public coneOpacity: number;
  public drive: ArcadeBoostParticleMesh;
  public elapsed: number;
  public goldRush: RealisticBoostEmitter;
  public light: THREE.PointLight | null;
  public nozzleFlash:
    | THREE.Points<THREE.BufferGeometry, THREE.ShaderMaterial>
    | THREE.Mesh<THREE.BufferGeometry, THREE.ShaderMaterial>
    | null;
  public nozzleLocal: THREE.Vector3;
  public offset: THREE.Vector3;
  public physics: ArcadeParticlePhysics;
  public scene: THREE.Scene | THREE.Object3D;
  public theme: string;
  public trail: ArcadeBoostParticleMesh;

  setSpatial(_isSpatial: boolean): void {}

  constructor(
    scene: THREE.Scene | THREE.Object3D,
    carRoot: THREE.Object3D,
    nozzleLocal: THREE.Vector3,
    _isPrimary = true,
    isBot = false
  ) {
    this.scene = scene;
    this.car = carRoot;
    this.nozzleLocal = cloneOrCreateNozzleVector(nozzleLocal);
    this.offset = this.nozzleLocal;
    this.cone = new THREE.Group();
    this.coneMaterials = [];
    this.nozzleFlash = null;
    this.light = null;

    this.theme = 'gold-rush';
    this.boostVisualOverride = null;
    this.elapsed = 0;
    this.coneOpacity = 0;

    this.drive = new ArcadeBoostParticleMesh(ARCADE_DRIVE_COUNT, true, 5);
    this.drive.attachTo(carRoot, 'cartoon-drive-puffs');

    this.trail = new ArcadeBoostParticleMesh(ARCADE_TRAIL_COUNT, false, 4);
    this.trail.attachTo(scene, 'cartoon-boost-trail');

    this.physics = new ArcadeParticlePhysics(this.drive, this.trail, this.nozzleLocal);

    this.cone.position.copy(this.nozzleLocal);
    this.cone.layers.enable(1);
    this.cone.visible = false;
    this.cone.name = 'boost-flame';
    carRoot.add(this.cone);

    const flameMat = createArcadeBoostFlameConeMaterial();
    const flameMesh = new THREE.Mesh(createArcadeBoostFlameConeGeometry(11), flameMat);
    flameMesh.name = 'boost-flame-mesh';
    flameMesh.castShadow = false;
    flameMesh.receiveShadow = false;
    flameMesh.layers.enable(1);
    flameMesh.frustumCulled = false;
    this.coneMaterials.push(flameMat);
    this.cone.add(flameMesh);

    const flashPos = this.nozzleLocal.clone();
    flashPos.x -= 2;
    this.nozzleFlash = createNozzleFlash(flashPos);
    this.nozzleFlash.name = 'boost-nozzle-flash';
    this.nozzleFlash.castShadow = false;
    this.nozzleFlash.receiveShadow = false;
    this.nozzleFlash.layers.enable(1);
    this.nozzleFlash.visible = false;
    carRoot.add(this.nozzleFlash);

    if (!isBot) {
      const flameColor = new THREE.Color(ARCADE_BOOST_COLOR_HEX);
      this.light = new THREE.PointLight(flameColor, 0, 300, 2);
      this.light.castShadow = false;
      const lightPos = this.nozzleLocal.clone();
      lightPos.x -= 10;
      this.light.position.copy(lightPos);
      scene.add(this.light);
    }

    this.goldRush = new RealisticBoostEmitter(scene, carRoot, this.nozzleLocal, this.light);
    this._scratchWorldNozzle = new THREE.Vector3();
  }

  _syncNozzlePositions(): void {
    syncBoostNozzleAttachments(
      this.nozzleLocal,
      this.cone,
      this.nozzleFlash,
      this.light,
      this.scene,
      this.car
    );
    this.goldRush._syncNozzlePositions();
  }

  setNozzleOffset(xOrVec: NozzleOffsetInput, y?: number, z?: number): void {
    applyNozzleOffsetToVector(this.nozzleLocal, xOrVec, y, z);
    this._syncNozzlePositions();
    this.physics.hasPreviousNozzle = false;
    this.goldRush.setNozzleOffset(this.nozzleLocal);
  }

  setBoostVisual(theme: string | null | undefined): void {
    this.boostVisualOverride = theme === 'cartoon' || theme === 'gold-rush' ? theme : null;
  }

  get bloomActive(): boolean {
    if (!boostParticleRuntimeConfig.bloomEnabled) return false;
    if (this.theme === 'gold-rush') {
      return this.goldRush.bloomActive;
    }
    return (
      this.coneOpacity > 0.002 ||
      this.physics.driveParticlesActive ||
      this.physics.trailParticlesActive
    );
  }

  async preload(): Promise<void> {
    await this.goldRush.preload();
  }

  disposeAudio(): void {}

  update(
    boosting: boolean,
    driving: boolean,
    visible: boolean,
    dt: number,
    _isFocused = true
  ): void {
    this._syncNozzlePositions();
    const isBoosting = boosting && visible;
    const isDriving = driving && !boosting && visible;
    this.elapsed += dt;

    const currentTheme = resolveActiveBoostTheme(this.boostVisualOverride);
    if (this.theme !== currentTheme) {
      this.resetVisual();
      this.theme = currentTheme;
    }

    if (currentTheme === 'gold-rush') {
      this.goldRush.update(boosting, driving, visible, dt);
      return;
    }

    if (this.light) {
      this.light.color.setHex(ARCADE_BOOST_COLOR_HEX);
    }

    const dampSpeed = isBoosting ? 28 : 16;
    this.coneOpacity = THREE.MathUtils.damp(this.coneOpacity, isBoosting ? 1 : 0, dampSpeed, dt);
    const coneVisible = this.coneOpacity > 0.002;
    this.cone.visible = coneVisible;

    updateBoostConeMaterials(this.coneMaterials, this.elapsed, this.coneOpacity);
    updateBoostGlintMesh(this.nozzleFlash, coneVisible, this.coneOpacity);

    if (this.light) {
      this.light.intensity = boostParticleRuntimeConfig.pointLightEnabled
        ? this.coneOpacity * (380 + 25 * Math.sin(this.elapsed * 24))
        : 0;
    }

    const isPausedBoost = stepEmitterParticlePhysics(
      this.physics,
      this.car,
      this.nozzleLocal,
      this._scratchWorldNozzle,
      isDriving,
      isBoosting,
      dt
    );

    if (this.physics.driveParticlesActive) {
      const active = isPausedBoost ? true : this.physics.updateDrive(dt);
      this.drive.setVisible(active);
      this.drive.markDirty();
    }

    if (this.physics.trailParticlesActive) {
      const active = isPausedBoost ? true : this.physics.updateTrail(dt);
      this.trail.setVisible(active);
      this.trail.markDirty();
    }
  }

  resetVisual(): void {
    this.physics.reset();
    this.goldRush.reset();
    this.coneOpacity = 0;
    this.cone.visible = false;
    if (this.nozzleFlash) this.nozzleFlash.visible = false;
    if (this.light) this.light.intensity = 0;
  }

  reset(): void {
    this.physics.reset();
    this.goldRush.reset();
    this.coneOpacity = 0;
    this.cone.visible = false;
    if (this.nozzleFlash) this.nozzleFlash.visible = false;
    if (this.light) this.light.intensity = 0;
  }

  dispose(): void {
    this.resetVisual();
    this.goldRush.dispose();
    this.trail.dispose(this.scene);
    this.drive.dispose(this.car);
    disposeBoostSceneObject(this.cone, this.car);
    disposeBoostSceneObject(this.nozzleFlash, this.car);
    if (this.light) {
      if (this.light.parent) {
        this.light.parent.remove(this.light);
      } else {
        this.scene.remove(this.light);
      }
    }
  }
}
