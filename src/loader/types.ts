/**
 * src/loader/types.ts
 * Loading Subsystem Types and Lifecycle Stage Definitions.
 */

export type TaskStatusValue = 'idle' | 'running' | 'completed' | 'failed' | 'skipped';

export type TaskExecutionType = 'determinate' | 'indeterminate';

export const TaskStatus = Object.freeze({
  IDLE: 'idle' as const,
  RUNNING: 'running' as const,
  COMPLETED: 'completed' as const,
  FAILED: 'failed' as const,
  SKIPPED: 'skipped' as const,
});

export interface LoadingStageMeta {
  index: number;
  id: string;
  title: string;
  description: string;
  weight: number;
}

export const LOADING_STAGES: readonly LoadingStageMeta[] = Object.freeze([
  {
    index: 1,
    id: 'preflight',
    title: 'Security Preflight',
    description: 'Verifying POV camera microkernel SHA-256 and ABI integrity...',
    weight: 0.1,
  },
  {
    index: 2,
    id: 'diagnostics',
    title: 'Asset Diagnostics',
    description: 'Auditing static assets and validating binary headers...',
    weight: 0.05,
  },
  {
    index: 3,
    id: 'physics',
    title: 'Physics & Arena Mesh',
    description: 'Streaming RocketSim WASM and building 16-chunk collision mesh...',
    weight: 0.35,
  },
  {
    index: 4,
    id: 'geometry',
    title: '3D Geometry & Assets',
    description: 'Streaming stadium turf, ball, and player vehicle meshes...',
    weight: 0.3,
  },
  {
    index: 5,
    id: 'shaders',
    title: 'Shader Pipeline Prewarming',
    description: 'Pre-compiling GPU shaders and prewarming bloom rendering passes...',
    weight: 0.15,
  },
  {
    index: 6,
    id: 'ignition',
    title: 'Engine Ignition',
    description: 'Firing 120Hz deterministic render clock and synchronizing first frame...',
    weight: 0.05,
  },
]);

export function getStageMeta(stageIndex: number): LoadingStageMeta {
  return (
    LOADING_STAGES.find((s) => s.index === stageIndex) || {
      index: stageIndex,
      id: `stage_${stageIndex}`,
      title: `Stage ${stageIndex}`,
      description: 'Processing...',
      weight: 0.1,
    }
  );
}

export interface LoadingBootstrapError extends Error {
  isMicrokernelError?: boolean;
  isAssetError?: boolean;
}

export interface LoadingStageChangeEvent {
  stageIndex: number;
  totalStages: number;
  stageTitle: string;
  stageDescription?: string;
}

export interface LoadingTaskStartEvent {
  taskId: string;
  taskName: string;
  step: number;
  totalSteps: number;
  stageIndex: number;
  totalStages: number;
  overallPercent: number;
  taskType?: TaskExecutionType | string;
  category?: string;
  hint?: string;
}

export interface LoadingTaskProgressEvent {
  taskId?: string;
  taskName?: string;
  step?: number;
  totalSteps?: number;
  stageIndex?: number;
  totalStages?: number;
  taskProgress?: number;
  detail?: string;
  overallPercent?: number;
  bytes?: {
    loadedBytes: number;
    totalBytes: number;
  };
}

export interface LoadingOverallProgressEvent {
  overallRatio: number;
  currentStep: number;
  totalSteps: number;
  activeTaskName: string;
  stageTitle: string;
}

export interface StreamDownloadProgressInfo {
  overallRatio: number;
  loadedBytes: number;
  totalBytes: number;
  activeUrl: string;
  currentLoaded: number;
  currentTotal: number;
}

export interface LoadingTaskCompleteEvent extends LoadingTaskStartEvent {
  durationMs: number;
  status: TaskStatusValue;
}

export interface LoadingErrorEvent {
  taskId?: string;
  taskName?: string;
  error: unknown;
  isCritical?: boolean;
}

export interface LoadingCompleteEvent {
  totalDurationMs?: number;
  totalSteps?: number;
}

export interface LoadingProgressObserver {
  onStageChange?: (data: LoadingStageChangeEvent) => void;
  onTaskStart?: (data: LoadingTaskStartEvent) => void;
  onTaskProgress?: (data: LoadingTaskProgressEvent) => void;
  onOverallProgress?: (data: LoadingOverallProgressEvent) => void;
  onByteStreamProgress?: (data: StreamDownloadProgressInfo) => void;
  onTaskComplete?: (data: LoadingTaskCompleteEvent) => void;
  onError?: (data: LoadingErrorEvent) => void;
  onComplete?: (data: LoadingCompleteEvent) => void;
}
