import { gameAudio } from '../../../audio/GameAudioEngineFacade.ts';
import { hudStore, useSubsystemIsolationLabStore } from '../../runtimeUiPort.ts';
import {
  evaluateGoalScoredFromBallView,
  hasKickoffBallMoved,
} from '../shared/goalAndBallTouchPipeline.ts';
import {
  KICKOFF_COUNTDOWN_TICKS,
  stepMatchClockState,
} from '../shared/matchClockAndPhasePipeline.ts';
import type {
  LabAudioPort,
  LabPhysicsEnginePort,
  LabTabContext,
  LabTabController,
} from './LabTabTypes.ts';
import {
  NinetySecDualBotController,
  initializeTwoCarIncidentPhysics,
  resetIncidentKickoffPhysics,
  stepIncidentCountdownTick,
} from './NinetySecDualBotController.ts';

type IsolationLabStoreState = ReturnType<typeof useSubsystemIsolationLabStore.getState>;

export type IncidentOpponentMode = 'stationary' | 'nexto' | string;

export type IncidentSandboxAction =
  | 'score_blue'
  | 'score_orange'
  | 'force_overtime'
  | 'pause_5s'
  | 'reset_kickoff'
  | 'podium_blue'
  | 'podium_orange'
  | 'podium_draw'
  | 'exit_podium'
  | string;

export class NinetySecMatchLabTab implements LabTabController {
  readonly tabId = '90s-match' as const;
  private ctx: LabTabContext | null = null;
  private readonly botCtrl = new NinetySecDualBotController();

  private incidentCountdownTicks = 0;
  private incidentTicksSinceKickoff = 0;
  private incidentClockStarted = false;
  private incidentClockTickAccum = 0;
  private incidentRemainingSec = 90;
  private incidentOvertime = false;
  private incidentPhase = 'kickoff';
  private incidentBlueScore = 0;
  private incidentOrangeScore = 0;
  private incidentPauseResumeTicks = 0;
  private incidentGoalResetTicks = 0;

  onActivate(ctx: LabTabContext): void {
    this.ctx = ctx;
    const store = useSubsystemIsolationLabStore.getState();
    void this.startMatchSession(store.incidentOpponentMode || 'stationary');
  }

  onDeactivate(): void {
    this.botCtrl.incrementEpoch();
    this.incidentPauseResumeTicks = 0;
    this.incidentGoalResetTicks = 0;
    this.incidentCountdownTicks = 0;
    this.incidentClockStarted = false;
    this.incidentTicksSinceKickoff = 0;
    this.incidentClockTickAccum = 0;
    this.incidentOvertime = false;
    this.incidentPhase = 'playing';
    this.ctx = null;
  }

  onPhysicsTick(_dt: number): boolean {
    const store = useSubsystemIsolationLabStore.getState();
    const runtime = this.ctx?.runtime;
    if (!store.incidentMatchActive || !runtime?.physics) return true;

    if (this.incidentPauseResumeTicks > 0) {
      this.incidentPauseResumeTicks--;
      if (this.incidentPauseResumeTicks % 12 === 0) {
        this.incidentPhase = `will-resume (${(this.incidentPauseResumeTicks / 120).toFixed(1)}s)`;
        store.updateLiveTelemetry({ incidentPhase: this.incidentPhase });
      }
      if (this.incidentPauseResumeTicks === 0) {
        this.incidentPhase = this.incidentOvertime ? 'overtime' : 'playing';
        store.updateLiveTelemetry({ incidentPhase: this.incidentPhase });
      }
      return false;
    }

    this.stepIncidentMatchTick(store);
    return true;
  }

  private getAudio(): LabAudioPort | null {
    const runtime = this.ctx?.runtime;
    return runtime?.options?.gameAudio || (gameAudio as unknown as LabAudioPort);
  }

  private resetIncidentBotEpoch(): void {
    this.botCtrl.resetEpoch();
  }

  applyControlledCar(carIdx = 0): void {
    const r = this.ctx?.runtime;
    if (!r) return;
    const targetIdx = carIdx === 1 ? 1 : 0;
    r.playerCarIndex = targetIdx;
    if (r.arena) r.arena.playerCarIndex = targetIdx;
  }

  applySpeedMultiplier(multiplierPct = 100): void {
    const r = this.ctx?.runtime;
    if (!r?.interpolator) return;
    const mult = Math.max(100, Math.min(500, Number(multiplierPct) || 100));
    r.interpolator.setTrainingPhysicsRate?.(Math.round(120 * (mult / 100)));
  }

  private beginIncidentKickoffCountdown(store: IsolationLabStoreState): void {
    const r = this.ctx?.runtime;
    const audio = this.getAudio();
    this.incidentCountdownTicks = KICKOFF_COUNTDOWN_TICKS;
    this.incidentClockStarted = false;
    this.incidentTicksSinceKickoff = 0;
    this.incidentClockTickAccum = 0;
    this.incidentPhase = 'kickoff (3)';
    if (r?.match?.state) {
      r.match.state.phase = 'kickoff';
      r.match.state.countdown = 3;
    }
    store.updateLiveTelemetry({
      incidentClockStarted: false,
      incidentTicksSinceKickoff: 0,
      incidentKickoffCountdownSec: 3,
      incidentPhase: this.incidentPhase,
    });
    hudStore.getState().setMatchState({ matchPhase: 'kickoff', kickoffCountdown: 3 });
    audio?.play?.('match_countdown_321', 1.0);
  }

  async startMatchSession(opponentMode: IncidentOpponentMode = 'stationary'): Promise<void> {
    if (!this.ctx) return;
    const r = this.ctx.runtime;
    if (!r?.physics) return;
    const epoch = this.ctx.getSwitchEpoch();

    if (this.ctx.isPodiumActive()) this.ctx.exitPodiumShowcase();

    await r.arena?.ensureOpponent?.();
    if (
      this.ctx.getSwitchEpoch() !== epoch ||
      useSubsystemIsolationLabStore.getState().activeTab !== '90s-match'
    ) {
      return;
    }

    const store = useSubsystemIsolationLabStore.getState();

    initializeTwoCarIncidentPhysics(r);
    this.applyControlledCar(store.incidentControlledCar ?? 0);
    this.applySpeedMultiplier(store.incidentSpeedMultiplier ?? 100);

    this.resetIncidentBotEpoch();
    if (opponentMode === 'nexto') void this.botCtrl.ensureLoaded();

    this.incidentPauseResumeTicks = 0;
    this.incidentGoalResetTicks = 0;
    this.incidentRemainingSec = 90;
    this.incidentOvertime = false;
    this.incidentBlueScore = 0;
    this.incidentOrangeScore = 0;

    store.updateLiveTelemetry({
      incidentMatchActive: true,
      incidentOpponentMode: opponentMode,
      incidentBlueScore: 0,
      incidentOrangeScore: 0,
      incidentRemainingSec: 90,
      incidentOvertime: false,
      incidentPossessionTeam: 0,
      incidentPossessionBluePts: 0,
      incidentPossessionOrangePts: 0,
    });

    hudStore.getState().setMatchState({
      blueScore: 0,
      orangeScore: 0,
      remainingSeconds: 90,
      isOvertime: false,
      overtimeSeconds: 0,
    });

    this.beginIncidentKickoffCountdown(store);
  }

  handleControlModeSwitch(nextOpponentMode: IncidentOpponentMode): void {
    const store = useSubsystemIsolationLabStore.getState();
    if (!store.incidentMatchActive) {
      void this.startMatchSession(nextOpponentMode);
      return;
    }
    this.resetIncidentBotEpoch();
    if (nextOpponentMode === 'nexto') void this.botCtrl.ensureLoaded();
    store.updateLiveTelemetry({ incidentOpponentMode: nextOpponentMode });
  }

  triggerSandboxAction(action: IncidentSandboxAction): void {
    const r = this.ctx?.runtime;
    const store = useSubsystemIsolationLabStore.getState();
    const audio = this.getAudio();
    if (!r?.physics) return;

    if (!store.incidentMatchActive) void this.startMatchSession(store.incidentOpponentMode);

    switch (action) {
      case 'score_blue':
        r.physics.setBallState({ pos: [0, 5050, 200], vel: [0, 1200, 0], angVel: [0, 0, 0] });
        break;
      case 'score_orange':
        r.physics.setBallState({ pos: [0, -5050, 200], vel: [0, -1200, 0], angVel: [0, 0, 0] });
        break;
      case 'force_overtime': {
        const tiedScore = Math.max(this.incidentBlueScore, this.incidentOrangeScore, 1);
        resetIncidentKickoffPhysics(r);
        this.resetIncidentBotEpoch();
        this.incidentBlueScore = tiedScore;
        this.incidentOrangeScore = tiedScore;
        this.incidentRemainingSec = 0;
        this.incidentOvertime = true;
        store.updateLiveTelemetry({
          incidentBlueScore: tiedScore,
          incidentOrangeScore: tiedScore,
          incidentRemainingSec: 0,
          incidentOvertime: true,
        });
        hudStore.getState().setMatchState({
          matchPhase: 'kickoff',
          blueScore: tiedScore,
          orangeScore: tiedScore,
          remainingSeconds: 0,
          isOvertime: true,
          overtimeSeconds: 0,
        });
        audio?.play?.('match_entering_overtime', 1.0, 10000);
        this.beginIncidentKickoffCountdown(store);
        break;
      }
      case 'pause_5s':
        this.incidentPauseResumeTicks = 600;
        this.incidentPhase = 'will-resume (5.0s)';
        store.updateLiveTelemetry({ incidentPhase: this.incidentPhase });
        break;
      case 'reset_kickoff':
        resetIncidentKickoffPhysics(r);
        this.resetIncidentBotEpoch();
        this.beginIncidentKickoffCountdown(store);
        break;
      case 'podium_blue':
      case 'podium_orange':
      case 'podium_draw': {
        const team = action === 'podium_blue' ? 0 : action === 'podium_orange' ? 1 : 2;
        this.ctx?.enterPodiumShowcase(team);
        this.incidentPhase =
          team === 0 ? 'PODIUM (BLUE WINS)' : team === 1 ? 'PODIUM (ORANGE WINS)' : 'PODIUM (DRAW)';
        store.updateLiveTelemetry({ incidentPhase: this.incidentPhase });
        break;
      }
      case 'exit_podium':
        this.ctx?.exitPodiumShowcase();
        this.beginIncidentKickoffCountdown(store);
        break;
      default:
        break;
    }
  }

  private stepDualNextoBots(sim: LabPhysicsEnginePort): void {
    this.botCtrl.stepDualNextoBots(sim);
  }

  private stepIncidentMatchTick(store: IsolationLabStoreState): void {
    const r = this.ctx?.runtime;
    const sim = r?.physics;
    if (!sim) return;
    const audio = this.getAudio();

    if (this.incidentCountdownTicks > 0) {
      const cd = stepIncidentCountdownTick({
        sim,
        neutralControls: r.neutralControls,
        countdownTicks: this.incidentCountdownTicks,
        isOvertime: this.incidentOvertime,
        currentPhase: this.incidentPhase,
        matchState: r?.match?.state,
        audio,
        onSyncCountdown: (sec, phase, matchPhase) => {
          store.updateLiveTelemetry({ incidentKickoffCountdownSec: sec, incidentPhase: phase });
          hudStore.getState().setMatchState({ matchPhase, kickoffCountdown: sec });
        },
      });
      this.incidentCountdownTicks = cd.nextCountdownTicks;
      this.incidentPhase = cd.nextPhase;
      return;
    }

    const controlledCar = store.incidentControlledCar === 1 ? 1 : 0;
    if (r.playerCarIndex !== controlledCar) this.applyControlledCar(controlledCar);

    if (store.incidentOpponentMode === 'nexto') {
      this.stepDualNextoBots(sim);
    } else {
      const otherCar = controlledCar === 0 ? 1 : 0;
      sim.setControls(controlledCar, r.playerControls || r.neutralControls);
      sim.setControls(otherCar, r.neutralControls);
    }

    if (this.incidentGoalResetTicks > 0) {
      this.incidentGoalResetTicks--;
      if (this.incidentGoalResetTicks <= 0) {
        if (this.incidentPhase.includes('WINS') || this.incidentPhase.includes('MATCH END')) {
          return;
        }
        if (
          !this.incidentOvertime &&
          this.incidentClockStarted &&
          this.incidentRemainingSec === 0
        ) {
          if (this.incidentBlueScore === this.incidentOrangeScore) {
            this.incidentOvertime = true;
            this.incidentPhase = 'overtime';
            audio?.play?.('match_entering_overtime', 1.0, 10000);
          } else {
            this.incidentPhase =
              this.incidentBlueScore > this.incidentOrangeScore
                ? 'MATCH END (BLUE WINS)'
                : 'MATCH END (ORANGE WINS)';
            audio?.play?.('endgame', 1.0);
            store.updateLiveTelemetry({
              incidentPhase: this.incidentPhase,
              incidentOvertime: false,
            });
            return;
          }
        }
        resetIncidentKickoffPhysics(r);
        this.resetIncidentBotEpoch();
        this.beginIncidentKickoffCountdown(store);
      }
      return;
    }

    const bView = sim.getBallStateView();
    const goalEval = evaluateGoalScoredFromBallView(sim, bView);
    if (goalEval.scored) {
      const blueScored = goalEval.scoringTeam === 0;
      this.incidentBlueScore += blueScored ? 1 : 0;
      this.incidentOrangeScore += blueScored ? 0 : 1;
      audio?.play?.('sfx_goal_poof', 1.0);

      const poss = sim.getPossessionStats?.() || { team: 0, bluePoints: 0, orangePoints: 0 };

      if (this.incidentOvertime) {
        this.incidentGoalResetTicks = 180;
        this.incidentOvertime = false;
        this.incidentPhase = blueScored ? 'BLUE WINS OT!' : 'ORANGE WINS OT!';
        audio?.play?.('endgame', 1.0);
      } else {
        this.incidentGoalResetTicks = store.incidentDisableGoalReplay ? 150 : 360;
        this.incidentPhase = store.incidentDisableGoalReplay
          ? 'GOAL! (Replay Skipped -> Kickoff)'
          : 'GOAL CELEBRATION';
      }
      store.updateLiveTelemetry({
        incidentBlueScore: this.incidentBlueScore,
        incidentOrangeScore: this.incidentOrangeScore,
        incidentPhase: this.incidentPhase,
        incidentOvertime: false,
        incidentPossessionTeam: poss.team,
        incidentPossessionBluePts: poss.bluePoints,
        incidentPossessionOrangePts: poss.orangePoints,
      });
      hudStore.getState().setMatchState({
        blueScore: this.incidentBlueScore,
        orangeScore: this.incidentOrangeScore,
      });
      return;
    }

    const prevClockStarted = this.incidentClockStarted;
    const prevRemSec = this.incidentRemainingSec;

    const clockStep = stepMatchClockState({
      clockStarted: this.incidentClockStarted,
      clockTickAccum: this.incidentClockTickAccum,
      ticksSinceKickoff: this.incidentTicksSinceKickoff,
      ballMoved: hasKickoffBallMoved(bView),
      ballOnGround: Boolean(sim.ballOnGround),
      isOvertime: this.incidentOvertime,
      remainingSec: this.incidentRemainingSec,
      blueScore: this.incidentBlueScore,
      orangeScore: this.incidentOrangeScore,
    });

    this.incidentClockStarted = clockStep.clockStarted;
    this.incidentClockTickAccum = clockStep.clockTickAccum;
    this.incidentTicksSinceKickoff = clockStep.ticksSinceKickoff;
    this.incidentRemainingSec = clockStep.remainingSec;

    if (clockStep.audioCue === 'match_countdown_10s') {
      audio?.play?.(clockStep.audioCue, 1.0);
    } else if (clockStep.audioCue) {
      audio?.play?.(clockStep.audioCue, 1.0, 10000);
    }

    if (!this.incidentPhase.includes('MATCH END')) {
      if (clockStep.zeroSecondOutcome === 'overtime') {
        this.incidentOvertime = true;
        this.incidentPhase = 'overtime';
        audio?.play?.('match_entering_overtime', 1.0, 10000);
        resetIncidentKickoffPhysics(r);
        this.resetIncidentBotEpoch();
        this.beginIncidentKickoffCountdown(store);
      } else if (
        clockStep.zeroSecondOutcome === 'blue-wins' ||
        clockStep.zeroSecondOutcome === 'orange-wins'
      ) {
        this.incidentPhase =
          clockStep.zeroSecondOutcome === 'blue-wins'
            ? 'MATCH END (BLUE WINS)'
            : 'MATCH END (ORANGE WINS)';
        audio?.play?.('endgame', 1.0);
      }
    }

    const poss = sim.getPossessionStats?.() || { team: 0, bluePoints: 0, orangePoints: 0 };

    if (
      this.incidentTicksSinceKickoff % 6 === 0 ||
      this.incidentClockStarted !== prevClockStarted ||
      this.incidentRemainingSec !== prevRemSec
    ) {
      store.updateLiveTelemetry({
        incidentClockStarted: this.incidentClockStarted,
        incidentTicksSinceKickoff: this.incidentTicksSinceKickoff,
        incidentRemainingSec: this.incidentRemainingSec,
        incidentOvertime: this.incidentOvertime,
        incidentPhase: this.incidentPhase,
        incidentPossessionTeam: poss.team,
        incidentPossessionBluePts: poss.bluePoints,
        incidentPossessionOrangePts: poss.orangePoints,
      });

      hudStore.getState().setMatchState({
        remainingSeconds: this.incidentRemainingSec,
        isOvertime: this.incidentOvertime,
        overtimeSeconds: this.incidentOvertime ? this.incidentRemainingSec : 0,
        matchPhase: this.incidentOvertime ? 'overtime' : 'playing',
      });
    }
  }
}
