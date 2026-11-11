import React, { createContext, useContext } from 'react';
import { createHudTransientChannel } from '../../../ui-core/stores/hudTransientChannel';
import type {
  EdgeDemoIndicatorConfig,
  EdgeSkipIndicatorConfig,
  HudRosterViewMode,
  MatchHudChoreographySignal,
} from '../../../ui-core/stores/hudTransientTypes';
import type { HudLayoutStrategy, HudSlotMode } from '../../../ui-core/layout/HudAnchorStage';

export type FlipSimMode = 'auto-drain' | 'grounded' | 'multi-flip' | 'unlimited' | 'expired';
export type JumpPlacementOption = 'top-left' | 'center-bottom-right' | 'center-bottom-left';
export type ScorePresetKey = '1digit' | '2digit' | '3digit';

export interface HudChoreographySandboxContextValue {
  isLight: boolean;
  hudThemeLight: boolean;
  setHudThemeLight: React.Dispatch<React.SetStateAction<boolean>>;
  scorePreset: ScorePresetKey;
  handleScorePresetChange: (preset: ScorePresetKey) => void;
  overtimeChinOpen: boolean;
  handleTriggerOvertimeKickoff: () => void;
  handleToggleOvertimeChin: () => void;
  handleResetRegulation: () => void;
  bestOf: 0 | 3 | 5 | 7;
  handleBestOfChange: (bo: 0 | 3 | 5 | 7) => void;
  leftWins: number;
  rightWins: number;
  winsNeededForBo: number;
  handleAddSeriesWin: (side: 'left' | 'right') => void;
  viewMode: HudRosterViewMode;
  handleModeChange: (mode: HudRosterViewMode) => void;
  activeSignal: MatchHudChoreographySignal;
  handleDispatchSignal: (signal: MatchHudChoreographySignal) => void;
  myTeamSide: 'blue' | 'orange';
  handleToggleTeamSide: () => void;
  slotExists: Record<1 | 2 | 3 | 4 | 5 | 6, boolean>;
  handleToggleSlotExists: (slotKey: 1 | 2 | 3 | 4 | 5 | 6) => void;
  replaySkipReady: Record<1 | 2 | 3 | 4 | 5 | 6, boolean>;
  handleToggleReplaySkipReady: (slotKey: 1 | 2 | 3 | 4 | 5 | 6) => void;
  skipIndicatorConfig: EdgeSkipIndicatorConfig;
  onUpdateSkipIndicatorConfig: (patch: Partial<EdgeSkipIndicatorConfig>) => void;
  handleApplyTeamSizePreset: (leftCount: 1 | 2 | 3, rightCount: 1 | 2 | 3) => void;
  opponentDemoCompact: boolean;
  handleToggleOpponentDemoCompact: () => void;
  persistentDemo: boolean;
  onTogglePersistentDemo: () => void;
  demoIndicatorConfig: EdgeDemoIndicatorConfig;
  onUpdateDemoIndicatorConfig: (patch: Partial<EdgeDemoIndicatorConfig>) => void;
  focusedSlot: 1 | 2 | 3 | 4 | 5 | 6 | null;
  handleSelectPov: (slot: 1 | 2 | 3 | 4 | 5 | 6 | null) => void;
  handleTriggerDemo: (slotKey: 1 | 2 | 3 | 4 | 5 | 6) => void;
  layoutStrategy: HudLayoutStrategy;
  setLayoutStrategy: React.Dispatch<React.SetStateAction<HudLayoutStrategy>>;
  showTelemetryTopLeft: boolean;
  setShowTelemetryTopLeft: React.Dispatch<React.SetStateAction<boolean>>;
  flipSimMode: FlipSimMode;
  onFlipSimModeChange: (mode: FlipSimMode) => void;
  handleCycleFlipSimMode: () => void;
  jumpPlacement: JumpPlacementOption;
  setJumpPlacement: React.Dispatch<React.SetStateAction<JumpPlacementOption>>;
  showBallCam: boolean;
  setShowBallCam: React.Dispatch<React.SetStateAction<boolean>>;
  leftTopBandVisible: boolean;
  rightTopBandVisible: boolean;
  topBandSlotMode: HudSlotMode;
  leftTeamColor: string;
  leftBarColor: string;
  rightTeamColor: string;
  rightBarColor: string;
  selfDemoActive: boolean;
  selfDemoPillTextRef: React.RefObject<HTMLSpanElement | null>;
  isCockpitVisible: boolean;
  instantCockpitTransition: boolean;
  channel: ReturnType<typeof createHudTransientChannel>;
}

const HudChoreographySandboxContext = createContext<HudChoreographySandboxContextValue | null>(
  null
);

export const HudChoreographySandboxProvider = HudChoreographySandboxContext.Provider;

export function useHudChoreographySandbox(): HudChoreographySandboxContextValue {
  const ctx = useContext(HudChoreographySandboxContext);
  if (!ctx) {
    throw new Error(
      'useHudChoreographySandbox must be used within a HudChoreographySandboxProvider'
    );
  }
  return ctx;
}
