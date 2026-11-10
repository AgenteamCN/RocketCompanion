import * as THREE from 'three';
import {
  useStaticTrainingPackStore,
  getActiveEditItemVariable,
  mutateActiveEditItemVariable,
  useStaticTrainingBallCamTunerStore,
  useAppStore,
  floatingStore,
} from '../../runtimeUiPort.ts';
import { isEditableEventTarget } from '../../../input/hotkeyInputGuard.ts';
import {
  type StaticTrainingEditorCameraPort,
  type StaticTrainingEditSubMode,
  type StaticTrainingShotConfig,
  computeEditorContinuousDeltas,
  resolveCurrentStaticTrainingShotConfig,
} from './ShotGizmoMath.ts';
import {
  EDITOR_HELD_KEY_CODES,
  applyShotDraftPatch,
  computeContinuousDeltasShotPatch,
  computeDiscreteEditKeyMutation,
  computeMouseDragShotPatch,
  syncEditorCameraForSubMode,
} from './shotEditorMutationPipeline.ts';

export type { StaticTrainingEditorCameraPort };

export type StaticTrainingEditorCommand =
  | 'reload-shot'
  | 'toggle-single-shot-test'
  | 'toggle-trajectory-test'
  | 'stop-trajectory-test'
  | 'toggle-replay-pause';

export type StaticTrainingEditorCommandHandler = (command: StaticTrainingEditorCommand) => void;

const UI_INTERACTIVE_SELECTOR =
  '[data-panel="container"], [data-ui-element="edge-inspector-drawer"], [data-ui-element="floating-window"], [data-ui-interactive="true"], [role="dialog"], button, input, select, textarea, [style*="pointer-events: auto"]';

function isModalBlockingInput(): boolean {
  const hasDialog =
    typeof document !== 'undefined' && document.querySelector('[role="dialog"]') !== null;
  const appState = useAppStore.getState();
  return Boolean(hasDialog || (appState.isOpen && !appState.isLivePreviewCollapsed));
}

function isReplayDirectorTunerWindowPresent(): boolean {
  const windows = floatingStore.getSnapshot()?.windows || [];
  return windows.some((w: { id?: string }) => w.id === 'replay-director-tuner');
}

function isNonRepeatLetterKey(evt: KeyboardEvent, code: string, lower: string): boolean {
  return !evt.repeat && (evt.code === code || evt.key === lower || evt.key === lower.toUpperCase());
}

export class StaticTrainingShotEditor {
  private readonly dispatchCommand: StaticTrainingEditorCommandHandler;

  public readonly heldKeys = new Set<string>();
  public isLeftMouseDragging = false;
  public lastMouseX = 0;
  public lastMouseY = 0;
  public ballSpeedZeroLatch = false;

  private sessionAbort: AbortController | null = null;

  constructor(dispatchCommand: StaticTrainingEditorCommandHandler) {
    this.dispatchCommand = dispatchCommand;
  }

  resetInputState(): void {
    this.heldKeys.clear();
    this.isLeftMouseDragging = false;
    this.ballSpeedZeroLatch = false;
  }

  applyEditSubModeCamera(
    subMode: StaticTrainingEditSubMode,
    camera: StaticTrainingEditorCameraPort | null | undefined,
    releaseGoalReplayCameraOverride?: () => void
  ): void {
    if (!camera) return;
    const store = useStaticTrainingPackStore.getState();
    if (subMode !== 'free-cam' && store.isFreeCamTrajectoryTesting) {
      this.dispatchCommand('stop-trajectory-test');
    }

    syncEditorCameraForSubMode({
      subMode,
      camera,
      isTestingSingleShot: Boolean(store.isTestingSingleShot),
      isEditingItem: Boolean(store.isEditingItem),
      shot: resolveCurrentStaticTrainingShotConfig(store, getActiveEditItemVariable()),
      tuner: useStaticTrainingBallCamTunerStore.getState(),
      releaseGoalReplayCameraOverride,
      persistEditorFreeCam: (editorFreeCam) => {
        mutateActiveEditItemVariable((draft: StaticTrainingShotConfig) => {
          draft.editorFreeCam = editorFreeCam;
        });
      },
    });
  }

  updateCameraAndContinuousInputs(
    dt: number,
    camera: StaticTrainingEditorCameraPort | null | undefined
  ): void {
    const store = useStaticTrainingPackStore.getState();
    if (store.sessionMode !== 'edit' || store.isTestingSingleShot) return;

    const subMode = store.editSubMode as StaticTrainingEditSubMode;
    const shot = resolveCurrentStaticTrainingShotConfig(store, getActiveEditItemVariable());
    if (!shot) return;

    if (subMode !== 'free-cam' && camera) {
      camera.setEditorOverride?.(true);
      camera.syncEditorShotCamera?.(subMode, shot, useStaticTrainingBallCamTunerStore.getState());
    }

    if (isModalBlockingInput()) {
      if (this.heldKeys.size > 0) this.heldKeys.clear();
      return;
    }
    if (subMode === 'free-cam' || this.heldKeys.size === 0) return;

    const dir = new THREE.Vector3(0, 0, 1);
    camera?.camera?.getWorldDirection?.(dir);

    const deltas = computeEditorContinuousDeltas({
      heldKeys: this.heldKeys,
      subMode,
      dt,
      camDirX: dir.x,
      camDirZ: dir.z,
    });
    if (!deltas.hasAnyChange) return;

    mutateActiveEditItemVariable((draft: StaticTrainingShotConfig) => {
      const res = computeContinuousDeltasShotPatch(draft, subMode, deltas, this.ballSpeedZeroLatch);
      applyShotDraftPatch(draft, res);
      this.ballSpeedZeroLatch = res.nextBallSpeedZeroLatch;
    });
  }

  private tryMirrorOrReloadHotkey(evt: KeyboardEvent): boolean {
    if (isNonRepeatLetterKey(evt, 'KeyR', 'r')) {
      evt.preventDefault();
      this.dispatchCommand('reload-shot');
      return true;
    }
    if (isNonRepeatLetterKey(evt, 'KeyF', 'f')) {
      const store = useStaticTrainingPackStore.getState();
      const enableFToMirror =
        store.variationToggles?.enableFToMirror !== false &&
        useAppStore.getState().gameplay?.enableFToMirror !== false;
      if (enableFToMirror) {
        evt.preventDefault();
        store.setShotMirrored?.(!store.isShotMirrored);
        this.dispatchCommand('reload-shot');
      }
      return true;
    }
    return false;
  }

  private handleKeyDown(evt: KeyboardEvent): void {
    if (isEditableEventTarget(evt)) return;
    const store = useStaticTrainingPackStore.getState();
    const code = evt.code;

    if (store.isReplayActive && isNonRepeatLetterKey(evt, 'KeyP', 'p')) {
      if (isReplayDirectorTunerWindowPresent()) {
        evt.preventDefault();
        this.dispatchCommand('toggle-replay-pause');
      }
      return;
    }

    if (store.sessionMode === 'edit' && store.isTestingSingleShot) {
      if (isNonRepeatLetterKey(evt, 'KeyG', 'g')) {
        evt.preventDefault();
        this.dispatchCommand('toggle-single-shot-test');
        return;
      }
      this.tryMirrorOrReloadHotkey(evt);
      return;
    }

    if (store.sessionMode === 'play') {
      if (this.tryMirrorOrReloadHotkey(evt)) return;
      if ((code === 'BracketLeft' || evt.key === '[' || code === 'Digit9') && !evt.repeat) {
        evt.preventDefault();
        store.prevShot();
      } else if ((code === 'BracketRight' || evt.key === ']' || code === 'Digit0') && !evt.repeat) {
        evt.preventDefault();
        store.nextShot();
      }
      return;
    }

    if (store.sessionMode !== 'edit' || isModalBlockingInput()) return;

    if ((code === 'Digit9' || code === 'Digit0') && !evt.repeat) {
      evt.preventDefault();
      store.cycleEditSubMode(code === 'Digit9' ? -1 : 1);
      return;
    }

    if (code === 'ArrowUp' || code === 'ArrowDown') {
      evt.preventDefault();
      if (!store.isEditingItem) store.enterItemEditMode(store.currentShotIndex);
      const delta = code === 'ArrowUp' ? 1 : -1;
      mutateActiveEditItemVariable((draft: StaticTrainingShotConfig) => {
        const cur = Math.round(Number(draft.timeoutSeconds) || 10);
        draft.timeoutSeconds = Math.max(1, Math.min(60, cur + delta));
      });
      return;
    }

    const subMode = store.editSubMode as StaticTrainingEditSubMode;

    if ((code === 'KeyT' || evt.key === 't' || evt.key === 'T') && !evt.repeat) {
      evt.preventDefault();
      this.dispatchCommand('toggle-trajectory-test');
      return;
    }
    if ((code === 'KeyG' || evt.key === 'g' || evt.key === 'G') && !evt.repeat) {
      evt.preventDefault();
      this.dispatchCommand('toggle-single-shot-test');
      return;
    }
    if ((code === 'KeyF' || evt.key === 'f' || evt.key === 'F') && !evt.shiftKey && !evt.repeat) {
      evt.preventDefault();
      useStaticTrainingBallCamTunerStore.getState().switchLateralSide();
      return;
    }
    if (subMode === 'free-cam') return;

    if (!store.isEditingItem) store.enterItemEditMode(store.currentShotIndex);
    if (EDITOR_HELD_KEY_CODES.has(code)) evt.preventDefault();
    this.heldKeys.add(code);

    if (!evt.repeat) {
      if (code === 'BracketLeft' && subMode === 'ball-speed') {
        this.ballSpeedZeroLatch = false;
      }
      const discrete = computeDiscreteEditKeyMutation(code, subMode, getActiveEditItemVariable());
      if (discrete) {
        mutateActiveEditItemVariable((draft: StaticTrainingShotConfig) => {
          applyShotDraftPatch(draft, discrete);
        });
        if (discrete.removeHeldKey) this.heldKeys.delete(discrete.removeHeldKey);
        if (discrete.setBallSpeedZeroLatch !== undefined) {
          this.ballSpeedZeroLatch = discrete.setBallSpeedZeroLatch;
        }
      }
    }
  }

  private handleMouseDown(evt: MouseEvent): void {
    const store = useStaticTrainingPackStore.getState();
    if (store.sessionMode !== 'edit' || store.isTestingSingleShot || isModalBlockingInput()) {
      return;
    }
    const targetEl = evt.target as HTMLElement | null;
    if (targetEl?.closest?.(UI_INTERACTIVE_SELECTOR)) return;

    if (evt.button === 2) {
      evt.preventDefault();
      store.cycleEditSubMode(1);
      return;
    }
    if (evt.button === 0 && store.editSubMode !== 'free-cam') {
      if (!store.isEditingItem) store.enterItemEditMode(store.currentShotIndex);
      this.isLeftMouseDragging = true;
      this.lastMouseX = evt.clientX;
      this.lastMouseY = evt.clientY;
    }
  }

  private handleMouseMove(evt: MouseEvent): void {
    if (!this.isLeftMouseDragging) return;
    const store = useStaticTrainingPackStore.getState();
    if (
      store.sessionMode !== 'edit' ||
      store.editSubMode === 'free-cam' ||
      store.isTestingSingleShot
    ) {
      this.isLeftMouseDragging = false;
      return;
    }

    const dx = evt.clientX - this.lastMouseX;
    const dy = evt.clientY - this.lastMouseY;
    this.lastMouseX = evt.clientX;
    this.lastMouseY = evt.clientY;
    if (dx === 0 && dy === 0) return;

    const subMode = store.editSubMode as StaticTrainingEditSubMode;
    mutateActiveEditItemVariable((draft: StaticTrainingShotConfig) => {
      applyShotDraftPatch(draft, computeMouseDragShotPatch(draft, subMode, dx, dy, 0.0045));
    });
  }

  bindSessionEvents(): void {
    if (typeof window === 'undefined') return;
    this.unbindSessionEvents();
    const abort = new AbortController();
    this.sessionAbort = abort;
    const { signal } = abort;

    window.addEventListener('keydown', (evt) => this.handleKeyDown(evt), { capture: true, signal });
    window.addEventListener(
      'keyup',
      (evt) => {
        this.heldKeys.delete(evt.code);
        if (evt.code === 'BracketLeft') this.ballSpeedZeroLatch = false;
      },
      { capture: true, signal }
    );
    window.addEventListener('mousedown', (evt) => this.handleMouseDown(evt), { signal });
    window.addEventListener('mousemove', (evt) => this.handleMouseMove(evt), { signal });
    window.addEventListener(
      'mouseup',
      (evt) => {
        if (evt.button === 0) this.isLeftMouseDragging = false;
      },
      { signal }
    );
    window.addEventListener(
      'contextmenu',
      (evt) => {
        const store = useStaticTrainingPackStore.getState();
        if (store.sessionMode === 'edit' && !store.isTestingSingleShot) evt.preventDefault();
      },
      { signal }
    );
  }

  unbindSessionEvents(): void {
    this.sessionAbort?.abort();
    this.sessionAbort = null;
  }
}
