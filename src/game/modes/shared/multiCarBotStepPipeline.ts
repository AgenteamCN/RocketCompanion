import { DEFAULT_CAR_CONTROLS } from '../../../ai/experimental/experimentalMultiCarObsPipeline.ts';
import type { BallStateViewLike, CarStateViewLike } from './goalAndBallTouchPipeline.ts';

export type CarControls = Record<string, any>;

export interface ExperimentalBotAgentLike {
  tickSkipCounter: number;
  tickSkip: number;
  lastInferenceMs: number;
  action: CarControls;
  _staggered?: boolean;
  getKickoffControls(
    state: unknown,
    kickoffTick: number,
    isPrimaryKickoffCar: boolean
  ): CarControls | null | undefined;
  overrideControls(controls: CarControls): void;
  decideSync(state: unknown, pads: unknown, activeCarsList: unknown, sim?: unknown): CarControls;
}

export interface MultiCarBotRosterEntry {
  carIndex: number;
  team: 0 | 1;
  isPlayer: boolean;
  agent: ExperimentalBotAgentLike | null;
}

export function findClosestNonDemoedCarPerTeam<T extends { carIndex: number; team: 0 | 1 }>(
  sim: { getCarStateView?: (carIndex: number) => CarStateViewLike | null },
  bView: BallStateViewLike,
  entries: readonly T[]
): Record<0 | 1, number> {
  const closestCarPerTeam: Record<0 | 1, number> = { 0: -1, 1: -1 };
  const closestDistPerTeam: Record<0 | 1, number> = { 0: Infinity, 1: Infinity };

  for (const entry of entries) {
    const cv = sim.getCarStateView?.(entry.carIndex);
    if (!cv || cv.isDemoed) continue;
    const d = Math.hypot(cv.posX - bView.posX, cv.posY - bView.posY);
    if (d < closestDistPerTeam[entry.team]) {
      closestDistPerTeam[entry.team] = d;
      closestCarPerTeam[entry.team] = entry.carIndex;
    }
  }

  return closestCarPerTeam;
}

export function stepExperimentalBotAgentTick(params: {
  bot: ExperimentalBotAgentLike;
  carIndex: number;
  simState: unknown;
  pads: unknown;
  activeCarsList: unknown;
  sim?: unknown;
  kickoffTick: number;
  isPrimaryKickoffCar: boolean;
  staggeredFlagHolder?: { staggered: boolean };
}): { controls: CarControls; inferenceMs: number } {
  const {
    bot,
    carIndex,
    simState,
    pads,
    activeCarsList,
    sim,
    kickoffTick,
    isPrimaryKickoffCar,
    staggeredFlagHolder,
  } = params;

  const ko = bot.getKickoffControls(simState, kickoffTick, isPrimaryKickoffCar);
  if (ko) {
    bot.overrideControls(ko);
    if (staggeredFlagHolder) {
      staggeredFlagHolder.staggered = false;
    } else {
      bot._staggered = false;
    }
    return { controls: ko, inferenceMs: 0 };
  }

  const isStaggered = staggeredFlagHolder ? staggeredFlagHolder.staggered : Boolean(bot._staggered);
  if (bot.tickSkipCounter <= 0) {
    const controls = bot.decideSync(simState, pads, activeCarsList, sim);
    bot.tickSkipCounter = isStaggered ? bot.tickSkip - 1 : (carIndex % bot.tickSkip) + 1;
    if (staggeredFlagHolder) {
      staggeredFlagHolder.staggered = true;
    } else {
      bot._staggered = true;
    }
    return { controls, inferenceMs: bot.lastInferenceMs || 0 };
  }

  bot.tickSkipCounter--;
  return { controls: bot.action || DEFAULT_CAR_CONTROLS, inferenceMs: 0 };
}

export function stepMultiCarBotRoster(params: {
  sim: {
    state: unknown;
    getBallStateView: () => BallStateViewLike;
    getCarStateView: (carIndex: number) => CarStateViewLike | null;
    getPads: () => unknown;
    setControls: (carIndex: number, controls: CarControls) => void;
  };
  entries: readonly MultiCarBotRosterEntry[];
  activeCarsList: unknown;
  carControlsMap: Map<number, CarControls>;
  playerControls: CarControls;
  neutralControls: CarControls;
  kickoffTick: number;
}): number {
  const {
    sim,
    entries,
    activeCarsList,
    carControlsMap,
    playerControls,
    neutralControls,
    kickoffTick,
  } = params;

  const bView = sim.getBallStateView();
  const closestCarPerTeam = findClosestNonDemoedCarPerTeam(sim, bView, entries);
  const pads = sim.getPads();
  let totalInferenceMs = 0;

  for (const entry of entries) {
    const cIdx = entry.carIndex;
    if (entry.isPlayer) {
      const ctrl = playerControls || neutralControls;
      carControlsMap.set(cIdx, ctrl);
      sim.setControls(cIdx, ctrl);
      continue;
    }

    const bot = entry.agent;
    if (!bot) {
      sim.setControls(cIdx, neutralControls);
      continue;
    }

    const isPrimaryKickoffCar = closestCarPerTeam[entry.team] === cIdx;
    const { controls, inferenceMs } = stepExperimentalBotAgentTick({
      bot,
      carIndex: cIdx,
      simState: sim.state,
      pads,
      activeCarsList,
      sim,
      kickoffTick,
      isPrimaryKickoffCar,
    });
    totalInferenceMs += inferenceMs;
    carControlsMap.set(cIdx, controls);
    sim.setControls(cIdx, controls);
  }

  return totalInferenceMs;
}
