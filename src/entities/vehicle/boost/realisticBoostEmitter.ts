import * as THREE from 'three';
import { boostParticleRuntimeConfig } from '../../../ui-core/config/vehicleTunerConfig.ts';
import { REALISTIC_DRIVE_COUNT, REALISTIC_TRAIL_COUNT } from './boostCurves.ts';
import { RealisticBoostParticleMesh } from './RealisticBoostParticleMesh.ts';
import {
  loadGoldenBoostTextures,
  createRealisticBoostConeGeometry,
  createRealisticBoostConeMaterial,
} from './realisticConeVisual.ts';
import { createBoostFlare } from './arcadeConeVisual.ts';
import { RealisticParticlePhysics } from './realisticParticlePhysics.ts';
import {
  applyNozzleOffsetToVector,
  cloneOrCreateNozzleVector,
  disposeBoostSceneObject,
  resolveRealisticBoostLuminance,
  stepEmitterParticlePhysics,
  syncBoostNozzleAttachments,
  updateBoostConeMaterials,
  updateBoostGlintMesh,
  type NozzleOffsetInput,
} from './boostEmitterPipeline.ts';

/**
 * Gold Rush Boost Emitter (plume.webp, turbulence.webp, sparks.webp)
 */
export class RealisticBoostEmitter {
  public _scratchA: THREE.Vector3;
  public car: THREE.Object3D;
  public cone: THREE.Group;
  public coneMaterials: THREE.ShaderMaterial[];
  public coneOpacity: number;
  public drive: RealisticBoostParticleMesh;
  public elapsed: number;
  public lensFlare:
    | THREE.Points<THREE.BufferGeometry, THREE.ShaderMaterial>
    | THREE.Mesh<THREE.BufferGeometry, THREE.ShaderMaterial>
    | null;
  public light: THREE.PointLight | null;
  public nozzleLocal: THREE.Vector3;
  public offset: THREE.Vector3;
  public physics: RealisticParticlePhysics;
  public scene: THREE.Scene | THREE.Object3D;
  public trail: RealisticBoostParticleMesh;

  constructor(
    scene: THREE.Scene | THREE.Object3D,
    carRoot: THREE.Object3D,
    nozzleLocal: THREE.Vector3,
    pointLight: THREE.PointLight | null
  ) {
    this.scene = scene;
    this.car = carRoot;
    this.nozzleLocal = cloneOrCreateNozzleVector(nozzleLocal);
    this.offset = this.nozzleLocal;
    this.cone = new THREE.Group();
    this.coneMaterials = [];
    this.lensFlare = null;
    this.light = pointLight;

    this.elapsed = 0;
    this.coneOpacity = 0;

    const { textures, water, particleSheet } = loadGoldenBoostTextures();

    this.drive = new RealisticBoostParticleMesh(REALISTIC_DRIVE_COUNT, textures, 5);
    this.drive.attachTo(carRoot, 'gold-rush-drive-puffs');

    this.trail = new RealisticBoostParticleMesh(REALISTIC_TRAIL_COUNT, textures, 4);
    this.trail.attachTo(scene, 'gold-rush-boost-trail');

    this.physics = new RealisticParticlePhysics(this.drive, this.trail, this.nozzleLocal);

    this.cone.name = 'gold-rush-boost-flame';
    this.cone.position.copy(this.nozzleLocal);
    this.cone.layers.enable(1);
    this.cone.visible = false;
    carRoot.add(this.cone);

    const addConeLayer = (radius: number, length: number, layerIdx: number) => {
      const mat = createRealisticBoostConeMaterial(water, particleSheet, layerIdx);
      const mesh = new THREE.Mesh(createRealisticBoostConeGeometry(radius, length, 28, 18), mat);
      mesh.name = `gold-rush-cone-${layerIdx}`;
      mesh.castShadow = false;
      mesh.receiveShadow = false;
      mesh.layers.enable(1);
      mesh.frustumCulled = false;
      this.coneMaterials.push(mat);
      this.cone.add(mesh);
    };

    addConeLayer(3.4, 24, 1);
    addConeLayer(7.2, 48, 0);

    const flarePos = this.nozzleLocal.clone();
    flarePos.x -= 2;
    this.lensFlare = createBoostFlare(flarePos);
    this.lensFlare.name = 'gold-rush-flare';
    this.lensFlare.castShadow = false;
    this.lensFlare.receiveShadow = false;
    this.lensFlare.layers.enable(1);
    this.lensFlare.visible = false;
    carRoot.add(this.lensFlare);

    this._scratchA = new THREE.Vector3();
  }

  _syncNozzlePositions(): void {
    syncBoostNozzleAttachments(
      this.nozzleLocal,
      this.cone,
      this.lensFlare,
      this.light,
      this.scene,
      this.car
    );
  }

  setNozzleOffset(xOrVec: NozzleOffsetInput, y?: number, z?: number): void {
    applyNozzleOffsetToVector(this.nozzleLocal, xOrVec, y, z);
    this._syncNozzlePositions();
    this.physics.hasPreviousNozzle = false;
  }

  get bloomActive(): boolean {
    if (!boostParticleRuntimeConfig.bloomEnabled) return false;
    return (
      this.coneOpacity > 0.002 ||
      this.physics.driveParticlesActive ||
      this.physics.trailParticlesActive
    );
  }

  async preload(): Promise<void> {
    await loadGoldenBoostTextures().ready;
  }

  update(boosting: boolean, driving: boolean, visible: boolean, dt: number): void {
    this._syncNozzlePositions();
    const isBoosting = boosting && visible;
    const isDriving = driving && !boosting && visible;
    this.elapsed += dt;

    const dampSpeed = isBoosting ? 28 : 16;
    this.coneOpacity = THREE.MathUtils.damp(this.coneOpacity, isBoosting ? 1 : 0, dampSpeed, dt);
    const coneVisible = this.coneOpacity > 0.002;
    this.cone.visible = coneVisible;

    const { flameMode, plumeScale } = resolveRealisticBoostLuminance(this.coneOpacity);
    updateBoostConeMaterials(this.coneMaterials, this.elapsed, this.coneOpacity, flameMode);

    const flareMul = flameMode === 0 ? 0.4 : 1.0;
    updateBoostGlintMesh(this.lensFlare, coneVisible, this.coneOpacity * flareMul);

    if (this.light) {
      this.light.color.setRGB(1, 0.6689812541, 0.08848005533);
      const lightBase = flameMode === 0 ? 1000 : 2500;
      const flicker = flameMode === 0 ? 80 : 280;
      this.light.intensity = boostParticleRuntimeConfig.pointLightEnabled
        ? this.coneOpacity * (lightBase + flicker * Math.sin(this.elapsed * 37))
        : 0;
    }

    this.trail.setPlumeLuminance(plumeScale);
    this.drive.setPlumeLuminance(plumeScale);

    const isPausedBoost = stepEmitterParticlePhysics(
      this.physics,
      this.car,
      this.nozzleLocal,
      this._scratchA,
      isDriving,
      isBoosting,
      dt
    );

    if (this.physics.driveParticlesActive) {
      const active = isPausedBoost ? true : this.physics.updateDrive(dt);
      this.drive.setVisible(active);
      this.drive.setTime(this.elapsed);
      this.drive.markDirty();
    }

    if (this.physics.trailParticlesActive) {
      const active = isPausedBoost ? true : this.physics.updateTrail(dt);
      this.trail.setVisible(active);
      this.trail.setTime(this.elapsed);
      this.trail.markDirty();
    }
  }

  reset(): void {
    this.physics.reset();
    this.coneOpacity = 0;
    this.cone.visible = false;
    if (this.lensFlare) this.lensFlare.visible = false;
    if (this.light) this.light.intensity = 0;
  }

  dispose(): void {
    this.reset();
    this.trail.dispose(this.scene);
    this.drive.dispose(this.car);
    disposeBoostSceneObject(this.cone, this.car);
    disposeBoostSceneObject(this.lensFlare, this.car);
  }
}
