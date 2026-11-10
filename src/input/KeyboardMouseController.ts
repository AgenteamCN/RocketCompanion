/**
 * KeyboardMouseController.ts
 * High-performance, low-latency keyboard and mouse input handler with custom bindings,
 * action toggles, aerial pitch/yaw/roll separation, and UI focus evasion.
 */

import { BALL_CONTROL_MODES } from '../physics/RocketSimConstants.ts';
import { subscribeGlobalKeyDown, subscribeGlobalKeyUp } from './hotkeyInputGuard.ts';

export interface KeyInputBindingSource {
  kind: 'key';
  code: string;
}

export interface MouseInputBindingSource {
  kind: 'mouse';
  button: number;
}

export type KeyboardMouseBindingSource = KeyInputBindingSource | MouseInputBindingSource;

export interface KeyboardInputBindingsMap {
  keyboard?: Record<string, KeyboardMouseBindingSource[]>;
}

export interface InputCameraLookVector {
  x: number;
  y: number;
}

export interface VehicleInputControlsState {
  throttle?: number;
  steer?: number;
  pitch?: number;
  yaw?: number;
  roll?: number;
  jump?: boolean | number;
  boost?: boolean | number;
  handbrake?: boolean | number;
}

const KICKOFF_SPAWN_KEY_MAP: Readonly<Record<string, number>> = {
  Digit1: 0,
  Numpad1: 0,
  Digit2: 1,
  Numpad2: 1,
  Digit3: 2,
  Numpad3: 2,
  Digit4: 3,
  Numpad4: 3,
  Digit5: 4,
  Numpad5: 4,
};

/**
 * Detect whether an event target resides inside an interactive UI layer.
 * @param {EventTarget} target
 * @returns {boolean}
 */
export function isEventWithinUI(target: EventTarget | null | undefined): boolean {
  return (
    target instanceof Element &&
    target.closest(
      '.hud-tools, .sheet-overlay, .car-tab, .car-overlay, .match-tab, .match-overlay, .match-hud, .match-result, .status, .event-oscilloscope, .online-overlay, .online-modal, .online-tab-btn, .net-hud, #online-button, .trajectory-overlay, .trajectory-panel, #trajectory-button, #game-ui-root, #game-ui-viewport-host, #game-root'
    ) !== null
  );
}

export type VoidInputCallback = () => void;
export type BallControlInputCallback = (mode: string) => void;
export type KickoffSpawnInputCallback = (spawnIndex: number) => void;

export class KeyboardMouseController {
  _onAuxClick: (e: MouseEvent) => void;
  _onBlur: VoidInputCallback;
  _onContextMenu: (e: MouseEvent) => void;
  _onKeyDown: (e: KeyboardEvent) => void;
  _onKeyUp: (e: KeyboardEvent) => void;
  _onMouseDown: (e: MouseEvent) => void;
  _onMouseUp: (e: MouseEvent) => void;
  _unsubKeyDown: VoidInputCallback | null;
  _unsubKeyUp: VoidInputCallback | null;
  ballControlEnabled: boolean;
  bindings: KeyboardInputBindingsMap | null | undefined;
  cameraLook: InputCameraLookVector;
  captureActive: boolean;
  controls: VehicleInputControlsState;
  inputEnabled: boolean;
  keys: Set<string>;
  look: InputCameraLookVector;
  mouse: Set<number>;
  onBallCamToggle: VoidInputCallback | null;
  onBallControl: BallControlInputCallback | null;
  onFreeCamToggle: VoidInputCallback | null;
  onKickoffSpawnSelect: KickoffSpawnInputCallback | null;
  onReset: VoidInputCallback | null;
  onSettingsToggle: VoidInputCallback | null;

  constructor(bindings?: KeyboardInputBindingsMap | null) {
    this.keys = new Set<string>();
    this.mouse = new Set<number>();
    this.inputEnabled = true;
    this.captureActive = false;
    this.bindings = bindings;
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

    this.onReset = null;
    this.onBallControl = null;
    this.onKickoffSpawnSelect = null;
    this.onBallCamToggle = null;
    this.onSettingsToggle = null;
    this.onFreeCamToggle = null;
    this.ballControlEnabled = true;
    this._unsubKeyDown = null;
    this._unsubKeyUp = null;

    this._onKeyDown = (e: KeyboardEvent) => {
      if (this.captureActive || e.defaultPrevented) return;
      const target = e.target;
      const isTextEntry =
        (target instanceof HTMLInputElement &&
          (target.type === 'text' ||
            target.type === 'number' ||
            target.type === 'search' ||
            target.type === 'password')) ||
        target instanceof HTMLTextAreaElement;
      if (isTextEntry) return;

      // Global developer shortcut: Shift + F to toggle Free Camera
      if (e.shiftKey && e.code === 'KeyF') {
        e.preventDefault();
        this.onFreeCamToggle?.();
        return;
      }

      const source: KeyInputBindingSource = { kind: 'key', code: e.code };
      if (e.repeat) {
        if (this.inputEnabled) this.suppressBrowserDefault(source, e);
        return;
      }
      if (!this.fireToggles(source, e)) {
        if (this.inputEnabled) {
          this.keys.add(e.code);
          this.suppressBrowserDefault(source, e);
        }
      }
    };

    this._onKeyUp = (e: KeyboardEvent) => {
      this.keys.delete(e.code);
    };

    this._onMouseDown = (e: MouseEvent) => {
      if (this.captureActive || isEventWithinUI(e.target)) return;
      const source: MouseInputBindingSource = { kind: 'mouse', button: e.button };
      if (!this.fireToggles(source, e)) {
        if (this.inputEnabled) {
          this.mouse.add(e.button);
          this.suppressBrowserDefault(source, e);
        }
      }
    };

    this._onMouseUp = (e: MouseEvent) => {
      this.mouse.delete(e.button);
    };

    this._onAuxClick = (e: MouseEvent) => {
      if (!this.inputEnabled || this.captureActive || isEventWithinUI(e.target)) return;
      this.suppressBrowserDefault({ kind: 'mouse', button: e.button }, e);
    };

    this._onContextMenu = (e: MouseEvent) => {
      e.preventDefault();
    };

    this._onBlur = () => {
      this.keys.clear();
      this.mouse.clear();
    };

    if (typeof window !== 'undefined') {
      window.addEventListener('keydown', this._onKeyDown);
      window.addEventListener('keyup', this._onKeyUp);
      window.addEventListener('mousedown', this._onMouseDown);
      window.addEventListener('mouseup', this._onMouseUp);
      window.addEventListener('auxclick', this._onAuxClick);
      window.addEventListener('contextmenu', this._onContextMenu);
      window.addEventListener('blur', this._onBlur);
    }
  }

  get enabled(): boolean {
    return this.inputEnabled;
  }

  set enabled(val: boolean) {
    this.inputEnabled = val;
    if (!val) {
      this.keys.clear();
      this.mouse.clear();
    }
  }

  set capturing(val: boolean) {
    this.captureActive = val;
    if (val) {
      this.keys.clear();
      this.mouse.clear();
    }
  }

  setBindings(bindings: KeyboardInputBindingsMap | null | undefined): void {
    this.bindings = bindings;
    this.keys.clear();
    this.mouse.clear();
  }

  resetInputs(): void {
    this.keys.clear();
    this.mouse.clear();
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

  boundSources(action: string): KeyboardMouseBindingSource[] {
    return this.bindings?.keyboard?.[action] ?? [];
  }

  held(action: string): boolean {
    for (const src of this.boundSources(action)) {
      if (src.kind === 'key' && this.keys.has(src.code)) return true;
      if (src.kind === 'mouse' && this.mouse.has(src.button)) return true;
    }
    return false;
  }

  matches(action: string, source: KeyboardMouseBindingSource): boolean {
    for (const src of this.boundSources(action)) {
      if (src.kind === 'key' && source.kind === 'key' && src.code === source.code) return true;
      if (src.kind === 'mouse' && source.kind === 'mouse' && src.button === source.button)
        return true;
    }
    return false;
  }

  fireToggles(source: KeyboardMouseBindingSource, event: KeyboardEvent | MouseEvent): boolean {
    if (this.captureActive) return false;
    if (event && event.defaultPrevented) return false;

    if (this.matches('toggleSettings', source)) {
      event.preventDefault();
      this.onSettingsToggle?.();
      return true;
    }

    const isTyping =
      event &&
      event.target instanceof HTMLElement &&
      ((event.target instanceof HTMLInputElement &&
        (event.target.type === 'text' ||
          event.target.type === 'password' ||
          event.target.type === 'search')) ||
        event.target.tagName === 'TEXTAREA');

    if (!isTyping && this.ballControlEnabled) {
      for (const mode of BALL_CONTROL_MODES) {
        if (this.matches(mode, source)) {
          event.preventDefault();
          this.onBallControl?.(mode);
          return true;
        }
      }
    }

    if (!this.inputEnabled) return false;

    if (!isTyping && this.onKickoffSpawnSelect && source.kind === 'key') {
      if (source.code in KICKOFF_SPAWN_KEY_MAP) {
        event.preventDefault();
        this.onKickoffSpawnSelect(KICKOFF_SPAWN_KEY_MAP[source.code]);
        return true;
      }
    }

    if (this.matches('ballCam', source)) {
      event.preventDefault();
      this.onBallCamToggle?.();
    }

    if (this.matches('resetShot', source)) {
      event.preventDefault();
      this.onReset?.();
    }

    return false;
  }

  suppressBrowserDefault(
    source: KeyboardMouseBindingSource,
    event: KeyboardEvent | MouseEvent
  ): void {
    if (
      (event.ctrlKey && !this.isModifierBound('Control')) ||
      (event.metaKey && !this.isModifierBound('Meta')) ||
      (event.altKey && !this.isModifierBound('Alt'))
    ) {
      return;
    }
    if (this.isBound(source)) {
      event.preventDefault();
    }
  }

  isModifierBound(mod: string): boolean {
    return (
      this.isBound({ kind: 'key', code: `${mod}Left` }) ||
      this.isBound({ kind: 'key', code: `${mod}Right` })
    );
  }

  isBound(source: KeyboardMouseBindingSource): boolean {
    if (!this.bindings?.keyboard) return false;
    for (const act of Object.keys(this.bindings.keyboard)) {
      if (this.matches(act, source)) return true;
    }
    return false;
  }

  axis(negativeAction: string, positiveAction: string): number {
    return (this.held(positiveAction) ? 1 : 0) - (this.held(negativeAction) ? 1 : 0);
  }

  read(): VehicleInputControlsState {
    if (!this.inputEnabled || this.captureActive) {
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
      return this.controls;
    }

    const steer = this.axis('steerLeft', 'steerRight');
    const airRoll = this.held('airRoll');
    const airRollDiscrete = this.axis('airRollLeft', 'airRollRight');
    const roll = Math.max(-1, Math.min(1, airRollDiscrete + (airRoll ? steer : 0)));
    const throttle = this.axis('throttleReverse', 'throttleForward');

    this.controls.throttle = throttle;
    this.controls.steer = steer;
    this.controls.pitch = throttle === 0 ? 0 : -throttle;
    this.controls.yaw = airRoll ? 0 : steer;
    this.controls.roll = roll;
    this.controls.jump = this.held('jump');
    this.controls.boost = this.held('boost');
    this.controls.handbrake = this.held('powerslide');

    this.look.x = this.axis('cameraLeft', 'cameraRight');
    this.look.y = this.axis('cameraUp', 'cameraDown');

    return this.controls;
  }

  dispose() {
    this.destroy();
  }

  destroy() {
    this._unsubKeyDown?.();
    this._unsubKeyDown = null;
    this._unsubKeyUp?.();
    this._unsubKeyUp = null;
    if (typeof window !== 'undefined') {
      window.removeEventListener('mousedown', this._onMouseDown);
      window.removeEventListener('mouseup', this._onMouseUp);
      window.removeEventListener('auxclick', this._onAuxClick);
      window.removeEventListener('contextmenu', this._onContextMenu);
      window.removeEventListener('blur', this._onBlur);
    }
    this.keys.clear();
    this.mouse.clear();
    this.onReset = null;
    this.onBallControl = null;
    this.onBallCamToggle = null;
    this.onSettingsToggle = null;
  }
}
