/**
 * GamepadController.ts
 * Advanced Gamepad controller with deadzone shaping, analog triggers,
 * multi-device tracking, camera panning, and ball control shortcuts.
 */

import {
  INPUT_ACTIONS,
  TRIGGER_ANALOG_THRESHOLD,
  ACTIVITY_EPSILON,
  CAMERA_LOOK_DEADZONE,
} from '../ui-core/config/inputConstants.ts';
import { getEffectiveGamepad } from '../ui-core/config/inputBindings.ts';
import { BALL_CONTROL_MODES } from '../physics/RocketSimConstants.ts';

import type {
  InputCameraLookVector,
  VehicleInputControlsState,
} from './KeyboardMouseController.ts';

export interface GamepadButtonBindingSource {
  kind: 'padButton';
  index: number;
}

export interface GamepadAxisBindingSource {
  kind: 'padAxis';
  axis: number;
  dir: number;
}

export type GamepadBindingSource = GamepadButtonBindingSource | GamepadAxisBindingSource;

export interface GamepadAxisRoleConfig {
  axis: number;
  invert: boolean;
}

export interface GamepadAxesConfig {
  steer: GamepadAxisRoleConfig;
  pitch: GamepadAxisRoleConfig;
  deadzone: number;
  triggerThreshold: number;
}

export interface GamepadInputBindingsMap {
  pad?: Record<string, GamepadBindingSource[]>;
  axes?: Partial<GamepadAxesConfig>;
}

export type GamepadAxisRoleName = 'steer' | 'pitch';

const DEFAULT_GAMEPAD_AXES: GamepadAxesConfig = {
  steer: { axis: 0, invert: false },
  pitch: { axis: 1, invert: false },
  deadzone: 0.12,
  triggerThreshold: 0.15,
};

export const VEHICLE_ACTIONS = INPUT_ACTIONS.filter(
  (i) => i.group === 'Driving' || i.group === 'Aerial'
);

export class GamepadController {
  activityValues: number[];
  bindings: GamepadInputBindingsMap;
  cameraLook: InputCameraLookVector;
  captureActive: boolean;
  controls: VehicleInputControlsState;
  deviceIdentity: string | null | undefined;
  enabled: boolean;
  lastActive: boolean;
  look: InputCameraLookVector;
  onActivity: (() => void) | null;
  onBallCamToggle: (() => void) | null;
  onBallControl: ((mode: string) => void) | null;
  onReset: (() => void) | null;
  onSettingsToggle: (() => void) | null;
  prevBallCam: boolean;
  prevReset: boolean;
  prevSettings: boolean;
  previousBallActions: Set<string>;

  constructor(bindings: GamepadInputBindingsMap = {}) {
    this.bindings = bindings;
    this.enabled = true;
    this.captureActive = false;
    this.lastActive = false;
    this.deviceIdentity = undefined;
    this.activityValues = [];
    this.previousBallActions = new Set<string>();
    this.prevBallCam = false;
    this.prevReset = false;
    this.prevSettings = false;

    this.look = { x: 0, y: 0 };
    this.cameraLook = this.look;
    this.controls = {
      throttle: 0,
      steer: 0,
      pitch: 0,
      yaw: 0,
      roll: 0,
      jump: false,
      boost: false,
      handbrake: false,
    };

    this.onBallCamToggle = null;
    this.onReset = null;
    this.onBallControl = null;
    this.onSettingsToggle = null;
    this.onActivity = null;
  }

  active(): boolean {
    return this.lastActive;
  }

  set capturing(val: boolean) {
    this.captureActive = val;
  }

  setBindings(bindings: GamepadInputBindingsMap): void {
    this.bindings = bindings;
  }

  private getAxesConfig(): GamepadAxesConfig {
    return {
      steer: this.bindings?.axes?.steer ?? DEFAULT_GAMEPAD_AXES.steer,
      pitch: this.bindings?.axes?.pitch ?? DEFAULT_GAMEPAD_AXES.pitch,
      deadzone: this.bindings?.axes?.deadzone ?? DEFAULT_GAMEPAD_AXES.deadzone,
      triggerThreshold:
        this.bindings?.axes?.triggerThreshold ?? DEFAULT_GAMEPAD_AXES.triggerThreshold,
    };
  }

  /**
   * Apply radial deadzone filtering with linear ramp-up from threshold to 1.
   * @param {number} val
   * @param {number} [threshold=this.bindings.axes.deadzone]
   * @returns {number}
   */
  dz(val: number, threshold: number = this.getAxesConfig().deadzone): number {
    if (Math.abs(val) < threshold) return 0;
    return Math.sign(val) * ((Math.abs(val) - threshold) / (1 - threshold));
  }

  axisRole(role: GamepadAxisRoleName, pad: Gamepad): number {
    const cfg = this.getAxesConfig()[role];
    const raw = this.dz(pad.axes[cfg.axis] ?? 0);
    return cfg.invert ? -raw : raw;
  }

  analogValue(
    action: string,
    pad: Gamepad,
    deadzone: number = this.getAxesConfig().deadzone
  ): number {
    let maxVal = 0;
    const sources = this.bindings?.pad?.[action] ?? [];
    for (const src of sources) {
      maxVal = Math.max(maxVal, this.sourceTravel(src, pad, deadzone));
    }
    return maxVal;
  }

  sourceTravel(
    src: GamepadBindingSource,
    pad: Gamepad,
    deadzone: number = this.getAxesConfig().deadzone
  ): number {
    if (src.kind === 'padButton') {
      const btn = pad.buttons[src.index];
      if (!btn) return 0;
      return btn.value > 0 ? btn.value : btn.pressed ? 1 : 0;
    }
    if (src.kind === 'padAxis') {
      return Math.max(0, this.dz(pad.axes[src.axis] ?? 0, deadzone) * src.dir);
    }
    return 0;
  }

  pressed(action: string, pad: Gamepad | null = getEffectiveGamepad()): boolean {
    if (!pad) return false;
    const sources = this.bindings?.pad?.[action] ?? [];
    for (const src of sources) {
      if (src.kind === 'padButton') {
        const btn = pad.buttons[src.index];
        if (btn?.pressed) return true;
      } else if (src.kind === 'padAxis') {
        if (this.sourceTravel(src, pad) > TRIGGER_ANALOG_THRESHOLD) return true;
      }
    }
    return false;
  }

  read(): VehicleInputControlsState {
    const pad = getEffectiveGamepad();
    const currentId = pad ? `${pad.id}\0${pad.index}` : null;

    if (currentId !== this.deviceIdentity) {
      const hadPrevious = this.deviceIdentity !== undefined;
      this.deviceIdentity = currentId;
      this.activityValues.length = 0;
      this.previousBallActions.clear();
      this.prevBallCam = false;
      this.prevReset = false;
      this.prevSettings = false;

      if (pad && hadPrevious) {
        this.prevBallCam = this.pressed('ballCam', pad);
        this.prevReset = this.pressed('resetShot', pad);
        this.prevSettings = this.pressed('toggleSettings', pad);
        for (const mode of BALL_CONTROL_MODES) {
          if (this.pressed(mode, pad)) this.previousBallActions.add(mode);
        }
        this.trackActivity(pad, false);
      }
    }

    if (!pad) {
      this.activityValues.length = 0;
      this.previousBallActions.clear();
      this.lastActive = false;
      this.resetControls();
      return this.controls;
    }

    this.trackActivity(pad);

    const axesCfg = this.getAxesConfig();
    const steerAxis = axesCfg.steer;
    const pitchAxis = axesCfg.pitch;
    this.lastActive =
      this.enabled &&
      (Math.abs(pad.axes[steerAxis.axis] ?? 0) > axesCfg.deadzone ||
        Math.abs(pad.axes[pitchAxis.axis] ?? 0) > axesCfg.deadzone ||
        this.hasActiveVehicleBinding(pad));

    // Settings Toggle
    const settingsPressed = this.pressed('toggleSettings', pad);
    if (!this.captureActive && settingsPressed && !this.prevSettings) {
      this.onSettingsToggle?.();
    }
    this.prevSettings = settingsPressed;

    // Ball Cam Toggle
    const ballCamPressed = this.pressed('ballCam', pad);
    if (this.enabled && !this.captureActive && ballCamPressed && !this.prevBallCam) {
      this.onBallCamToggle?.();
    }
    this.prevBallCam = ballCamPressed;

    // Reset Shot
    const resetPressed = this.pressed('resetShot', pad);
    if (this.enabled && !this.captureActive && resetPressed && !this.prevReset) {
      this.onReset?.();
    }
    this.prevReset = resetPressed;

    // Ball Control Toggles
    for (const mode of BALL_CONTROL_MODES) {
      const isDown = this.pressed(mode, pad);
      if (isDown && !this.previousBallActions.has(mode) && this.enabled && !this.captureActive) {
        this.onBallControl?.(mode);
      }
      if (isDown) {
        this.previousBallActions.add(mode);
      } else {
        this.previousBallActions.delete(mode);
      }
    }

    if (!this.enabled || this.captureActive) {
      this.lastActive = false;
      this.resetControls();
      return this.controls;
    }

    // Steering and Aerials
    const analogSteer = this.axisRole('steer', pad);
    const digitalSteer =
      (this.pressed('steerRight', pad) ? 1 : 0) - (this.pressed('steerLeft', pad) ? 1 : 0);
    const totalSteer = Math.max(-1, Math.min(1, analogSteer + digitalSteer));

    const powerslideActive = this.analogValue('powerslide', pad) > axesCfg.triggerThreshold;
    const airRollActive = this.analogValue('airRoll', pad) > axesCfg.triggerThreshold;
    const airRollLeft = this.pressed('airRollLeft', pad);
    const airRollRight = this.pressed('airRollRight', pad);

    let yaw = totalSteer;
    let roll = 0;

    if (airRollLeft || airRollRight) {
      roll = Number(airRollRight) - Number(airRollLeft);
    } else if (airRollActive) {
      roll = totalSteer;
      yaw = 0;
    }

    this.controls.throttle =
      this.analogValue('throttleForward', pad) - this.analogValue('throttleReverse', pad);
    this.controls.steer = totalSteer;
    this.controls.pitch = this.axisRole('pitch', pad);
    this.controls.yaw = yaw;
    this.controls.roll = roll;
    this.controls.jump = this.pressed('jump', pad);
    this.controls.boost = this.pressed('boost', pad);
    this.controls.handbrake = powerslideActive;

    this.look.x =
      this.analogValue('cameraRight', pad, CAMERA_LOOK_DEADZONE) -
      this.analogValue('cameraLeft', pad, CAMERA_LOOK_DEADZONE);
    this.look.y =
      this.analogValue('cameraDown', pad, CAMERA_LOOK_DEADZONE) -
      this.analogValue('cameraUp', pad, CAMERA_LOOK_DEADZONE);

    return this.controls;
  }

  resetControls(): void {
    this.look.x = 0;
    this.look.y = 0;
    this.controls.throttle = 0;
    this.controls.steer = 0;
    this.controls.pitch = 0;
    this.controls.yaw = 0;
    this.controls.roll = 0;
    this.controls.jump = false;
    this.controls.boost = false;
    this.controls.handbrake = false;
  }

  trackActivity(pad: Gamepad, notify: boolean = true): void {
    let hasChanged = false;
    const axesCfg = this.getAxesConfig();
    const totalInputs = pad.axes.length + pad.buttons.length;

    for (let s = 0; s < totalInputs; s++) {
      let currentVal = 0;
      if (s < pad.axes.length) {
        const ax = pad.axes[s];
        if (Math.abs(ax) > axesCfg.deadzone) currentVal = ax;
      } else {
        const btn = pad.buttons[s - pad.axes.length];
        if (btn && (btn.pressed || btn.value > axesCfg.triggerThreshold)) {
          currentVal = btn.value || 1;
        }
      }

      const prev = this.activityValues[s] ?? 0;
      const changed =
        currentVal !== 0 &&
        (prev === 0 ||
          Math.sign(currentVal) !== Math.sign(prev) ||
          Math.abs(currentVal - prev) >= ACTIVITY_EPSILON);

      if (currentVal === 0 || changed) {
        this.activityValues[s] = currentVal;
      }
      if (changed) hasChanged = true;
    }

    if (hasChanged && notify) {
      this.onActivity?.();
    }
  }

  hasActiveVehicleBinding(pad: Gamepad): boolean {
    const axesCfg = this.getAxesConfig();
    for (const action of VEHICLE_ACTIONS) {
      if (action.analog) {
        const threshold =
          action.id === 'powerslide' || action.id === 'airRoll' ? axesCfg.triggerThreshold : 0;
        if (this.analogValue(action.id, pad) > threshold) return true;
      } else if (this.pressed(action.id, pad)) {
        return true;
      }
    }
    return false;
  }

  dispose(): void {
    this.destroy();
  }

  destroy(): void {
    this.enabled = false;
    this.resetControls();
    this.activityValues.length = 0;
    this.previousBallActions.clear();
    this.onBallCamToggle = null;
    this.onReset = null;
    this.onBallControl = null;
    this.onSettingsToggle = null;
    this.onActivity = null;
  }
}
