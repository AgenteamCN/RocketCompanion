import { loadInputBindings, saveInputBindings } from '../../config/inputBindings';
import { createDefaultInputBindings } from '../../config/inputBindingValidators';
import { useAppStore } from '../../stores/appStore';
import {
  type ActionBinding,
  INITIAL_BINDINGS,
} from './KeybindingActionRow';

export type KeybindingActionCategory =
  | 'All'
  | 'Driving'
  | 'Aerial'
  | 'Camera'
  | 'Ball Control'
  | 'Session';

export const KEYBINDING_CATEGORIES: KeybindingActionCategory[] = [
  'All',
  'Driving',
  'Aerial',
  'Camera',
  'Ball Control',
  'Session',
];

export const ACTION_CATEGORY_MAP: Record<
  string,
  Exclude<KeybindingActionCategory, 'All'>
> = {
  throttle: 'Driving',
  brake: 'Driving',
  'steer-left': 'Driving',
  'steer-right': 'Driving',
  boost: 'Driving',
  powerslide: 'Driving',
  jump: 'Aerial',
  'air-roll-left': 'Aerial',
  'air-roll-right': 'Aerial',
  'ball-cam': 'Camera',
  'rear-cam': 'Camera',
  'skip-replay': 'Session',
  pause: 'Session',
};

const UI_TO_ENGINE_ACTION_MAP: Record<string, string> = {
  throttle: 'throttleForward',
  brake: 'throttleReverse',
  'steer-left': 'steerLeft',
  'steer-right': 'steerRight',
  boost: 'boost',
  jump: 'jump',
  powerslide: 'powerslide',
  'air-roll-left': 'airRollLeft',
  'air-roll-right': 'airRollRight',
  'ball-cam': 'ballCam',
  'rear-cam': 'rearView',
  'skip-replay': 'skipReplay',
  pause: 'toggleSettings',
};

const SHORTCUT_TO_KEY_CODE: Record<
  string,
  { kind: 'key'; code: string } | { kind: 'mouse'; button: number }
> = {
  SPACE: { kind: 'key', code: 'Space' },
  ENTER: { kind: 'key', code: 'Enter' },
  ESC: { kind: 'key', code: 'Escape' },
  BKSP: { kind: 'key', code: 'Backspace' },
  BACKSPACE: { kind: 'key', code: 'Backspace' },
  TAB: { kind: 'key', code: 'Tab' },
  SHIFT: { kind: 'key', code: 'ShiftLeft' },
  CTRL: { kind: 'key', code: 'ControlLeft' },
  ALT: { kind: 'key', code: 'AltLeft' },
  CAPS: { kind: 'key', code: 'CapsLock' },
  UP: { kind: 'key', code: 'ArrowUp' },
  DOWN: { kind: 'key', code: 'ArrowDown' },
  LEFT: { kind: 'key', code: 'ArrowLeft' },
  RIGHT: { kind: 'key', code: 'ArrowRight' },
  'L-CLICK': { kind: 'mouse', button: 0 },
  'M-CLICK': { kind: 'mouse', button: 1 },
  'R-CLICK': { kind: 'mouse', button: 2 },
};

const SHORTCUT_TO_PAD_BINDING: Record<
  string,
  { kind: 'padButton'; index: number } | { kind: 'padAxis'; axis: number; dir: 1 | -1 }
> = {
  A: { kind: 'padButton', index: 0 },
  B: { kind: 'padButton', index: 1 },
  X: { kind: 'padButton', index: 2 },
  Y: { kind: 'padButton', index: 3 },
  LB: { kind: 'padButton', index: 4 },
  RB: { kind: 'padButton', index: 5 },
  LT: { kind: 'padButton', index: 6 },
  RT: { kind: 'padButton', index: 7 },
  BACK: { kind: 'padButton', index: 8 },
  START: { kind: 'padButton', index: 9 },
  LS: { kind: 'padButton', index: 10 },
  RS: { kind: 'padButton', index: 11 },
  'D-UP': { kind: 'padButton', index: 12 },
  'D-DOWN': { kind: 'padButton', index: 13 },
  'D-LEFT': { kind: 'padButton', index: 14 },
  'D-RIGHT': { kind: 'padButton', index: 15 },
  'LS-L': { kind: 'padAxis', axis: 0, dir: -1 },
  'LS-R': { kind: 'padAxis', axis: 0, dir: 1 },
};

const UI_KEYBINDINGS_STORAGE_KEY = 'rc_ui_action_bindings_v1';

function shortcutToKeyboardSource(
  shortcut: string
): { kind: 'key'; code: string } | { kind: 'mouse'; button: number } {
  const upper = shortcut.trim().toUpperCase();
  if (SHORTCUT_TO_KEY_CODE[upper]) return SHORTCUT_TO_KEY_CODE[upper];
  if (/^[A-Z]$/.test(upper)) return { kind: 'key', code: `Key${upper}` };
  if (/^[0-9]$/.test(upper)) return { kind: 'key', code: `Digit${upper}` };
  return { kind: 'key', code: shortcut };
}

export function loadHydratedActionBindings(): ActionBinding[] {
  if (typeof window === 'undefined') return INITIAL_BINDINGS;
  try {
    const raw = window.localStorage.getItem(UI_KEYBINDINGS_STORAGE_KEY);
    if (!raw) return INITIAL_BINDINGS;
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return INITIAL_BINDINGS;
    const byId = new Map<string, ActionBinding>();
    for (const item of parsed) {
      if (item && typeof item.id === 'string') {
        byId.set(item.id, {
          id: item.id,
          action: typeof item.action === 'string' ? item.action : item.id,
          keyboard: Array.isArray(item.keyboard) ? item.keyboard : [],
          gamepad: Array.isArray(item.gamepad) ? item.gamepad : [],
        });
      }
    }
    return INITIAL_BINDINGS.map((def) => {
      const saved = byId.get(def.id);
      return saved ? { ...def, keyboard: saved.keyboard, gamepad: saved.gamepad } : def;
    });
  } catch {
    return INITIAL_BINDINGS;
  }
}

export function syncActionBindingsToEngine(
  uiBindings: ActionBinding[],
  isReset = false
): void {
  try {
    if (typeof window !== 'undefined') {
      if (isReset) {
        window.localStorage.removeItem(UI_KEYBINDINGS_STORAGE_KEY);
      } else {
        window.localStorage.setItem(
          UI_KEYBINDINGS_STORAGE_KEY,
          JSON.stringify(uiBindings)
        );
      }
    }
    const engineBindings = isReset ? createDefaultInputBindings() : loadInputBindings();
    if (!isReset) {
      for (const item of uiBindings) {
        const engineAct = UI_TO_ENGINE_ACTION_MAP[item.id];
        if (!engineAct) continue;
        if (engineBindings.keyboard) {
          engineBindings.keyboard[engineAct] = item.keyboard
            .slice(0, 2)
            .map(shortcutToKeyboardSource);
        }
        if (engineBindings.pad) {
          engineBindings.pad[engineAct] = item.gamepad
            .map((g) => SHORTCUT_TO_PAD_BINDING[g.trim().toUpperCase()])
            .filter(Boolean)
            .slice(0, 2);
        }
      }
    }
    saveInputBindings(engineBindings);
    useAppStore.getState().bridge?.onBindingsChange?.(engineBindings);
  } catch {
    // Ignore storage errors in restricted environments
  }
}
