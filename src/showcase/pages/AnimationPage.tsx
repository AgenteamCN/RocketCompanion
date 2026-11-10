import React from 'react';
import { motion } from 'framer-motion';
import { Activity, Sparkles } from 'lucide-react';
import { Badge } from '../../ui-core/primitives/Badge';
import { Button } from '../../ui-core/primitives/Button';
import { CodeBlock } from '../CodeBlock';
import { TunerConfigExporterBar } from '../components/tuner/TunerConfigExporterBar';
import { PageJumpDirectory, type JumpDirectoryItem } from '../PageJumpDirectory';
import { MorphContainerPlaygroundSection } from './animation/MorphContainerPlaygroundSection';
import { useAnimationSyncedState } from './animation/useAnimationSyncedState';

const ANIMATION_JUMP_ITEMS: JumpDirectoryItem[] = [
  {
    id: 'l4-anim-1-morph-container',
    code: 'L4-A.1',
    name: 'MorphContainer (FluidMorph vs SequencedStep)',
    label: 'Unified container transition engine with live timing phase telemetry',
  },
  {
    id: 'l4-anim-2-tactile',
    code: 'L4-A.2',
    name: 'Tactile Micro-interactions',
    label: 'Millisecond active:scale-[0.98] tactile press feedback',
  },
  {
    id: 'l4-anim-3-spring',
    code: 'L4-A.3',
    name: 'Spring Physics Playground',
    label: 'Framer Motion stiffness & damping presets (tactile / bouncy / smooth)',
  },
];

export const AnimationPage: React.FC<{ isLight?: boolean }> = ({ isLight = true }) => {
  const {
    motionPreset,
    setMotionPreset,
    expanded,
    setExpanded,
    pulseCount,
    setPulseCount,
    containerMode,
    fluidDuration,
    stepFadeDuration,
    stepResizeDuration,
    springs,
    handleResetDefaults,
    buildExportCode,
  } = useAnimationSyncedState();

  return (
    <div className="flex flex-col gap-8 max-w-4xl">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Animation &amp; Motion Guidelines</h1>
        <p className={`text-xs mt-1 leading-relaxed ${isLight ? 'text-neutral-600' : 'text-neutral-400'}`}>
          Based on Apple Human Interface Guidelines and Framer Motion Physics System. Standardized
          popup container transition (<strong>FluidMorphTransition</strong> and{' '}
          <strong>SequencedStepTransition</strong>) and tactile micro-interactions. Underlying layer
          fully unified as decoupled <strong>MorphContainer</strong> engine.
        </p>
      </div>

      {/* 1. Container Transition Standards Comparison (View Box Pinned at Top) */}
      <MorphContainerPlaygroundSection isLight={isLight} />

      {/* Dedicated L4 Animation One-Click Config Exporter Bar (Placed below Top-Pinned View Box) */}
      <TunerConfigExporterBar
        badge="L4-ANIM-EXPORT"
        title="Animation & MorphContainer Parameter Tuner & One-Click Config Exporter"
        subtitle="Exports MorphContainer transition mode, Fluid/SequencedStep durations, Apple HIG curve & Spring physics damping presets"
        copyLabel="Copy L4 Animation Config (Export Snapshot)"
        codeTitle="Current L4 Animation & MorphContainer Parameter Snapshot (Paste directly into DEFAULT_L4_ANIMATION_SNAPSHOT)"
        actionId="export-l4-animation-config"
        isLight={isLight}
        buildExportCode={buildExportCode}
        onResetDefaults={handleResetDefaults}
      />

      {/* 2. Tactile Touch Feedback */}
      <div
        id="l4-anim-2-tactile"
        className={`scroll-mt-24 p-6 rounded-2xl border flex flex-col gap-4 transition-colors ${
          isLight ? 'bg-white border-neutral-200 shadow-2xs' : 'bg-neutral-900/60 border-neutral-800'
        }`}
      >
        <div className="flex items-center gap-2 font-bold text-sm">
          <Sparkles className="h-4 w-4 text-emerald-500" />
          <span>2. Haptic Micro-interaction (Tactile Micro-interactions)</span>
        </div>
        <p className={`text-xs ${isLight ? 'text-neutral-600' : 'text-neutral-400'}`}>
          Click the button below or trigger the key to experience millisecond haptic feedback
          (active:scale-[0.98] With shadowless flat highlight, Physical Spring Damping) :
        </p>

        <div className="flex items-center gap-3.5 flex-wrap">
          <Button
            variant="primary"
            shortcut="ENTER"
            isLight={isLight}
            onClick={() => setPulseCount((c) => c + 1)}
          >
            Tactile Press ({pulseCount})
          </Button>

          <Button
            variant="secondary"
            shortcut="SPACE"
            isLight={isLight}
            onClick={() => setPulseCount(0)}
          >
            Reset
          </Button>
        </div>
      </div>

      {/* 3. Interactive Spring Physics Playground */}
      <div
        id="l4-anim-3-spring"
        className={`scroll-mt-24 p-6 rounded-2xl border flex flex-col gap-4 transition-colors ${
          isLight ? 'bg-white border-neutral-200 shadow-2xs' : 'bg-neutral-900/60 border-neutral-800'
        }`}
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 font-bold text-sm">
            <Activity className="h-4 w-4 text-amber-500" />
            <span>3. Physical spring parameter playground (Spring Physics)</span>
          </div>

          <div className="flex items-center gap-2">
            {(['tactile', 'bouncy', 'smooth'] as const).map((p) => (
              <button
                key={p}
                type="button"
                onClick={() => setMotionPreset(p)}
                className={`px-3 py-1 rounded-lg text-xs font-mono uppercase transition-all cursor-pointer border ${
                  motionPreset === p
                    ? 'bg-amber-500 text-white border-amber-500 font-bold shadow-2xs'
                    : isLight
                      ? 'bg-neutral-100 hover:bg-neutral-200 border-neutral-200 text-neutral-700'
                      : 'bg-neutral-800 hover:bg-neutral-700 border-neutral-700 text-neutral-300'
                }`}
              >
                {p}
              </button>
            ))}
          </div>
        </div>

        <p className={`text-xs ${isLight ? 'text-neutral-600' : 'text-neutral-400'}`}>
          Current Spring Config:
          <span className="font-mono text-amber-500 font-semibold ml-1">
            stiffness: {springs[motionPreset].stiffness}, damping: {springs[motionPreset].damping}
          </span>
        </p>

        {/* Live Morphing Box */}
        <div
          className={`p-8 rounded-xl border flex flex-col items-center justify-center min-h-[200px] transition-colors ${
            isLight ? 'bg-neutral-50/80 border-neutral-200' : 'bg-neutral-950/40 border-neutral-800'
          }`}
        >
          <motion.div
            layout
            transition={springs[motionPreset]}
            onClick={() => setExpanded((prev) => !prev)}
            className={`p-5 rounded-2xl border cursor-pointer select-none flex flex-col justify-between shadow-lg overflow-hidden ${
              expanded
                ? isLight
                  ? 'w-full max-w-[480px] bg-amber-500 text-white border-amber-400'
                  : 'w-full max-w-[480px] bg-amber-600 text-white border-amber-500'
                : isLight
                  ? 'w-64 bg-white text-neutral-900 border-neutral-300 shadow-md'
                  : 'w-64 bg-neutral-900 text-neutral-100 border-neutral-700 shadow-md'
            }`}
          >
            <div className="flex items-center justify-between mb-2">
              <span className="font-bold text-sm tracking-tight">
                {expanded ? 'Expanded Surface' : 'Compact Surface'}
              </span>
              <Badge
                size="sm"
                variant={expanded ? 'default' : 'primary'}
                isLight={!expanded && isLight}
              >
                {motionPreset.toUpperCase()}
              </Badge>
            </div>
            <p className="text-xs opacity-90 leading-relaxed mb-3">
              {expanded
                ? 'Adaptive smooth interpolation (FLIP Layout Morphing) . No forced reflow jitter, Natural flow with physical damping. '
                : 'Click to expand and view fluid deformation'}
            </p>
            <div className="flex items-center justify-between text-[11px] font-mono opacity-80">
              <span>Width: {expanded ? '480px' : '256px'}</span>
              <span>Click to toggle</span>
            </div>
          </motion.div>
        </div>
      </div>

      <PageJumpDirectory
        layerTag="Layer 4 · Animation & Container Transitions"
        title="L4 Animation & MorphContainer Quick Jump Directory"
        subtitle="Click to locate container transition standards, tactile feedback, or spring physics · Export L4 animation parameters"
        items={ANIMATION_JUMP_ITEMS}
        isLight={isLight}
      />

      {/* Dynamic Code Snippet reflecting tuned values */}
      <CodeBlock
        isLight={isLight}
        title="Agent Unified recipe for animation and container transitions (Reflects Current Tuned Parameters)"
        code={`import { MorphContainer } from '@/ui-core/navigation/transitions';
import { MorphingShell } from '@/ui-core/navigation/MorphingShell';
import { UI_EASING } from '@/ui-core/tokens/easing';

// 1. Active Container Transition Mode: "${containerMode}"
<MorphContainer
  currentKey={route}
  width={targetWidth}
  mode="${containerMode}"
  fluidDuration={${fluidDuration}}
  stepFadeDuration={${stepFadeDuration}}    // ${Math.round(stepFadeDuration * 1000)}ms fadeOut & fadeIn
  stepResizeDuration={${stepResizeDuration}}  // ${Math.round(stepResizeDuration * 1000)}ms container resize
>
  <RouteContent />
</MorphContainer>

// 2. Active Spring Preset: "${motionPreset}" (stiffness: ${springs[motionPreset].stiffness}, damping: ${springs[motionPreset].damping})
const activeSpring = UI_EASING.spring.${motionPreset};

// 3. Unified modal shell invocation (MorphingShell Clean Modal Layer)
<MorphingShell
  open={isOpen}
  onOpenChange={setIsOpen}
  currentKey={currentRoute}
  width={routeWidthMap[currentRoute]}
  transitionMode="${containerMode}"
>
  {currentRoute === 'main' ? <Layer1MainMenuRecipe /> : <Layer2GarageRecipe />}
</MorphingShell>`}
      />
    </div>
  );
};
