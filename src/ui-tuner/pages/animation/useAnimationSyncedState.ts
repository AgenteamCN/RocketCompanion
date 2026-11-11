import { useCallback } from 'react';
import type { TransitionPhase } from '../../../ui-core/navigation/transitions';
import { UI_EASING, type ContainerTransitionMode } from '../../../ui-core/tokens/easing';
import { crossClientSync, useSyncedState } from '../../stores/crossClientSync';

export type AnimationSpringPreset = 'tactile' | 'bouncy' | 'smooth';

export function useAnimationSyncedState() {
  const [motionPreset, setMotionPreset] = useSyncedState<AnimationSpringPreset>(
    'page:animation:motionPreset',
    'tactile'
  );
  const [expanded, setExpanded] = useSyncedState<boolean>(
    'page:animation:expanded',
    false
  );
  const [pulseCount, setPulseCount] = useSyncedState<number>(
    'page:animation:pulseCount',
    0
  );

  const [containerMode, setContainerMode] = useSyncedState<ContainerTransitionMode>(
    'page:animation:containerMode',
    'fluid-morph'
  );
  const [containerView, setContainerView] = useSyncedState<'compact' | 'expanded'>(
    'page:animation:containerView',
    'compact'
  );
  const [activePhase, setActivePhase] = useSyncedState<TransitionPhase>(
    'page:animation:activePhase',
    'idle'
  );
  const [fluidDuration, setFluidDuration] = useSyncedState<number>(
    'page:animation:fluidDuration',
    0.28
  );
  const [stepFadeDuration, setStepFadeDuration] = useSyncedState<number>(
    'page:animation:stepFadeDuration',
    0.1
  );
  const [stepResizeDuration, setStepResizeDuration] = useSyncedState<number>(
    'page:animation:stepResizeDuration',
    0.15
  );

  const springs = {
    tactile: UI_EASING.spring.tactile,
    bouncy: UI_EASING.spring.bouncy,
    smooth: UI_EASING.spring.smooth,
  } as const;

  const handleResetDefaults = useCallback(() => {
    crossClientSync.resetAll({ scopePrefix: 'page:animation:' });
  }, []);

  const buildExportCode = useCallback(() => {
    const snapshot = {
      morphContainer: {
        mode: containerMode,
        fluidDurationSec: fluidDuration,
        stepFadeDurationSec: stepFadeDuration,
        stepResizeDurationSec: stepResizeDuration,
        compactWidthPx: 320,
        expandedWidthPx: 520,
        appleHigCurve: UI_EASING.apple,
      },
      springPhysics: {
        activePreset: motionPreset,
        config: springs[motionPreset],
        expandedSurface: expanded,
      },
    };
    return `// L4 Animation & MorphContainer Calibrated Default Snapshot\nexport const DEFAULT_L4_ANIMATION_SNAPSHOT = ${JSON.stringify(snapshot, null, 2)};`;
  }, [
    containerMode,
    fluidDuration,
    stepFadeDuration,
    stepResizeDuration,
    motionPreset,
    springs,
    expanded,
  ]);

  return {
    motionPreset,
    setMotionPreset,
    expanded,
    setExpanded,
    pulseCount,
    setPulseCount,
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
    springs,
    handleResetDefaults,
    buildExportCode,
  };
}
