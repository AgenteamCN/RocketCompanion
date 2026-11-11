import React from 'react';
import { motion } from 'framer-motion';
import { DualProgressBar, DualProgressBarProps } from './DualProgressBar';
import { LoadingStep, LoadingError } from './types';
import { Sparkles, Gamepad2 } from 'lucide-react';

export interface LoadingScreenProps {
  steps: LoadingStep[];
  currentStepIndex: number;
  overallProgressPct?: number;
  error?: LoadingError | null;
  isLight?: boolean;
  appTitle?: string;
  appSubtitle?: string;
  showTips?: boolean;
  onRetry?: () => void;
  onReset?: () => void;
  className?: string;
}

export const DEFAULT_TIPS = [
  'Pro Tip: Double-jumping within 1.5 seconds lets you dodge and gain instant supersonic momentum.',
  'Pro Tip: Feather your boost during aerial ascent to conserve fuel for the final ball touch.',
  'Pro Tip: Landing on all four wheels with car body aligned to surface preserves 100% of your kinetic velocity.',
  'Pro Tip: Ball Cam gives you persistent 3D spatial awareness; switch to Car Cam when picking up 100 boost pads.',
];

export const LoadingScreen: React.FC<LoadingScreenProps> = React.memo(({
  steps,
  currentStepIndex,
  overallProgressPct,
  error = null,
  isLight = false,
  appTitle = 'Rocket Companion',
  appSubtitle = 'RCUITuner In-Game Runtime',
  showTips = true,
  onRetry,
  onReset,
  className = '',
}) => {
  return (
    <div
      data-ui-layer="loading-screen"
      className={`relative w-full h-full flex flex-col justify-between items-center p-6 sm:p-10 select-none overflow-hidden transition-colors ${
        isLight ? 'bg-[#f8fafc] text-neutral-900' : 'bg-neutral-950 text-neutral-100'
      } ${className}`}
    >
      {/* Ambient background glow */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden">
        <div
          className={`absolute top-1/4 left-1/2 -translate-x-1/2 w-[500px] h-[300px] rounded-full blur-[100px] transition-all duration-700 ${
            error
              ? 'bg-red-500/20'
              : isLight
              ? 'bg-amber-400/15'
              : 'bg-amber-500/10'
          }`}
        />
        <div
          className={`absolute bottom-1/4 left-1/2 -translate-x-1/2 w-[600px] h-[300px] rounded-full blur-[120px] transition-all duration-700 ${
            error
              ? 'bg-red-900/20'
              : isLight
              ? 'bg-sky-400/15'
              : 'bg-sky-600/10'
          }`}
        />
      </div>

      {/* 1. TOP HEADER: App / Game Brand */}
      <div className="relative z-10 flex flex-col items-center text-center pt-4 sm:pt-8">
        <motion.div
          initial={{ scale: 0.9, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ duration: 0.4 }}
          className="flex items-center gap-3"
        >
          <div className="h-10 w-10 rounded-2xl bg-gradient-to-tr from-amber-500 to-amber-400 text-black flex items-center justify-center font-black text-xl shadow-lg shadow-amber-500/20">
            RL
          </div>
          <div className="flex flex-col text-left">
            <h2 className="text-xl sm:text-2xl font-black tracking-tight font-mono">
              {appTitle}
            </h2>
            <span className={`text-xs font-mono tracking-wider uppercase ${isLight ? 'text-neutral-500' : 'text-neutral-400'}`}>
              {appSubtitle}
            </span>
          </div>
        </motion.div>
      </div>

      {/* 2. CENTER CONTENT: Dual Progress Bar Core */}
      <div className="relative z-10 w-full flex flex-col items-center justify-center my-auto px-4">
        <DualProgressBar
          steps={steps}
          currentStepIndex={currentStepIndex}
          overallProgressPct={overallProgressPct}
          error={error}
          isLight={isLight}
          onRetry={onRetry}
          onReset={onReset}
        />
      </div>

      {/* 3. BOTTOM FOOTER: Pro Tip / Hint or Custom Footer */}
      {showTips ? (
        <div className="relative z-10 flex flex-col items-center text-center pb-2 max-w-[500px]">
          <div
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs backdrop-blur-md border transition-colors ${
              isLight
                ? 'bg-white/80 border-neutral-200/80 text-neutral-600 shadow-xs'
                : 'bg-neutral-900/60 border-neutral-800 text-neutral-400 shadow-lg'
            }`}
          >
            <Gamepad2 className="h-3.5 w-3.5 text-amber-500 shrink-0" />
            <span className="truncate">{DEFAULT_TIPS[0]}</span>
          </div>
        </div>
      ) : null}
    </div>
  );
});

LoadingScreen.displayName = 'LoadingScreen';
