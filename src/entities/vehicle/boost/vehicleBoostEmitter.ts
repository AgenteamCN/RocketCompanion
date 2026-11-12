import * as THREE from 'three';
import { boostParticleRuntimeConfig } from '../../../ui-core/config/vehicleTunerConfig.ts';
import {
  normalizeHexColorString,
  performanceBoostRuntimeConfig,
  resolvePerformanceBoostEffectiveConfig,
  subscribePerformanceBoostConfig,
  type PerformanceBoostColorParams,
  type PerformanceBoostConfig,
} from '../../../ui-core/config/performanceBoostConfig.ts';
import { ARCADE_DRIVE_COUNT, ARCADE_TRAIL_COUNT, ARCADE_BOOST_COLOR_HEX } from './boostCurves.ts';
import { ArcadeBoostParticleMesh } from './ArcadeBoostParticleMesh.ts';
import {
  createArcadeBoostFlameConeGeometry,
  createArcadeBoostFlameConeMaterial,
  createNozzleFlash,
} from './arcadeConeVisual.ts';
import { RealisticBoostEmitter } from './realisticBoostEmitter.ts';
import { ArcadeParticlePhysics } from './arcadeParticlePhysics.ts';
import { PerformanceBoostAttachVisual } from './PerformanceBoostAttachVisual.ts';
import { PerformanceBoostTrailVisual } from './PerformanceBoostTrailVisual.ts';
import {
  applyNozzleOffsetToVector,
  cloneOrCreateNozzleVector,
  disposeBoostSceneObject,
  isPerformanceBoostTheme,
  resolveActiveBoostTheme,
  resolvePerformanceBoostModeForTheme,
  stepEmitterParticlePhysics,
  syncBoostNozzleAttachments,
  updateBoostConeMaterials,
  updateBoostGlintMesh,
  type NozzleOffsetInput,
} from './boostEmitterPipeline.ts';

export class VehicleBoostEmitter {
  public _scratchWorldNozzle: THREE.Vector3;
  public boostColorParams: PerformanceBoostColorParams | null;
  public boostVisualOverride: string | null;
  public car: THREE.Object3D;
  public carColorHex: string | null;
  public cone: THREE.Group;
  public coneMaterials: THREE.ShaderMaterial[];
  public coneOpacity: number;
  public drive: ArcadeBoostParticleMesh;
  public elapsed: number;
  public goldRush: RealisticBoostEmitter;
  public isBot: boolean;
  public isPrimary: boolean;
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

  public customAttach: PerformanceBoostAttachVisual | null = null;
  public customTrail: PerformanceBoostTrailVisual | null = null;
  private _perfMaterialDirty = true;
  private _unsubPerfConfig: (() => void) | null = null;

  setSpatial(_isSpatial: boolean): void {}

  constructor(
    scene: THREE.Scene | THREE.Object3D,
    carRoot: THREE.Object3D,
    nozzleLocal: THREE.Vector3,
    isPrimary = true,
    isBot = false
  ) {
    this.scene = scene;
    this.car = carRoot;
    this.isPrimary = Boolean(isPrimary);
    this.isBot = Boolean(isBot);
    this.carColorHex = null;
    this.boostColorParams = null;
    this.nozzleLocal = cloneOrCreateNozzleVector(nozzleLocal);
    this.offset = this.nozzleLocal;
    this.cone = new THREE.Group();
    this.coneMaterials = [];
    this.nozzleFlash = null;
    this.light = null;

    this.theme = 'light-wave';
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

    this._unsubPerfConfig = subscribePerformanceBoostConfig(() => {
      this._perfMaterialDirty = true;
      this._syncPerformanceVisualMaterials(this.theme);
    });
  }

  private _resolveEffectivePerfConfig(theme: string): PerformanceBoostConfig {
    return resolvePerformanceBoostEffectiveConfig(performanceBoostRuntimeConfig, {
      modeOverride: resolvePerformanceBoostModeForTheme(theme),
      isBot: this.isBot,
      carColorHex: this.carColorHex,
      colorParams: this.boostColorParams,
    });
  }

  private _syncPerformanceVisualMaterials(theme: string): void {
    if (!this.customAttach && !this.customTrail) return;
    const effectiveCfg = this._resolveEffectivePerfConfig(theme);
    this.customAttach?.syncConfig(effectiveCfg);
    this.customTrail?.syncConfig(effectiveCfg);
    this._perfMaterialDirty = false;
  }

  private _ensureCustomAttach(effectiveCfg: PerformanceBoostConfig): PerformanceBoostAttachVisual {
    if (!this.customAttach) {
      this.customAttach = new PerformanceBoostAttachVisual(this.car);
      this.customAttach.syncConfig(effectiveCfg);
    }
    return this.customAttach;
  }

  private _ensureCustomTrail(effectiveCfg: PerformanceBoostConfig): PerformanceBoostTrailVisual {
    if (!this.customTrail) {
      this.customTrail = new PerformanceBoostTrailVisual(this.scene as THREE.Scene);
      this.customTrail.syncConfig(effectiveCfg);
    }
    return this.customTrail;
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
    const nextOverride =
      theme === 'cartoon' ||
      theme === 'gold-rush' ||
      theme === 'light-beam' ||
      theme === 'light-wave' ||
      theme === 'custom'
        ? theme
        : null;
    if (this.boostVisualOverride !== nextOverride) {
      this.boostVisualOverride = nextOverride;
      this._perfMaterialDirty = true;
    }
  }

  setIsBot(isBot: boolean): void {
    const next = Boolean(isBot);
    if (this.isBot !== next) {
      this.isBot = next;
      this._perfMaterialDirty = true;
    }
  }

  setCarColor(colorInput: string | number | null | undefined): void {
    const nextHex =
      colorInput !== null && colorInput !== undefined
        ? normalizeHexColorString(colorInput, '#ff8811')
        : null;
    if (this.carColorHex !== nextHex) {
      this.carColorHex = nextHex;
      this._perfMaterialDirty = true;
    }
  }

  setBoostColorParams(params: PerformanceBoostColorParams | null | undefined): void {
    this.boostColorParams = params ?? null;
    this._perfMaterialDirty = true;
  }

  get bloomActive(): boolean {
    if (isPerformanceBoostTheme(this.theme)) return false;
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
    _isFocused = true,
    cameraPos: THREE.Vector3 | null = null
  ): void {
    this._syncNozzlePositions();
    const isBoosting = boosting && visible;
    const isDriving = driving && !boosting && visible;
    this.elapsed += dt;

    const currentTheme = resolveActiveBoostTheme(this.boostVisualOverride);
    if (this.theme !== currentTheme) {
      this.resetVisual();
      this.theme = currentTheme;
      this._perfMaterialDirty = true;
    }

    if (isPerformanceBoostTheme(currentTheme)) {
      if (this.light) this.light.intensity = 0;
      const cfg = this._resolveEffectivePerfConfig(currentTheme);

      if (cfg.mergeCenterNozzle && !this.isPrimary) {
        this.customAttach?.reset();
        this.customTrail?.reset();
        return;
      }

      if (this._perfMaterialDirty) {
        this._syncPerformanceVisualMaterials(currentTheme);
      }

      if (cfg.mode === 'attach') {
        this.customTrail?.reset();
        const attach = this._ensureCustomAttach(cfg);
        attach.step(dt, isBoosting, this.nozzleLocal, cfg);
      } else {
        this.customAttach?.reset();
        const trail = this._ensureCustomTrail(cfg);
        if (typeof this.car.updateMatrixWorld === 'function') {
          this.car.updateMatrixWorld();
        }
        const nz = cfg.mergeCenterNozzle ? 0 : this.nozzleLocal.z;
        this._scratchWorldNozzle.set(this.nozzleLocal.x, this.nozzleLocal.y, nz);
        if (typeof this.car.localToWorld === 'function') {
          this.car.localToWorld(this._scratchWorldNozzle);
        }
        trail.step(dt, isBoosting, this._scratchWorldNozzle, cameraPos, cfg);
      }
      return;
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
    this.customAttach?.reset();
    this.customTrail?.reset();
    this.coneOpacity = 0;
    this.cone.visible = false;
    if (this.nozzleFlash) this.nozzleFlash.visible = false;
    if (this.light) this.light.intensity = 0;
  }

  reset(): void {
    this.resetVisual();
  }

  dispose(): void {
    this.resetVisual();
    this._unsubPerfConfig?.();
    this._unsubPerfConfig = null;
    this.customAttach?.dispose();
    this.customAttach = null;
    this.customTrail?.dispose();
    this.customTrail = null;
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
