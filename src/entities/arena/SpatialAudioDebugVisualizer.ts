/**
 * SpatialAudioDebugVisualizer.ts
 * Decoupled Three.js SubController for In-Arena 3D Spatial Audio Attenuation Visualization.
 */

import * as THREE from 'three';
import {
  evaluateProfileDistanceGain,
  getArenaAcousticScale,
  isDistanceCulled,
  solveIsoGainRadiusUU,
} from '../../audio/SpatialAttenuationEvaluator.ts';
import {
  getSpatialAttenuationProfile,
  spatialAttenuationProfiles,
} from '../../ui-core/config/spatialAttenuationProfiles.ts';
import {
  getSpatialAudioVisualizerConfig,
  publishSpatialAudioVisualizerTelemetry,
  registerSpatialAudioVisualizerApplier,
  type SpatialAudioVisualizerConfig,
} from '../../ui-core/config/spatialAudioVisualizerConfig.ts';
import {
  INNER_COLOR_HEX,
  ISO50_COLOR_HEX,
  OUTER_CULL_HEX,
  OUTER_FLOOR_HEX,
  buildSpatialAudioDebugRig,
  renderSpatialAudioBillboardLabel,
  type SpatialAudioDebugRig,
} from './SpatialAudioDebugGeometries.ts';

export interface SpatialAudioArenaHost {
  ball?: THREE.Object3D | null;
  cars?: Array<THREE.Object3D | null | undefined>;
  camera?: THREE.Camera | null;
  playerCarIndex?: number;
  focusedCarIndex?: number;
  markRenderTreeChanged?(): void;
}

export class SpatialAudioDebugVisualizer {
  public readonly scene: THREE.Scene;
  public readonly rootGroup: THREE.Group;

  private _rig: SpatialAudioDebugRig | null = null;
  private readonly _emitterPos = new THREE.Vector3();
  private readonly _listenerPos = new THREE.Vector3();
  private readonly _anchorPos = new THREE.Vector3();
  private readonly _midPos = new THREE.Vector3();

  private _lastTelemetryMs = 0;
  private _unsubConfig: (() => void) | null = null;
  private _unsubProfiles: (() => boolean) | null = null;
  private _onChangedCallback: (() => void) | null = null;

  constructor(scene: THREE.Scene, onChangedCallback: (() => void) | null = null) {
    this.scene = scene;
    this._onChangedCallback = onChangedCallback;
    this.rootGroup = new THREE.Group();
    this.rootGroup.name = 'SpatialAudioDebugVisualizer';
    this.rootGroup.visible = false;
    this.rootGroup.frustumCulled = false;
    this.scene.add(this.rootGroup);

    const weakThis = new WeakRef(this);
    this._unsubConfig = registerSpatialAudioVisualizerApplier(() => {
      weakThis.deref()?._onChangedCallback?.();
    });
    this._unsubProfiles = spatialAttenuationProfiles.subscribe(() => {
      weakThis.deref()?._onChangedCallback?.();
    });
  }

  private _ensureMeshes(): SpatialAudioDebugRig {
    if (!this._rig) {
      this._rig = buildSpatialAudioDebugRig(this.rootGroup);
    }
    return this._rig;
  }

  private _resolveEntityPositions(
    arena: SpatialAudioArenaHost,
    camera: THREE.Camera | null,
    cfg: SpatialAudioVisualizerConfig
  ): void {
    const localIdx =
      typeof arena.focusedCarIndex === 'number'
        ? arena.focusedCarIndex
        : (arena.playerCarIndex ?? 0);
    const localCar = arena.cars?.[localIdx] || arena.cars?.[0] || null;

    if (cfg.emitterTarget === 'ball' && arena.ball) {
      this._emitterPos.copy(arena.ball.position);
    } else if (cfg.emitterTarget === 'local_car' && localCar) {
      this._emitterPos.copy(localCar.position);
      this._emitterPos.y += 25;
    } else if (cfg.emitterTarget === 'bot_car') {
      const targetIdx = cfg.targetCarIndex ?? 1;
      const botCar =
        arena.cars?.[targetIdx] ||
        arena.cars?.find((c, idx) => Boolean(c && c.visible && idx !== localIdx)) ||
        arena.ball;
      if (botCar) {
        this._emitterPos.copy(botCar.position);
        this._emitterPos.y += 25;
      } else {
        this._emitterPos.set(0, 93, 0);
      }
    } else {
      this._emitterPos.set(cfg.fixedPointUU.x, cfg.fixedPointUU.z, cfg.fixedPointUU.y);
    }

    if (cfg.listenerTarget === 'local_car' && localCar) {
      this._listenerPos.copy(localCar.position);
      this._listenerPos.y += 35;
    } else if (camera) {
      this._listenerPos.copy(camera.position);
    } else if (localCar) {
      this._listenerPos.copy(localCar.position);
      this._listenerPos.y += 35;
    } else {
      this._listenerPos.set(0, 150, -1500);
    }

    if (cfg.anchorMode === 'listener') {
      this._anchorPos.copy(this._listenerPos);
    } else {
      this._anchorPos.copy(this._emitterPos);
    }
  }

  public update(
    arena: SpatialAudioArenaHost | null | undefined,
    camera: THREE.Camera | null = null
  ): void {
    if (!arena) return;
    const cfg = getSpatialAudioVisualizerConfig();
    if (!cfg.enabled) {
      if (this.rootGroup.visible) {
        this.rootGroup.visible = false;
      }
      return;
    }

    const rig = this._ensureMeshes();
    this.rootGroup.visible = true;

    const activeCamera = camera || arena.camera || null;
    const profile = getSpatialAttenuationProfile(cfg.activeCategory);
    this._resolveEntityPositions(arena, activeCamera, cfg);

    const acousticScale = getArenaAcousticScale();
    const rMin = Math.max(10, profile.minDistanceUU * acousticScale);
    const rMax = Math.max(rMin + 20, profile.maxDistanceUU * acousticScale);
    const r75 = solveIsoGainRadiusUU(profile, 0.75);
    const r50 = solveIsoGainRadiusUU(profile, 0.5);
    const r25 = solveIsoGainRadiusUU(profile, 0.25);

    const distUU = this._emitterPos.distanceTo(this._listenerPos);
    const culled = isDistanceCulled(distUU, profile);
    const gain = culled ? 0.0 : evaluateProfileDistanceGain(distUU, profile);

    const opacityScale = cfg.sphereOpacity;
    const depthTest = cfg.depthTest;
    const groundY = 5.0;

    rig.innerSphereGroup.visible = cfg.showInnerSphere;
    rig.innerGroundRing.visible = cfg.showInnerSphere;
    if (cfg.showInnerSphere) {
      rig.innerSphereGroup.position.copy(this._anchorPos);
      rig.innerSphereGroup.scale.setScalar(rMin);
      rig.innerGroundRing.position.set(this._anchorPos.x, groundY, this._anchorPos.z);
      rig.innerGroundRing.scale.setScalar(rMin);

      const wireMat = rig.innerSphereWire.material as THREE.LineBasicMaterial;
      wireMat.opacity = 0.7 * opacityScale;
      wireMat.depthTest = depthTest;
      const shellMat = rig.innerSphereShell.material as THREE.MeshBasicMaterial;
      shellMat.opacity = 0.06 * opacityScale;
      shellMat.depthTest = depthTest;
    }

    const outerColor =
      profile.cullBeyondMax && profile.minGainFloor <= 1e-5 ? OUTER_CULL_HEX : OUTER_FLOOR_HEX;
    rig.outerSphereGroup.visible = cfg.showOuterSphere;
    rig.outerGroundRing.visible = cfg.showOuterSphere;
    if (cfg.showOuterSphere) {
      rig.outerSphereGroup.position.copy(this._anchorPos);
      rig.outerSphereGroup.scale.setScalar(rMax);
      rig.outerGroundRing.position.set(this._anchorPos.x, groundY, this._anchorPos.z);
      rig.outerGroundRing.scale.setScalar(rMax);

      const wireMat = rig.outerSphereWire.material as THREE.LineBasicMaterial;
      wireMat.color.setHex(outerColor);
      wireMat.opacity = 0.5 * opacityScale;
      wireMat.depthTest = depthTest;
      const shellMat = rig.outerSphereShell.material as THREE.MeshBasicMaterial;
      shellMat.color.setHex(outerColor);
      shellMat.opacity = 0.025 * opacityScale;
      shellMat.depthTest = depthTest;
      const ringMat = rig.outerGroundRing.material as THREE.LineBasicMaterial;
      ringMat.color.setHex(outerColor);
    }

    rig.iso50GroundRing.visible = cfg.showIsoRing50;
    rig.iso50EquatorRing.visible = cfg.showIsoRing50;
    rig.iso75GroundRing.visible = cfg.showIsoRing50 && r75 > rMin + 10 && r75 < rMax - 10;
    rig.iso25GroundRing.visible = cfg.showIsoRing50 && r25 > rMin + 10 && r25 < rMax - 10;

    if (cfg.showIsoRing50) {
      rig.iso50GroundRing.position.set(this._anchorPos.x, groundY + 1, this._anchorPos.z);
      rig.iso50GroundRing.scale.setScalar(r50);

      rig.iso50EquatorRing.position.copy(this._anchorPos);
      rig.iso50EquatorRing.scale.setScalar(r50);

      rig.iso75GroundRing.position.set(this._anchorPos.x, groundY + 0.5, this._anchorPos.z);
      rig.iso75GroundRing.scale.setScalar(r75);

      rig.iso25GroundRing.position.set(this._anchorPos.x, groundY + 0.5, this._anchorPos.z);
      rig.iso25GroundRing.scale.setScalar(r25);
    }

    rig.rulerGroup.visible = cfg.showRadialRuler;
    if (cfg.showRadialRuler) {
      const pos3D = rig.rulerLine3D.geometry.getAttribute('position') as THREE.BufferAttribute;
      pos3D.setXYZ(0, this._emitterPos.x, this._emitterPos.y, this._emitterPos.z);
      pos3D.setXYZ(1, this._listenerPos.x, this._listenerPos.y, this._listenerPos.z);
      pos3D.needsUpdate = true;

      const posGround = rig.rulerGroundLine.geometry.getAttribute(
        'position'
      ) as THREE.BufferAttribute;
      posGround.setXYZ(0, this._emitterPos.x, groundY + 2, this._emitterPos.z);
      posGround.setXYZ(1, this._listenerPos.x, groundY + 2, this._listenerPos.z);
      posGround.needsUpdate = true;

      const rulerMat = rig.rulerLine3D.material as THREE.LineBasicMaterial;
      rulerMat.color.setHex(culled ? 0xf43f5e : gain >= 0.999 ? INNER_COLOR_HEX : ISO50_COLOR_HEX);

      rig.emitterBeacon.position.copy(this._emitterPos);
      rig.listenerBeacon.position.copy(this._listenerPos);

      if (rig.billboard) {
        this._midPos.lerpVectors(this._emitterPos, this._listenerPos, 0.35);
        this._midPos.y = Math.max(this._emitterPos.y, this._listenerPos.y, 120) + 140;
        rig.billboard.sprite.position.copy(this._midPos);

        const camDist = activeCamera
          ? Math.max(400, activeCamera.position.distanceTo(this._midPos))
          : 1800;
        const spriteScale = Math.min(1800, Math.max(260, camDist * 0.28));
        rig.billboard.sprite.scale.set(spriteScale, spriteScale * (144 / 512), 1);

        renderSpatialAudioBillboardLabel(
          rig.billboard,
          profile,
          cfg,
          distUU,
          gain,
          culled,
          r50,
          rMin,
          rMax
        );
      }
    }

    const now = typeof performance !== 'undefined' ? performance.now() : Date.now();
    if (now - this._lastTelemetryMs >= 60) {
      this._lastTelemetryMs = now;
      publishSpatialAudioVisualizerTelemetry({
        distanceUU: Math.round(distUU),
        gain,
        gainDb: gain <= 1e-4 ? -100 : Number((20 * Math.log10(gain)).toFixed(1)),
        isCulled: culled,
        isoRadius25UU: Math.round(r25),
        isoRadius50UU: Math.round(r50),
        isoRadius75UU: Math.round(r75),
        emitterPosUU: [
          Math.round(this._emitterPos.x),
          Math.round(this._emitterPos.z),
          Math.round(this._emitterPos.y),
        ],
        listenerPosUU: [
          Math.round(this._listenerPos.x),
          Math.round(this._listenerPos.z),
          Math.round(this._listenerPos.y),
        ],
      });
    }
  }

  public dispose(): void {
    this._unsubConfig?.();
    this._unsubConfig = null;
    this._unsubProfiles?.();
    this._unsubProfiles = null;
    this._rig?.billboard?.texture.dispose();
    this._rig = null;
    this.rootGroup.traverse(
      (
        node: THREE.Object3D & {
          geometry?: THREE.BufferGeometry;
          material?: THREE.Material | THREE.Material[];
        }
      ) => {
        node.geometry?.dispose?.();
        if (node.material) {
          for (const m of Array.isArray(node.material) ? node.material : [node.material]) {
            m?.dispose?.();
          }
        }
      }
    );
    this.scene?.remove?.(this.rootGroup);
  }
}
