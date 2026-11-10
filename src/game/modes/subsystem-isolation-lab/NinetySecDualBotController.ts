import {
  ExperimentalBotAgent,
  ensureExperimentalEngine,
} from '../../../ai/experimental/ExperimentalBotAgent.ts';
import { multiCarHeuristicDecide } from '../../../ai/experimental/multiCarHeuristicPolicy.ts';
import {
  DEFAULT_CAR_CONTROLS,
  type CarControls,
} from '../../../ai/experimental/experimentalMultiCarObsPipeline.ts';
import type { ArenaBoostPadDescriptor } from '../../../physics/RocketSimSnapshotSerializer.ts';
import { stepKickoffCountdownState } from '../shared/matchClockAndPhasePipeline.ts';
import type { LabAudioPort, LabPhysicsEnginePort, LabRuntimePort } from './LabTabTypes.ts';

const INCIDENT_ACTIVE_CARS: Array<{ carIndex: number; team: number }> = [
  { carIndex: 0, team: 0 },
  { carIndex: 1, team: 1 },
];

/**
 * NinetySecDualBotController
 * Owns dual-Nexto AI agent lifecycle, tick-skip throttling, kickoff macro step counter,
 * and wall/ceiling heuristic fallback for the 90s Match Isolation Lab tab.
 */
export class NinetySecDualBotController {
  private botBlue: ExperimentalBotAgent | null = null;
  private botOrange: ExperimentalBotAgent | null = null;
  private botBlueControls: CarControls = { ...DEFAULT_CAR_CONTROLS };
  private botOrangeControls: CarControls = { ...DEFAULT_CAR_CONTROLS };
  private botBlueTickSkip = 0;
  private botOrangeTickSkip = 0;
  private botDecisionEpoch = 0;
  private incidentKickoffStep = 0;

  public incrementEpoch(): void {
    this.botDecisionEpoch++;
  }

  public async ensureLoaded(): Promise<void> {
    if (!this.botBlue) this.botBlue = new ExperimentalBotAgent('nexto', 0, 0);
    if (!this.botOrange) this.botOrange = new ExperimentalBotAgent('nexto', 1, 1);
    await ensureExperimentalEngine('nexto');
  }

  public resetEpoch(): void {
    this.botDecisionEpoch++;
    this.botBlue?.reset?.();
    this.botOrange?.reset?.();
    this.botBlueControls = { ...DEFAULT_CAR_CONTROLS };
    this.botOrangeControls = { ...DEFAULT_CAR_CONTROLS };
    this.botBlueTickSkip = 0;
    this.botOrangeTickSkip = 0;
    this.incidentKickoffStep = 0;
  }

  private stepSingleNextoCar(
    sim: LabPhysicsEnginePort,
    pads: ReadonlyArray<ArenaBoostPadDescriptor>,
    carIdx: number,
    team: number,
    isOrange: boolean
  ): void {
    const bot = isOrange ? this.botOrange : this.botBlue;
    if (!bot) return;
    const car = sim.getCarStateView(carIdx);
    const onWallOrCeiling =
      car &&
      (Math.abs(car.posX) > 3650 || Math.abs(car.posY) > 4750 || car.upZ < 0.82 || car.posZ > 700);
    const ko = !onWallOrCeiling
      ? bot.getKickoffControls(sim.state, this.incidentKickoffStep, true)
      : null;

    let ctrl = isOrange ? this.botOrangeControls : this.botBlueControls;
    let skip = isOrange ? this.botOrangeTickSkip : this.botBlueTickSkip;

    if (ko) {
      ctrl = ko;
      bot.overrideControls(ko);
    } else if (onWallOrCeiling) {
      ctrl = multiCarHeuristicDecide(sim.state, pads, carIdx, team, INCIDENT_ACTIVE_CARS);
    } else if (skip <= 0) {
      ctrl = bot.decideSync(sim.state, pads, INCIDENT_ACTIVE_CARS);
      skip = bot.tickSkip - 1;
    } else {
      skip--;
    }

    if (isOrange) {
      this.botOrangeControls = ctrl;
      this.botOrangeTickSkip = skip;
    } else {
      this.botBlueControls = ctrl;
      this.botBlueTickSkip = skip;
    }
    sim.setControls(carIdx, ctrl);
  }

  public stepDualNextoBots(sim: LabPhysicsEnginePort): void {
    if (!this.botBlue || !this.botOrange) {
      void this.ensureLoaded();
    }
    const pads = sim.getPads();
    this.stepSingleNextoCar(sim, pads, 0, 0, false);
    this.stepSingleNextoCar(sim, pads, 1, 1, true);
    this.incidentKickoffStep++;
  }
}

export function setupTwoCarIncidentArena(r: LabRuntimePort | null | undefined): void {
  if (!r?.physics) return;
  while (r.physics.numCars > 0 && typeof r.physics.removeCar === 'function') {
    r.physics.removeCar(r.physics.numCars - 1);
  }
  r.physics.addCar(0, 'octane');
  r.physics.addCar(1, 'octane');

  if (r.arena?.cars) {
    if (r.arena.cars[0]) {
      r.arena.cars[0].visible = true;
      r.arena.setCarTeam?.(0, 0);
    }
    if (r.arena.cars[1]) {
      r.arena.cars[1].visible = true;
      r.arena.setCarTeam?.(1, 1);
    }
    for (let i = 2; i < r.arena.cars.length; i++) {
      if (r.arena.cars[i]) r.arena.cars[i].visible = false;
    }
  }
}

export function initializeTwoCarIncidentPhysics(r: LabRuntimePort | null | undefined): void {
  if (!r?.physics) return;
  setupTwoCarIncidentArena(r);
  r.physics.setUnlimitedBoost(false);
  r.physics.setPossessionReportingEnabled?.(true);
  r.physics.resetPossessionStats?.();
  r.physics.resetGoalLatch?.();
  r.physics.resetKickoff(0, false);
  r.physics.clearEvents?.();
  r.simulationStage?.resetActionStates?.();
  r.arena?.resetAllCarEffects?.();
  r.audioSubsystem?.resetAudio?.();
  r.interpolator?.sync?.();
}

export function resetIncidentKickoffPhysics(r: LabRuntimePort | null | undefined): void {
  if (!r?.physics) return;
  r.physics.resetGoalLatch?.();
  r.physics.resetKickoff(0, true);
  r.interpolator?.sync?.();
}

export function stepIncidentCountdownTick(params: {
  sim: LabPhysicsEnginePort;
  neutralControls: unknown;
  countdownTicks: number;
  isOvertime: boolean;
  currentPhase: string;
  matchState?: { phase?: string; countdown?: number } | null;
  audio?: LabAudioPort | null;
  onSyncCountdown: (
    sec: number,
    phase: string,
    matchPhase: 'kickoff' | 'playing' | 'overtime'
  ) => void;
}): { nextCountdownTicks: number; nextPhase: string } {
  const {
    sim,
    neutralControls,
    countdownTicks,
    isOvertime,
    currentPhase,
    matchState,
    audio,
    onSyncCountdown,
  } = params;
  sim.setControls(0, neutralControls as never);
  sim.setControls(1, neutralControls as never);
  const stepRes = stepKickoffCountdownState(countdownTicks, isOvertime);
  let nextPhase = currentPhase;
  if (stepRes.transitionedSecond === 2 || stepRes.transitionedSecond === 1) {
    const sec = stepRes.transitionedSecond;
    nextPhase = `kickoff (${sec})`;
    if (stepRes.audioCue) audio?.play?.(stepRes.audioCue, 1.0);
    onSyncCountdown(sec, nextPhase, 'kickoff');
  } else if (stepRes.transitionedSecond === 0) {
    nextPhase = isOvertime ? 'overtime' : 'playing';
    if (matchState) {
      matchState.phase = 'playing';
      matchState.countdown = 0;
    }
    if (stepRes.audioCue) audio?.play?.(stepRes.audioCue, 1.0);
    onSyncCountdown(0, nextPhase, isOvertime ? 'overtime' : 'playing');
  }
  return { nextCountdownTicks: stepRes.nextCountdownTicks, nextPhase };
}
