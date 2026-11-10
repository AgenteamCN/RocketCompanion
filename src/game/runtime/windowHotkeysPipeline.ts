import {
  resolveSlotKeyTargetCarEntry,
  type ExpSpawnedCarEntry,
} from '../modes/experimental-multi-bots/ExperimentalMultiBotsMatchMath.ts';

export interface ReplayCameraSlotSnapshot {
  readonly isGoalReplay: boolean;
  readonly isModeReplayActive: boolean;
  readonly isExpSpectatorLive: boolean;
  readonly localTeam: number;
  readonly lastHudSlotCarMap: Readonly<Record<number, number>> | null;
  readonly spawnedCars: ReadonlyArray<ExpSpawnedCarEntry> | null | undefined;
}

export type ReplayCameraSlotCommand =
  | { readonly kind: 'none' }
  | {
      readonly kind: 'select-director';
      readonly resetModeDirectorCamera: boolean;
    }
  | {
      readonly kind: 'select-replay-pov';
      readonly slotKey: number;
      readonly targetCarIndex: number;
      readonly applyToActiveMode: boolean;
    }
  | {
      readonly kind: 'select-live-spectator-pov';
      readonly slotKey: number;
      readonly targetCarIndex: number;
    };

export interface WindowKeyDownSnapshot {
  readonly code: string;
  readonly key: string;
  readonly shiftKey: boolean;
  readonly isOutsideEditableUI: boolean;
  readonly hasNoModifier: boolean;
  readonly isMenuOpen: boolean;
  readonly isOnlineSession: boolean;
  readonly isGoalReplay: boolean;
  readonly isExpSpectatorLive: boolean;
  readonly matchesSkipReplayBinding: boolean;
  readonly isNetworkDiagnosticsPresent: boolean;
  readonly isReplayDirectorTunerPresent: boolean;
  readonly hasHudReplayTogglePause: boolean;
  readonly hasModeGoalReplayTogglePause: boolean;
  readonly hasAppStoreStateReader: boolean;
  readonly hasNetworkManager: boolean;
}

export type WindowHotkeyCommand =
  | { readonly kind: 'none' }
  | { readonly kind: 'skip-replay' }
  | { readonly kind: 'select-camera-slot'; readonly slotKey: number }
  | { readonly kind: 'toggle-hud-replay-pause' }
  | { readonly kind: 'toggle-mode-replay-pause' }
  | { readonly kind: 'toggle-burst-drop' }
  | { readonly kind: 'adjust-simulated-latency'; readonly direction: -1 | 1 }
  | { readonly kind: 'open-main-menu' };

export function isEditableFormElement(el: unknown): boolean {
  if (!el || typeof el !== 'object') return false;
  const elem = el as HTMLElement & { type?: string };
  if (elem.isContentEditable) return true;
  const tag = typeof elem.tagName === 'string' ? elem.tagName.toUpperCase() : '';
  if (tag === 'TEXTAREA' || tag === 'SELECT') return true;
  if (tag === 'INPUT') {
    const type = (elem.type || 'text').toLowerCase();
    return !['range', 'checkbox', 'radio', 'button', 'submit', 'reset', 'color'].includes(type);
  }
  return false;
}

export function parseSlotKeyFromKeyEvent(code: string, key: string): number {
  if (code >= 'Digit0' && code <= 'Digit7') return Number(code.replace('Digit', ''));
  if (code >= 'Numpad0' && code <= 'Numpad7') return Number(code.replace('Numpad', ''));
  if (key >= '0' && key <= '7') return Number(key);
  return -1;
}

export function resolveReplayCameraSlotCommand(
  slotKey: number | null,
  snapshot: ReplayCameraSlotSnapshot
): ReplayCameraSlotCommand {
  if (slotKey === 7 || slotKey === 0 || slotKey === null) {
    if (!snapshot.isGoalReplay) return { kind: 'none' };
    return {
      kind: 'select-director',
      resetModeDirectorCamera: snapshot.isModeReplayActive,
    };
  }

  if (slotKey >= 1 && slotKey <= 6) {
    let targetCarIdx = snapshot.lastHudSlotCarMap?.[slotKey];
    const spawnedCars = snapshot.spawnedCars;
    if (
      (typeof targetCarIdx !== 'number' || targetCarIdx < 0) &&
      spawnedCars &&
      spawnedCars.length > 0
    ) {
      const entry = resolveSlotKeyTargetCarEntry(spawnedCars, snapshot.localTeam, slotKey);
      targetCarIdx = entry ? entry.carIndex : -1;
    }
    if (typeof targetCarIdx !== 'number' || targetCarIdx < 0) {
      return { kind: 'none' };
    }

    if (snapshot.isGoalReplay) {
      return {
        kind: 'select-replay-pov',
        slotKey,
        targetCarIndex: targetCarIdx,
        applyToActiveMode: snapshot.isModeReplayActive,
      };
    }

    if (snapshot.isExpSpectatorLive) {
      return {
        kind: 'select-live-spectator-pov',
        slotKey,
        targetCarIndex: targetCarIdx,
      };
    }
  }

  return { kind: 'none' };
}

export function resolveWindowHotkeyCommand(snapshot: WindowKeyDownSnapshot): WindowHotkeyCommand {
  const {
    code,
    key,
    shiftKey,
    isOutsideEditableUI,
    hasNoModifier,
    isMenuOpen,
    isOnlineSession,
    isGoalReplay,
    isExpSpectatorLive,
    matchesSkipReplayBinding,
    isNetworkDiagnosticsPresent,
    isReplayDirectorTunerPresent,
    hasHudReplayTogglePause,
    hasModeGoalReplayTogglePause,
    hasAppStoreStateReader,
    hasNetworkManager,
  } = snapshot;

  if (
    isGoalReplay &&
    isOutsideEditableUI &&
    hasNoModifier &&
    matchesSkipReplayBinding &&
    !isMenuOpen
  ) {
    return { kind: 'skip-replay' };
  }

  if ((isGoalReplay || isExpSpectatorLive) && isOutsideEditableUI && hasNoModifier && !isMenuOpen) {
    let slotNum = parseSlotKeyFromKeyEvent(code, key);
    if (slotNum === 0 && isNetworkDiagnosticsPresent) slotNum = -1;
    if (slotNum >= 0 && slotNum <= 7) {
      return { kind: 'select-camera-slot', slotKey: slotNum };
    }
  }

  if (
    code === 'KeyP' &&
    hasNoModifier &&
    isOutsideEditableUI &&
    isReplayDirectorTunerPresent &&
    !isOnlineSession &&
    !isMenuOpen
  ) {
    if (isGoalReplay && hasHudReplayTogglePause) {
      return { kind: 'toggle-hud-replay-pause' };
    }
    if (hasModeGoalReplayTogglePause) {
      return { kind: 'toggle-mode-replay-pause' };
    }
  }

  if (isNetworkDiagnosticsPresent && hasNetworkManager && isOutsideEditableUI && hasNoModifier) {
    if ((code === 'Digit8' || code === 'Numpad8' || key === '8') && !shiftKey) {
      return { kind: 'toggle-burst-drop' };
    }
    if (code === 'Digit9' || code === 'Numpad9' || key === '9') {
      return { kind: 'adjust-simulated-latency', direction: -1 };
    }
    if (code === 'Digit0' || code === 'Numpad0' || key === '0') {
      return { kind: 'adjust-simulated-latency', direction: 1 };
    }
  }

  if (code === 'Escape' && !hasAppStoreStateReader && isOutsideEditableUI) {
    return { kind: 'open-main-menu' };
  }

  return { kind: 'none' };
}
