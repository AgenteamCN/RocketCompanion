/**
 * CameraManager.ts
 * Context-free camera controller dispatcher and mode arbitrator.
 */

import * as THREE from 'three';
import {
  PovCameraController,
  type PovCameraKernelLike,
} from './exempt_pov_microkernel/PovCameraController.ts';
import { RearViewCamera } from './RearViewCamera.ts';
import { FreeCameraController, type Vector3TupleOrObject } from './FreeCameraController.ts';
import {
  DirectorCameraController,
  PodiumCameraController,
  EditorCameraController,
  type BallCamTunerSettings,
  type SceneCameraInputState,
  type StaticTrainingShotEditorConfig,
} from './SceneOverrideCameraControllers.ts';
import {
  CAMERA_MODES,
  DEFAULT_PODIUM_CAMERA_FOV_DEG,
  DEFAULT_EDITOR_CAMERA_FOV_DEG,
  isPovFamilyMode,
  isCarAttachedCameraMode,
  clampHorizontalFovDeg,
  convertHorizontalToVerticalFov,
  resolveModeHorizontalFov,
  applyCanonicalUpAndHorizontalFov,
  arbitrateFrameCameraMode,
  resolveSnapshotHorizontalFov,
  buildCameraPoseStateSnapshot,
  resolveOverrideTargetCameraMode,
  transitionCameraControllerMode,
  applyPovCameraConfigToSharedCamera,
  type CameraControllerContract,
  type CameraMode,
  type CameraFovSources,
  type FreeCamStateSnapshot,
} from './cameraFovAndPosePipeline.ts';
import { getCameraDeterminismHarness } from './CameraDeterminismHarness.ts';
import {
  CAMERA_SOURCE_MODES,
  DEFAULT_CAMERA_SETTINGS,
  type CameraSettingsConfig,
} from '../ui-core/config/cameraDefaults.ts';
import { DEFAULT_REPLAY_DIRECTOR_FOV_DEG } from '../ui-core/config/replayDirectorConfig.ts';

export type { CameraControllerContract, CameraMode, FreeCamStateSnapshot };

export interface CameraManagerOptions {
  settings?: CameraSettingsConfig;
  [key: string]: unknown;
}

export class CameraManager {
  private _sharedCamera: THREE.PerspectiveCamera | null;
  public activeMode: CameraMode = CAMERA_MODES.POV;
  public readonly controllers: Map<CameraMode, CameraControllerContract>;
  public readonly povController: PovCameraController;
  public readonly wasmPovController: PovCameraController;
  public readonly freeController: FreeCameraController;
  public readonly directorController: DirectorCameraController;
  public readonly editorController: EditorCameraController;
  public focusedCarIndex = 0;
  public isDirectorOverrideActive = false;
  public isEditorOverrideActive = false;
  public isFreeCam = false;
  public settings: CameraSettingsConfig | null;

  constructor(
    aspect: number = typeof window !== 'undefined'
      ? window.innerWidth / window.innerHeight
      : 16 / 9,
    kernel: PovCameraKernelLike | null = null,
    options: CameraManagerOptions = {}
  ) {
    this.settings = options?.settings || { ...DEFAULT_CAMERA_SETTINGS };
    const initialVFov = convertHorizontalToVerticalFov(this.settings.fov ?? 110, aspect);
    const cam = new THREE.PerspectiveCamera(initialVFov, aspect, 4, 40000);
    this._sharedCamera = cam;

    const cleanJsMode = CAMERA_SOURCE_MODES.CLEAN_JS;
    const wasmMode = CAMERA_SOURCE_MODES.WASM;
    this.povController = new PovCameraController(aspect, kernel, cam, cleanJsMode);
    this.povController.settings = this.settings;
    this.wasmPovController = new PovCameraController(aspect, kernel, cam, wasmMode);
    this.wasmPovController.settings = this.settings;
    this.freeController = new FreeCameraController(aspect, this.settings, cam);
    this.directorController = new DirectorCameraController(cam, DEFAULT_REPLAY_DIRECTOR_FOV_DEG);
    this.editorController = new EditorCameraController(cam, DEFAULT_EDITOR_CAMERA_FOV_DEG);

    this.controllers = new Map<CameraMode, CameraControllerContract>([
      [CAMERA_MODES.POV, this.povController],
      [CAMERA_MODES.WASM_POV, this.wasmPovController],
      [CAMERA_MODES.REAR_VIEW, new RearViewCamera(aspect, this.settings, cam)],
      [CAMERA_MODES.FREE, this.freeController],
      [CAMERA_MODES.DIRECTOR, this.directorController],
      [CAMERA_MODES.PODIUM, new PodiumCameraController(cam, this, DEFAULT_PODIUM_CAMERA_FOV_DEG)],
      [CAMERA_MODES.EDITOR, this.editorController],
    ]);
  }

  private getFovSources(): CameraFovSources {
    return {
      activeMode: this.activeMode,
      isFreeCam: this.isFreeCam,
      isDirectorOverrideActive: this.isDirectorOverrideActive,
      isEditorOverrideActive: this.isEditorOverrideActive,
      freeCamFov: this.getFreeCamFov(),
      directorFov: this.getDirectorFov(),
      editorFov: Number(this.editorController.fov) || DEFAULT_EDITOR_CAMERA_FOV_DEG,
      podiumFov: DEFAULT_PODIUM_CAMERA_FOV_DEG,
      settings: this.settings,
    };
  }

  private syncSharedCameraUpAndFov(): void {
    const targetFov = resolveModeHorizontalFov(this.getFovSources());
    applyCanonicalUpAndHorizontalFov(this._sharedCamera, targetFov);
  }

  applyPovSettings(cfg: Partial<CameraSettingsConfig> | null | undefined): void {
    if (!cfg) return;
    const cam = this._sharedCamera;
    this.settings = applyPovCameraConfigToSharedCamera(
      cam,
      this.settings,
      DEFAULT_CAMERA_SETTINGS,
      cfg,
      this.isPovMode
    );
  }

  private applyModeOverrideTransition(next: boolean, mode: CameraMode): void {
    this.syncSharedCameraUpAndFov();
    const cur = this.activeMode;
    const pov = this.getPreferredPovMode();
    const target = resolveOverrideTargetCameraMode(next, this.isFreeCam, cur, mode, pov);
    if (target) this.setActiveMode(target);
  }

  setDirectorOverride(active: boolean): void {
    const next = Boolean(active);
    if (this.isDirectorOverrideActive === next) return;
    this.isDirectorOverrideActive = next;
    this.applyModeOverrideTransition(next, CAMERA_MODES.DIRECTOR);
  }

  setDirectorCameraPoseThreeJs(
    eyeX: number,
    eyeY: number,
    eyeZ: number,
    targetX: number,
    targetY: number,
    targetZ: number
  ): void {
    if (!Number.isFinite(eyeX) || !Number.isFinite(targetX)) return;
    this.directorController.setPoseThreeJs(eyeX, eyeY, eyeZ, targetX, targetY, targetZ);
  }

  getDirectorFov(): number {
    return Number(this.directorController.fov) || DEFAULT_REPLAY_DIRECTOR_FOV_DEG;
  }

  setEditorOverride(active: boolean): void {
    const next = Boolean(active);
    if (this.isEditorOverrideActive === next) return;
    this.isEditorOverrideActive = next;
    this.applyModeOverrideTransition(next, CAMERA_MODES.EDITOR);
  }

  syncEditorShotCamera(
    subMode: string,
    shot: StaticTrainingShotEditorConfig | null | undefined,
    ballCamTuner: BallCamTunerSettings | null = null
  ): void {
    if (!shot) return;
    this.editorController.syncShotPose(subMode, shot, ballCamTuner);
    if (this.isEditorOverrideActive) this.syncSharedCameraUpAndFov();
  }

  get camera(): THREE.PerspectiveCamera | null {
    return this._sharedCamera;
  }

  get currentMode(): CameraMode {
    return this.activeMode;
  }

  get isPovMode(): boolean {
    return isCarAttachedCameraMode({
      activeMode: this.activeMode,
      isFreeCam: this.isFreeCam,
      isDirectorOverrideActive: this.isDirectorOverrideActive,
      isEditorOverrideActive: this.isEditorOverrideActive,
    });
  }

  setFocusedCarIndex(carIndex: number): void {
    const idx = Number(carIndex);
    if (Number.isFinite(idx) && idx >= 0) this.focusedCarIndex = Math.round(idx);
  }

  private getPreferredPovMode(): CameraMode {
    return getCameraDeterminismHarness().activeSource === CAMERA_SOURCE_MODES.WASM
      ? CAMERA_MODES.WASM_POV
      : CAMERA_MODES.POV;
  }

  setActiveMode(newMode: CameraMode): void {
    if (this.activeMode === newMode || !this.controllers.has(newMode)) return;
    const prevMode = this.activeMode;
    this.activeMode = newMode;
    transitionCameraControllerMode(
      this.controllers,
      prevMode,
      newMode,
      () => this.syncSharedCameraUpAndFov(),
      getCameraDeterminismHarness(),
      CAMERA_SOURCE_MODES.CLEAN_JS,
      CAMERA_SOURCE_MODES.WASM
    );
  }

  setFreeCam(enabled: boolean): void {
    const shouldEnable = Boolean(enabled);
    if (this.isFreeCam === shouldEnable) return;
    this.isFreeCam = shouldEnable;
    const fallback = this.isDirectorOverrideActive
      ? CAMERA_MODES.DIRECTOR
      : this.getPreferredPovMode();
    this.setActiveMode(shouldEnable ? CAMERA_MODES.FREE : fallback);
  }

  toggleFreeCam(): boolean {
    this.setFreeCam(!this.isFreeCam);
    return this.isFreeCam;
  }

  setFreeCamFov(fov: number): void {
    const safeHFov = clampHorizontalFovDeg(fov, DEFAULT_REPLAY_DIRECTOR_FOV_DEG);
    this.freeController.fov = safeHFov;
    this.directorController.fov = safeHFov;
    const activeUsesFreeFov =
      this.isFreeCam ||
      this.isDirectorOverrideActive ||
      this.activeMode === CAMERA_MODES.FREE ||
      this.activeMode === CAMERA_MODES.DIRECTOR;
    if (this._sharedCamera && activeUsesFreeFov) {
      applyCanonicalUpAndHorizontalFov(this._sharedCamera, safeHFov);
    }
  }

  getFreeCamFov(): number {
    return typeof this.freeController.fov === 'number'
      ? this.freeController.fov
      : DEFAULT_REPLAY_DIRECTOR_FOV_DEG;
  }

  resetFreeCamOverview(): void {
    this.freeController.resetToDefaultOverview();
    if (this.isFreeCam) this.syncSharedCameraUpAndFov();
  }

  setFreeCamPose(
    position: Vector3TupleOrObject,
    lookAtTarget: Vector3TupleOrObject = [0, 80, 0]
  ): void {
    this.setFreeCam(true);
    this.freeController.setPoseLookAt(position, lookAtTarget);
  }

  getFreeCamStateSnapshot(): FreeCamStateSnapshot | null {
    const cam = this._sharedCamera;
    const hFov = resolveSnapshotHorizontalFov(cam, this.getFovSources());
    return buildCameraPoseStateSnapshot(cam, this.freeController, this.isFreeCam, hFov);
  }

  handleAction(actionId: string): boolean {
    return actionId === 'ballCam' ? this.toggleBallCam() : false;
  }

  get ballCam(): boolean {
    return this.povController.ballCam;
  }

  set ballCam(value: boolean) {
    const nextVal = Boolean(value);
    this.povController.ballCam = nextVal;
    this.wasmPovController.ballCam = nextVal;
  }

  toggleBallCam(): boolean {
    const nextVal = this.povController.toggleBallCam();
    this.wasmPovController.ballCam = nextVal;
    return nextVal;
  }

  resetView(): void {
    this.povController.resetView();
    this.wasmPovController.resetView();
    const cur = this.controllers.get(this.activeMode);
    if (cur && cur !== this.povController && cur !== this.wasmPovController) cur.resetView();
  }

  resize(width: number, height: number): void {
    for (const ctrl of this.controllers.values()) ctrl.resize(width, height);
    if (this._sharedCamera && height > 0) {
      this._sharedCamera.aspect = width / height;
      this._sharedCamera.updateProjectionMatrix();
    }
  }

  update(
    carObject: unknown,
    ballObject: unknown,
    dt = 0,
    extraInfo: unknown = null,
    inputState: SceneCameraInputState | null = null
  ): void {
    this.setActiveMode(
      arbitrateFrameCameraMode({
        isFreeCam: this.isFreeCam,
        isPodiumActive: Boolean(inputState?.podiumController?.isActive),
        isEditorOverrideActive: this.isEditorOverrideActive,
        isDirectorOverrideActive: this.isDirectorOverrideActive,
        isRearViewHeld: Boolean(inputState?.isRearViewHeld),
        preferredPovMode: this.getPreferredPovMode(),
      })
    );
    const needsSubject =
      isPovFamilyMode(this.activeMode) || this.activeMode === CAMERA_MODES.REAR_VIEW;
    if (needsSubject && (!carObject || !ballObject)) return;
    const current = this.controllers.get(this.activeMode);
    if (current) current.update(carObject, ballObject, dt, extraInfo, inputState);
  }

  dispose(): void {
    for (const ctrl of this.controllers.values()) ctrl.dispose();
    this.controllers.clear();
    this._sharedCamera = null;
    this.settings = null;
  }
}
