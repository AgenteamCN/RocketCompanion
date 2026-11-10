export type LoadingStepType = 'determinate' | 'indeterminate';

export type LoadingStepStatus = 'pending' | 'active' | 'completed' | 'error';

export interface LoadingStep {
  id: string;
  title: string;
  category?: string;
  type: LoadingStepType;
  status: LoadingStepStatus;
  progressPct?: number; // 0 - 100 for determinate
  bytesLoaded?: number; // for asset/file downloads
  bytesTotal?: number; // for asset/file downloads
  speedBps?: number; // bytes per second
  indeterminateHint?: string; // status string for indeterminate step
  timeRemainingSec?: number;
  errorDetails?: string;
}

export interface LoadingError {
  code: string;
  title: string;
  message: string;
  stepId: string;
  technicalDetails?: string;
  retryable?: boolean;
  timestamp: number;
}

export interface LoadingPipelineConfig {
  steps: LoadingStep[];
  currentStepIndex: number;
  overallProgressPct: number;
  isComplete: boolean;
  error: LoadingError | null;
  appTitle?: string;
  appSubtitle?: string;
}
