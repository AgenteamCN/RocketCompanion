import { DEFAULT_CAR_CONTROLS } from '../../../ai/experimental/experimentalMultiCarObsPipeline.ts';
import { INCIDENT_EVENT_TYPES, isIncidentEvent } from '../../../physics/RocketSimConstants.ts';
import type {
  ReplayAcknowledgedControlEntry,
  ReplayRecordedIncident,
} from '../../../replay/ReplayRingBuffer.ts';
import {
  evaluateGoalScoredFromBallView,
  findClosestTouchingCarIndex,
} from '../shared/goalAndBallTouchPipeline.ts';
import { stepMultiCarBotRoster } from '../shared/multiCarBotStepPipeline.ts';
import type { ExpModeRuntimePort } from './ExperimentalMultiBotsMatchMath.ts';
import { ExperimentalMultiBotsRosterController } from './ExperimentalMultiBotsRosterController.ts';
import { ExperimentalMultiBotsReplayController } from './ExperimentalMultiBotsReplayController.ts';
import { ExperimentalMultiBotsMatchLifecycleController } from './ExperimentalMultiBotsMatchLifecycleController.ts';

export class ExperimentalMultiBotsSimulationController {
  private readonly runtime: ExpModeRuntimePort | null;

  constructor(runtime: ExpModeRuntimePort | null) {
    this.runtime = runtime;
  }

  onPhysicsEvent(
    event: ReplayRecordedIncident | null | undefined,
    rosterCtrl: ExperimentalMultiBotsRosterController,
    replayCtrl: ExperimentalMultiBotsReplayController,
    lifecycleCtrl: ExperimentalMultiBotsMatchLifecycleController
  ): void {
    if (
      !event ||
      typeof event.type !== 'number' ||
      !isIncidentEvent(event.type) ||
      replayCtrl.isReplayActive ||
      lifecycleCtrl.isMatchEnded
    ) {
      return;
    }
    const currentTick = Math.floor(this.runtime?.physics?.getHeaderView?.()?.tickCount ?? 0);
    const eventTick = typeof event.tick === 'number' && event.tick > 0 ? event.tick : currentTick;

    if (lifecycleCtrl.countdownTicks <= 0) {
      replayCtrl.appendIncident(eventTick, event);
    }

    if (event.type === INCIDENT_EVENT_TYPES.CAR_BALL_HIT || event.type === 0x01) {
      const carIndex = event.carIndex ?? event.primaryId ?? -1;
      if (carIndex >= 0 && carIndex < rosterCtrl.spawnedCars.length) {
        lifecycleCtrl.recordCarBallTouch(
          carIndex,
          eventTick,
          rosterCtrl.spawnedCars,
          replayCtrl.isReplayActive
        );
      }
    }
  }

  stepBeforePhysics(
    rosterCtrl: ExperimentalMultiBotsRosterController,
    replayCtrl: ExperimentalMultiBotsReplayController,
    lifecycleCtrl: ExperimentalMultiBotsMatchLifecycleController
  ): boolean {
    const r = this.runtime;
    const sim = r?.physics;
    if (!sim || rosterCtrl.spawnedCars.length === 0) return true;
    if (replayCtrl.isReplayActive) return false;
    if (lifecycleCtrl.isMatchEnded) {
      lifecycleCtrl.stepEndedMatchPodiumDelay(replayCtrl, () => {
        for (const entry of rosterCtrl.spawnedCars) {
          sim.setControls(entry.carIndex, r.neutralControls);
          rosterCtrl.carControlsMap.set(entry.carIndex, r.neutralControls);
        }
      });
      return false;
    }

    if (lifecycleCtrl.countdownTicks > 0) {
      for (const entry of rosterCtrl.spawnedCars) {
        sim.setControls(entry.carIndex, r.neutralControls);
        rosterCtrl.carControlsMap.set(entry.carIndex, r.neutralControls);
      }
      const currentTick = Math.floor(sim.getHeaderView?.()?.tickCount ?? 0);
      lifecycleCtrl.stepCountdownPhase(currentTick, replayCtrl);
      return true;
    }

    const totalInferenceMs = stepMultiCarBotRoster({
      sim,
      entries: rosterCtrl.spawnedCars,
      activeCarsList: rosterCtrl.activeCarsList,
      carControlsMap: rosterCtrl.carControlsMap,
      playerControls: r.playerControls || r.neutralControls,
      neutralControls: r.neutralControls,
      kickoffTick: lifecycleCtrl.kickoffTick,
    });

    const camCarIdx = r.playerCarIndex;
    const camEntry = rosterCtrl.spawnedCars[camCarIdx];
    if (camEntry && !camEntry.isPlayer) {
      const botCtrl = rosterCtrl.carControlsMap.get(camCarIdx) || r.neutralControls;
      r.playerControls = botCtrl;
      r.playerThrottle = botCtrl.throttle ?? 0;
    }

    lifecycleCtrl.recordBotStepInference(totalInferenceMs);
    return true;
  }

  stepAfterPhysics(
    rosterCtrl: ExperimentalMultiBotsRosterController,
    replayCtrl: ExperimentalMultiBotsReplayController,
    lifecycleCtrl: ExperimentalMultiBotsMatchLifecycleController
  ): void {
    const r = this.runtime;
    const sim = r?.physics;
    if (
      !sim ||
      rosterCtrl.spawnedCars.length === 0 ||
      replayCtrl.isReplayActive ||
      lifecycleCtrl.isMatchEnded
    ) {
      return;
    }

    const currentTick = Math.floor(sim.getHeaderView?.()?.tickCount ?? 0);
    const acknowledgedControls: ReplayAcknowledgedControlEntry[] = [];
    for (let i = 0; i < rosterCtrl.spawnedCars.length; i++) {
      const cIdx = rosterCtrl.spawnedCars[i].carIndex;
      const ctrl = rosterCtrl.carControlsMap.get(cIdx) || r.neutralControls || DEFAULT_CAR_CONTROLS;
      acknowledgedControls.push({ carIndex: cIdx, controls: { ...ctrl } });
    }

    if (lifecycleCtrl.countdownTicks > 0) {
      replayCtrl.flushPendingSignalsAndRecordFrame(currentTick, sim.state, acknowledgedControls);
      return;
    }

    const bView = sim.getBallStateView();

    if (lifecycleCtrl.goalResetTicks === 0 && bView) {
      const touchingCarIdx = findClosestTouchingCarIndex({
        sim,
        bView,
        entries: rosterCtrl.spawnedCars,
        tracker: lifecycleCtrl.goalTracker,
      });
      if (touchingCarIdx >= 0) {
        lifecycleCtrl.recordCarBallTouch(
          touchingCarIdx,
          currentTick,
          rosterCtrl.spawnedCars,
          replayCtrl.isReplayActive
        );
      }
    }

    lifecycleCtrl.stepPostGoalFreeze(sim, currentTick);

    replayCtrl.flushPendingSignalsAndRecordFrame(currentTick, sim.state, acknowledgedControls);

    const goalEval = evaluateGoalScoredFromBallView(sim, bView);
    lifecycleCtrl.stepPostFrameLifecycle(
      currentTick,
      bView,
      Boolean(sim.ballOnGround),
      goalEval,
      rosterCtrl,
      replayCtrl
    );
  }
}
