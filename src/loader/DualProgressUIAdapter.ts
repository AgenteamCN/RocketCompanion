/**
 * src/loader/DualProgressUIAdapter.ts
 * Bridges LoadingOrchestrator events to the MinimumProgressLoader and custom UI hooks.
 *
 * Implements Apple Human Interface Guidelines (HIG) Determinate & Indeterminate Progress:
 * 1. Stage Progress (Top indicator): Overall system lifecycle milestones (0% -> 100%).
 * 2. Active Micro-Task (Bottom indicator):
 *    - Determinate: Real-time network bytes, stream chunks, bandwidth metrics.
 *    - Indeterminate: Shimmer wave animations with explicit technical diagnostic hints.
 * 3. Pluggable UI: Supports external custom UI hooks via registerCustomUI().
 */

import { MinimumProgressLoader, type MinimumLoaderDomContainer } from './MinimumProgressLoader.ts';
import type {
  LoadingStageChangeEvent,
  LoadingTaskStartEvent,
  LoadingTaskProgressEvent,
  StreamDownloadProgressInfo,
  LoadingTaskCompleteEvent,
  LoadingErrorEvent,
  LoadingCompleteEvent,
  LoadingProgressObserver,
} from './types.ts';

export interface CustomLoadingProgressUI {
  onStageChange?: (data: LoadingStageChangeEvent) => void;
  onTaskStart?: (data: LoadingTaskStartEvent) => void;
  onProgress?: (data: LoadingTaskProgressEvent) => void;
  onByteStream?: (data: StreamDownloadProgressInfo) => void;
  onTaskComplete?: (data: LoadingTaskCompleteEvent) => void;
  onError?: (data: LoadingErrorEvent) => void;
  onComplete?: (data: LoadingCompleteEvent) => void;
}

export class DualProgressUIAdapter implements LoadingProgressObserver {
  readonly container: MinimumLoaderDomContainer | null;
  customUI: CustomLoadingProgressUI | null = null;
  readonly loader: MinimumProgressLoader;

  constructor(
    container: Element | null = null,
    existingLoader: MinimumProgressLoader | null = null
  ) {
    this.container = (container ||
      (typeof document !== 'undefined'
        ? document.querySelector('#app')
        : null)) as MinimumLoaderDomContainer | null;
    this.loader =
      existingLoader ||
      this.container?.__minimumProgressLoader ||
      new MinimumProgressLoader(this.container);
    this.loader.mount();
  }

  registerCustomUI(customUI: CustomLoadingProgressUI | null): void {
    this.customUI = customUI;
  }

  onStageChange(data: LoadingStageChangeEvent): void {
    const customHook = this.customUI?.onStageChange;
    if (customHook) {
      customHook(data);
    }
    this.loader.onStageChange(data);
  }

  onTaskStart(data: LoadingTaskStartEvent): void {
    const customHook = this.customUI?.onTaskStart;
    if (customHook) {
      customHook(data);
    }
    this.loader.onTaskStart(data);
  }

  onTaskProgress(data: LoadingTaskProgressEvent): void {
    const customHook = this.customUI?.onProgress;
    if (customHook) {
      customHook(data);
    }
    this.loader.onTaskProgress(data);
  }

  onByteStreamProgress(data: StreamDownloadProgressInfo): void {
    const customHook = this.customUI?.onByteStream;
    if (customHook) {
      customHook(data);
    }
    this.loader.onByteStreamProgress(data);
  }

  onTaskComplete(data: LoadingTaskCompleteEvent): void {
    const customHook = this.customUI?.onTaskComplete;
    if (customHook) {
      customHook(data);
    }
  }

  onError(data: LoadingErrorEvent): void {
    const customHook = this.customUI?.onError;
    if (customHook) {
      customHook(data);
    }
    this.loader.onError(data);
  }

  onComplete(data: LoadingCompleteEvent): void {
    const customHook = this.customUI?.onComplete;
    if (customHook) {
      customHook(data);
    }
    this.loader.onComplete(data);
  }
}
