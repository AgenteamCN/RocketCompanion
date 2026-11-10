import {
  ReplayRingBuffer,
  REPLAY_BUFFER_MODES,
  COUNTDOWN_REPLAY_CAPACITY_TICKS,
  type ReplayAcknowledgedControlEntry,
  type ReplayAudioCue,
  type ReplayRecordedIncident,
} from '../../../replay/ReplayRingBuffer.ts';
import { ReplayTimelineController } from '../../../replay/ReplayTimelineController.ts';
import { MATCH_SIGNALS } from '../../../physics/RocketSimConstants.ts';
import {
  endGoalReplaySession,
  stepGoalReplaySessionFrame,
} from '../shared/GoalReplaySessionCoordinator.ts';
import type {
  ExpGoalIncidentMeta,
  ExpModeRuntimePort,
  ExpReplaySignal,
  ExpSpawnedCarEntry,
} from './ExperimentalMultiBotsMatchMath.ts';
import { ExperimentalMultiBotsRosterController } from './ExperimentalMultiBotsRosterController.ts';
import {
  emitExpClockSecondAndAlertSignals,
  emitExpRosterJoinAndLoadoutSignals,
  exportCompletedExpMatchReplay,
  extractExpGoalReplayWindow,
  launchExpGoalReplaySession,
  pushExpReplaySignalToSim,
  syncReplayExitPhaseToKickoff,
  syncReplayInterpolatedCarControls,
} from './experimentalMultiBotsReplayPipeline.ts';

export class ExperimentalMultiBotsReplayController {
  private readonly runtime: ExpModeRuntimePort | null;
  public readonly replayRingBuffer: ReplayRingBuffer;
  public readonly replayController: ReplayTimelineController;

  public isReplayActive = false;
  public replayCameraMode: 'director' | 'pov' = 'director';
  public replayPovCarIndex = 0;

  private nextReplaySignalId = 1;
  private readonly pendingFrameSignals: ExpReplaySignal[] = [];

  public activeGoalMeta: ExpGoalIncidentMeta = {
    goalIncidentTick: -1,
    goalScoringTeam: 0,
    goalScorerCarIndex: 0,
    goalScorerName: null,
    goalScorerTouchTick: -1,
    goalAssistName: null,
    goalBallSpeedKph: null,
    lastKickoffStartTick: 0,
  };

  constructor(runtime: ExpModeRuntimePort | null) {
    this.runtime = runtime;
    this.replayRingBuffer = new ReplayRingBuffer({
      mode: REPLAY_BUFFER_MODES.COUNTDOWN_MATCH,
      capacityTicks: COUNTDOWN_REPLAY_CAPACITY_TICKS,
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

  clearSignalsAndBuffer(): void {
    this.pendingFrameSignals.length = 0;
    this.replayRingBuffer.clear();
  }

  clearPendingSignals(): void {
    this.pendingFrameSignals.length = 0;
  }

  pushSignalToPhysicsEngine(sig: ExpReplaySignal): void {
    pushExpReplaySignalToSim(this.runtime?.physics, sig);
  }

  emitReplaySignal(
    signalType: number,
    param1 = 0,
    param2 = 0,
    explicitTick: number | null = null
  ): ExpReplaySignal {
    const sim = this.runtime?.physics;
    const isExplicit = explicitTick !== null;
    const targetTick = isExplicit
      ? Math.floor(explicitTick)
      : Math.floor(sim?.getHeaderView?.()?.tickCount ?? 0) + 1;
    const sig: ExpReplaySignal = {
      signalId: this.nextReplaySignalId++,
      signalType,
      frameId: targetTick,
      param1,
      param2,
    };
    if (isExplicit) {
      this.pushSignalToPhysicsEngine(sig);
      if (this.replayRingBuffer.findFrameByTick(targetTick)) {
        this.replayRingBuffer.appendSignal(targetTick, sig);
        return sig;
      }
    }
    this.pendingFrameSignals.push(sig);
    return sig;
  }

  flushPendingSignalsAndRecordFrame(
    currentTick: number,
    state: Float32Array,
    acknowledgedControls: ReplayAcknowledgedControlEntry[]
  ): void {
    const pending = this.pendingFrameSignals.length > 0 ? this.pendingFrameSignals.slice() : [];
    this.pendingFrameSignals.length = 0;
    for (let s = 0; s < pending.length; s++) {
      pending[s].frameId = currentTick;
      this.pushSignalToPhysicsEngine(pending[s]);
    }
    this.replayRingBuffer.recordFrame(currentTick, state, {
      acknowledgedControls,
      signals: pending,
    });
  }

  appendIncident(tick: number, event: ReplayRecordedIncident): void {
    this.replayRingBuffer.appendIncident(tick, event);
  }

  appendAudioEvent(tick: number, audioEvt: ReplayAudioCue): void {
    this.replayRingBuffer.appendAudioEvent(tick, audioEvt);
  }

  emitRosterJoinAndLoadoutSignals(
    configuredDuration: number,
    spawnedCars: ReadonlyArray<ExpSpawnedCarEntry>
  ): void {
    emitExpRosterJoinAndLoadoutSignals(
      (type, p1, p2) => {
        this.emitReplaySignal(type, p1, p2);
      },
      configuredDuration,
      spawnedCars
    );
  }

  emitClockSecondAndAlertSignals(
    currentTick: number,
    remainingSec: number,
    isOvertime: boolean,
    timeAlertSecond: number | null
  ): void {
    emitExpClockSecondAndAlertSignals(
      (type, p1, p2, tick) => {
        this.emitReplaySignal(type, p1, p2, tick);
      },
      currentTick,
      remainingSec,
      isOvertime,
      timeAlertSecond
    );
  }

  retainGoalReplayBuffer(
    goalMeta: ExpGoalIncidentMeta,
    spawnedCars: ReadonlyArray<ExpSpawnedCarEntry>
  ): number {
    const sim = this.runtime?.physics;
    if (!this.replayRingBuffer || this.replayRingBuffer.size === 0) return 0;
    const currentTick = Math.floor(
      sim?.getHeaderView?.()?.tickCount ?? this.replayRingBuffer.getNewestFrame()?.tick ?? 0
    );
    this.attachPhysicsIfNeeded();

    const win = extractExpGoalReplayWindow({
      ringBuffer: this.replayRingBuffer,
      currentTick,
      goalMeta,
      spawnedCars,
    });
    if (!win) return 0;
    return this.replayController.retainReplaySessionFrames({
      scoringTeam: goalMeta.goalScoringTeam ?? 0,
      scorerCarIndex: goalMeta.goalScorerCarIndex ?? 0,
      carTeamResolver: win.carTeamResolver,
      carEntries: win.carEntries,
      frames: win.extractedFrames,
    });
  }

  retainMatchReplayAndNotify(params: {
    winnerTeam: 0 | 1;
    blueScore: number;
    orangeScore: number;
    configuredDuration: number;
    goalMeta: ExpGoalIncidentMeta;
    spawnedCars: ReadonlyArray<ExpSpawnedCarEntry>;
  }): void {
    const simState = this.runtime?.physics?.state || null;
    if ((!this.replayRingBuffer || this.replayRingBuffer.size === 0) && !simState) return;
    if (
      params.goalMeta.goalIncidentTick > 0 &&
      this.replayRingBuffer.size > 0 &&
      this.replayController.ActiveWindowCount <= 0
    ) {
      this.retainGoalReplayBuffer(params.goalMeta, params.spawnedCars);
    }
    exportCompletedExpMatchReplay({
      ringBuffer: this.replayRingBuffer,
      fallbackState: simState,
      winnerTeam: params.winnerTeam,
      blueScore: params.blueScore,
      orangeScore: params.orangeScore,
      configuredDuration: params.configuredDuration,
      spawnedCars: params.spawnedCars,
    });
  }

  beginGoalReplay(
    goalMeta: ExpGoalIncidentMeta,
    rosterCtrl: ExperimentalMultiBotsRosterController,
    onCompleteTransition: () => void
  ): boolean {
    const r = this.runtime;
    const sim = r?.physics;
    if (r) {
      r._localSkipReplayReady = false;
    }
    if (!sim || !this.replayRingBuffer || this.replayRingBuffer.size === 0) {
      onCompleteTransition();
      return false;
    }

    this.activeGoalMeta = { ...goalMeta };
    const currentTick = Math.floor(sim.getHeaderView?.()?.tickCount ?? 0);
    this.emitReplaySignal(
      MATCH_SIGNALS.GOAL_REPLAY_WILL_START,
      goalMeta.goalScoringTeam ?? 0,
      goalMeta.goalScorerCarIndex ?? 0,
      currentTick
    );

    this.attachPhysicsIfNeeded();

    const win = extractExpGoalReplayWindow({
      ringBuffer: this.replayRingBuffer,
      currentTick,
      goalMeta,
      spawnedCars: rosterCtrl.spawnedCars,
    });
    if (!win) {
      onCompleteTransition();
      return false;
    }

    const totalFrames = this.replayController.beginReplaySession({
      scoringTeam: goalMeta.goalScoringTeam,
      scorerCarIndex: goalMeta.goalScorerCarIndex,
      carTeamResolver: win.carTeamResolver,
      carEntries: win.carEntries,
      frames: win.extractedFrames,
    });

    if (win.carEntries.length > 0) {
      this.replayController.sessionState.carEntries = win.carEntries;
    }

    this.isReplayActive = true;
    this.replayCameraMode = 'director';
    this.replayPovCarIndex = goalMeta.goalScorerCarIndex;

    launchExpGoalReplaySession({
      simPorts: r,
      timelineCtrl: this.replayController,
      sessionState: this,
      goalMeta,
      initialSnapshot: win.extractedFrames[0].snapshot,
      totalFrames,
      spawnedCars: rosterCtrl.spawnedCars,
      applyCameraCarIndex: (carIdx) => rosterCtrl.applyCameraCarIndex(carIdx),
    });

    return true;
  }

  endSession(rosterCtrl: ExperimentalMultiBotsRosterController): void {
    const r = this.runtime;
    endGoalReplaySession(r, this.replayController, {
      source: 'exp-multi-bots-replay',
      clearHud: false,
    });
    this.isReplayActive = false;
    if (r) {
      r._localSkipReplayReady = false;
    }
    syncReplayExitPhaseToKickoff(r?.match?.state);
    const restoreCamIdx = rosterCtrl.resolveDefaultCameraCarIndex();
    rosterCtrl.applyCameraCarIndex(restoreCamIdx);
  }

  stepUpdate(
    context: Record<string, unknown>,
    unlimited: boolean,
    rosterCtrl: ExperimentalMultiBotsRosterController,
    onCompleteTransition: () => void
  ): void {
    const r = this.runtime;
    const povCarIdx =
      this.replayCameraMode === 'pov' && typeof this.replayPovCarIndex === 'number'
        ? this.replayPovCarIndex
        : this.activeGoalMeta.goalScorerCarIndex;
    this.replayPovCarIndex = rosterCtrl.applyCameraCarIndex(povCarIdx);

    stepGoalReplaySessionFrame({
      runtime: r,
      replayController: this.replayController,
      context,
      source: 'exp-multi-bots-replay',
      cameraMode: this.replayCameraMode,
      scoringTeam: this.activeGoalMeta.goalScoringTeam,
      scorerCarIndex: this.activeGoalMeta.goalScorerCarIndex,
      povCarIndex: this.replayPovCarIndex,
      isUnlimitedBoost: unlimited,
      onStepAfterEvents: () => {
        syncReplayInterpolatedCarControls(
          r?.interpolator,
          rosterCtrl.spawnedCars,
          rosterCtrl.carControlsMap
        );
      },
      onComplete: () => {
        onCompleteTransition();
      },
    });
  }
}
