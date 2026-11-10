import React from 'react';
import { StepperScoreboardHUD } from '../../../ui-core/hud/StepperScoreboardHUD';
import { EdgePlayerHudStrip } from '../../../ui-core/hud/EdgePlayerHudStrip';
import { BallCameraIndicator } from '../../../ui-core/hud/BallCameraIndicator';
import { VelocityProgressBar } from '../../../ui-core/hud/VelocityProgressBar';
import { CircularBoostGauge } from '../../../ui-core/hud/CircularBoostGauge';
import { CompactTelemetryBarHUD } from '../../../ui-core/hud/CompactTelemetryBarHUD';
import { FlipIndicatorPillHUD } from '../../../ui-core/hud/FlipIndicatorPillHUD';
import { TemporalReplayFooterHUD } from '../../../ui-core/hud/TemporalReplayFooterHUD';
import { DemolishHourglassTimerHUD } from '../../../ui-core/hud/DemolishHourglassTimerHUD';
import { ArenaBackdrop } from '../../ArenaBackdrop';
import {
  HudAnchorStage,
  HudZone,
  HudSlot,
  HudRelativeAnchor,
} from '../../../ui-core/layout/HudAnchorStage';
import { useHudChoreographySandbox } from './HudChoreographySandboxContext';

export const HudSpatialChoreographyStageCanvas: React.FC = () => {
  const {
    hudThemeLight,
    layoutStrategy,
    leftTopBandVisible,
    rightTopBandVisible,
    topBandSlotMode,
    showTelemetryTopLeft,
    leftTeamColor,
    leftBarColor,
    rightTeamColor,
    rightBarColor,
    demoIndicatorConfig,
    skipIndicatorConfig,
    handleSelectPov,
    selfDemoActive,
    selfDemoPillTextRef,
    showBallCam,
    isCockpitVisible,
    instantCockpitTransition,
    jumpPlacement,
    handleCycleFlipSimMode,
    channel,
  } = useHudChoreographySandbox();

  return (
    <div className="relative w-full h-[540px] rounded-3xl border border-neutral-300 dark:border-neutral-800 overflow-hidden shadow-2xl bg-black">
      <ArenaBackdrop
        preset={hudThemeLight ? 'daylight' : 'night'}
        brightness={hudThemeLight ? 75 : 32}
      />

      {/* Pure L2 HUD Anchor Stage Shell */}
      <HudAnchorStage
        strategy={layoutStrategy}
        style={{ fontFamily: 'var(--font-jetbrains)' }}
      >
        {/* 1. TOP-LEFT ZONE:
               - Top Container (`56px` shared vertical space)
               - Below (`y = 56px`): My Team `[1, 2, 3]` `EdgePlayerHudStrip` */}
        <HudZone anchor="top-left" flush>
          <HudSlot
            visible={leftTopBandVisible}
            mode={topBandSlotMode}
            reservedHeight={56}
            innerClassName="h-[56px] flex items-center pl-3"
          >
            {showTelemetryTopLeft && (
              <CompactTelemetryBarHUD
                isLight={hudThemeLight}
                subscribeTelemetry={channel.subscribeTelemetry}
              />
            )}
          </HudSlot>

          {/* My Team [1, 2, 3] Strip (Always on Left, colored Blue or Orange via Switch Side) */}
          <div className={!leftTopBandVisible && topBandSlotMode === 'collapse' ? 'pt-2.5' : ''}>
            <EdgePlayerHudStrip
              side="left"
              teamColor={leftTeamColor}
              barColor={leftBarColor}
              isLight={hudThemeLight}
              demoIndicatorConfig={demoIndicatorConfig}
              skipIndicatorConfig={skipIndicatorConfig}
              onSelectSlot={handleSelectPov}
              subscribeRoster={channel.subscribeRoster}
            />
          </div>
        </HudZone>

        {/* 2. TOP-CENTER ZONE (Flush to `top-0`):
               - `5A.1 StepperScoreboardHUD` (Scorebug + Series Pips Banner + Phase Drop-Banner)
               - `T5A.2 DemolishHourglassTimerHUD` flowing naturally 12px below active sub-banners */}
        <HudZone anchor="top-center" flush gap={12} zIndexClassName="z-40">
          <StepperScoreboardHUD
            isLight={hudThemeLight}
            leftTeamColor={leftTeamColor}
            rightTeamColor={rightTeamColor}
            subscribeScoreboard={channel.subscribeScoreboard}
          />

          <HudSlot visible={selfDemoActive} mode="collapse">
            <div className="flex flex-col items-center gap-1">
              <div
                className={`px-3 py-1.5 rounded-xl border ${
                  hudThemeLight
                    ? 'bg-white/95 border-neutral-300 shadow-md'
                    : 'bg-neutral-950/95 border-white/15 shadow-md'
                }`}
              >
                <DemolishHourglassTimerHUD
                  subscribeRespawnTimer={channel.subscribeRespawnTimer}
                  totalSeconds={3.0}
                  alwaysVisible={false}
                  isLight={hudThemeLight}
                  width={210}
                  height={28}
                />
              </div>
              <span
                ref={selfDemoPillTextRef}
                className="text-[10px] tracking-widest uppercase text-red-400 bg-black/85 px-2 py-0.5 rounded font-bold tabular-nums"
              >
                RESPAWN IN 3.0S
              </span>
            </div>
          </HudSlot>
        </HudZone>

        {/* 3. TOP-RIGHT ZONE:
               - Top Container (`56px` shared vertical space aligned with Top-Left Telemetry)
               - Below (`y = 56px`): Opponent Team `[4, 5, 6]` `EdgePlayerHudStrip` */}
        <HudZone anchor="top-right" flush>
          <HudSlot
            visible={rightTopBandVisible}
            mode={topBandSlotMode}
            reservedHeight={56}
            innerClassName="h-[56px] flex items-center justify-end pr-3"
          />

          {/* Opponent Team [4, 5, 6] Strip (Hidden in Player Live unless demolished, visible in Replay/Spectator) */}
          <div
            className={`relative z-30 ${
              !rightTopBandVisible && topBandSlotMode === 'collapse' ? 'pt-2.5' : ''
            }`}
          >
            <EdgePlayerHudStrip
              side="right"
              teamColor={rightTeamColor}
              barColor={rightBarColor}
              isLight={hudThemeLight}
              demoIndicatorConfig={demoIndicatorConfig}
              skipIndicatorConfig={skipIndicatorConfig}
              onSelectSlot={handleSelectPov}
              subscribeRoster={channel.subscribeRoster}
            />
          </div>
        </HudZone>

        {/* 4. BOTTOM-LEFT ZONE (Fixed Landmark): `5A.3 BallCameraIndicator` */}
        <HudZone anchor="bottom-left">
          <HudSlot
            visible={showBallCam && isCockpitVisible}
            mode="reserve"
            exitOffset="translate3d(-140%, 0, 0)"
            instant={instantCockpitTransition}
          >
            <BallCameraIndicator
              subscribeBallCam={channel.subscribeBallCam}
              shortcut="SPACE"
              label="BALL CAM"
              actionText="TO TOGGLE"
              isLight={hudThemeLight}
              onToggle={() => channel.toggleBallCam()}
            />
          </HudSlot>
        </HudZone>

        {/* 5. BOTTOM-CENTER ZONE (Fixed Landmark):
               `5A.4 VelocityProgressBar` + `5A.7 FlipIndicatorPillHUD` */}
        <HudZone anchor="bottom-center">
          <HudSlot
            visible={isCockpitVisible}
            mode="reserve"
            exitOffset="translate3d(0, 220%, 0)"
            instant={instantCockpitTransition}
          >
            <HudRelativeAnchor
              placement={
                jumpPlacement === 'top-left'
                  ? 'top'
                  : jumpPlacement === 'center-bottom-right'
                  ? 'right'
                  : 'left'
              }
              align={jumpPlacement === 'top-left' ? 'start' : 'center'}
              gap={jumpPlacement === 'top-left' ? 8 : 14}
              floating
              attachment={
                <div
                  onClick={handleCycleFlipSimMode}
                  title="Click to Cycle Second Flip status: 160Step Countdown -> Ground Fill(1.25s) -> Unlimited(∞) -> No Flip(0)"
                  className="cursor-pointer pointer-events-auto"
                >
                  <FlipIndicatorPillHUD
                    isLight={hudThemeLight}
                    subscribeFlip={channel.subscribeFlip}
                  />
                </div>
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

        {/* 6. BOTTOM-RIGHT ZONE: `CircularBoostGauge` */}
        <HudZone anchor="bottom-right" flush className="pb-4">
          <HudSlot
            visible={isCockpitVisible}
            mode="reserve"
            exitOffset="translate3d(140%, 0, 0)"
            instant={instantCockpitTransition}
            innerClassName="pr-5"
          >
            <CircularBoostGauge
              subscribeBoost={channel.subscribeBoost}
              isLight={hudThemeLight}
            />
          </HudSlot>
        </HudZone>

        {/* 7. GOAL REPLAY BOTTOM FOOTER (`T5A.1 TemporalReplayFooterHUD`) */}
        <TemporalReplayFooterHUD
          isLight={hudThemeLight}
          subscribeReplayFooter={channel.subscribeReplayFooter}
        />
      </HudAnchorStage>
    </div>
  );
};
