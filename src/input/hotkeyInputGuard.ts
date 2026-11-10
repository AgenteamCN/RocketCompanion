/**
 * hotkeyInputGuard.ts
 * Unified guard and router for global window keydown/keyup hotkeys across gameplay modes and replay controllers.
 * Prevents hotkeys from firing while typing into inputs/selects/contentEditable elements,
 * while modal dialogues are open, or when the main menu overlay blocks live gameplay.
 */

import { useAppStore } from '../game/runtimeUiPort.ts';

export interface EditableElementCandidate {
  tagName?: string;
  isContentEditable?: boolean;
}

export interface HotkeyRuntimeOverlayPort {
  openOverlays?: { size?: number } | null;
}

export interface GlobalHotkeyGuardOptions {
  allowWhenLivePreviewCollapsed?: boolean;
  allowWhenMenuOpen?: boolean;
  blockOnRuntimeOverlays?: boolean;
}

export function hasActiveModalDialogue(): boolean {
  return typeof document !== 'undefined' && document.querySelector('[role="dialog"]') !== null;
}

export function isEditableDomElement(
  node: EventTarget | Element | EditableElementCandidate | null | undefined
): boolean {
  if (!node || typeof node !== 'object') return false;
  const candidate = node as EditableElementCandidate;
  const tag = candidate.tagName ? String(candidate.tagName).toUpperCase() : '';
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true;
  if (candidate.isContentEditable) return true;
  return false;
}

export function isEditableEventTarget(
  event: { target?: EventTarget | null } | null | undefined
): boolean {
  if (isEditableDomElement(event?.target)) return true;
  const activeEl = typeof document !== 'undefined' ? document.activeElement : null;
  if (isEditableDomElement(activeEl)) return true;
  return false;
}

export function isGlobalHotkeyBlockedByUi(
  event: { target?: EventTarget | null } | null | undefined,
  runtime: HotkeyRuntimeOverlayPort | null = null,
  options: GlobalHotkeyGuardOptions = {}
): boolean {
  if (isEditableEventTarget(event)) return true;
  if (hasActiveModalDialogue()) return true;

  const appState = useAppStore.getState();
  if (options.allowWhenLivePreviewCollapsed) {
    if (appState.isOpen && !appState.isLivePreviewCollapsed) return true;
  } else if (options.allowWhenMenuOpen !== true) {
    if (appState.isOpen) return true;
  }

  if (options.blockOnRuntimeOverlays && (runtime?.openOverlays?.size ?? 0) > 0) {
    return true;
  }

  return false;
}

const keyDownCaptureHandlers = new Set<(e: KeyboardEvent) => void>();
const keyDownBubbleHandlers = new Set<(e: KeyboardEvent) => void>();
const keyUpCaptureHandlers = new Set<(e: KeyboardEvent) => void>();
const keyUpBubbleHandlers = new Set<(e: KeyboardEvent) => void>();
let isGlobalRouterAttached = false;

function dispatchSet(handlers: Set<(e: KeyboardEvent) => void>, event: KeyboardEvent): void {
  for (const handler of Array.from(handlers)) {
    handler(event);
  }
}

function onGlobalKeyDownCapture(event: KeyboardEvent): void {
  dispatchSet(keyDownCaptureHandlers, event);
}

function onGlobalKeyDownBubble(event: KeyboardEvent): void {
  dispatchSet(keyDownBubbleHandlers, event);
}

function onGlobalKeyUpCapture(event: KeyboardEvent): void {
  dispatchSet(keyUpCaptureHandlers, event);
}

function onGlobalKeyUpBubble(event: KeyboardEvent): void {
  dispatchSet(keyUpBubbleHandlers, event);
}

function syncGlobalRouterListeners(): void {
  if (typeof window === 'undefined') return;
  const hasAny =
    keyDownCaptureHandlers.size > 0 ||
    keyDownBubbleHandlers.size > 0 ||
    keyUpCaptureHandlers.size > 0 ||
    keyUpBubbleHandlers.size > 0;

  if (hasAny && !isGlobalRouterAttached) {
    window.addEventListener('keydown', onGlobalKeyDownCapture, true);
    window.addEventListener('keydown', onGlobalKeyDownBubble, false);
    window.addEventListener('keyup', onGlobalKeyUpCapture, true);
    window.addEventListener('keyup', onGlobalKeyUpBubble, false);
    isGlobalRouterAttached = true;
  } else if (!hasAny && isGlobalRouterAttached) {
    window.removeEventListener('keydown', onGlobalKeyDownCapture, true);
    window.removeEventListener('keydown', onGlobalKeyDownBubble, false);
    window.removeEventListener('keyup', onGlobalKeyUpCapture, true);
    window.removeEventListener('keyup', onGlobalKeyUpBubble, false);
    isGlobalRouterAttached = false;
  }
}

export function subscribeGlobalKeyDown(
  handler: (e: KeyboardEvent) => void,
  capture = false
): () => void {
  if (typeof handler !== 'function') return () => {};
  const set = capture ? keyDownCaptureHandlers : keyDownBubbleHandlers;
  set.add(handler);
  syncGlobalRouterListeners();
  return () => {
    set.delete(handler);
    syncGlobalRouterListeners();
  };
}

export function subscribeGlobalKeyUp(
  handler: (e: KeyboardEvent) => void,
  capture = false
): () => void {
  if (typeof handler !== 'function') return () => {};
  const set = capture ? keyUpCaptureHandlers : keyUpBubbleHandlers;
  set.add(handler);
  syncGlobalRouterListeners();
  return () => {
    set.delete(handler);
    syncGlobalRouterListeners();
  };
}
