import type * as THREE from 'three';
import type { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import {
  useAppStore,
  networkDiagnosticsStore,
  toggleFloatingPreset,
  NETWORK_MONITOR_PRESET,
  type GraphicsSettingsPort,
} from '../runtimeUiPort.ts';
import { loadInputBindings } from '../../ui-core/config/inputBindings.ts';
import { audioConfig } from '../../ui-core/config/audioConfig.ts';
import { gameAudio } from '../../audio/GameAudioEngineFacade.ts';
import { getAudioSlotPool, subsystemState } from '../../audio/audioContext.ts';
import type { GamepadController } from '../../input/GamepadController.ts';
import type { BoostBloom } from '../../effects/BoostBloom.ts';
import {
  RuntimeWindowHotkeysController,
  type RuntimeWindowHotkeysHostPort,
} from './RuntimeWindowHotkeysController.ts';

declare global {
  interface Window {
    dumpNextNetworkPacket?: () => void;
    dumpLatestNetworkPacket?: (pkt?: Uint8Array | ArrayBuffer | null) => void;
    toggleNetworkControlPanel?: () => void;
  }
}

export interface RuntimeDOMEventHostPort extends RuntimeWindowHotkeysHostPort {
  readonly container: HTMLElement | null;
  readonly composer: EffectComposer | null;
  readonly boostBloom: BoostBloom | null;
  readonly openOverlays: Set<string>;
  readonly clockScheduler: {
    setFpsLimit(fps: number | null): void;
    setUnfocusedFpsLimit?(fps: number | null): void;
  } | null;
  readonly gamepad: GamepadController | null;
  isPaused: boolean;
  isPowerSavingActive?: boolean;
}

/**
 * RuntimeDOMEventManager
 * Stateful SubController owning DOM resize, canvas pointer/click listeners,
 * window hotkeys, and blur/focus audio/pause synchronization.
 */
export class RuntimeDOMEventManager {
  public readonly runtime: RuntimeDOMEventHostPort;
  public readonly windowHotkeys: RuntimeWindowHotkeysController;
  public pendingClickToPlay = false;
  private _onWindowResize: (() => void) | null = null;
  private _onContainerPointerDown: ((evt: PointerEvent) => void) | null = null;
  private _onWindowKeyDown: ((evt: KeyboardEvent) => void) | null = null;
  private _onWindowBlurFocus: (() => void) | null = null;
  private _onCanvasMouseDown: ((evt: MouseEvent) => void) | null = null;
  private _onCanvasClick: ((evt: MouseEvent) => void) | null = null;
  private _onToggleNetworkHUD: (() => Promise<void>) | null = null;

  constructor(runtime: RuntimeDOMEventHostPort) {
    this.runtime = runtime;
    this.windowHotkeys = new RuntimeWindowHotkeysController(runtime);
  }

  public updateViewport(graphics: GraphicsSettingsPort | null = null): void {
    const r = this.runtime;
    const renderer = r.boostBloom?.renderer;
    const renderPass = r.composer?.passes?.[0] as { camera?: THREE.PerspectiveCamera } | undefined;
    const perspectiveCamera = renderPass?.camera;
    if (typeof window === 'undefined' || !renderer || !perspectiveCamera) return;

    const width = window.innerWidth;
    const height = window.innerHeight;

    perspectiveCamera.aspect = width / height;
    perspectiveCamera.updateProjectionMatrix();

    const currentGraphics =
      graphics ||
      (useAppStore && typeof useAppStore.getState === 'function'
        ? useAppStore.getState().graphics
        : null);
    const scale = Number(currentGraphics?.renderScale ?? 50) / 100;
    const basePixelRatio = Math.min(window.devicePixelRatio || 1, 2);
    const effectivePixelRatio = Math.max(0.1, basePixelRatio * scale);

    renderer.setPixelRatio(effectivePixelRatio);
    renderer.setSize(width, height);

    if (r.composer) {
      r.composer.setPixelRatio(effectivePixelRatio);
      r.composer.setSize(width, height);
    }
    if (r.boostBloom) {
      r.boostBloom.setSize(width, height, effectivePixelRatio);
    }
  }

  public handleOverlayChange(name: string, isOpen: boolean): void {
    const r = this.runtime;
    if (isOpen) {
      r.openOverlays.add(name);
      r.isCursorBrowsing = true;
    } else {
      r.openOverlays.delete(name);
      if (r.openOverlays.size === 0 && !(r.container && useAppStore.getState().isOpen)) {
        r.isCursorBrowsing = false;
      }
    }
    this.syncPausedAndInputState();
  }

  public syncPausedAndInputState(graphicsOverride: GraphicsSettingsPort | null = null): void {
    const r = this.runtime;
    const net = r.networkManager;
    const appState = useAppStore.getState();
    const isLivePreviewDockCollapsed =
      appState.isOpen &&
      appState.isLivePreviewCollapsed &&
      (appState.activeRoute === 'trajectory' || appState.activeRoute === 'camera');
    const isUiOpen = Boolean(
      (r.container && appState.isOpen && !isLivePreviewDockCollapsed) ||
      (r.openOverlays.size > 0 && !isLivePreviewDockCollapsed)
    );
    const isMinimized = typeof document !== 'undefined' && Boolean(document.hidden);
    const isTauriWebview =
      typeof window !== 'undefined' &&
      Boolean(
        (window as unknown as { __TAURI__?: unknown; __TAURI_INTERNALS__?: unknown }).__TAURI__ ||
          (window as unknown as { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__
      );
    const hasFocus =
      typeof document !== 'undefined'
        ? !isMinimized &&
          (isTauriWebview ||
            (typeof document.hasFocus === 'function' ? document.hasFocus() : true))
        : true;
    if (subsystemState.runtime) {
      subsystemState.runtime.isWindowFocused = hasFocus;
    }
    const isUnfocused = !hasFocus;
    const isPaused = isUiOpen;

    const isOnlineSession = Boolean(
      net?.sessionCoordinator.networkReconciler || net?.sessionCoordinator.authoritativeServer
    );
    r.isPaused = isOnlineSession ? Boolean(r.match?.state?.paused) : isPaused;
    if (!isOnlineSession) {
      const continueOnBlur = Boolean(audioConfig.get('continueAudioOnLostFocus'));
      const shouldPauseOnUnfocused = isMinimized || (!continueOnBlur && isUnfocused);
      const shouldPauseMatch =
        (r.match?.state?.mode === 'match' || r.match?.state?.mode === 'exp-multi-bots') &&
        (isPaused || shouldPauseOnUnfocused);
      if (r.match) {
        r.match.state.paused = shouldPauseMatch;
      }
    }

    const allowInputs = !isUiOpen && hasFocus;
    if (r.keyboard) {
      r.keyboard.enabled = allowInputs;
      if (!allowInputs) {
        r.keyboard.resetInputs?.();
      }
    }
    if (r.gamepad) {
      r.gamepad.enabled = allowInputs;
    }

    const gfx = graphicsOverride || appState?.graphics;
    const powerSave = gfx?.menuPowerSave || '30';
    const isPowerSaveEnabled = powerSave !== 'match' && powerSave !== 'disable';
    const shouldThrottlePowerSave =
      isMinimized || ((isUiOpen || isUnfocused) && isPowerSaveEnabled);

    r.isPowerSavingActive = shouldThrottlePowerSave;

    if (r.clockScheduler) {
      const targetActiveFps = gfx?.limitFps ? (gfx.maxFps ?? null) : null;
      const unfocusedLimit =
        powerSave === '15'
          ? 15
          : powerSave === '30' || powerSave === 'freeze' || powerSave === 'extreme'
            ? 30
            : targetActiveFps;
      r.clockScheduler.setUnfocusedFpsLimit?.(unfocusedLimit);

      if (shouldThrottlePowerSave && powerSave === '15') {
        r.clockScheduler.setFpsLimit(15);
      } else if (
        shouldThrottlePowerSave &&
        (powerSave === '30' || powerSave === 'freeze' || powerSave === 'extreme')
      ) {
        r.clockScheduler.setFpsLimit(30);
      } else {
        r.clockScheduler.setFpsLimit(targetActiveFps);
      }
    }

    if (r.container) {
      const isPlaying = !isUiOpen;
      r.container.dataset.cursorBrowsing = r.isCursorBrowsing ? 'true' : 'false';
      r.container.classList.toggle('game-playing', isPlaying && !r.isCursorBrowsing);
      r.container.classList.toggle('cursor-browsing', isPlaying && Boolean(r.isCursorBrowsing));
    }

    this.updateCursorHint();
  }

  public updateInteractionState(): void {
    this.syncPausedAndInputState();
  }

  public updateCursorHint(): void {
    const r = this.runtime;
    const hintBtn = r.container?.querySelector<HTMLElement>('.cursor-hint');
    if (!hintBtn) return;
    const isUiOpen =
      Boolean(r.container && useAppStore.getState().isOpen) || r.openOverlays.size > 0;
    hintBtn.style.display = isUiOpen || !r.isCursorBrowsing ? 'none' : 'block';
  }

  public setupWindowEvents(): void {
    const r = this.runtime;
    const net = r.networkManager;
    if (typeof window === 'undefined') return;

    this._onWindowResize = () => {
      this.updateViewport();
    };
    window.addEventListener('resize', this._onWindowResize);

    const onSettingsToggle = () => {
      useAppStore?.getState?.()?.toggleMenu?.();
    };
    if (r.gamepad) {
      r.gamepad.onSettingsToggle = onSettingsToggle;
    }

    const onDismissCursor = () => {
      r.isCursorBrowsing = false;
      if (typeof document !== 'undefined' && document.activeElement instanceof HTMLElement) {
        document.activeElement.blur();
      }
      this.syncPausedAndInputState();
    };

    const onCursorToggle = () => {
      const isUiOpen =
        Boolean(r.container && useAppStore.getState().isOpen) || r.openOverlays.size > 0;
      if (isUiOpen) {
        r.isCursorBrowsing = true;
        onSettingsToggle();
      } else if (r.isCursorBrowsing) {
        onDismissCursor();
      } else {
        r.isCursorBrowsing = true;
        this.syncPausedAndInputState();
      }
    };
    if (r.keyboard) {
      r.keyboard.onSettingsToggle = onSettingsToggle;
    }

    if (r.container) {
      const settingsBtn = r.container.querySelector('#settings-button');
      if (settingsBtn) settingsBtn.setAttribute('title', 'Settings');

      this._onContainerPointerDown = (evt: PointerEvent) => {
        if (
          evt.pointerType !== 'mouse' ||
          !(evt.target instanceof Element) ||
          evt.target.closest(
            '#settings-button, #car-button, #match-button, #online-button, #trajectory-button, .online-tab-btn, .online-overlay, .online-modal, .net-hud, .hud-tools, .trajectory-overlay, .trajectory-panel, #game-ui-root, #game-ui-viewport-host, #game-root'
          )
        ) {
          r.isCursorBrowsing = true;
          this.syncPausedAndInputState();
        }
      };
      r.container.addEventListener('pointerdown', this._onContainerPointerDown, true);
    }

    if (r.gamepad) {
      r.gamepad.onActivity = () => {
        if (r.container) r.container.dataset.inputMethod = 'gamepad';
        if (r.isCursorBrowsing) {
          r.isCursorBrowsing = false;
          this.syncPausedAndInputState();
        }
      };
    }

    this._onToggleNetworkHUD = async () => {
      if (!net) return;
      if (!net.sessionCoordinator.networkReconciler) {
        await net.sessionCoordinator.enableNetworkPrediction(false);
      }
      networkDiagnosticsStore.setSession(
        net.sessionCoordinator.networkReconciler,
        net.sessionCoordinator.networkChannel,
        r
      );
      await net.diagnosticsProbe.spawnHeadlessCarEntity();
      toggleFloatingPreset(NETWORK_MONITOR_PRESET);
    };

    window.dumpNextNetworkPacket = () => {
      void net?.diagnosticsProbe.dumpNextNetworkPacket();
    };
    window.dumpLatestNetworkPacket = (p?: Uint8Array | ArrayBuffer | null) => {
      net?.diagnosticsProbe.dumpLatestNetworkPacket(p ?? null);
    };
    window.toggleNetworkControlPanel = () => {
      void this._onToggleNetworkHUD?.();
    };

    this._onWindowKeyDown = this.windowHotkeys.handleKeyDown;
    window.addEventListener('keydown', this._onWindowKeyDown, true);

    this._onWindowBlurFocus = () => {
      this.pendingClickToPlay = false;
      this.updateInteractionState();
      const hasFocus =
        typeof document !== 'undefined'
          ? !document.hidden &&
            (typeof document.hasFocus === 'function' ? document.hasFocus() : true)
          : true;
      if (!audioConfig.get('continueAudioOnLostFocus')) {
        if (!hasFocus) {
          gameAudio.silenceAll?.();
          const audioRuntime = subsystemState.runtime as {
            audioSubsystem?: {
              engineSynths?: Array<{ synth?: { silence?(): void } | null }>;
            };
          } | null;
          const synths = audioRuntime?.audioSubsystem?.engineSynths;
          if (synths) {
            for (const entry of synths) entry.synth?.silence?.();
          }
          const pool = getAudioSlotPool?.();
          if (pool) {
            pool.isMuted = true;
            pool.silenceAll?.();
          }
        } else {
          const pool = getAudioSlotPool?.();
          if (pool && pool.isMuted) {
            pool.silenceAll?.();
            pool.isMuted = false;
          }
          gameAudio.ballEngine?._startLoops?.();
        }
      }
    };

    window.addEventListener('blur', this._onWindowBlurFocus);
    window.addEventListener('focus', this._onWindowBlurFocus);
    if (typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', this._onWindowBlurFocus);
    }

    const canvasDom = r.boostBloom?.renderer?.domElement;
    if (canvasDom) {
      this._onCanvasMouseDown = (evt: MouseEvent) => {
        const appState = useAppStore?.getState?.();
        if (appState?.touchMode) {
          this.pendingClickToPlay = false;
          return;
        }
        this.pendingClickToPlay =
          r.isCursorBrowsing && r.openOverlays.size === 0 && evt.button === 0;
        const bindings = loadInputBindings();
        if (
          r.isCursorBrowsing &&
          r.openOverlays.size === 0 &&
          bindings.keyboard.toggleSettings.some(
            (b: { kind?: string; button?: number }) => b.kind === 'mouse' && b.button === evt.button
          )
        ) {
          evt.preventDefault();
          evt.stopPropagation();
          onCursorToggle();
        }
      };
      canvasDom.addEventListener('mousedown', this._onCanvasMouseDown);

      this._onCanvasClick = (evt: MouseEvent) => {
        const appState = useAppStore?.getState?.();
        if (appState?.touchMode) {
          this.pendingClickToPlay = false;
          if (!appState.isOpen && r.openOverlays.size === 0) {
            evt.preventDefault();
            evt.stopPropagation();
            r.isCursorBrowsing = true;
            this.syncPausedAndInputState();
            appState.bridge?.onRequestTouchOpenMenuConfirm?.();
          }
          return;
        }

        const wasPending = this.pendingClickToPlay;
        this.pendingClickToPlay = false;
        if (wasPending && r.isCursorBrowsing && r.openOverlays.size === 0 && evt.button === 0) {
          evt.preventDefault();
          evt.stopPropagation();
          onDismissCursor();
        }
      };
      canvasDom.addEventListener('click', this._onCanvasClick);
    }
  }

  public destroy(): void {
    const r = this.runtime;
    if (r.container && this._onContainerPointerDown) {
      r.container.removeEventListener('pointerdown', this._onContainerPointerDown, true);
      this._onContainerPointerDown = null;
    }
    if (typeof window !== 'undefined') {
      if (this._onWindowResize) {
        window.removeEventListener('resize', this._onWindowResize);
        this._onWindowResize = null;
      }
      if (this._onWindowKeyDown) {
        window.removeEventListener('keydown', this._onWindowKeyDown, true);
        this._onWindowKeyDown = null;
      }
      if (this._onWindowBlurFocus) {
        window.removeEventListener('blur', this._onWindowBlurFocus);
        window.removeEventListener('focus', this._onWindowBlurFocus);
      }
    }
    if (typeof document !== 'undefined' && this._onWindowBlurFocus) {
      document.removeEventListener('visibilitychange', this._onWindowBlurFocus);
    }
    this._onWindowBlurFocus = null;
    this._onToggleNetworkHUD = null;
    const canvasDom = r.boostBloom?.renderer?.domElement;
    if (canvasDom) {
      if (this._onCanvasMouseDown) {
        canvasDom.removeEventListener('mousedown', this._onCanvasMouseDown);
        this._onCanvasMouseDown = null;
      }
      if (this._onCanvasClick) {
        canvasDom.removeEventListener('click', this._onCanvasClick);
        this._onCanvasClick = null;
      }
    }
  }
}
