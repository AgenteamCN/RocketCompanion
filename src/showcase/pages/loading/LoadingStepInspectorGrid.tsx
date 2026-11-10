import React from 'react';
import { Cpu } from 'lucide-react';
import { LoadingStep } from '../../components/loading/types';
import { formatBytes } from '../../components/loading/DualProgressBar';
import { SliderControl } from '../../../ui-core/primitives/SliderControl';

export interface LoadingStepInspectorGridProps {
  steps: LoadingStep[];
  currentStepIndex: number;
  isLight: boolean;
  onJumpToStep: (index: number) => void;
  onStepProgressChange: (stepIdx: number, newPct: number) => void;
}

export const LoadingStepInspectorGrid: React.FC<LoadingStepInspectorGridProps> = ({
  steps,
  currentStepIndex,
  isLight,
  onJumpToStep,
  onStepProgressChange,
}) => {
  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between text-xs font-mono font-bold text-neutral-600 dark:text-neutral-400 px-1">
        <span>Fine-tune sliders and detailed metrics for each deterministic stage (Determinate Steps Sliders & Diagnostics)</span>
        <span>Total {steps.length} stages</span>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {steps.map((st, idx) => {
          const isActive = idx === currentStepIndex;
          const isDone = st.status === 'completed';
          const isErr = st.status === 'error';

          return (
            <div
              key={st.id}
              className={`p-4 rounded-2xl border transition-all shadow-2xs flex flex-col justify-between gap-3 ${
                isErr
                  ? 'bg-red-500/10 border-red-500/50 text-red-400'
                  : isActive
                  ? isLight
                    ? 'bg-sky-50/80 border-sky-400 ring-2 ring-sky-500/20'
                    : 'bg-sky-950/30 border-sky-500/60 ring-2 ring-sky-500/20'
                  : isLight
                  ? 'bg-white border-neutral-200/90 hover:border-neutral-300'
                  : 'bg-neutral-900/60 border-neutral-800 hover:border-neutral-700'
              }`}
            >
              <div className="flex flex-col gap-1">
                <div className="flex items-center justify-between text-xs font-mono">
                  <span className="font-bold text-neutral-500 dark:text-neutral-400">STAGE 0{idx + 1}</span>
                  <button
                    type="button"
                    onClick={() => onJumpToStep(idx)}
                    className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider transition-colors cursor-pointer ${
                      isErr
                        ? 'bg-red-500 text-white'
                        : isActive
                        ? 'bg-sky-500 text-white'
                        : isDone
                        ? 'bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 hover:bg-emerald-500/30'
                        : 'bg-neutral-200 dark:bg-neutral-800 text-neutral-500 hover:text-neutral-800 dark:hover:text-neutral-200'
                    }`}
                  >
                    {isActive ? 'Active' : isDone ? 'Done · Jump' : 'Pending'}
                  </button>
                </div>
                <h4 className="text-sm font-bold tracking-tight text-neutral-900 dark:text-white mt-1">{st.title}</h4>
                <span className="text-[11px] font-mono text-neutral-500 dark:text-neutral-400">{st.category}</span>
              </div>

              {st.type === 'determinate' ? (
                <div className="pt-2 border-t border-neutral-200/60 dark:border-neutral-800 flex flex-col gap-1">
                  <SliderControl
                    label="Progress adjustment (0% ~ 100%)"
                    value={Math.round(st.progressPct || 0)}
                    min={0}
                    max={100}
                    step={1}
                    unit="%"
                    colorScheme="amber"
                    isLight={isLight}
                    onChange={(val) => onStepProgressChange(idx, val)}
                  />
                  <div className="flex items-center justify-between text-[11px] font-mono text-neutral-500 mt-0.5">
                    <span>Downloaded: {formatBytes(st.bytesLoaded)}</span>
                    <span>Total: {formatBytes(st.bytesTotal)}</span>
                  </div>
                </div>
              ) : (
                <div className="pt-2 border-t border-neutral-200/60 dark:border-neutral-800 text-xs font-mono flex items-center justify-between text-neutral-500">
                  <div className="flex items-center gap-1.5">
                    <Cpu className="h-3.5 w-3.5 text-purple-400" />
                    <span>Indeterminate state (Indeterminate)</span>
                  </div>
                  <span className="text-[11px] font-bold text-amber-500">Shimmer Wave</span>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};
