import * as THREE from 'three';
import { applyThreeMonkeyPatches } from '../utils/ThreeMonkeyPatches.ts';
import {
  DualProgressUIAdapter,
  type CustomLoadingProgressUI,
} from '../loader/DualProgressUIAdapter.ts';
import type {
  MinimumLoaderDomContainer,
  MinimumProgressLoader,
} from '../loader/MinimumProgressLoader.ts';
import { ConsoleProgressObserver, isVerboseLogEnabled } from '../loader/ConsoleProgressObserver.ts';
import {
  buildEngineLoadingPipeline,
  startBackgroundAssetPipeline,
} from '../loader/engineLoadingPipeline.ts';
import { GameRuntime, type GameRuntimeOptions } from './GameRuntime.ts';
import { useQuickNotificationStore } from './runtimeUiPort.ts';
import {
  attachScenarioAutorunController,
  ScenarioBootstrapTelemetryObserver,
} from './scenario/ScenarioAutorunBootstrap.ts';
import type { ScenarioRuntimePort } from './scenario/ScenarioTypes.ts';

export interface GameBootstrapOptions extends GameRuntimeOptions {
  container?: HTMLElement | null;
  loader?: MinimumProgressLoader | null;
  customProgressBar?: CustomLoadingProgressUI | null;
}

let activeGameRuntime: GameRuntime | null = null;
let activeBootstrapPromise: Promise<GameRuntime> | null = null;

export function setupInputMethodDetection(container: HTMLElement | null): () => void {
  if (!container) return () => {};

  const setMethod = (method: string) => {
    if (container.dataset && container.dataset.inputMethod !== method) {
      container.dataset.inputMethod = method;
    }
  };

  const hasTouch =
    (typeof navigator !== 'undefined' && (navigator.maxTouchPoints || 0) > 0) ||
    (typeof window !== 'undefined' &&
      typeof window.matchMedia === 'function' &&
      window.matchMedia('(any-pointer: coarse)').matches);

  setMethod(hasTouch ? 'touch' : 'mouse');

  if (typeof window === 'undefined') return () => {};

  const onKeyDown = (e: KeyboardEvent) => {
    if (!e.repeat) setMethod('keyboard');
  };

  const onPointerDown = (e: PointerEvent) => {
    const isTouch = e.pointerType === 'touch' || e.pointerType === 'pen';
    setMethod(isTouch ? 'touch' : 'mouse');
  };

  window.addEventListener('keydown', onKeyDown, true);
  window.addEventListener('pointerdown', onPointerDown, { capture: true, passive: true });

  return () => {
    window.removeEventListener('keydown', onKeyDown, true);
    window.removeEventListener('pointerdown', onPointerDown, { capture: true });
  };
}

export class GameBootstrap {
  container: HTMLElement | null;
  options: GameBootstrapOptions;
  cleanupInput: (() => void) | null = null;
  runtime: GameRuntime | null = null;
  customProgressBar: CustomLoadingProgressUI | null;

  constructor(container?: HTMLElement | null, options: GameBootstrapOptions = {}) {
    this.container =
      container ||
      (typeof document !== 'undefined'
        ? (document.querySelector('#app') as HTMLElement | null)
        : null);
    this.options = options;
    this.customProgressBar = options.customProgressBar || null;
  }

  registerCustomProgressBar(customUI: CustomLoadingProgressUI | null): void {
    this.customProgressBar = customUI;
  }

  prepareDOM(): void {
    if (this.container) {
      this.cleanupInput = setupInputMethodDetection(this.container);
    }
  }

  async start(): Promise<GameRuntime> {
    applyThreeMonkeyPatches(THREE);
    this.prepareDOM();

    const container = this.container;
    const options = this.options;
    const uiAdapter = new DualProgressUIAdapter(container, options.loader || null);
    if (this.customProgressBar) {
      uiAdapter.registerCustomUI(this.customProgressBar);
    }

    const verbose = isVerboseLogEnabled();
    const consoleObserver = new ConsoleProgressObserver({ verbose });
    const scenarioBootstrapObserver = new ScenarioBootstrapTelemetryObserver();
    const isTouchHeadless =
      typeof window !== 'undefined' &&
      new URLSearchParams(window.location.search).get('touch') === '2';

    if (isTouchHeadless) {
      console.warn(
        '%c[Bootstrap] Headless Parameter Detected (?touch=2)%c WebGL / Three.js 3D scene rendering is exempted. Running React-only UI + 120Hz Physics Headless Mode.',
        'background:#d97706;color:#fff;padding:2px 6px;border-radius:3px;font-weight:bold',
        'color:#fbbf24;font-weight:bold'
      );
    }

    try {
      this.runtime = new GameRuntime(container, options);
      const orchestrator = buildEngineLoadingPipeline(this.runtime, options);

      orchestrator.subscribe(consoleObserver);
      orchestrator.subscribe(uiAdapter);
      orchestrator.subscribe(scenarioBootstrapObserver);

      await orchestrator.run();

      if (isTouchHeadless) {
        console.info(
          '[Bootstrap] Headless Parameter Detected (?touch=2): Engine bootstrap & 120Hz clock ignition completed without WebGL.'
        );
        try {
          useQuickNotificationStore.getState().pushNotification({
            id: 'headless-touch-mode-detected',
            type: 'temporary',
            tone: 'warning',
            icon: 'Sliders',
            duration: 6000,
            content: 'Headless Parameter Detected (?touch=2) · Three.js 3D rendering is disabled.',
          });
        } catch (_e) {}
      }

      if (verbose) {
        console.log(
          '[Loading] ══════════════ [Training Mode] Essential Pipeline Complete ══════════════'
        );
        console.log('[Loading] Training Mode Essential Resources ready — Player can now play.');
      }

      const runtimeInstance = this.runtime;
      const bgAssetsPromise = startBackgroundAssetPipeline(runtimeInstance, null, {
        notifyStore: useQuickNotificationStore.getState(),
      }).catch((err) => {
        console.warn('[Loading] Background asset pipeline unhandled rejection:', err);
      });

      attachScenarioAutorunController(
        this.runtime as unknown as ScenarioRuntimePort,
        scenarioBootstrapObserver,
        bgAssetsPromise
      );

      return this.runtime;
    } catch (err) {
      uiAdapter.onError({
        taskId: 'bootstrap',
        taskName: 'Engine Lifecycle Bootstrap',
        error: err,
        isCritical: true,
      });
      console.error('[Bootstrap Error]', err);
      throw err;
    }
  }

  stop(): void {
    if (this.runtime) {
      this.runtime.stop();
    }
    if (this.cleanupInput) {
      this.cleanupInput();
      this.cleanupInput = null;
    }
  }

  renderFrame(timestamp?: number): void {
    if (this.runtime) {
      this.runtime.renderFrame(timestamp);
    }
  }
}

export async function bootstrapGameEngine(
  container?: HTMLElement | null,
  options: GameBootstrapOptions = {}
): Promise<GameRuntime> {
  const bootstrap = new GameBootstrap(container, options);
  return await bootstrap.start();
}

export async function bootstrapEngine(options: GameBootstrapOptions = {}): Promise<GameRuntime> {
  if (activeGameRuntime) {
    return activeGameRuntime;
  }
  if (activeBootstrapPromise) {
    return activeBootstrapPromise;
  }

  activeBootstrapPromise = (async () => {
    const host = (options.container ||
      (typeof document !== 'undefined' ? document.querySelector('#app') : null)) as
      (HTMLElement & MinimumLoaderDomContainer) | null;
    const loader = options.loader || host?.__minimumProgressLoader || null;

    if (loader) {
      loader.onTaskProgress({
        overallPercent: 4,
        detail: 'Initializing Three.js WebGL core & entity factories...',
      });
    }

    activeGameRuntime = await bootstrapGameEngine(host, {
      ...options,
      loader,
    });
    return activeGameRuntime;
  })();

  try {
    return await activeBootstrapPromise;
  } finally {
    activeBootstrapPromise = null;
  }
}

export function renderGameFrame(timestamp?: number): void {
  if (activeGameRuntime) {
    activeGameRuntime.renderFrame(timestamp);
  }
}

export function destroyEngine(): void {
  if (activeGameRuntime) {
    activeGameRuntime.destroy();
    activeGameRuntime = null;
  }
}

export { activeGameRuntime };
