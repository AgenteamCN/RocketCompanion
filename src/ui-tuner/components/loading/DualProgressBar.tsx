import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { LoadingStep, LoadingError } from './types';
import { AlertCircle, RefreshCw, ShieldAlert } from 'lucide-react';

export interface DualProgressBarProps {
  steps: LoadingStep[];
  currentStepIndex: number;
  overallProgressPct?: number;
  error?: LoadingError | null;
  isLight?: boolean;
  onRetry?: () => void;
  onReset?: () => void;
  retryLabel?: string;
  resetLabel?: string;
  className?: string;
}

export const calculateOverallProgress = (
  steps: LoadingStep[],
  currentStepIndex: number
): number => {
  if (!steps || steps.length === 0) return 0;
  let completedRatio = 0;
  steps.forEach((step, idx) => {
    if (idx < currentStepIndex || step.status === 'completed') {
      completedRatio += 1.0;
    } else if (idx === currentStepIndex && step.status === 'active' && step.type === 'determinate') {
      completedRatio += Math.max(0, Math.min(1, (step.progressPct || 0) / 100));
    }
  });
  return Math.min(100, Math.max(0, (completedRatio / steps.length) * 100));
};

export const formatBytes = (bytes?: number): string => {
  if (bytes === undefined || bytes === null || isNaN(bytes)) return '0 B';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
};

export const formatSpeed = (bps?: number): string => (!bps || bps <= 0 ? '' : `${formatBytes(bps)}/s`);

export const formatTimeRemaining = (seconds?: number): string => {
  if (seconds === undefined || seconds === null || seconds <= 0) return '';
  if (seconds < 60) return `About ${Math.ceil(seconds)} seconds remaining`;
  const mins = Math.ceil(seconds / 60);
  return `About ${mins} minute${mins > 1 ? 's' : ''} remaining`;
};

export const DualProgressBar: React.FC<DualProgressBarProps> = React.memo(({
  steps = [],
  currentStepIndex = 0,
  overallProgressPct,
  error = null,
  isLight,
  onRetry,
  onReset,
  retryLabel = 'Retry Current Step',
  resetLabel = 'Restart Pipeline',
  className = '',
}) => {
  const effectiveOverallProgressPct =
    overallProgressPct !== undefined
      ? overallProgressPct
      : calculateOverallProgress(steps, currentStepIndex);
  const resolvedIsLight =
    isLight !== undefined
      ? isLight
      : typeof document !== 'undefined'
      ? document.documentElement.classList.contains('light') || document.documentElement.dataset.theme === 'light'
      : false;

  const currentStep = steps[currentStepIndex] || {
    id: 'unknown',
    title: 'Initializing...',
    type: 'indeterminate',
    status: 'active',
  };

  const hasError = !!error || currentStep.status === 'error';
  const isDeterminate = currentStep.type === 'determinate' && !hasError;

  const subStepProgress = Math.max(
    0,
    Math.min(
      100,
      currentStep.progressPct !== undefined
        ? currentStep.progressPct
        : currentStep.bytesLoaded !== undefined && currentStep.bytesTotal
        ? (currentStep.bytesLoaded / currentStep.bytesTotal) * 100
        : 0
    )
  );

  return (
    <div
      data-ui-element="dual-progress-bar"
      className={`flex flex-col gap-5 w-full max-w-[560px] mx-auto select-none transition-colors ${className}`}
    >
      <div className="flex flex-col gap-1.5">
        <div className="flex items-center justify-between text-xs font-mono font-medium tracking-tight">
          <div className="flex items-center gap-1.5">
            <span
              className={`font-bold uppercase tracking-wider text-[11px] ${
                hasError ? 'text-red-500' : resolvedIsLight ? 'text-neutral-500' : 'text-neutral-400'
              }`}
            >
              Step {Math.min(currentStepIndex + 1, steps.length)} of {steps.length}
            </span>
            {currentStep.category && (
              <>
                <span className={resolvedIsLight ? 'text-neutral-300' : 'text-neutral-600'}>•</span>
                <span className={resolvedIsLight ? 'text-neutral-600' : 'text-neutral-400'}>
                  {currentStep.category}
                </span>
              </>
            )}
          </div>

          <span
            className={`font-black tabular-nums text-xs ${
              hasError ? 'text-red-500' : resolvedIsLight ? 'text-neutral-800' : 'text-neutral-200'
            }`}
          >
            {Math.round(effectiveOverallProgressPct)}%
          </span>
        </div>

        <div
          className={`h-1.5 w-full rounded-full overflow-hidden relative transition-colors ${
            hasError
              ? 'bg-red-950/40 dark:bg-red-950/60'
              : resolvedIsLight
              ? 'bg-neutral-200'
              : 'bg-neutral-800'
          }`}
        >
          <motion.div
            key="overall-progress-fill"
            className={`h-full rounded-full absolute top-0 bottom-0 left-0 transition-colors ${
              hasError
                ? 'bg-red-500 shadow-[0_0_10px_rgba(239,68,68,0.6)]'
                : resolvedIsLight
                ? 'bg-neutral-800'
                : 'bg-neutral-200'
            }`}
            initial={false}
            animate={{ width: `${Math.min(100, Math.max(0, effectiveOverallProgressPct))}%` }}
            style={{ originX: 0, left: 0, transform: 'none' }}
            transition={{ type: 'spring', stiffness: 260, damping: 28 }}
          />
        </div>
      </div>

      <div className="flex flex-col gap-1.5">
        <div className="flex items-baseline justify-between text-xs">
          <span
            className={`font-semibold tracking-tight text-sm truncate max-w-[360px] ${
              hasError ? 'text-red-500' : resolvedIsLight ? 'text-neutral-900' : 'text-white'
            }`}
          >
            {currentStep.title}
          </span>

          <div className="font-mono text-xs tabular-nums text-right shrink-0">
            {hasError ? (
              <span className="text-red-500 font-bold flex items-center gap-1">
                <AlertCircle className="h-3 w-3" />
                Halted
              </span>
            ) : isDeterminate ? (
              <span className={resolvedIsLight ? 'text-neutral-600 font-bold' : 'text-neutral-400 font-bold'}>
                {currentStep.bytesTotal
                  ? `${formatBytes(currentStep.bytesLoaded)} / ${formatBytes(currentStep.bytesTotal)}`
                  : `${Math.round(subStepProgress)}%`}
              </span>
            ) : (
              <span className="flex items-center gap-1.5 text-amber-500 font-medium text-[11px]">
                <span className="relative flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75" />
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-amber-500" />
                </span>
                Processing
              </span>
            )}
          </div>
        </div>

        <div
          className={`h-2 w-full rounded-full overflow-hidden relative transition-colors ${
            hasError
              ? 'bg-red-950/40 dark:bg-red-950/60 ring-1 ring-red-500/40'
              : resolvedIsLight
              ? 'bg-neutral-200/90'
              : 'bg-neutral-800/90'
          }`}
        >
          {hasError ? (
            <div key="micro-error" className="h-full w-full bg-red-500 shadow-[0_0_12px_rgba(239,68,68,0.7)]" />
          ) : isDeterminate ? (
            <motion.div
              key={`micro-determinate-${currentStep.id}`}
              className={`h-full rounded-full absolute top-0 bottom-0 left-0 ${
                resolvedIsLight ? 'bg-amber-500' : 'bg-amber-400'
              }`}
              initial={false}
              animate={{ width: `${subStepProgress}%` }}
              style={{ originX: 0, left: 0, transform: 'none' }}
              transition={{ type: 'spring', stiffness: 300, damping: 30 }}
            />
          ) : (
            <div key="micro-indeterminate" className="relative w-full h-full overflow-hidden">
              <div
                className={`absolute inset-0 rounded-full animate-pulse opacity-40 ${
                  resolvedIsLight ? 'bg-amber-500/30' : 'bg-amber-400/25'
                }`}
              />
              <motion.div
                key="micro-shimmer"
                className={`absolute top-0 bottom-0 w-2/5 rounded-full ${
                  resolvedIsLight
                    ? 'bg-gradient-to-r from-transparent via-amber-500/80 to-transparent'
                    : 'bg-gradient-to-r from-transparent via-amber-300/80 to-transparent'
                }`}
                animate={{ x: ['-100%', '300%'] }}
                transition={{ repeat: Infinity, duration: 1.6, ease: 'easeInOut' }}
              />
            </div>
          )}
        </div>

        <div className="flex items-center justify-between text-[11px] font-mono min-h-[18px]">
          {hasError ? (
            <span className="text-red-500 font-medium">
              Error thrown in step {currentStep.id}: {error?.message || currentStep.errorDetails || 'Process aborted.'}
            </span>
          ) : isDeterminate ? (
            <div className="flex items-center gap-2 text-neutral-500 dark:text-neutral-400">
              {currentStep.bytesLoaded && currentStep.bytesTotal && (
                <span>
                  {formatBytes(currentStep.bytesLoaded)} of {formatBytes(currentStep.bytesTotal)} ({Math.round(subStepProgress)}%)
                </span>
              )}
              {currentStep.speedBps && currentStep.speedBps > 0 && (
                <>
                  <span>•</span>
                  <span>{formatSpeed(currentStep.speedBps)}</span>
                </>
              )}
              {currentStep.timeRemainingSec !== undefined && currentStep.timeRemainingSec > 0 && (
                <>
                  <span>•</span>
                  <span>{formatTimeRemaining(currentStep.timeRemainingSec)}</span>
                </>
              )}
            </div>
          ) : (
            <div className="flex items-center gap-2 text-neutral-500 dark:text-neutral-400">
              <span className="inline-block animate-pulse">●</span>
              <span>
                {currentStep.indeterminateHint ||
                  'Compiling shaders & warming GPU pipeline cache (please wait, system active)...'}
              </span>
            </div>
          )}
        </div>
      </div>

      <AnimatePresence>
        {hasError && (
          <motion.div
            initial={{ opacity: 0, y: 10, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 10, scale: 0.98 }}
            transition={{ type: 'spring', stiffness: 400, damping: 25 }}
            className={`p-4 rounded-2xl border shadow-xl flex flex-col gap-3 ${
              resolvedIsLight
                ? 'bg-red-50/95 border-red-200 text-neutral-900 shadow-red-500/10'
                : 'bg-red-950/70 border-red-800/80 text-white shadow-black/50'
            }`}
          >
            <div className="flex items-start gap-3">
              <div className="p-2 rounded-xl bg-red-500/20 text-red-500 shrink-0 mt-0.5">
                <ShieldAlert className="h-5 w-5" />
              </div>

              <div className="flex flex-col flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-mono font-bold uppercase tracking-wider text-red-600 dark:text-red-400">
                    {error?.code || 'ERR_LOADING_FAILED'}
                  </span>
                  <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-red-500/20 text-red-600 dark:text-red-300">
                    Fatal Pipeline Error
                  </span>
                </div>

                <h4 className="text-sm font-bold text-neutral-900 dark:text-white mt-0.5">
                  {error?.title || 'Initialization Pipeline Threw an Exception'}
                </h4>

                <p className="text-xs text-neutral-700 dark:text-neutral-300 mt-1 leading-relaxed">
                  {error?.message ||
                    'An unrecoverable exception was raised during asset or shader initialization. Loading stopped to prevent state corruption.'}
                </p>

                {error?.technicalDetails && (
                  <pre className="mt-2 p-2 rounded-lg bg-black/10 dark:bg-black/40 border border-red-500/20 font-mono text-[11px] text-red-700 dark:text-red-300 overflow-x-auto whitespace-pre-wrap">
                    {error.technicalDetails}
                  </pre>
                )}
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-red-200/60 dark:border-red-900/40">
              {onReset && (
                <button
                  type="button"
                  onClick={onReset}
                  className={`px-3 py-1.5 rounded-xl text-xs font-medium transition-colors cursor-pointer ${
                    resolvedIsLight
                      ? 'bg-white hover:bg-neutral-100 text-neutral-700 border border-neutral-300'
                      : 'bg-neutral-900 hover:bg-neutral-800 text-neutral-300 border border-neutral-700'
                  }`}
                >
                  {resetLabel}
                </button>
              )}

              {onRetry && (
                <button
                  type="button"
                  onClick={onRetry}
                  className="px-3 py-1.5 rounded-xl text-xs font-bold bg-red-600 hover:bg-red-500 text-white shadow-md active:scale-95 transition-all cursor-pointer flex items-center gap-1.5"
                >
                  <RefreshCw className="h-3 w-3" />
                  <span>{retryLabel}</span>
                </button>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
});

DualProgressBar.displayName = 'DualProgressBar';
