import { MATCH_SIGNALS } from '../../../physics/RocketSimConstants.ts';
import { REPLAY_BUFFER_MODES, ReplayRingBuffer } from '../../../replay/ReplayRingBuffer.ts';
import { ReplayTimelineController } from '../../../replay/ReplayTimelineController.ts';
import {
  extractGoalReplayFrames,
  resolveGoalReplayWindowBounds,
} from '../../../replay/ReplayPlaybackState.ts';
import { useSubsystemIsolationLabStore } from '../../runtimeUiPort.ts';
import { gameAudio } from '../../../audio/GameAudioEngineFacade.ts';
import {
  beginGoalReplaySession,
  endGoalReplaySession,
  stepGoalReplaySessionFrame,
} from '../shared/GoalReplaySessionCoordinator.ts';
import type {
  LabAudioPort,
  LabFrameUpdateContext,
  LabTabContext,
  LabTabController,
} from './LabTabTypes.ts';
import {
  type GoalReplayBenchScenario,
  type ReplayExportPayload,
  applyInstantKickoffGoalScenario,
  applyNormalPlayGoalScenario,
  isGoalBallScoredInLab,
} from './goalReplayScenariosPipeline.ts';
import {
  GoalReplayPodiumSubController,
  resetGoalReplayBenchArenaAndPhysics,
  resetGoalReplayLiveKickoff,
} from './GoalReplayPodiumSubController.ts';

export class GoalReplayLabTab implements LabTabController {
  readonly tabId = 'goal-replay' as const;
  private ctx: LabTabContext | null = null;
  private ringBuffer: ReplayRingBuffer | null = null;
  private timelineCtrl: ReplayTimelineController | null = null;
  private readonly podiumSubController = new GoalReplayPodiumSubController();
  private lastKickoffFrame = 0;
  private incidentFrame = 0;
  private postGoalCountdownTicks = 0;
  private scoringTeam = 0;
  private phase = 'live';

  attachToHost(ctx: LabTabContext): void {
    this.ctx = ctx;
  }

  onActivate(ctx: LabTabContext): void {
    this.ctx = ctx;
    this.ensureBenchState();
    this.setupBench();
  }

  onDeactivate(): void {
    this.podiumSubController.exitIfActive();
    if (this.timelineCtrl?.sessionState?.isActive) this.timelineCtrl.endReplaySession();
    this.phase = 'live';
    this.postGoalCountdownTicks = 0;
  }

  isPodiumActive(): boolean {
    return this.podiumSubController.isActive;
  }

  private getAudio(): LabAudioPort | null {
    return this.ctx?.runtime?.options?.gameAudio || (gameAudio as unknown as LabAudioPort);
  }

  ensureBenchState(): void {
    const r = this.ctx?.runtime;
    if (!this.ringBuffer) {
      this.ringBuffer = new ReplayRingBuffer({ mode: REPLAY_BUFFER_MODES.COUNTDOWN_MATCH });
    }
    if (!this.timelineCtrl) {
      this.timelineCtrl = new ReplayTimelineController({
        engine: r?.physics || null,
        ringBuffer: this.ringBuffer,
      });
    } else if (r?.physics && this.timelineCtrl.engine !== r.physics) {
      this.timelineCtrl.attach(r.physics, this.ringBuffer);
    }
    if (r) {
      this.podiumSubController.ensureController(r);
      if (!r.replayTimelineController) r.replayTimelineController = this.timelineCtrl;
    }
  }

  setupBench(): void {
    const r = this.ctx?.runtime;
    if (!r?.physics) return;
    const store = useSubsystemIsolationLabStore.getState();

    this.ensureBenchState();
    this.podiumSubController.exitIfActive();
    const currentTick = resetGoalReplayBenchArenaAndPhysics(r);

    this.ringBuffer!.configureMode(REPLAY_BUFFER_MODES.COUNTDOWN_MATCH);
    this.timelineCtrl!.endReplaySession();

    this.lastKickoffFrame = currentTick;
    this.incidentFrame = 0;
    this.postGoalCountdownTicks = 0;
    this.scoringTeam = 0;
    this.phase = 'live';

    this.ringBuffer!.recordFrame(currentTick, r.physics.state, [
      { signalType: MATCH_SIGNALS.KICKOFF_WILL_START, frameId: currentTick, param1: 0, param2: 0 },
    ]);
    r.interpolator?.sync?.();

    store.updateLiveTelemetry({
      goalReplayPhase: 'live',
      goalReplayCurrentFrameId: currentTick,
      goalReplayLastKickoffFrameId: currentTick,
      goalReplayIncidentFrameId: 0,
      goalReplayRequestedStartFrameId: currentTick,
      goalReplayEffectiveStartFrameId: currentTick,
      goalReplayEffectiveEndFrameId: currentTick,
      goalReplayClampedByKickoff: false,
      goalReplayPlaybackCursor: 0,
      goalReplayPlaybackTotal: 1,
      goalReplayPaused: false,
      goalReplaySpeed: 1.0,
      goalReplayRecordedBufferCount: this.ringBuffer!.size,
      podiumActive: false,
    });
  }

  triggerGoalIncident(scoringTeam = 0): void {
    const r = this.ctx?.runtime;
    if (!r?.physics) return;
    const store = useSubsystemIsolationLabStore.getState();
    const currentTick = Math.floor(r.physics.getHeaderView?.()?.tickCount || 0);
    this.incidentFrame = currentTick;
    this.scoringTeam = scoringTeam;

    const postGoalSec = Number.isFinite(store.goalReplayPostGoalSec)
      ? store.goalReplayPostGoalSec
      : 3.0;
    const postGoalTicks = Math.max(0, Math.round(postGoalSec * 120));

    this.ringBuffer?.recordFrame(currentTick, r.physics.state, [
      {
        signalType: MATCH_SIGNALS.SCORE_UPDATED,
        frameId: currentTick,
        param1: scoringTeam === 0 ? 1 : 0,
        param2: scoringTeam === 1 ? 1 : 0,
      },
      {
        signalType: MATCH_SIGNALS.GOAL_REPLAY_WILL_START,
        frameId: currentTick,
        param1: postGoalTicks,
        param2: scoringTeam,
      },
    ]);

    const bounds = resolveGoalReplayWindowBounds({
      goalIncidentTick: currentTick,
      lastKickoffWillStartTick: this.lastKickoffFrame,
      lookbackSeconds: store.goalReplayLookbackSec,
      postGoalSeconds: postGoalSec,
      ringBuffer: this.ringBuffer,
    });

    this.getAudio()?.play?.('sfx_goal_poof', 1.0);

    if (postGoalTicks > 0) {
      this.phase = 'post-goal-delay';
      this.postGoalCountdownTicks = postGoalTicks;
    } else {
      this.beginPlayback();
    }

    store.updateLiveTelemetry({
      goalReplayPhase: this.phase,
      goalReplayCurrentFrameId: currentTick,
      goalReplayIncidentFrameId: currentTick,
      goalReplayRequestedStartFrameId: bounds.requestedStartFrame,
      goalReplayEffectiveStartFrameId: bounds.effectiveStartFrame,
      goalReplayEffectiveEndFrameId: bounds.effectiveEndFrame,
      goalReplayClampedByKickoff: bounds.clampedByKickoff,
      goalReplayRecordedBufferCount: this.ringBuffer?.size || 0,
    });
  }

  beginPlayback(): void {
    const r = this.ctx?.runtime;
    if (!r?.physics) return;
    const store = useSubsystemIsolationLabStore.getState();
    this.ensureBenchState();

    const currentTick = Math.floor(r.physics.getHeaderView?.()?.tickCount || 0);
    const incidentTick = this.incidentFrame > 0 ? this.incidentFrame : currentTick;

    const bounds = resolveGoalReplayWindowBounds({
      goalIncidentTick: incidentTick,
      lastKickoffWillStartTick: this.lastKickoffFrame,
      lookbackSeconds: store.goalReplayLookbackSec,
      postGoalSeconds: store.goalReplayPostGoalSec,
      ringBuffer: this.ringBuffer,
    });

    const extracted = extractGoalReplayFrames({
      ringBuffer: this.ringBuffer,
      engine: r.physics,
      goalIncidentTick: incidentTick,
      lastKickoffWillStartTick: this.lastKickoffFrame,
      lookbackSeconds: store.goalReplayLookbackSec,
      postGoalSeconds: store.goalReplayPostGoalSec,
    });

    const totalFrames = this.timelineCtrl!.beginReplaySession({
      scoringTeam: this.scoringTeam || 0,
      frames: extracted,
    });

    this.phase = 'replaying';
    this.postGoalCountdownTicks = 0;
    beginGoalReplaySession(r, this.timelineCtrl, {
      cameraMode: 'director',
      source: 'subsystem-lab-goal-replay',
      syncHud: false,
    });

    store.updateLiveTelemetry({
      goalReplayPhase: 'replaying',
      goalReplayRequestedStartFrameId: bounds.requestedStartFrame,
      goalReplayEffectiveStartFrameId: bounds.effectiveStartFrame,
      goalReplayEffectiveEndFrameId: bounds.effectiveEndFrame,
      goalReplayClampedByKickoff: bounds.clampedByKickoff,
      goalReplayPlaybackCursor: 0,
      goalReplayPlaybackTotal: totalFrames,
      goalReplayPaused: false,
      goalReplaySpeed: 1.0,
    });
  }

  stopPlayback(): void {
    const r = this.ctx?.runtime;
    if (!r?.physics) return;
    const store = useSubsystemIsolationLabStore.getState();

    endGoalReplaySession(r, this.timelineCtrl, {
      source: 'subsystem-lab-goal-replay',
      clearHud: false,
    });
    this.phase = 'live';
    this.postGoalCountdownTicks = 0;

    const currentTick = resetGoalReplayLiveKickoff(r);
    this.lastKickoffFrame = currentTick;
    this.ringBuffer?.recordFrame(currentTick, r.physics.state, [
      { signalType: MATCH_SIGNALS.KICKOFF_WILL_START, frameId: currentTick, param1: 0, param2: 0 },
    ]);
    r.interpolator?.sync?.();

    store.updateLiveTelemetry({
      goalReplayPhase: 'live',
      goalReplayCurrentFrameId: currentTick,
      goalReplayLastKickoffFrameId: currentTick,
      goalReplayPaused: false,
      goalReplayRecordedBufferCount: this.ringBuffer?.size || 0,
    });
  }

  onPhysicsTick(_dt: number): boolean {
    const sim = this.ctx?.runtime?.physics;
    if (!sim) return true;

    this.ensureBenchState();
    if (this.podiumSubController.isActive || this.phase === 'replaying') return false;

    if (this.phase === 'live') {
      const bView = sim.getBallStateView();
      if (isGoalBallScoredInLab(sim, bView)) {
        this.triggerGoalIncident(bView.posY > 0 ? 0 : 1);
      }
    } else if (this.phase === 'post-goal-delay' && this.postGoalCountdownTicks > 0) {
      if (--this.postGoalCountdownTicks <= 0) {
        this.beginPlayback();
        return false;
      }
    }
    return true;
  }

  onAfterPhysicsTick(): void {
    const r = this.ctx?.runtime;
    const store = useSubsystemIsolationLabStore.getState();
    const sim = r?.physics;
    if (!sim || store.activeTab !== 'goal-replay') return;
    if (this.phase !== 'live' && this.phase !== 'post-goal-delay') return;

    const currentTick = Math.floor(sim.getHeaderView?.()?.tickCount || 0);
    this.ringBuffer?.recordFrame(currentTick, sim.state);
    sim.recordReplayFrame?.();

    if (currentTick % 6 === 0) {
      const bounds = resolveGoalReplayWindowBounds({
        goalIncidentTick: this.incidentFrame > 0 ? this.incidentFrame : currentTick,
        lastKickoffWillStartTick: this.lastKickoffFrame,
        lookbackSeconds: store.goalReplayLookbackSec,
        postGoalSeconds: store.goalReplayPostGoalSec,
        ringBuffer: this.ringBuffer,
      });

      store.updateLiveTelemetry({
        goalReplayCurrentFrameId: currentTick,
        goalReplayLastKickoffFrameId: this.lastKickoffFrame || 0,
        goalReplayRequestedStartFrameId: bounds.requestedStartFrame,
        goalReplayEffectiveStartFrameId: bounds.effectiveStartFrame,
        goalReplayEffectiveEndFrameId: bounds.effectiveEndFrame,
        goalReplayClampedByKickoff: bounds.clampedByKickoff,
        goalReplayRecordedBufferCount: this.ringBuffer?.size || 0,
      });
    }
  }

  onRenderFrame(frameCtx: LabFrameUpdateContext): void {
    this.updatePresentation(frameCtx);
  }

  updatePresentation(context: LabFrameUpdateContext): void {
    const r = this.ctx?.runtime;
    const store = useSubsystemIsolationLabStore.getState();
    if (this.podiumSubController.update(context)) return;
    if (store.activeTab !== 'goal-replay') return;

    if (this.phase === 'replaying' && this.timelineCtrl?.sessionState?.isActive) {
      const stepRes = stepGoalReplaySessionFrame({
        runtime: r,
        replayController: this.timelineCtrl,
        context,
        dt: context?.dt ?? 0.016,
        source: 'subsystem-lab-goal-replay',
        cameraMode: 'director',
        scoringTeam: this.scoringTeam || 0,
        scorerCarIndex: 0,
        eventDispatchOptions: { isGoalReplay: true },
        syncCarAudioControls: false,
        syncBoostToHud: false,
        emitWillEndSignal: false,
        syncHudProgress: false,
      });

      const s = this.timelineCtrl.sessionState;
      store.updateLiveTelemetry({
        goalReplayPlaybackCursor: stepRes.frameIndex,
        goalReplayPlaybackTotal: stepRes.totalFrames,
        goalReplayPaused: s.isPaused,
        goalReplaySpeed: s.playbackSpeed,
      });

      if (stepRes.isFinished && !s.isPaused) {
        this.getAudio()?.resetIncidentDebounceState?.();
        this.timelineCtrl.seekToIndex(0, r?.interpolator ?? null);
        s.isScrubbing = false;
        this.timelineCtrl.directorCameraState.initialized = false;
      }
    }
  }

  exportReplayBufferAsJson(): ReplayExportPayload {
    this.ensureBenchState();
    return this.podiumSubController.exportReplayBufferAsJson(this.ctx?.runtime, this.ringBuffer);
  }

  enterPodiumShowcase(winningTeam = 0): void {
    this.ensureBenchState();
    if (
      this.podiumSubController.enterShowcase(
        this.ctx?.runtime,
        winningTeam,
        this.timelineCtrl,
        this.phase === 'replaying'
      )
    ) {
      this.phase = 'podium';
    }
  }

  exitPodiumShowcase(): void {
    if (this.podiumSubController.exitShowcase(this.ctx?.runtime)) this.phase = 'live';
  }

  triggerScenario(scenario: GoalReplayBenchScenario): void {
    const r = this.ctx?.runtime;
    if (!r?.physics) return;
    const store = useSubsystemIsolationLabStore.getState();
    this.ensureBenchState();

    switch (scenario) {
      case 'instant_kickoff_goal': {
        if (this.phase === 'replaying') this.stopPlayback();
        if (this.podiumSubController.isActive) this.exitPodiumShowcase();
        const currentTick = applyInstantKickoffGoalScenario(r.physics, this.ringBuffer);
        this.lastKickoffFrame = currentTick;
        r.interpolator?.sync?.();
        store.updateLiveTelemetry({
          goalReplayPhase: 'live',
          goalReplayLastKickoffFrameId: currentTick,
          goalReplayCurrentFrameId: currentTick,
        });
        break;
      }
      case 'normal_play_goal': {
        if (this.phase === 'replaying') this.stopPlayback();
        if (this.podiumSubController.isActive) this.exitPodiumShowcase();
        applyNormalPlayGoalScenario(r.physics, this.ringBuffer, this.lastKickoffFrame);
        r.interpolator?.sync?.();
        break;
      }
      case 'trigger_goal_now':
        this.triggerGoalIncident(0);
        break;
      case 'emit_kickoff_signal': {
        const currentTick = Math.floor(r.physics.getHeaderView?.()?.tickCount || 0);
        this.lastKickoffFrame = currentTick;
        this.ringBuffer!.recordFrame(currentTick, r.physics.state, [
          {
            signalType: MATCH_SIGNALS.KICKOFF_WILL_START,
            frameId: currentTick,
            param1: 0,
            param2: 0,
          },
        ]);
        store.updateLiveTelemetry({
          goalReplayLastKickoffFrameId: currentTick,
          goalReplayCurrentFrameId: currentTick,
          goalReplayRecordedBufferCount: this.ringBuffer!.size,
        });
        break;
      }
      case 'start_replay_now':
        if (this.incidentFrame <= 0) {
          this.incidentFrame = Math.floor(r.physics.getHeaderView?.()?.tickCount || 0);
        }
        this.beginPlayback();
        break;
      case 'stop_replay':
        this.stopPlayback();
        break;
      case 'clear_replay_buffer':
        this.setupBench();
        break;
      case 'export_replay_json':
        this.exportReplayBufferAsJson();
        break;
      default:
        break;
    }
  }

  togglePause(): void {
    if (!this.timelineCtrl) return;
    useSubsystemIsolationLabStore.getState().updateLiveTelemetry({
      goalReplayPaused: this.timelineCtrl.togglePause(),
    });
  }

  cycleSpeed(): void {
    if (!this.timelineCtrl) return;
    useSubsystemIsolationLabStore.getState().updateLiveTelemetry({
      goalReplaySpeed: this.timelineCtrl.cyclePlaybackSpeed(),
    });
  }

  seekNormalized(progress01: number): void {
    if (!this.timelineCtrl) return;
    this.timelineCtrl.seekToNormalized(progress01, this.ctx?.runtime?.interpolator);
    useSubsystemIsolationLabStore.getState().updateLiveTelemetry({
      goalReplayPlaybackCursor: this.timelineCtrl.currentFrameIndex,
      goalReplayPlaybackTotal: this.timelineCtrl.getTotalRecordedFrames(),
    });
  }
}
