import React, { useEffect } from 'react';
import { HudZone, HudSlot } from '../layout/HudAnchorStage';
import { useReplayViewerStore } from '../stores/replayViewerStore';
import { useReplayToRcsImporterStore } from '../stores/replayToRcsImporterStore';
import { useRewinderStore } from '../stores/rewinderStore';
import type { HudTransientChannel } from '../stores/hudTransientTypes';
import { TemporalReplayFooterHUD } from './TemporalReplayFooterHUD';
import { TakeoverCountdownHUD } from './TakeoverCountdownHUD';
import {
  DEFAULT_TAKEOVER_GLOW,
  DEFAULT_TAKEOVER_TYPOGRAPHY,
  DEFAULT_TAKEOVER_TIMING,
  DEFAULT_TAKEOVER_LAYOUT,
  type TakeoverTeamSide,
} from './takeoverCountdownDefaults';
import { useTakeoverPrerollChoreography } from './useInGameHudChoreography';

export function useGoalReplayAndTakeoverHudState(params: {
  choreographySignal: string | null;
  matchPhase: string;
  localTeam: number;
}) {
  const { choreographySignal, matchPhase, localTeam } = params;

  const rawRvState = useReplayViewerStore((s) => s.viewerState);
  const rawRvTotalFrames = useReplayViewerStore((s) => s.totalFrames);
  const rawRvFileName = useReplayViewerStore((s) => s.loadedFileName);
  const rawRvPrerollSec = useReplayViewerStore((s) => s.prerollRemainingSec);
  const rawRvDownCounterSec = useReplayViewerStore((s) => s.downCounterSec);
  const rawRvPovTeam = useReplayViewerStore((s) => s.activePovTeam);

  const rawImpState = useReplayToRcsImporterStore((s) => s.viewerState);
  const rawImpWindowOpen = useReplayToRcsImporterStore((s) => s.isWindowOpen);
  const rawImpTotalFrames = useReplayToRcsImporterStore((s) => s.totalFrames);
  const rawImpFileName = useReplayToRcsImporterStore((s) => s.loadedFileName);
  const rawImpPrerollSec = useReplayToRcsImporterStore((s) => s.prerollRemainingSec);
  const rawImpDownCounterSec = useReplayToRcsImporterStore((s) => s.downCounterSec);
  const rawImpPovTeam = useReplayToRcsImporterStore((s) => s.activePovTeam);

  const useImporterForHud =
    rawImpWindowOpen &&
    rawImpState !== 'idle' &&
    rawImpTotalFrames > 0 &&
    Boolean(rawImpFileName);
  const replayViewerState = useImporterForHud ? rawImpState : rawRvState;
  const replayViewerTotalFrames = useImporterForHud ? rawImpTotalFrames : rawRvTotalFrames;
  const replayViewerFileName = useImporterForHud ? rawImpFileName : rawRvFileName;
  const replayPrerollSec = useImporterForHud ? rawImpPrerollSec : rawRvPrerollSec;
  const replayDownCounterSec = useImporterForHud ? rawImpDownCounterSec : rawRvDownCounterSec;
  const activePovTeam = useImporterForHud ? rawImpPovTeam : rawRvPovTeam;

  const rewinderState = useRewinderStore((s) => s.rewinderState);
  const rewinderPrerollSec = useRewinderStore((s) => s.rewinderPrerollRemainingSec);
  const rewinderDownCounterSec = useRewinderStore((s) => s.rewinderDownCounterSec);

  const isReplayPreroll = replayViewerState === 'preroll-countdown';
  const isRewinderPreroll = rewinderState === 'preroll-countdown';

  const takeoverTeam: TakeoverTeamSide =
    (isReplayPreroll || replayViewerState === 'intervening' ? activePovTeam : localTeam) === 1
      ? 'orange'
      : 'blue';

  const { isTakeoverPreroll } = useTakeoverPrerollChoreography({
    isReplayPreroll,
    isRewinderPreroll,
    replayPrerollSec,
    rewinderPrerollSec,
    replayDownCounterSec,
    rewinderDownCounterSec,
    takeoverTeam,
  });

  const bottomHudRetracted =
    choreographySignal === 'goal-replay-will-start' ||
    choreographySignal === 'goal-replay-started' ||
    choreographySignal === 'goal-replay-will-end' ||
    matchPhase === 'goal' ||
    matchPhase === 'replay' ||
    isTakeoverPreroll;

  const isReplayViewerActive = Boolean(
    replayViewerFileName &&
      replayViewerTotalFrames > 0 &&
      replayViewerState !== 'idle' &&
      replayViewerState !== 'preroll-countdown' &&
      replayViewerState !== 'intervening'
  );
  const isReplayViewerLoaded = Boolean(
    replayViewerFileName && replayViewerTotalFrames > 0 && replayViewerState !== 'idle'
  );
  const isReplayViewerIntervening = Boolean(
    isReplayViewerLoaded &&
      (replayViewerState === 'preroll-countdown' || replayViewerState === 'intervening')
  );

  return {
    isTakeoverPreroll,
    bottomHudRetracted,
    isReplayViewerActive,
    isReplayViewerLoaded,
    isReplayViewerIntervening,
  };
}

export interface GoalReplayHudOverlayProps {
  isLight: boolean;
  hudChannel: HudTransientChannel;
  choreographySignal: string | null;
  matchPhase: string;
  localTeam: number;
  replayScorerName?: string | null;
  replayBallSpeedKph?: number | null;
  replayAssistName?: string | null;
  replayScorerTeam?: number | null;
}

/**
 * GoalReplayHudOverlay
 * Bottom HUD overlay subtree handling:
 * - Goal Replay temporal footer banner (`TemporalReplayFooterHUD`) & transient channel sync
 * - Auto-resetting player slot replay skip indicators (`replaySkipReady`) on `kickoff-will-start`
 * - Bottom-center upward offset Takeover Countdown banner (`TakeoverCountdownHUD`)
 */
export const GoalReplayHudOverlay: React.FC<GoalReplayHudOverlayProps> = ({
  isLight,
  hudChannel,
  choreographySignal,
  matchPhase,
  localTeam,
  replayScorerName,
  replayBallSpeedKph,
  replayAssistName,
  replayScorerTeam,
}) => {
  const rawRvState = useReplayViewerStore((s) => s.viewerState);
  const rawRvPrerollSec = useReplayViewerStore((s) => s.prerollRemainingSec);
  const rawRvDownCounterSec = useReplayViewerStore((s) => s.downCounterSec);
  const rawRvPovTeam = useReplayViewerStore((s) => s.activePovTeam);

  const rawImpState = useReplayToRcsImporterStore((s) => s.viewerState);
  const rawImpWindowOpen = useReplayToRcsImporterStore((s) => s.isWindowOpen);
  const rawImpTotalFrames = useReplayToRcsImporterStore((s) => s.totalFrames);
  const rawImpFileName = useReplayToRcsImporterStore((s) => s.loadedFileName);
  const rawImpPrerollSec = useReplayToRcsImporterStore((s) => s.prerollRemainingSec);
  const rawImpDownCounterSec = useReplayToRcsImporterStore((s) => s.downCounterSec);
  const rawImpPovTeam = useReplayToRcsImporterStore((s) => s.activePovTeam);

  const useImporterForHud =
    rawImpWindowOpen &&
    rawImpState !== 'idle' &&
    rawImpTotalFrames > 0 &&
    Boolean(rawImpFileName);
  const replayViewerState = useImporterForHud ? rawImpState : rawRvState;
  const replayPrerollSec = useImporterForHud ? rawImpPrerollSec : rawRvPrerollSec;
  const replayDownCounterSec = useImporterForHud ? rawImpDownCounterSec : rawRvDownCounterSec;
  const activePovTeam = useImporterForHud ? rawImpPovTeam : rawRvPovTeam;

  const rewinderState = useRewinderStore((s) => s.rewinderState);
  const rewinderPrerollSec = useRewinderStore((s) => s.rewinderPrerollRemainingSec);
  const rewinderDownCounterSec = useRewinderStore((s) => s.rewinderDownCounterSec);

  const isReplayPreroll = replayViewerState === 'preroll-countdown';
  const isRewinderPreroll = rewinderState === 'preroll-countdown';

  const takeoverTeam: TakeoverTeamSide =
    (isReplayPreroll || replayViewerState === 'intervening' ? activePovTeam : localTeam) === 1
      ? 'orange'
      : 'blue';

  const { takeoverPayload, handleTakeoverExpire } = useTakeoverPrerollChoreography({
    isReplayPreroll,
    isRewinderPreroll,
    replayPrerollSec,
    rewinderPrerollSec,
    replayDownCounterSec,
    rewinderDownCounterSec,
    takeoverTeam,
  });

  const hasGoalReplayMetadata =
    Boolean(replayScorerName && replayScorerName.trim().length > 0) ||
    (typeof replayBallSpeedKph === 'number' && Number.isFinite(replayBallSpeedKph));

  const replayFooterVisible =
    choreographySignal === 'goal-replay-started' &&
    matchPhase === 'replay' &&
    hasGoalReplayMetadata;

  useEffect(() => {
    if (choreographySignal === 'kickoff-will-start') {
      const skipCfg = hudChannel.getRoster().skipIndicatorConfig;
      if (skipCfg?.autoResetOnKickoff !== false) {
        ([1, 2, 3, 4, 5, 6] as const).forEach((slotKey) => {
          hudChannel.updatePlayerSlot(slotKey, { replaySkipReady: false });
        });
      }
    }
  }, [choreographySignal, hudChannel]);

  useEffect(() => {
    hudChannel.setReplayFooter({
      visible: replayFooterVisible,
      scorerName: replayScorerName ?? '',
      goalSpeed: typeof replayBallSpeedKph === 'number' ? replayBallSpeedKph : '',
      assisterName: replayAssistName,
      teamAccentColor: replayScorerTeam === 1 ? '#F97316' : '#3B82F6',
    });
  }, [
    hudChannel,
    replayFooterVisible,
    replayScorerName,
    replayBallSpeedKph,
    replayAssistName,
    replayScorerTeam,
  ]);

  return (
    <>
      {/* 7. GOAL REPLAY BOTTOM FOOTER: TemporalReplayFooterHUD (enters on goal-replay-started, exits on goal-replay-will-end) */}
      <TemporalReplayFooterHUD
        isLight={isLight}
        subscribeReplayFooter={hudChannel.subscribeReplayFooter}
      />

      {/* 8. BOTTOM-CENTER UPWARD OFFSET: Layer 5G Takeover Countdown Banner */}
      <HudZone
        anchor="bottom-center"
        flush
        zIndexClassName="z-40"
        style={{ bottom: `${DEFAULT_TAKEOVER_LAYOUT.bottomOffsetPx}px` }}
      >
        <HudSlot visible={Boolean(takeoverPayload)} mode="reserve">
          <TakeoverCountdownHUD
            payload={takeoverPayload}
            teamSide={takeoverTeam}
            glowConfig={DEFAULT_TAKEOVER_GLOW}
            typographyConfig={DEFAULT_TAKEOVER_TYPOGRAPHY}
            timingConfig={DEFAULT_TAKEOVER_TIMING}
            onStepExpire={handleTakeoverExpire}
          />
        </HudSlot>
      </HudZone>
    </>
  );
};
