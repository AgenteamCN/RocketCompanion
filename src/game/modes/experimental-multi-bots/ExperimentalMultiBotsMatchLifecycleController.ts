import { MATCH_SIGNALS } from '../../../physics/RocketSimConstants.ts';
import { clearRetainedMatchReplayOnMatchStart } from '../../../replay/ReplayFileExporter.ts';
import { useExperimentalMultiBotsStore } from '../../runtimeUiPort.ts';
import { PodiumCelebrationController } from '../PodiumCelebrationController.ts';
import type {
  BallStateViewLike,
  GoalScoredEvaluation,
} from '../shared/goalAndBallTouchPipeline.ts';
import type {
  ExpGoalIncidentMeta,
  ExpModeRuntimePort,
  ExpPhysicsEnginePort,
  ExpSpawnedCarEntry,
} from './ExperimentalMultiBotsMatchMath.ts';
import { ExperimentalMultiBotsGoalIncidentTracker } from './ExperimentalMultiBotsGoalIncidentTracker.ts';
import { ExperimentalMultiBotsRosterController } from './ExperimentalMultiBotsRosterController.ts';
import { ExperimentalMultiBotsReplayController } from './ExperimentalMultiBotsReplayController.ts';
import {
  type ExpMatchLifecycleMutableState,
  finishExpMatchState,
  initializeExpMatchClockState,
  resolveLocalPlayerTeamFromRoster,
  startExpKickoffCountdownState,
  stepExpCountdownPhaseState,
  stepExpPlayingClockPipeline,
  syncOvertimeResetHudAndStore,
} from './experimentalMultiBotsLifecyclePipeline.ts';

export class ExperimentalMultiBotsMatchLifecycleController implements ExpMatchLifecycleMutableState {
  private readonly runtime: ExpModeRuntimePort | null;
  public readonly podiumController: PodiumCelebrationController;
  public readonly goalTracker: ExperimentalMultiBotsGoalIncidentTracker;

  public countdownTicks = 0;
  public kickoffTick = 0;
  public ticksSinceKickoff = 0;
  public lastKickoffStartTick = 0;
  public clockStarted = false;
  public clockTickAccum = 0;
  public configuredDuration = 300;
  public remainingSec = 300;
  public overtimeSeconds = 0;
  public clockDirection: 'up' | 'down' = 'down';
  public isOvertime = false;
  public isMatchEnded = false;
  public matchWinnerTeam: 0 | 1 = 0;
  public podiumDelayTicks = 0;
  public matchPhase = 'kickoff (3)';
  public blueScore = 0;
  public orangeScore = 0;
  public pendingMatchEndAfterReplay = false;
  public pendingOvertimeAfterReplay = false;
  public pendingMatchWinner: 0 | 1 | null = null;
  public lastStepInferenceMs = 0;
  private matchStartToken = 0;

  constructor(runtime: ExpModeRuntimePort | null) {
    this.runtime = runtime;
    this.podiumController = new PodiumCelebrationController(runtime);
    this.goalTracker = new ExperimentalMultiBotsGoalIncidentTracker(runtime);
    if (runtime && !runtime.podiumController) {
      runtime.podiumController = this.podiumController;
    }
  }

  get goalResetTicks(): number {
    return this.goalTracker.goalResetTicks;
  }
  set goalResetTicks(val: number) {
    this.goalTracker.goalResetTicks = val;
  }

  getGoalIncidentMeta(): ExpGoalIncidentMeta {
    return this.goalTracker.getGoalIncidentMeta(this.lastKickoffStartTick);
  }

  recordCarBallTouch(
    carIndex: number,
    tick: number,
    spawnedCars: ReadonlyArray<ExpSpawnedCarEntry>,
    isReplayActive: boolean
  ): void {
    this.goalTracker.recordCarBallTouch(
      carIndex,
      tick,
      spawnedCars,
      isReplayActive,
      this.isMatchEnded
    );
  }

  cancelPendingMatchStart(): void {
    this.matchStartToken++;
    this.isMatchEnded = false;
    this.podiumDelayTicks = 0;
    this.countdownTicks = 0;
    this.pendingMatchEndAfterReplay = false;
    this.pendingMatchWinner = null;
    this.goalTracker.goalResetTicks = 0;
  }

  async applyRosterAndStartMatch(
    rosterCtrl: ExperimentalMultiBotsRosterController,
    replayCtrl: ExperimentalMultiBotsReplayController
  ): Promise<void> {
    const r = this.runtime;
    if (!r?.physics) return;
    const token = ++this.matchStartToken;

    clearRetainedMatchReplayOnMatchStart();
    replayCtrl.replayController?.endReplaySession?.();
    this.podiumController?.exitPodium?.();
    replayCtrl.clearSignalsAndBuffer();
    replayCtrl.isReplayActive = false;
    this.isMatchEnded = false;
    this.podiumDelayTicks = 0;
    this.pendingMatchEndAfterReplay = false;
    this.pendingMatchWinner = null;
    r._localSkipReplayReady = false;
    r.releaseGoalReplayCameraOverride();

    await rosterCtrl.preloadNativeModels();
    if (token !== this.matchStartToken || r?.match?.state?.mode !== 'exp-multi-bots') return;

    const targetCamIdx = await rosterCtrl.spawnRosterFromStore();
    if (token !== this.matchStartToken || r?.match?.state?.mode !== 'exp-multi-bots') return;
    const store = useExperimentalMultiBotsStore.getState();

    const configuredDuration = initializeExpMatchClockState(this, store.matchDurationSec);
    this.goalTracker.goalResetTicks = 0;

    replayCtrl.emitRosterJoinAndLoadoutSignals(configuredDuration, rosterCtrl.spawnedCars);
    rosterCtrl.resetMultiCarKickoffSpawns();

    const localTeam = resolveLocalPlayerTeamFromRoster(
      rosterCtrl.humanPlayerCarIndex,
      rosterCtrl.spawnedCars
    );
    this.goalTracker.syncInitialMatchHudAndTelemetry(
      r,
      localTeam,
      this.remainingSec,
      this.isOvertime,
      targetCamIdx
    );
    this.beginKickoffCountdown(replayCtrl);
    rosterCtrl.publishSpawnedCarsTelemetry();
  }

  beginKickoffCountdown(replayCtrl: ExperimentalMultiBotsReplayController): void {
    if (this.isMatchEnded) return;
    startExpKickoffCountdownState(this, this.runtime, this.goalTracker, replayCtrl);
  }

  finishMatch(
    winnerTeam: 0 | 1,
    rosterCtrl: ExperimentalMultiBotsRosterController,
    replayCtrl: ExperimentalMultiBotsReplayController
  ): void {
    if (this.isMatchEnded) return;
    finishExpMatchState(
      this,
      winnerTeam,
      this.runtime,
      this.podiumController,
      this.goalTracker,
      rosterCtrl.spawnedCars,
      replayCtrl
    );
  }

  enterPodium(replayCtrl: ExperimentalMultiBotsReplayController): void {
    const r = this.runtime;
    const winnerTeam: 0 | 1 = this.matchWinnerTeam ?? (this.blueScore >= this.orangeScore ? 0 : 1);
    const currentTick = Math.floor(r?.physics?.getHeaderView?.()?.tickCount ?? 0);

    replayCtrl.emitReplaySignal(MATCH_SIGNALS.PODIUM_START, winnerTeam, 0, currentTick);
    this.podiumDelayTicks = 0;
    this.goalTracker.syncPodiumEntryHudAndAudio(r, this.podiumController, winnerTeam);
  }

  completePostGoalOrReplayTransition(
    rosterCtrl: ExperimentalMultiBotsRosterController,
    replayCtrl: ExperimentalMultiBotsReplayController
  ): void {
    replayCtrl.endSession(rosterCtrl);
    if (this.pendingMatchEndAfterReplay) {
      const winner: 0 | 1 = this.pendingMatchWinner ?? (this.blueScore >= this.orangeScore ? 0 : 1);
      this.finishMatch(winner, rosterCtrl, replayCtrl);
      return;
    }
    rosterCtrl.resetMultiCarKickoffSpawns();
    this.beginKickoffCountdown(replayCtrl);
  }

  prepareDirectGoalShot(
    rosterCtrl: ExperimentalMultiBotsRosterController,
    replayCtrl: ExperimentalMultiBotsReplayController
  ): void {
    this.countdownTicks = 0;
    this.clockStarted = true;
    if (replayCtrl.isReplayActive) this.completePostGoalOrReplayTransition(rosterCtrl, replayCtrl);
  }

  forceOvertimeReset(
    rosterCtrl: ExperimentalMultiBotsRosterController,
    replayCtrl: ExperimentalMultiBotsReplayController
  ): void {
    if (replayCtrl.isReplayActive) replayCtrl.endSession(rosterCtrl);
    const tied = Math.max(this.blueScore, this.orangeScore, 1);
    this.blueScore = tied;
    this.orangeScore = tied;
    this.remainingSec = 0;
    this.isOvertime = false;
    this.pendingOvertimeAfterReplay = true;
    this.overtimeSeconds = 0;
    this.clockDirection = 'up';
    replayCtrl.emitReplaySignal(MATCH_SIGNALS.SCORE_UPDATED, tied, tied);
    rosterCtrl.resetMultiCarKickoffSpawns();
    this.beginKickoffCountdown(replayCtrl);
    syncOvertimeResetHudAndStore(this.runtime?.match?.state, tied);
  }

  forceEndMatchNow(
    rosterCtrl: ExperimentalMultiBotsRosterController,
    replayCtrl: ExperimentalMultiBotsReplayController
  ): void {
    if (this.blueScore === this.orangeScore) this.blueScore += 1;
    this.finishMatch(this.blueScore >= this.orangeScore ? 0 : 1, rosterCtrl, replayCtrl);
  }

  triggerSandboxAction(
    action: string,
    rosterCtrl: ExperimentalMultiBotsRosterController,
    replayCtrl: ExperimentalMultiBotsReplayController
  ): void {
    if (!action) return;
    this.goalTracker.executeSandboxAction(action, this, rosterCtrl, replayCtrl);
  }

  stepEndedMatchPodiumDelay(
    replayCtrl: ExperimentalMultiBotsReplayController,
    onDelayStep?: () => void
  ): boolean {
    if (this.podiumDelayTicks <= 0) return false;
    onDelayStep?.();
    if (--this.podiumDelayTicks <= 0) this.enterPodium(replayCtrl);
    return true;
  }

  stepCountdownPhase(
    currentTick: number,
    replayCtrl: ExperimentalMultiBotsReplayController
  ): boolean {
    if (this.countdownTicks <= 0) return false;
    return stepExpCountdownPhaseState(
      this,
      currentTick,
      this.runtime,
      this.goalTracker,
      replayCtrl
    );
  }

  recordBotStepInference(totalInferenceMs: number): void {
    this.kickoffTick++;
    this.lastStepInferenceMs = totalInferenceMs;
  }

  stepPostGoalFreeze(sim: ExpPhysicsEnginePort, currentTick: number): void {
    if (this.goalTracker.goalResetTicks <= 0) return;
    this.goalTracker.stepPostGoalFreeze(sim, currentTick);
  }

  stepPostFrameLifecycle(
    currentTick: number,
    bView: BallStateViewLike | null | undefined,
    ballOnGround: boolean,
    goalEval: GoalScoredEvaluation,
    rosterCtrl: ExperimentalMultiBotsRosterController,
    replayCtrl: ExperimentalMultiBotsReplayController
  ): void {
    const handledReset = this.goalTracker.stepPostGoalResetCountdown(
      this.lastKickoffStartTick,
      rosterCtrl,
      replayCtrl,
      () => this.completePostGoalOrReplayTransition(rosterCtrl, replayCtrl),
      () => {
        this.matchPhase = 'replay';
      }
    );
    if (handledReset) return;
    if (goalEval.scored && bView) {
      const outcome = this.goalTracker.recordGoalScored(
        goalEval,
        bView,
        currentTick,
        {
          blueScore: this.blueScore,
          orangeScore: this.orangeScore,
          isOvertime: this.isOvertime,
          remainingSec: this.remainingSec,
          lastKickoffStartTick: this.lastKickoffStartTick,
        },
        rosterCtrl,
        replayCtrl
      );
      this.blueScore = outcome.blueScore;
      this.orangeScore = outcome.orangeScore;
      this.matchPhase = outcome.matchPhase;
      if (outcome.pendingMatchEndAfterReplay) {
        this.pendingMatchEndAfterReplay = true;
        this.pendingMatchWinner = outcome.pendingMatchWinner;
      }
      if (outcome.pendingOvertimeAfterReplay) {
        this.pendingOvertimeAfterReplay = true;
      }
      return;
    }

    const action = stepExpPlayingClockPipeline(
      this,
      currentTick,
      bView,
      ballOnGround,
      this.runtime,
      this.goalTracker,
      replayCtrl
    );
    if (action === 'overtime') {
      this.pendingOvertimeAfterReplay = true;
      rosterCtrl.resetMultiCarKickoffSpawns();
      this.beginKickoffCountdown(replayCtrl);
    } else if (action === 'blue-wins' || action === 'orange-wins') {
      this.finishMatch(action === 'blue-wins' ? 0 : 1, rosterCtrl, replayCtrl);
    }
  }
}
