import * as THREE from 'three';
import type {
  NameTagBoostBorderOverride,
  NameTagCarEntry,
  NameTagCarTelemetry,
} from '../../ui-core/config/nameTagConfig.ts';
import { getNameTagConfig, getNameTagRuntimeState } from '../../game/runtimeUiPort.ts';
import {
  createNameTagSprite,
  ensureOverlayCanvas,
  hideOverlayCanvas,
  projectBallOcclusion2D,
  renderHighDpiOverlay,
  type NameTagOffscreenIndicatorCard2D,
  type NameTagOverlayCanvasState,
  type NameTagSprite,
  type VisibleNameTagCard2D,
} from './VehicleNameTagCanvasRenderer.ts';
import {
  VehicleNameTagGroundSimVisual,
  buildDistanceSimOffscreenIndicator2D,
  buildPovActionSimulationIndicator2D,
} from './VehicleNameTagGroundSimVisual.ts';
import { buildCarProjectionConfigParams } from './VehicleNameTagProjector.ts';
import {
  publishNameTagFrameTelemetry,
  resolveNameTagCarTeam,
  shouldShowVehicleNameTags,
  stepNameTagCarSlots,
  type NameTagArenaHost,
} from './vehicleNameTagFramePipeline.ts';

export type { NameTagArenaHost };

export class VehicleNameTagSystem {
  public readonly scene: THREE.Scene | null | undefined;
  public readonly root = new THREE.Group();
  public readonly sprites: NameTagSprite[] = [];
  public boostBorderOverride: NameTagBoostBorderOverride = null;

  private readonly _visibleSprites: NameTagSprite[] = [];
  private readonly _visibleCards2D: VisibleNameTagCard2D[] = [];
  private readonly _offscreenIndicators2D: NameTagOffscreenIndicatorCard2D[] = [];
  private readonly _groundSimVisual: VehicleNameTagGroundSimVisual;
  private readonly cameraUpVector = new THREE.Vector3(0, 1, 0);
  private readonly cameraForwardVector = new THREE.Vector3(0, 0, -1);
  private readonly cameraRightVector = new THREE.Vector3(1, 0, 0);
  private readonly _projVector = new THREE.Vector3();
  private readonly _overlayState: NameTagOverlayCanvasState = {
    overlayCanvas: null,
    overlayCtx: null,
  };

  constructor(scene: THREE.Scene | null | undefined) {
    this.scene = scene;
    const rootGroup = this.root;
    rootGroup.name = 'vehicle-name-tags';
    for (let i = 0; i < 8; i++) {
      const s = createNameTagSprite();
      this.sprites.push(s);
      rootGroup.add(s);
    }
    this._groundSimVisual = new VehicleNameTagGroundSimVisual(rootGroup);
    if (scene) scene.add(rootGroup);
  }

  public setBoostBorderOverride(override: NameTagBoostBorderOverride): void {
    this.boostBorderOverride = override;
  }

  public update(
    arena: NameTagArenaHost | null | undefined,
    numCars = 0,
    camera: THREE.PerspectiveCamera | null = null
  ): void {
    if (!arena || !this.root) return;
    const config = getNameTagConfig();
    const runtimeState = getNameTagRuntimeState();
    const isGoalReplay = Boolean(arena.isGoalReplayActive);

    if (!shouldShowVehicleNameTags(config, runtimeState, arena, numCars)) {
      this.root.visible = false;
      hideOverlayCanvas(this._overlayState);
      return;
    }

    this.root.visible = true;
    const activeCam = camera || arena.camera || null;
    if (activeCam) activeCam.updateMatrixWorld();

    const maxSlots = Math.min(this.sprites.length, Math.max(arena.cars?.length || 0, numCars));
    const camMode =
      arena.cameraMode || runtimeState.activeCameraMode || (arena.isFreeCam ? 'free' : 'pov');
    const isPovCam =
      camMode === 'director' || camMode === 'free' || camMode === 'podium'
        ? false
        : typeof arena.isPovCamera === 'boolean'
          ? arena.isPovCamera
          : camMode === 'pov' || camMode === 'wasmPov' || camMode === 'rearView';
    const focusedIdx =
      typeof arena.focusedCarIndex === 'number'
        ? arena.focusedCarIndex
        : typeof runtimeState.focusedCarIndex === 'number'
          ? runtimeState.focusedCarIndex
          : (arena.playerCarIndex ?? 0);

    if (activeCam?.quaternion) {
      const q = activeCam.quaternion;
      this.cameraUpVector.set(0, 1, 0).applyQuaternion(q).normalize();
      this.cameraForwardVector.set(0, 0, -1).applyQuaternion(q).normalize();
      this.cameraRightVector.set(1, 0, 0).applyQuaternion(q).normalize();
    } else {
      this.cameraUpVector.set(0, 1, 0);
      this.cameraForwardVector.set(0, 0, -1);
      this.cameraRightVector.set(1, 0, 0);
    }

    const vw = typeof window !== 'undefined' ? window.innerWidth || 1920 : 1920;
    const vh = typeof window !== 'undefined' ? window.innerHeight || 1080 : 1080;
    const dpr = typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1;
    const useOverlay = Boolean(
      ensureOverlayCanvas(this._overlayState) && this._overlayState.overlayCtx
    );

    const fovDeg = Number(activeCam?.fov) || 80;
    const tanHalfFov = Math.tan(THREE.MathUtils.degToRad(fovDeg * 0.5));

    const measureCtx =
      this._overlayState.overlayCtx ||
      this.sprites[0]?.userData?.canvas?.getContext?.('2d') ||
      null;
    if (measureCtx) {
      measureCtx.save();
      measureCtx.setTransform(1, 0, 0, 1, 0, 0);
    }

    const pillProjectionParams = buildCarProjectionConfigParams(
      config,
      false,
      vw,
      vh,
      tanHalfFov,
      measureCtx
    );
    const singleCharProjectionParams = buildCarProjectionConfigParams(
      config,
      true,
      vw,
      vh,
      tanHalfFov,
      measureCtx
    );

    const carEntries: NameTagCarEntry[] = Array.isArray(runtimeState.carEntries)
      ? runtimeState.carEntries
      : [];
    const focusedCarTeam = resolveNameTagCarTeam(carEntries, arena.carTeams, focusedIdx);
    const sysOverride =
      this.boostBorderOverride !== null
        ? this.boostBorderOverride
        : (arena.boostBorderOverride ?? null);

    this._visibleSprites.length = 0;
    this._visibleCards2D.length = 0;
    this._offscreenIndicators2D.length = 0;
    const telemetryCars: NameTagCarTelemetry[] = [];

    stepNameTagCarSlots({
      sprites: this.sprites,
      maxSlots,
      arena,
      config,
      runtimeState,
      carEntries,
      camMode,
      isPovCam,
      isGoalReplay,
      focusedIdx,
      focusedCarTeam,
      sysOverride,
      activeCam,
      cameraUpVector: this.cameraUpVector,
      cameraForwardVector: this.cameraForwardVector,
      cameraRightVector: this.cameraRightVector,
      projVector: this._projVector,
      measureCtx,
      pillProjectionParams,
      singleCharProjectionParams,
      useOverlay,
      visibleSprites: this._visibleSprites,
      visibleCards2D: this._visibleCards2D,
      offscreenIndicators2D: this._offscreenIndicators2D,
      telemetryCars,
    });

    if (measureCtx) measureCtx.restore();

    const povCarMesh = arena.cars?.[focusedIdx] ?? null;
    const povClimb = arena.carAerialClimbStatuses?.[focusedIdx];
    const povBoost =
      arena.carBoostAmounts && focusedIdx >= 0 && focusedIdx < arena.carBoostAmounts.length
        ? Number(arena.carBoostAmounts[focusedIdx])
        : undefined;

    this._groundSimVisual.update(
      config,
      povCarMesh,
      this.cameraForwardVector,
      this.cameraRightVector
    );
    const povSim = buildPovActionSimulationIndicator2D({
      config,
      povCarMesh,
      focusedCarIndex: focusedIdx,
      focusedCarTeam,
      liveBoostAmount: povBoost,
      povClimbStatus: povClimb,
      activeCamera: activeCam,
      cameraUpVector: this.cameraUpVector,
      projVector: this._projVector,
      viewportWidthPx: vw,
      viewportHeightPx: vh,
    });
    if (povSim) this._offscreenIndicators2D.push(povSim);

    const distSim = buildDistanceSimOffscreenIndicator2D({
      config,
      viewportWidthPx: vw,
      viewportHeightPx: vh,
      povClimbStatus: povClimb,
    });
    if (distSim) this._offscreenIndicators2D.push(distSim);

    publishNameTagFrameTelemetry(
      vw,
      vh,
      dpr,
      camMode,
      focusedIdx,
      fovDeg,
      activeCam,
      this.cameraForwardVector,
      this.cameraUpVector,
      telemetryCars
    );

    if (useOverlay) {
      const occ = projectBallOcclusion2D(
        arena.ball,
        arena.ballRadius ?? 95,
        activeCam,
        this.cameraForwardVector,
        this._projVector,
        vw,
        vh,
        tanHalfFov,
        config
      );
      renderHighDpiOverlay(
        this._overlayState,
        this._visibleCards2D,
        vw,
        vh,
        dpr,
        config,
        occ,
        this._offscreenIndicators2D
      );
    } else {
      this._visibleSprites.sort(
        (a, b) => (a.userData.cameraDistanceSq || 0) - (b.userData.cameraDistanceSq || 0)
      );
      for (let i = 0; i < this._visibleSprites.length; i++) {
        this._visibleSprites[i].renderOrder = 950 + i;
      }
    }
  }

  public dispose(): void {
    hideOverlayCanvas(this._overlayState);
    this._overlayState.overlayCanvas?.parentNode?.removeChild(this._overlayState.overlayCanvas);
    this._overlayState.overlayCanvas = null;
    this._overlayState.overlayCtx = null;
    for (const s of this.sprites) {
      s.userData.texture?.dispose();
      s.userData.material?.dispose();
    }
    if (this.root && this.scene) this.scene.remove(this.root);
  }
}
