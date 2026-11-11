import { MATCH_SIGNALS } from '../../network/protocol/GlobalPayloadCodec.ts';
import { CLIENT_COMMAND_TYPES } from '../../physics/RocketSimConstants.ts';
import { isSignalAudioMutedInGoalReplay } from '../../audio/SignalAudioEngine.ts';
import { useAppStore, hudStore } from '../runtimeUiPort.ts';
import { dismissHostLobbyOngoingNotification } from './OnlineRosterSyncCoordinator.ts';
import { clearRetainedMatchReplayOnMatchStart } from '../../replay/ReplayFileExporter.ts';
import type { PredictionReconciler } from '../../network/client/PredictionReconciler.ts';
import type {
  RuntimeSignalHostPort,
  RuntimeSignalLatchState,
  RuntimeSignalPacket,
  SignalAudioFacadeLike,
} from './RuntimeGoalReplaySignalSubController.ts';
import {
  exitLobbyDualWorldAndActivateMatchMode,
  focusLocalPlayerCarInArenaAndCamera,
  isKickoffTransitioningFromReplay,
  preparePhysicsReplayRecordingForMatch,
  pushMatchPrepareSignalToPhysicsBuffer,
  resetCameraViewIfInvalidOrWasInReplay,
  resetGoalReplayIncidentFlags,
  syncMatchParticipantsInLocalWorld,
  teardownSignalReplayAndPodiumSession,
} from './signalWorldTransitionPipeline.ts';

export interface KickoffSignalStepContext {
  packetServerTick: number | null;
  currentTick: number;
  isFirstSeenSignalId: boolean;
  hasKickoffStartInBatch: boolean;
  audio: SignalAudioFacadeLike | null | undefined;
}

/**
 * RuntimeKickoffSignalSubController
 * Stateful SubController owning MATCH_INITIALIZED, MATCH_PREPARE, MATCH_STARTED,
 * KICKOFF_WILL_START, and KICKOFF_START signal transitions and participant slot sync.
 */
export class RuntimeKickoffSignalSubController {
  public readonly context: RuntimeSignalHostPort;
  public readonly latch: RuntimeSignalLatchState;

  constructor(context: RuntimeSignalHostPort, latch: RuntimeSignalLatchState) {
    this.context = context;
    this.latch = latch;
  }

  public ensureMatchParticipantsInLocalWorld(reconciler: PredictionReconciler | null): void {
    syncMatchParticipantsInLocalWorld(this.context, reconciler);
  }

  private resetTelemetryAndReplayForNewMatch(reconciler: PredictionReconciler): void {
    const ctx = this.context;
    const latchWithResolved = this.latch as RuntimeSignalLatchState & {
      lastResolvedKickoffTargetFrame?: number;
    };
    dismissHostLobbyOngoingNotification();
    if (ctx.authoritativeServer) {
      clearRetainedMatchReplayOnMatchStart();
      this.latch.hostMatchReplayNotified = false;
    }
    ctx.markNetworkTelemetryNotified(false);
    this.latch.overtimeAudioPlayed = false;
    this.latch.lastKickoffTargetFrame = -1;
    this.latch.lastKickoffStartedFrame = -1;
    latchWithResolved.lastResolvedKickoffTargetFrame = -1;
    this.latch.latchedKickoffSeconds.clear();
    ctx.despawnDiagnosticTestFleet();
    reconciler.setLobbyDualWorldMode?.(false);
    reconciler.setReplayPlaybackMode?.(false);
    reconciler.setMatchTelemetryActive?.(true, true);
    reconciler.resetTimelineState?.(true);
  }

  public handleSignal(
    reconciler: PredictionReconciler,
    sig: RuntimeSignalPacket,
    stepCtx: KickoffSignalStepContext
  ): { handled: boolean; currentTick: number } {
    const ctx = this.context;
    const matchState = ctx.match?.state;
    let { currentTick } = stepCtx;
    const { packetServerTick, isFirstSeenSignalId, hasKickoffStartInBatch, audio } = stepCtx;

    switch (sig.signalType) {
      case MATCH_SIGNALS.MATCH_INITIALIZED: {
        const durationSec = typeof sig.param2 === 'number' && sig.param2 >= 0 ? sig.param2 : 300;
        if (matchState) {
          matchState.durationSeconds = durationSec;
        }
        return { handled: true, currentTick };
      }

      case MATCH_SIGNALS.MATCH_PREPARE: {
        const matchSeq = sig.param1 || 1;
        this.resetTelemetryAndReplayForNewMatch(reconciler);
        if (packetServerTick === null) currentTick = 0;
        preparePhysicsReplayRecordingForMatch(ctx, { clearBuffer: true, resetBallTrail: true });
        pushMatchPrepareSignalToPhysicsBuffer(ctx, sig, currentTick);
        resetGoalReplayIncidentFlags(ctx, true);
        teardownSignalReplayAndPodiumSession(ctx);
        this.ensureMatchParticipantsInLocalWorld(reconciler);
        exitLobbyDualWorldAndActivateMatchMode(ctx);
        if (matchState) {
          matchState.mode = 'match';
          matchState.phase = 'prepare';
          matchState.paused = false;
          matchState.overtime = false;
        }
        hudStore.getState().setMatchState({
          matchPhase: 'prepare',
          kickoffCountdown: 0,
          isOvertime: false,
          winner: null,
          winReason: null,
        });

        if (this.latch.lastPreparedMatchSeq !== matchSeq) {
          this.latch.lastPreparedMatchSeq = matchSeq;
          reconciler.controlMessenger.enqueueClientCommand(
            CLIENT_COMMAND_TYPES.CMD_ARENA_LOADED_ACK,
            matchSeq,
            1
          );
        }
        return { handled: true, currentTick };
      }

      case MATCH_SIGNALS.MATCH_STARTED: {
        this.resetTelemetryAndReplayForNewMatch(reconciler);
        if (packetServerTick === null) currentTick = 0;
        preparePhysicsReplayRecordingForMatch(ctx, { clearBuffer: true });
        resetGoalReplayIncidentFlags(ctx, true);
        teardownSignalReplayAndPodiumSession(ctx);
        this.ensureMatchParticipantsInLocalWorld(reconciler);
        exitLobbyDualWorldAndActivateMatchMode(ctx);
        const durationSec =
          typeof sig.param1 === 'number' && Number.isFinite(sig.param1) && sig.param1 >= 0
            ? sig.param1
            : 300;
        if (matchState) {
          matchState.mode = 'match';
          matchState.blueScore = 0;
          matchState.orangeScore = 0;
          matchState.remainingSeconds = durationSec;
          matchState.overtime = false;
          matchState.overtimeSeconds = 0;
          matchState.winner = null;
        }
        hudStore.getState().setMatchState({
          blueScore: 0,
          orangeScore: 0,
          remainingSeconds: durationSec,
          isOvertime: false,
          overtimeSeconds: 0,
          winner: null,
          winReason: null,
        });
        return { handled: true, currentTick };
      }

      case MATCH_SIGNALS.KICKOFF_WILL_START: {
        if (hasKickoffStartInBatch) {
          return { handled: true, currentTick };
        }
        const latchWithResolved = this.latch as RuntimeSignalLatchState & {
          lastResolvedKickoffTargetFrame?: number;
        };
        const targetFrame = sig.param1 ?? 0;
        const resolvedTargetFrame = latchWithResolved.lastResolvedKickoffTargetFrame ?? -1;
        if (
          targetFrame > 0 &&
          (targetFrame <= resolvedTargetFrame ||
            (this.latch.lastKickoffStartedFrame > 0 &&
              targetFrame <= this.latch.lastKickoffStartedFrame))
        ) {
          return { handled: true, currentTick };
        }
        const isOvertimeKickoff = sig.param2 === 1 || Boolean(matchState?.overtime);
        const isNewKickoffPhase =
          targetFrame > 0
            ? this.latch.lastKickoffTargetFrame !== targetFrame
            : isFirstSeenSignalId || this.latch.lastKickoffTargetFrame !== targetFrame;
        const effectiveTick =
          typeof packetServerTick === 'number' && packetServerTick >= 0
            ? packetServerTick
            : typeof sig.frameId === 'number' && isNewKickoffPhase
              ? sig.frameId
              : currentTick;
        if (targetFrame > 0 && effectiveTick >= targetFrame) {
          latchWithResolved.lastResolvedKickoffTargetFrame = Math.max(
            resolvedTargetFrame,
            targetFrame
          );
          this.latch.lastKickoffTargetFrame = -1;
          this.latch.latchedKickoffSeconds.clear();
          reconciler.setKickoffMaskUntilTick?.(-1);
          if (matchState && matchState.phase !== 'playing') {
            reconciler.setLobbyDualWorldMode?.(false);
            reconciler.setReplayPlaybackMode?.(false);
            teardownSignalReplayAndPodiumSession(ctx, {
              exitPodium: true,
              resetCameraIfWasInReplay: true,
            });
            exitLobbyDualWorldAndActivateMatchMode(ctx);
            matchState.mode = 'match';
            matchState.phase = 'playing';
            matchState.paused = false;
            matchState.countdown = 0;
            if (isOvertimeKickoff) {
              matchState.overtime = true;
            }
            hudStore.getState().setMatchState({
              matchPhase: 'playing',
              kickoffCountdown: 0,
              ...(isOvertimeKickoff ? { isOvertime: true } : {}),
            });
          }
          return { handled: true, currentTick };
        }
        if (!isNewKickoffPhase && matchState?.phase === 'playing') {
          return { handled: true, currentTick };
        }
        let wasInReplay = false;
        if (isNewKickoffPhase) {
          wasInReplay = isKickoffTransitioningFromReplay(ctx);
          dismissHostLobbyOngoingNotification();
          ctx.despawnDiagnosticTestFleet();
          reconciler.setLobbyDualWorldMode?.(false);
          reconciler.setReplayPlaybackMode?.(false);
          if (!reconciler.telemetryCollector.isMatchTelemetryActive) {
            reconciler.setMatchTelemetryActive?.(true, false);
          }
          preparePhysicsReplayRecordingForMatch(ctx);
          this.ensureMatchParticipantsInLocalWorld(reconciler);
          teardownSignalReplayAndPodiumSession(ctx, { exitPodium: true });
          resetCameraViewIfInvalidOrWasInReplay(ctx, wasInReplay);
          exitLobbyDualWorldAndActivateMatchMode(ctx);
          hudStore.getState().setReplayState?.({
            replayPaused: false,
            replayPersistent: false,
          });
        } else {
          useAppStore.getState().setMatchMode('match');
        }
        reconciler.setKickoffMaskUntilTick?.(targetFrame);

        const remainingTicks = Math.max(0, targetFrame - effectiveTick);
        const rawDisplaySec = Math.max(1, Math.min(3, Math.ceil(remainingTicks / 120)));
        const prevSec =
          !isNewKickoffPhase &&
          matchState?.phase === 'kickoff' &&
          typeof matchState.countdown === 'number' &&
          matchState.countdown >= 1
            ? matchState.countdown
            : 3;
        const displaySec = isNewKickoffPhase ? rawDisplaySec : Math.min(prevSec, rawDisplaySec);

        if (matchState) {
          matchState.mode = 'match';
          matchState.phase = 'kickoff';
          matchState.paused = false;
          matchState.countdown = displaySec;
          if (isOvertimeKickoff) {
            matchState.overtime = true;
          }
        }

        hudStore.getState().setMatchState({
          matchPhase: 'kickoff',
          kickoffCountdown: displaySec,
          ...(isOvertimeKickoff ? { isOvertime: true } : {}),
        });

        if (isNewKickoffPhase) {
          this.latch.lastKickoffTargetFrame = targetFrame;
          this.latch.latchedKickoffSeconds.clear();
          ctx.resetBotKickoffStep();
          reconciler.resetTimelineState?.(!wasInReplay);
        }

        const muteSignalInReplay = isSignalAudioMutedInGoalReplay(ctx);
        if (isOvertimeKickoff && !this.latch.overtimeAudioPlayed && !muteSignalInReplay) {
          this.latch.overtimeAudioPlayed = true;
          audio?.play('match_entering_overtime', 1.0, 10000);
        }

        if (
          !muteSignalInReplay &&
          remainingTicks <= 360 &&
          remainingTicks > 240 &&
          !this.latch.latchedKickoffSeconds.has(3)
        ) {
          this.latch.latchedKickoffSeconds.add(3);
          audio?.play('match_countdown_321', 1.0);
        } else if (
          !muteSignalInReplay &&
          remainingTicks <= 240 &&
          remainingTicks > 120 &&
          !this.latch.latchedKickoffSeconds.has(2)
        ) {
          this.latch.latchedKickoffSeconds.add(2);
          audio?.play('match_countdown_321', 1.0);
        } else if (
          !muteSignalInReplay &&
          remainingTicks <= 120 &&
          remainingTicks > 0 &&
          !this.latch.latchedKickoffSeconds.has(1)
        ) {
          this.latch.latchedKickoffSeconds.add(1);
          audio?.play('match_countdown_321', 1.0);
        }
        return { handled: true, currentTick };
      }

      case MATCH_SIGNALS.KICKOFF_START: {
        reconciler.setLobbyDualWorldMode?.(false);
        reconciler.setReplayPlaybackMode?.(false);
        if (!reconciler.telemetryCollector.isMatchTelemetryActive) {
          reconciler.setMatchTelemetryActive?.(true, false);
        }
        preparePhysicsReplayRecordingForMatch(ctx);
        teardownSignalReplayAndPodiumSession(ctx, {
          exitPodium: true,
          resetCameraIfWasInReplay: true,
        });
        focusLocalPlayerCarInArenaAndCamera(reconciler, ctx);
        hudStore.getState().setReplayState?.({
          replayPaused: false,
          replayPersistent: false,
        });
        reconciler.setKickoffMaskUntilTick?.(-1);
        ctx.resetBotKickoffStep();

        const frameId = sig.frameId ?? -1;
        const latchWithResolved = this.latch as RuntimeSignalLatchState & {
          lastResolvedKickoffTargetFrame?: number;
        };
        const isNewKickoffStart =
          this.latch.lastKickoffStartedFrame !== frameId || isFirstSeenSignalId;
        latchWithResolved.lastResolvedKickoffTargetFrame = Math.max(
          latchWithResolved.lastResolvedKickoffTargetFrame ?? -1,
          this.latch.lastKickoffTargetFrame,
          frameId
        );
        this.latch.lastKickoffStartedFrame = frameId;
        this.latch.lastKickoffTargetFrame = -1;
        this.latch.latchedKickoffSeconds.clear();

        if (matchState) {
          matchState.phase = 'playing';
          matchState.countdown = 0;
        }
        hudStore.getState().setMatchState({
          matchPhase: 'playing',
          kickoffCountdown: 0,
        });
        if (isNewKickoffStart && !isSignalAudioMutedInGoalReplay(ctx)) {
          audio?.play('match_start_go', 1.0);
        }
        return { handled: true, currentTick };
      }

      default:
        return { handled: false, currentTick };
    }
  }
}
