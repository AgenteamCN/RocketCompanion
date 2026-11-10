import React, { useEffect } from 'react';
import { useHudStore } from '../stores/hudStore';
import { useAppStore } from '../stores/appStore';
import { useTelemetryData } from '../stores/perfTelemetryStore';
import { useNetworkDiagnosticsData } from '../stores/networkDiagnosticsStore';
import { useKickoffTrainingStore } from '../stores/kickoffTrainingStore';
import {
  HudAnchorStage,
  HudZone,
  HudSlot,
  HudRelativeAnchor,
} from '../layout/HudAnchorStage';
import { globalHudTransientChannel } from '../stores/hudTransientChannel';
import { StepperScoreboardHUD } from './StepperScoreboardHUD';
import { EdgePlayerHudStrip } from './EdgePlayerHudStrip';
import { BallCameraIndicator } from './BallCameraIndicator';
import { VelocityProgressBar } from './VelocityProgressBar';
import { CircularBoostGauge } from './CircularBoostGauge';
import { CompactTelemetryBarHUD } from './CompactTelemetryBarHUD';
import { FlipIndicatorPillHUD } from './FlipIndicatorPillHUD';
import { DemolishHourglassTimerHUD } from './DemolishHourglassTimerHUD';
import { KickoffRhythmOverlayHUD } from './KickoffRhythmOverlayHUD';
import {
  GoalReplayHudOverlay,
  useGoalReplayAndTakeoverHudState,
} from './GoalReplayHudOverlay';
import { TakeoverVignetteOverlay } from './TakeoverVignetteOverlay';
import { DEFAULT_TAKEOVER_VIGNETTE } from './takeoverVignetteMath';
import { CenterUpperInfoHUD } from './CenterUpperInfoHUD';
import {
  DEFAULT_RL_COUNTDOWN_GLOW,
  DEFAULT_CENTER_UPPER_TYPOGRAPHY,
  DEFAULT_CENTER_UPPER_TIMING,
} from './centerUpperInfoDefaults';
import {
  deriveInGameScoreboardState,
  useWindowFocusAndPowerSave,
  useCenterUpperCountdownChoreography,
} from './useInGameHudChoreography';
import { useReplayPovSlotHotkeys } from './useReplayPovSlotHotkeys';

export interface InGameHUDProps {
  className?: string;
}

export const InGameHUD: React.FC<InGameHUDProps> = ({ className = '' }) => {
  const kickoffCountdown = useHudStore((s) => s.kickoffCountdown);
  const matchPhase = useHudStore((s) => s.matchPhase);
  const isPaused = useHudStore((s) => s.isPaused);
  const winner = useHudStore((s) => s.winner);
  const isOvertime = useHudStore((s) => s.isOvertime);
  const localTeam = useHudStore((s) => s.localTeam);
  const blueScore = useHudStore((s) => s.blueScore);
  const orangeScore = useHudStore((s) => s.orangeScore);
  const remainingSeconds = useHudStore((s) => s.remainingSeconds);
  const overtimeSeconds = useHudStore((s) => s.overtimeSeconds);
  const choreographySignal = useHudStore((s) => s.choreographySignal);
  const replayScorerName = useHudStore((s) => s.replayScorerName);
  const replayBallSpeedKph = useHudStore((s) => s.replayBallSpeedKph);
  const replayAssistName = useHudStore((s) => s.replayAssistName);
  const replayScorerTeam = useHudStore((s) => s.replayScorerTeam);
  const ballCamActive = useHudStore((s) => s.ballCamActive);
  const ballCamShortcut = useHudStore((s) => s.ballCamShortcut);
  const toggleBallCam = useHudStore((s) => s.toggleBallCam);
  const boostAmount = useHudStore((s) => s.boostAmount);
  const isUnlimited = useHudStore((s) => s.isUnlimited);
  const isDemolished = useHudStore((s) => s.isDemoed);
  const hasFlip = useHudStore((s) => s.hasFlip);
  const flipStatus = useHudStore((s) => s.flipStatus);
  const flipsRemaining = useHudStore((s) => s.flipsRemaining);

  const theme = useAppStore((s) => s.theme);
  const menuOpen = useAppStore((s) => s.isOpen);
  const isLight = theme === 'light';

  const matchMode = useAppStore((s) => s.matchMode);
  const showBallCamIndicator = useAppStore((s) => s.gameplay.ballCamIndicator);
  const telemetry = useAppStore((s) => s.telemetry);
  const telemetryEnabled = Boolean(telemetry?.alwaysShow);
  const pauseTelemetryInPowerSave = telemetry?.pauseTelemetryInPowerSave !== false;
  const menuPowerSave = useAppStore((s) => s.graphics?.menuPowerSave ?? '30');
  const isLivePreviewCollapsed = useAppStore((s) => s.isLivePreviewCollapsed);
  const activeRoute = useAppStore((s) => s.activeRoute);
  const onlineSession = useAppStore((s) => s.onlineSession);
  const renderScale = useAppStore((s) => s.graphics?.renderScale ?? 100);

  const { isPowerSaveActive, shouldPollTelemetry } = useWindowFocusAndPowerSave({
    menuOpen: Boolean(menuOpen),
    isLivePreviewCollapsed: Boolean(isLivePreviewCollapsed),
    activeRoute,
    menuPowerSave,
    telemetryEnabled,
    pauseTelemetryInPowerSave,
  });

  const kickoffStore = useKickoffTrainingStore();
  const { data: perfSnap } = useTelemetryData(60, shouldPollTelemetry);
  const netSnap = useNetworkDiagnosticsData();

  const hudChannel = globalHudTransientChannel;

  const { countdownPayload, handleCountdownExpire } = useCenterUpperCountdownChoreography({
    kickoffCountdown,
    matchPhase,
    isPaused: Boolean(isPaused),
    winner: winner ?? null,
    isOvertime,
    matchMode,
    roomType: onlineSession.roomType,
  });

  const isOnline =
    onlineSession.signalingConnected || (onlineSession.connectedPeers?.length ?? 0) > 0;
  useEffect(() => {
    if (!shouldPollTelemetry || !perfSnap || (perfSnap.fps <= 0 && perfSnap.frameMs <= 0)) {
      return;
    }
    hudChannel.setTelemetry({
      fps: Math.round(perfSnap.fps || 120),
      refreshHz: Math.round(perfSnap.refreshHz || 120),
      renderScalePct: Math.round(renderScale || 100),
      physicsRateHz: Math.round(perfSnap.sim?.physicsRateHz || 120),
      baseLatencyMs: isOnline ? Math.round(netSnap.metrics?.rttMs || 0) : 0,
      extraLatencyMs: 0,
    });
  }, [
    hudChannel,
    shouldPollTelemetry,
    isOnline,
    renderScale,
    perfSnap,
    netSnap.metrics?.rttMs,
  ]);

  const {
    isLobbyPhase,
    leftTeamColor,
    leftBarColor,
    rightTeamColor,
    rightBarColor,
    leftScore,
    rightScore,
    overtimeChinOpen,
    phaseChinOpen,
    phaseChinText,
    phaseChinColor,
    activeClockSec,
  } = deriveInGameScoreboardState({
    matchPhase,
    matchMode,
    roomType: onlineSession.roomType,
    onlineLocalTeam: onlineSession.localTeam,
    localTeam,
    blueScore,
    orangeScore,
    isOvertime,
    overtimeSeconds,
    remainingSeconds,
    matchDurationSeconds: onlineSession.matchDurationSeconds,
  });

  useEffect(() => {
    hudChannel.setScoreboard({
      leftScore,
      rightScore,
      seconds: activeClockSec,
      isOvertime: overtimeChinOpen,
      overtimeChinOpen: phaseChinOpen,
      overtimeChinText: phaseChinText,
      overtimeChinColor: phaseChinColor,
      bestOf: 0,
      leftSeriesWins: 0,
      rightSeriesWins: 0,
      seriesResults: [],
    });
  }, [
    hudChannel,
    leftScore,
    rightScore,
    activeClockSec,
    overtimeChinOpen,
    phaseChinOpen,
    phaseChinText,
    phaseChinColor,
  ]);

  const {
    isTakeoverPreroll,
    bottomHudRetracted,
    isReplayViewerActive,
    isReplayViewerLoaded,
    isReplayViewerIntervening,
  } = useGoalReplayAndTakeoverHudState({
    choreographySignal,
    matchPhase,
    localTeam,
  });

  const showKickoffOverlay =
    matchMode === 'kickoff-training' && kickoffStore.showKeyboardOverlay;
  useEffect(() => {
    if (!showKickoffOverlay) return;
    hudChannel.setKickoffFrame({
      episodeTick: kickoffStore.episodeTick,
      countdownRemainingTicks: kickoffStore.countdownRemainingTicks,
      aiTouchTick: kickoffStore.aiTouchTick,
      playerTouchTick: kickoffStore.playerTouchTick,
      lastDeltaTicks: kickoffStore.lastDeltaTicks,
      requiredKeys: kickoffStore.requiredKeys,
      playerKeys: kickoffStore.playerKeys,
    });
  }, [
    hudChannel,
    showKickoffOverlay,
    kickoffStore.episodeTick,
    kickoffStore.countdownRemainingTicks,
    kickoffStore.aiTouchTick,
    kickoffStore.playerTouchTick,
    kickoffStore.lastDeltaTicks,
    kickoffStore.requiredKeys,
    kickoffStore.playerKeys,
  ]);

  const { handleSelectPovSlot } = useReplayPovSlotHotkeys({
    hudChannel,
    matchMode,
    matchPhase,
    isReplayViewerActive,
    isReplayViewerLoaded,
  });

  const showTopScoreboard =
    matchMode === 'match' ||
    matchMode === 'exp-multi-bots' ||
    (matchMode === 'online-warmup' && onlineSession.roomType === 'match') ||
    isReplayViewerLoaded;

  const showEdgeRosterStrips =
    showTopScoreboard && !isLobbyPhase && matchPhase !== 'podium' && matchPhase !== 'ended';

  return (
    <div
      data-ui-element="in-game-hud-layer"
      data-alpha-id="Alpha:InGameHUD"
      className={`absolute inset-0 pointer-events-none select-none z-[5] overflow-hidden ${className}`}
    >
      <TakeoverVignetteOverlay
        config={DEFAULT_TAKEOVER_VIGNETTE}
        active={isTakeoverPreroll}
      />

      <HudAnchorStage
        strategy="reserve"
        style={{ fontFamily: 'var(--font-jetbrains)' }}
      >
        <HudZone anchor="top-left" flush>
          <HudSlot
            visible={telemetryEnabled}
            mode="reserve"
            reservedHeight={56}
            innerClassName="h-[56px] flex items-center pl-3"
          >
            {telemetryEnabled && (
              <CompactTelemetryBarHUD
                isLight={isLight}
                isFpsPaused={isPowerSaveActive}
                subscribeTelemetry={hudChannel.subscribeTelemetry}
              />
            )}
          </HudSlot>

          {showEdgeRosterStrips && (
            <EdgePlayerHudStrip
              side="left"
              viewMode={isReplayViewerIntervening ? 'player-live' : undefined}
              teamColor={leftTeamColor}
              barColor={leftBarColor}
              isLight={isLight}
              onSelectSlot={handleSelectPovSlot}
              subscribeRoster={hudChannel.subscribeRoster}
            />
          )}
        </HudZone>

        <HudZone anchor="top-center" flush gap={12} zIndexClassName="z-40">
          {showTopScoreboard && (
            <StepperScoreboardHUD
              isLight={isLight}
              leftScore={leftScore}
              rightScore={rightScore}
              leftTeamColor={leftTeamColor}
              rightTeamColor={rightTeamColor}
              seconds={activeClockSec}
              isOvertime={overtimeChinOpen}
              overtimeChinOpen={phaseChinOpen}
              overtimeChinText={phaseChinText}
              overtimeChinColor={phaseChinColor}
              bestOf={0}
              leftSeriesWins={0}
              rightSeriesWins={0}
              seriesResults={[]}
              subscribeScoreboard={hudChannel.subscribeScoreboard}
            />
          )}

          {showKickoffOverlay && (
            <KickoffRhythmOverlayHUD
              isLight={isLight}
              subMode={kickoffStore.subMode}
              phase={kickoffStore.phase}
              spawnIndex={kickoffStore.spawnIndex}
              onSelectSpawn={(idx) => {
                kickoffStore.setSpawnIndex(idx);
              }}
              showFallingNotes={kickoffStore.showFallingNotes}
              wsVerticalOffsetPct={kickoffStore.wsVerticalOffsetPct}
              episodeTick={kickoffStore.episodeTick}
              countdownRemainingTicks={kickoffStore.countdownRemainingTicks}
              subscribeKickoffFrame={hudChannel.subscribeKickoffFrame}
            />
          )}
        </HudZone>

        <HudZone anchor="upper-center" zIndexClassName="z-40">
          <HudSlot visible={true} mode="reserve">
            <CenterUpperInfoHUD
              info={countdownPayload}
              glowConfig={DEFAULT_RL_COUNTDOWN_GLOW}
              typographyConfig={DEFAULT_CENTER_UPPER_TYPOGRAPHY}
              timingConfig={DEFAULT_CENTER_UPPER_TIMING}
              onExpire={handleCountdownExpire}
            />
          </HudSlot>
        </HudZone>

        <HudZone anchor="top-right" flush>
          {showEdgeRosterStrips && (
            <div className="pt-[56px]">
              <EdgePlayerHudStrip
                side="right"
                viewMode={isReplayViewerIntervening ? 'player-live' : undefined}
                teamColor={rightTeamColor}
                barColor={rightBarColor}
                isLight={isLight}
                onSelectSlot={handleSelectPovSlot}
                subscribeRoster={hudChannel.subscribeRoster}
              />
            </div>
          )}
        </HudZone>

        <HudZone anchor="bottom-left">
          <HudSlot
            visible={showBallCamIndicator && !menuOpen && !bottomHudRetracted}
            mode="reserve"
            exitOffset="translate3d(-140%, 0, 0)"
          >
            <BallCameraIndicator
              active={ballCamActive}
              shortcut={ballCamShortcut}
              subscribeBallCam={hudChannel.subscribeBallCam}
              isLight={isLight}
              onToggle={toggleBallCam}
            />
          </HudSlot>
        </HudZone>

        <HudZone anchor="bottom-center">
          <HudSlot
            visible={!bottomHudRetracted}
            mode="reserve"
            exitOffset="translate3d(0, 220%, 0)"
          >
            <HudRelativeAnchor
              placement="top"
              align="start"
              gap={8}
              floating
              attachment={
                <div className="flex flex-col items-start gap-1.5 bg-transparent pointer-events-none">
                  {isDemolished && (
                    <DemolishHourglassTimerHUD
                      remainingSeconds={hudChannel.getRespawnTimer().remainingSeconds}
                      totalSeconds={3.0}
                      subscribeRespawnTimer={hudChannel.subscribeRespawnTimer}
                      alwaysVisible={false}
                      width={210}
                      height={28}
                      isLight={isLight}
                      className="bg-transparent"
                    />
                  )}
                  <FlipIndicatorPillHUD
                    isLight={isLight}
                    hasFlip={hasFlip}
                    status={flipStatus}
                    remainingSeconds={hudChannel.getFlip().remainingSeconds}
                    maxSeconds={1.25}
                    flipsRemaining={flipsRemaining}
                    subscribeFlip={hudChannel.subscribeFlip}
                  />
                </div>
              }
            >
              <div className="w-[360px] max-w-[42vw]">
                <VelocityProgressBar
                  speed={hudChannel.getSpeed()}
                  subscribeSpeed={hudChannel.subscribeSpeed}
                  width="100%"
                  height={16}
                />
              </div>
            </HudRelativeAnchor>
          </HudSlot>
        </HudZone>

        <HudZone anchor="bottom-right" flush className="pb-4">
          <HudSlot
            visible={!bottomHudRetracted}
            mode="reserve"
            exitOffset="translate3d(140%, 0, 0)"
            innerClassName="pr-5"
          >
            <CircularBoostGauge
              amount={boostAmount}
              isUnlimited={isUnlimited}
              subscribeBoost={hudChannel.subscribeBoost}
              isLight={isLight}
            />
          </HudSlot>
        </HudZone>

        <GoalReplayHudOverlay
          isLight={isLight}
          hudChannel={hudChannel}
          choreographySignal={choreographySignal}
          matchPhase={matchPhase}
          localTeam={localTeam}
          replayScorerName={replayScorerName}
          replayBallSpeedKph={replayBallSpeedKph}
          replayAssistName={replayAssistName}
          replayScorerTeam={replayScorerTeam}
        />
      </HudAnchorStage>
    </div>
  );
};
