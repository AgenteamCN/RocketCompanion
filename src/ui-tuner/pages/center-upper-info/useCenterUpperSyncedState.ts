import { useCallback } from 'react';
import { CenterUpperGlowConfig, CenterUpperBlueTeamConfig, CenterUpperTypographyConfig, CenterUpperTimingConfig, CenterUpperInfoVariant, WinnerTeamPreset } from '../../../ui-core/hud/CenterUpperInfoHUD';
import { DEFAULT_RL_COUNTDOWN_GLOW, DEFAULT_WINNER_BLUE_TEAM_CONFIG, DEFAULT_CENTER_UPPER_TYPOGRAPHY, DEFAULT_CENTER_UPPER_TIMING } from '../../../ui-core/hud/centerUpperInfoDefaults';
import { hexToRgbTuple } from '../../components/tuner/ColorSwatchInput';
import { ArenaLightingPreset } from '../../ArenaBackdrop';
import { useSyncedState, crossClientSync } from '../../stores/crossClientSync';

export type StageBgMode = 'solid' | 'gradient' | 'arena' | 'flow';

export function useCenterUpperSyncedState() {
  const [stageBgMode, setStageBgMode] = useSyncedState<StageBgMode>('5e:stageBgMode', 'solid');
  const [stageBgColor, setStageBgColor] = useSyncedState<string>('5e:stageBgColor', '#090D16');
  const [stageBgSecondaryColor, setStageBgSecondaryColor] = useSyncedState<string>(
    '5e:stageBgSecondaryColor',
    '#1E293B'
  );
  const [arenaPreset, setArenaPreset] = useSyncedState<ArenaLightingPreset>(
    '5e:arenaPreset',
    'night'
  );
  const [stageBrightness, setStageBrightness] = useSyncedState<number>('5e:stageBrightness', 85);
  const [showPitchLines, setShowPitchLines] = useSyncedState<boolean>('5e:showPitchLines', true);
  const [showAnchorGuides, setShowAnchorGuides] = useSyncedState<boolean>(
    '5e:showAnchorGuides',
    true
  );
  const [showSurroundingHud, setShowSurroundingHud] = useSyncedState<boolean>(
    '5e:showSurroundingHud',
    true
  );
  const [upperCenterTopPct, setUpperCenterTopPct] = useSyncedState<number>(
    '5e:upperCenterTopPct',
    40
  );
  const [activeVariant, setActiveVariant] = useSyncedState<CenterUpperInfoVariant>(
    '5e:activeVariant',
    'countdown'
  );
  const [countdownStep, setCountdownStep] = useSyncedState<'3' | '2' | '1' | 'GO'>(
    '5e:countdownStep',
    '3'
  );
  const [goLabelText, setGoLabelText] = useSyncedState<string>('5e:goLabelText', 'GO');
  const [countdownIntervalMs, setCountdownIntervalMs] = useSyncedState<number>(
    '5e:countdownIntervalMs',
    1000
  );
  const [isSequencePlaying, setIsSequencePlaying] = useSyncedState<boolean>(
    '5e:isSequencePlaying',
    false
  );
  const [loopSequence, setLoopSequence] = useSyncedState<boolean>('5e:loopSequence', false);
  const [winnerTeam, setWinnerTeam] = useSyncedState<WinnerTeamPreset>('5e-v2:winnerTeam', 'blue');
  const [winnerTopText, setWinnerTopText] = useSyncedState<string>('5e-v2:winnerTopText', 'WINNER');
  const [winnerMainText, setWinnerMainText] = useSyncedState<string>(
    '5e-v2:winnerMainText',
    'BLUE TEAM'
  );
  const [winnerSubText, setWinnerSubText] = useSyncedState<string>('5e-v2:winnerSubText', '');
  const [winnerBlueConfig, setWinnerBlueConfig] = useSyncedState<CenterUpperBlueTeamConfig>(
    '5e-v2:winnerBlueConfig',
    { ...DEFAULT_WINNER_BLUE_TEAM_CONFIG }
  );
  const [customPresetId, setCustomPresetId] = useSyncedState<string>(
    '5e-v2:customPresetId',
    'match-paused'
  );
  const [showCustomTopLine, setShowCustomTopLine] = useSyncedState<boolean>(
    '5e-v2:showCustomTopLine',
    true
  );
  const [customTopText, setCustomTopText] = useSyncedState<string>(
    '5e-v2:customTopText',
    'ADMIN CONTROL'
  );
  const [customMainText, setCustomMainText] = useSyncedState<string>(
    '5e-v2:customMainText',
    'MATCH PAUSED'
  );
  const [customSubText, setCustomSubText] = useSyncedState<string>('5e-v2:customSubText', '');
  const [glowConfig, setGlowConfig] = useSyncedState<CenterUpperGlowConfig>('5e:glowConfig', {
    ...DEFAULT_RL_COUNTDOWN_GLOW,
  });
  const [syncGlowWithText, setSyncGlowWithText] = useSyncedState<boolean>(
    '5e:syncGlowWithText',
    false
  );
  const [typoConfig, setTypoConfig] = useSyncedState<CenterUpperTypographyConfig>(
    '5e:typoConfig',
    {
      ...DEFAULT_CENTER_UPPER_TYPOGRAPHY,
    }
  );
  const [timingConfig, setTimingConfig] = useSyncedState<CenterUpperTimingConfig>(
    '5e:timingConfig',
    {
      ...DEFAULT_CENTER_UPPER_TIMING,
    }
  );
  const [triggerNonce, setTriggerNonce] = useSyncedState<number>('5e:triggerNonce', 1);
  const [isVisibleOnStage, setIsVisibleOnStage] = useSyncedState<boolean>(
    '5e:isVisibleOnStage',
    true
  );

  const build5EExportCode = useCallback(() => {
    const blueRgb = hexToRgbTuple(winnerBlueConfig.textColor);
    const blueGlowHex = winnerBlueConfig.syncGlowWithText
      ? winnerBlueConfig.textColor
      : winnerBlueConfig.glowColor;
    const blueGlowRgb = hexToRgbTuple(blueGlowHex);
    const snapshot = {
      upperCenterTopPct,
      goLabelText,
      countdownIntervalMs,
      glowConfig,
      winnerBlueConfig: {
        ...winnerBlueConfig,
        rgb: blueRgb,
        glowRgb: blueGlowRgb,
      },
      customAnnouncementDefault: {
        presetId: customPresetId,
        topText: customTopText.toUpperCase(),
        mainText: customMainText.toUpperCase(),
        forceUppercase: true,
      },
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
    return `// 5E Center-Upper Default Parameters Snapshot
export const DEFAULT_5E_CENTER_UPPER_CONFIG = ${JSON.stringify(snapshot, null, 2)};`;
  }, [
    upperCenterTopPct,
    goLabelText,
    countdownIntervalMs,
    glowConfig,
    winnerBlueConfig,
    customPresetId,
    customTopText,
    customMainText,
    timingConfig,
    typoConfig,
    stageBgMode,
    stageBgColor,
    stageBgSecondaryColor,
    arenaPreset,
    stageBrightness,
  ]);

  const handleReset5EDefaults = useCallback(() => {
    crossClientSync.resetAll({ scopePrefix: '5e:' });
    crossClientSync.resetAll({ scopePrefix: '5e-v2:' });
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
    showSurroundingHud,
    setShowSurroundingHud,
    upperCenterTopPct,
    setUpperCenterTopPct,
    activeVariant,
    setActiveVariant,
    countdownStep,
    setCountdownStep,
    goLabelText,
    setGoLabelText,
    countdownIntervalMs,
    setCountdownIntervalMs,
    isSequencePlaying,
    setIsSequencePlaying,
    loopSequence,
    setLoopSequence,
    winnerTeam,
    setWinnerTeam,
    winnerTopText,
    setWinnerTopText,
    winnerMainText,
    setWinnerMainText,
    winnerSubText,
    setWinnerSubText,
    winnerBlueConfig,
    setWinnerBlueConfig,
    customPresetId,
    setCustomPresetId,
    showCustomTopLine,
    setShowCustomTopLine,
    customTopText,
    setCustomTopText,
    customMainText,
    setCustomMainText,
    customSubText,
    setCustomSubText,
    glowConfig,
    setGlowConfig,
    syncGlowWithText,
    setSyncGlowWithText,
    typoConfig,
    setTypoConfig,
    timingConfig,
    setTimingConfig,
    triggerNonce,
    setTriggerNonce,
    isVisibleOnStage,
    setIsVisibleOnStage,
    build5EExportCode,
    handleReset5EDefaults,
  };
}
