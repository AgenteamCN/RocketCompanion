import React from 'react';
import { Crosshair } from 'lucide-react';
import {
  CenterUpperInfoHUD,
  CenterUpperInfoPayload,
  CenterUpperGlowConfig,
  CenterUpperBlueTeamConfig,
  CenterUpperTypographyConfig,
  CenterUpperTimingConfig,
  CenterUpperInfoVariant,
} from '../../../ui-core/hud/CenterUpperInfoHUD';
import { StepperScoreboardHUD } from '../../../ui-core/hud/StepperScoreboardHUD';
import { EdgePlayerHudStrip } from '../../../ui-core/hud/EdgePlayerHudStrip';
import { VelocityProgressBar } from '../../../ui-core/hud/VelocityProgressBar';
import { CircularBoostGauge } from '../../../ui-core/hud/CircularBoostGauge';
import { BallCameraIndicator } from '../../../ui-core/hud/BallCameraIndicator';
import { ArenaBackdrop, ArenaLightingPreset } from '../../ArenaBackdrop';
import { DEFAULT_INITIAL_ROSTER } from '../../../ui-core/stores/hudTransientTypes';
import { HudAnchorStage, HudZone, HudSlot } from '../../../ui-core/layout/HudAnchorStage';
import type { StageBgMode } from './CenterUpperStageBackdropBar';
export interface CenterUpperStageBackdropState {
  stageBgMode: StageBgMode;
  arenaPreset: ArenaLightingPreset;
  stageBrightness: number;
  showPitchLines: boolean;
  showAnchorGuides: boolean;
  getStageBackgroundStyle: () => React.CSSProperties;
}

export interface CenterUpperStageCanvasProps {
  backdrop: CenterUpperStageBackdropState;
  upperCenterTopPct: number;
  showSurroundingHud: boolean;
  activePayload: CenterUpperInfoPayload | null;
  glowConfig: CenterUpperGlowConfig;
  winnerBlueConfig: CenterUpperBlueTeamConfig;
  typoConfig: CenterUpperTypographyConfig;
  timingConfig: CenterUpperTimingConfig;
  activeVariant: CenterUpperInfoVariant;
  isSequencePlaying: boolean;
  setIsVisibleOnStage: (val: boolean) => void;
}

export const CenterUpperStageCanvas: React.FC<CenterUpperStageCanvasProps> = ({
  backdrop: {
    stageBgMode,
    arenaPreset,
    stageBrightness,
    showPitchLines,
    showAnchorGuides,
    getStageBackgroundStyle,
  },
  upperCenterTopPct,
  showSurroundingHud,
  activePayload,
  glowConfig,
  winnerBlueConfig,
  typoConfig,
  timingConfig,
  activeVariant,
  isSequencePlaying,
  setIsVisibleOnStage,
}) => {
  return (
    <div
      className="relative w-full h-[500px] rounded-3xl border border-neutral-300 dark:border-neutral-800 overflow-hidden shadow-2xl transition-colors duration-200"
      style={getStageBackgroundStyle()}>
      {stageBgMode === 'arena' && (
        <ArenaBackdrop
          preset={arenaPreset}
          brightness={stageBrightness}
          showPitchMarkings={showPitchLines}
        />
      )}

      {stageBgMode !== 'arena' && showPitchLines && (
        <div className="absolute inset-0 pointer-events-none opacity-20">
          <div className="absolute top-1/2 left-0 right-0 h-px bg-white/70 -translate-y-1/2" />
          <div className="absolute top-1/2 left-1/2 w-44 h-44 rounded-full border border-white/70 -translate-x-1/2 -translate-y-1/2" />
          <div className="absolute top-1/2 left-1/2 w-3 h-3 rounded-full bg-white/80 -translate-x-1/2 -translate-y-1/2" />
        </div>
      )}

      {showAnchorGuides && (
        <div className="absolute inset-0 pointer-events-none z-10">
          <div className="absolute inset-y-0 left-1/2 w-px border-l border-dashed border-amber-400/25 -translate-x-1/2" />
          <div
            className="absolute inset-x-0 h-px border-t border-dashed border-amber-400/45 transition-all duration-150"
            style={{ top: `${upperCenterTopPct}%` }}>
            <span className="absolute right-3 -top-5 px-1.5 py-0.5 rounded bg-black/65 border border-amber-500/40 text-[10px] font-mono text-amber-300">
              HudZone anchor=&quot;upper-center&quot; (Y = {upperCenterTopPct}%)
            </span>
          </div>
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 flex items-center gap-1.5 opacity-40">
            <Crosshair className="h-4 w-4 text-white" />
            <span className="text-[9px] font-mono text-white bg-black/50 px-1.5 py-0.5 rounded">
              50% Center (Car Reticle Zone)
            </span>
          </div>
        </div>
      )}

      <HudAnchorStage strategy="reserve" style={{ fontFamily: 'var(--font-jetbrains)' }}>
        {showSurroundingHud && (
          <>
            <HudZone anchor="top-center" flush zIndexClassName="z-30">
              <StepperScoreboardHUD
                isLight={false}
                leftScore={2}
                rightScore={1}
                seconds={134}
                bestOf={5}
                leftSeriesWins={2}
                rightSeriesWins={1}
              />
            </HudZone>

            <HudZone anchor="top-left" flush className="pt-[56px]">
              <EdgePlayerHudStrip
                side="left"
                teamColor="#2563EB"
                barColor="#3B82F6"
                isLight={false}
                viewMode="player-live"
                players={DEFAULT_INITIAL_ROSTER.leftPlayers}
              />
            </HudZone>

            <HudZone anchor="bottom-left">
              <BallCameraIndicator
                active={true}
                shortcut="SPACE"
                label="BALL CAM"
                actionText="TO TOGGLE"
                isLight={false}
              />
            </HudZone>

            <HudZone anchor="bottom-center">
              <div className="w-[320px] max-w-[40vw]">
                <VelocityProgressBar speed={1640} width="100%" height={14} />
              </div>
            </HudZone>

            <HudZone anchor="bottom-right">
              <CircularBoostGauge amount={85} size={118} isLight={false} />
            </HudZone>
          </>
        )}

        <HudZone anchor="upper-center" zIndexClassName="z-40" style={{ top: `${upperCenterTopPct}%` }}>
          <HudSlot visible={true} mode="reserve">
            <CenterUpperInfoHUD
              info={activePayload}
              glowConfig={glowConfig}
              winnerBlueConfig={winnerBlueConfig}
              typographyConfig={typoConfig}
              timingConfig={timingConfig}
              onExpire={() => {
                if (!isSequencePlaying && !timingConfig.persistentInspect) {
                  setIsVisibleOnStage(false);
                }
              }}
            />
          </HudSlot>
        </HudZone>
      </HudAnchorStage>

      <div className="absolute top-3 right-3 z-40 flex items-center gap-2 px-3 py-1 rounded-xl bg-black/70 border border-white/15 backdrop-blur-md text-[11px] font-mono text-neutral-200 pointer-events-none">
        <span className="h-2 w-2 rounded-full bg-amber-400 animate-pulse" />
        <span>
          Mode: <strong className="text-amber-400 uppercase">{activeVariant}</strong>
        </span>
        <span className="opacity-30">|</span>
        <span>
          Scale: <strong className="text-emerald-400">{timingConfig.entryScale.toFixed(2)}x</strong>
        </span>
        <span className="opacity-30">|</span>
        <span>
          Hold: <strong className="text-sky-400">{timingConfig.durationMs}ms</strong>
        </span>
        <span className="opacity-30">|</span>
        <span>
          FadeOut: <strong className="text-rose-400">{timingConfig.exitDurationMs}ms</strong>
        </span>
      </div>
    </div>
  );
};
