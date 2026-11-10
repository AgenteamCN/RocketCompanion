import * as THREE from 'three';
import {
  REPLAY_DIRECTOR_CONFIG,
  DEFAULT_REPLAY_DIRECTOR_FOV_DEG,
} from '../ui-core/config/replayDirectorConfig.ts';
import {
  DEFAULT_PODIUM_CAMERA_FOV_DEG,
  DEFAULT_EDITOR_CAMERA_FOV_DEG,
  clampHorizontalFovDeg,
  convertHorizontalToVerticalFov,
} from './cameraFovAndPosePipeline.ts';

export interface BallCamTunerSettings {
  fov?: number;
  distance: number;
  height: number;
  angle: number;
  lateralOffset: number;
}

export interface StaticTrainingShotEditorConfig {
  car?: {
    location?: number[];
    pos?: number[];
    headingYaw?: number;
    headingPitch?: number;
    speedYaw?: number;
    speedPitch?: number;
    snapToGround?: boolean;
  };
  ball?: {
    location?: number[];
    pos?: number[];
    speedYaw?: number;
    speedPitch?: number;
  };
}

export interface PodiumCameraDelegate {
  isActive?: boolean;
  updateCamera?: (cameraManager: unknown, dt: number) => void;
}

export interface SceneCameraInputState {
  isRearViewHeld?: boolean;
  podiumController?: PodiumCameraDelegate | null;
}

const DEFAULT_CAR_GROUND_MIN_Z = 17.05;
const DEFAULT_BALL_GROUND_MIN_Z = 93.15;

/**
 * First-class CameraManager controller for Goal Replay and Director AutoCam.
 */
export class DirectorCameraController {
  public camera: THREE.PerspectiveCamera | null;
  public eyePosition: THREE.Vector3;
  public lookTarget: THREE.Vector3;
  public hasPose: boolean;
  public isDirectorActive: boolean;
  private _fov: number;

  constructor(
    existingCamera: THREE.PerspectiveCamera | null = null,
    initialFov: number = DEFAULT_REPLAY_DIRECTOR_FOV_DEG
  ) {
    this.camera = existingCamera;
    this.eyePosition = new THREE.Vector3(0, 210, -3600);
    this.lookTarget = new THREE.Vector3(0, 120, 0);
    this.hasPose = false;
    this.isDirectorActive = false;
    this._fov = clampHorizontalFovDeg(initialFov, DEFAULT_REPLAY_DIRECTOR_FOV_DEG);
  }

  get fov(): number {
    const cfgFov = Number(REPLAY_DIRECTOR_CONFIG.cameraFovDeg);
    if (Number.isFinite(cfgFov) && cfgFov >= 10 && cfgFov <= 150) {
      return cfgFov;
    }
    return this._fov;
  }

  set fov(val: number) {
    const num = Number(val);
    if (!Number.isNaN(num) && Number.isFinite(num)) {
      this._fov = clampHorizontalFovDeg(num, DEFAULT_REPLAY_DIRECTOR_FOV_DEG);
      if (this.isDirectorActive && this.camera) {
        this.syncCameraFov();
      }
    }
  }

  private syncCameraFov(): void {
    if (!this.camera) return;
    const targetVFov = convertHorizontalToVerticalFov(this.fov, this.camera.aspect || 16 / 9);
    if (Math.abs(this.camera.fov - targetVFov) > 0.001) {
      this.camera.fov = targetVFov;
      this.camera.updateProjectionMatrix();
    }
  }

  onActivate(): void {
    this.isDirectorActive = true;
    if (!this.camera) return;
    this.camera.up.set(0, 1, 0);
    this.syncCameraFov();
    if (this.hasPose) {
      this.camera.position.copy(this.eyePosition);
      this.camera.lookAt(this.lookTarget);
    }
  }

  onDeactivate(): void {
    this.isDirectorActive = false;
    if (this.camera) {
      this.camera.up.set(0, 1, 0);
    }
  }

  resetView(): void {
    this.hasPose = false;
    if (this.camera) {
      this.camera.up.set(0, 1, 0);
      if (this.isDirectorActive) {
        this.syncCameraFov();
      }
    }
  }

  resize(width: number, height: number): void {
    if (this.camera && height > 0) {
      this.camera.aspect = width / height;
      if (this.isDirectorActive) {
        this.syncCameraFov();
      }
    }
  }

  setPoseThreeJs(
    eyeX: number,
    eyeY: number,
    eyeZ: number,
    targetX: number,
    targetY: number,
    targetZ: number
  ): void {
    this.eyePosition.set(eyeX, eyeY, eyeZ);
    this.lookTarget.set(targetX, targetY, targetZ);
    this.hasPose = true;
    if (this.camera) {
      this.camera.up.set(0, 1, 0);
      this.syncCameraFov();
      this.camera.position.copy(this.eyePosition);
      this.camera.lookAt(this.lookTarget);
    }
  }

  update(): void {
    if (!this.camera || !this.hasPose) return;
    this.camera.up.set(0, 1, 0);
    this.syncCameraFov();
    this.camera.position.copy(this.eyePosition);
    this.camera.lookAt(this.lookTarget);
  }

  dispose(): void {
    this.isDirectorActive = false;
    this.camera = null;
  }
}

/**
 * First-class CameraManager controller for Post-Match Podium Celebrations.
 */
export class PodiumCameraController {
  public camera: THREE.PerspectiveCamera | null;
  public cameraManager: unknown;
  public isPodiumActive: boolean;
  private _fov: number;

  constructor(
    existingCamera: THREE.PerspectiveCamera | null = null,
    cameraManager: unknown = null,
    initialFov: number = DEFAULT_PODIUM_CAMERA_FOV_DEG
  ) {
    this.camera = existingCamera;
    this.cameraManager = cameraManager;
    this.isPodiumActive = false;
    this._fov = clampHorizontalFovDeg(initialFov, DEFAULT_PODIUM_CAMERA_FOV_DEG);
  }

  get fov(): number {
    return this._fov;
  }

  set fov(val: number) {
    const num = Number(val);
    if (!Number.isNaN(num) && Number.isFinite(num)) {
      this._fov = clampHorizontalFovDeg(num, DEFAULT_PODIUM_CAMERA_FOV_DEG);
      if (this.isPodiumActive && this.camera) {
        this.syncCameraFov();
      }
    }
  }

  private syncCameraFov(): void {
    if (!this.camera) return;
    const targetVFov = convertHorizontalToVerticalFov(this._fov, this.camera.aspect || 16 / 9);
    if (Math.abs(this.camera.fov - targetVFov) > 0.001) {
      this.camera.fov = targetVFov;
      this.camera.updateProjectionMatrix();
    }
  }

  onActivate(): void {
    this.isPodiumActive = true;
    if (this.camera) {
      this.camera.up.set(0, 1, 0);
      this.syncCameraFov();
    }
  }

  onDeactivate(): void {
    this.isPodiumActive = false;
    if (this.camera) {
      this.camera.up.set(0, 1, 0);
    }
  }

  resetView(): void {
    if (this.camera) {
      this.camera.up.set(0, 1, 0);
      if (this.isPodiumActive) {
        this.syncCameraFov();
      }
    }
  }

  resize(width: number, height: number): void {
    if (this.camera && height > 0) {
      this.camera.aspect = width / height;
      if (this.isPodiumActive) {
        this.syncCameraFov();
      }
    }
  }

  update(
    _carObject: unknown,
    _ballObject: unknown,
    dt = 0.016,
    _extraInfo: unknown = null,
    inputState: SceneCameraInputState | null = null
  ): void {
    if (this.camera) {
      this.camera.up.set(0, 1, 0);
      this.syncCameraFov();
    }
    inputState?.podiumController?.updateCamera?.(this.cameraManager, dt || 0.016);
  }

  dispose(): void {
    this.isPodiumActive = false;
    this.camera = null;
    this.cameraManager = null;
  }
}

/**
 * First-class CameraManager controller for Static Training Pack 3D Editor sub-modes
 * ('car-heading', 'car-speed', 'ball-speed').
 */
export class EditorCameraController {
  public camera: THREE.PerspectiveCamera | null;
  public eyePosition: THREE.Vector3;
  public lookTarget: THREE.Vector3;
  public upVector: THREE.Vector3;
  public hasPose: boolean;
  public isEditorActive: boolean;
  private _fov: number;

  constructor(
    existingCamera: THREE.PerspectiveCamera | null = null,
    initialFov: number = DEFAULT_EDITOR_CAMERA_FOV_DEG
  ) {
    this.camera = existingCamera;
    this.eyePosition = new THREE.Vector3(0, 125, -2720);
    this.lookTarget = new THREE.Vector3(0, 52, -1980);
    this.upVector = new THREE.Vector3(0, 1, 0);
    this.hasPose = false;
    this.isEditorActive = false;
    this._fov = clampHorizontalFovDeg(initialFov, DEFAULT_EDITOR_CAMERA_FOV_DEG);
  }

  get fov(): number {
    return this._fov;
  }

  set fov(val: number) {
    const num = Number(val);
    if (!Number.isNaN(num) && Number.isFinite(num)) {
      this._fov = clampHorizontalFovDeg(num, DEFAULT_EDITOR_CAMERA_FOV_DEG);
      if (this.isEditorActive && this.camera) {
        this.syncCameraFov();
      }
    }
  }

  private syncCameraFov(): void {
    if (!this.camera) return;
    const targetVFov = convertHorizontalToVerticalFov(this._fov, this.camera.aspect || 16 / 9);
    if (Math.abs(this.camera.fov - targetVFov) > 0.001) {
      this.camera.fov = targetVFov;
      this.camera.updateProjectionMatrix();
    }
  }

  onActivate(): void {
    this.isEditorActive = true;
    if (!this.camera) return;
    this.syncCameraFov();
    if (this.hasPose) {
      this.camera.up.copy(this.upVector);
      this.camera.position.copy(this.eyePosition);
      this.camera.lookAt(this.lookTarget);
    } else {
      this.camera.up.set(0, 1, 0);
    }
  }

  onDeactivate(): void {
    this.isEditorActive = false;
    this.upVector.set(0, 1, 0);
    if (this.camera) {
      this.camera.up.set(0, 1, 0);
    }
  }

  resetView(): void {
    this.hasPose = false;
    this.upVector.set(0, 1, 0);
    if (this.camera) {
      this.camera.up.set(0, 1, 0);
      if (this.isEditorActive) {
        this.syncCameraFov();
      }
    }
  }

  resize(width: number, height: number): void {
    if (this.camera && height > 0) {
      this.camera.aspect = width / height;
      if (this.isEditorActive) {
        this.syncCameraFov();
      }
    }
  }

  syncShotPose(
    subMode: string,
    shot: StaticTrainingShotEditorConfig | null | undefined,
    ballCamTuner?: BallCamTunerSettings | null
  ): void {
    if (!shot) return;

    this._fov = clampHorizontalFovDeg(
      ballCamTuner?.fov ?? DEFAULT_EDITOR_CAMERA_FOV_DEG,
      DEFAULT_EDITOR_CAMERA_FOV_DEG
    );

    if (subMode === 'car-heading') {
      const carLocation = shot.car?.location ||
        shot.car?.pos || [0, -2400, DEFAULT_CAR_GROUND_MIN_Z];
      const targetX = carLocation[0] ?? 0;
      const targetY = (carLocation[2] ?? DEFAULT_CAR_GROUND_MIN_Z) + 35;
      const targetZ = carLocation[1] ?? -2400;
      const lookYaw = Number(shot.car?.headingYaw) || 0;
      const lookPitch = shot.car?.snapToGround ? 0 : Number(shot.car?.headingPitch) || 0;
      const cosPitch = Math.cos(lookPitch);
      const sinPitch = Math.sin(lookPitch);
      const forwardX = Math.cos(lookYaw) * cosPitch;
      const forwardY = sinPitch;
      const forwardZ = Math.sin(lookYaw) * cosPitch;
      const distance = 320;
      const heightOffset = 90;

      this.upVector.set(0, 1, 0);
      this.eyePosition.set(
        targetX - forwardX * distance,
        Math.max(24, targetY - forwardY * distance + heightOffset),
        targetZ - forwardZ * distance
      );
      this.lookTarget.set(
        targetX + forwardX * 420,
        targetY + forwardY * 420,
        targetZ + forwardZ * 420
      );
      this.hasPose = true;
    } else if (subMode === 'car-speed') {
      const carLocation = shot.car?.location ||
        shot.car?.pos || [0, -2400, DEFAULT_CAR_GROUND_MIN_Z];
      const targetX = carLocation[0] ?? 0;
      const targetY = (carLocation[2] ?? DEFAULT_CAR_GROUND_MIN_Z) + 35;
      const targetZ = carLocation[1] ?? -2400;
      const lookYaw = Number(shot.car?.speedYaw ?? shot.car?.headingYaw) || 0;
      const lookPitch = Number(shot.car?.speedPitch) || 0;
      const cosPitch = Math.cos(lookPitch);
      const sinPitch = Math.sin(lookPitch);
      const forwardX = Math.cos(lookYaw) * cosPitch;
      const forwardY = sinPitch;
      const forwardZ = Math.sin(lookYaw) * cosPitch;
      const distance = 340;
      const heightOffset = 95;

      this.upVector.set(0, 1, 0);
      this.eyePosition.set(
        targetX - forwardX * distance,
        Math.max(24, targetY - forwardY * distance + heightOffset),
        targetZ - forwardZ * distance
      );
      this.lookTarget.set(
        targetX + forwardX * 450,
        targetY + forwardY * 450,
        targetZ + forwardZ * 450
      );
      this.hasPose = true;
    } else if (subMode === 'ball-speed') {
      const ballLocation = shot.ball?.location ||
        shot.ball?.pos || [0, 0, DEFAULT_BALL_GROUND_MIN_Z];
      const ballX = ballLocation[0] ?? 0;
      const ballY = ballLocation[2] ?? DEFAULT_BALL_GROUND_MIN_Z;
      const ballZ = ballLocation[1] ?? 0;
      const lookYaw = Number(shot.ball?.speedYaw) || 0;
      const lookPitch = Number(shot.ball?.speedPitch) || 0;
      const cosPitch = Math.cos(lookPitch);
      const sinPitch = Math.sin(lookPitch);

      const distance = ballCamTuner?.distance ?? 320;
      const height = ballCamTuner?.height ?? 60;
      const angle = ballCamTuner?.angle ?? -6;
      const lateralOffset = ballCamTuner?.lateralOffset ?? 0;

      const forwardX = Math.cos(lookYaw) * cosPitch;
      const forwardY = sinPitch;
      const forwardZ = Math.sin(lookYaw) * cosPitch;

      const rightX = -Math.sin(lookYaw);
      const rightY = 0;
      const rightZ = Math.cos(lookYaw);

      const localUpX = -Math.cos(lookYaw) * sinPitch;
      const localUpY = cosPitch;
      const localUpZ = -Math.sin(lookYaw) * sinPitch;

      const camX = ballX - forwardX * distance + localUpX * height + rightX * lateralOffset;
      const camY = ballY - forwardY * distance + localUpY * height + rightY * lateralOffset;
      const camZ = ballZ - forwardZ * distance + localUpZ * height + rightZ * lateralOffset;

      const effectivePitch = lookPitch + (angle * Math.PI) / 180;
      const cosEffectivePitch = Math.cos(effectivePitch);
      const sinEffectivePitch = Math.sin(effectivePitch);
      const lookDirX = Math.cos(lookYaw) * cosEffectivePitch;
      const lookDirY = sinEffectivePitch;
      const lookDirZ = Math.sin(lookYaw) * cosEffectivePitch;

      this.eyePosition.set(camX, camY, camZ);
      this.upVector.set(
        -Math.cos(lookYaw) * sinEffectivePitch,
        cosEffectivePitch,
        -Math.sin(lookYaw) * sinEffectivePitch
      );
      this.lookTarget.set(camX + lookDirX * 800, camY + lookDirY * 800, camZ + lookDirZ * 800);
      this.hasPose = true;
    }

    if (this.camera && this.hasPose) {
      if (this.isEditorActive) {
        this.syncCameraFov();
      }
      this.camera.up.copy(this.upVector);
      this.camera.position.copy(this.eyePosition);
      this.camera.lookAt(this.lookTarget);
    }
  }

  update(): void {
    if (!this.camera || !this.hasPose) return;
    this.syncCameraFov();
    this.camera.up.copy(this.upVector);
    this.camera.position.copy(this.eyePosition);
    this.camera.lookAt(this.lookTarget);
  }

  dispose(): void {
    this.isEditorActive = false;
    this.camera = null;
  }
}
