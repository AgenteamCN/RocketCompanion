import React from 'react';
import {
  Play,
  Pause,
  RotateCcw,
  CheckCircle2,
  Ruler,
  Check,
  ShieldAlert,
  Sun,
  Moon,
  Sparkles,
  Sliders,
} from 'lucide-react';
import { createScopedSyncedState } from '../../stores/crossClientSync';
import { LoadingStep, LoadingError } from '../../components/loading/types';
import { SliderControl } from '../../../ui-core/primitives/SliderControl';

const useState = createScopedSyncedState('page:loading-screen');

export interface LoadingPipelineControlDeckProps {
  isLight: boolean;
  steps: LoadingStep[];
  overallProgressPct: number;
  showToast: (msg: string) => void;
  onReset: () => void;
  onTriggerError: () => void;
  onRecoverError: () => void;
  onJumpToStep: (idx: number) => void;
  onStepProgressChange: (stepIdx: number, newPct: number) => void;
}

export const LoadingPipelineControlDeck: React.FC<LoadingPipelineControlDeckProps> = ({
  isLight,
  steps,
  overallProgressPct,
  showToast,
  onReset,
  onTriggerError,
  onRecoverError,
  onJumpToStep,
  onStepProgressChange,
}) => {
  const [currentStepIndex] = useState<number>(2, 'currentStepIndex');
  const [isRunning, setIsRunning] = useState<boolean>(false, 'isRunning');
  const [simSpeed, setSimSpeed] = useState<number>(1, 'simSpeed');
  const [error] = useState<LoadingError | null>(null, 'error');
  const [stageIsLight, setStageIsLight] = useState<boolean>(isLight, 'stageIsLight');
  const [feedbackToast] = useState<string | null>(null, 'feedbackToast');
  const currentStep = steps[currentStepIndex] || steps[0];

  const handleExportTelemetry = async () => {
    const stage = document.getElementById('loading-viewport-stage');
    if (!stage) return;
    const winW = window.innerWidth;
    const winH = window.innerHeight;
    const progressBar = stage.querySelector<HTMLElement>(
      '[data-ui-element="dual-progress-bar"]'
    );

    const getRectStr = (r: DOMRect) =>
      `${Math.round(r.width * 10) / 10}px × ${Math.round(r.height * 10) / 10}px (x: ${Math.round(
        r.x
      )}, y: ${Math.round(r.y)})`;

    const lines: string[] = [];
    lines.push('========================================================================');
    lines.push(' [LOADING SCREEN DUAL PROGRESS TELEMETRY SNAPSHOT]');
    lines.push('========================================================================');
    lines.push(`• Window Viewport:      ${winW}px × ${winH}px`);
    if (progressBar) {
      lines.push(`• Dual Progress Bar:    ${getRectStr(progressBar.getBoundingClientRect())}`);
    }
    lines.push(`• Active Step Index:    ${currentStepIndex + 1} of ${steps.length}`);
    lines.push(`• Active Step Title:    ${steps[currentStepIndex]?.title}`);
    lines.push(`• Active Step Type:     ${steps[currentStepIndex]?.type}`);
    lines.push(`• Overall Progress:     ${Math.round(overallProgressPct)}%`);
    lines.push(`• Pipeline Has Error:   ${!!error}`);
    lines.push('========================================================================\n');

    const report = lines.join('\n');
    console.log(report);
    if (navigator.clipboard?.writeText) {
      try {
        await navigator.clipboard.writeText(report);
        showToast(
          '[ok] Loading layer telemetry data exported to console and copied to clipboard'
        );
      } catch {
        showToast('[ok] Loading layer telemetry data exported to console');
      }
    }
  };

  return (
    <div
      className={`p-4 rounded-2xl border flex flex-col gap-3 transition-colors shadow-2xs ${
        isLight
          ? 'bg-white border-neutral-200/90 text-neutral-800'
          : 'bg-neutral-900/70 border-neutral-800 text-neutral-200'
      }`}
    >
      <div className="flex flex-wrap items-center justify-between gap-2 text-xs font-semibold">
        <div className="flex items-center gap-2 text-neutral-600 dark:text-neutral-400">
          <Sparkles className="h-4 w-4 text-sky-500" />
          <span>Loading pipeline interaction controller (Pipeline Simulation Controls)</span>
        </div>

        <div className="flex items-center gap-3 flex-wrap">
          {feedbackToast && (
            <span className="text-sky-500 font-mono font-bold flex items-center gap-1">
              <Check className="h-3 w-3" />
              {feedbackToast}
            </span>
          )}
          <button
            type="button"
            onClick={handleExportTelemetry}
            className={[
              'flex items-center gap-1.5 px-3 py-1.5 rounded-xl border font-mono font-medium',
              'transition-all active:scale-95 cursor-pointer bg-neutral-100 hover:bg-neutral-200',
              'dark:bg-neutral-800 dark:hover:bg-neutral-700 text-neutral-800 dark:text-neutral-100',
              'border-neutral-300 dark:border-neutral-700 shadow-2xs',
            ].join(' ')}
            title="Print and copy current Loading Interface layout and state data"
          >
            <Ruler className="h-3.5 w-3.5 text-sky-500" />
            <span>Export loading layer telemetry</span>
          </button>
        </div>
      </div>

      {/* Primary action buttons */}
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <button
          type="button"
          onClick={() => setIsRunning(!isRunning)}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl font-bold transition-all cursor-pointer shadow-xs ${
            isRunning
              ? 'bg-amber-500 hover:bg-amber-400 text-black'
              : 'bg-emerald-600 hover:bg-emerald-500 text-white'
          }`}
        >
          {isRunning ? (
            <>
              <Pause className="h-3.5 w-3.5" />
              <span>Pause simulation (Pause)</span>
            </>
          ) : (
            <>
              <Play className="h-3.5 w-3.5 fill-current" />
              <span>Start auto-simulation (Start Pipeline)</span>
            </>
          )}
        </button>

        <button
          type="button"
          onClick={onReset}
          className={[
            'flex items-center gap-1.5 px-3 py-1.5 rounded-xl border font-medium',
            'transition-colors cursor-pointer bg-neutral-100 hover:bg-neutral-200',
            'text-neutral-800 border-neutral-300 dark:bg-neutral-800',
            'dark:hover:bg-neutral-700 dark:text-neutral-200 dark:border-neutral-700',
          ].join(' ')}
        >
          <RotateCcw className="h-3.5 w-3.5" />
          <span>Reset workflow (Reset)</span>
        </button>

        <div className="h-4 w-px bg-neutral-300 dark:bg-neutral-700 mx-1" />

        <button
          type="button"
          onClick={onTriggerError}
          disabled={!!error}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl font-bold transition-all cursor-pointer shadow-xs ${
            error
              ? 'bg-red-950/40 text-red-400 border border-red-800/40 opacity-50 cursor-not-allowed'
              : 'bg-red-600 hover:bg-red-500 text-white active:scale-95 shadow-[0_0_12px_rgba(239,68,68,0.3)]'
          }`}
        >
          <ShieldAlert className="h-3.5 w-3.5" />
          <span>[Alert] Throw exception (Throw Error)</span>
        </button>

        {error && (
          <button
            type="button"
            onClick={onRecoverError}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl font-bold bg-emerald-600 hover:bg-emerald-500 text-white shadow-xs active:scale-95 transition-all cursor-pointer"
          >
            <CheckCircle2 className="h-3.5 w-3.5" />
            <span>Resume and continue (Recover &amp; Resume)</span>
          </button>
        )}

        <div className="h-4 w-px bg-neutral-300 dark:bg-neutral-700 mx-1" />

        <div className="flex items-center gap-1 p-1 rounded-xl border bg-neutral-100 dark:bg-neutral-800 border-neutral-300 dark:border-neutral-700 font-mono">
          <span className="text-[11px] px-1 text-neutral-500">Playback speed:</span>
          {[0.5, 1, 2, 5].map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => setSimSpeed(s)}
              className={`px-2 py-0.5 rounded-md font-bold transition-colors cursor-pointer ${
                simSpeed === s
                  ? 'bg-sky-500 text-white'
                  : 'text-neutral-600 dark:text-neutral-400 hover:text-black dark:hover:text-white'
              }`}
            >
              {s}x
            </button>
          ))}
        </div>

        <button
          type="button"
          onClick={() => setStageIsLight(!stageIsLight)}
          className={[
            'flex items-center gap-1.5 px-3 py-1.5 rounded-xl border font-medium',
            'transition-colors cursor-pointer bg-neutral-100 hover:bg-neutral-200',
            'text-neutral-800 border-neutral-300 dark:bg-neutral-800',
            'dark:hover:bg-neutral-700 dark:text-neutral-200 dark:border-neutral-700 ml-auto',
          ].join(' ')}
          title="Independently toggle light and dark tones of loading stage"
        >
          {stageIsLight ? (
            <Sun className="h-3.5 w-3.5 text-amber-500" />
          ) : (
            <Moon className="h-3.5 w-3.5 text-sky-400" />
          )}
          <span>Stage theme: {stageIsLight ? 'Light mode (Light)' : 'Dark mode (Dark)'}</span>
        </button>
      </div>

      {currentStep.type === 'determinate' && (
        <div className="p-3 rounded-xl border border-amber-500/30 bg-amber-500/5 flex flex-col gap-1.5">
          <div className="flex items-center justify-between text-xs font-mono">
            <span className="font-bold text-amber-600 dark:text-amber-400 flex items-center gap-1.5">
              <Sliders className="h-3.5 w-3.5" />
              <span>Real-time preview slider for current deterministic step (Adjust 0% ~ 100%)</span>
            </span>
            <span className="font-bold tabular-nums text-neutral-700 dark:text-neutral-300">
              {Math.round(currentStep.progressPct || 0)}%
            </span>
          </div>
          <SliderControl
            label={`Current step: ${currentStep.title}`}
            value={Math.round(currentStep.progressPct || 0)}
            min={0}
            max={100}
            step={1}
            unit="%"
            colorScheme="amber"
            isLight={isLight}
            onChange={(val) => onStepProgressChange(currentStepIndex, val)}
          />
        </div>
      )}

      <div className="flex flex-wrap items-center gap-1.5 pt-2 border-t border-neutral-200/80 dark:border-neutral-800 text-xs">
        <span className="text-[11px] font-mono text-neutral-500 dark:text-neutral-400 mr-1">
          Jump to step:
        </span>
        {steps.map((st, idx) => (
          <button
            key={st.id}
            type="button"
            onClick={() => onJumpToStep(idx)}
            className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg font-mono text-[11px] border transition-all cursor-pointer ${
              currentStepIndex === idx
                ? 'bg-sky-500 text-white font-bold border-sky-400 shadow-xs'
                : st.status === 'completed'
                ? isLight
                  ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                  : 'bg-emerald-950/40 text-emerald-300 border-emerald-800/40'
                : isLight
                ? 'bg-neutral-100 hover:bg-neutral-200 text-neutral-700 border-neutral-300'
                : 'bg-neutral-800/80 hover:bg-neutral-700 text-neutral-300 border-neutral-700'
            }`}
          >
            <span>{idx + 1}.</span>
            <span className="truncate max-w-[120px]">{st.title.split(' ')[0]}</span>
            <span className="text-[9px] opacity-75 font-sans">
              {st.type === 'determinate' ? '(Determinate)' : '(Indeterminate)'}
            </span>
          </button>
        ))}
      </div>
    </div>
  );
};
