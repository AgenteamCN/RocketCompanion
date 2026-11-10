import { useCallback, useMemo } from 'react';
import {
  CenterUpperTypographyConfig,
  CenterUpperTimingConfig,
} from '../../../ui-core/hud/CenterUpperInfoHUD';
import { TakeoverGlowConfig, TakeoverSignal } from '../../../ui-core/hud/TakeoverCountdownHUD';
import { DEFAULT_TAKEOVER_GLOW, DEFAULT_TAKEOVER_TYPOGRAPHY, DEFAULT_TAKEOVER_TIMING, DEFAULT_TAKEOVER_LAYOUT } from '../../../ui-core/hud/takeoverCountdownDefaults';
import { type TakeoverVignetteConfig } from '../../../ui-core/hud/TakeoverVignetteOverlay';
import { DEFAULT_TAKEOVER_VIGNETTE } from '../../../ui-core/hud/takeoverVignetteMath';
import { ArenaLightingPreset } from '../../ArenaBackdrop';
import { useSyncedState, crossClientSync } from '../../stores/crossClientSync';
import type { StageBgMode } from '../center-upper-info/CenterUpperStageBackdropBar';

export function useTakeoverSyncedState() {
  const [stageBgMode, setStageBgMode] = useSyncedState<StageBgMode>('5g-v5:stageBgMode', 'flow');
  const [stageBgColor, setStageBgColor] = useSyncedState<string>('5g-v2:stageBgColor', '#090D16');
  const [stageBgSecondaryColor, setStageBgSecondaryColor] = useSyncedState<string>(
    '5g-v2:stageBgSecondaryColor',
    '#1E293B'
  );
  const [arenaPreset, setArenaPreset] = useSyncedState<ArenaLightingPreset>(
    '5g-v5:arenaPreset',
    'flow'
  );
  const [stageBrightness, setStageBrightness] = useSyncedState<number>('5g-v2:stageBrightness', 100);
  const [showPitchLines, setShowPitchLines] = useSyncedState<boolean>('5g-v2:showPitchLines', true);
  const [showAnchorGuides, setShowAnchorGuides] = useSyncedState<boolean>(
    '5g-v2:showAnchorGuides',
    true
  );

  const [bottomOffsetPx, setBottomOffsetPx] = useSyncedState<number>(
    '5g-v5:bottomOffsetPx',
    DEFAULT_TAKEOVER_LAYOUT.bottomOffsetPx
  );

  const [myTeamSide, setMyTeamSide] = useSyncedState<'blue' | 'orange'>('5g-v2:myTeamSide', 'blue');

  const [activeSignal, setActiveSignal] = useSyncedState<TakeoverSignal>(
    '5g-v2:activeSignal',
    'replacing-in'
  );
  const [countdownStep, setCountdownStep] = useSyncedState<'3' | '2' | '1'>(
    '5g-v2:countdownStep',
    '3'
  );
  const [topLabelText, setTopLabelText] = useSyncedState<string>(
    '5g-v2:topLabelText',
    'Takeover in...'
  );
  const [subCaptionText, setSubCaptionText] = useSyncedState<string>('5g-v2:subCaptionText', '');
  const [countdownIntervalMs, setCountdownIntervalMs] = useSyncedState<number>(
    '5g-v2:countdownIntervalMs',
    1000
  );
  const [isSequencePlaying, setIsSequencePlaying] = useSyncedState<boolean>(
    '5g-v2:isSequencePlaying',
    false
  );
  const [loopSequence, setLoopSequence] = useSyncedState<boolean>('5g-v2:loopSequence', false);

  const [glowConfig, setGlowConfig] = useSyncedState<TakeoverGlowConfig>('5g-v5:glowConfig', {
    ...DEFAULT_TAKEOVER_GLOW,
  });
  const [syncGlowWithText, setSyncGlowWithText] = useSyncedState<boolean>(
    '5g-v2:syncGlowWithText',
    true
  );
  const [typoConfig, setTypoConfig] = useSyncedState<CenterUpperTypographyConfig>(
    '5g-v5:typoConfig',
    {
      ...DEFAULT_TAKEOVER_TYPOGRAPHY,
    }
  );
  const [timingConfig, setTimingConfig] = useSyncedState<CenterUpperTimingConfig>(
    '5g-v5:timingConfig',
    {
      ...DEFAULT_TAKEOVER_TIMING,
      persistentInspect: true,
    }
  );
  const [rawVignetteConfig, setVignetteConfig] = useSyncedState<TakeoverVignetteConfig>(
    '5g-v5:vignetteConfig',
    {
      ...DEFAULT_TAKEOVER_VIGNETTE,
    }
  );
  const vignetteConfig = useMemo<TakeoverVignetteConfig>(
    () => ({
      ...DEFAULT_TAKEOVER_VIGNETTE,
      ...rawVignetteConfig,
      curve: {
        ...DEFAULT_TAKEOVER_VIGNETTE.curve,
        ...(rawVignetteConfig?.curve ?? {}),
      },
    }),
    [rawVignetteConfig]
  );

  const [alwaysPreviewVignette, setAlwaysPreviewVignette] = useSyncedState<boolean>(
    '5g-v2:alwaysPreviewVignette',
    false
  );

  const [triggerNonce, setTriggerNonce] = useSyncedState<number>('5g-v2:triggerNonce', 1);
  const [isVisibleOnStage, setIsVisibleOnStage] = useSyncedState<boolean>(
    '5g-v2:isVisibleOnStage',
    true
  );

  const handleSetVisibleOnStage = useCallback(
    (val: boolean | ((prev: boolean) => boolean)) => {
      setIsVisibleOnStage((prev) => {
        const next = typeof val === 'function' ? val(prev) : val;
        if (next) {
          setActiveSignal('replacing-in');
        }
        return next;
      });
    },
    [setIsVisibleOnStage, setActiveSignal]
  );

  const buildExportCode = useCallback(() => {
    const snapshot = {
      bottomOffsetPx,
      topLabelText,
      subCaptionText,
      countdownIntervalMs,
      vignetteConfig,
      glowConfig,
      timingConfig,
      typoConfig,
      stageBackdrop: {
        stageBgMode,
        stageBgColor,
        stageBgSecondaryColor,
        arenaPreset,
        stageBrightness,
      },
    };
    return `// 5G Takeover Default Parameters Snapshot
export const DEFAULT_5G_TAKEOVER_CONFIG = ${JSON.stringify(snapshot, null, 2)};`;
  }, [
    bottomOffsetPx,
    topLabelText,
    subCaptionText,
    countdownIntervalMs,
    vignetteConfig,
    glowConfig,
    timingConfig,
    typoConfig,
    stageBgMode,
    stageBgColor,
    stageBgSecondaryColor,
    arenaPreset,
    stageBrightness,
  ]);

  const handleResetDefaults = useCallback(() => {
    crossClientSync.resetAll({ scopePrefix: '5g-v2:' });
    crossClientSync.resetAll({ scopePrefix: '5g-v3:' });
    crossClientSync.resetAll({ scopePrefix: '5g-v4:' });
    crossClientSync.resetAll({ scopePrefix: '5g-v5:' });
  }, []);

  return {
    stageBgMode,
    setStageBgMode,
    stageBgColor,
    setStageBgColor,
    stageBgSecondaryColor,
    setStageBgSecondaryColor,
    arenaPreset,
    setArenaPreset,
    stageBrightness,
    setStageBrightness,
    showPitchLines,
    setShowPitchLines,
    showAnchorGuides,
    setShowAnchorGuides,
    bottomOffsetPx,
    setBottomOffsetPx,
    myTeamSide,
    setMyTeamSide,
    activeSignal,
    setActiveSignal,
    countdownStep,
    setCountdownStep,
    topLabelText,
    setTopLabelText,
    subCaptionText,
    setSubCaptionText,
    countdownIntervalMs,
    setCountdownIntervalMs,
    isSequencePlaying,
    setIsSequencePlaying,
    loopSequence,
    setLoopSequence,
    glowConfig,
    setGlowConfig,
    syncGlowWithText,
    setSyncGlowWithText,
    typoConfig,
    setTypoConfig,
    timingConfig,
    setTimingConfig,
    vignetteConfig,
    setVignetteConfig,
    alwaysPreviewVignette,
    setAlwaysPreviewVignette,
    triggerNonce,
    setTriggerNonce,
    isVisibleOnStage,
    setIsVisibleOnStage,
    handleSetVisibleOnStage,
    buildExportCode,
    handleResetDefaults,
  };
}
