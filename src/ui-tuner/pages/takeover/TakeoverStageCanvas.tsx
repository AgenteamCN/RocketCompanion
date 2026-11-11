import React from 'react';
import { Crosshair } from 'lucide-react';
import {
  CenterUpperTypographyConfig,
  CenterUpperTimingConfig,
} from '../../../ui-core/hud/CenterUpperInfoHUD';
import {
  TakeoverCountdownHUD,
  TakeoverHudPayload,
  TakeoverGlowConfig,
  TakeoverSignal,
} from '../../../ui-core/hud/TakeoverCountdownHUD';
import {
  TakeoverVignetteOverlay,
  type TakeoverVignetteConfig,
} from '../../../ui-core/hud/TakeoverVignetteOverlay';
import { StepperScoreboardHUD } from '../../../ui-core/hud/StepperScoreboardHUD';
import { EdgePlayerHudStrip } from '../../../ui-core/hud/EdgePlayerHudStrip';
import { VelocityProgressBar } from '../../../ui-core/hud/VelocityProgressBar';
import { CircularBoostGauge } from '../../../ui-core/hud/CircularBoostGauge';
import { BallCameraIndicator } from '../../../ui-core/hud/BallCameraIndicator';
import { FlipIndicatorPillHUD } from '../../../ui-core/hud/FlipIndicatorPillHUD';
import { ArenaBackdrop, ArenaLightingPreset } from '../../ArenaBackdrop';
import { createHudTransientChannel } from '../../../ui-core/stores/hudTransientChannel';
import {
  HudAnchorStage,
  HudZone,
  HudSlot,
  HudRelativeAnchor,
} from '../../../ui-core/layout/HudAnchorStage';
import { JumpDirectoryItem } from '../../PageJumpDirectory';
import type { StageBgMode } from '../center-upper-info/CenterUpperStageBackdropBar';
export const TAKEOVER_DIRECTORY_ITEMS: JumpDirectoryItem[] = [
  {
    id: 'takeover-stage',
    code: '5G-1',
    componentName: 'TakeoverStageCanvas',
    name: 'HudAnchorStage (bottom-center + upward offset)',
    label: 'Takeover live stage - Scoreboard + Team Roster - Seamless rounded-rect vignette - Team-colored Top Regular + Glowing stroke',
  },
  {
    id: 'takeover-tuner',
    code: '5G-2',
    componentName: 'TakeoverTunerSection',
    name: 'Vignette, Team Top Label & Motion Tuner',
    label: 'Seamless rounded-rect vignette (Independent X/Y depth, blur feather, corner radius, Bezier curve) + Team-colored top label & stroke + One-click copy config',
  },
  {
    id: 'takeover-archetypes',
    code: '5G-3',
    componentName: 'TakeoverArchetypesSection',
    name: 'Scenario Presets & Integration Recipe',
    label: 'Blue & Orange Team Bot Takeover / Disconnect Reconnect / Mid-Match Handoff presets & decoupled code recipe',
  },
];

export interface TakeoverStageBackdropState {
  stageBgMode: StageBgMode;
  arenaPreset: ArenaLightingPreset;
  stageBrightness: number;
  showPitchLines: boolean;
  showAnchorGuides: boolean;
  getStageBackgroundStyle: () => React.CSSProperties;
}

export interface TakeoverStageHudConfig {
  glowConfig: TakeoverGlowConfig;
  typoConfig: CenterUpperTypographyConfig;
  timingConfig: CenterUpperTimingConfig;
  vignetteConfig: TakeoverVignetteConfig;
  vignettePreviewActive: boolean;
}

export interface TakeoverStageCanvasProps {
  backdrop: TakeoverStageBackdropState;
  hudConfig: TakeoverStageHudConfig;
  bottomOffsetPx: number;
  activeSignal: TakeoverSignal;
  isCockpitVisible: boolean;
  myTeamSide: 'blue' | 'orange';
  activePayload: TakeoverHudPayload | null;
  isSequencePlaying: boolean;
  setIsVisibleOnStage: (val: boolean) => void;
  channel: ReturnType<typeof createHudTransientChannel>;
}

export const TakeoverStageCanvas: React.FC<TakeoverStageCanvasProps> = ({
  backdrop: {
    stageBgMode,
    arenaPreset,
    stageBrightness,
    showPitchLines,
    showAnchorGuides,
    getStageBackgroundStyle,
  },
  hudConfig: {
    glowConfig,
    typoConfig,
    timingConfig,
    vignetteConfig,
    vignettePreviewActive,
  },
  bottomOffsetPx,
  activeSignal,
  isCockpitVisible,
  myTeamSide,
  activePayload,
  isSequencePlaying,
  setIsVisibleOnStage,
  channel,
}) => {
  const leftTeamColor = myTeamSide === 'blue' ? '#2563EB' : '#EA580C';
  const leftBarColor = myTeamSide === 'blue' ? '#3B82F6' : '#F97316';
  const rightTeamColor = myTeamSide === 'blue' ? '#EA580C' : '#2563EB';
  const isFlowBackdrop = stageBgMode === 'flow' || (stageBgMode === 'arena' && arenaPreset === 'flow');

  return (
    <div
      className="relative w-full h-[520px] rounded-3xl border border-neutral-300 dark:border-neutral-800 overflow-hidden shadow-2xl transition-colors duration-200"
      style={getStageBackgroundStyle()}
    >
      {(stageBgMode === 'arena' || stageBgMode === 'flow') && (
        <ArenaBackdrop
          preset={stageBgMode === 'flow' ? 'flow' : arenaPreset}
          brightness={stageBrightness}
          showPitchMarkings={showPitchLines}
        />
      )}

      {stageBgMode !== 'arena' && stageBgMode !== 'flow' && showPitchLines && (
        <div className="absolute inset-0 pointer-events-none opacity-20">
          <div className="absolute top-1/2 left-0 right-0 h-px bg-white/70 -translate-y-1/2" />
          <div className="absolute top-1/2 left-1/2 w-44 h-44 rounded-full border border-white/70 -translate-x-1/2 -translate-y-1/2" />
          <div className="absolute top-1/2 left-1/2 w-3 h-3 rounded-full bg-white/80 -translate-x-1/2 -translate-y-1/2" />
        </div>
      )}

      {/* Seamless Rounded-Rectangle 4-Edge Atmospheric Vignette Layer BELOW the HUD layer (z-10 under HudAnchorStage z-20) */}
      <TakeoverVignetteOverlay
        config={vignetteConfig}
        active={vignettePreviewActive}
      />

      {showAnchorGuides && (
        <div className="absolute inset-0 pointer-events-none z-15">
          <div className="absolute inset-y-0 left-1/2 w-px border-l border-dashed border-amber-400/25 -translate-x-1/2" />
          <div
            className="absolute inset-x-0 h-px border-t border-dashed border-amber-400/55 transition-all duration-150"
            style={{ bottom: `${bottomOffsetPx}px` }}
          >
            <span className="absolute right-3 -top-5 px-1.5 py-0.5 rounded bg-black/75 border border-amber-500/40 text-[10px] font-mono text-amber-300">
              HudZone anchor=&quot;bottom-center&quot; (bottomOffset = +{bottomOffsetPx}px upward)
            </span>
          </div>
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 flex items-center gap-1.5 opacity-40">
            <Crosshair className="h-4 w-4 text-white" />
            <span className="text-[9px] font-mono text-white bg-black/50 px-1.5 py-0.5 rounded">
              50% Global Center (Clear Car View Zone)
            </span>
          </div>
        </div>
      )}

      {/* Main UI Layer (z-20, rendered strictly ABOVE the z-10 Vignette Overlay) */}
      <HudAnchorStage strategy="reserve" style={{ fontFamily: 'var(--font-jetbrains)' }}>
        {/* 1. TOP-CENTER: Scoreboard always visible during Takeover */}
        <HudZone anchor="top-center" flush zIndexClassName="z-30">
          <StepperScoreboardHUD
            isLight={false}
            leftScore={2}
            rightScore={1}
            leftTeamColor={leftTeamColor}
            rightTeamColor={rightTeamColor}
            seconds={134}
            bestOf={5}
            leftSeriesWins={2}
            rightSeriesWins={1}
            subscribeScoreboard={channel.subscribeScoreboard}
          />
        </HudZone>

        {/* 2. TOP-LEFT: Corresponding Team Teammate Roster always visible during Takeover */}
        <HudZone anchor="top-left" flush className="pt-[56px]">
          <EdgePlayerHudStrip
            side="left"
            teamColor={leftTeamColor}
            barColor={leftBarColor}
            isLight={false}
            viewMode="player-live"
            subscribeRoster={channel.subscribeRoster}
          />
        </HudZone>

        {/* 3. BOTTOM-LEFT: Ball Cam Indicator */}
        <HudZone anchor="bottom-left">
          <HudSlot
            visible={isCockpitVisible}
            mode="reserve"
            exitOffset="translate3d(-140%, 0, 0)"
          >
            <BallCameraIndicator
              subscribeBallCam={channel.subscribeBallCam}
              shortcut="SPACE"
              label="BALL CAM"
              actionText="TO TOGGLE"
              isLight={false}
              onToggle={() => channel.toggleBallCam()}
            />
          </HudSlot>
        </HudZone>

        {/* 4. BOTTOM-CENTER: Speedometer + FlipIndicatorPillHUD */}
        <HudZone anchor="bottom-center">
          <HudSlot
            visible={isCockpitVisible}
            mode="reserve"
            exitOffset="translate3d(0, 220%, 0)"
          >
            <HudRelativeAnchor
              placement="top"
              align="start"
              gap={8}
              floating
              attachment={
                <FlipIndicatorPillHUD
                  isLight={false}
                  subscribeFlip={channel.subscribeFlip}
                />
              }
            >
              <div className="w-[360px] max-w-[42vw]">
                <VelocityProgressBar
                  subscribeSpeed={channel.subscribeSpeed}
                  width="100%"
                  height={16}
                />
              </div>
            </HudRelativeAnchor>
          </HudSlot>
        </HudZone>

        {/* 5. BOTTOM-RIGHT: Boost Meter (CircularBoostGauge) */}
        <HudZone anchor="bottom-right" flush className="pb-4">
          <HudSlot
            visible={isCockpitVisible}
            mode="reserve"
            exitOffset="translate3d(140%, 0, 0)"
            innerClassName="pr-5"
          >
            <CircularBoostGauge
              subscribeBoost={channel.subscribeBoost}
              isLight={false}
            />
          </HudSlot>
        </HudZone>

        {/* 6. BOTTOM-CENTER UPWARD OFFSET: Takeover Countdown Banner */}
        <HudZone
          anchor="bottom-center"
          flush
          zIndexClassName="z-40"
          style={{ bottom: `${bottomOffsetPx}px` }}
        >
          <HudSlot visible={Boolean(activePayload)} mode="reserve">
            <TakeoverCountdownHUD
              payload={activePayload}
              teamSide={myTeamSide}
              glowConfig={glowConfig}
              typographyConfig={typoConfig}
              timingConfig={timingConfig}
              onStepExpire={() => {
                if (!isSequencePlaying && !timingConfig.persistentInspect) {
                  setIsVisibleOnStage(false);
                }
              }}
            />
          </HudSlot>
        </HudZone>
      </HudAnchorStage>

      {/* Top-Right Telemetry & Signal Readout Pill */}
      <div className="absolute top-2.5 right-2.5 z-40 flex items-center gap-1.5 px-2.5 py-1 rounded-xl bg-black/75 border border-white/15 text-[10px] font-mono text-neutral-200 pointer-events-none">
        <span
          className={`h-2 w-2 rounded-full ${
            activeSignal === 'replacing-in'
              ? 'bg-amber-400 animate-pulse'
              : 'bg-emerald-400'
          }`}
        />
        <strong className="text-amber-400">{activeSignal}</strong>
        <span className="opacity-30">|</span>
        <strong className={myTeamSide === 'blue' ? 'text-blue-400' : 'text-orange-400'}>
          {myTeamSide === 'blue' ? 'BLUE' : 'ORANGE'}
        </strong>
        <span className="opacity-30">|</span>
        <strong className="text-sky-400">
          {vignettePreviewActive
            ? [
                `Vignette ${vignetteConfig.intensityPct}% `,
                `(T:${vignetteConfig.depthTopPct ?? 0}/B:${vignetteConfig.depthBottomPct ?? 35}/X:${vignetteConfig.depthXPct ?? 0}`,
                vignetteConfig.verticalOffsetPx
                  ? ` dY:${vignetteConfig.verticalOffsetPx > 0 ? '+' : ''}${vignetteConfig.verticalOffsetPx}px)`
                  : ')',
              ].join('')
            : 'Vignette OFF'}
        </strong>
        {isFlowBackdrop && (
          <>
            <span className="opacity-30">|</span>
            <span className="text-pink-400 font-bold">FLOW</span>
          </>
        )}
      </div>
    </div>
  );
};
