import { isPlainObject } from './storageHelpers';
import { ACTION_LABELS_BY_ID, KEY_DISPLAY_NAMES, MOUSE_BUTTON_NAMES, XBOX_BUTTON_NAMES, PLAYSTATION_BUTTON_NAMES, AXIS_NAMES } from './inputConstants';

export type KeyboardInputBindingItem =
  | { kind: 'key'; code: string }
  | { kind: 'mouse'; button: number };

export type GamepadInputBindingItem =
  | { kind: 'padButton'; index: number }
  | { kind: 'padAxis'; axis: number; dir: 1 | -1 };

export type InputBindingItem = KeyboardInputBindingItem | GamepadInputBindingItem;

export interface InputAxisConfig {
  axis: number;
  invert: boolean;
}

export interface InputAxesBindings {
  steer: InputAxisConfig;
  pitch: InputAxisConfig;
  deadzone: number;
  triggerThreshold: number;
}

export type InputBindingsConfig = {
  keyboard: Record<string, KeyboardInputBindingItem[]>;
  pad: Record<string, GamepadInputBindingItem[]>;
  axes: InputAxesBindings;
};

export function createDefaultKeyboardBindings(): Record<string, KeyboardInputBindingItem[]> {
  return {
    throttleForward: [{ kind: 'key', code: 'KeyW' }],
    throttleReverse: [{ kind: 'key', code: 'KeyS' }],
    steerLeft: [{ kind: 'key', code: 'KeyA' }],
    steerRight: [{ kind: 'key', code: 'KeyD' }],
    boost: [
      { kind: 'mouse', button: 0 },
      { kind: 'key', code: 'Period' },
    ],
    jump: [
      { kind: 'mouse', button: 2 },
      { kind: 'key', code: 'Slash' },
    ],
    powerslide: [
      { kind: 'key', code: 'ShiftLeft' },
      { kind: 'key', code: 'ShiftRight' },
    ],
    airRoll: [],
    airRollLeft: [{ kind: 'key', code: 'KeyQ' }],
    airRollRight: [{ kind: 'key', code: 'KeyE' }],
    ballCam: [{ kind: 'key', code: 'Space' }],
    rearView: [
      { kind: 'mouse', button: 1 },
      { kind: 'key', code: 'KeyR' },
    ],
    cameraLeft: [{ kind: 'key', code: 'KeyZ' }],
    cameraRight: [{ kind: 'key', code: 'KeyC' }],
    cameraUp: [],
    cameraDown: [],
    takePossession: [{ kind: 'key', code: 'Digit1' }],
    startDribble: [{ kind: 'key', code: 'Digit2' }],
    passBall: [{ kind: 'key', code: 'Digit3' }],
    launchBall: [{ kind: 'key', code: 'Digit4' }],
    resetShot: [{ kind: 'key', code: 'Backspace' }],
    skipReplay: [{ kind: 'key', code: 'Enter' }],
    toggleSettings: [{ kind: 'key', code: 'Escape' }],
  };
}

export function createDefaultGamepadBindings(): Record<string, GamepadInputBindingItem[]> {
  return {
    throttleForward: [{ kind: 'padButton', index: 7 }],
    throttleReverse: [{ kind: 'padAxis', axis: 1, dir: 1 }],
    steerLeft: [],
    steerRight: [],
    boost: [{ kind: 'padButton', index: 5 }],
    jump: [{ kind: 'padButton', index: 2 }],
    powerslide: [{ kind: 'padButton', index: 6 }],
    airRoll: [{ kind: 'padButton', index: 6 }],
    airRollLeft: [{ kind: 'padButton', index: 0 }],
    airRollRight: [],
    ballCam: [{ kind: 'padButton', index: 3 }],
    rearView: [],
    cameraLeft: [{ kind: 'padAxis', axis: 2, dir: -1 }],
    cameraRight: [{ kind: 'padAxis', axis: 2, dir: 1 }],
    cameraUp: [{ kind: 'padAxis', axis: 3, dir: -1 }],
    cameraDown: [{ kind: 'padAxis', axis: 3, dir: 1 }],
    takePossession: [{ kind: 'padButton', index: 13 }],
    startDribble: [{ kind: 'padButton', index: 12 }],
    passBall: [{ kind: 'padButton', index: 14 }],
    launchBall: [{ kind: 'padButton', index: 15 }],
    resetShot: [
      { kind: 'padButton', index: 11 },
      { kind: 'padButton', index: 8 },
    ],
    skipReplay: [{ kind: 'padButton', index: 0 }],
    toggleSettings: [{ kind: 'padButton', index: 9 }],
  };
}

export function createDefaultInputBindings(): InputBindingsConfig {
  return {
    keyboard: createDefaultKeyboardBindings(),
    pad: createDefaultGamepadBindings(),
    axes: {
      steer: { axis: 0, invert: false },
      pitch: { axis: 1, invert: false },
      deadzone: 0.12,
      triggerThreshold: 0.15,
    },
  };
}

export function areBindingsEqual(
  a: InputBindingItem | null | undefined,
  b: InputBindingItem | null | undefined
): boolean {
  if (!a || !b || a.kind !== b.kind) return false;
  if (a.kind === 'key' && b.kind === 'key') return a.code === b.code;
  if (a.kind === 'mouse' && b.kind === 'mouse') return a.button === b.button;
  if (a.kind === 'padButton' && b.kind === 'padButton') return a.index === b.index;
  if (a.kind === 'padAxis' && b.kind === 'padAxis') return a.axis === b.axis && a.dir === b.dir;
  return false;
}

export function getBindingCategory(binding: { kind: string }): 'keyboard' | 'pad' {
  return binding.kind === 'key' || binding.kind === 'mouse' ? 'keyboard' : 'pad';
}

export function validateBinding(b: unknown): b is InputBindingItem {
  if (!isPlainObject(b)) return false;
  switch (b.kind) {
    case 'key':
      return typeof b.code === 'string' && b.code.length > 0;
    case 'mouse':
      return typeof b.button === 'number' && Number.isInteger(b.button) && b.button >= 0;
    case 'padButton':
      return typeof b.index === 'number' && Number.isInteger(b.index) && b.index >= 0;
    case 'padAxis':
      return (
        typeof b.axis === 'number' &&
        Number.isInteger(b.axis) &&
        b.axis >= 0 &&
        (b.dir === 1 || b.dir === -1)
      );
    default:
      return false;
  }
}

export function assignBinding(
  bindings: InputBindingsConfig,
  device: 'keyboard' | 'pad',
  action: string,
  slot: number,
  newBinding: InputBindingItem
): { changed: boolean } {
  const currentSlots = bindings[device][action] as InputBindingItem[];
  if (
    getBindingCategory(newBinding) !== device ||
    !Number.isInteger(slot) ||
    slot < 0 ||
    slot > currentSlots.length ||
    slot >= 2
  ) {
    return { changed: false };
  }
  if (currentSlots.some((existing: InputBindingItem) => areBindingsEqual(existing, newBinding))) {
    return { changed: false };
  }
  if (slot < currentSlots.length) {
    currentSlots[slot] = newBinding;
  } else {
    currentSlots.push(newBinding);
  }
  return { changed: true };
}

export function removeBinding(
  bindings: InputBindingsConfig,
  device: 'keyboard' | 'pad',
  action: string,
  slot: number
): void {
  const list = bindings[device][action] as InputBindingItem[];
  if (slot >= 0 && slot < list.length) {
    list.splice(slot, 1);
  }
}

export function resetDeviceBindings(bindings: InputBindingsConfig, device: 'keyboard' | 'pad'): void {
  if (device === 'keyboard') {
    bindings.keyboard = createDefaultKeyboardBindings();
  } else {
    bindings.pad = createDefaultGamepadBindings();
  }
}

export function resetAxisBindings(bindings: InputBindingsConfig): void {
  bindings.axes = createDefaultInputBindings().axes;
}

export function formatKeyDisplayName(code: string): string {
  const custom = (KEY_DISPLAY_NAMES as Record<string, string | undefined>)[code];
  if (custom) return custom;
  if (code.startsWith('Key')) return code.slice(3);
  if (code.startsWith('Digit')) return code.slice(5);
  if (code.startsWith('Numpad')) return `Num ${code.slice(6)}`;
  return code;
}

export function formatAxisName(axis: number): string {
  return (AXIS_NAMES as Record<number, string | undefined>)[axis] ?? `Axis ${axis}`;
}

export function formatAxisDirectionName(axis: number, dir: number): string {
  const stick = axis < 2 ? 'L Stick' : 'R Stick';
  return axis % 2 === 0
    ? `${stick} ${dir > 0 ? 'Right' : 'Left'}`
    : `${stick} ${dir > 0 ? 'Down' : 'Up'}`;
}

export function detectControllerType(id?: string | null): 'playstation' | 'xbox' {
  return id && /playstation|dualshock|dualsense|sony|054c/i.test(id) ? 'playstation' : 'xbox';
}

export function formatBindingDisplayName(
  binding: InputBindingItem | null | undefined,
  controllerType: 'playstation' | 'xbox' = 'xbox'
): string {
  if (!binding) return '';
  switch (binding.kind) {
    case 'key':
      return formatKeyDisplayName(binding.code);
    case 'mouse':
      return (MOUSE_BUTTON_NAMES as Record<number, string | undefined>)[binding.button] ?? `Mouse ${binding.button + 1}`;
    case 'padButton': {
      const names = (controllerType === 'playstation' ? PLAYSTATION_BUTTON_NAMES : XBOX_BUTTON_NAMES) as Record<number, string | undefined>;
      return names[binding.index] ?? `Button ${binding.index}`;
    }
    case 'padAxis':
      return formatAxisDirectionName(binding.axis, binding.dir);
    default:
      return '';
  }
}

export function getActionLabel(actionId: string): string {
  return ACTION_LABELS_BY_ID[actionId] ?? actionId;
}

