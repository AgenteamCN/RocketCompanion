import { extractGoalReplayFrames } from '../../../replay/ReplayPlaybackState.ts';
import {
  type DirectorCameraTargetPort,
  type DirectorInterpolatorSnapshot,
} from '../../../replay/ReplayDirectorCamera.ts';
import {
  ReplayRingBuffer,
  REPLAY_BUFFER_MODES,
  type ReplayAudioCue,
  type ReplayRecordedIncident,
  type ReplayRingBufferSlot,
} from '../../../replay/ReplayRingBuffer.ts';
import {
  ReplayTimelineController,
  type ReplayTimelineFrameEntry,
} from '../../../replay/ReplayTimelineController.ts';
import type {
  ReplayInterpolatorPort,
  ReplayPhysicsEnginePort,
} from '../../../replay/ReplayDirectorStatePipeline.ts';
import { useStaticTrainingPackStore, hudStore } from '../../runtimeUiPort.ts';
import {
  beginGoalReplaySession,
  endGoalReplaySession,
  stepGoalReplaySessionFrame,
} from '../shared/GoalReplaySessionCoordinator.ts';
import { type StaticTrainingShotConfig } from './ShotGizmoMath.ts';

export const POST_GOAL_CELEBRATION_TICKS = 360;
export const POST_EXPIRE_CELEBRATION_TICKS = 360;
export const POST_GOAL_FREEZE_DELAY_TICKS = 30;
export const EXPIRE_REPLAY_LOOKBACK_TICKS = 1200;

export type StaticTrainingReplayType = 'goal' | 'expire';

export interface StaticTrainingReplayIncidentMeta {
  goalIncidentTick: number;
  lastTouchTick: number;
  lastKickoffStartTick: number;
  goalScoringTeam: number;
  goalScorerCarIndex: number;
  goalScorerName: string;
  goalBallSpeedKph: number | null;
}

export interface StaticTrainingReplayPhysicsPort extends ReplayPhysicsEnginePort {
  getHeaderView?: () => { tickCount?: number } | null;
}

export interface StaticTrainingReplayRuntimePort {
  physics?: StaticTrainingReplayPhysicsPort | null;
  interpolator?: (ReplayInterpolatorPort & DirectorInterpolatorSnapshot) | null;
  camera?: DirectorCameraTargetPort | null;
  match?: { state?: { phase?: string } | null } | null;
  acquireGoalReplayCameraOverride?: (source?: string) => void;
  releaseGoalReplayCameraOverride: (source?: string | null) => void;
}

export interface StaticTrainingReplayVisualsPort {
  setVisible: (visible: boolean) => void;
}

export class StaticTrainingReplayController {
  private readonly runtime: StaticTrainingReplayRuntimePort | null;
  public readonly replayRingBuffer: ReplayRingBuffer & { currentRecordTick?: number };
  public readonly replayController: ReplayTimelineController;

  public isReplayActive = false;
  public replayType: StaticTrainingReplayType = 'goal';
  public replayCameraMode: 'director' | 'pov' = 'director';

  private activeIncidentMeta: StaticTrainingReplayIncidentMeta = {
    goalIncidentTick: -1,
    lastTouchTick: -1,
    lastKickoffStartTick: 0,
    goalScoringTeam: 0,
    goalScorerCarIndex: 0,
    goalScorerName: 'Player',
    goalBallSpeedKph: null,
  };

  constructor(runtime: StaticTrainingReplayRuntimePort | null) {
    this.runtime = runtime;
    this.replayRingBuffer = new ReplayRingBuffer({
      mode: REPLAY_BUFFER_MODES.COUNTDOWN_MATCH,
      capacityTicks: 3600,
    });
    this.replayController = new ReplayTimelineController({
      engine: runtime?.physics || null,
      ringBuffer: this.replayRingBuffer,
    });
  }

  attachPhysicsIfNeeded(): void {
    const sim = this.runtime?.physics;
    if (sim && this.replayController.engine !== sim) {
      this.replayController.attach(sim, this.replayRingBuffer);
    }
  }

  get currentRecordTick(): number {
    return Number(this.replayRingBuffer?.currentRecordTick || 0);
  }

  set currentRecordTick(val: number) {
    if (this.replayRingBuffer) {
      this.replayRingBuffer.currentRecordTick = val;
    }
  }

  clearBuffer(): void {
    this.currentRecordTick = 0;
    this.replayRingBuffer?.clear?.();
  }

  recordFrame(tick: number, state: Float32Array | number[] | null | undefined): void {
    this.currentRecordTick = Math.max(this.currentRecordTick, tick);
    const slot = this.replayRingBuffer?.recordFrame?.(tick, state);
    if (slot?.snapshot) {
      slot.snapshot[0] = tick;
    }
  }

  recordNextTickFrame(state: Float32Array | number[] | null | undefined): number {
    const nextTick = Math.max(1, this.currentRecordTick + 1);
    this.recordFrame(nextTick, state);
    return nextTick;
  }

  appendIncident(tick: number, event: ReplayRecordedIncident | null | undefined): void {
    this.replayRingBuffer?.appendIncident?.(tick, event);
  }

  appendAudioEvent(tick: number, audioEvt: ReplayAudioCue | null | undefined): void {
    this.replayRingBuffer?.appendAudioEvent?.(tick, audioEvt);
  }

  abortSession(): void {
    if (this.isReplayActive) {
      endGoalReplaySession(this.runtime, this.replayController, {
        source: 'static-training-replay',
        clearHud: true,
      });
      this.isReplayActive = false;
    }
  }

  beginSession(
    type: StaticTrainingReplayType,
    incidentMeta: StaticTrainingReplayIncidentMeta,
    onCompleteCallback: () => void
  ): boolean {
    const r = this.runtime;
    const sim = r?.physics;
    if (!sim || !this.replayRingBuffer || this.replayRingBuffer.size === 0) {
      onCompleteCallback();
      return false;
    }

    this.replayType = type;
    this.activeIncidentMeta = { ...incidentMeta };
    const newestBufTick = this.replayRingBuffer.getNewestFrame?.()?.tick ?? 0;
    const currentTick =
      this.currentRecordTick > 0
        ? this.currentRecordTick
        : newestBufTick > 0
          ? newestBufTick
          : Math.floor(sim.getHeaderView?.()?.tickCount ?? 0);
    this.attachPhysicsIfNeeded();

    let extractedFrames: Array<ReplayTimelineFrameEntry | ReplayRingBufferSlot> = [];
    if (type === 'expire') {
      const expireTick =
        incidentMeta.goalIncidentTick > 0 ? incidentMeta.goalIncidentTick : currentTick;
      const startTick = Math.max(
        incidentMeta.lastKickoffStartTick,
        expireTick - EXPIRE_REPLAY_LOOKBACK_TICKS
      );
      extractedFrames = this.replayRingBuffer.getFramesInTickRange(startTick, currentTick);
    } else {
      const goalTick =
        incidentMeta.goalIncidentTick > 0 ? incidentMeta.goalIncidentTick : currentTick;
      const postGoalTicks = Math.max(0, currentTick - goalTick);
      extractedFrames = extractGoalReplayFrames({
        ringBuffer: this.replayRingBuffer,
        engine: null,
        goalIncidentTick: goalTick,
        scorerTouchTick: incidentMeta.lastTouchTick,
        lookbackSeconds: 8.0,
        touchLookbackSeconds: 6.0,
        postGoalTicks,
        lastKickoffWillStartTick: incidentMeta.lastKickoffStartTick,
      });
    }

    if (!Array.isArray(extractedFrames) || extractedFrames.length === 0) {
      onCompleteCallback();
      return false;
    }

    const totalFrames = this.replayController.beginReplaySession({
      scoringTeam: incidentMeta.goalScoringTeam,
      scorerCarIndex: incidentMeta.goalScorerCarIndex,
      carTeamResolver: () => incidentMeta.goalScoringTeam,
      frames: extractedFrames,
      disableSlowMo: type === 'expire',
      watchAllTouches: type === 'expire',
    });

    this.isReplayActive = true;
    this.replayCameraMode = 'director';

    if (r?.match?.state) {
      r.match.state.phase = 'replay';
    }
    const firstSnap = extractedFrames[0].snapshot;
    beginGoalReplaySession(r, this.replayController, {
      cameraMode: 'director',
      source: 'static-training-replay',
      syncHud: true,
      totalFrames,
      initialSnapshot: firstSnap,
      scorerName: incidentMeta.goalScorerName,
      scorerTeam: incidentMeta.goalScoringTeam,
      ballSpeedKph: incidentMeta.goalBallSpeedKph,
      assistName: null,
      getCameraMode: () => this.replayCameraMode || 'director',
      setCameraMode: (nextMode) => {
        this.replayCameraMode = nextMode;
      },
      getScoringTeam: () => this.activeIncidentMeta.goalScoringTeam ?? 0,
      getScorerCarIndex: () => this.activeIncidentMeta.goalScorerCarIndex ?? 0,
    });

    useStaticTrainingPackStore.getState().updateLiveTelemetry({
      isReplayActive: true,
      replayType: type,
      isOvertimeWaitGround: false,
    });

    hudStore.getState().setMatchState({
      matchPhase: 'replay',
      replayScorerName: incidentMeta.goalScorerName,
      replayScorerTeam: incidentMeta.goalScoringTeam,
      replayBallSpeedKph: incidentMeta.goalBallSpeedKph,
      replayAssistName: null,
    });

    return true;
  }

  completeSessionAndAdvance(isTestingSingleShot: boolean, reloadCurrentShot: () => void): void {
    const r = this.runtime;
    endGoalReplaySession(r, this.replayController, {
      source: 'static-training-replay',
      clearHud: true,
    });
    this.isReplayActive = false;

    if (r?.match?.state) {
      r.match.state.phase = 'playing';
    }

    hudStore.getState().setMatchState({
      matchPhase: 'playing',
      replayScorerName: null,
      replayScorerTeam: null,
      replayBallSpeedKph: null,
      replayAssistName: null,
    });

    if (isTestingSingleShot) {
      reloadCurrentShot();
      return;
    }

    useStaticTrainingPackStore.getState().nextShot();
  }

  stepUpdate(
    context: Record<string, unknown> | null | undefined,
    dt: number,
    stagedShot: StaticTrainingShotConfig | null,
    visuals: StaticTrainingReplayVisualsPort | null | undefined,
    onCompleteCallback: () => void
  ): void {
    const r = this.runtime;
    visuals?.setVisible(false);

    const stepRes = stepGoalReplaySessionFrame({
      runtime: r,
      replayController: this.replayController,
      context,
      dt,
      source: 'static-training-replay',
      cameraMode: this.replayCameraMode || 'director',
      scoringTeam: this.activeIncidentMeta.goalScoringTeam ?? 0,
      scorerCarIndex: this.activeIncidentMeta.goalScorerCarIndex ?? 0,
      povCarIndex: 0,
      isUnlimitedBoost: Boolean(stagedShot?.car?.unlimitedBoost),
      syncBoostToHud: true,
      emitWillEndSignal: true,
      syncHudProgress: true,
    });

    if (
      stepRes.isFinished &&
      !this.replayController.sessionState.isPaused &&
      !this.replayController.sessionState.isPersistent
    ) {
      onCompleteCallback();
    }
  }
}
