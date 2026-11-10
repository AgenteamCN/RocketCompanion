/**
 * RearViewCamera.ts
 * High-performance, pure JavaScript detached Rear View Camera Controller.
 * Decoupled completely from WASM microkernels and legacy reference code.
 *
 * Mathematical & Architectural Principles:
 * 1. Parameter Correlation:
 *    Strongly bound to the 4 user settings: FOV, Distance, Height, Angle.
 *    (Stiffness excluded; uses dedicated soft-attach filter).
 * 2. Front-to-Back Coordinate Inversion:
 *    Camera is placed ahead of vehicle along the horizontal heading, looking rearward.
 * 3. Strict Horizon Lock (Always level with the horizon):
 *    Camera Up is strictly world (0, 1, 0) with 0 roll; Pitch is fixed to angleDeg relative to the world horizon.
 * 4. Grounded vs Airborne Telemetry Logic:
 *    - Grounded (all 4 wheels contact & suspension fully compressed): oriented backward relative to car heading.
 *    - Airborne / Takeoff Indication (any wheel airborne or uncompressed): oriented backward relative to horizontal velocity.
 * 5. Internal Soft-Attachment:
 *    Smooth direction and position interpolation internal to this controller.
 */

import * as THREE from 'three';
import {
  DEFAULT_CAMERA_SETTINGS,
  type CameraSettingsConfig,
} from '../ui-core/config/cameraDefaults.ts';
import {
  DEFAULT_HORIZONTAL_FOV_DEG,
  convertHorizontalToVerticalFov,
} from './cameraFovAndPosePipeline.ts';

export interface RearViewExtraInfo {
  onGround?: boolean;
  velocity?: { x?: number; y?: number; z?: number };
  carView?: {
    velX?: number;
    velY?: number;
    velZ?: number;
    getWheelContact?: (wheelIndex: number) => boolean;
    getWheelSusLength?: (wheelIndex: number) => number;
  };
}

export interface RearViewCarObject {
  position?: { x: number; y: number; z: number };
  quaternion?: { x: number; y: number; z: number; w: number };
}

// Suspension travel threshold indicating uncompressed / takeoff state in RocketSim units
export const SUSPENSION_COMPRESSION_THRESHOLD = 10.0;

export class RearViewCamera {
  public camPosition: THREE.Vector3;
  public camera: THREE.PerspectiveCamera | null;
  public carForward: THREE.Vector3;
  public carHorizontal: THREE.Vector3;
  public isInitialized: boolean;
  public lookTarget: THREE.Vector3;
  public settings: CameraSettingsConfig | null;
  public smoothHeading: THREE.Vector3 | null;
  public smoothingLambda: number;
  public targetHeading: THREE.Vector3 | null;
  public velocityHorizontal: THREE.Vector3;

  constructor(
    aspect: number = typeof window !== 'undefined'
      ? window.innerWidth / window.innerHeight
      : 16 / 9,
    settings: CameraSettingsConfig | null = null,
    existingCamera: THREE.PerspectiveCamera | null = null
  ) {
    this.settings = settings || { ...DEFAULT_CAMERA_SETTINGS };

    // Use shared camera if provided, else create standalone with converted vertical FOV
    const initialVFov = convertHorizontalToVerticalFov(
      this.settings.fov ?? DEFAULT_HORIZONTAL_FOV_DEG,
      aspect
    );
    this.camera = existingCamera || new THREE.PerspectiveCamera(initialVFov, aspect, 4, 40000);

    // Dynamic vectors for calculations
    this.smoothHeading = new THREE.Vector3(1, 0, 0);
    this.targetHeading = new THREE.Vector3(1, 0, 0);
    this.carForward = new THREE.Vector3(1, 0, 0);
    this.carHorizontal = new THREE.Vector3(1, 0, 0);
    this.velocityHorizontal = new THREE.Vector3(0, 0, 0);
    this.lookTarget = new THREE.Vector3(0, 0, 0);
    this.camPosition = new THREE.Vector3(0, 0, 0);

    this.isInitialized = false;
    this.smoothingLambda = 14.0; // Soft-attachment responsiveness
  }

  /**
   * Reset internal orientation filter
   */
  resetView(): void {
    this.isInitialized = false;
  }

  /**
   * Handle viewport resize
   */
  resize(width: number, height: number): void {
    if (this.camera && height > 0) {
      this.camera.aspect = width / height;
      const targetVFov = convertHorizontalToVerticalFov(
        this.settings?.fov ?? 110,
        this.camera.aspect
      );
      this.camera.fov = targetVFov;
      this.camera.updateProjectionMatrix();
    }
  }

  /**
   * Determine whether all 4 wheels are touching a plane and suspensions are fully compressed
   */
  checkGroundedState(extraInfo?: RearViewExtraInfo | null): boolean {
    const carView = extraInfo?.carView;
    if (carView && typeof carView.getWheelContact === 'function') {
      for (let i = 0; i < 4; i++) {
        // Any wheel airborne?
        if (!carView.getWheelContact(i)) return false;
        // Any wheel suspension expanding / not fully compressed?
        if (typeof carView.getWheelSusLength === 'function') {
          const susLen = carView.getWheelSusLength(i);
          if (susLen >= SUSPENSION_COMPRESSION_THRESHOLD) return false;
        }
      }
      return true;
    }
    return Boolean(extraInfo?.onGround);
  }

  /**
   * Step rear-view camera transformation
   */
  update(
    carObject: RearViewCarObject | null | undefined,
    _ballObject: unknown = null,
    dt: number = 0,
    extraInfo: RearViewExtraInfo | null = null
  ): void {
    if (!carObject || !carObject.position || !carObject.quaternion) return;
    if (!this.camera || !this.smoothHeading || !this.targetHeading) return;

    const carPos = carObject.position;
    const carQuat = carObject.quaternion;

    // 1. Resolve car forward direction in Three.js world coordinates
    // In Three.js vehicle coordinate system, local +X is vehicle forward
    const qx = carQuat.x,
      qy = carQuat.y,
      qz = carQuat.z,
      qw = carQuat.w;
    const fwdX = 1 - 2 * (qy * qy + qz * qz);
    const fwdY = 2 * (qx * qy + qw * qz);
    const fwdZ = 2 * (qx * qz - qw * qy);
    this.carForward.set(fwdX, fwdY, fwdZ);

    // 2. Project forward vector onto horizontal plane (Y = 0)
    const horizLen = Math.hypot(this.carForward.x, this.carForward.z);
    if (horizLen > 1e-4) {
      this.carHorizontal.set(this.carForward.x / horizLen, 0, this.carForward.z / horizLen);
    }

    // 3. Evaluate Grounded vs Airborne / Takeoff indication
    const isGrounded = this.checkGroundedState(extraInfo);

    if (isGrounded) {
      // Grounded state: orient backward relative to car's horizontal heading
      this.targetHeading.copy(this.carHorizontal);
    } else {
      // Airborne state: orient backward relative to horizontal velocity vector
      const vel = extraInfo?.velocity;
      const vx = vel?.x ?? extraInfo?.carView?.velX ?? 0;
      const vz = vel?.z ?? extraInfo?.carView?.velY ?? 0; // RocketSim Y maps to Three.js Z
      const horizSpeed = Math.hypot(vx, vz);

      if (horizSpeed > 15.0) {
        this.velocityHorizontal.set(vx / horizSpeed, 0, vz / horizSpeed);
        this.targetHeading.copy(this.velocityHorizontal);
      } else {
        // Fallback to car horizontal heading when airborne velocity is near zero
        this.targetHeading.copy(this.carHorizontal);
      }
    }

    // 4. Soft-attachment filter (exponential heading smoothing)
    if (!this.isInitialized || dt <= 0) {
      this.smoothHeading.copy(this.targetHeading);
      this.isInitialized = true;
    } else {
      const alpha = 1 - Math.exp(-this.smoothingLambda * Math.min(dt, 0.1));
      this.smoothHeading.x += (this.targetHeading.x - this.smoothHeading.x) * alpha;
      this.smoothHeading.z += (this.targetHeading.z - this.smoothHeading.z) * alpha;
      this.smoothHeading.y = 0;
      const len = Math.hypot(this.smoothHeading.x, this.smoothHeading.z);
      if (len > 1e-4) {
        this.smoothHeading.x /= len;
        this.smoothHeading.z /= len;
      }
    }

    // 5. Inverted coordinate projection
    // Regular car cam: cam behind car (-heading * dist), looking forward (+heading)
    // Rear view: cam ahead of car (+heading * dist), looking backward (-heading)
    const pitchRad = (this.settings?.angleDeg ?? -4) * (Math.PI / 180);
    const dist = this.settings?.distance ?? 270;
    const height = this.settings?.height ?? 90;

    const horizontalDist = dist * Math.cos(pitchRad);
    const verticalDist = dist * Math.sin(pitchRad);

    const camX = carPos.x + this.smoothHeading.x * horizontalDist;
    const camZ = carPos.z + this.smoothHeading.z * horizontalDist;
    const camY = carPos.y + height - verticalDist;

    this.camPosition.set(camX, camY, camZ);
    this.camera.position.copy(this.camPosition);

    // Look target behind the vehicle along -heading
    const targetDist = 200.0;
    this.lookTarget.set(
      carPos.x - this.smoothHeading.x * targetDist,
      carPos.y + height * 0.25,
      carPos.z - this.smoothHeading.z * targetDist
    );

    // 6. Strict Horizon Lock
    // Up vector is strictly aligned with global world Y axis (0, 1, 0) -> Roll = 0
    this.camera.up.set(0, 1, 0);
    this.camera.lookAt(this.lookTarget);

    // 7. Dynamic FOV synchronization (Horizontal-to-Vertical conversion)
    const aspect = this.camera.aspect || 16 / 9;
    const targetVFov = convertHorizontalToVerticalFov(this.settings?.fov ?? 110, aspect);
    if (Math.abs(this.camera.fov - targetVFov) > 0.001) {
      this.camera.fov = targetVFov;
      this.camera.updateProjectionMatrix();
    }
  }

  dispose(): void {
    this.destroy();
  }

  destroy(): void {
    this.camera = null;
    this.settings = null;
    this.smoothHeading = null;
    this.targetHeading = null;
  }
}
