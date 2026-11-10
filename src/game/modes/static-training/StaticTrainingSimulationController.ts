import { INCIDENT_EVENT_TYPES, isIncidentEvent } from '../../../physics/RocketSimConstants.ts';
import { useStaticTrainingPackStore } from '../../runtimeUiPort.ts';
import { gameAudio } from '../../../audio/GameAudioEngineFacade.ts';
import {
  detectSingleCarBallTouch,
  evaluateGoalScoredFromBallView,
  stepPostGoalBallFreeze,
} from '../shared/goalAndBallTouchPipeline.ts';
import { syncLocalMatchStateToRuntimeAndHud } from '../shared/matchClockAndPhasePipeline.ts';
import { BALL_GROUND_MIN_Z, hasPlayerDrivingInput } from './ShotGizmoMath.ts';
import { StaticTrainingArenaController } from './StaticTrainingArenaController.ts';
import {
  POST_GOAL_CELEBRATION_TICKS,
  POST_EXPIRE_CELEBRATION_TICKS,
  StaticTrainingReplayController,
  StaticTrainingReplayIncidentMeta,
  StaticTrainingReplayType,
} from './StaticTrainingReplayController.ts';

export type StaticTrainingPlayPhase = 'countdown' | 'waiting-input' | 'live' | 'goal' | 'replay';

export class StaticTrainingSimulationController {
  private readonly runtime: any;
  public playPhase: StaticTrainingPlayPhase = 'waiting-input';
  public countdownTicksRemaining = 0;
  public lastCountdownBeepSec = -1;
  public remainingTimeoutTicks = 1200;
  public lastTimeoutBeepSec = -1;
  public isOvertimeWaitingGround = false;
  public goalResetTicks = 0;
  public replayPendingType: StaticTrainingReplayType = 'goal';

  public lastTouchTick = -1;
  public goalIncidentTick = -1;
  public goalScoringTeam = 0;
  public goalScorerCarIndex = 0;
  public goalScorerName = 'Player';
  public goalBallSpeedKph: number | null = null;
  public frozenGoalBallState: Float32Array | null = null;
  public prevBallVelX = 0;
  public prevBallVelY = 0;
  public prevBallVelZ = 0;

  constructor(runtime: any) {
    this.runtime = runtime;
  }

  resetGoalTracking(): void {
    this.lastTouchTick = -1;
    this.goalIncidentTick = -1;
    this.goalScoringTeam = 0;
    this.goalScorerCarIndex = 0;
    this.goalScorerName = 'Player';
    this.goalBallSpeedKph = null;
    this.frozenGoalBallState = null;
    this.prevBallVelX = 0;
    this.prevBallVelY = 0;
    this.prevBallVelZ = 0;
  }

  setTimeoutSeconds(timeoutSec: number): void {
    this.remainingTimeoutTicks = Math.round(timeoutSec * 120);
  }

  configureShotSession(
    timeoutSec: number,
    isPlayableSession: boolean,
    downCounterEnabled: boolean,
    downCounterValue: number
  ): void {
    this.goalResetTicks = 0;
    this.replayPendingType = 'goal';
    this.isOvertimeWaitingGround = false;
    this.lastTimeoutBeepSec = -1;
    this.resetGoalTracking();
    this.remainingTimeoutTicks = Math.round(timeoutSec * 120);

    if (!isPlayableSession) {
      this.playPhase = 'waiting-input';
      this.countdownTicksRemaining = 0;
      this.lastCountdownBeepSec = -1;
      return;
    }

    if (downCounterEnabled) {
      const downSec = downCounterValue || 1;
      this.playPhase = 'countdown';
      this.countdownTicksRemaining = (downSec + 1) * 120;
      this.lastCountdownBeepSec = -1;
    } else {
      this.playPhase = 'waiting-input';
      this.countdownTicksRemaining = 0;
      this.lastCountdownBeepSec = -1;
    }
  }

  getIncidentMeta(lastKickoffStartTick: number): StaticTrainingReplayIncidentMeta {
    return {
      goalIncidentTick: this.goalIncidentTick,
      lastTouchTick: this.lastTouchTick,
      lastKickoffStartTick,
      goalScoringTeam: this.goalScoringTeam,
      goalScorerCarIndex: this.goalScorerCarIndex,
      goalScorerName: this.goalScorerName,
      goalBallSpeedKph: this.goalBallSpeedKph,
    };
  }

  onPhysicsEvent(
    event: any,
    arenaCtrl: StaticTrainingArenaController,
    replayCtrl: StaticTrainingReplayController
  ): void {
    if (!event || !isIncidentEvent(event.type) || replayCtrl.isReplayActive) return;
    const simTick = Math.floor(this.runtime?.physics?.getHeaderView?.()?.tickCount ?? 0);
    const eventTick = replayCtrl.currentRecordTick > 0 ? replayCtrl.currentRecordTick + 1 : simTick;

    if (this.playPhase === 'live') {
      replayCtrl.appendIncident(eventTick, { ...event, tick: eventTick });
    }

    if (event.type === INCIDENT_EVENT_TYPES.CAR_BALL_HIT || event.type === 0x01) {
      arenaCtrl.kickoffBallFrozen = false;
      arenaCtrl.hasBallMoved = true;
      if (this.goalIncidentTick < 0 || eventTick <= this.goalIncidentTick) {
        this.lastTouchTick = Math.floor(eventTick);
      }
    }
  }

  stepBeforePhysics(
    arenaCtrl: StaticTrainingArenaController,
    replayCtrl: StaticTrainingReplayController,
    isTestingSingleShot: boolean,
    isFreeCamTrajectoryTesting: boolean
  ): boolean {
    const r = this.runtime;
    const sim = r?.physics;
    if (!sim || replayCtrl.isReplayActive || r.isPaused) return false;

    const store = useStaticTrainingPackStore.getState();

    if (store.sessionMode === 'edit' && !isTestingSingleShot) {
      if (isFreeCamTrajectoryTesting) {
        sim.setControls?.(0, {
          throttle: 0,
          steer: 0,
          pitch: 0,
          yaw: 0,
          roll: 0,
          jump: false,
          boost: false,
          handbrake: false,
        });
        if (arenaCtrl.kickoffBallFrozen && arenaCtrl.stagedShot) {
          const bLoc = arenaCtrl.stagedShot.ball.location ||
            arenaCtrl.stagedShot.ball.pos || [0, 0, BALL_GROUND_MIN_Z];
          const cv = sim.getCarStateView?.(0);
          if (cv) {
            const dist = Math.hypot(cv.posX - bLoc[0], cv.posY - bLoc[1], cv.posZ - bLoc[2]);
            if (dist <= 182.0) {
              arenaCtrl.kickoffBallFrozen = false;
            } else {
              sim.setBallState({
                pos: [bLoc[0], bLoc[1], Math.max(BALL_GROUND_MIN_Z, bLoc[2])],
                vel: [0, 0, 0],
                angVel: [0, 0, 0],
              });
            }
          }
        }
        return true;
      }
      return false;
    }

    if (this.playPhase === 'countdown') {
      this.countdownTicksRemaining = Math.max(0, this.countdownTicksRemaining - 1);
      const downSec = store.downCounterValue || 1;
      const audio = r?.options?.gameAudio || r?.audioSubsystem?.audio || r?.audio || gameAudio;

      if (this.countdownTicksRemaining <= 0) {
        this.lastCountdownBeepSec = -1;
        arenaCtrl.launchShotNow();
        this.playPhase = 'live';
        if (r.playerControls) {
          sim.setControls?.(0, r.playerControls);
        }
        return true;
      }

      const waitTick = replayCtrl.recordNextTickFrame(sim.state);
      const remSec = Math.ceil(this.countdownTicksRemaining / 120);
      if (remSec >= 1 && remSec <= Math.min(3, downSec) && remSec !== this.lastCountdownBeepSec) {
        this.lastCountdownBeepSec = remSec;
        audio?.play?.('training_countdown', 1.0, 180);
        replayCtrl.appendAudioEvent(waitTick, {
          cueId: 'training_countdown',
          cueName: 'training_countdown',
          volume: 1.0,
        });
      }
      if (this.countdownTicksRemaining % 12 === 0) {
        store.updateLiveTelemetry({
          activeCountdownSec: Math.min(downSec, remSec),
        });
      }
      return false;
    }

    if (this.playPhase === 'waiting-input') {
      if (hasPlayerDrivingInput(r.playerControls)) {
        arenaCtrl.launchShotNow();
        this.playPhase = 'live';
        sim.setControls?.(0, r.playerControls);
        return true;
      }
      replayCtrl.recordNextTickFrame(sim.state);
      return false;
    }

    if (arenaCtrl.kickoffBallFrozen && arenaCtrl.stagedShot) {
      const bLoc = arenaCtrl.stagedShot.ball.location ||
        arenaCtrl.stagedShot.ball.pos || [0, 0, BALL_GROUND_MIN_Z];
      const cv = sim.getCarStateView?.(0);
      if (cv) {
        const dist = Math.hypot(cv.posX - bLoc[0], cv.posY - bLoc[1], cv.posZ - bLoc[2]);
        if (dist <= 182.0) {
          arenaCtrl.kickoffBallFrozen = false;
          arenaCtrl.hasBallMoved = true;
        } else {
          sim.setBallState({
            pos: [bLoc[0], bLoc[1], Math.max(BALL_GROUND_MIN_Z, bLoc[2])],
            vel: [0, 0, 0],
            angVel: [0, 0, 0],
          });
        }
      }
    }

    return true;
  }

  stepAfterPhysics(
    arenaCtrl: StaticTrainingArenaController,
    replayCtrl: StaticTrainingReplayController,
    isTestingSingleShot: boolean,
    isFreeCamTrajectoryTesting: boolean,
    onReplayComplete: () => void
  ): void {
    const r = this.runtime;
    const sim = r?.physics;
    if (!sim || replayCtrl.isReplayActive) return;

    const store = useStaticTrainingPackStore.getState();
    if (store.sessionMode === 'edit' && isFreeCamTrajectoryTesting) {
      return;
    }
    if (store.sessionMode !== 'play' && !isTestingSingleShot) return;
    if (this.playPhase !== 'live' && this.playPhase !== 'goal') return;

    const currentTick = Math.max(1, replayCtrl.currentRecordTick + 1);
    const bView = sim.getBallStateView?.();
    const cv = sim.getCarStateView?.(0);

    if (arenaCtrl.kickoffBallFrozen && arenaCtrl.stagedShot && bView && cv) {
      const bLoc = arenaCtrl.stagedShot.ball.location ||
        arenaCtrl.stagedShot.ball.pos || [0, 0, BALL_GROUND_MIN_Z];
      const dist = Math.hypot(cv.posX - bLoc[0], cv.posY - bLoc[1], cv.posZ - bLoc[2]);
      const speedMag = Math.hypot(bView.velX, bView.velY, bView.velZ);
      if (dist <= 175.0 || speedMag > 35.0) {
        arenaCtrl.kickoffBallFrozen = false;
        arenaCtrl.hasBallMoved = true;
        this.lastTouchTick = currentTick;
      } else {
        sim.setBallState({
          pos: [bLoc[0], bLoc[1], Math.max(BALL_GROUND_MIN_Z, bLoc[2])],
          vel: [0, 0, 0],
          angVel: [0, 0, 0],
        });
      }
    }

    if (this.goalResetTicks === 0 && detectSingleCarBallTouch(bView, cv, this)) {
      this.lastTouchTick = currentTick;
      arenaCtrl.kickoffBallFrozen = false;
      arenaCtrl.hasBallMoved = true;
    }

    if (!arenaCtrl.kickoffBallFrozen && bView) {
      const ballSpeedNow = Math.hypot(bView.velX, bView.velY, bView.velZ);
      if (ballSpeedNow > 8.0 || this.lastTouchTick >= 0) {
        arenaCtrl.hasBallMoved = true;
      }
    }

    if (this.replayPendingType === 'goal') {
      this.frozenGoalBallState = stepPostGoalBallFreeze({
        sim,
        goalResetTicks: this.goalResetTicks,
        currentTick,
        goalIncidentTick: this.goalIncidentTick,
        frozenBallState: this.frozenGoalBallState,
      });
    }

    replayCtrl.recordFrame(currentTick, sim.state);

    if (this.goalResetTicks > 0) {
      this.goalResetTicks--;
      if (this.goalResetTicks <= 0) {
        const started = replayCtrl.beginSession(
          this.replayPendingType || 'goal',
          this.getIncidentMeta(arenaCtrl.lastKickoffStartTick),
          onReplayComplete
        );
        if (started) {
          this.playPhase = 'replay';
        }
      }
      return;
    }

    const packMeta = store.activePack?.metadata;
    const isRlRcsPack =
      packMeta?.sourcePackType === 'RLRCSPack' ||
      Boolean(packMeta?.isBuiltInDevPack) ||
      Boolean(packMeta?.code);
    const goalEval = evaluateGoalScoredFromBallView(sim, bView, {
      requireInwardGoalVelocity: isRlRcsPack,
    });
    if (!goalEval.scored && isRlRcsPack && bView && sim.isBallScored?.(bView)) {
      sim.resetGoalLatch?.();
    }
    const audio = r?.options?.gameAudio || r?.audioSubsystem?.audio || r?.audio || gameAudio;

    if (goalEval.scored && bView) {
      const { scoringTeam, ballSpeedUu, ballSpeedKph } = goalEval;

      this.goalIncidentTick = currentTick;
      this.goalScoringTeam = scoringTeam;
      this.goalScorerCarIndex = 0;
      this.goalScorerName = 'Player';
      this.goalBallSpeedKph = ballSpeedKph;
      this.frozenGoalBallState = null;
      this.playPhase = 'goal';
      this.replayPendingType = 'goal';

      replayCtrl.appendIncident(currentTick, {
        type: INCIDENT_EVENT_TYPES.GOAL_SCORED,
        tick: currentTick,
        carIndex: 0,
        team: scoringTeam,
        posX: bView.posX,
        posY: bView.posY,
        posZ: bView.posZ,
        intensity: ballSpeedUu,
      });
      replayCtrl.appendAudioEvent(currentTick, {
        cueId: 'sfx_goal_poof',
        cueName: 'sfx_goal_poof',
        volume: 1.0,
      });

      audio?.play?.('sfx_goal_poof', 1.0);

      this.goalResetTicks = POST_GOAL_CELEBRATION_TICKS;

      store.updateLiveTelemetry({
        playPhase: 'goal',
        replayType: 'goal',
      });
      syncLocalMatchStateToRuntimeAndHud(r?.match?.state, {
        matchPhase: 'goal',
        replayScorerName: this.goalScorerName,
        replayScorerTeam: scoringTeam,
        replayBallSpeedKph: ballSpeedKph,
        replayAssistName: null,
      });
      return;
    }

    if (this.remainingTimeoutTicks > 0) {
      this.remainingTimeoutTicks--;
      if (this.remainingTimeoutTicks > 0) {
        const remSecCeil = Math.ceil(this.remainingTimeoutTicks / 120);
        if (remSecCeil >= 1 && remSecCeil <= 3 && remSecCeil !== this.lastTimeoutBeepSec) {
          this.lastTimeoutBeepSec = remSecCeil;
          audio?.play?.('training_countdown', 1.0, 180);
          replayCtrl.appendAudioEvent(currentTick, {
            cueId: 'training_countdown',
            cueName: 'training_countdown',
            volume: 1.0,
          });
        }
      }
      const nextSec = Number((this.remainingTimeoutTicks / 120).toFixed(1));
      if (nextSec !== store.remainingTimeoutSec) {
        store.updateLiveTelemetry({
          remainingTimeoutSec: nextSec,
        });
      }
    }

    if (this.remainingTimeoutTicks <= 0 && bView) {
      const ballSpeed = Math.hypot(bView.velX, bView.velY, bView.velZ);
      const isBallTouchingGround = Boolean(sim.ballOnGround);
      const isBallUntouched = Boolean(
        arenaCtrl.kickoffBallFrozen || (!arenaCtrl.hasBallMoved && this.lastTouchTick < 0)
      );

      if (isBallUntouched || isBallTouchingGround) {
        this.isOvertimeWaitingGround = false;
        this.goalIncidentTick = currentTick;
        this.goalScoringTeam = bView.posY >= 0 ? 0 : 1;
        this.goalScorerCarIndex = 0;
        this.goalScorerName = 'SHOT EXPIRED';
        this.goalBallSpeedKph = Math.round(ballSpeed * 0.036);
        this.frozenGoalBallState = null;
        this.playPhase = 'goal';
        this.replayPendingType = 'expire';

        arenaCtrl.setBallExpired(true);

        replayCtrl.appendAudioEvent(currentTick, {
          cueId: 'training_ball_expire',
          cueName: 'training_ball_expire',
          volume: 1.0,
        });
        audio?.play?.('training_ball_expire', 1.0, 250);

        this.goalResetTicks = POST_EXPIRE_CELEBRATION_TICKS;

        store.updateLiveTelemetry({
          playPhase: 'goal',
          replayType: 'expire',
        });
        syncLocalMatchStateToRuntimeAndHud(r?.match?.state, {
          matchPhase: 'goal',
          replayScorerName: this.goalScorerName,
          replayScorerTeam: this.goalScoringTeam === 1 ? 1 : 0,
          replayBallSpeedKph: this.goalBallSpeedKph,
          replayAssistName: null,
        });
      } else if (!this.isOvertimeWaitingGround) {
        this.isOvertimeWaitingGround = true;
        store.updateLiveTelemetry({
          remainingTimeoutSec: 0,
          isOvertimeWaitGround: true,
        });
      }
    }
  }
}
