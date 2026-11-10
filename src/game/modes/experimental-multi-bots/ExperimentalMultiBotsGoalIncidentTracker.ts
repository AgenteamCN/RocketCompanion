/**
 * ExperimentalMultiBotsGoalIncidentTracker.ts
 * Stateful SubController owning car-ball touch attribution, goal incident metadata,
 * post-goal ball freeze, post-goal celebration countdown, and sandbox quick actions.
 */

import { isExperimentalEngineReady } from '../../../ai/experimental/ExperimentalBotAgent.ts';
import { INCIDENT_EVENT_TYPES, MATCH_SIGNALS } from '../../../physics/RocketSimConstants.ts';
import { useExperimentalMultiBotsStore } from '../../runtimeUiPort.ts';
import {
  type BallStateViewLike,
  stepPostGoalBallFreeze,
} from '../shared/goalAndBallTouchPipeline.ts';
import {
  POST_GOAL_CELEBRATION_TICKS,
  syncLocalMatchStateToRuntimeAndHud,
} from '../shared/matchClockAndPhasePipeline.ts';
import {
  type ExpGoalIncidentMeta,
  type ExpModeRuntimePort,
  type ExpPhysicsEnginePort,
  type ExpSpawnedCarEntry,
  type ExpTeamTouchRecord,
  getExpCarDisplayName,
  getExpModeAudio,
  resolveGoalAttribution,
} from './ExperimentalMultiBotsMatchMath.ts';
export interface ExpSandboxLifecyclePort {
  beginKickoffCountdown(replayCtrl: ExperimentalMultiBotsReplayController): void;
  prepareDirectGoalShot(
    rosterCtrl: ExperimentalMultiBotsRosterController,
    replayCtrl: ExperimentalMultiBotsReplayController
  ): void;
  forceOvertimeReset(
    rosterCtrl: ExperimentalMultiBotsRosterController,
    replayCtrl: ExperimentalMultiBotsReplayController
  ): void;
  forceEndMatchNow(
    rosterCtrl: ExperimentalMultiBotsRosterController,
    replayCtrl: ExperimentalMultiBotsReplayController
  ): void;
}
import { ExperimentalMultiBotsReplayController } from './ExperimentalMultiBotsReplayController.ts';
import { ExperimentalMultiBotsRosterController } from './ExperimentalMultiBotsRosterController.ts';

export interface ExpGoalScoreContext {
  blueScore: number;
  orangeScore: number;
  isOvertime: boolean;
  remainingSec: number;
  lastKickoffStartTick: number;
}

export interface ExpGoalScoreOutcome {
  blueScore: number;
  orangeScore: number;
  matchPhase: string;
  pendingMatchEndAfterReplay: boolean;
  pendingOvertimeAfterReplay: boolean;
  pendingMatchWinner: 0 | 1 | null;
}

export class ExperimentalMultiBotsGoalIncidentTracker {
  private readonly runtime: ExpModeRuntimePort | null;

  public goalResetTicks = 0;
  public lastTouchByTeam: Record<0 | 1, ExpTeamTouchRecord | null> = { 0: null, 1: null };
  public prevTouchByTeam: Record<0 | 1, ExpTeamTouchRecord | null> = { 0: null, 1: null };
  public goalIncidentTick = -1;
  public goalScoringTeam: 0 | 1 = 0;
  public goalScorerCarIndex = 0;
  public goalScorerName: string | null = null;
  public goalScorerTouchTick = -1;
  public goalAssistName: string | null = null;
  public goalBallSpeedKph: number | null = null;
  public frozenGoalBallState: Float32Array | null = null;
  public prevBallVelX = 0;
  public prevBallVelY = 0;
  public prevBallVelZ = 0;

  constructor(runtime: ExpModeRuntimePort | null) {
    this.runtime = runtime;
    this.resetPlayTouchAndGoalState();
  }

  resetPlayTouchAndGoalState(): void {
    this.lastTouchByTeam = { 0: null, 1: null };
    this.prevTouchByTeam = { 0: null, 1: null };
    this.goalIncidentTick = -1;
    this.goalScoringTeam = 0;
    this.goalScorerCarIndex = 0;
    this.goalScorerName = null;
    this.goalScorerTouchTick = -1;
    this.goalAssistName = null;
    this.goalBallSpeedKph = null;
    this.frozenGoalBallState = null;
    this.prevBallVelX = 0;
    this.prevBallVelY = 0;
    this.prevBallVelZ = 0;
  }

  getGoalIncidentMeta(lastKickoffStartTick: number): ExpGoalIncidentMeta {
    return {
      goalIncidentTick: this.goalIncidentTick,
      goalScoringTeam: this.goalScoringTeam,
      goalScorerCarIndex: this.goalScorerCarIndex,
      goalScorerName: this.goalScorerName,
      goalScorerTouchTick: this.goalScorerTouchTick,
      goalAssistName: this.goalAssistName,
      goalBallSpeedKph: this.goalBallSpeedKph,
      lastKickoffStartTick,
    };
  }

  recordCarBallTouch(
    carIndex: number,
    tick: number,
    spawnedCars: ReadonlyArray<ExpSpawnedCarEntry>,
    isReplayActive: boolean,
    isMatchEnded: boolean
  ): void {
    if (isReplayActive || isMatchEnded) return;
    if (this.goalIncidentTick >= 0 && tick > this.goalIncidentTick) return;
    const entry = spawnedCars[carIndex];
    if (!entry) return;

    const team: 0 | 1 = entry.team === 1 ? 1 : 0;
    const playerName = getExpCarDisplayName(entry, spawnedCars);
    const prevLast = this.lastTouchByTeam[team];
    if (prevLast && prevLast.carIndex !== carIndex) {
      this.prevTouchByTeam[team] = { ...prevLast };
    }
    this.lastTouchByTeam[team] = { carIndex, team, tick: Math.floor(tick), playerName };
  }

  stepPostGoalFreeze(sim: ExpPhysicsEnginePort, currentTick: number): void {
    this.frozenGoalBallState = stepPostGoalBallFreeze({
      sim,
      goalResetTicks: this.goalResetTicks,
      currentTick,
      goalIncidentTick: this.goalIncidentTick,
      frozenBallState: this.frozenGoalBallState,
    });
  }

  stepPostGoalResetCountdown(
    lastKickoffStartTick: number,
    rosterCtrl: ExperimentalMultiBotsRosterController,
    replayCtrl: ExperimentalMultiBotsReplayController,
    onCompleteTransition: () => void,
    onEnterReplayPhase: () => void
  ): boolean {
    if (this.goalResetTicks <= 0) return false;
    if (--this.goalResetTicks <= 0) {
      const store = useExperimentalMultiBotsStore.getState();
      const meta = this.getGoalIncidentMeta(lastKickoffStartTick);
      if (!store.disableGoalReplay) {
        const started = replayCtrl.beginGoalReplay(meta, rosterCtrl, onCompleteTransition);
        if (started) onEnterReplayPhase();
      } else {
        replayCtrl.retainGoalReplayBuffer(meta, rosterCtrl.spawnedCars);
        onCompleteTransition();
      }
    }
    return true;
  }

  recordGoalScored(
    goalEval: { scoringTeam: 0 | 1; ballSpeedKph: number; ballSpeedUu: number },
    bView: BallStateViewLike,
    currentTick: number,
    scoreCtx: ExpGoalScoreContext,
    rosterCtrl: ExperimentalMultiBotsRosterController,
    replayCtrl: ExperimentalMultiBotsReplayController
  ): ExpGoalScoreOutcome {
    const r = this.runtime;
    const store = useExperimentalMultiBotsStore.getState();
    const audio = getExpModeAudio(r);
    const scoringTeam = goalEval.scoringTeam;
    const blueScore = scoreCtx.blueScore + (scoringTeam === 0 ? 1 : 0);
    const orangeScore = scoreCtx.orangeScore + (scoringTeam === 1 ? 1 : 0);

    const attr = resolveGoalAttribution(
      scoringTeam,
      this.lastTouchByTeam,
      this.prevTouchByTeam,
      rosterCtrl.spawnedCars
    );
    this.goalScorerCarIndex = attr.scorerCarIndex;
    this.goalScorerName = attr.scorerName;
    this.goalScorerTouchTick = attr.scorerTouchTick;
    this.goalAssistName = attr.assistName;
    this.goalIncidentTick = currentTick;
    this.goalScoringTeam = scoringTeam;
    this.goalBallSpeedKph = goalEval.ballSpeedKph;
    this.frozenGoalBallState = null;

    replayCtrl.appendIncident(currentTick, {
      type: INCIDENT_EVENT_TYPES.GOAL_SCORED,
      tick: currentTick,
      carIndex: this.goalScorerCarIndex,
      team: scoringTeam,
      posX: bView.posX,
      posY: bView.posY,
      posZ: bView.posZ,
      intensity: goalEval.ballSpeedUu,
    });
    replayCtrl.emitReplaySignal(MATCH_SIGNALS.SCORE_UPDATED, blueScore, orangeScore, currentTick);
    replayCtrl.appendAudioEvent(currentTick, { cueName: 'sfx_goal_poof', volume: 1.0 });
    audio?.play?.('sfx_goal_poof', 1.0);

    let pendingMatchEndAfterReplay = false;
    let pendingOvertimeAfterReplay = false;
    let pendingMatchWinner: 0 | 1 | null = null;

    if (scoreCtx.isOvertime) {
      pendingMatchEndAfterReplay = true;
      pendingMatchWinner = scoringTeam;
    } else if (scoreCtx.remainingSec === 0) {
      if (blueScore === orangeScore) {
        pendingOvertimeAfterReplay = true;
      } else {
        pendingMatchEndAfterReplay = true;
        pendingMatchWinner = blueScore > orangeScore ? 0 : 1;
      }
    }

    this.goalResetTicks = store.disableGoalReplay ? 140 : POST_GOAL_CELEBRATION_TICKS;
    const matchPhase = 'GOAL SCORED!';

    store.updateLiveTelemetry({
      blueScore,
      orangeScore,
      matchPhase,
      isOvertime: scoreCtx.isOvertime,
    });
    syncLocalMatchStateToRuntimeAndHud(r?.match?.state, {
      matchPhase: 'goal',
      blueScore,
      orangeScore,
      goalScorerName: this.goalScorerName,
      goalScoringTeam: scoringTeam,
      goalSpeedKph: goalEval.ballSpeedKph,
      goalAssistName: this.goalAssistName,
      replayScorerName: this.goalScorerName,
      replayScorerTeam: scoringTeam,
      replayScorerAnthemId: attr.scorerAnthemId,
      replayBallSpeedKph: goalEval.ballSpeedKph,
      replayAssistName: this.goalAssistName,
    });

    return {
      blueScore,
      orangeScore,
      matchPhase,
      pendingMatchEndAfterReplay,
      pendingOvertimeAfterReplay,
      pendingMatchWinner,
    };
  }

  executeSandboxAction(
    action: string,
    lifecycle: ExpSandboxLifecyclePort,
    rosterCtrl: ExperimentalMultiBotsRosterController,
    replayCtrl: ExperimentalMultiBotsReplayController
  ): void {
    const r = this.runtime;
    if (!r?.physics) return;

    switch (action) {
      case 'reset_kickoff': {
        if (replayCtrl.isReplayActive) replayCtrl.endSession(rosterCtrl);
        rosterCtrl.resetMultiCarKickoffSpawns();
        lifecycle.beginKickoffCountdown(replayCtrl);
        break;
      }
      case 'score_blue':
      case 'score_orange': {
        const yDir = action === 'score_blue' ? 1 : -1;
        this.goalResetTicks = 0;
        lifecycle.prepareDirectGoalShot(rosterCtrl, replayCtrl);
        r.physics.setBallState({
          pos: [0, 5050 * yDir, 200],
          vel: [0, 1200 * yDir, 0],
          angVel: [0, 0, 0],
        });
        break;
      }
      case 'force_overtime': {
        lifecycle.forceOvertimeReset(rosterCtrl, replayCtrl);
        break;
      }
      case 'end_match': {
        lifecycle.forceEndMatchNow(rosterCtrl, replayCtrl);
        break;
      }
      default:
        break;
    }
  }

  syncInitialMatchHudAndTelemetry(
    runtime: ExpModeRuntimePort | null,
    localTeam: 0 | 1,
    remainingSec: number,
    isOvertime: boolean,
    targetCamIdx: number
  ): void {
    syncLocalMatchStateToRuntimeAndHud(runtime?.match?.state, {
      matchPhase: 'kickoff',
      kickoffCountdown: 3,
      localTeam,
      blueScore: 0,
      orangeScore: 0,
      remainingSeconds: remainingSec,
      isOvertime,
      overtimeSeconds: 0,
      winner: null,
      winReason: null,
      replayScorerName: null,
      replayScorerTeam: null,
      replayBallSpeedKph: null,
      replayAssistName: null,
    });
    useExperimentalMultiBotsStore.getState().updateLiveTelemetry({
      matchActive: true,
      activeCameraCarIndex: targetCamIdx,
      blueScore: 0,
      orangeScore: 0,
      remainingSec,
      isOvertime,
    });
  }

  syncKickoffCountdownStart(
    runtime: ExpModeRuntimePort | null,
    matchPhase: string,
    blueScore: number,
    orangeScore: number,
    isOvertime: boolean,
    remainingSec: number,
    enteringOvertimeNow: boolean
  ): void {
    useExperimentalMultiBotsStore.getState().updateLiveTelemetry({
      kickoffCountdownSec: 3,
      matchPhase,
      isOvertime,
      remainingSec,
    });
    syncLocalMatchStateToRuntimeAndHud(runtime?.match?.state, {
      matchPhase: 'kickoff',
      kickoffCountdown: 3,
      blueScore,
      orangeScore,
      isOvertime,
      remainingSeconds: remainingSec,
      overtimeSeconds: isOvertime ? remainingSec : 0,
      replayScorerName: null,
      replayScorerTeam: null,
      replayBallSpeedKph: null,
      replayAssistName: null,
    });
    const audio = getExpModeAudio(runtime);
    if (enteringOvertimeNow) audio?.play?.('match_entering_overtime', 1.0, 10000);
    audio?.play?.('match_countdown_321', 1.0);
  }

  syncMatchEndHudAndAudio(
    runtime: ExpModeRuntimePort | null,
    matchPhase: string,
    blueScore: number,
    orangeScore: number,
    remainingSec: number,
    winnerTeam: 0 | 1
  ): void {
    useExperimentalMultiBotsStore.getState().updateLiveTelemetry({
      matchPhase,
      isOvertime: false,
    });
    syncLocalMatchStateToRuntimeAndHud(runtime?.match?.state, {
      matchPhase: 'ended',
      kickoffCountdown: 0,
      blueScore,
      orangeScore,
      remainingSeconds: remainingSec,
      isOvertime: false,
      winner: winnerTeam,
      winReason: 'SCORE',
    });
    runtime?.audioSubsystem?.resetAudio?.();
    getExpModeAudio(runtime)?.play?.('endgame', 1.0);
  }

  syncPodiumEntryHudAndAudio(
    runtime: ExpModeRuntimePort | null,
    podiumController: { enterPodium?: (winner: 0 | 1, reason: string) => void } | null,
    winnerTeam: 0 | 1
  ): void {
    runtime?.audioSubsystem?.resetAudio?.();
    podiumController?.enterPodium?.(winnerTeam, 'SCORE');
    syncLocalMatchStateToRuntimeAndHud(runtime?.match?.state, {
      matchPhase: 'podium',
      kickoffCountdown: 0,
      isOvertime: false,
      winner: winnerTeam,
      winReason: 'SCORE',
    });
  }

  syncPeriodicPlayingTelemetry(
    runtime: ExpModeRuntimePort | null,
    remainingSec: number,
    isOvertime: boolean,
    matchPhase: string,
    totalInferenceMs: number
  ): void {
    const store = useExperimentalMultiBotsStore.getState();
    store.updateLiveTelemetry({
      remainingSec,
      isOvertime,
      matchPhase,
      lastTotalInferenceMs:
        totalInferenceMs > 0 ? Number(totalInferenceMs.toFixed(3)) : store.lastTotalInferenceMs,
      nextoLoaded: isExperimentalEngineReady('nexto'),
      nectoLoaded: isExperimentalEngineReady('necto'),
    });
    syncLocalMatchStateToRuntimeAndHud(runtime?.match?.state, {
      remainingSeconds: remainingSec,
      isOvertime,
      overtimeSeconds: isOvertime ? remainingSec : 0,
      matchPhase: 'playing',
    });
  }

  syncCountdownTransitionHudAndAudio(
    runtime: ExpModeRuntimePort | null,
    sec: number,
    matchPhase: string,
    audioCue: string | null
  ): void {
    if (audioCue) getExpModeAudio(runtime)?.play?.(audioCue, 1.0);
    useExperimentalMultiBotsStore.getState().updateLiveTelemetry({
      kickoffCountdownSec: sec,
      matchPhase,
    });
    syncLocalMatchStateToRuntimeAndHud(runtime?.match?.state, {
      matchPhase: sec > 0 ? 'kickoff' : 'playing',
      kickoffCountdown: sec,
    });
  }
}
