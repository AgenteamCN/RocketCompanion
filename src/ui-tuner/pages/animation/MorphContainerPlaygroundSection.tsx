import React from 'react';
import { Clock, Layers, MoveRight, RefreshCw } from 'lucide-react';
import { MorphContainer } from '../../../ui-core/navigation/transitions';
import { Badge } from '../../../ui-core/primitives/Badge';
import { Button } from '../../../ui-core/primitives/Button';
import { useAnimationSyncedState } from './useAnimationSyncedState';

export interface MorphContainerPlaygroundSectionProps {
  isLight: boolean;
}

export const MorphContainerPlaygroundSection: React.FC<
  MorphContainerPlaygroundSectionProps
> = ({ isLight }) => {
  const {
    containerMode,
    setContainerMode,
    containerView,
    setContainerView,
    activePhase,
    setActivePhase,
    fluidDuration,
    setFluidDuration,
    stepFadeDuration,
    setStepFadeDuration,
    stepResizeDuration,
    setStepResizeDuration,
  } = useAnimationSyncedState();

  return (
    <div
      id="l4-anim-1-morph-container"
      className={`scroll-mt-24 p-6 rounded-2xl border flex flex-col gap-5 transition-colors ${
        isLight ? 'bg-white border-neutral-200 shadow-2xs' : 'bg-neutral-900/60 border-neutral-800'
      }`}
    >
      {/* Live Container Trigger (View Box — Pinned above mode switcher & conditional 3-Stage Timeline Indicator) */}
      <div
        className={`p-8 rounded-xl border flex flex-col items-center justify-center min-h-[220px] transition-colors ${
          isLight ? 'bg-neutral-50/80 border-neutral-200' : 'bg-neutral-950/40 border-neutral-800'
        }`}
      >
        <MorphContainer
          currentKey={containerView}
          width={containerView === 'compact' ? 320 : 520}
          mode={containerMode}
          fluidDuration={fluidDuration}
          stepFadeDuration={stepFadeDuration}
          stepResizeDuration={stepResizeDuration}
          onPhaseChange={setActivePhase}
          className="p-5 rounded-2xl border shadow-lg overflow-hidden bg-white dark:bg-neutral-900 border-neutral-300 dark:border-neutral-700"
        >
          {containerView === 'compact' ? (
            <div className="flex flex-col gap-3">
              <div className="flex items-center justify-between">
                <span className="font-bold text-sm">Compact Panel (320px)</span>
                <Badge variant="primary" size="sm" isLight={isLight}>
                  Stage A
                </Badge>
              </div>
              <p className={`text-xs ${isLight ? 'text-neutral-600' : 'text-neutral-400'}`}>
                Compact State: Used for primary shortcut menu or summary card.
              </p>
              <Button
                size="sm"
                variant="primary"
                onClick={() => setContainerView('expanded')}
                isLight={isLight}
                icon={<MoveRight className="h-3.5 w-3.5" />}
              >
                Trigger switch to expanded panel
              </Button>
            </div>
          ) : (
            <div className="flex flex-col gap-3">
              <div className="flex items-center justify-between">
                <span className="font-bold text-sm">Expanded Panel (520px)</span>
                <Badge variant="success" size="sm" isLight={isLight}>
                  Stage B
                </Badge>
              </div>
              <p
                className={`text-xs leading-relaxed ${
                  isLight ? 'text-neutral-600' : 'text-neutral-400'
                }`}
              >
                Expanded State: For Secondary Garage/Configure Complex Forms. in
                SequencedStepTransition Experience in Mode {Math.round(stepFadeDuration * 1000)}ms
                fade out → {Math.round(stepResizeDuration * 1000)}ms Container width transition →{' '}
                {Math.round(stepFadeDuration * 1000)}ms Fade In.
              </p>
              <div className="flex items-center gap-2">
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => setContainerView('compact')}
                  isLight={isLight}
                >
                  Return to Compact Panel
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => {
                    setContainerView('compact');
                    setTimeout(() => setContainerView('expanded'), 400);
                  }}
                  isLight={isLight}
                  icon={<RefreshCw className="h-3.5 w-3.5" />}
                >
                  Replay Transition
                </Button>
              </div>
            </div>
          )}
        </MorphContainer>
      </div>

      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-2 font-bold text-sm">
          <Layers className="h-4 w-4 text-amber-500" />
          <span>1. Unified container transition engine comparison (Unified MorphContainer Standards)</span>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setContainerMode('fluid-morph')}
            className={`px-3 py-1 rounded-lg text-xs font-mono transition-all cursor-pointer border ${
              containerMode === 'fluid-morph'
                ? 'bg-amber-500 text-white border-amber-500 font-bold shadow-2xs'
                : isLight
                  ? 'bg-neutral-100 hover:bg-neutral-200 border-neutral-200 text-neutral-700'
                  : 'bg-neutral-800 hover:bg-neutral-700 border-neutral-700 text-neutral-300'
            }`}
          >
            FluidMorphTransition
          </button>
          <button
            type="button"
            onClick={() => setContainerMode('sequenced-step')}
            className={`px-3 py-1 rounded-lg text-xs font-mono transition-all cursor-pointer border ${
              containerMode === 'sequenced-step'
                ? 'bg-amber-500 text-white border-amber-500 font-bold shadow-2xs'
                : isLight
                  ? 'bg-neutral-100 hover:bg-neutral-200 border-neutral-200 text-neutral-700'
                  : 'bg-neutral-800 hover:bg-neutral-700 border-neutral-700 text-neutral-300'
            }`}
          >
            SequencedStepTransition
          </button>
        </div>
      </div>

      {/* Transition Mode Specification Pill */}
      <div
        className={`p-3 rounded-xl border text-xs font-mono flex flex-col sm:flex-row sm:items-center justify-between gap-2 transition-colors ${
          isLight
            ? 'bg-neutral-50/90 border-neutral-200 text-neutral-700'
            : 'bg-neutral-950/40 border-neutral-800 text-neutral-300'
        }`}
      >
        <div>
          <span className="font-bold text-amber-500">
            {containerMode === 'fluid-morph'
              ? 'FluidMorphTransition'
              : 'SequencedStepTransition'}
          </span>
          <span className="ml-2 text-neutral-500">
            {containerMode === 'fluid-morph'
              ? `Apple Ease ${fluidDuration}s Fluid Continuous Deformation (Single time parameter drive)`
              : `${Math.round(stepFadeDuration * 1000)}ms Fade-out → ${Math.round(stepResizeDuration * 1000)}ms Container Resize → ${Math.round(stepFadeDuration * 1000)}ms Reveal Fade-in (Apple Ease)`}
          </span>
        </div>

        <Badge variant="primary" size="sm" isLight={isLight}>
          Curve: Apple HIG [0.2, 0.8, 0.25, 1]
        </Badge>
      </div>

      {/* Realtime Parameter Tuning Strip */}
      <div
        className={`p-3 rounded-xl border flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs ${
          isLight
            ? 'bg-neutral-100/60 border-neutral-200'
            : 'bg-neutral-950/20 border-neutral-800'
        }`}
      >
        {containerMode === 'fluid-morph' ? (
          <div className="flex items-center gap-3 w-full justify-between">
            <div className="flex items-center gap-1.5 font-mono text-[11px] text-neutral-500">
              <Clock className="h-3.5 w-3.5 text-amber-500" />
              <span>Fluid Duration (Single Time Parameter):</span>
            </div>
            <div className="flex items-center gap-1.5">
              {[0.18, 0.28, 0.45].map((d) => (
                <button
                  key={d}
                  type="button"
                  onClick={() => setFluidDuration(d)}
                  className={`px-2 py-0.5 rounded text-[11px] font-mono cursor-pointer border transition-colors ${
                    fluidDuration === d
                      ? 'bg-amber-500 text-white border-amber-500 font-bold'
                      : isLight
                        ? 'bg-white border-neutral-300 text-neutral-700'
                        : 'bg-neutral-800 border-neutral-700 text-neutral-300'
                  }`}
                >
                  {d}s {d === 0.28 && '(Default)'}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 w-full">
            <div className="flex items-center gap-2">
              <span className="font-mono text-[11px] text-neutral-500">Fade Duration:</span>
              {[0.08, 0.1, 0.15].map((fd) => (
                <button
                  key={fd}
                  type="button"
                  onClick={() => setStepFadeDuration(fd)}
                  className={`px-2 py-0.5 rounded text-[11px] font-mono cursor-pointer border transition-colors ${
                    stepFadeDuration === fd
                      ? 'bg-amber-500 text-white border-amber-500 font-bold'
                      : isLight
                        ? 'bg-white border-neutral-300 text-neutral-700'
                        : 'bg-neutral-800 border-neutral-700 text-neutral-300'
                  }`}
                >
                  {Math.round(fd * 1000)}ms
                </button>
              ))}
            </div>

            <div className="flex items-center gap-2">
              <span className="font-mono text-[11px] text-neutral-500">Resize Duration:</span>
              {[0.1, 0.15, 0.25].map((rd) => (
                <button
                  key={rd}
                  type="button"
                  onClick={() => setStepResizeDuration(rd)}
                  className={`px-2 py-0.5 rounded text-[11px] font-mono cursor-pointer border transition-colors ${
                    stepResizeDuration === rd
                      ? 'bg-amber-500 text-white border-amber-500 font-bold'
                      : isLight
                        ? 'bg-white border-neutral-300 text-neutral-700'
                        : 'bg-neutral-800 border-neutral-700 text-neutral-300'
                  }`}
                >
                  {Math.round(rd * 1000)}ms
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* 3-Stage Timeline Indicator for SequencedStepTransition */}
      {containerMode === 'sequenced-step' && (
        <div className="flex flex-col gap-2">
          <span
            className={`text-[11px] font-bold uppercase tracking-wider ${
              isLight ? 'text-neutral-500' : 'text-neutral-400'
            }`}
          >
            Timing phase monitor bar (Live Stage Telemetry):
          </span>
          <div className="grid grid-cols-3 gap-2">
            <div
              className={`p-2 rounded-lg border text-center transition-all ${
                activePhase === 'fadeOut'
                  ? 'bg-rose-500 text-white border-rose-500 shadow-md font-bold scale-[1.02]'
                  : isLight
                    ? 'bg-neutral-100 border-neutral-200 text-neutral-600'
                    : 'bg-neutral-900 border-neutral-800 text-neutral-400'
              }`}
            >
              <div className="text-[10px] font-mono opacity-80">
                PHASE 1 ({Math.round(stepFadeDuration * 1000)}ms)
              </div>
              <div className="text-xs font-semibold">Fade Out (opacity 100% → 0%)</div>
            </div>

            <div
              className={`p-2 rounded-lg border text-center transition-all ${
                activePhase === 'resize'
                  ? 'bg-amber-500 text-white border-amber-500 shadow-md font-bold scale-[1.02]'
                  : isLight
                    ? 'bg-neutral-100 border-neutral-200 text-neutral-600'
                    : 'bg-neutral-900 border-neutral-800 text-neutral-400'
              }`}
            >
              <div className="text-[10px] font-mono opacity-80">
                PHASE 2 ({Math.round(stepResizeDuration * 1000)}ms)
              </div>
              <div className="text-xs font-semibold">
                Resize (Content Hidden, Smooth container deformation)
              </div>
            </div>

            <div
              className={`p-2 rounded-lg border text-center transition-all ${
                activePhase === 'fadeIn'
                  ? 'bg-emerald-500 text-white border-emerald-500 shadow-md font-bold scale-[1.02]'
                  : isLight
                    ? 'bg-neutral-100 border-neutral-200 text-neutral-600'
                    : 'bg-neutral-900 border-neutral-800 text-neutral-400'
              }`}
            >
              <div className="text-[10px] font-mono opacity-80">
                PHASE 3 ({Math.round(stepFadeDuration * 1000)}ms)
              </div>
              <div className="text-xs font-semibold">Fade In (opacity 0% → 100%)</div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
