import * as THREE from 'three';
import {
  getNameTagRuntimeState,
  hudStore,
  setNameTagRuntimeState,
  useReferenceOverlayStore,
} from '../runtimeUiPort.ts';
import { getDesiredRespawnPose } from '../../physics/RocketSimConstants.ts';
import { applyRespawnPoseToObject3D } from '../../entities/arena/RespawnGhostPreview.ts';
import type { CarStateView } from '../../physics/RocketSimStateViews.ts';
import type { ArenaWorld } from '../../entities/ArenaWorld.ts';
import type { CameraManager } from '../../camera/CameraManager.ts';
import type { PhysicsStateInterpolator } from '../../physics/PhysicsStateInterpolator.ts';
import type { FrameContext } from '../pipeline/FramePipeline.ts';

export interface FrameCameraMetadata {
  obsTargetIdx: number;
  cameraMode: string;
  isPovCamera: boolean;
  isGoalReplayActive: boolean;
}

export interface CameraDynamicsState {
  onGround: boolean;
  groundNormal: THREE.Vector3;
  velocity: THREE.Vector3;
  supersonic: boolean;
  lookX: number;
  lookY: number;
  carView?: CarStateView | null;
}

export interface CameraInputState {
  isRearViewHeld: boolean;
  podiumController?: { isActive?: boolean } | undefined;
}

interface ActiveModeCameraPort {
  isGoalReplayActive?(): boolean;
  directorPreview?: { isReplayActive?: boolean } | null;
  standaloneReplayViewer?: { isActive?: boolean; isIntervening?: boolean } | null;
  rlrcReplaySession?: { isActive?: boolean; isIntervening?: boolean } | null;
  rewinderController?: { isBlockingLivePhysics?: boolean } | null;
  replaySession?: {
    isReplayActive?: boolean;
    replayController?: { sessionState?: { isActive?: boolean } | null } | null;
  } | null;
  goalReplayPhase?: string;
  replayController?: { sessionState?: { isActive?: boolean } | null } | null;
  goalReplayTimelineController?: { sessionState?: { isActive?: boolean } | null } | null;
  isTestingSingleShot?: boolean;
}

export interface CameraSubsystemRuntimePort {
  camera: CameraManager | null;
  arena: ArenaWorld | null;
  interpolator: PhysicsStateInterpolator | null;
  match: { state: { mode: string; phase: string } } | null;
  modeManager: { getActiveMode(): unknown } | null;
  replayTimelineController: { sessionState?: { isActive?: boolean } | null } | null;
  ballTrajectoryPredictor: { releaseTemporarySuppression?(): void } | null;
  replayPovCarIndex: number | null;
  networkManager: {
    diagnosticsProbe: { diagnosticObservationTarget?: number };
  } | null;
  podiumController: { isActive?: boolean } | null;
  keyboard: { held?(action: string): boolean } | null;
  gamepad: { pressed?(action: string): boolean } | null;
}

/**
 * GameCameraSubsystem.ts
 * Encapsulates camera dynamics tracking, rear view input detection,
 * ball camera target follow, and HUD arrow orientation.
 */
export class GameCameraSubsystem {
  public runtime: CameraSubsystemRuntimePort;
  public scratchGroundNormal: THREE.Vector3 | null = new THREE.Vector3(0, 0, 0);
  public scratchVelocity: THREE.Vector3 | null = new THREE.Vector3(0, 0, 0);
  public respawnCameraProxy: { position: THREE.Vector3; quaternion: THREE.Quaternion } | null = {
    position: new THREE.Vector3(),
    quaternion: new THREE.Quaternion(),
  };
  private _goalReplayCameraOverrideActive = false;
  private readonly _goalReplayCameraOverrideSources = new Set<string>();
  private readonly _basisFwd = new THREE.Vector3();
  private readonly _basisRight = new THREE.Vector3();
  private readonly _basisUp = new THREE.Vector3(0, 1, 0);
  private readonly _basisMatrix = new THREE.Matrix4();

  public cameraDynamics: CameraDynamicsState | null;
  public cameraInputState: CameraInputState;

  constructor(runtime: CameraSubsystemRuntimePort) {
    this.runtime = runtime;

    this.cameraDynamics = {
      onGround: false,
      groundNormal: this.scratchGroundNormal!,
      velocity: this.scratchVelocity!,
      supersonic: false,
      lookX: 0,
      lookY: 0,
    };

    this.cameraInputState = {
      isRearViewHeld: false,
      podiumController: undefined,
    };
  }

  public isGoalReplayCameraOverrideActive(): boolean {
    return Boolean(this._goalReplayCameraOverrideActive);
  }

  public setGoalReplayCameraOverrideState(val: boolean): void {
    const next = Boolean(val);
    const prev = this._goalReplayCameraOverrideActive;
    if (!next) {
      this._goalReplayCameraOverrideSources.clear();
    }
    this._goalReplayCameraOverrideActive = next;
    this.runtime?.camera?.setDirectorOverride?.(next);
    if (prev && !next) {
      this.runtime?.camera?.camera?.up?.set?.(0, 1, 0);
    }
  }

  public acquireGoalReplayCameraOverride(source = 'default'): void {
    if (source) {
      this._goalReplayCameraOverrideSources.add(source);
    }
    this.setGoalReplayCameraOverrideState(true);
  }

  public releaseGoalReplayCameraOverride(source: string | null = null): void {
    if (source) {
      this._goalReplayCameraOverrideSources.delete(source);
      if (this._goalReplayCameraOverrideSources.size > 0) {
        return;
      }
    }
    this.setGoalReplayCameraOverrideState(false);
  }

  private _hasActiveGoalReplaySession(): boolean {
    const r = this.runtime;
    if (!r) return false;
    const activeMode = r.modeManager?.getActiveMode?.() as ActiveModeCameraPort | null;
    const activeReplayViewer = activeMode?.standaloneReplayViewer;
    const activeRlrcSession = activeMode?.rlrcReplaySession;
    return Boolean(
      r.match?.state?.phase === 'replay' ||
      hudStore.getState().matchPhase === 'replay' ||
      activeMode?.isGoalReplayActive?.() ||
      activeMode?.directorPreview?.isReplayActive ||
      (activeReplayViewer?.isActive && !activeReplayViewer?.isIntervening) ||
      (activeRlrcSession?.isActive && !activeRlrcSession?.isIntervening) ||
      activeMode?.rewinderController?.isBlockingLivePhysics ||
      activeMode?.replaySession?.isReplayActive ||
      activeMode?.goalReplayPhase === 'replaying' ||
      activeMode?.replayController?.sessionState?.isActive ||
      activeMode?.replaySession?.replayController?.sessionState?.isActive ||
      activeMode?.goalReplayTimelineController?.sessionState?.isActive ||
      r.replayTimelineController?.sessionState?.isActive
    );
  }

  private _reconcileSceneCameraOverrides(): void {
    const r = this.runtime;
    if (!r) return;
    const activeMode = r.modeManager?.getActiveMode?.() as ActiveModeCameraPort | null;
    const hasActiveReplaySession = this._hasActiveGoalReplaySession();
    if (!hasActiveReplaySession) {
      if (this.isGoalReplayCameraOverrideActive()) {
        this.releaseGoalReplayCameraOverride();
      }
      r.ballTrajectoryPredictor?.releaseTemporarySuppression?.();
    }
    const isStaticTrainingEditMode =
      (r.match?.state?.mode === 'static-training-pack' ||
        r.match?.state?.mode === 'static-training') &&
      !activeMode?.isTestingSingleShot &&
      Boolean(r.camera?.isEditorOverrideActive);
    if (!isStaticTrainingEditMode && r.camera?.isEditorOverrideActive) {
      r.camera.setEditorOverride?.(false);
    }
  }

  public resolveFrameCameraMetadata(context?: Partial<FrameContext> | null): FrameCameraMetadata {
    const r = this.runtime;
    const activeCar = context?.activeCar ?? 0;
    const isReplayPhase = this._hasActiveGoalReplaySession();
    const isDirectorOverride = this.isGoalReplayCameraOverrideActive();
    const isReplayPov =
      isReplayPhase &&
      !isDirectorOverride &&
      typeof r?.replayPovCarIndex === 'number' &&
      r.replayPovCarIndex >= 0;

    const diagTarget = r?.networkManager?.diagnosticsProbe?.diagnosticObservationTarget ?? 0;
    const obsTargetIdx = isReplayPov
      ? (r.replayPovCarIndex ?? activeCar)
      : diagTarget > 0 && r.arena?.cars?.[diagTarget]?.visible
        ? diagTarget
        : activeCar;

    let cameraMode = r?.camera?.currentMode || 'pov';
    if (r?.camera?.isFreeCam) {
      cameraMode = 'free';
    } else if (r?.podiumController?.isActive) {
      cameraMode = 'podium';
    } else if (r?.camera?.isEditorOverrideActive) {
      cameraMode = 'editor';
    } else if (isDirectorOverride) {
      cameraMode = 'director';
    }

    const isPovCamera =
      cameraMode === 'pov' || cameraMode === 'wasmPov' || cameraMode === 'rearView';

    return {
      obsTargetIdx,
      cameraMode,
      isPovCamera,
      isGoalReplayActive: Boolean(isReplayPhase || isDirectorOverride),
    };
  }

  public syncArenaCameraMetadata(context: FrameContext): void {
    const r = this.runtime;
    if (!r.arena) return;
    r.arena.playerCarIndex = context.activeCar;
    r.arena.isFreeCam = Boolean(r.camera?.isFreeCam);
    const camMeta = this.resolveFrameCameraMetadata(context);
    r.arena.isGoalReplayActive = camMeta.isGoalReplayActive;
    r.arena.cameraMode = camMeta.cameraMode;
    r.arena.isPovCamera = camMeta.isPovCamera;
    r.arena.focusedCarIndex = camMeta.obsTargetIdx;
    context.isGoalReplayActive = camMeta.isGoalReplayActive;
    if (r.camera?.camera) {
      r.arena.camera = r.camera.camera;
    }
  }

  public update(context: FrameContext): void {
    const r = this.runtime;
    if (!r?.camera || !this.cameraDynamics || !this.scratchGroundNormal || !this.scratchVelocity) {
      return;
    }
    const { dt, activeCar, activeCarMesh, playerCarView } = context;

    this._reconcileSceneCameraOverrides();

    const camMeta = this.resolveFrameCameraMetadata(context);
    const { obsTargetIdx } = camMeta;
    context.isGoalReplayActive = camMeta.isGoalReplayActive;
    const targetMesh = obsTargetIdx !== activeCar ? r.arena?.cars?.[obsTargetIdx] : activeCarMesh;
    const targetView =
      obsTargetIdx !== activeCar
        ? r.interpolator?.getCurrCarStateView(obsTargetIdx)
        : playerCarView;

    r.camera.setFocusedCarIndex?.(obsTargetIdx);

    let effectiveCarObject:
      | THREE.Object3D
      | { position: THREE.Vector3; quaternion: THREE.Quaternion }
      | null
      | undefined = targetMesh;
    const isLocalTarget = obsTargetIdx === activeCar;
    const selectedRespawnSlot = targetView?.demoSpawnSelection ?? -1;

    if (targetView) {
      if (targetView.isDemoed) {
        if (
          isLocalTarget &&
          selectedRespawnSlot >= 0 &&
          selectedRespawnSlot <= 3 &&
          this.respawnCameraProxy
        ) {
          const team = r.arena?.carTeams?.[obsTargetIdx] ?? obsTargetIdx % 2;
          const pose = getDesiredRespawnPose(team, selectedRespawnSlot);
          if (pose) {
            applyRespawnPoseToObject3D(
              this.respawnCameraProxy,
              pose,
              this._basisFwd,
              this._basisRight,
              this._basisUp,
              this._basisMatrix
            );
            effectiveCarObject = this.respawnCameraProxy;
          }
          this.cameraDynamics.onGround = true;
          this.cameraDynamics.supersonic = false;
          this.cameraDynamics.carView = targetView;
          this.scratchGroundNormal.set(0, 1, 0);
          this.scratchVelocity.set(0, 0, 0);
          this.cameraDynamics.velocity = this.scratchVelocity;
        } else {
          this.cameraDynamics.onGround = targetView.isOnGround;
          this.cameraDynamics.supersonic = false;
          this.cameraDynamics.carView = targetView;
          this.scratchGroundNormal.set(
            targetView.groundNormalX,
            targetView.groundNormalZ,
            targetView.groundNormalY
          );
          this.scratchVelocity.set(0, 0, 0);
          this.cameraDynamics.velocity = this.scratchVelocity;
        }
      } else {
        this.cameraDynamics.onGround = targetView.isOnGround;
        this.cameraDynamics.supersonic = targetView.isSupersonic;
        this.cameraDynamics.carView = targetView;
        this.scratchGroundNormal.set(
          targetView.groundNormalX,
          targetView.groundNormalZ,
          targetView.groundNormalY
        );
        this.scratchVelocity.set(targetView.velX, targetView.velZ, targetView.velY);
        this.cameraDynamics.velocity = this.scratchVelocity;
      }
    }
    context.cameraVelocity = this.scratchVelocity;

    const refOverlayState = useReferenceOverlayStore?.getState?.();
    const overrideLookX = refOverlayState?.cameraLookXOverride ?? 0;
    const overrideLookY = refOverlayState?.cameraLookYOverride ?? 0;
    const overrideRearView = Boolean(refOverlayState?.rearViewOverride);

    if (Math.abs(overrideLookX) > 1e-4 || Math.abs(overrideLookY) > 1e-4) {
      this.cameraDynamics.lookX = Math.max(-1, Math.min(1, overrideLookX));
      this.cameraDynamics.lookY = Math.max(-1, Math.min(1, overrideLookY));
    }

    const isRearViewHeld =
      overrideRearView ||
      ((r.keyboard?.held?.('rearView') || r.gamepad?.pressed?.('rearView')) ?? false);
    this.cameraInputState.isRearViewHeld = isRearViewHeld;
    this.cameraInputState.podiumController = r.podiumController || undefined;

    r.camera.update(
      effectiveCarObject as THREE.Object3D | null | undefined,
      r.arena?.ball,
      dt ?? 0.016,
      this.cameraDynamics,
      this.cameraInputState
    );

    const activeCameraMode = r.camera.currentMode || (r.camera.isFreeCam ? 'free' : 'pov');
    const isPovCamera = Boolean(r.camera.isPovMode);
    if (r.arena) {
      r.arena.cameraMode = activeCameraMode;
      r.arena.isPovCamera = isPovCamera;
      r.arena.focusedCarIndex = obsTargetIdx;
    }

    if (isPovCamera && r.arena?.ball && effectiveCarObject) {
      r.arena.updateBallLocatorArrow(
        r.camera.ballCam,
        obsTargetIdx,
        r.arena.ball,
        effectiveCarObject as THREE.Object3D
      );
    }

    const nameTagRuntime = getNameTagRuntimeState();
    if (
      nameTagRuntime.activeCameraMode !== activeCameraMode ||
      nameTagRuntime.focusedCarIndex !== obsTargetIdx
    ) {
      setNameTagRuntimeState({
        activeCameraMode,
        focusedCarIndex: obsTargetIdx,
      });
    }

    const numCars = r.interpolator?.getCurrHeaderView?.()?.numCars ?? r.interpolator?.numCars ?? 0;
    r.arena?.nameTagSystem?.update(r.arena, numCars, r.camera.camera);
    r.arena?.spatialAudioVisualizer?.update(r.arena, r.camera.camera);
    r.arena?.carNoseOrientationArrows?.update(
      effectiveCarObject,
      r.arena?.vehiclePresets?.[obsTargetIdx] ?? r.arena?.vehiclePreset ?? 'hitbox-octane',
      r.camera.camera,
      r.keyboard
    );

    const hud = hudStore.getState();
    hud.setBallCamActive(r.camera.ballCam);
    hud.setCameraFocusState(activeCameraMode, obsTargetIdx);
  }

  public dispose(): void {
    this.scratchGroundNormal = null;
    this.scratchVelocity = null;
    this.respawnCameraProxy = null;
    this.cameraDynamics = null;
  }
}
