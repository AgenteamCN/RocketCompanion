/**
 * Controls:
 * - Movement: WASD (Forward, Strafe Left, Backward, Strafe Right relative to view direction)
 * - Elevation: I (Up / Elevate), M (Down / Lower) [Also Space / Q as aliases]
 * - Boost: Hold Shift to accelerate movement (2.5x speed)
 * - Look: Mouse drag (left or right click and drag anywhere on viewport)
 * - FOV: Configurable via UI tuner slider and programmatic setter
 */

import * as THREE from 'three';
import { subscribeGlobalKeyDown, subscribeGlobalKeyUp } from '../input/hotkeyInputGuard.ts';
import { DEFAULT_REPLAY_DIRECTOR_FOV_DEG } from '../ui-core/config/replayDirectorConfig.ts';
import {
  clampHorizontalFovDeg,
  convertHorizontalToVerticalFov,
} from './cameraFovAndPosePipeline.ts';

export const DEFAULT_FREE_CAMERA_FOV_DEG = DEFAULT_REPLAY_DIRECTOR_FOV_DEG;

export type Vector3TupleOrObject =
  readonly [number?, number?, number?] | number[] | { x?: number; y?: number; z?: number };

export class FreeCameraController {
  private _fov: number;
  private _unsubKeyDown: (() => void) | null;
  private _unsubKeyUp: (() => void) | null;
  public readonly activeKeys: Set<string>;
  public boostMultiplier: number;
  private readonly boundBlur: () => void;
  private readonly boundKeyDown: (e: KeyboardEvent) => void;
  private readonly boundKeyUp: (e: KeyboardEvent) => void;
  private readonly boundPointerDown: (e: PointerEvent) => void;
  private readonly boundPointerMove: (e: PointerEvent) => void;
  private readonly boundPointerUp: () => void;
  public readonly camPosition: THREE.Vector3;
  public camera: THREE.PerspectiveCamera | null;
  public readonly forward: THREE.Vector3;
  public isDragging: boolean;
  public isFreeCamActive: boolean;
  public lastMouseX: number;
  public lastMouseY: number;
  public mouseSensitivity: number;
  public moveSpeed: number;
  public readonly moveVector: THREE.Vector3;
  public onFovChange: ((newFov: number) => void) | null;
  public pitch: number;
  public readonly planarForward: THREE.Vector3;
  public readonly right: THREE.Vector3;
  public settings: Record<string, unknown> | null;
  public shouldSuppressRightClickDrag: (() => boolean) | null;
  public readonly target: THREE.Vector3;
  public readonly up: THREE.Vector3;
  public yaw: number;

  constructor(
    aspect: number = typeof window !== 'undefined'
      ? window.innerWidth / window.innerHeight
      : 16 / 9,
    settings: Record<string, unknown> | null = null,
    existingCamera: THREE.PerspectiveCamera | null = null
  ) {
    this.settings = settings || {};
    this._fov = DEFAULT_FREE_CAMERA_FOV_DEG;
    this.onFovChange = null;
    this.shouldSuppressRightClickDrag = null;

    // Use shared camera if provided, else create standalone with converted vertical FOV
    const initialVFov = convertHorizontalToVerticalFov(this._fov, aspect);
    this.camera = existingCamera || new THREE.PerspectiveCamera(initialVFov, aspect, 4, 40000);

    // Dynamic vectors for calculations
    // Initial spectator overview coordinates overlooking the pitch
    this.camPosition = new THREE.Vector3(0, 1600, -3600);
    this.forward = new THREE.Vector3(0, 0, 1);
    this.planarForward = new THREE.Vector3(0, 0, 1);
    this.right = new THREE.Vector3(1, 0, 0);
    this.up = new THREE.Vector3(0, 1, 0);
    this.target = new THREE.Vector3(0, 0, 0);
    this.moveVector = new THREE.Vector3(0, 0, 0);

    this.yaw = Math.PI;
    this.pitch = -0.35;
    this.syncOrientationVectors();

    this.moveSpeed = 2400; // world units per second
    this.boostMultiplier = 2.5;
    this.mouseSensitivity = 0.0026;

    this.isFreeCamActive = false;
    this.isDragging = false;
    this.lastMouseX = 0;
    this.lastMouseY = 0;
    this.activeKeys = new Set<string>();

    this.boundKeyDown = this._onKeyDown.bind(this);
    this.boundKeyUp = this._onKeyUp.bind(this);
    this.boundPointerDown = this._onPointerDown.bind(this);
    this.boundPointerMove = this._onPointerMove.bind(this);
    this.boundPointerUp = this._onPointerUp.bind(this);
    this.boundBlur = this._onBlur.bind(this);

    this._unsubKeyDown = null;
    this._unsubKeyUp = null;

    if (typeof window !== 'undefined') {
      this._unsubKeyDown = subscribeGlobalKeyDown(this.boundKeyDown, false);
      this._unsubKeyUp = subscribeGlobalKeyUp(this.boundKeyUp, false);
      window.addEventListener('pointerdown', this.boundPointerDown);
      window.addEventListener('pointermove', this.boundPointerMove);
      window.addEventListener('pointerup', this.boundPointerUp);
      window.addEventListener('blur', this.boundBlur);
    }
  }

  get fov(): number {
    return this._fov;
  }

  set fov(val: number) {
    const num = Number(val);
    if (!Number.isNaN(num) && Number.isFinite(num)) {
      this._fov = clampHorizontalFovDeg(num, DEFAULT_FREE_CAMERA_FOV_DEG);
      if (this.isFreeCamActive && this.camera) {
        this.camera.fov = convertHorizontalToVerticalFov(this._fov, this.camera.aspect || 16 / 9);
        this.camera.updateProjectionMatrix();
      }
    }
  }

  /**
   * Called when switching into Free Cam mode.
   * Retains its own last coordinates and view direction (persists across activations).
   */
  onActivate(): void {
    this.isFreeCamActive = true;
    if (this.camera) {
      this.syncOrientationVectors();
      this.camera.position.copy(this.camPosition);
      this.target.copy(this.camPosition).add(this.forward);
      this.camera.up.set(0, 1, 0);
      this.camera.lookAt(this.target);
      this.camera.fov = convertHorizontalToVerticalFov(this._fov, this.camera.aspect || 16 / 9);
      this.camera.updateProjectionMatrix();
    }
  }

  /**
   * Position Free Camera at `position` and orient yaw/pitch to look directly at `lookAtTarget`.
   */
  setPoseLookAt(
    position: Vector3TupleOrObject,
    lookAtTarget: Vector3TupleOrObject = [0, 80, 0]
  ): void {
    if (Array.isArray(position)) {
      this.camPosition.set(position[0] ?? 0, position[1] ?? 720, position[2] ?? -2600);
    } else if (position && typeof (position as { x?: number }).x === 'number') {
      const posObj = position as { x: number; y?: number; z?: number };
      this.camPosition.set(posObj.x, posObj.y ?? 720, posObj.z ?? -2600);
    }
    const targetArr = Array.isArray(lookAtTarget) ? lookAtTarget : null;
    const targetObj = !targetArr ? (lookAtTarget as { x?: number; y?: number; z?: number }) : null;
    const tx = targetArr ? (targetArr[0] ?? 0) : (targetObj?.x ?? 0);
    const ty = targetArr ? (targetArr[1] ?? 80) : (targetObj?.y ?? 80);
    const tz = targetArr ? (targetArr[2] ?? 0) : (targetObj?.z ?? 0);
    const dx = tx - this.camPosition.x;
    const dy = ty - this.camPosition.y;
    const dz = tz - this.camPosition.z;
    const horizDist = Math.hypot(dx, dz);
    if (horizDist > 1e-4) {
      this.yaw = Math.atan2(-dx, -dz);
      this.pitch = Math.max(-1.55, Math.min(1.55, Math.atan2(dy, horizDist)));
    }
    this.onActivate();
  }

  /**
   * Reset position to default stadium spectator overview coordinates
   */
  resetToDefaultOverview(): void {
    this.camPosition.set(0, 1600, -3600);
    this.yaw = Math.PI;
    this.pitch = -0.35;
    this.syncOrientationVectors();
    if (this.camera) {
      this.camera.position.copy(this.camPosition);
      this.target.copy(this.camPosition).add(this.forward);
      this.camera.up.set(0, 1, 0);
      this.camera.lookAt(this.target);
      this.camera.updateProjectionMatrix();
    }
  }

  /**
   * Called when switching out of Free Cam mode.
   */
  onDeactivate(): void {
    this.isFreeCamActive = false;
    this.isDragging = false;
    this.activeKeys.clear();
  }

  resetView(): void {
    this.onActivate();
  }

  syncOrientationVectors(): void {
    const cp = Math.cos(this.pitch);
    const sp = Math.sin(this.pitch);
    const cy = Math.cos(this.yaw);
    const sy = Math.sin(this.yaw);

    // View direction vector (forward)
    this.forward.set(-sy * cp, sp, -cy * cp).normalize();

    // Horizontal planar forward vector (pure XZ plane, zero vertical Y displacement)
    this.planarForward.set(-sy, 0, -cy).normalize();

    // Horizontal right vector (perpendicular to yaw heading)
    this.right.set(cy, 0, -sy).normalize();
  }

  private _isTargetInUI(target: EventTarget | null): boolean {
    if (!(target instanceof Element)) return false;
    return Boolean(
      target.closest(
        'button, input, select, textarea, [role="button"], [role="switch"], [role="dialog"], [role="tab"], .floating-window, #game-ui-root, .hud-tools'
      )
    );
  }

  private _onKeyDown(e: KeyboardEvent): void {
    if (!this.isFreeCamActive) return;

    // Do not capture keys while user is typing in form inputs
    const target = e.target;
    if (
      target instanceof HTMLInputElement ||
      target instanceof HTMLTextAreaElement ||
      (target instanceof HTMLElement && target.isContentEditable)
    ) {
      return;
    }

    const code = e.code;

    // FOV adjustment shortcuts: Minus (-) decreases FOV by 5 deg, Equal (= / +) increases FOV by 5 deg
    if (code === 'Minus' || e.key === '-' || e.key === '_') {
      e.preventDefault();
      const newFov = clampHorizontalFovDeg(this._fov - 5, DEFAULT_FREE_CAMERA_FOV_DEG);
      this.fov = newFov;
      this.onFovChange?.(newFov);
      return;
    }
    if (code === 'Equal' || e.key === '=' || e.key === '+') {
      e.preventDefault();
      const newFov = clampHorizontalFovDeg(this._fov + 5, DEFAULT_FREE_CAMERA_FOV_DEG);
      this.fov = newFov;
      this.onFovChange?.(newFov);
      return;
    }

    const tracked = [
      'KeyW',
      'KeyA',
      'KeyS',
      'KeyD',
      'KeyI',
      'KeyM',
      'Space',
      'KeyV',
      'ShiftLeft',
      'ShiftRight',
    ];
    if (tracked.includes(code)) {
      this.activeKeys.add(code);
      if (code === 'KeyI' || code === 'KeyM' || code === 'KeyV') {
        e.preventDefault();
      }
    }
  }

  private _onKeyUp(e: KeyboardEvent): void {
    this.activeKeys.delete(e.code);
  }

  private _onPointerDown(e: PointerEvent): void {
    if (!this.isFreeCamActive) return;
    if (this._isTargetInUI(e.target)) return;
    // In Static Training Pack edit mode, right-click (button 2) cycles sub-modes
    if (e.button === 2 && this.shouldSuppressRightClickDrag?.()) {
      return;
    }

    this.isDragging = true;
    this.lastMouseX = e.clientX;
    this.lastMouseY = e.clientY;
  }

  private _onPointerMove(e: PointerEvent): void {
    if (!this.isFreeCamActive || !this.isDragging) return;

    const dx = e.clientX - this.lastMouseX;
    const dy = e.clientY - this.lastMouseY;
    this.lastMouseX = e.clientX;
    this.lastMouseY = e.clientY;

    this.yaw -= dx * this.mouseSensitivity;
    this.pitch -= dy * this.mouseSensitivity;

    // Clamp pitch to avoid gimbal lock / flipping upside down
    const maxPitch = Math.PI / 2 - 0.02;
    this.pitch = Math.max(-maxPitch, Math.min(maxPitch, this.pitch));

    this.syncOrientationVectors();
  }

  private _onPointerUp(): void {
    this.isDragging = false;
  }

  private _onBlur(): void {
    this.activeKeys.clear();
    this.isDragging = false;
  }

  resize(width: number, height: number): void {
    if (this.camera && height > 0) {
      this.camera.aspect = width / height;
      if (this.isFreeCamActive) {
        this.camera.fov = convertHorizontalToVerticalFov(this._fov, this.camera.aspect);
      }
      this.camera.updateProjectionMatrix();
    }
  }

  /**
   * Per-frame physics/render step update
   */
  update(
    _carObject?: unknown,
    _ballObject?: unknown,
    dt: number = 0,
    _extraInfo: unknown = null
  ): void {
    if (!this.isFreeCamActive || !this.camera) return;

    const safeDt = Math.max(0.001, Math.min(0.1, dt || 1 / 60));

    let speed = this.moveSpeed;
    if (this.activeKeys.has('ShiftLeft') || this.activeKeys.has('ShiftRight')) {
      speed *= this.boostMultiplier;
    }

    this.moveVector.set(0, 0, 0);

    // WASD: Forward / Backward horizontally along camera yaw heading, Strafe Left / Right
    if (this.activeKeys.has('KeyW')) {
      this.moveVector.add(this.planarForward);
    }
    if (this.activeKeys.has('KeyS')) {
      this.moveVector.sub(this.planarForward);
    }
    if (this.activeKeys.has('KeyD')) {
      this.moveVector.add(this.right);
    }
    if (this.activeKeys.has('KeyA')) {
      this.moveVector.sub(this.right);
    }

    // I and M / Space and V for vertical elevation (I / Space = Up, M / V = Down)
    if (this.activeKeys.has('KeyI') || this.activeKeys.has('Space')) {
      this.moveVector.y += 1.0;
    }
    if (this.activeKeys.has('KeyM') || this.activeKeys.has('KeyV')) {
      this.moveVector.y -= 1.0;
    }

    if (this.moveVector.lengthSq() > 0) {
      this.moveVector.normalize();
      this.camPosition.addScaledVector(this.moveVector, speed * safeDt);
    }

    this.camera.position.copy(this.camPosition);
    this.target.copy(this.camPosition).add(this.forward);
    this.camera.up.set(0, 1, 0);
    this.camera.lookAt(this.target);

    const targetVFov = convertHorizontalToVerticalFov(this._fov, this.camera.aspect || 16 / 9);
    if (Math.abs(this.camera.fov - targetVFov) > 0.01) {
      this.camera.fov = targetVFov;
      this.camera.updateProjectionMatrix();
    }
  }

  dispose(): void {
    this.isFreeCamActive = false;
    this.activeKeys.clear();
    this._unsubKeyDown?.();
    this._unsubKeyDown = null;
    this._unsubKeyUp?.();
    this._unsubKeyUp = null;
    if (typeof window !== 'undefined') {
      window.removeEventListener('pointerdown', this.boundPointerDown);
      window.removeEventListener('pointermove', this.boundPointerMove);
      window.removeEventListener('pointerup', this.boundPointerUp);
      window.removeEventListener('blur', this.boundBlur);
    }
    this.camera = null;
    this.settings = null;
  }
}
