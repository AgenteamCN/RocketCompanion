import { BaseGameMode, type GameModeRuntimePort } from './BaseGameMode.ts';
import { hudStore, useAppStore } from '../runtimeUiPort.ts';
import { audioConfig } from '../../ui-core/config/audioConfig.ts';
import { ReplayTimelineController } from '../../replay/ReplayTimelineController.ts';
import { PodiumCelebrationController } from './PodiumCelebrationController.ts';
import {
  endGoalReplaySession,
  type GoalReplayCameraMode,
} from './shared/GoalReplaySessionCoordinator.ts';
import { stepNetworkStreamedGoalReplayFrame } from './shared/networkStreamedGoalReplayCoordinator.ts';
import type { FrameContext } from '../pipeline/FramePipeline.ts';

/**
 * BotMatchMode.ts
 * Competitive match mode with authoritative match rules, 256MB WASM Replay Timeline Scrubbing,
 * Goal Replay highlight camera, and Post-Match Podium Showcase celebrations.
 */
export class BotMatchMode extends BaseGameMode<GameModeRuntimePort> {
  public replayController: ReplayTimelineController;
  public podiumController: PodiumCelebrationController;
  public replayCameraMode: GoalReplayCameraMode = 'director';
  public replayPovCarIndex: number | null = null;

  constructor(runtime: GameModeRuntimePort) {
    super('match', runtime);
    this.replayController = new ReplayTimelineController({ engine: runtime?.physics || null });
    this.podiumController = new PodiumCelebrationController(runtime);
    if (runtime) {
      runtime.replayTimelineController = this.replayController;
      runtime.podiumController = this.podiumController;
    }
  }

  private _ensureControllers(): void {
    const r = this.runtime;
    if (!r) return;
    if (r.physics && this.replayController.engine !== r.physics) {
      this.replayController.attach(r.physics);
    }
    if (!r.replayTimelineController) {
      r.replayTimelineController = this.replayController;
    }
    if (!r.podiumController) {
      r.podiumController = this.podiumController;
    }
  }

  public override update(context: FrameContext): void {
    const r = this.runtime;
    const { playerCarView } = context;
    this._ensureControllers();

    const phase = r.match?.state?.phase || 'playing';

    const continueOnBlur = audioConfig.get('continueAudioOnLostFocus');
    const isHidden = typeof document !== 'undefined' && (!document.hasFocus() || document.hidden);
    const shouldPauseOnHidden = !continueOnBlur && isHidden;
    const blockingOverlays = Array.from(r.openOverlays ?? []).filter((n) => n !== 'trajectory');
    const hasBlockingOverlay = blockingOverlays.length > 0;
    const isTrajectoryOnly = Boolean(r.openOverlays?.has('trajectory')) && !hasBlockingOverlay;

    const isMenuOpen = useAppStore ? useAppStore.getState().isOpen : false;
    const isOnlineSession = Boolean(useAppStore?.getState?.()?.onlineSession?.roomId);
    const isBotPaused = Boolean(r.botCoordinator?.isBotPaused ?? r.isBotPaused);
    const shouldPauseMatch = Boolean(
      !isOnlineSession &&
      ((r.isCursorBrowsing && !isTrajectoryOnly) ||
        hasBlockingOverlay ||
        shouldPauseOnHidden ||
        isBotPaused ||
        isMenuOpen)
    );

    if (!isOnlineSession && r.match?.state && shouldPauseMatch !== r.match.state.paused) {
      r.match.state.paused = shouldPauseMatch;
      if (r.authoritativeServer) {
        r.authoritativeServer.pauseMatch(shouldPauseMatch);
      }
    }

    if (phase === 'replay') {
      stepNetworkStreamedGoalReplayFrame({
        runtime: r,
        replayController: this.replayController,
        context,
        source: 'bot-match-goal-replay',
        isUnlimitedBoost: false,
        syncCarAudioControls: false,
        syncBoostToHud: false,
        getCameraMode: () => this.replayCameraMode || 'director',
        setCameraMode: (nextMode) => {
          this.replayCameraMode = nextMode;
        },
        getScoringTeam: () => this.replayController.sessionState.scoringTeam ?? 0,
        getScorerCarIndex: () => this.replayController.sessionState.scorerCarIndex ?? 0,
        getPovCarIndex: () => this.replayPovCarIndex,
        setPovCarIndex: (carIdx) => {
          this.replayPovCarIndex = carIdx;
        },
      });
    } else if (
      this.replayController.sessionState.isActive ||
      r.isGoalReplayCameraOverrideActive?.()
    ) {
      endGoalReplaySession(r, this.replayController, {
        source: 'bot-match-goal-replay',
        clearHud: true,
        restoreLocalCarFocus: true,
        fallbackLocalCarIndex: 0,
        syncAfterEnd: true,
      });
      this.replayCameraMode = 'director';
      this.replayPovCarIndex = null;
    }

    if (phase === 'podium') {
      if (!this.podiumController.isActive) {
        this.podiumController.enterPodium(
          r.match?.state?.winner ?? 0,
          r.match?.state?.winReason || 'SCORE'
        );
      }
      this.podiumController.update(context);
    } else if (this.podiumController.isActive && phase !== 'ended') {
      this.podiumController.exitPodium();
    }

    if (playerCarView) {
      const activeCarIdx = context.activeCar ?? r?.playerCarIndex ?? 0;
      const isUnlimited = r?.physics?.getCarUnlimitedBoost?.(activeCarIdx) ?? false;
      hudStore.getState().setBoost(playerCarView.boost, playerCarView.isBoosting, isUnlimited);
    }
  }

  public override onLeave(): void {
    const r = this.runtime;
    endGoalReplaySession(r, this.replayController, {
      clearHud: false,
      restoreLocalCarFocus: true,
    });
    this.replayCameraMode = 'director';
    this.replayPovCarIndex = null;
    this.podiumController?.exitPodium?.();
  }

  public override onResetKickoff(seed = -1): void {
    const r = this.runtime;
    endGoalReplaySession(r, this.replayController, { clearHud: false });
    this.podiumController?.exitPodium?.();
    r.physics?.resetKickoff?.(seed);

    if (r.authoritativeServer) {
      r.authoritativeServer.sim?.resetKickoff?.(seed);
      r.authoritativeServer.sim?.pollGoal?.();
      r.authoritativeServer.clientInputBuffer?.clear?.();
      r.authoritativeServer.lastReceivedControls?.clear?.();
    }
    if (r.networkReconciler && r.physics) {
      const sSnap = r.authoritativeServer
        ? r.authoritativeServer.sim.saveCompactState()
        : r.physics.saveCompactState();
      const sTick = r.authoritativeServer
        ? Math.floor(r.authoritativeServer.sim.getHeaderView().tickCount)
        : 0;
      r.networkReconciler.syncTimeline(sSnap, sTick);
    }

    this.resetKickoffPresentationAndAudio({ resetCamera: true, resetBots: true });
  }
}
