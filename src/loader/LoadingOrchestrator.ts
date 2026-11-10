/**
 * src/loader/LoadingOrchestrator.ts
 * Central Task Tracker & Loading Pipeline Orchestrator.
 */

import {
  TaskStatus,
  LOADING_STAGES,
  getStageMeta,
  type LoadingTaskStartEvent,
  type LoadingTaskProgressEvent,
  type LoadingProgressObserver,
} from './types.ts';
import { LoadingTask, type LoadingTaskConfig } from './LoadingTask.ts';
import { StreamDownloadTracker } from './StreamDownloadTracker.ts';

export function groupTasksByStage(tasks: readonly LoadingTask[]): Map<number, LoadingTask[]> {
  const map = new Map<number, LoadingTask[]>();
  for (const task of tasks) {
    let group = map.get(task.stage);
    if (!group) {
      group = [];
      map.set(task.stage, group);
    }
    group.push(task);
  }
  return map;
}

export function computeWeightedStageProgress(
  stageGroups: ReadonlyMap<number, readonly LoadingTask[]>
): number {
  let accumulated = 0.0;
  for (const stageMeta of LOADING_STAGES) {
    const stageTasks = stageGroups.get(stageMeta.index) || [];
    if (stageTasks.length === 0) continue;

    let totalWeight = 0;
    let completedWeight = 0;
    for (const task of stageTasks) {
      totalWeight += task.weight;
      if (task.status === TaskStatus.COMPLETED || task.status === TaskStatus.SKIPPED) {
        completedWeight += task.weight;
      } else if (task.status === TaskStatus.RUNNING) {
        completedWeight += task.weight * task.progress;
      }
    }
    if (totalWeight > 0) {
      accumulated += stageMeta.weight * (completedWeight / totalWeight);
    }
  }
  return Math.max(0.0, Math.min(1.0, accumulated));
}

export class LoadingOrchestrator {
  _runtimeExceptionPromise: Promise<never> | null = null;
  activeTask: LoadingTask | null = null;
  currentStageIndex = 1;
  currentStep = 0;
  downloadTracker: StreamDownloadTracker;
  fatalError: Error | null = null;
  isCompleted = false;
  isRunning = false;
  observers = new Set<LoadingProgressObserver>();
  options: Record<string, unknown>;
  overallRatio = 0.0;
  sharedData = new Map<string, unknown>();
  startTime = 0;
  taskMap = new Map<string, LoadingTask>();
  tasks: LoadingTask[] = [];
  totalSteps = 0;

  constructor(options: Record<string, unknown> = {}) {
    this.options = options;
    this.downloadTracker = new StreamDownloadTracker((streamUpdate) => {
      this._notifyObservers((obs) => obs.onByteStreamProgress?.(streamUpdate));
    });
  }

  registerTask(taskConfig: LoadingTask | LoadingTaskConfig): LoadingTask {
    const task = taskConfig instanceof LoadingTask ? taskConfig : new LoadingTask(taskConfig);
    if (this.taskMap.has(task.id)) {
      throw new Error(`[LoadingOrchestrator] Duplicate task id: "${task.id}"`);
    }
    this.tasks.push(task);
    this.taskMap.set(task.id, task);
    this.totalSteps = this.tasks.length;
    return task;
  }

  getTask(id: string): LoadingTask | undefined {
    return this.taskMap.get(id);
  }

  subscribe(observer: LoadingProgressObserver | null | undefined): () => void {
    if (observer && typeof observer === 'object') this.observers.add(observer);
    return () => {
      if (observer) this.observers.delete(observer);
    };
  }

  getShared<T = unknown>(key: string): T | undefined {
    return this.sharedData.get(key) as T | undefined;
  }

  setShared<T = unknown>(key: string, value: T): T {
    this.sharedData.set(key, value);
    return value;
  }

  hasShared(key: string): boolean {
    return this.sharedData.has(key);
  }

  calculateOverallProgress(): number {
    this.overallRatio = computeWeightedStageProgress(groupTasksByStage(this.tasks));
    return this.overallRatio;
  }

  async run(): Promise<LoadingOrchestrator> {
    if (this.isRunning) {
      throw new Error('[LoadingOrchestrator] Pipeline is already running.');
    }
    this.isRunning = true;
    this.fatalError = null;
    this.startTime = performance.now();
    this.totalSteps = this.tasks.length;
    this.currentStep = 0;

    const detachExceptionGuard = this._attachGlobalExceptionGuard();
    const stageGroups = groupTasksByStage(this.tasks);
    const sortedStages = Array.from(stageGroups.keys()).sort((a, b) => a - b);

    try {
      for (const stageIndex of sortedStages) {
        this.currentStageIndex = stageIndex;
        const stageMeta = getStageMeta(stageIndex);
        this._notifyObservers((obs) =>
          obs.onStageChange?.({
            stageIndex,
            totalStages: LOADING_STAGES.length,
            stageTitle: stageMeta.title,
            stageDescription: stageMeta.description,
          })
        );
        await this._executeStageTasks(stageGroups.get(stageIndex) || []);
      }

      this.isCompleted = true;
      this.isRunning = false;
      this.overallRatio = 1.0;
      this._notifyObservers((obs) =>
        obs.onComplete?.({
          totalDurationMs: performance.now() - this.startTime,
          totalSteps: this.totalSteps,
        })
      );
      return this;
    } catch (err) {
      this.isRunning = false;
      throw err;
    } finally {
      detachExceptionGuard();
    }
  }

  private _attachGlobalExceptionGuard(): () => void {
    let rejectRuntimeException: ((reason?: unknown) => void) | null = null;
    this._runtimeExceptionPromise = new Promise<never>((_, reject) => {
      rejectRuntimeException = reject;
    });
    this._runtimeExceptionPromise.catch(() => {});

    const triggerFatalException = (rawErr: unknown, fallbackMessage: string) => {
      if (!this.isRunning || this.isCompleted || this.fatalError) return;
      this.fatalError =
        rawErr instanceof Error
          ? rawErr
          : new Error(typeof rawErr === 'string' && rawErr.length > 0 ? rawErr : fallbackMessage);
      rejectRuntimeException?.(this.fatalError);
    };

    const onWindowError = (event: ErrorEvent | Event) => {
      if (
        !event ||
        (event.target &&
          typeof window !== 'undefined' &&
          event.target !== window &&
          !(event instanceof ErrorEvent))
      ) {
        return;
      }
      const errEvent = event instanceof ErrorEvent ? event : null;
      const err =
        errEvent?.error instanceof Error
          ? errEvent.error
          : new Error(errEvent?.message || 'Uncaught runtime exception during bootstrap');
      if (!err.stack && errEvent?.filename) {
        err.stack = `${err.message}\n    at ${errEvent.filename}:${errEvent.lineno || 0}:${errEvent.colno || 0}`;
      }
      triggerFatalException(err, 'Uncaught runtime exception during bootstrap');
    };

    const onUnhandledRejection = (event: PromiseRejectionEvent) => {
      if (!event) return;
      triggerFatalException(event.reason, 'Unhandled promise rejection during bootstrap');
    };

    if (typeof window !== 'undefined' && typeof window.addEventListener === 'function') {
      window.addEventListener('error', onWindowError);
      window.addEventListener('unhandledrejection', onUnhandledRejection);
    }

    return () => {
      if (typeof window !== 'undefined' && typeof window.removeEventListener === 'function') {
        window.removeEventListener('error', onWindowError);
        window.removeEventListener('unhandledrejection', onUnhandledRejection);
      }
    };
  }

  async _executeStageTasks(tasks: LoadingTask[]): Promise<void> {
    const pending = new Set<LoadingTask>(tasks);

    while (pending.size > 0) {
      if (this.fatalError) throw this.fatalError;

      const readyTasks = Array.from(pending).filter((task) =>
        task.dependencies.every((depId) => {
          const dep = this.taskMap.get(depId);
          return dep && (dep.status === TaskStatus.COMPLETED || dep.status === TaskStatus.SKIPPED);
        })
      );

      if (readyTasks.length === 0) {
        const unresolved = Array.from(pending).map(
          (t) => `${t.id} -> [${t.dependencies.join(', ')}]`
        );
        throw new Error(
          `[LoadingOrchestrator] Unresolved task dependencies in Stage ${this.currentStageIndex}: ${unresolved.join('; ')}`
        );
      }

      await Promise.all(
        readyTasks.map(async (task) => {
          pending.delete(task);
          await this._runSingleStageTask(task);
        })
      );
    }
  }

  private async _runSingleStageTask(task: LoadingTask): Promise<void> {
    this.currentStep++;
    this.activeTask = task;

    const stepInfo: LoadingTaskStartEvent = {
      taskId: task.id,
      taskName: task.name,
      step: this.currentStep,
      totalSteps: this.totalSteps,
      stageIndex: this.currentStageIndex,
      totalStages: LOADING_STAGES.length,
      overallPercent: this.calculateOverallProgress() * 100,
      taskType: task.type,
      category: task.category,
      hint: task.hint,
    };
    this._notifyObservers((obs) => obs.onTaskStart?.(stepInfo));

    const context = {
      downloadTracker: this.downloadTracker,
      getShared: <T = unknown>(key: string) => this.getShared<T>(key),
      setShared: <T = unknown>(key: string, val: T) => this.setShared<T>(key, val),
      hasShared: (key: string) => this.hasShared(key),
      reportTaskProgress: (taskId: string, progress: number, detail: string) => {
        this._handleTaskProgress(taskId, progress, detail);
      },
    };

    try {
      const execPromise = task.execute(context);
      await (this._runtimeExceptionPromise
        ? Promise.race([execPromise, this._runtimeExceptionPromise])
        : execPromise);

      this._notifyObservers((obs) =>
        obs.onTaskComplete?.({
          ...stepInfo,
          overallPercent: this.calculateOverallProgress() * 100,
          durationMs: task.durationMs,
          status: task.status,
        })
      );
    } catch (err) {
      task.status = TaskStatus.FAILED;
      task.error = err;
      const isCritical = Boolean(task.critical || this.fatalError);
      this._notifyObservers((obs) =>
        obs.onError?.({
          taskId: task.id,
          taskName: task.name,
          error: err,
          isCritical,
        })
      );
      if (isCritical) throw err;
    }
  }

  _handleTaskProgress(taskId: string, taskProgress: number, detail: string): void {
    const task = this.taskMap.get(taskId);
    if (!task) return;

    const overallPercent = this.calculateOverallProgress() * 100;
    const progressEvent: LoadingTaskProgressEvent = {
      taskId: task.id,
      taskName: task.name,
      step: this.currentStep,
      totalSteps: this.totalSteps,
      stageIndex: this.currentStageIndex,
      totalStages: LOADING_STAGES.length,
      taskProgress,
      detail,
      overallPercent,
      bytes: {
        loadedBytes: this.downloadTracker.loadedBytes,
        totalBytes: this.downloadTracker.totalBytes,
      },
    };

    const stageTitle = getStageMeta(this.currentStageIndex).title;
    this._notifyObservers((obs) => {
      obs.onTaskProgress?.(progressEvent);
      obs.onOverallProgress?.({
        overallRatio: this.overallRatio,
        currentStep: this.currentStep,
        totalSteps: this.totalSteps,
        activeTaskName: task.name,
        stageTitle,
      });
    });
  }

  private _notifyObservers(fn: (observer: LoadingProgressObserver) => void): void {
    for (const obs of this.observers) {
      fn(obs);
    }
  }
}
