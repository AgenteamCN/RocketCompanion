import { useCallback } from 'react';
import type { ArenaLightingPreset } from '../../ArenaBackdrop';
import { crossClientSync, useSyncedState } from '../../stores/crossClientSync';
import { DEFAULT_BALL_VISUAL_CONFIG, updateBallVisualConfig } from '../../../ui-core/config/ballVisualConfig';
import {
  resetNameTagConfig,
  setNameTagRuntimeState,
  useNameTagTunerStore,
} from '../../../ui-core/stores/nameTagTunerStore';

export type NameTagSlotLayoutMode = 'grid' | 'floating-width';

export function useNameTagSyncedState() {
  const { config } = useNameTagTunerStore();

  const [arenaPreset, setArenaPreset] = useSyncedState<ArenaLightingPreset>(
    '5h:arenaPreset',
    'night'
  );
  const [stageHeight, setStageHeight] = useSyncedState<number>('5h:stageHeight', 360);
  const [cameraFovDeg, setCameraFovDeg] = useSyncedState<number>('5h:cameraFovDeg', 110);
  const [ballHeightOffset, setBallHeightOffset] = useSyncedState<number>(
    '5h:ballHeightOffset',
    14
  );
  const [animateBoostWave, setAnimateBoostWave] = useSyncedState<boolean>(
    '5h:animateBoostWave',
    false
  );
  const [customNameOverride, setCustomNameOverride] = useSyncedState<string>(
    '5h:customNameOverride',
    ''
  );
  const [slotLayoutMode, setSlotLayoutMode] = useSyncedState<NameTagSlotLayoutMode>(
    '5h:slotLayoutMode',
    'grid'
  );

  const resetStageControls = useCallback(() => {
    crossClientSync.resetAll({ scopePrefix: '5h:' });
    setNameTagRuntimeState({
      isTunerArenaActive: true,
      kickoffPermutationIndex: 0,
      activeCameraMode: 'pov',
      focusedCarIndex: 0,
    });
  }, []);

  const handleReset5HDefaults = useCallback(() => {
    resetNameTagConfig();
    updateBallVisualConfig({ ...DEFAULT_BALL_VISUAL_CONFIG });
    resetStageControls();
  }, [resetStageControls]);

  const build5HExportCode = useCallback(() => {
    const snapshot = {
      nameTagConfig: config,
      stageControls: {
        arenaPreset,
        stageHeight,
        cameraFovDeg,
        ballHeightOffset,
        animateBoostWave,
        slotLayoutMode,
      },
    };
    return `// 5H Name Tag & Boost Progress Calibrated Default Snapshot\nexport const DEFAULT_5H_NAME_TAG_SNAPSHOT = ${JSON.stringify(snapshot, null, 2)};`;
  }, [
    config,
    arenaPreset,
    stageHeight,
    cameraFovDeg,
    ballHeightOffset,
    animateBoostWave,
    slotLayoutMode,
  ]);

  return {
    arenaPreset,
    setArenaPreset,
    stageHeight,
    setStageHeight,
    cameraFovDeg,
    setCameraFovDeg,
    ballHeightOffset,
    setBallHeightOffset,
    animateBoostWave,
    setAnimateBoostWave,
    customNameOverride,
    setCustomNameOverride,
    slotLayoutMode,
    setSlotLayoutMode,
    resetStageControls,
    handleReset5HDefaults,
    build5HExportCode,
  };
}

