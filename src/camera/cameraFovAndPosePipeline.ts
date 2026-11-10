/**
 * cameraFovAndPosePipeline.ts
 * Pure mathematical and state-transition pipeline for CameraManager:
 * - Horizontal <-> Vertical FOV conversions (16:9 110 deg standard basis)
 * - Mode-priority arbitration (Free / Podium / Editor / Director / RearView / POV)
 * - Shared camera up-vector and vertical FOV synchronization
 * - Camera pose snapshot construction in Three.js and Unreal coordinates
 */

import * as THREE from 'three';
import { DEFAULT_REPLAY_DIRECTOR_FOV_DEG } from '../ui-core/config/replayDirectorConfig.ts';
import type { CameraSettingsConfig } from '../ui-core/config/cameraDefaults.ts';

export const MIN_HORIZONTAL_FOV_DEG = 10;
export const MAX_HORIZONTAL_FOV_DEG = 150;
export const DEFAULT_HORIZONTAL_FOV_DEG = 110;
export const DEFAULT_PODIUM_CAMERA_FOV_DEG = 45.0;
export const DEFAULT_EDITOR_CAMERA_FOV_DEG = 110.0;

export const CAMERA_MODES = Object.freeze({
  POV: 'pov',
  WASM_POV: 'wasmPov',
  REAR_VIEW: 'rearView',
  FREE: 'free',
  DIRECTOR: 'director',
  PODIUM: 'podium',
  EDITOR: 'editor',
} as const);

export type CameraMode = (typeof CAMERA_MODES)[keyof typeof CAMERA_MODES] | string;

export interface FreeCamStateSnapshot {
  isFreeCam: boolean;
  fovDeg: number;
  aspect: number;
  near: number;
  far: number;
  eyeUnreal: [number, number, number];
  targetUnreal: [number, number, number];
  forwardUnreal: [number, number, number];
  rightUnreal: [number, number, number];
  eyeThreeJs: [number, number, number];
  targetThreeJs: [number, number, number];
  forwardThreeJs: [number, number, number];
  yawUnrealDeg: number;
  pitchUnrealDeg: number;
  freeCamYawRad?: number;
  freeCamPitchRad?: number;
}

export interface CameraOverrideFlags {
  activeMode: CameraMode;
  isFreeCam: boolean;
  isDirectorOverrideActive: boolean;
  isEditorOverrideActive: boolean;
}

export interface CameraFovSources extends CameraOverrideFlags {
  freeCamFov: number;
  directorFov: number;
  editorFov: number;
  podiumFov: number;
  settings: CameraSettingsConfig | null;
}

export interface CameraControllerContract {
  onActivate?: () => void;
  onDeactivate?: () => void;
  resetView: () => void;
  resize: (width: number, height: number) => void;
  update: (
    carObject?: unknown,
    ballObject?: unknown,
    dt?: number,
    extraInfo?: unknown,
    inputState?: {
      isRearViewHeld?: boolean;
      podiumController?: {
        isActive?: boolean;
        updateCamera?: (cameraManager: unknown, dt: number) => void;
      } | null;
    } | null
  ) => void;
  dispose: () => void;
  fov?: number;
  ballCam?: boolean;
}

export interface FrameArbitrationInput {
  isFreeCam: boolean;
  isPodiumActive: boolean;
  isEditorOverrideActive: boolean;
  isDirectorOverrideActive: boolean;
  isRearViewHeld: boolean;
  preferredPovMode: CameraMode;
}

export function resolveOverrideTargetCameraMode(
  nextActive: boolean,
  isFreeCam: boolean,
  activeMode: CameraMode,
  overrideMode: CameraMode,
  preferredPovMode: CameraMode
): CameraMode | null {
  if (nextActive && !isFreeCam) return overrideMode;
  if (!nextActive && activeMode === overrideMode) {
    return isFreeCam ? CAMERA_MODES.FREE : preferredPovMode;
  }
  return null;
}

export function transitionCameraControllerMode(
  controllers: ReadonlyMap<CameraMode, CameraControllerContract>,
  prevMode: CameraMode,
  newMode: CameraMode,
  syncUpAndFov: () => void,
  harness: { activeSource: string; setActiveSource: (source: string) => void },
  cleanJsSource: string,
  wasmSource: string
): void {
  const previous = controllers.get(prevMode);
  if (previous && typeof previous.onDeactivate === 'function') {
    previous.onDeactivate();
  }
  syncUpAndFov();

  if (newMode === CAMERA_MODES.POV && harness.activeSource !== cleanJsSource) {
    harness.setActiveSource(cleanJsSource);
  } else if (newMode === CAMERA_MODES.WASM_POV && harness.activeSource !== wasmSource) {
    harness.setActiveSource(wasmSource);
  }

  const activated = controllers.get(newMode);
  if (!activated) return;
  if (typeof activated.onActivate === 'function') {
    activated.onActivate();
  } else if (!isPovFamilyMode(prevMode) || !isPovFamilyMode(newMode)) {
    activated.resetView();
  }
}

export function applyPovCameraConfigToSharedCamera(
  sharedCamera: THREE.PerspectiveCamera | null,
  currentSettings: CameraSettingsConfig | null,
  fallbackDefaults: CameraSettingsConfig,
  cameraConfig: Partial<CameraSettingsConfig> | null | undefined,
  isPovMode: boolean
): CameraSettingsConfig {
  const settings = currentSettings || { ...fallbackDefaults };
  if (!cameraConfig) return settings;
  Object.assign(settings, cameraConfig);
  if (sharedCamera && isPovMode) {
    const hFov = Number(settings.fov) || DEFAULT_HORIZONTAL_FOV_DEG;
    const targetVFov = convertHorizontalToVerticalFov(hFov, sharedCamera.aspect || 16 / 9);
    if (Math.abs(sharedCamera.fov - targetVFov) > 0.001) {
      sharedCamera.fov = targetVFov;
    }
    sharedCamera.updateProjectionMatrix();
  }
  return settings;
}

export function isPovFamilyMode(mode: CameraMode): boolean {
  return mode === CAMERA_MODES.POV || mode === CAMERA_MODES.WASM_POV;
}

export function isCarAttachedCameraMode(flags: CameraOverrideFlags): boolean {
  return (
    !flags.isFreeCam &&
    !flags.isDirectorOverrideActive &&
    !flags.isEditorOverrideActive &&
    (isPovFamilyMode(flags.activeMode) || flags.activeMode === CAMERA_MODES.REAR_VIEW)
  );
}

export function clampHorizontalFovDeg(
  hFovDeg: unknown,
  fallback: number = DEFAULT_HORIZONTAL_FOV_DEG
): number {
  const num = Number(hFovDeg);
  if (!Number.isFinite(num)) return fallback;
  return Math.max(MIN_HORIZONTAL_FOV_DEG, Math.min(MAX_HORIZONTAL_FOV_DEG, num));
}

export function convertHorizontalToVerticalFov(hFovDeg: number, aspect: number = 16 / 9): number {
  const safeHFov = clampHorizontalFovDeg(hFovDeg);
  const safeAspect = aspect > 0 ? aspect : 16 / 9;
  const halfAngleRad = (safeHFov * Math.PI) / 360;
  return 2 * Math.atan(Math.tan(halfAngleRad) / safeAspect) * (180 / Math.PI);
}

export function convertVerticalToHorizontalFov(vFovDeg: number, aspect: number = 16 / 9): number {
  const safeVFov = Math.max(5, Math.min(165, Number(vFovDeg) || 70));
  const safeAspect = aspect > 0 ? aspect : 16 / 9;
  const halfAngleRad = (safeVFov * Math.PI) / 360;
  return 2 * Math.atan(Math.tan(halfAngleRad) * safeAspect) * (180 / Math.PI);
}

export function resolveModeHorizontalFov(sources: CameraFovSources): number {
  if (sources.activeMode === CAMERA_MODES.FREE || sources.isFreeCam) {
    return sources.freeCamFov;
  }
  if (sources.activeMode === CAMERA_MODES.DIRECTOR || sources.isDirectorOverrideActive) {
    return sources.directorFov;
  }
  if (sources.activeMode === CAMERA_MODES.EDITOR || sources.isEditorOverrideActive) {
    return sources.editorFov;
  }
  if (sources.activeMode === CAMERA_MODES.PODIUM) {
    return sources.podiumFov;
  }
  return Number(sources.settings?.fov) || DEFAULT_HORIZONTAL_FOV_DEG;
}

export function applyCanonicalUpAndHorizontalFov(
  camera: THREE.PerspectiveCamera | null,
  targetHFov: number
): void {
  if (!camera) return;
  camera.up.set(0, 1, 0);
  const aspect = camera.aspect || 16 / 9;
  const targetVFov = convertHorizontalToVerticalFov(targetHFov, aspect);
  if (Math.abs(camera.fov - targetVFov) > 0.001) {
    camera.fov = targetVFov;
    camera.updateProjectionMatrix();
  }
}

export function arbitrateFrameCameraMode(input: FrameArbitrationInput): CameraMode {
  if (input.isFreeCam) return CAMERA_MODES.FREE;
  if (input.isPodiumActive) return CAMERA_MODES.PODIUM;
  if (input.isEditorOverrideActive) return CAMERA_MODES.EDITOR;
  if (input.isDirectorOverrideActive) return CAMERA_MODES.DIRECTOR;
  if (input.isRearViewHeld) return CAMERA_MODES.REAR_VIEW;
  return input.preferredPovMode;
}

export function resolveSnapshotHorizontalFov(
  camera: THREE.PerspectiveCamera | null,
  sources: CameraFovSources
): number {
  const aspect = Number(camera?.aspect) || 16 / 9;
  if (sources.activeMode === CAMERA_MODES.DIRECTOR || sources.isDirectorOverrideActive) {
    return sources.directorFov;
  }
  if (sources.activeMode === CAMERA_MODES.EDITOR || sources.isEditorOverrideActive) {
    return sources.editorFov;
  }
  if (sources.activeMode === CAMERA_MODES.PODIUM) {
    return sources.podiumFov;
  }
  if (camera && typeof camera.fov === 'number' && Number.isFinite(camera.fov)) {
    return Number(convertVerticalToHorizontalFov(camera.fov, aspect).toFixed(3));
  }
  return Number(sources.settings?.fov) || DEFAULT_HORIZONTAL_FOV_DEG;
}

export function buildCameraPoseStateSnapshot(
  cam: THREE.PerspectiveCamera | null,
  free:
    | {
        fov?: number;
        camPosition?: THREE.Vector3;
        forward?: THREE.Vector3;
        right?: THREE.Vector3;
        yaw?: number;
        pitch?: number;
        syncOrientationVectors?: () => void;
      }
    | undefined,
  isFreeCam: boolean,
  fallbackHFov: number
): FreeCamStateSnapshot | null {
  if (free && isFreeCam && free.camPosition && free.forward && free.right) {
    free.syncOrientationVectors?.();
    const pos = free.camPosition;
    const fwd = free.forward;
    const right = free.right;
    const dist = 1000.0;
    const tx = pos.x + fwd.x * dist;
    const ty = pos.y + fwd.y * dist;
    const tz = pos.z + fwd.z * dist;
    const yawUnrealDeg = (Math.atan2(fwd.x, fwd.z) * 180) / Math.PI;
    const pitchUnrealDeg = (Math.asin(Math.max(-1, Math.min(1, fwd.y))) * 180) / Math.PI;
    return {
      isFreeCam: true,
      fovDeg: Number(free.fov) || fallbackHFov,
      aspect:
        Number(cam?.aspect) ||
        (typeof window !== 'undefined' && window.innerHeight > 0
          ? window.innerWidth / window.innerHeight
          : 16 / 9),
      near: Number(cam?.near) || 4,
      far: Number(cam?.far) || 40000,
      eyeUnreal: [pos.x, pos.z, pos.y],
      targetUnreal: [tx, tz, ty],
      forwardUnreal: [fwd.x, fwd.z, fwd.y],
      rightUnreal: [right.x, right.z, right.y],
      eyeThreeJs: [pos.x, pos.y, pos.z],
      targetThreeJs: [tx, ty, tz],
      forwardThreeJs: [fwd.x, fwd.y, fwd.z],
      yawUnrealDeg,
      pitchUnrealDeg,
      freeCamYawRad: free.yaw,
      freeCamPitchRad: free.pitch,
    };
  }

  if (cam) {
    const fwd = new THREE.Vector3(0, 0, -1).applyQuaternion(cam.quaternion).normalize();
    const right = new THREE.Vector3(1, 0, 0).applyQuaternion(cam.quaternion).normalize();
    const pos = cam.position;
    const dist = 1000.0;
    const tx = pos.x + fwd.x * dist;
    const ty = pos.y + fwd.y * dist;
    const tz = pos.z + fwd.z * dist;
    const yawUnrealDeg = (Math.atan2(fwd.x, fwd.z) * 180) / Math.PI;
    const pitchUnrealDeg = (Math.asin(Math.max(-1, Math.min(1, fwd.y))) * 180) / Math.PI;
    const aspect = Number(cam.aspect) || 16 / 9;
    return {
      isFreeCam: false,
      fovDeg: fallbackHFov,
      aspect,
      near: Number(cam.near) || 4,
      far: Number(cam.far) || 40000,
      eyeUnreal: [pos.x, pos.z, pos.y],
      targetUnreal: [tx, tz, ty],
      forwardUnreal: [fwd.x, fwd.z, fwd.y],
      rightUnreal: [right.x, right.z, right.y],
      eyeThreeJs: [pos.x, pos.y, pos.z],
      targetThreeJs: [tx, ty, tz],
      forwardThreeJs: [fwd.x, fwd.y, fwd.z],
      yawUnrealDeg,
      pitchUnrealDeg,
    };
  }
  return null;
}
