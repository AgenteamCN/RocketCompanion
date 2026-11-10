import { MATCH_SIGNALS } from '../../network/protocol/GlobalPayloadCodec.ts';
import { isSignalAudioMutedInGoalReplay } from '../../audio/SignalAudioEngine.ts';
import { hudStore } from '../runtimeUiPort.ts';
import type { PredictionReconciler } from '../../network/client/PredictionReconciler.ts';
import {
  RuntimeParticipantAndCombatSignalSubController,
  resolveParticipantAnthemId,
  resolveParticipantDisplayName,
  type RosterPlayerEntryLike,
  type RuntimeSignalActiveModePort,
  type RuntimeSignalHostPort,
  type RuntimeSignalLatchState,
  type RuntimeSignalPacket,
  type SignalAudioFacadeLike,
} from './RuntimeParticipantAndCombatSignalSubController.ts';
import {
  focusLocalPlayerCarInArenaAndCamera,
  resetGoalReplayIncidentFlags,
  startGoalReplayDirectorSession,
  teardownSignalReplayAndPodiumSession,
  toggleGoalReplayCameraViewMode,
} from './signalWorldTransitionPipeline.ts';

export type {
  RosterPlayerEntryLike,
  RuntimeSignalActiveModePort,
  RuntimeSignalHostPort,
  RuntimeSignalLatchState,
  RuntimeSignalPacket,
  SignalAudioFacadeLike,
};

/**
 * RuntimeGoalReplaySignalSubController
 * Stateful SubController owning goal scoring, goal replay choreography transitions,
 * and delegating combat/contact incident signals to RuntimeParticipantAndCombatSignalSubController.
 */
export class RuntimeGoalReplaySignalSubController {
  public readonly context: RuntimeSignalHostPort;
  public readonly latch: RuntimeSignalLatchState;
  public readonly participantAndCombat: RuntimeParticipantAndCombatSignalSubController;

  constructor(
    context: RuntimeSignalHostPort,
    latch: RuntimeSignalLatchState,
    participantAndCombat = new RuntimeParticipantAndCombatSignalSubController(context)
  ) {
    this.context = context;
    this.latch = latch;
    this.participantAndCombat = participantAndCombat;
  }

  public reset(): void {
    resetGoalReplayIncidentFlags(this.context, true);
    teardownSignalReplayAndPodiumSession(this.context);
  }

  private resolveScorerPresentation(
    scoringTeam: number,
    scorerCarIdx: number
  ): { scorerName: string; scorerAnthemId: string | null } {
    const ctx = this.context;
    const playerCarIdx = ctx.playerCarIndex ?? 0;
    const lastRosterSnapshot = ctx.getLastRosterSnapshot();
    return {
      scorerName: resolveParticipantDisplayName(
        lastRosterSnapshot,
        playerCarIdx,
        scorerCarIdx,
        scoringTeam
      ),
      scorerAnthemId: resolveParticipantAnthemId(lastRosterSnapshot, playerCarIdx, scorerCarIdx),
    };
  }

  private handleScoreUpdated(
    sig: RuntimeSignalPacket,
    audio: SignalAudioFacadeLike | null | undefined
  ): void {
    const ctx = this.context;
    const matchState = ctx.match?.state;
    const bScore = sig.param1 ?? 0;
    const oScore = sig.param2 ?? 0;
    const isInitialZeroScore = bScore === 0 && oScore === 0;
    const isScoreChange =
      !isInitialZeroScore &&
      (matchState?.blueScore !== bScore || matchState?.orangeScore !== oScore);

    if (!isInitialZeroScore) {
      this.latch.lastKickoffTargetFrame = -1;
      this.latch.latchedKickoffSeconds.clear();
    }
    if (matchState) {
      if (!isInitialZeroScore && matchState.phase !== 'replay') matchState.phase = 'goal';
      matchState.blueScore = bScore;
      matchState.orangeScore = oScore;
    }
    hudStore.getState().setMatchState({
      ...(isInitialZeroScore || matchState?.phase === 'replay' ? {} : { matchPhase: 'goal' }),
      blueScore: bScore,
      orangeScore: oScore,
    });
    if (isScoreChange && !isSignalAudioMutedInGoalReplay(ctx)) {
      audio?.play('sfx_goal_poof', 1.0);
    }
  }

  private handleGoalReplayWillStart(sig: RuntimeSignalPacket): void {
    const ctx = this.context;
    const matchState = ctx.match?.state;
    resetGoalReplayIncidentFlags(ctx);
    this.latch.lastKickoffTargetFrame = -1;
    this.latch.latchedKickoffSeconds.clear();
    const rawParam1 = sig.param1 ?? 0;
    const scoringTeam = rawParam1 & 0x1;
    const scorerCarIdx = (rawParam1 >>> 8) & 0xff;
    const speedKph = (rawParam1 >>> 16) & 0xffff;
    const { scorerName, scorerAnthemId } = this.resolveScorerPresentation(
      scoringTeam,
      scorerCarIdx
    );
    if (matchState) {
      if (matchState.phase !== 'replay') matchState.phase = 'goal';
      matchState.scorer = scoringTeam;
      matchState.scorerCarIndex = scorerCarIdx;
    }
    hudStore.getState().setMatchState({
      ...(matchState?.phase === 'replay' ? {} : { matchPhase: 'goal' }),
      replayScorerName: scorerName,
      replayScorerTeam: scoringTeam,
      replayScorerAnthemId: scorerAnthemId,
      replayBallSpeedKph: speedKph > 0 ? speedKph : 100,
    });
  }

  private handleGoalReplayStart(
    reconciler: PredictionReconciler,
    sig: RuntimeSignalPacket,
    audio: SignalAudioFacadeLike | null | undefined
  ): void {
    const ctx = this.context;
    const matchState = ctx.match?.state;
    const physics = ctx.physics;
    resetGoalReplayIncidentFlags(ctx);
    this.latch.lastKickoffTargetFrame = -1;
    this.latch.latchedKickoffSeconds.clear();
    audio?.resetIncidentDebounceState?.();
    reconciler.setReplayPlaybackMode?.(true);
    if (!ctx.clientReplayOverflowPaused) physics?.setReplayRecordingActive?.(true);
    physics?.resetGoalLatch?.();
    const replayTicks = (sig.param1 ?? 0) > 0 ? sig.param1! : 360;
    const rawMeta = sig.param2 ?? 0;
    const scoringTeam = rawMeta > 0 ? rawMeta & 0x1 : (matchState?.scorer ?? 0);
    const scorerCarIdx = rawMeta > 0 ? (rawMeta >>> 1) & 0xff : (matchState?.scorerCarIndex ?? 0);
    const speedKph = (rawMeta >>> 16) & 0xffff;
    const { scorerName, scorerAnthemId } = this.resolveScorerPresentation(
      scoringTeam,
      scorerCarIdx
    );
    if (matchState) {
      matchState.phase = 'replay';
      matchState.scorer = scoringTeam;
      matchState.scorerCarIndex = scorerCarIdx;
    }
    startGoalReplayDirectorSession(ctx, {
      durationTicks: replayTicks,
      scoringTeam,
      scorerCarIndex: scorerCarIdx,
    });
    hudStore.getState().setMatchState({
      matchPhase: 'replay',
      choreographySignal: 'goal-replay-started',
      replayScorerName: scorerName,
      replayScorerTeam: scoringTeam,
      replayScorerAnthemId: scorerAnthemId,
      ...(speedKph > 0 ? { replayBallSpeedKph: speedKph } : {}),
    });
    hudStore.getState().setReplayState?.({
      replayCameraMode: 'director',
      replayScorerName: scorerName,
      replayScorerTeam: scoringTeam,
      ...(speedKph > 0 ? { replayBallSpeedKph: speedKph } : {}),
      onReplaySkip: () => {
        const activeMode = ctx.modeManager?.getActiveMode?.();
        if (typeof activeMode?.skipGoalReplay === 'function') {
          activeMode.skipGoalReplay();
        }
      },
      onReplayToggleCamera: () => {
        toggleGoalReplayCameraViewMode(ctx, scorerCarIdx);
      },
    });
  }

  private handleGoalReplayEndOrRoundStart(reconciler: PredictionReconciler): void {
    const ctx = this.context;
    const matchState = ctx.match?.state;
    const physics = ctx.physics;
    resetGoalReplayIncidentFlags(ctx);
    reconciler.setReplayPlaybackMode?.(false);
    if (!ctx.clientReplayOverflowPaused) physics?.setReplayRecordingActive?.(true);
    physics?.resetGoalLatch?.();
    physics?.setSimulationFrozen?.(false);
    teardownSignalReplayAndPodiumSession(ctx);
    const activeMode = ctx.modeManager?.getActiveMode?.();
    if (activeMode?.directorPreview?.isReplayActive) {
      activeMode.directorPreview.isReplayActive = false;
    }
    focusLocalPlayerCarInArenaAndCamera(reconciler, ctx, {
      resetView: true,
      syncInterpolator: true,
    });
    ctx.latchJumpSuppression?.();
    const isFreeplayMode = matchState?.mode === 'freeplay';
    const nextPhase = isFreeplayMode ? 'playing' : 'kickoff';
    if (
      matchState &&
      (matchState.phase === 'replay' || (isFreeplayMode && matchState.phase === 'goal'))
    ) {
      matchState.phase = nextPhase;
    }
    if (
      hudStore.getState().matchPhase === 'replay' ||
      (isFreeplayMode && hudStore.getState().matchPhase === 'goal')
    ) {
      hudStore.getState().setMatchState({
        matchPhase: nextPhase,
        ...(isFreeplayMode
          ? {
              replayScorerName: null,
              replayScorerTeam: null,
              replayBallSpeedKph: null,
              replayAssistName: null,
            }
          : {}),
      });
    }
    hudStore.getState().setReplayState?.({ replayPaused: false, replayPersistent: false });
  }

  public handleSignal(
    reconciler: PredictionReconciler,
    sig: RuntimeSignalPacket,
    isFirstSeenSignalId: boolean,
    audio: SignalAudioFacadeLike | null | undefined
  ): boolean {
    if (this.participantAndCombat.handleCombatIncidentSignal(sig, isFirstSeenSignalId, audio)) {
      return true;
    }
    switch (sig.signalType) {
      case MATCH_SIGNALS.SCORE_UPDATED:
        this.handleScoreUpdated(sig, audio);
        return true;
      case MATCH_SIGNALS.GOAL_REPLAY_WILL_START:
        this.handleGoalReplayWillStart(sig);
        return true;
      case MATCH_SIGNALS.GOAL_REPLAY_START:
        this.handleGoalReplayStart(reconciler, sig, audio);
        return true;
      case MATCH_SIGNALS.GOAL_REPLAY_WILL_END:
        this.context.physics?.resetGoalLatch?.();
        hudStore.getState().setChoreographySignal?.('goal-replay-will-end');
        return true;
      case MATCH_SIGNALS.GOAL_REPLAY_END:
      case MATCH_SIGNALS.ROUND_STARTED:
      case MATCH_SIGNALS.BALL_RESET:
        this.handleGoalReplayEndOrRoundStart(reconciler);
        return true;
      default:
        return false;
    }
  }
}
