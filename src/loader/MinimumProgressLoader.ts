/**
 * src/loader/MinimumProgressLoader.ts
 * Ultra-lightweight, zero-dependency, Apple HIG-compliant Dual Progress Bar Loader.
 */
import { MINIMUM_LOADER_HTML, MINIMUM_LOADER_CSS } from './minimumLoaderTemplate.ts';
import { resolveAssetPath } from '../utils/AssetResponseValidator.ts';
import type {
  LoadingBootstrapError,
  LoadingStageChangeEvent,
  LoadingTaskStartEvent,
  LoadingTaskProgressEvent,
  StreamDownloadProgressInfo,
  LoadingErrorEvent,
  LoadingCompleteEvent,
  LoadingProgressObserver,
  TaskExecutionType,
} from './types.ts';

export interface MinimumLoaderDomContainer extends Element {
  __minimumProgressLoader?: MinimumProgressLoader;
}

export interface MinimumLoaderDomRefs {
  stageIndicator?: HTMLElement | null;
  stageTitle?: HTMLElement | null;
  overallPercent?: HTMLElement | null;
  primaryFill?: HTMLElement | null;
  taskName?: HTMLElement | null;
  taskStatusBadge?: HTMLElement | null;
  secondaryTrack?: HTMLElement | null;
  secondaryFill?: HTMLElement | null;
  microDetail?: HTMLElement | null;
  microRate?: HTMLElement | null;
  errorCard?: HTMLElement | null;
  errorCode?: HTMLElement | null;
  errorTitle?: HTMLElement | null;
  errorMessage?: HTMLElement | null;
  errorHint?: HTMLElement | null;
  errorTech?: HTMLElement | null;
  errorReloadBtn?: HTMLElement | null;
  telemetryDot?: HTMLElement | null;
  telemetryLabel?: HTMLElement | null;
}

const REF_SELECTORS: ReadonlyArray<readonly [keyof MinimumLoaderDomRefs, string]> = [
  ['stageIndicator', '#hig-stage-indicator'],
  ['stageTitle', '#hig-stage-title'],
  ['overallPercent', '#hig-overall-percent'],
  ['primaryFill', '#hig-primary-fill'],
  ['taskName', '#hig-task-name'],
  ['taskStatusBadge', '#hig-task-status-badge'],
  ['secondaryTrack', '#hig-secondary-track'],
  ['secondaryFill', '#hig-secondary-fill'],
  ['microDetail', '#hig-micro-detail'],
  ['microRate', '#hig-micro-rate'],
  ['errorCard', '#hig-error-card'],
  ['errorCode', '#hig-error-code'],
  ['errorTitle', '#hig-error-title'],
  ['errorMessage', '#hig-error-message'],
  ['errorHint', '#hig-error-hint'],
  ['errorTech', '#hig-error-tech'],
  ['errorReloadBtn', '#hig-error-reload-btn'],
  ['telemetryDot', '#hig-telemetry-dot'],
  ['telemetryLabel', '#hig-telemetry-label'],
];

export class MinimumProgressLoader implements LoadingProgressObserver {
  activeTaskCategory = 'Bootstrap Core';
  activeTaskHint = 'Verifying browser environment and hardware capabilities...';
  activeTaskId = 'bootstrap';
  activeTaskName = 'Initializing Engine Runtime...';
  activeTaskType: TaskExecutionType | string = 'indeterminate';
  container: MinimumLoaderDomContainer | null;
  currentStep = 0;
  element: HTMLElement | null = null;
  hasError = false;
  isCompleted = false;
  isMounted = false;
  lastByteCount = 0;
  lastByteTime = 0;
  loadedBytes = 0;
  options: Record<string, unknown>;
  overallPercent = 0;
  refs: MinimumLoaderDomRefs = {};
  speedBps = 0;
  stageIndex = 1;
  stageTitle = 'System Preflight';
  totalBytes = 0;
  totalStages = 6;
  totalSteps = 10;

  constructor(container: Element | null = null, options: Record<string, unknown> = {}) {
    this.container = (container ||
      (typeof document !== 'undefined'
        ? document.querySelector('#app')
        : null)) as MinimumLoaderDomContainer | null;
    this.options = options;
    this._initFontAsync();
  }

  _initFontAsync(): void {
    if (typeof document === 'undefined' || !('fonts' in document)) return;
    try {
      const fontUrl = resolveAssetPath('/assets/fonts/jetbrains-mono-400.woff2');
      const font = new FontFace('JetBrains Mono', `url('${fontUrl}') format('woff2')`, {
        style: 'normal',
        weight: '400',
        display: 'swap',
      });
      font
        .load()
        .then((loaded) => document.fonts.add(loaded))
        .catch((err) => {
          console.warn('[MinimumProgressLoader] Failed to load JetBrains Mono font:', err);
        });
    } catch (err) {
      console.warn('[MinimumProgressLoader] FontFace API error:', err);
    }
  }

  mount(): void {
    if (this.isMounted || typeof document === 'undefined' || !this.container) return;
    this._injectStyles();

    let loaderEl = this.container.querySelector('#minimum-engine-loader') as HTMLElement | null;
    if (!loaderEl) {
      loaderEl = document.createElement('div');
      loaderEl.id = 'minimum-engine-loader';
      loaderEl.className = 'hig-loader-shell';
      loaderEl.setAttribute('data-ui-layer', 'minimum-loading-screen');
      loaderEl.innerHTML = MINIMUM_LOADER_HTML;
      this.container.appendChild(loaderEl);
    }

    this.element = loaderEl;
    this.isMounted = true;
    this.container.__minimumProgressLoader = this;

    const refs: MinimumLoaderDomRefs = {};
    for (const [key, sel] of REF_SELECTORS) {
      refs[key] = loaderEl.querySelector<HTMLElement>(sel);
    }
    this.refs = refs;

    if (this.refs.errorReloadBtn && typeof window !== 'undefined') {
      this.refs.errorReloadBtn.onclick = () => window.location.reload();
    }
  }

  _injectStyles(): void {
    if (document.getElementById('hig-minimum-loader-styles')) return;
    const style = document.createElement('style');
    style.id = 'hig-minimum-loader-styles';
    style.textContent = MINIMUM_LOADER_CSS;
    document.head.appendChild(style);
  }

  _formatBytes(bytes: number): string {
    if (!bytes || isNaN(bytes)) return '0 B';
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1048576) return `${(bytes / 1024).toFixed(1)} KB`;
    if (bytes < 1073741824) return `${(bytes / 1048576).toFixed(1)} MB`;
    return `${(bytes / 1073741824).toFixed(2)} GB`;
  }

  onStageChange({
    stageIndex,
    totalStages,
    stageTitle,
    stageDescription,
  }: LoadingStageChangeEvent): void {
    if (this.hasError || this.isCompleted) return;
    this.stageIndex = stageIndex || this.stageIndex;
    this.totalStages = totalStages || this.totalStages;
    this.stageTitle = stageTitle || this.stageTitle;

    if (!this.refs.stageIndicator) return;
    this.refs.stageIndicator.textContent = `STAGE ${this.stageIndex} OF ${this.totalStages}`;
    if (this.refs.stageTitle) this.refs.stageTitle.textContent = this.stageTitle;
    if (stageDescription && this.refs.microDetail) {
      this.refs.microDetail.textContent = stageDescription;
    }
  }

  onTaskStart({
    taskId,
    taskName,
    step,
    totalSteps,
    overallPercent,
    taskType,
    hint,
    category,
  }: LoadingTaskStartEvent): void {
    if (this.hasError || this.isCompleted) return;
    this.currentStep = step || this.currentStep;
    this.totalSteps = totalSteps || this.totalSteps;
    this.activeTaskId = taskId || this.activeTaskId;
    this.activeTaskName = taskName || this.activeTaskName;
    this.activeTaskType = taskType || 'indeterminate';
    this.activeTaskCategory = category || this.activeTaskCategory;
    if (overallPercent !== undefined) this.overallPercent = overallPercent;

    if (!this.refs.taskName) return;
    this.refs.taskName.textContent = this.activeTaskName;

    if (this.activeTaskType === 'determinate') {
      if (this.refs.taskStatusBadge) {
        this.refs.taskStatusBadge.textContent = 'STREAMING';
        this.refs.taskStatusBadge.className = 'hig-task-status-badge determinate';
      }
      if (this.refs.secondaryFill) {
        this.refs.secondaryFill.className = 'hig-fill hig-fill-secondary';
        this.refs.secondaryFill.style.width = '0%';
      }
    } else {
      const mode = taskName.includes('Compil')
        ? 'COMPILING'
        : taskName.includes('Verify') || taskName.includes('Audit')
          ? 'VERIFYING'
          : taskName.includes('Init') || taskName.includes('Ignite')
            ? 'INITIALIZING'
            : 'PROCESSING';
      if (this.refs.taskStatusBadge) {
        this.refs.taskStatusBadge.textContent = mode;
        this.refs.taskStatusBadge.className = 'hig-task-status-badge';
      }
      if (this.refs.secondaryFill) {
        this.refs.secondaryFill.className = 'hig-fill hig-fill-secondary hig-shimmer';
        this.refs.secondaryFill.style.width = '100%';
      }
    }

    if (hint && this.refs.microDetail) this.refs.microDetail.textContent = hint;
    if (this.refs.microRate) this.refs.microRate.textContent = '';
  }

  onTaskProgress({ overallPercent, taskProgress, detail }: LoadingTaskProgressEvent): void {
    if (this.hasError || this.isCompleted) return;
    if (overallPercent !== undefined) {
      this.overallPercent = overallPercent;
      if (this.refs.overallPercent) {
        this.refs.overallPercent.textContent = `${Math.round(overallPercent)}%`;
      }
      if (this.refs.primaryFill) {
        this.refs.primaryFill.style.width = `${Math.min(100, Math.max(0, overallPercent)).toFixed(1)}%`;
      }
    }
    if (detail && this.refs.microDetail) this.refs.microDetail.textContent = detail;
    if (
      this.activeTaskType === 'determinate' &&
      taskProgress !== undefined &&
      this.refs.secondaryFill
    ) {
      this.refs.secondaryFill.style.width = `${Math.min(100, Math.max(0, taskProgress * 100)).toFixed(1)}%`;
    }
  }

  onByteStreamProgress({
    overallRatio,
    loadedBytes,
    totalBytes,
    activeUrl,
  }: StreamDownloadProgressInfo): void {
    if (this.hasError || this.isCompleted) return;
    this.loadedBytes = loadedBytes || 0;
    this.totalBytes = totalBytes || 0;

    const now = performance.now();
    if (this.lastByteTime > 0 && now > this.lastByteTime) {
      const deltaBytes = loadedBytes - this.lastByteCount;
      const deltaSec = (now - this.lastByteTime) / 1000;
      if (deltaSec > 0.2) {
        this.speedBps = Math.max(0, deltaBytes / deltaSec);
        this.lastByteTime = now;
        this.lastByteCount = loadedBytes;
      }
    } else {
      this.lastByteTime = now;
      this.lastByteCount = loadedBytes;
    }

    if (this.refs.secondaryFill && this.activeTaskType === 'determinate') {
      this.refs.secondaryFill.style.width = `${Math.min(100, Math.max(0, overallRatio * 100)).toFixed(1)}%`;
    }
    if (this.refs.microDetail) {
      const filename = activeUrl ? activeUrl.split('/').pop() : '';
      const loadedStr = this._formatBytes(this.loadedBytes);
      const totalStr = this.totalBytes > 0 ? this._formatBytes(this.totalBytes) : 'Stream';
      this.refs.microDetail.textContent = filename
        ? `Streaming ${filename} (${loadedStr} / ${totalStr})`
        : `Streamed ${loadedStr} / ${totalStr}`;
    }
    if (this.refs.microRate && this.speedBps > 0) {
      this.refs.microRate.textContent = `${this._formatBytes(this.speedBps)}/s`;
    }
  }

  onError({ taskId, taskName, error }: LoadingErrorEvent): void {
    this.hasError = true;
    if (!this.refs.errorCard) return;

    const resolvedTaskId =
      taskId && taskId !== 'bootstrap' ? taskId : this.activeTaskId || taskId || 'bootstrap';
    const resolvedTaskName =
      taskName && taskName !== 'Engine Bootstrap' && taskName !== 'Engine Lifecycle Bootstrap'
        ? taskName
        : this.activeTaskName || taskName || 'Engine Bootstrap';

    this.refs.errorCard.style.display = 'flex';
    if (this.refs.primaryFill) {
      this.refs.primaryFill.style.background = '#ef4444';
      this.refs.primaryFill.style.boxShadow = '0 0 16px rgba(239, 68, 68, 0.6)';
    }
    if (this.refs.overallPercent) this.refs.overallPercent.style.color = '#f87171';
    if (this.refs.secondaryFill) {
      this.refs.secondaryFill.className = 'hig-fill hig-fill-secondary';
      this.refs.secondaryFill.style.width = '100%';
      this.refs.secondaryFill.style.background = '#ef4444';
    }

    const typedErr =
      error && typeof error === 'object' ? (error as Partial<LoadingBootstrapError>) : null;
    const errCode = typedErr?.isMicrokernelError
      ? 'ERR_POV_MICROKERNEL_TAMPERED'
      : typedErr?.isAssetError
        ? 'ERR_REQUIRED_ASSET_MISSING'
        : 'ERR_BOOTSTRAP_FAILURE';

    if (this.refs.errorCode) this.refs.errorCode.textContent = errCode;
    if (this.refs.errorTitle) {
      this.refs.errorTitle.textContent = typedErr?.isMicrokernelError
        ? 'Critical Security Preflight Failure'
        : typedErr?.isAssetError
          ? 'Required Static Asset Missing'
          : 'Engine Bootstrap Exception — Please Refresh Page';
    }
    if (this.refs.errorMessage) {
      this.refs.errorMessage.textContent = error instanceof Error ? error.message : String(error);
    }

    const contextHeader = `Stage: ${this.stageIndex}/${this.totalStages} (${this.stageTitle})\nTask: ${resolvedTaskName} (${resolvedTaskId})`;
    const stackBody = typedErr?.stack || `Timestamp: ${new Date().toISOString()}`;
    if (this.refs.errorTech) this.refs.errorTech.textContent = `${contextHeader}\n\n${stackBody}`;

    if (this.refs.taskStatusBadge) {
      this.refs.taskStatusBadge.textContent = 'FAILED';
      this.refs.taskStatusBadge.className = 'hig-task-status-badge error';
    }
    if (this.refs.microDetail) {
      this.refs.microDetail.textContent =
        'Bootstrap halted due to an exception. Please refresh the page or open a new tab.';
      this.refs.microDetail.style.color = '#fca5a5';
    }
    if (this.refs.microRate) this.refs.microRate.textContent = '';
    if (this.refs.telemetryDot) {
      this.refs.telemetryDot.style.background = '#ef4444';
      this.refs.telemetryDot.style.boxShadow = '0 0 8px #ef4444';
    }
    if (this.refs.telemetryLabel) {
      this.refs.telemetryLabel.textContent =
        'Bootstrap Halted • Refresh Page or Open New Tab to Recover';
      this.refs.telemetryLabel.style.color = '#fca5a5';
    }
  }

  onComplete(_event: LoadingCompleteEvent = {}): void {
    if (this.hasError) return;
    this.isCompleted = true;

    if (this.refs.overallPercent) this.refs.overallPercent.textContent = '100%';
    if (this.refs.primaryFill) this.refs.primaryFill.style.width = '100%';
    if (this.refs.secondaryFill) this.refs.secondaryFill.style.width = '100%';
    if (this.refs.taskName)
      this.refs.taskName.textContent = 'Engine Ignition Online — 120Hz Active';
    if (this.refs.taskStatusBadge) this.refs.taskStatusBadge.textContent = 'READY';

    if (this.element) {
      setTimeout(() => {
        if (!this.element || this.hasError) return;
        this.element.style.opacity = '0';
        this.element.style.pointerEvents = 'none';
        setTimeout(() => {
          if (!this.hasError) this.destroy();
        }, 360);
      }, 200);
    }
  }

  destroy(): void {
    if (this.element && this.element.parentNode) {
      this.element.parentNode.removeChild(this.element);
    }
    if (this.container && this.container.__minimumProgressLoader === this) {
      delete this.container.__minimumProgressLoader;
    }
    this.element = null;
    this.refs = {};
    this.isMounted = false;
  }
}
