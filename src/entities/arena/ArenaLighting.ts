/**
 * ArenaLighting.ts
 * Directional sunlight rigs, hemisphere environmental lighting,
 * texel-snapped dynamic shadow frustum tracking around the active POV camera,
 * and 3D light-source ray/gizmo visualization.
 */

import * as THREE from 'three';
import {
  DEFAULT_SUN_OFFSET_X,
  DEFAULT_SUN_OFFSET_Y,
  DEFAULT_SUN_OFFSET_Z,
  shadowRuntimeConfig,
  normalizeShadowLightingPatch,
  type ShadowConfig,
} from '../../ui-core/config/atmosphereFxConfig.ts';

import { ArenaLightingDebugGizmo } from './ArenaLightingDebugGizmo.ts';
import { ArenaBlobShadowSystem } from './ArenaBlobShadowSystem.ts';
import {
  applyEnvironmentalLightsConfig,
  applyShadowRigModeConfig,
  createSubjectDirectionalSun,
  recomputeShadowBasisVectors,
  resolvePovShadowActive,
  setDirectionalSunFrustum,
  snapSubjectShadowFrustum,
  syncRendererShadowMapConfig,
  type ShadowSceneCameraContext,
} from './arenaLightingRigPipeline.ts';

export type { ShadowSceneCameraContext };

export class ArenaLightingManager {
  public _numCars: number;
  public _shadowDir: THREE.Vector3;
  public _shadowX: THREE.Vector3;
  public _shadowY: THREE.Vector3;
  public _sunOffset: THREE.Vector3;
  public ballSun: THREE.DirectionalLight;
  public ballSunTarget: THREE.Group;
  public blobShadows: ArenaBlobShadowSystem;
  public carSun: THREE.DirectionalLight;
  public carSunTarget: THREE.Group;
  public debugGizmo: ArenaLightingDebugGizmo;
  public hemiLight: THREE.HemisphereLight;
  public keyLight: THREE.DirectionalLight;
  public opponentSun: THREE.DirectionalLight | null;
  public opponentSunTarget: THREE.Group;
  public scene: THREE.Scene;
  public shadowConfig: ShadowConfig;
  public shadowFocus: THREE.Vector3;
  public isPovShadowActive: boolean;

  constructor(scene: THREE.Scene) {
    this.scene = scene;
    this.shadowFocus = new THREE.Vector3();
    this.shadowConfig = { ...shadowRuntimeConfig };
    this._numCars = 1;
    this.isPovShadowActive = true;

    this.carSunTarget = new THREE.Group();
    this.ballSunTarget = new THREE.Group();
    this.opponentSunTarget = new THREE.Group();
    this.opponentSun = null;

    this.carSun = this.makeSubjectSun(this.carSunTarget, 260);
    this.ballSun = this.makeSubjectSun(this.ballSunTarget, 190);
    this.scene.add(this.carSunTarget, this.ballSunTarget, this.carSun, this.ballSun);

    this.hemiLight = new THREE.HemisphereLight(13164543, 2569000, 1.0);
    this.scene.add(this.hemiLight);

    this.keyLight = new THREE.DirectionalLight(8956671, 0.5);
    this.keyLight.position.set(-2000, 2000, -2000);
    this.scene.add(this.keyLight);

    this._sunOffset = new THREE.Vector3(
      this.shadowConfig.sunOffsetX ?? DEFAULT_SUN_OFFSET_X,
      this.shadowConfig.sunOffsetY ?? DEFAULT_SUN_OFFSET_Y,
      this.shadowConfig.sunOffsetZ ?? DEFAULT_SUN_OFFSET_Z
    );
    this._shadowDir = this._sunOffset.clone().normalize();
    this._shadowX = new THREE.Vector3();
    this._shadowY = new THREE.Vector3();
    this._recomputeShadowBasis();

    this.debugGizmo = new ArenaLightingDebugGizmo(scene);
    this.blobShadows = new ArenaBlobShadowSystem(scene);

    this._applyLightRigMode();
    this._applyEnvironmentalLights();
  }

  _recomputeShadowBasis(): void {
    recomputeShadowBasisVectors(
      this.shadowConfig,
      this._sunOffset,
      this._shadowDir,
      this._shadowX,
      this._shadowY
    );
  }

  _applyEnvironmentalLights(): void {
    applyEnvironmentalLightsConfig(
      this.shadowConfig,
      [this.carSun, this.ballSun, this.opponentSun],
      this.keyLight,
      this.hemiLight
    );
  }

  updateLightDebugVisuals(
    cars: Array<THREE.Object3D | null>,
    ball: THREE.Object3D | null,
    camera: THREE.Camera | null = null,
    focusedCarIndex = 0
  ): void {
    this.debugGizmo.update(
      this.shadowConfig,
      this.carSun.position,
      this._shadowDir,
      this.keyLight,
      cars,
      ball,
      camera,
      focusedCarIndex
    );
  }

  makeSubjectSun(targetGroup: THREE.Object3D, frustumSize = 260): THREE.DirectionalLight {
    return createSubjectDirectionalSun(targetGroup, frustumSize, this.shadowConfig);
  }

  ensureOpponentSun(): THREE.DirectionalLight {
    if (!this.opponentSun) {
      this.opponentSun = this.makeSubjectSun(this.opponentSunTarget, 260);
      this.opponentSun.visible = false;
      this.scene.add(this.opponentSun, this.opponentSunTarget);
      this._applyLightRigMode();
      this._applyEnvironmentalLights();
    }
    return this.opponentSun;
  }

  _setSunFrustum(sun: THREE.DirectionalLight, frustumSize: number): void {
    setDirectionalSunFrustum(sun, frustumSize);
  }

  public shouldRenderShadowMap(): boolean {
    return this.shadowConfig.mode !== 'off' && this.isPovShadowActive;
  }

  _applyLightRigMode(): void {
    applyShadowRigModeConfig(
      this.shadowConfig,
      this.isPovShadowActive,
      this.carSun,
      this.ballSun,
      this.opponentSun,
      this._numCars,
      (numCars) => this.updateSunIntensities(numCars)
    );
  }

  updateShadowConfig(
    patch: Partial<ShadowConfig> = {},
    renderer: THREE.WebGLRenderer | null = null
  ): void {
    const prevSharpness = this.shadowConfig.sharpness;
    const prevDepthTest = this.shadowConfig.lightGizmoDepthTest;
    const nextConfig = normalizeShadowLightingPatch(this.shadowConfig, patch);
    Object.assign(this.shadowConfig, nextConfig);
    Object.assign(shadowRuntimeConfig, this.shadowConfig);

    this._recomputeShadowBasis();
    this._applyLightRigMode();
    this._applyEnvironmentalLights();
    this.carSun.position.copy(this.shadowFocus).add(this._sunOffset);

    if (prevDepthTest !== this.shadowConfig.lightGizmoDepthTest) {
      this.debugGizmo.updateDepthTest(Boolean(this.shadowConfig.lightGizmoDepthTest));
    }

    syncRendererShadowMapConfig(
      renderer,
      this.scene,
      this.shadowConfig,
      prevSharpness,
      this.shouldRenderShadowMap()
    );
  }

  updateSubjectShadow(
    sun: THREE.DirectionalLight,
    targetGroup: THREE.Object3D,
    worldPos: THREE.Vector3,
    frustumSize = 260
  ): void {
    snapSubjectShadowFrustum(
      sun,
      targetGroup,
      worldPos,
      frustumSize,
      this.shadowConfig.mapSize || 1024,
      this._shadowX,
      this._shadowY,
      this._shadowDir,
      this._sunOffset,
      this.shadowFocus
    );
  }

  updateShadows(
    cars: Array<THREE.Object3D | null>,
    ball: THREE.Object3D | null,
    camera: THREE.Camera | null = null,
    cameraContext: ShadowSceneCameraContext | null = null
  ): void {
    const nextPovActive = resolvePovShadowActive(cameraContext);
    if (this.isPovShadowActive !== nextPovActive) {
      this.isPovShadowActive = nextPovActive;
      this._applyLightRigMode();
    }

    const focusedCarIndex =
      typeof cameraContext?.focusedCarIndex === 'number' && cameraContext.focusedCarIndex >= 0
        ? cameraContext.focusedCarIndex
        : 0;
    const focusedCar = cars[focusedCarIndex] ?? cars[0] ?? null;
    const { mode, singleSunFrustumRadius } = this.shadowConfig;

    const roiFocusPos = camera?.position || focusedCar?.position || ball?.position;

    if (mode === 'off' || !this.isPovShadowActive) {
      if (roiFocusPos) {
        this.shadowFocus.copy(roiFocusPos);
        this.carSunTarget.position.copy(this.shadowFocus);
        this.carSun.position.copy(this.shadowFocus).add(this._sunOffset);
        this.carSunTarget.updateMatrixWorld();
      }
      this.blobShadows.update(cars, ball, this);
      this.updateLightDebugVisuals(cars, ball, camera, focusedCarIndex);
      return;
    }

    if (mode === 'single-sun') {
      if (roiFocusPos) {
        this.updateSubjectShadow(
          this.carSun,
          this.carSunTarget,
          roiFocusPos,
          singleSunFrustumRadius
        );
      }
      this.blobShadows.update(cars, ball, this);
      this.updateLightDebugVisuals(cars, ball, camera, focusedCarIndex);
      return;
    }

    const primaryPos = focusedCar?.position || roiFocusPos;
    if (primaryPos) {
      this.updateSubjectShadow(this.carSun, this.carSunTarget, primaryPos, 260);
    }
    if (this.opponentSun && this.opponentSun.visible) {
      const secondaryCarIndex = focusedCarIndex === 0 ? 1 : 0;
      const secondaryCar = cars[secondaryCarIndex];
      if (secondaryCar?.visible) {
        this.updateSubjectShadow(
          this.opponentSun,
          this.opponentSunTarget,
          secondaryCar.position,
          260
        );
      }
    }
    if (ball) {
      this.updateSubjectShadow(this.ballSun, this.ballSunTarget, ball.position, 190);
    }
    this.blobShadows.update(cars, ball, this);
    this.updateLightDebugVisuals(cars, ball, camera, focusedCarIndex);
  }

  updateSunIntensities(numCars: number): void {
    this._numCars = numCars;
    if (this.shadowConfig.mode !== 'multi' || !this.isPovShadowActive) return;
    const baseSunIntensity = Math.max(0, Number(this.shadowConfig.sunIntensity) ?? 2.0);
    if (this.opponentSun) {
      this.opponentSun.visible = numCars > 1;
      const splitIntensity = this.opponentSun.visible ? baseSunIntensity / 3 : baseSunIntensity / 2;
      this.carSun.intensity = this.ballSun.intensity = splitIntensity;
      this.opponentSun.intensity = baseSunIntensity / 3;
    }
  }

  dispose(): void {
    this.carSun.dispose();
    this.ballSun.dispose();
    this.opponentSun?.dispose();
    this.keyLight.dispose();
    this.hemiLight.dispose();
    this.blobShadows.dispose();
    this.debugGizmo.dispose();
  }
}
