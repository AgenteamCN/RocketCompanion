import { MATCH_SIGNALS } from '../../network/protocol/GlobalPayloadCodec.ts';
import { isSignalAudioMutedInGoalReplay } from '../../audio/SignalAudioEngine.ts';
import { hudStore } from '../runtimeUiPort.ts';
import type { PredictionReconciler } from '../../network/client/PredictionReconciler.ts';
import {
  RuntimeGoalReplaySignalSubController,
  type RuntimeSignalPacket,
  type SignalAudioFacadeLike,
  type RuntimeSignalLatchState,
  type RuntimeSignalHostPort,
} from './RuntimeGoalReplaySignalSubController.ts';
import { RuntimeParticipantAndCombatSignalSubController } from './RuntimeParticipantAndCombatSignalSubController.ts';
import {
  enterPodiumAndResetEndgameAudio,
  focusLocalPlayerCarInArenaAndCamera,
  isLocalReplayOrRewinderBlockingLivePhysics,
  resetGoalReplayIncidentFlags,
  retainHostMatchReplayAfterEnd,
  teardownSignalReplayAndPodiumSession,
} from './signalWorldTransitionPipeline.ts';

export const WIN_REASON_LABELS: Readonly<Record<number, string>> = Object.freeze({
  0: 'SCORE',
  1: 'POSSESSION',
  2: 'FORFEIT',
});

export class RuntimeSignalDomainSubController {
  public readonly context: RuntimeSignalHostPort;
  public readonly latch: RuntimeSignalLatchState;
  public readonly participantAndCombat: RuntimeParticipantAndCombatSignalSubController;
  public readonly goalReplaySubController: RuntimeGoalReplaySignalSubController;

  constructor(context: RuntimeSignalHostPort, latch: RuntimeSignalLatchState) {
    this.context = context;
    this.latch = latch;
    this.participantAndCombat = new RuntimeParticipantAndCombatSignalSubController(context);
    this.goalReplaySubController = new RuntimeGoalReplaySignalSubController(
      context,
      latch,
      this.participantAndCombat
    );
  }

  public reset(): void {
    this.goalReplaySubController.reset();
  }

  public handleRosterSignal(reconciler: PredictionReconciler, sig: RuntimeSignalPacket): boolean {
    return this.participantAndCombat.handleRosterSignal(reconciler, sig);
  }

  public handleClockAndPauseSignal(
    sig: RuntimeSignalPacket,
    currentTick: number,
    audio: SignalAudioFacadeLike | null | undefined,
    reconciler?: PredictionReconciler | null
  ): boolean {
    const ctx = this.context;
    const matchState = ctx.match?.state;
    const physics = ctx.physics;
    const muteSignalAudio = isSignalAudioMutedInGoalReplay(ctx);
    switch (sig.signalType) {
      case MATCH_SIGNALS.SYS_CTRL_STATE_ONLY: {
        const isLocalControllerActive = isLocalReplayOrRewinderBlockingLivePhysics(ctx.modeManager);
        reconciler?.setReplayPlaybackMode?.(true);
        if (!isLocalControllerActive) {
          physics?.setSimulationFrozen?.(true, 0, true);
          if (matchState) matchState.paused = true;
        }
        return true;
      }
      case MATCH_SIGNALS.SYS_CTRL_INTERVENE_WILL_RESUME: {
        const isLocalControllerActive = isLocalReplayOrRewinderBlockingLivePhysics(ctx.modeManager);
        const targetTick = sig.param1 ?? currentTick;
        const countdownSec =
          sig.param2 && sig.param2 > 0
            ? sig.param2
            : Math.max(1, Math.ceil(Math.max(0, targetTick - currentTick) / 120));
        reconciler?.setReplayPlaybackMode?.(true);
        reconciler?.setKickoffMaskUntilTick?.(targetTick);
        if (!isLocalControllerActive) {
          physics?.setSimulationFrozen?.(true, 0, true);
          if (matchState) {
            matchState.paused = true;
            matchState.countdown = countdownSec;
          }
        } else if (matchState) {
          matchState.countdown = countdownSec;
        }
        hudStore.getState().setMatchState({ kickoffCountdown: countdownSec });
        return true;
      }
      case MATCH_SIGNALS.SYS_CTRL_PHYSICS_RESUME: {
        reconciler?.setReplayPlaybackMode?.(false);
        reconciler?.setKickoffMaskUntilTick?.(-1);
        physics?.setSimulationFrozen?.(false, 0, false);
        if (sig.param2 === 1) {
          physics?.setUnlimitedBoost?.(true);
        }
        if (matchState) {
          matchState.paused = false;
          matchState.countdown = 0;
          if (matchState.phase === 'paused' || matchState.phase === 'replay') {
            matchState.phase = 'playing';
          }
        }
        hudStore.getState().setMatchState({
          isPaused: false,
          kickoffCountdown: 0,
          matchPhase: matchState?.phase || 'playing',
        });
        return true;
      }
      case MATCH_SIGNALS.TIME_ALERT_60S: {
        const frameId = sig.frameId ?? -1;
        if (this.latch.lastAlert60Frame !== frameId) {
          this.latch.lastAlert60Frame = frameId;
          if (!muteSignalAudio) audio?.play('match_60_seconds_left', 1.0, 10000);
        }
        return true;
      }
      case MATCH_SIGNALS.TIME_ALERT_30S: {
        const frameId = sig.frameId ?? -1;
        if (this.latch.lastAlert30Frame !== frameId) {
          this.latch.lastAlert30Frame = frameId;
          if (!muteSignalAudio) audio?.play('match_30_seconds_left', 1.0, 10000);
        }
        return true;
      }
      case MATCH_SIGNALS.COUNTDOWN_10S: {
        const sec = sig.param1 ?? 0;
        const audioSubsystem = ctx.audioSubsystem;
        if (sec >= 1 && sec <= 10 && audioSubsystem?.last10sCountdown !== sec) {
          if (audioSubsystem) audioSubsystem.last10sCountdown = sec;
          if (!muteSignalAudio) audio?.play('match_countdown_10s', 1.0);
        }
        return true;
      }
      case MATCH_SIGNALS.CLOCK_UPDATED_SECONDS: {
        const seconds = sig.param1 ?? 0;
        const isOt = (sig.param2 || 0) === 1;
        if (!isOt && matchState?.overtime && (matchState.phase === 'kickoff' || seconds === 0)) {
          return true;
        }
        const remSec = isOt ? 0 : seconds;
        const otSec = isOt ? seconds : 0;
        if (matchState) {
          matchState.remainingSeconds = remSec;
          matchState.overtime = isOt;
          matchState.overtimeSeconds = otSec;
        }
        hudStore
          .getState()
          .setMatchState({ remainingSeconds: remSec, isOvertime: isOt, overtimeSeconds: otSec });
        return true;
      }
      case MATCH_SIGNALS.MATCH_PAUSED: {
        if (matchState) matchState.paused = true;
        hudStore.getState().setMatchState({ isPaused: true, matchPhase: 'paused' });
        return true;
      }
      case MATCH_SIGNALS.MATCH_WILL_RESUME: {
        const remTicks = Math.max(0, (sig.param1 ?? 0) - currentTick);
        hudStore
          .getState()
          .setMatchState({ isPaused: true, kickoffCountdown: Math.ceil(remTicks / 120) });
        return true;
      }
      case MATCH_SIGNALS.MATCH_RESUMED: {
        if (matchState) {
          matchState.paused = false;
          if (matchState.phase === 'paused') matchState.phase = 'playing';
        }
        hudStore.getState().setMatchState({
          isPaused: false,
          matchPhase: matchState?.phase || 'playing',
          kickoffCountdown: 0,
        });
        return true;
      }
      case MATCH_SIGNALS.OVERTIME_START: {
        if (matchState) {
          matchState.overtime = true;
          matchState.overtimeSeconds = 0;
        }
        hudStore.getState().setMatchState({ isOvertime: true, overtimeSeconds: 0 });
        if (!this.latch.overtimeAudioPlayed && !muteSignalAudio) {
          this.latch.overtimeAudioPlayed = true;
          audio?.play('match_entering_overtime', 1.0, 10000);
        }
        return true;
      }
      default:
        return false;
    }
  }

  public handleGoalReplayAndEndgameSignal(
    reconciler: PredictionReconciler,
    sig: RuntimeSignalPacket,
    isFirstSeenSignalId: boolean,
    audio: SignalAudioFacadeLike | null | undefined,
    onResetSignalState?: () => void
  ): boolean {
    if (this.goalReplaySubController.handleSignal(reconciler, sig, isFirstSeenSignalId, audio)) {
      return true;
    }

    const ctx = this.context;
    const matchState = ctx.match?.state;
    const arena = ctx.arena;
    switch (sig.signalType) {
      case MATCH_SIGNALS.BALL_RESET: {
        ctx.physics?.resetGoalLatch?.();
        arena?.resetBallTrail?.();
        teardownSignalReplayAndPodiumSession(ctx, { exitPodium: true });
        this.latch.lastKickoffTargetFrame = -1;
        this.latch.latchedKickoffSeconds.clear();
        reconciler.setKickoffMaskUntilTick?.(-1);
        if (matchState) {
          matchState.phase = 'playing';
          matchState.countdown = 0;
        }
        hudStore.getState().setMatchState({ matchPhase: 'playing', kickoffCountdown: 0 });
        return true;
      }

      case MATCH_SIGNALS.MATCH_DESTROYED: {
        resetGoalReplayIncidentFlags(ctx);
        reconciler.setMatchTelemetryActive?.(false, false);
        reconciler.setKickoffMaskUntilTick?.(-1);
        teardownSignalReplayAndPodiumSession(ctx, { exitPodium: true });
        onResetSignalState?.();
        return true;
      }

      case MATCH_SIGNALS.MATCH_ENDED:
      case MATCH_SIGNALS.PODIUM_START: {
        if (arena?.isLobbyMode || matchState?.phase === 'lobby' || reconciler.lobbyDualWorldMode) {
          return true;
        }
        resetGoalReplayIncidentFlags(ctx);
        const winningTeam = sig.param1 ?? 0;
        const winReasonCode = sig.param2 || 0;
        const winnerName = winningTeam === 0 ? 'BLUE' : winningTeam === 1 ? 'ORANGE' : 'DRAW';
        const winReason = WIN_REASON_LABELS[winReasonCode] || 'SCORE';
        const isPodiumStart = sig.signalType === MATCH_SIGNALS.PODIUM_START;
        const targetPhase = isPodiumStart ? 'podium' : 'ended';
        const wasNotEnded = matchState?.phase !== 'ended' && matchState?.phase !== 'podium';

        reconciler.setReplayPlaybackMode?.(false);
        reconciler.setKickoffMaskUntilTick?.(-1);
        teardownSignalReplayAndPodiumSession(ctx);
        focusLocalPlayerCarInArenaAndCamera(reconciler, ctx);
        if (matchState) {
          matchState.phase = targetPhase;
          matchState.winner = winnerName;
          matchState.winReason = winReason;
        }
        hudStore
          .getState()
          .setMatchState({ matchPhase: targetPhase, winner: winnerName, winReason });
        retainHostMatchReplayAfterEnd(ctx, this.latch, winningTeam, winReasonCode);
        enterPodiumAndResetEndgameAudio(ctx, reconciler, isPodiumStart, winningTeam, winReason);
        if (wasNotEnded) audio?.play('endgame', 1.0);
        return true;
      }

      default:
        return false;
    }
  }
}
